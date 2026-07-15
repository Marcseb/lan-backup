# LAN Backup

Back up files and folders from your phone to a computer on the same Wi-Fi network — no cloud, no account, no USB cable.

---

## Part 1 — Mobile app (your phone)

The app runs inside **Expo Go**, a free shell available on both iOS and Android.

### Install Expo Go

| Platform | Link |
|---|---|
| Android | [Play Store — Expo Go](https://play.google.com/store/apps/details?id=host.exp.exponent) |
| iOS | [App Store — Expo Go](https://apps.apple.com/app/expo-go/id982107779) |

### Open LAN Backup

**On Android:** open Expo Go and the app should appear automatically under "Development servers". If not, tap **Enter URL manually**.

**On iOS:** open **Safari** and type the address below — Safari will offer to open it in Expo Go:

```
exp://6ea29a26-a374-4b67-ac7b-a6eb0c7421ee-00-5bkvdz56o8j4.expo.kirk.replit.dev
```

Or scan this QR code with the iPhone camera:

> 📷 [Download QR code](attached_assets/expo-qr.png)

The app will load. The first time may take a few seconds.

> **Note:** both your phone and your computer must be on the same Wi-Fi network for transfers to work.

### First-time setup in the app

Once the app is open, go to the **Settings** tab:

1. Tap **"Detect computers on this network"** — the app scans your Wi-Fi and lists any computers running the companion server. Tap your computer to fill in its address automatically.
2. Enter the **auth token** shown when you started the server (see Part 2 below).
3. Optionally adjust the **Target Folder** name (default: `backup`).
4. Tap **Save Settings**, then **Test Connection** to confirm everything works.

### Image compression (optional)

The **⊡** button in the action bar lets you compress photos before they are sent — useful for documents like bills or receipts where a small, readable file is enough.

- Tap ⊡ to toggle compression on (button turns blue) or off before starting a backup.
- In **Settings → Image Compression Quality**, choose your preset:

| Preset | JPEG quality | Max dimension | Best for |
|--------|-------------|---------------|----------|
| Low    | 40%         | 1024 px       | Bills, receipts, text documents |
| Medium | 65%         | 1920 px       | Everyday photos |
| High   | 85%         | 2560 px       | Near-original quality |

> Only image files (JPG, PNG, HEIC, WebP) are compressed. Videos, PDFs, and other files are always sent as-is.

---

## Part 2 — Companion server (your computer)

A lightweight Node.js server that runs on your computer and receives files from the app.

### Quick Install

Create a folder anywhere on your computer (e.g. `LAN_backup`), download the setup file for your platform into that folder, and run it — everything else is automatic.

| Platform | Download |
|---|---|
| **Linux / macOS** | [setup.sh](https://github.com/Marcseb/lan-backup/raw/main/setup.sh) — save the file, then `bash setup.sh` |
| **Windows** | [setup.ps1](https://github.com/Marcseb/lan-backup/raw/main/setup.ps1) — right-click → Run with PowerShell |

> The setup script downloads the companion server automatically, installs Node.js if needed, and starts the server. You only need to do this once.

#### Linux / macOS — step by step

1. Create a folder: `mkdir ~/LAN_backup && cd ~/LAN_backup`
2. Download the setup file:
   ```bash
   curl -fsSL https://raw.githubusercontent.com/Marcseb/lan-backup/main/setup.sh -o setup.sh
   ```
3. Run it:
   ```bash
   bash setup.sh
   ```

#### Windows — step by step

1. Create a folder, e.g. `C:\LAN_backup`.
2. Open PowerShell, navigate to the folder:
   ```powershell
   cd C:\LAN_backup
   ```
3. Download and run the setup script:
   ```powershell
   Invoke-WebRequest -Uri https://raw.githubusercontent.com/Marcseb/lan-backup/main/setup.ps1 -OutFile setup.ps1
   .\setup.ps1
   ```

If Windows shows a blue security warning, click **"Open anyway"**.

> **Tip — execution policy:** if PowerShell refuses to run the script, open PowerShell as Administrator and run:
> `Set-ExecutionPolicy -Scope CurrentUser RemoteSigned`
> Then try again.

---

### First run

The very first time the server starts it will:

1. Generate a secure random auth token.
2. Save it to a file called **`.env`** in the same folder (so you never need to set it manually again).
3. Print it clearly in the terminal — copy it into the app under **Settings → Auth Token**.

```
╔════════════════════════════════════════════════════════════╗
║  LAN Backup — First-time Setup                             ║
╠════════════════════════════════════════════════════════════╣
║                                                            ║
║  A secure token has been generated and saved to .env       ║
║                                                            ║
║  Copy this token into the app:                             ║
║  App → Settings tab → Auth Token field                     ║
║                                                            ║
║  Token:  a1b2c3d4e5f6...                                   ║
║                                                            ║
║  The token is saved in .env and reused on every start.     ║
║  To reset it, delete .env and restart the server.          ║
║                                                            ║
╚════════════════════════════════════════════════════════════╝
```

From the second run onwards, just run the installer again (or `node server.js`) — the token is loaded from `.env` automatically.

---

### Subsequent starts

| Platform | Command |
|---|---|
| macOS / Linux | `bash install.sh` (or `node server.js` once Node.js is installed) |
| Windows | Double-click `install.ps1` (or run `node server.js` in a terminal) |

---

### Configuration (optional)

All settings live in the **`.env`** file created on first run. Open it in any text editor:

| Setting | Default | Description |
|---|---|---|
| `LB_TOKEN` | *(auto-generated)* | Auth token — must match what you enter in the app |
| `LB_PORT` | `7823` | Port the server listens on |
| `LB_BACKUP_DIR` | `~/LAN-Backup` | Root folder where uploaded files are stored |

To change a setting, remove the `#` at the start of the line and edit the value, then restart the server.

You can also override settings by passing environment variables before `node server.js`:

```bash
LB_PORT=8000 node server.js        # macOS / Linux
set LB_PORT=8000 && node server.js # Windows cmd
```

---

### What gets saved where

Files are stored under `LB_BACKUP_DIR / <Target Folder> / <relative path>`.

When you back up a folder from the app, the full directory structure is recreated on your computer:

```
~/LAN-Backup/
└── phone/                  ← Target Folder set in the app
    └── Camera/
        ├── photo.jpg
        └── Screenshots/
            └── screen1.png
```

Individual files picked without a folder are saved flat inside the Target Folder.

---

## Restore — Desktop to Phone (unlockable feature)

You can also send files **from your computer to your phone** using the **Restore** tab in the app. This feature requires a one-time €5 contribution (unlocked via PayPal inside the app).

### How it works

1. Place the files you want to send to your phone inside the **`export/`** sub-folder of the backup directory:
   ```
   ~/LAN-Backup/
   ├── backup/         ← phone → desktop (as before)
   └── export/         ← desktop → phone  ← put files here
       ├── photo.jpg
       └── document.pdf
   ```
2. Open the **Restore** tab in the app.
3. The app lists the files in `export/` — select one or several, choose a destination folder on your phone, and tap **Download to phone**.

### Security of the export folder

- Only **flat files** in `export/` are served — subdirectories and symlinks are never accessible.
- The same **bearer token auth** and **TOFU fingerprint** protection apply.
- File names are validated with `path.basename()` on both sides to prevent any path traversal.

---

## Security

- **Bearer token auth** on all file-sensitive endpoints
- **Rate limiting** — max 600 requests per minute per IP
- **SHA-256 checksum** computed for every received file
- **Path traversal protection** — every path segment is validated; `../` escapes are rejected
- **TOFU fingerprint** — a unique server ID is generated on first run; the app alerts you if it ever changes (possible impersonation)

### Recommendations

1. **Use on trusted networks only** — this server uses plain HTTP and is designed for home LAN use.
2. **Don't expose to the internet** — run the server only while doing backups.
3. **Firewall** — consider restricting port 7823 to your LAN subnet only.

---

## API reference

| Method | Path | Auth | Description |
|---|---|---|---|
| `GET` | `/ping` | No | Returns server ID and version (used for TOFU) |
| `GET` | `/disk` | Yes | Returns disk space info |
| `POST` | `/upload` | Yes | Accepts a file upload (phone → desktop) |
| `GET` | `/export/list` | Yes | Lists files available in the `export/` folder |
| `GET` | `/export/file?name=x` | Yes | Downloads one file from `export/` to the phone |

---

## Support this project

LAN Backup is free and open source. If it saves you time, a contribution is always appreciated!

- ☕ [Buy me a coffee](https://buymeacoffee.com/marcsebastien)
- 💙 [Donate via PayPal](https://www.paypal.com/donate/?business=7AUYVWJE39NMQ&no_recurring=0&item_name=Building+open+source+apps+that+are+secure%2C+practical%2C+and+keep+your+data+local%E2%80%94not+in+the+cloud.&currency_code=EUR)
