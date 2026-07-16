# LAN Backup

Back up files from your phone to your computer over Wi-Fi — no cloud, no account, no cable.

---

## Quick Start

Three steps and you're done. The whole setup takes about five minutes.

---

### Step 1 — Get the app on your phone

LAN Backup runs inside **Expo Go**, a free app available on both platforms.

| Platform | Install Expo Go |
|---|---|
| Android | [Google Play — Expo Go](https://play.google.com/store/apps/details?id=host.exp.exponent) |
| iOS | [App Store — Expo Go](https://apps.apple.com/app/expo-go/id982107779) |

Once Expo Go is installed, open LAN Backup:

**On Android** — open Expo Go, tap **"Enter URL manually"** and type:
```
exp://6ea29a26-a374-4b67-ac7b-a6eb0c7421ee-00-5bkvdz56o8j4.expo.kirk.replit.dev
```

**On iOS** — open **Safari**, type that same address, and tap the prompt to open it in Expo Go.
Or scan this QR code with the iPhone camera:

> 📷 [Download QR code](attached_assets/expo-qr.png)

The app loads in a few seconds. You can save it to your Expo Go home screen for quick access later.

> **Both your phone and your computer must be on the same Wi-Fi network** for transfers to work.

---

### Step 2 — Start the server on your computer

The companion server is a small program that runs on your computer and receives the files. You only install it once — after that a desktop shortcut handles restarts.

#### macOS / Linux

Open **Terminal**, paste the command below, and press Enter:

```bash
mkdir -p ~/LAN_backup && cd ~/LAN_backup && \
curl -fsSL https://raw.githubusercontent.com/Marcseb/lan-backup/main/setup.sh | bash
```

Node.js is installed automatically if needed.

#### Windows

Open **PowerShell**, paste the command below, and press Enter:

```powershell
mkdir ~\LAN_backup; cd ~\LAN_backup; Invoke-WebRequest -Uri https://raw.githubusercontent.com/Marcseb/lan-backup/main/setup.ps1 -OutFile setup.ps1; powershell.exe -ExecutionPolicy Bypass -File setup.ps1
```

> If Windows shows a blue security prompt, click **"More info" → "Run anyway"** — the script only installs Node.js and starts the server.

---

When the server starts for the first time it displays an **auth token** — keep the terminal open, you will need this in the next step:

```
╔════════════════════════════════════════════════════════════╗
║  LAN Backup — First-time Setup                             ║
╠════════════════════════════════════════════════════════════╣
║                                                            ║
║  Copy this token into the app:                             ║
║  App → Settings tab → Auth Token field                     ║
║                                                            ║
║  Token:  a1b2c3d4e5f6...                                   ║
║                                                            ║
╚════════════════════════════════════════════════════════════╝
```

The token is saved automatically — you won't see this screen again after the first run.

A **desktop shortcut** is also created so you can start the server with one click in the future.

---

### Step 3 — Connect the app to your computer

In LAN Backup, open the **Settings** tab:

1. Tap **"Detect computers on this network"** — the app scans your Wi-Fi and lists computers running the server. Tap your computer to fill in its address automatically.
2. Paste the **auth token** from the terminal into the **Auth Token** field.
3. Tap **Save Settings**, then **Test Connection**.

A green confirmation means everything is working. You're ready to back up.

---

## Backing up files

Open the **Backup** tab, tap **+** to pick files or folders, then tap **Start Backup**. A progress bar shows each file being transferred. To cancel mid-transfer, tap **Cancel**.

Past transfers are listed in the **History** tab with status, file names, sizes, and timestamps.

### Image compression (optional)

Tap the **⊡** button before starting a backup to compress photos — useful for documents like bills or receipts.

| Preset | Quality | Max size | Best for |
|---|---|---|---|
| Low | 40% | 1024 px | Bills, receipts, text |
| Medium | 65% | 1920 px | Everyday photos |
| High | 85% | 2560 px | Near-original quality |

Videos, PDFs, and other file types are always sent as-is.

---

## Restarting the server

The server needs to be running on your computer whenever you want to back up.

Double-click the **"Start LAN Backup Server"** shortcut on your Desktop — it was created automatically during setup. That's it.

If the shortcut is missing, re-run the original install command. It detects the existing server and just starts it.

---

## Restore — send files from computer to phone

The **Restore** tab lets you send files **from your computer to your phone**. This feature requires a one-time €5 contribution (unlocked via PayPal inside the app).

1. Place files inside the **`export/`** sub-folder of your backup directory:
   ```
   ~/LAN-Backup/
   ├── backup/     ← phone → computer
   └── export/     ← computer → phone  ← put files here
   ```
2. Open the **Restore** tab in the app, select the files, and tap **Download to phone**.

---

## Support this project

LAN Backup is free and open source. If it saves you time, a contribution is always appreciated!

- ☕ [Buy me a coffee](https://buymeacoffee.com/marcsebastien)
- 💙 [Donate via PayPal](https://www.paypal.com/donate/?business=7AUYVWJE39NMQ&no_recurring=0&item_name=Building+open+source+apps+that+are+secure%2C+practical%2C+and+keep+your+data+local%E2%80%94not+in+the+cloud.&currency_code=EUR)

---
---

# Advanced

---

## Where files are saved

Files land at `<backup root> / <Target Folder> / <relative path from phone>`. The default backup root is `~/LAN-Backup`. Folder structure from the phone is preserved:

```
~/LAN-Backup/
└── backup/
    └── Camera/
        ├── photo.jpg
        └── Screenshots/
            └── screen1.png
```

---

## Configuration

All settings live in a hidden **`.env`** file created automatically on first run, inside the `companion-server` folder:

| Platform | Path to `.env` |
|---|---|
| macOS / Linux | `~/LAN_backup/companion-server/.env` |
| Windows | `C:\Users\YourName\LAN_backup\companion-server\.env` |

| Setting | Default | Description |
|---|---|---|
| `LB_TOKEN` | *(auto-generated)* | Auth token — must match what you enter in the app |
| `LB_PORT` | `7823` | Port the server listens on |
| `LB_BACKUP_DIR` | `~/LAN-Backup` | Root folder where uploaded files are stored |

Edit the value on any line, save, and restart the server.

### Opening `.env` on macOS / Linux

```bash
nano ~/LAN_backup/companion-server/.env
```
Save: **Ctrl + O** — Exit: **Ctrl + X**

> **Can't see the file in the file manager?** Press **Ctrl + H** in GNOME Files / Thunar, or **Alt + .** in Dolphin. The terminal command above always works regardless.

### Opening `.env` on Windows

1. Paste `%USERPROFILE%\LAN_backup\companion-server` into the File Explorer address bar.
2. If `.env` is not visible: **View** → tick **Hidden items**.
3. Right-click **`.env`** → **Open with** → **Notepad**.

### Resetting the auth token

Delete the `.env` file and restart the server. A new random token is generated and printed — copy it back into the app Settings.

---

## Security

- **Bearer token auth** on all file-sensitive endpoints
- **TOFU fingerprint** — unique server ID generated on first run; app warns if it changes
- **Path traversal protection** — every path segment validated; `../` escapes rejected
- **SHA-256 checksum** computed for every received file
- **Rate limiting** — max 600 requests per minute per IP

**Recommendations:** use on trusted networks only (plain HTTP, home LAN use); don't expose port 7823 to the internet; consider restricting it to your LAN subnet via firewall.

---

## API reference

| Method | Path | Auth | Description |
|---|---|---|---|
| `GET` | `/ping` | No | Returns server ID and version (TOFU) |
| `GET` | `/disk` | Yes | Disk space info |
| `POST` | `/upload` | Yes | File upload — phone → computer |
| `GET` | `/export/list` | Yes | Lists files in `export/` folder |
| `GET` | `/export/file?name=x` | Yes | Downloads one file from `export/` to phone |

---

## Architecture

- Phone connects **directly** to the companion server over LAN — no cloud relay.
- Credentials stored in the **device secure enclave** (iOS Keychain / Android Keystore) via `expo-secure-store`.
- Server is plain Node.js; the desktop shortcut embeds the backup directory path so the correct folder is always used even if `.env` is missing.
