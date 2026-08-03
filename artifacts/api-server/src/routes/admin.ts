import { Router, type IRouter, type Request, type Response } from "express";
import crypto from "node:crypto";
import { db } from "@workspace/db";
import { activationCodesTable } from "@workspace/db";

const router: IRouter = Router();

const SESSION_SECRET = process.env.SESSION_SECRET ?? "";

/** HMAC-normalise both strings before comparing to avoid length-leak. */
function checkSecret(provided: string): boolean {
  if (!SESSION_SECRET || !provided) return false;
  const hmac = (s: string) =>
    crypto.createHmac("sha256", "lb-admin").update(s).digest();
  return crypto.timingSafeEqual(hmac(provided), hmac(SESSION_SECRET));
}

// GET /api/admin  — serve the admin UI
router.get("/admin", (_req: Request, res: Response) => {
  res.setHeader("Content-Type", "text/html; charset=utf-8");
  res.send(ADMIN_HTML);
});

// POST /api/admin/generate  — generate a new single-use activation code
router.post("/admin/generate", async (req: Request, res: Response) => {
  const { secret } = req.body as { secret?: string };

  if (!SESSION_SECRET) {
    res.status(500).json({ error: "SESSION_SECRET is not configured on the server." });
    return;
  }
  if (!checkSecret(secret ?? "")) {
    res.status(401).json({ error: "Wrong secret — check your SESSION_SECRET in Replit." });
    return;
  }

  const code = "LB-" + crypto.randomBytes(4).toString("hex").toUpperCase();
  await db.insert(activationCodesTable).values({ code });

  res.json({ code });
});

// ── Admin HTML ────────────────────────────────────────────────────────────────
const ADMIN_HTML = /* html */ `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1" />
  <title>LAN Backup — Admin</title>
  <style>
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Helvetica, sans-serif;
      background: #f1f5f9;
      min-height: 100dvh;
      display: flex;
      flex-direction: column;
      align-items: center;
      padding: 32px 16px 48px;
    }
    header {
      display: flex;
      align-items: center;
      gap: 10px;
      margin-bottom: 28px;
    }
    .logo {
      width: 36px; height: 36px;
      background: #2563eb;
      border-radius: 10px;
      display: flex; align-items: center; justify-content: center;
    }
    .logo svg { width: 20px; height: 20px; color: #fff; }
    h1 { font-size: 20px; font-weight: 700; color: #0f172a; letter-spacing: -0.3px; }
    .card {
      background: #fff;
      border: 1px solid #e2e8f0;
      border-radius: 18px;
      padding: 24px;
      width: 100%;
      max-width: 420px;
      box-shadow: 0 2px 8px rgba(0,0,0,0.06);
    }
    .card-title {
      font-size: 15px; font-weight: 700; color: #0f172a;
      margin-bottom: 18px;
    }
    label {
      display: block;
      font-size: 12px; font-weight: 600;
      color: #64748b; letter-spacing: 0.4px; text-transform: uppercase;
      margin-bottom: 6px;
    }
    input[type="password"] {
      width: 100%;
      padding: 12px 14px;
      border: 1.5px solid #e2e8f0;
      border-radius: 10px;
      font-size: 15px;
      color: #0f172a;
      background: #f8fafc;
      outline: none;
      transition: border-color 0.15s, background 0.15s;
      -webkit-text-security: disc;
    }
    input[type="password"]:focus { border-color: #2563eb; background: #fff; }
    .hint {
      margin-top: 5px;
      font-size: 12px; color: #94a3b8;
    }
    button#genBtn {
      margin-top: 18px;
      width: 100%;
      padding: 14px;
      background: #2563eb;
      color: #fff;
      font-size: 15px; font-weight: 600;
      border: none;
      border-radius: 10px;
      cursor: pointer;
      transition: background 0.15s, opacity 0.15s;
      display: flex; align-items: center; justify-content: center; gap: 8px;
    }
    button#genBtn:hover:not(:disabled) { background: #1d4ed8; }
    button#genBtn:disabled { opacity: 0.55; cursor: not-allowed; }
    .error {
      margin-top: 14px;
      padding: 11px 14px;
      background: #fef2f2;
      border: 1px solid #fecaca;
      border-radius: 10px;
      color: #dc2626;
      font-size: 13px;
      display: none;
    }
    .divider {
      margin: 20px 0;
      border: none;
      border-top: 1px solid #f1f5f9;
    }
    .code-wrap { display: none; flex-direction: column; align-items: center; gap: 10px; }
    .code-wrap.visible { display: flex; }
    .code-label { font-size: 12px; font-weight: 600; color: #64748b; letter-spacing: 0.4px; text-transform: uppercase; }
    .code-value {
      font-family: "SF Mono", "Fira Code", "Menlo", monospace;
      font-size: 30px; font-weight: 800;
      letter-spacing: 3px;
      color: #0f172a;
      background: #f8fafc;
      border: 2px dashed #cbd5e1;
      border-radius: 14px;
      padding: 18px 28px;
      cursor: pointer;
      user-select: all;
      width: 100%;
      text-align: center;
      transition: background 0.12s, border-color 0.12s;
      -webkit-tap-highlight-color: transparent;
    }
    .code-value:hover { background: #f1f5f9; border-color: #94a3b8; }
    .code-value:active { background: #e2e8f0; }
    .copy-hint { font-size: 12px; color: #94a3b8; }
    .copy-hint.copied { color: #16a34a; font-weight: 600; }
    .new-btn {
      margin-top: 4px;
      background: none; border: none;
      color: #2563eb; font-size: 13px; font-weight: 600;
      cursor: pointer; padding: 4px 0;
      text-decoration: underline; text-underline-offset: 3px;
    }
    .spinner {
      width: 18px; height: 18px;
      border: 2.5px solid rgba(255,255,255,0.35);
      border-top-color: #fff;
      border-radius: 50%;
      animation: spin 0.7s linear infinite;
      display: none;
    }
    @keyframes spin { to { transform: rotate(360deg); } }
  </style>
</head>
<body>
  <header>
    <div class="logo">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
        <polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/>
      </svg>
    </div>
    <h1>LAN Backup</h1>
  </header>

  <div class="card">
    <p class="card-title">Generate activation code</p>

    <label for="secret">Session Secret</label>
    <input type="password" id="secret"
      placeholder="Paste SESSION_SECRET from Replit Secrets"
      autocomplete="off" autocorrect="off" spellcheck="false" />
    <p class="hint">Found in your Replit project under Secrets → SESSION_SECRET</p>

    <button id="genBtn" onclick="generate()">
      <span class="spinner" id="spinner"></span>
      <span id="btnLabel">Generate activation code</span>
    </button>

    <div class="error" id="error"></div>

    <div class="code-wrap" id="codeWrap">
      <hr class="divider" style="width:100%" />
      <span class="code-label">Activation code — tap to copy</span>
      <div class="code-value" id="codeValue" onclick="copyCode()">—</div>
      <span class="copy-hint" id="copyHint">Tap the code to copy it to clipboard</span>
      <button class="new-btn" onclick="generateAnother()">Generate another code</button>
    </div>
  </div>

  <script>
    async function generate() {
      const secret = document.getElementById('secret').value.trim();
      const btn    = document.getElementById('genBtn');
      const errEl  = document.getElementById('error');
      const spinner= document.getElementById('spinner');
      const label  = document.getElementById('btnLabel');

      errEl.style.display = 'none';
      btn.disabled = true;
      spinner.style.display = 'block';
      label.textContent = 'Generating…';

      try {
        const res  = await fetch('/api/admin/generate', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ secret }),
        });
        const data = await res.json();
        if (!res.ok) {
          errEl.textContent = data.error ?? 'Something went wrong — try again.';
          errEl.style.display = 'block';
          return;
        }
        document.getElementById('codeValue').textContent = data.code;
        document.getElementById('copyHint').textContent  = 'Tap the code to copy it to clipboard';
        document.getElementById('copyHint').classList.remove('copied');
        document.getElementById('codeWrap').classList.add('visible');
      } catch {
        errEl.textContent = 'Network error — check your connection and try again.';
        errEl.style.display = 'block';
      } finally {
        btn.disabled = false;
        spinner.style.display = 'none';
        label.textContent = 'Generate activation code';
      }
    }

    function generateAnother() {
      document.getElementById('codeWrap').classList.remove('visible');
      document.getElementById('codeValue').textContent = '—';
      generate();
    }

    function copyCode() {
      const code = document.getElementById('codeValue').textContent;
      const hint = document.getElementById('copyHint');
      if (navigator.clipboard) {
        navigator.clipboard.writeText(code).then(() => {
          hint.textContent = '✓ Copied to clipboard!';
          hint.classList.add('copied');
          setTimeout(() => {
            hint.textContent = 'Tap the code to copy it to clipboard';
            hint.classList.remove('copied');
          }, 2500);
        }).catch(() => selectFallback());
      } else {
        selectFallback();
      }
    }

    function selectFallback() {
      const el = document.getElementById('codeValue');
      const range = document.createRange();
      range.selectNodeContents(el);
      const sel = window.getSelection();
      sel && sel.removeAllRanges();
      sel && sel.addRange(range);
      document.getElementById('copyHint').textContent = 'Selected — copy with ⌘C / long-press Copy';
    }

    document.getElementById('secret').addEventListener('keydown', e => {
      if (e.key === 'Enter') generate();
    });
  </script>
</body>
</html>`;

export default router;
