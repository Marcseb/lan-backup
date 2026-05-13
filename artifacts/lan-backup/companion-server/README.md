# LAN Backup — Companion Server

A lightweight Node.js HTTP server that runs on your computer to receive files from the LAN Backup mobile app.

## Requirements

- Node.js 18 or later
- macOS, Linux, or Windows

## Quick Start

```bash
# Set your auth token (required)
export LB_TOKEN=your_secret_token_here

# Run the server
node server.js
```

On Windows:
```cmd
set LB_TOKEN=your_secret_token_here
node server.js
```

## Configuration

| Environment Variable | Default | Description |
|---|---|---|
| `LB_TOKEN` | *(required)* | Auth token — must match what you set in the app |
| `LB_PORT` | `7823` | Port to listen on |
| `LB_BACKUP_DIR` | `~/LAN-Backup` | Where uploaded files are stored |

## Security Features

- **Bearer token auth** on all file-sensitive endpoints
- **Rate limiting** — max 30 requests per minute per IP
- **SHA-256 checksum** computed for every received file (returned in response)
- **Path traversal protection** — filenames are sanitized; no `../` escapes
- **TOFU fingerprint** — a unique server ID is generated on first run and returned on `/ping`, allowing the app to detect server impersonation

## Endpoints

| Method | Path | Auth | Description |
|---|---|---|---|
| `GET` | `/ping` | No | Returns server ID and version (used for TOFU) |
| `GET` | `/disk` | Yes | Returns disk space info |
| `POST` | `/upload` | Yes | Accepts a file upload (multipart/form-data) |

## Security Recommendations

1. **Use on trusted networks only** — this server uses plain HTTP (no TLS) and is designed for home LAN use.
2. **Set a strong auth token** — at least 20 random characters.
3. **Don't expose to the internet** — keep the server running only while doing backups; stop it when done.
4. **Firewall** — consider restricting the port (7823) to your LAN subnet only.
5. **Check the terminal logs** — every upload is logged with filename, size, and checksum.
