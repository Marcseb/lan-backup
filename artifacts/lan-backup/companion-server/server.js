#!/usr/bin/env node
/**
 * LAN Backup Companion Server
 *
 * Run this on your computer (requires Node.js 18+):
 *   node server.js
 *
 * Or set the auth token via env:
 *   LB_TOKEN=mysecret node server.js
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

// ── Configuration ────────────────────────────────────────────────────────────
const PORT = parseInt(process.env.LB_PORT || "7823", 10);
const AUTH_TOKEN = process.env.LB_TOKEN || "";
const BACKUP_ROOT = process.env.LB_BACKUP_DIR || path.join(process.env.HOME || os.homedir(), "LAN-Backup");
const SERVER_ID_FILE = path.join(__dirname, ".server-id");
const RATE_LIMIT_WINDOW_MS = 60_000;
const RATE_LIMIT_MAX = 600; // 10 uploads/sec sustained — protects against DoS while allowing bulk backups

if (!AUTH_TOKEN) {
  console.error("⚠️  No auth token set! Set LB_TOKEN environment variable.");
  console.error("   Example: LB_TOKEN=mysecrettoken node server.js");
  process.exit(1);
}

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
    return json(res, 200, { id: SERVER_ID, version: "1.0.0", hostname: os.hostname(), backupDir: BACKUP_ROOT });
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

  json(res, 404, { error: "Not found" });
});

server.listen(PORT, "0.0.0.0", () => {
  console.log("╔═══════════════════════════════════════════╗");
  console.log("║     LAN Backup — Companion Server         ║");
  console.log("╚═══════════════════════════════════════════╝");
  console.log(`  Listening on port : ${PORT}`);
  console.log(`  Backup directory  : ${BACKUP_ROOT}`);
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
  console.log("  Press Ctrl+C to stop");
});

process.on("SIGINT", () => {
  console.log("\n  Shutting down...");
  server.close(() => process.exit(0));
});
