#!/usr/bin/env bash
# LAN Backup - Setup (Linux & macOS)
#
# Quickest install -- paste this into a terminal:
#
#   mkdir -p ~/LAN_backup && cd ~/LAN_backup && \
#   curl -fsSL https://raw.githubusercontent.com/Marcseb/lan-backup/main/setup.sh | bash
#
# What this does:
#   1. Downloads the companion server from GitHub.
#   2. Extracts it into a "companion-server" sub-folder here.
#   3. Installs Node.js if needed, then starts the server.
#   4. Sets the backup directory to THIS folder (where you ran the command).
#   5. Creates a desktop shortcut so you can start the server with one click.

set -e

RELEASE_URL="https://github.com/Marcseb/lan-backup/releases/latest/download/companion-server.tar.gz"

# Capture the working directory *before* any cd.
# Works both when piped via "curl | bash" and when run as "bash setup.sh".
SETUP_DIR="$(pwd)"
DEST_DIR="$SETUP_DIR"

echo ""
echo "LAN Backup -- Setup (Linux / macOS)"
echo "======================================"
echo ""
echo "  Backup folder : $SETUP_DIR"
echo ""

# -- Desktop shortcut ---------------------------------------------------------
# Always (re)creates the shortcut so that reinstalls or moves to a new folder
# update the shortcut to the correct path.
create_shortcut() {
  local OS
  OS="$(uname -s)"

  # Resolve the Desktop folder (respects XDG on Linux).
  local DESKTOP="${XDG_DESKTOP_DIR:-$HOME/Desktop}"

  if [[ "$OS" == "Darwin" ]]; then
    # macOS: a .command file is double-clickable in Finder and opens Terminal.
    local SHORTCUT="$DESKTOP/Start LAN Backup Server.command"
    if [[ -d "$DESKTOP" ]]; then
      cat > "$SHORTCUT" << ENDSCRIPT
#!/usr/bin/env bash
cd "$SETUP_DIR"
bash companion-server/install.sh
ENDSCRIPT
      chmod +x "$SHORTCUT"
      echo "  Desktop shortcut created/updated:"
      echo "  $SHORTCUT"
    fi

  elif [[ "$OS" == "Linux" ]]; then
    # Linux: XDG .desktop file -- recognised by GNOME, KDE, XFCE, etc.
    # Uses "bash -lc" (login shell) so ~/.bash_profile is sourced and NVM /
    # other Node version managers are on PATH.
    # LB_BACKUP_DIR is embedded directly so the correct folder is always used,
    # even if .env is missing or was regenerated.
    local SHORTCUT="$DESKTOP/lan-backup-server.desktop"
    if [[ -d "$DESKTOP" ]]; then
      cat > "$SHORTCUT" << ENDDESKTOP
[Desktop Entry]
Type=Application
Name=LAN Backup Server
Comment=Start the LAN Backup companion server
Exec=bash -lc "cd '$SETUP_DIR' && LB_BACKUP_DIR='$SETUP_DIR' bash companion-server/install.sh; exec bash"
Terminal=true
Icon=network-server
Categories=Network;
ENDDESKTOP
      chmod +x "$SHORTCUT"
      echo "  Desktop shortcut created/updated:"
      echo "  $SHORTCUT"
    fi
  fi
}

# -- Check for already-installed companion server -----------------------------
if [[ -f "$DEST_DIR/companion-server/server.js" ]]; then
  echo "  Existing installation found — downloading latest version..."
  echo ""

  if command -v curl &>/dev/null; then
    curl -fsSL "$RELEASE_URL" -o "$DEST_DIR/companion-server.tar.gz"
  elif command -v wget &>/dev/null; then
    wget -q "$RELEASE_URL" -O "$DEST_DIR/companion-server.tar.gz"
  else
    echo "  ERROR: Neither curl nor wget found. Please install one and try again."
    exit 1
  fi

  # Extract over the existing folder; .env is not in the archive so it survives.
  tar -xzf "$DEST_DIR/companion-server.tar.gz" -C "$DEST_DIR"
  rm -f "$DEST_DIR/companion-server.tar.gz"
  echo "  Updated to latest version."
  echo ""

  if [[ -f "$DEST_DIR/companion-server/.env" ]]; then
    echo "  ✅  Auth token preserved from companion-server/.env"
  else
    echo "  ℹ️   No .env found — the server will ask you to set an auth token now."
  fi
  echo ""
  create_shortcut
  export LB_BACKUP_DIR="$SETUP_DIR"
  # Use </dev/tty so the first-run prompt works even when piped via "curl | bash".
  exec bash "$DEST_DIR/companion-server/install.sh" </dev/tty
fi

# -- Download -----------------------------------------------------------------
echo "  Downloading companion server..."

if command -v curl &>/dev/null; then
  curl -fsSL "$RELEASE_URL" -o "$DEST_DIR/companion-server.tar.gz"
elif command -v wget &>/dev/null; then
  wget -q "$RELEASE_URL" -O "$DEST_DIR/companion-server.tar.gz"
else
  echo ""
  echo "  ERROR: Neither curl nor wget found."
  echo "         Please install one of them and try again."
  echo ""
  exit 1
fi

echo "  Download complete."

# -- Extract ------------------------------------------------------------------
echo "  Extracting..."
tar -xzf "$DEST_DIR/companion-server.tar.gz" -C "$DEST_DIR"
rm -f "$DEST_DIR/companion-server.tar.gz"
echo "  Extracted to: $DEST_DIR/companion-server"

# Remove any leftover .env from a previous install attempt.
# tar only writes the files in the archive — it leaves pre-existing files
# like .env untouched — so without this step a stale token would survive
# what the user expects to be a completely fresh install.
if [[ -f "$DEST_DIR/companion-server/.env" ]]; then
  rm -f "$DEST_DIR/companion-server/.env"
  echo "  (Removed previous .env — a new auth token will be created now.)"
fi

# -- Create desktop shortcut --------------------------------------------------
create_shortcut

# -- Run installer (pass backup dir so it is saved to .env on first run) ------
echo ""
export LB_BACKUP_DIR="$SETUP_DIR"
# Use </dev/tty so the first-run prompt works even when piped via "curl | bash".
exec bash "$DEST_DIR/companion-server/install.sh" </dev/tty
