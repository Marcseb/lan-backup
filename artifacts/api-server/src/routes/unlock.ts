import { Router, type IRouter, type Request, type Response } from "express";
import { db } from "@workspace/db";
import { unlocksTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import crypto from "node:crypto";
import { z } from "zod/v4";

const router: IRouter = Router();

// PayPal IPN verification URL
const PAYPAL_VERIFY_URL_LIVE = "https://ipnpb.paypal.com/cgi-bin/webscr";
const PAYPAL_VERIFY_URL_SANDBOX = "https://ipnpb.sandbox.paypal.com/cgi-bin/webscr";

// Your PayPal Merchant ID (the receiver_id field in IPN notifications)
const PAYPAL_MERCHANT_ID = process.env.PAYPAL_MERCHANT_ID ?? "7AUYVWJE39NMQ";
// Optionally also validate receiver email if set
const PAYPAL_BUSINESS_EMAIL = process.env.PAYPAL_BUSINESS_EMAIL ?? "";
// Minimum payment amount in EUR
const MIN_AMOUNT = parseFloat(process.env.UNLOCK_MIN_AMOUNT ?? "4.50");
const CURRENCY = process.env.UNLOCK_CURRENCY ?? "EUR";

async function verifyIpn(rawBody: string, sandbox: boolean): Promise<boolean> {
  const verifyUrl = sandbox ? PAYPAL_VERIFY_URL_SANDBOX : PAYPAL_VERIFY_URL_LIVE;
  try {
    const res = await fetch(verifyUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        "User-Agent": "LAN-Backup-IPN/1.0",
      },
      body: "cmd=_notify-validate&" + rawBody,
    });
    const text = await res.text();
    return text === "VERIFIED";
  } catch {
    return false;
  }
}

// POST /api/unlock/ipn  — PayPal IPN webhook
router.post("/unlock/ipn", async (req: Request, res: Response) => {
  // PayPal sends form-encoded body; express.urlencoded() parses it
  const rawBody = Object.entries(req.body as Record<string, string>)
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
    .join("&");

  // Always respond 200 immediately as required by PayPal IPN spec
  res.sendStatus(200);

  const params = req.body as Record<string, string>;
  const isSandbox = params.test_ipn === "1";

  // Verify with PayPal
  const verified = await verifyIpn(rawBody, isSandbox);
  if (!verified) {
    req.log.warn({ params }, "IPN not verified by PayPal");
    return;
  }

  // Only handle completed payments
  if (params.payment_status !== "Completed") {
    req.log.info({ status: params.payment_status }, "IPN: payment not completed, ignoring");
    return;
  }

  // Validate receiver — check merchant ID (receiver_id) and optionally email
  const receiverId = params.receiver_id ?? "";
  const receiverEmail = params.receiver_email ?? "";
  const businessField = params.business ?? "";
  const idMatch = receiverId === PAYPAL_MERCHANT_ID;
  const emailMatch = PAYPAL_BUSINESS_EMAIL
    ? receiverEmail === PAYPAL_BUSINESS_EMAIL || businessField === PAYPAL_BUSINESS_EMAIL
    : true;
  if (!idMatch && !emailMatch) {
    req.log.warn({ receiverId, receiverEmail }, "IPN: receiver mismatch");
    return;
  }

  // Validate currency
  if (params.mc_currency !== CURRENCY) {
    req.log.warn({ currency: params.mc_currency }, "IPN: wrong currency");
    return;
  }

  // Validate amount
  const amount = parseFloat(params.mc_gross ?? "0");
  if (amount < MIN_AMOUNT) {
    req.log.warn({ amount }, "IPN: amount too low");
    return;
  }

  const payerEmail = (params.payer_email ?? "").toLowerCase().trim();
  if (!payerEmail) {
    req.log.warn("IPN: no payer email");
    return;
  }

  const txnId = params.txn_id ?? "";

  // Idempotent: skip if txn already recorded
  if (txnId) {
    const existing = await db
      .select()
      .from(unlocksTable)
      .where(eq(unlocksTable.paypalTxnId, txnId))
      .limit(1);
    if (existing.length > 0) {
      req.log.info({ txnId }, "IPN: duplicate txn, skipping");
      return;
    }
  }

  // Check if this email already has an unlock
  const byEmail = await db
    .select()
    .from(unlocksTable)
    .where(eq(unlocksTable.payerEmail, payerEmail))
    .limit(1);

  let unlockKey: string;
  if (byEmail.length > 0) {
    unlockKey = byEmail[0].unlockKey;
  } else {
    unlockKey = crypto.randomBytes(24).toString("hex");
  }

  await db.insert(unlocksTable).values({
    id: crypto.randomUUID(),
    payerEmail,
    unlockKey,
    paypalTxnId: txnId || null,
    sandbox: isSandbox,
  }).onConflictDoNothing();

  req.log.info({ payerEmail, isSandbox, amount }, "IPN: unlock recorded");
});

const CheckQuerySchema = z.object({ email: z.string().email() });

// GET /api/unlock/check?email=x  — app polls to get unlock key after payment
router.get("/unlock/check", async (req: Request, res: Response) => {
  const parsed = CheckQuerySchema.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid email" });
    return;
  }

  const email = parsed.data.email.toLowerCase().trim();
  req.log.info({ email, query: req.query }, "unlock/check: querying");
  const rows = await db
    .select()
    .from(unlocksTable)
    .where(eq(unlocksTable.payerEmail, email))
    .limit(1);

  if (rows.length === 0) {
    res.status(404).json({ unlocked: false });
    return;
  }

  res.json({ unlocked: true, unlockKey: rows[0].unlockKey });
});

export default router;
