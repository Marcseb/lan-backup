# LAN Backup

Back up files from your phone to your computer over Wi-Fi — no cloud, no account, no cable.

| Feature | What it does |
|---|---|
| **Backup** | Transfer files and folders from your phone to your computer |
| **Restore** *(Pro)* | Send files from your computer back to your phone |
| **Server Sync** *(Pro)* | Push files from one computer to one or more others over LAN |

Pro features (Restore and Server Sync) require a one-time €5 contribution, unlocked via PayPal directly inside the app.

Source code and updates: [github.com/Marcseb/lan-backup](https://github.com/Marcseb/lan-backup)

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

Once Expo Go is installed, open LAN Backup in your phone's browser:

**[https://local-file-sync-marcsebastienb.replit.app](https://local-file-sync-marcsebastienb.replit.app)**

The page will automatically open the app in Expo Go, or show a QR code you can scan with your camera.

> **Both your phone and your computer must be on the same Wi-Fi network** for transfers to work.

---

### Step 2 — Start the server on your computer

The companion server is a small program that runs on your computer and receives files from the app. You only install it once.

#### macOS / Linux

Open **Terminal**, paste the command below, and press Enter:

```bash
mkdir -p ~/LAN_backup && cd ~/LAN_backup && \
curl -fsSL https://raw.githubusercontent.com/Marcseb/lan-backup/main/setup.sh | bash
```

This downloads and starts the server automatically. Node.js is installed for you if needed.

#### Windows

Open **PowerShell**, paste the command below, and press Enter:

```powershell
mkdir ~\LAN_backup; cd ~\LAN_backup; Invoke-WebRequest -Uri https://raw.githubusercontent.com/Marcseb/lan-backup/main/setup.ps1 -OutFile setup.ps1; powershell.exe -ExecutionPolicy Bypass -File setup.ps1
```

> If Windows shows a blue security prompt, click **"More info" → "Run anyway"** — the script only installs Node.js and starts the server.

---

On first launch, the server asks how you want to set your auth token:

```
  [1]  Generate a secure random token  (recommended)
  [2]  Enter my own token
```

Press **Enter** (or type **1**) to generate one automatically. Type **2** to enter your own.

The token is then displayed — **this is the only time it is shown**:

```
╔════════════════════════════════════════════════════════════════╗
║  Token saved!  Copy it into the app now.                       ║
╠════════════════════════════════════════════════════════════════╣
║                                                                ║
║  App  →  Settings tab  →  Auth Token field                     ║
║                                                                ║
║  Token:  a1b2c3d4e5f6...                                       ║
║                                                                ║
║  ⚠  This is shown only once.  To view it later, open:         ║
║     .env  →  look for the LB_TOKEN line.                       ║
║                                                                ║
╚════════════════════════════════════════════════════════════════╝
```

Copy it — you will paste it into the app in the next step. On every restart the server loads the token silently from `.env`; you will not be prompted again.

A **desktop shortcut** is also created so you can start the server with one click in the future.

---

### Step 3 — Connect the app to your computer

In the LAN Backup app, open the **Settings** tab:

1. Tap **"Detect computers on this network"** — the app scans your Wi-Fi and lists computers running the server. Tap your computer to fill in its address automatically.
2. Paste the **auth token** shown in the terminal into the **Auth Token** field.
3. Tap **Save Settings**, then **Test Connection**.

You should see a green confirmation. You're ready to back up.

---

## Backing up files

Open the **Backup** tab. Tap the **+** button to pick files or folders from your phone, then tap **Start Backup**. A progress bar shows each file being transferred.

- To cancel a transfer in progress, tap **Cancel**.
- Past transfers are listed in the **History** tab with their status, file names, sizes, and timestamps.

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

The server needs to be running on your computer whenever you want to back up. To start it again after closing it:

| Platform | How to restart |
|---|---|
| macOS / Linux | Double-click the **"Start LAN Backup Server"** shortcut on your Desktop |
| Windows | Double-click the **"Start LAN Backup Server"** shortcut on your Desktop |

If the shortcut is missing, you can always re-run the original install command — it detects the existing install and just starts the server.

---

## Restore — send files from computer to phone

**Restore** lets you send files **from your computer back to your phone** over Wi-Fi. Like Server Sync, it requires the one-time €5 Pro unlock (via PayPal inside the app).

### Setting up

Place the files you want to send inside the **`export/`** sub-folder of your backup directory:

```
~/LAN-Backup/
├── backup/     ← phone → computer  (backed-up files land here)
└── export/     ← computer → phone  (put files here to send to phone)
    ├── photo.jpg
    └── document.pdf
```

Any file type is supported — photos, documents, videos, archives.

### Downloading to your phone

1. Make sure the companion server is running on your computer.
2. Open the **Restore** tab in the app.
3. The app lists everything in `export/` — tap the files you want.
4. Tap **Download to phone** — files are saved to your phone's local storage.

> To clear the list, delete or move the files out of `export/` after downloading.

---

## Server Sync — push files from one computer to another

**Server Sync** lets the phone act as a controller to push files from one computer's `export/` folder to one or more other computers on the same network — all without going through any cloud.

This feature is included with the same one-time €5 Pro unlock as Restore.

### How it works

```
Phone (controller)
   │
   ├── triggers sync on ──▶ Primary server (reads its export/ folder)
   │                              │
   │                              ├──▶ Peer server A  (saves to backup/)
   │                              └──▶ Peer server B  (saves to backup/)
```

### Setting up peer servers

1. Make sure the companion server is running on **every** computer involved.
2. Each server has its own auth token — they do **not** need to share one.
3. In the app, open **Settings** → scroll to **Peer Servers**.
4. Tap **Add peer server…** — the app scans your Wi-Fi and lists computers running the server.
5. Select a computer, enter its auth token, and tap **Add Server**.
6. Repeat for each destination computer.

### Running a sync

Once at least one peer server is configured and Pro is unlocked, a **Server Sync** tab appears on the Backup screen.

1. Place the files you want to distribute in the **`export/`** folder of the **primary** server (same folder used by Restore).
2. Open the Backup tab → tap **Server Sync**.
3. Tap **Start Sync** — the primary server pushes each file to all peer servers in parallel.
4. Progress bars update live for each destination. A ✓ or ✗ appears per server when done.

> The sync runs on the server — you can leave the screen and it continues. Tap **Server Sync** again to check progress.

---

## Support this project

LAN Backup is free and open source. If it saves you time, a contribution is always appreciated!

- ☕ [Buy me a coffee](https://buymeacoffee.com/marcsebastien)
- 💙 [Donate via PayPal](https://www.paypal.com/donate/?business=7AUYVWJE39NMQ&no_recurring=0&item_name=Building+open+source+apps+that+are+secure%2C+practical%2C+and+keep+your+data+local%E2%80%94not+in+the+cloud.&currency_code=EUR)

---
---

# Advanced

The sections below are for users who want to customise, troubleshoot, or understand how LAN Backup works under the hood.

---

## Where files are saved

Backed-up files are stored on your computer under:
```
<backup root> / <Target Folder> / <relative path from phone>
```

The default backup root is `~/LAN-Backup`. The Target Folder is set in the app (default: `backup`). Folder structure from the phone is preserved:

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

To change a setting, open `.env` in any text editor, edit the value, save, and restart the server.

### Opening `.env` on macOS / Linux

The quickest method is the terminal:

```bash
nano ~/LAN_backup/companion-server/.env
```
Save with **Ctrl + O**, exit with **Ctrl + X**.

> **Can't see the file in the file manager?** Press the keyboard shortcut for your file manager: **Ctrl + H** in GNOME Files or Thunar, **Alt + .** in Dolphin. The terminal command above always works regardless.

### Opening `.env` on Windows

1. Open **File Explorer** and paste this into the address bar:
   ```
   %USERPROFILE%\LAN_backup\companion-server
   ```
2. If `.env` is not visible, click **View** → tick **Hidden items**.
3. Right-click **`.env`** → **Open with** → **Notepad**.

### Resetting the auth token

Delete the `.env` file entirely and restart the server. A new random token will be generated and printed in the terminal — copy it back into the app Settings.

---

## Security

- **Bearer token auth** on all file-sensitive endpoints — all requests require the token you set in the app
- **TOFU fingerprint** — the server generates a unique ID on first run; the app warns you if it changes (possible impersonation)
- **Path traversal protection** — every path segment is validated; `../` escapes are rejected
- **SHA-256 checksum** computed for every received file
- **Rate limiting** — max 600 requests per minute per IP

### Recommendations

1. **Use on trusted networks only** — the server uses plain HTTP, designed for home LAN use.
2. **Don't expose to the internet** — run the server only while doing backups.
3. **Firewall** — consider restricting port 7823 to your LAN subnet only.

---

## API reference

| Method | Path | Auth | Description |
|---|---|---|---|
| `GET` | `/ping` | No | Returns server ID and version (used for TOFU) |
| `GET` | `/disk` | Yes | Returns disk space info |
| `POST` | `/upload` | Yes | Accepts a file upload (phone → computer) |
| `GET` | `/export/list` | Yes | Lists files available in the `export/` folder |
| `GET` | `/export/file?name=x` | Yes | Downloads one file from `export/` to the phone |
| `POST` | `/peer-transfer` | Yes | Start a Server Sync — pushes `export/` to peer servers |
| `GET` | `/peer-transfer/:id` | Yes | Poll progress of a running Server Sync |

---

## Architecture

- The phone connects **directly** to the companion server over LAN — no cloud relay, no backend.
- Credentials are stored in the **device secure enclave** (iOS Keychain / Android Keystore) using `expo-secure-store`.
- The server is plain Node.js with no framework dependencies beyond `express` and standard Node built-ins.
- The desktop shortcut embeds the backup directory path, so the correct folder is always used even if the `.env` file is missing.
