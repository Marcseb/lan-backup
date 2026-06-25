#!/usr/bin/env bash
# LAN Backup — Setup (Linux & macOS)
#
# Place this file in the folder where you want the companion server to live
# (e.g. ~/LAN_backup), then run:
#
#   bash setup.sh
#
# What this does:
#   1. Downloads the companion server from GitHub.
#   2. Extracts it into a "companion-server" sub-folder here.
#   3. Installs Node.js if needed, then starts the server.

set -e

RELEASE_URL="https://github.com/Marcseb/lan-backup/releases/latest/download/companion-server.zip"
DEST_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

echo ""
echo "╔══════════════════════════════════════════════╗"
echo "║       LAN Backup — Setup (Linux / macOS)    ║"
echo "╚══════════════════════════════════════════════╝"
echo ""

# ── Check for already-installed companion server ──────────────────────────────
if [[ -f "$DEST_DIR/companion-server/server.js" ]]; then
  echo "  ✅  Companion server already installed."
  echo "      Starting it now..."
  echo ""
  exec bash "$DEST_DIR/companion-server/install.sh"
fi

# ── Download ──────────────────────────────────────────────────────────────────
echo "  Downloading companion server..."

if command -v curl &>/dev/null; then
  curl -fsSL "$RELEASE_URL" -o "$DEST_DIR/companion-server.zip"
elif command -v wget &>/dev/null; then
  wget -q "$RELEASE_URL" -O "$DEST_DIR/companion-server.zip"
else
  echo ""
  echo "  ❌  Neither curl nor wget found."
  echo "      Please install one of them and try again."
  echo ""
  exit 1
fi

echo "  ✅  Download complete."

# ── Extract ───────────────────────────────────────────────────────────────────
echo "  Extracting..."

if command -v unzip &>/dev/null; then
  unzip -q "$DEST_DIR/companion-server.zip" -d "$DEST_DIR"
else
  # Fallback: use Python (available on virtually every Linux/macOS system)
  if command -v python3 &>/dev/null; then
    python3 -c "import zipfile, sys; zipfile.ZipFile(sys.argv[1]).extractall(sys.argv[2])" \
      "$DEST_DIR/companion-server.zip" "$DEST_DIR"
  elif command -v python &>/dev/null; then
    python -c "import zipfile, sys; zipfile.ZipFile(sys.argv[1]).extractall(sys.argv[2])" \
      "$DEST_DIR/companion-server.zip" "$DEST_DIR"
  else
    echo ""
    echo "  ❌  Could not find unzip or python to extract the archive."
    echo "      Please install unzip and try again:  sudo apt install unzip"
    echo ""
    rm -f "$DEST_DIR/companion-server.zip"
    exit 1
  fi
fi

rm -f "$DEST_DIR/companion-server.zip"
echo "  ✅  Extracted to: $DEST_DIR/companion-server"

# ── Run installer ─────────────────────────────────────────────────────────────
echo ""
exec bash "$DEST_DIR/companion-server/install.sh"
