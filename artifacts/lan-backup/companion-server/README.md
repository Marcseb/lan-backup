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
| `LB_BACKUP_DIR` | `~/LAN-Backup` | Root directory where uploaded files are stored |

## What gets saved where

Files are saved under `LB_BACKUP_DIR / <Target Folder> / <relative path>`.

When you back up a folder from the app, the full directory structure is recreated on your computer. For example, if you select a folder called `Camera` containing a sub-folder `Screenshots`, the server will create:

```
~/LAN-Backup/
└── phone/                  ← Target Folder set in the app
    └── Camera/
        ├── photo.jpg
        └── Screenshots/
            └── screen1.png
```

Individual files picked without a folder are saved flat inside the Target Folder.

## Security Features

- **Bearer token auth** on all file-sensitive endpoints
- **Rate limiting** — max 600 requests per minute per IP (supports bulk folder backups)
- **SHA-256 checksum** computed for every received file (returned in the response)
- **Path traversal protection** — every path segment is validated; `../` escapes are rejected
- **TOFU fingerprint** — a unique server ID is generated on first run and returned on `/ping`, allowing the app to detect server impersonation

## Endpoints

| Method | Path | Auth | Description |
|---|---|---|---|
| `GET` | `/ping` | No | Returns server ID and version (used for TOFU) |
| `GET` | `/disk` | Yes | Returns disk space info |
| `POST` | `/upload` | Yes | Accepts a file upload (multipart/form-data) |

### Upload fields

| Field | Required | Description |
|---|---|---|
| `file` | Yes | The file binary (multipart) |
| `targetFolder` | Yes | Sub-folder name inside the backup root |
| `filename` | Yes | File name to save as |
| `relativePath` | No | Full relative path including folder structure (e.g. `Camera/Screenshots/screen1.png`). When present, the directory tree is recreated automatically. |

## Security Recommendations

1. **Use on trusted networks only** — this server uses plain HTTP (no TLS) and is designed for home LAN use.
2. **Set a strong auth token** — at least 20 random characters.
3. **Don't expose to the internet** — keep the server running only while doing backups; stop it when done.
4. **Firewall** — consider restricting the port (7823) to your LAN subnet only.
5. **Check the terminal logs** — every upload is logged with filename, size, and checksum.
