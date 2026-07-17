#!/usr/bin/env node
/**
 * LAN Backup Companion Server
 *
 * First run — just execute:
 *   node server.js          (Linux / macOS)
 *   node server.js          (Windows — in a terminal)
 *   bash install.sh         (Linux / macOS — installs Node.js if needed)
 *   install.ps1             (Windows  — installs Node.js if needed)
 *
 * A secure token is generated automatically on the first run, saved to .env,
 * and printed to the console. Copy it into the app (Settings → Auth Token).
 *
 * Subsequent runs: the token is loaded from .env automatically.
 * Manual override: set LB_TOKEN in the environment before starting.
 *
 * Security features:
 *  - Bearer token auth on all sensitive endpoints
 *  - Rate limiting (max 600 req/min per IP)
 *  - SHA-256 checksum of received files for integrity verification
 *  - TOFU server ID (random persistent UUID)
 *  - Files saved only inside the configured backup directory
 *  - Path traversal protection (every path segment validated; no ../ escapes)
 *  - Folder structure preserved via relativePath field (sub-folders recreated on disk)
 */

const http = require("http");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const os = require("os");
const { execSync } = require("child_process");

// ── .env loader ───────────────────────────────────────────────────────────────
// Reads key=value pairs from .env (same folder as server.js) into process.env.
// Variables already set in the environment take priority over .env values.
const ENV_FILE = path.join(__dirname, ".env");

function loadEnvFile() {
  if (!fs.existsSync(ENV_FILE)) return;
  for (const line of fs.readFileSync(ENV_FILE, "utf8").split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq < 0) continue;
    const key = trimmed.slice(0, eq).trim();
    const val = trimmed.slice(eq + 1).trim();
    if (key && !(key in process.env)) process.env[key] = val;
  }
}

// ── First-run setup ───────────────────────────────────────────────────────────

// Read one line from stdin synchronously — works on all platforms without
// pulling in any third-party dependency.
function promptSync(question) {
  process.stdout.write(question);
  const buf = Buffer.alloc(1);
  let result = "";
  try {
    while (true) {
      const n = fs.readSync(0, buf, 0, 1, null);
      if (n === 0) break; // EOF
      const ch = buf.toString("utf8");
      if (ch === "\n") break;
      if (ch !== "\r") result += ch;
    }
  } catch {
    /* stdin not a tty (e.g. piped) — return whatever was collected */
  }
  return result.trim();
}

// Called only when no token exists anywhere (.env absent and LB_TOKEN not set).
// Asks the user whether to generate a random token or enter their own, writes
// .env, then prints the token. The token is NEVER printed again on later runs.
function firstRunSetup() {
  const W = 62;
  const row = (s) => "║ " + s.padEnd(W - 2) + " ║";
  const hr = () => "╠" + "═".repeat(W) + "╣";

  console.log("\n" + "╔" + "═".repeat(W) + "╗");
  console.log(row("  LAN Backup — First-time Setup"));
  console.log(hr());
  console.log(row(""));
  console.log(row("  Choose an auth token for this server."));
  console.log(row("  You will copy it into the app once, then it is saved."));
  console.log(row(""));
  console.log("╚" + "═".repeat(W) + "╝\n");

  console.log("  [1]  Generate a secure random token  (recommended)");
  console.log("  [2]  Enter my own token\n");

  let token = "";
  const choice = promptSync("  Your choice (1 or 2, default 1): ");

  if (choice === "2") {
    while (!token) {
      token = promptSync("\n  Enter your token: ");
      if (!token) console.log("  Token cannot be empty — please try again.");
    }
  } else {
    token = crypto.randomBytes(16).toString("hex"); // 32 chars, 128-bit entropy
    console.log("  Generating random token...");
  }

  // If the setup script passed LB_BACKUP_DIR via env, persist it in .env so
  // future runs (e.g. "node server.js" directly) also use the right folder.
  const defaultDir = path.join(os.homedir(), "LAN-Backup");
  const backupDirLine = process.env.LB_BACKUP_DIR
    ? `LB_BACKUP_DIR=${process.env.LB_BACKUP_DIR}`
    : `# LB_BACKUP_DIR=${defaultDir}`;

  fs.writeFileSync(
    ENV_FILE,
    [
      "# LAN Backup companion server — configuration",
      `# Auto-generated: ${new Date().toISOString().slice(0, 10)}`,
      "#",
      "# IMPORTANT: copy LB_TOKEN into the LAN Backup app",
      "#            Open the app → Settings tab → Auth Token field",
      "#",
      `LB_TOKEN=${token}`,
      "",
      "# Optional — remove the # to change a default:",
      "# LB_PORT=7823",
      backupDirLine,
    ].join("\n") + "\n",
    "utf8"
  );
  process.env.LB_TOKEN = token;

  console.log("\n" + "╔" + "═".repeat(W) + "╗");
  console.log(row("  Token saved!  Copy it into the app now."));
  console.log(hr());
  console.log(row(""));
  console.log(row("  App  →  Settings tab  →  Auth Token field"));
  console.log(row(""));
  console.log(row(`  Token:  ${token}`));
  console.log(row(""));
  console.log(row("  ⚠  This is shown only once.  To view it later, open:"));
  console.log(row(`     ${ENV_FILE}`));
  console.log(row("     and look for the LB_TOKEN line."));
  console.log(row(""));
  console.log("╚" + "═".repeat(W) + "╝\n");
}

loadEnvFile();

// Always write .env if it does not exist yet — so shortcut launches (which
// start a fresh login shell without inheriting the parent shell's env vars)
// find the correct token and backup dir on every subsequent run.
if (!fs.existsSync(ENV_FILE)) {
  if (process.env.LB_TOKEN) {
    // Token came from the shell environment (e.g. LB_TOKEN exported in ~/.bashrc).
    // Persist it now so future runs that don't inherit that env var still work.
    const defaultDir = path.join(os.homedir(), "LAN-Backup");
    const backupDirLine = process.env.LB_BACKUP_DIR
      ? `LB_BACKUP_DIR=${process.env.LB_BACKUP_DIR}`
      : `# LB_BACKUP_DIR=${defaultDir}`;
    fs.writeFileSync(
      ENV_FILE,
      [
        "# LAN Backup companion server — configuration",
        `# Auto-generated: ${new Date().toISOString().slice(0, 10)}`,
        "#",
        "# IMPORTANT: copy LB_TOKEN into the LAN Backup app",
        "#            Open the app → Settings tab → Auth Token field",
        "#",
        `LB_TOKEN=${process.env.LB_TOKEN}`,
        "",
        "# Optional — remove the # to change a default:",
        "# LB_PORT=7823",
        backupDirLine,
      ].join("\n") + "\n",
      "utf8"
    );
  } else {
    firstRunSetup(); // no token anywhere — generate one, write .env, print banner
  }
}

// ── Configuration ────────────────────────────────────────────────────────────
const PORT = parseInt(process.env.LB_PORT || "7823", 10);
const AUTH_TOKEN = process.env.LB_TOKEN;
const BACKUP_ROOT = process.env.LB_BACKUP_DIR || path.join(os.homedir(), "LAN-Backup");

// Log the path to the config file (not the token) so users can find and edit it
console.log(`  Config file : ${ENV_FILE}`);
const SERVER_ID_FILE = path.join(__dirname, ".server-id");
const RATE_LIMIT_WINDOW_MS = 60_000;
const RATE_LIMIT_MAX = 600; // 10 uploads/sec sustained — protects against DoS while allowing bulk backups

// Ensure backup root exists
fs.mkdirSync(BACKUP_ROOT, { recursive: true });

// ── Server ID (TOFU fingerprint) ─────────────────────────────────────────────
let SERVER_ID;
if (fs.existsSync(SERVER_ID_FILE)) {
  SERVER_ID = fs.readFileSync(SERVER_ID_FILE, "utf8").trim();
} else {
  SERVER_ID = crypto.randomBytes(16).toString("hex");
  fs.writeFileSync(SERVER_ID_FILE, SERVER_ID, "utf8");
}

// ── Peer Transfer State ───────────────────────────────────────────────────────
// In-memory map of active/recent peer-to-peer transfers.
// Entries are removed automatically 10 minutes after completion.
const peerTransfers = new Map();

// SSRF guard: only allow RFC 1918 LAN addresses as peer destinations.
// Also accepts loopback (127.x) for local dev/testing.
function isLanIp(urlOrIp) {
  let ip = urlOrIp;
  try { ip = new URL(urlOrIp).hostname; } catch {
    ip = urlOrIp.replace(/^https?:\/\//, "").split("/")[0].split(":")[0];
  }
  const parts = ip.split(".");
  if (parts.length !== 4) return false;
  const n = parts.map(Number);
  if (n.some((x) => isNaN(x) || x < 0 || x > 255)) return false;
  if (n[0] === 10) return true;
  if (n[0] === 172 && n[1] >= 16 && n[1] <= 31) return true;
  if (n[0] === 192 && n[1] === 168) return true;
  if (n[0] === 127) return true;
  return false;
}

// Runs asynchronously after POST /peer-transfer responds.
// Verifies TOFU fingerprints, then pushes every export file to every destination.
async function runPeerTransfer(transferId, destinations, exportFiles) {
  const state = peerTransfers.get(transferId);
  if (!state) return;

  try {
    // Step 1 — TOFU verification for each destination
    for (const dest of destinations) {
      if (dest.fingerprint) {
        let pingData;
        try {
          const pingRes = await fetch(`${dest.url}/ping`, {
            signal: AbortSignal.timeout(5000),
          });
          if (!pingRes.ok) throw new Error(`HTTP ${pingRes.status}`);
          pingData = await pingRes.json();
        } catch (e) {
          throw new Error(`Cannot reach ${dest.url}: ${e.message}`);
        }
        if (pingData.id !== dest.fingerprint) {
          throw new Error(
            `Server fingerprint mismatch at ${dest.url} — possible impersonation. ` +
            `Re-add the peer server in the app to re-establish trust.`
          );
        }
      }
    }

    // Step 2 — Push each export file to all destinations in parallel per file
    for (const filename of exportFiles) {
      const filePath = path.join(EXPORT_DIR, filename);
      let fileData;
      try {
        fileData = fs.readFileSync(filePath);
      } catch (e) {
        for (const dest of destinations) {
          const prog = state.progress[dest.url]?.[filename];
          if (prog) { prog.error = `Cannot read file: ${e.message}`; prog.done = true; }
        }
        continue;
      }

      await Promise.all(
        destinations.map(async (dest) => {
          const prog = state.progress[dest.url]?.[filename];
          if (!prog) return;
          try {
            // Build multipart body manually for maximum compatibility
            // with the destination's custom parser.
            const boundary = `LBSync${crypto.randomBytes(8).toString("hex")}`;
            const CRLF = "\r\n";
            const body = Buffer.concat([
              Buffer.from(`--${boundary}${CRLF}Content-Disposition: form-data; name="targetFolder"${CRLF}${CRLF}backup${CRLF}`),
              Buffer.from(`--${boundary}${CRLF}Content-Disposition: form-data; name="filename"${CRLF}${CRLF}${filename}${CRLF}`),
              Buffer.from(`--${boundary}${CRLF}Content-Disposition: form-data; name="file"; filename="${filename}"${CRLF}Content-Type: application/octet-stream${CRLF}${CRLF}`),
              fileData,
              Buffer.from(`${CRLF}--${boundary}--${CRLF}`),
            ]);

            const uploadRes = await fetch(`${dest.url}/upload`, {
              method: "POST",
              headers: {
                Authorization: `Bearer ${dest.token}`,
                "X-Client": "LAN-Backup/1.0",
                "Content-Type": `multipart/form-data; boundary=${boundary}`,
                "Content-Length": String(body.length),
              },
              body,
              signal: AbortSignal.timeout(120_000),
            });

            if (!uploadRes.ok) {
              const txt = await uploadRes.text().catch(() => String(uploadRes.status));
              throw new Error(`Upload failed: ${uploadRes.status} — ${txt.slice(0, 200)}`);
            }
            prog.done = true;
            console.log(`[SYNC] ${filename} → ${dest.url} OK (${fileData.length} bytes)`);
          } catch (e) {
            prog.error = String(e).replace(/^Error:\s*/, "");
            prog.done = true;
            console.log(`[SYNC] ${filename} → ${dest.url} FAILED: ${prog.error}`);
          }
        })
      );
    }

    state.status = "done";
    console.log(`[SYNC] Transfer ${transferId} complete`);
  } catch (e) {
    state.status = "error";
    state.error = String(e).replace(/^Error:\s*/, "");
    console.log(`[SYNC] Transfer ${transferId} failed: ${state.error}`);
  }

  // Clean up after 10 minutes to prevent memory growth
  setTimeout(() => peerTransfers.delete(transferId), 10 * 60 * 1000);
}

// ── Rate Limiter ─────────────────────────────────────────────────────────────
const rateLimitMap = new Map();

function isRateLimited(ip) {
  const now = Date.now();
  const entry = rateLimitMap.get(ip) || { count: 0, windowStart: now };

  if (now - entry.windowStart > RATE_LIMIT_WINDOW_MS) {
    entry.count = 1;
    entry.windowStart = now;
  } else {
    entry.count += 1;
  }
  rateLimitMap.set(ip, entry);
  return entry.count > RATE_LIMIT_MAX;
}

// ── Auth ─────────────────────────────────────────────────────────────────────
function isAuthorized(req) {
  const header = req.headers["authorization"] || "";
  if (!header.startsWith("Bearer ")) return false;
  const token = header.slice(7).trim();
  // Constant-time comparison to prevent timing attacks
  if (token.length !== AUTH_TOKEN.length) return false;
  return crypto.timingSafeEqual(Buffer.from(token), Buffer.from(AUTH_TOKEN));
}

// ── Disk Space ───────────────────────────────────────────────────────────────
function getDiskInfo() {
  try {
    if (process.platform === "win32") {
      const output = execSync(
        `powershell -Command "Get-PSDrive -Name C | Select-Object Used,Free | ConvertTo-Json"`,
        { timeout: 5000 }
      ).toString();
      const data = JSON.parse(output);
      const used = data.Used;
      const free = data.Free;
      const total = used + free;
      return { total, free, used, usagePercent: parseFloat(((used / total) * 100).toFixed(2)) };
    } else {
      const output = execSync(`df -k "${BACKUP_ROOT}"`, { timeout: 5000 }).toString();
      const lines = output.trim().split("\n");
      const parts = lines[1].trim().split(/\s+/);
      const total = parseInt(parts[1]) * 1024;
      const used = parseInt(parts[2]) * 1024;
      const free = parseInt(parts[3]) * 1024;
      return { total, free, used, usagePercent: parseFloat(((used / total) * 100).toFixed(2)) };
    }
  } catch (e) {
    // fallback to process
    return { total: 0, free: 0, used: 0, usagePercent: 0, error: String(e) };
  }
}

// ── Multipart Parser ─────────────────────────────────────────────────────────
function parseMultipart(req, callback) {
  const contentType = req.headers["content-type"] || "";
  const boundaryMatch = contentType.match(/boundary=(.+)$/);
  if (!boundaryMatch) return callback(new Error("No boundary in multipart"));

  const boundary = Buffer.from("--" + boundaryMatch[1].trim());
  const chunks = [];

  req.on("data", (c) => chunks.push(c));
  req.on("end", () => {
    const body = Buffer.concat(chunks);
    const fields = {};
    let fileData = null;
    let fileName = "upload";

    const parts = splitBuffer(body, boundary);
    for (const part of parts) {
      if (part.length === 0) continue;
      const headerEnd = findSequence(part, Buffer.from("\r\n\r\n"));
      if (headerEnd === -1) continue;

      const headerStr = part.slice(0, headerEnd).toString("utf8");
      const content = part.slice(headerEnd + 4);
      const strippedContent = content.slice(
        0,
        content.length - (content.slice(-2).equals(Buffer.from("\r\n")) ? 2 : 0)
      );

      const dispMatch = headerStr.match(/Content-Disposition:.*?name="([^"]+)"(?:.*?filename="([^"]+)")?/i);
      if (!dispMatch) continue;
      const fieldName = dispMatch[1];
      const fileNameInHeader = dispMatch[2];

      if (fileNameInHeader) {
        fileName = fileNameInHeader;
        fileData = strippedContent;
      } else {
        fields[fieldName] = strippedContent.toString("utf8");
      }
    }

    callback(null, { fields, fileData, fileName: fields.filename || fileName });
  });

  req.on("error", callback);
}

function splitBuffer(buf, delimiter) {
  const parts = [];
  let start = 0;
  while (true) {
    const idx = findSequence(buf, delimiter, start);
    if (idx === -1) break;
    parts.push(buf.slice(start, idx));
    start = idx + delimiter.length;
    if (buf.slice(start, start + 2).equals(Buffer.from("--"))) break;
    if (buf[start] === 13 && buf[start + 1] === 10) start += 2;
  }
  return parts;
}

function findSequence(buf, seq, start = 0) {
  outer: for (let i = start; i <= buf.length - seq.length; i++) {
    for (let j = 0; j < seq.length; j++) {
      if (buf[i + j] !== seq[j]) continue outer;
    }
    return i;
  }
  return -1;
}

// ── CORS & JSON helpers ───────────────────────────────────────────────────────
function setCORSHeaders(res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Authorization, Content-Type, X-Client");
}

function json(res, status, data) {
  const body = JSON.stringify(data);
  res.writeHead(status, { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(body) });
  res.end(body);
}

// ── Path Traversal Guard ──────────────────────────────────────────────────────
// relativePath (optional): e.g. "Camera/SubFolder/photo.jpg"
// When present the full directory structure is recreated inside targetFolder.
function safePath(folder, filename, relativePath) {
  const safeFolder = folder.replace(/[^a-zA-Z0-9_\-. ]/g, "_").trim() || "backup";
  const backupRoot = path.resolve(BACKUP_ROOT);

  if (relativePath) {
    // Validate every path segment — reject traversal attempts and illegal chars
    const segments = relativePath.split("/").filter(Boolean);
    for (const seg of segments) {
      if (
        seg === ".." ||
        seg === "." ||
        seg.startsWith(".") ||
        /[<>:"|?*\x00-\x1f\\]/.test(seg)
      ) {
        throw new Error(`Invalid path segment: "${seg}"`);
      }
    }
    // Last segment is the filename; preceding segments are directories
    const fileName = path.basename(segments[segments.length - 1] || filename);
    if (!fileName || fileName.startsWith(".")) throw new Error("Invalid filename");
    const dirSegments = segments.slice(0, -1);
    const targetDir = path.resolve(backupRoot, safeFolder, ...dirSegments);
    if (!targetDir.startsWith(backupRoot)) throw new Error("Path traversal attempt detected");
    return { targetDir, targetFile: path.join(targetDir, fileName) };
  }

  // Flat fallback (individual file picks, no folder structure)
  const safeFile = path.basename(filename);
  if (!safeFile || safeFile.startsWith(".") || safeFile.includes("..")) {
    throw new Error("Invalid filename");
  }
  const targetDir = path.resolve(backupRoot, safeFolder);
  if (!targetDir.startsWith(backupRoot)) throw new Error("Path traversal attempt detected");
  return { targetDir, targetFile: path.join(targetDir, safeFile) };
}

// ── Export folder (desktop→phone) ────────────────────────────────────────────
// Files placed here are listable and downloadable by the app.
// Restricted to a flat list — no subdirectory traversal allowed.
const EXPORT_DIR = path.join(BACKUP_ROOT, "export");
fs.mkdirSync(EXPORT_DIR, { recursive: true });

function safeExportFile(filename) {
  const base = path.basename(filename);
  if (!base || base.startsWith(".") || base.includes("..")) {
    throw new Error("Invalid filename");
  }
  const resolved = path.resolve(EXPORT_DIR, base);
  if (!resolved.startsWith(path.resolve(EXPORT_DIR))) {
    throw new Error("Path traversal attempt");
  }
  // Reject symlinks to prevent pointing outside export dir
  try {
    const stat = fs.lstatSync(resolved);
    if (stat.isSymbolicLink()) throw new Error("Symlinks not allowed");
  } catch (e) {
    if (e.message !== "Symlinks not allowed") {
      // file doesn't exist yet — that's fine for listing; caller checks existence
    } else {
      throw e;
    }
  }
  return resolved;
}

// ── HTTP Server ───────────────────────────────────────────────────────────────
const server = http.createServer((req, res) => {
  const ip = req.socket.remoteAddress || "unknown";
  setCORSHeaders(res);

  if (req.method === "OPTIONS") {
    res.writeHead(204);
    res.end();
    return;
  }

  if (isRateLimited(ip)) {
    return json(res, 429, { error: "Too many requests" });
  }

  const url = new URL(req.url, `http://localhost:${PORT}`);

  // GET /ping — TOFU fingerprint (no auth required)
  if (req.method === "GET" && url.pathname === "/ping") {
    // Strip ".local" suffix and anything that looks like an IP so the app gets a clean computer name
    const rawHostname = os.hostname();
    const hostname = /^\d+\.\d+\.\d+\.\d+$/.test(rawHostname)
      ? rawHostname
      : rawHostname.replace(/\.local$/, "");
    return json(res, 200, { id: SERVER_ID, version: "1.0.0", hostname, backupDir: BACKUP_ROOT });
  }

  // GET /disk — disk info (auth required)
  if (req.method === "GET" && url.pathname === "/disk") {
    if (!isAuthorized(req)) return json(res, 401, { error: "Unauthorized" });
    return json(res, 200, getDiskInfo());
  }

  // POST /upload — file upload (auth required)
  if (req.method === "POST" && url.pathname === "/upload") {
    if (!isAuthorized(req)) return json(res, 401, { error: "Unauthorized" });

    parseMultipart(req, (err, parsed) => {
      if (err || !parsed.fileData) {
        return json(res, 400, { error: err?.message || "No file data" });
      }

      const folder = parsed.fields.targetFolder || "backup";
      const relativePath = parsed.fields.relativePath || null;
      let targetDir, targetFile;
      try {
        ({ targetDir, targetFile } = safePath(folder, parsed.fileName, relativePath));
      } catch (e) {
        return json(res, 400, { error: String(e) });
      }

      fs.mkdirSync(targetDir, { recursive: true });

      const checksum = crypto.createHash("sha256").update(parsed.fileData).digest("hex");

      fs.writeFile(targetFile, parsed.fileData, (writeErr) => {
        if (writeErr) {
          return json(res, 500, { error: "Write failed: " + writeErr.message });
        }
        console.log(`[UPLOAD] ${parsed.fileName} → ${targetFile} (${parsed.fileData.length} bytes, sha256: ${checksum.slice(0, 8)}…)`);
        return json(res, 200, {
          success: true,
          filename: parsed.fileName,
          size: parsed.fileData.length,
          checksum,
          path: targetFile,
        });
      });
    });
    return;
  }

  // GET /export/list — list files available for download to phone (auth required)
  if (req.method === "GET" && url.pathname === "/export/list") {
    if (!isAuthorized(req)) return json(res, 401, { error: "Unauthorized" });
    try {
      const entries = fs.readdirSync(EXPORT_DIR, { withFileTypes: true });
      const files = entries
        .filter((e) => {
          if (!e.isFile()) return false;
          if (e.name.startsWith(".")) return false;
          // Reject symlinks
          const full = path.join(EXPORT_DIR, e.name);
          try {
            return fs.lstatSync(full).isFile();
          } catch {
            return false;
          }
        })
        .map((e) => {
          const full = path.join(EXPORT_DIR, e.name);
          let size = 0;
          let mtime = 0;
          try {
            const st = fs.statSync(full);
            size = st.size;
            mtime = st.mtimeMs;
          } catch {}
          return { name: e.name, size, mtime };
        });
      return json(res, 200, { files, exportDir: EXPORT_DIR });
    } catch (e) {
      return json(res, 500, { error: String(e) });
    }
  }

  // GET /export/file?name=filename.ext — download one file (auth required)
  if (req.method === "GET" && url.pathname === "/export/file") {
    if (!isAuthorized(req)) return json(res, 401, { error: "Unauthorized" });
    const name = url.searchParams.get("name") || "";
    let filePath;
    try {
      filePath = safeExportFile(name);
    } catch (e) {
      return json(res, 400, { error: String(e) });
    }
    if (!fs.existsSync(filePath)) return json(res, 404, { error: "File not found" });

    const stat = fs.statSync(filePath);
    const ext = path.extname(name).toLowerCase();
    const mimeMap = {
      ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".png": "image/png",
      ".gif": "image/gif", ".webp": "image/webp", ".pdf": "application/pdf",
      ".mp4": "video/mp4", ".mov": "video/quicktime", ".mp3": "audio/mpeg",
      ".zip": "application/zip", ".txt": "text/plain",
    };
    const mime = mimeMap[ext] || "application/octet-stream";

    res.writeHead(200, {
      "Content-Type": mime,
      "Content-Length": stat.size,
      "Content-Disposition": `attachment; filename="${encodeURIComponent(path.basename(name))}"`,
    });
    fs.createReadStream(filePath).pipe(res);
    console.log(`[EXPORT] ${name} → ${filePath} (${stat.size} bytes)`);
    return;
  }

  // POST /peer-transfer — start server-to-server sync (auth required)
  if (req.method === "POST" && url.pathname === "/peer-transfer") {
    if (!isAuthorized(req)) return json(res, 401, { error: "Unauthorized" });

    const alreadyRunning = [...peerTransfers.values()].some((t) => t.status === "running");
    if (alreadyRunning) return json(res, 409, { error: "A peer transfer is already in progress" });

    let body = "";
    req.on("data", (c) => { body += c; });
    req.on("end", () => {
      let parsed;
      try { parsed = JSON.parse(body); } catch { return json(res, 400, { error: "Invalid JSON body" }); }

      const { destinations } = parsed;
      if (!Array.isArray(destinations) || destinations.length === 0) {
        return json(res, 400, { error: "destinations must be a non-empty array" });
      }

      for (const dest of destinations) {
        if (!dest.url || typeof dest.url !== "string") {
          return json(res, 400, { error: "Each destination must have a url string" });
        }
        if (!dest.token || typeof dest.token !== "string") {
          return json(res, 400, { error: "Each destination must have a token string" });
        }
        if (!isLanIp(dest.url)) {
          return json(res, 400, { error: `Destination ${dest.url} is not a LAN (RFC 1918) address. Only local network addresses are allowed.` });
        }
      }

      let exportFiles;
      try {
        exportFiles = fs.readdirSync(EXPORT_DIR, { withFileTypes: true })
          .filter((e) => {
            if (!e.isFile() || e.name.startsWith(".")) return false;
            try { return fs.lstatSync(path.join(EXPORT_DIR, e.name)).isFile(); } catch { return false; }
          })
          .map((e) => e.name);
      } catch (e) {
        return json(res, 500, { error: "Cannot read export folder: " + String(e) });
      }

      if (exportFiles.length === 0) {
        return json(res, 400, { error: "Export folder is empty — add files to the export/ folder on this server and try again" });
      }

      const transferId = crypto.randomBytes(8).toString("hex");
      const progress = {};
      for (const dest of destinations) {
        progress[dest.url] = {};
        for (const f of exportFiles) {
          progress[dest.url][f] = { done: false, error: null };
        }
      }

      peerTransfers.set(transferId, {
        status: "running",
        sourceFiles: exportFiles,
        destinations: destinations.map((d) => d.url),
        progress,
        startedAt: Date.now(),
        error: null,
      });

      console.log(`[SYNC] Starting transfer ${transferId}: ${exportFiles.length} file(s) → ${destinations.length} destination(s)`);

      // Fire and forget — runs in background while response is sent
      runPeerTransfer(transferId, destinations, exportFiles);

      return json(res, 200, {
        transferId,
        files: exportFiles,
        destinations: destinations.map((d) => d.url),
      });
    });
    req.on("error", () => json(res, 400, { error: "Request error" }));
    return;
  }

  // GET /peer-transfer/:id — poll transfer progress (auth required)
  if (req.method === "GET" && url.pathname.startsWith("/peer-transfer/")) {
    if (!isAuthorized(req)) return json(res, 401, { error: "Unauthorized" });
    const transferId = url.pathname.slice("/peer-transfer/".length);
    const state = peerTransfers.get(transferId);
    if (!state) return json(res, 404, { error: "Transfer not found or expired" });
    return json(res, 200, state);
  }

  json(res, 404, { error: "Not found" });
});

server.listen(PORT, "0.0.0.0", () => {
  console.log("╔═══════════════════════════════════════════╗");
  console.log("║     LAN Backup — Companion Server         ║");
  console.log("╚═══════════════════════════════════════════╝");
  console.log(`  Listening on port : ${PORT}`);
  console.log(`  Backup directory  : ${BACKUP_ROOT}`);
  console.log(`  Auth token        : ${"•".repeat(8)}  (set — edit .env to change)`);
  console.log(`  Server ID (TOFU)  : ${SERVER_ID}`);
  console.log(`  LAN IP addresses  :`);
  const nets = os.networkInterfaces();
  for (const name of Object.keys(nets)) {
    for (const net of nets[name]) {
      if (net.family === "IPv4" && !net.internal) {
        console.log(`    http://${net.address}:${PORT}`);
      }
    }
  }
  console.log("─────────────────────────────────────────────");
  console.log("  If you have lost the auth token, find it in:");
  console.log(`  ${ENV_FILE}  (LB_TOKEN line)`);
  console.log("─────────────────────────────────────────────");
  console.log("  Press Ctrl+C to stop");
});

process.on("SIGINT", () => {
  console.log("\n  Shutting down...");
  server.close(() => process.exit(0));
});
