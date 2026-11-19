# LAN Backup server release files

This folder contains the companion-server source archives, their SHA-256
checksums, installation instructions, and an embeddable installation section
for the LAN Backup website.

## Contents

- `companion-server.zip` — server source package for Windows and manual installs.
- `companion-server.tar.gz` — server source package for Linux, macOS, and manual installs.
- `CHECKSUMS.txt` — checksums for both packages.
- `server-installation.md` — full installation steps for Windows, Linux, and macOS.
- `lan-backup-installation-section.html` — standalone website section inspired by
  the Home Ledger install section.

The recommended setup path is to use the OS-specific command in the installation
section. It downloads the latest companion-server release, installs/checks
Node.js as needed, creates the desktop shortcut, and starts the server. The
archives here are available for manual installation or mirroring.

## Published links

The current server archives are published in the `v1.1.0` GitHub Release:

- Windows ZIP: <https://github.com/Marcseb/lan-backup/releases/download/v1.1.0/companion-server.zip>
- Linux/macOS TAR.GZ: <https://github.com/Marcseb/lan-backup/releases/download/v1.1.0/companion-server.tar.gz>
- Release page: <https://github.com/Marcseb/lan-backup/releases/tag/v1.1.0>

The web section's install commands use the public setup scripts on the main
branch. These URLs work now and follow the current setup script:

- Windows setup script: <https://raw.githubusercontent.com/Marcseb/lan-backup/main/setup.ps1>
- Linux/macOS setup script: <https://raw.githubusercontent.com/Marcseb/lan-backup/main/setup.sh>
- Installation guide: <https://github.com/Marcseb/lan-backup/blob/main/release/server-installation.md>

The files in this folder become available at these direct URLs after the folder
is committed and pushed to GitHub:

- ZIP: <https://raw.githubusercontent.com/Marcseb/lan-backup/main/release/companion-server.zip>
- TAR.GZ: <https://raw.githubusercontent.com/Marcseb/lan-backup/main/release/companion-server.tar.gz>
- Checksums: <https://raw.githubusercontent.com/Marcseb/lan-backup/main/release/CHECKSUMS.txt>

The HTML section uses the fixed `v1.1.0` release URLs above for optional manual
downloads, so those links work now and the download and checksum version stays
explicit. The repository-file URLs are alternatives after this folder is pushed.

## Store URL placeholders

The section's Android APK button and embedded QR code point to the currently
uploaded v1.1.0 APK asset. Replace `{{LAN_BACKUP_GOOGLE_PLAY_URL}}` with the
published Play Store listing URL when it is available. Replace
`{{LAN_BACKUP_APP_STORE_URL}}` only if an iOS store listing is published. Until
then, those store links stay disabled.

## Rebuilding the archive files

From the repository root, run:

```bash
bash release/build-server-archives.sh
```

This only creates local archives and checksums. It does not upload or publish
anything to GitHub.
