import crypto from "node:crypto";
import app from "./app";
import { db, unlocksTable } from "@workspace/db";
import { logger } from "./lib/logger";

// Seed manual unlocks on startup — remove after first production deploy
async function seedManualUnlocks() {
  const emails = [
    "marc.di_martino@hotmail.com",
    "alex13.dimartino@gmail.com",
    "ilaria.calamari@outlook.com",
  ];
  for (const payerEmail of emails) {
    await db.insert(unlocksTable).values({
      id: crypto.randomUUID(),
      payerEmail,
      unlockKey: crypto.randomBytes(24).toString("hex"),
      paypalTxnId: "MANUAL",
      sandbox: false,
    }).onConflictDoNothing();
  }
  logger.info({ count: emails.length }, "Manual unlock seed complete");
}

const rawPort = process.env["PORT"];

if (!rawPort) {
  throw new Error(
    "PORT environment variable is required but was not provided.",
  );
}

const port = Number(rawPort);

if (Number.isNaN(port) || port <= 0) {
  throw new Error(`Invalid PORT value: "${rawPort}"`);
}

app.listen(port, (err) => {
  if (err) {
    logger.error({ err }, "Error listening on port");
    process.exit(1);
  }

  logger.info({ port }, "Server listening");
  seedManualUnlocks().catch((e) => logger.error({ err: e }, "Seed failed"));
});
