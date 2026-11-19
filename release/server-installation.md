# LAN Backup companion server installation

Install the companion server on each computer that should receive phone backups
or participate in computer-to-computer sync. Install the LAN Backup app
separately on the phone.

## Before starting

- Keep the phone and computer on the same local Wi-Fi or trusted LAN.
- Run the setup command as your normal desktop user, not as Administrator or
  `root`. The installer may ask for permission only if it needs to install
  Node.js through the operating system's package manager.
- The computer must stay awake and the server process must remain running while
  transferring files.
- Do not expose the server port to the public internet or configure router port
  forwarding.

The setup command downloads the current server package from GitHub. It installs
or checks Node.js when needed, asks to generate an authentication token on first
run, and creates the desktop shortcut.

## Windows 10/11

1. Open **PowerShell** (a normal, non-Administrator window).
2. Copy and run:

   ```powershell
   New-Item -ItemType Directory -Force "$HOME\LAN_backup" | Out-Null; Set-Location "$HOME\LAN_backup"; Invoke-WebRequest -Uri "https://raw.githubusercontent.com/Marcseb/lan-backup/main/setup.ps1" -OutFile ".\setup.ps1"; powershell.exe -ExecutionPolicy Bypass -File ".\setup.ps1"
   ```

3. The setup downloads and extracts the companion server to
   `%USERPROFILE%\LAN_backup\companion-server`. It checks for Node.js and
   installs it if required, then starts the server.
4. On first start, copy the generated authentication token from the PowerShell
   window into **LAN Backup → Settings → Auth Token**. The token is saved in
   `companion-server\.env`; keep it private.
5. The installer creates **Start LAN Backup Server** on the Desktop, using the
   LAN Backup icon. Double-click it to start the server later. A terminal window
   stays open while it is running; press **Ctrl+C** to stop it.

The setup script downloads the latest ZIP from the GitHub Releases page. For a
manual archive download, use:
<https://github.com/Marcseb/lan-backup/releases/download/v1.1.0/companion-server.zip>

## Linux

1. Open **Terminal**.
2. Copy and run:

   ```bash
   mkdir -p "$HOME/LAN_backup" && cd "$HOME/LAN_backup" && curl -fsSL https://raw.githubusercontent.com/Marcseb/lan-backup/main/setup.sh | bash
   ```

3. The setup downloads and extracts the companion server to
   `~/LAN_backup/companion-server`. If Node.js is missing, setup uses the
   supported package manager for the Linux distribution and may ask for your
   password. The server then starts in the Terminal.
4. On first start, copy the generated authentication token into
   **LAN Backup → Settings → Auth Token**. It is saved in
   `~/LAN_backup/companion-server/.env`; keep it private.
5. The installer creates **Start LAN Backup Server** on the Desktop, with the
   LAN Backup icon. Depending on the desktop environment, you may need to
   right-click it and choose **Allow Launching**. Opening it starts a Terminal
   window; press **Ctrl+C** to stop the server.

The setup script downloads the latest TAR.GZ from the GitHub Releases page. For
a manual archive download, use:
<https://github.com/Marcseb/lan-backup/releases/download/v1.1.0/companion-server.tar.gz>

## macOS

1. Open **Terminal**.
2. Copy and run:

   ```bash
   mkdir -p "$HOME/LAN_backup" && cd "$HOME/LAN_backup" && curl -fsSL https://raw.githubusercontent.com/Marcseb/lan-backup/main/setup.sh | bash
   ```

3. The setup downloads and extracts the companion server to
   `~/LAN_backup/companion-server`. If Node.js is missing, it uses Homebrew when
   available; otherwise it downloads the official Node.js installer. The server
   starts in Terminal.
4. On first start, copy the generated authentication token into
   **LAN Backup → Settings → Auth Token**. It is saved in
   `~/LAN_backup/companion-server/.env`; keep it private.
5. The installer creates **Start LAN Backup Server** on the Desktop as a
   clickable app with the LAN Backup icon. Opening it launches Terminal and
   starts the server; press **Ctrl+C** in Terminal to stop it.

The setup script downloads the latest TAR.GZ from the GitHub Releases page. For
a manual archive download, use:
<https://github.com/Marcseb/lan-backup/releases/download/v1.1.0/companion-server.tar.gz>

## Connect the phone

1. Start the server from its Desktop shortcut.
2. Enter the server address and authentication token in the phone app, or use
   LAN discovery when available.
3. If discovery or transfers are blocked, allow the server through the computer
   firewall on the trusted private network only. The installer does not change
   firewall rules.

The server listens on port `7823` by default. The app and computer need network
access to each other; internet access alone does not make a server reachable
through a router or guest Wi-Fi isolation.

## Updating or reinstalling

Run the same setup command again from the same `LAN_backup` folder. The setup
downloads the latest server archive. Existing configuration in
`companion-server/.env`, including the authentication token, is kept when an
existing installation is updated. Stop the server before updating.

## Manual source archives

- ZIP: <https://github.com/Marcseb/lan-backup/releases/download/v1.1.0/companion-server.zip>
- TAR.GZ: <https://github.com/Marcseb/lan-backup/releases/download/v1.1.0/companion-server.tar.gz>
- Checksums: <https://github.com/Marcseb/lan-backup/releases/download/v1.1.0/CHECKSUMS.txt>
- Source repository: <https://github.com/Marcseb/lan-backup>
