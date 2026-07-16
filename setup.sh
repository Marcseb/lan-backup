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

# -- Desktop shortcut ----------------------------------------------------------
# Creates a one-click launcher on the Desktop so the user never needs to
# remember the terminal command to restart the server.
create_shortcut() {
  local OS
  OS="$(uname -s)"

  # Resolve the Desktop folder (respects XDG on Linux).
  local DESKTOP="${XDG_DESKTOP_DIR:-$HOME/Desktop}"

  if [[ "$OS" == "Darwin" ]]; then
    # macOS: a .command file is double-clickable in Finder and opens Terminal.
    local SHORTCUT="$DESKTOP/Start LAN Backup Server.command"
    if [[ ! -f "$SHORTCUT" ]]; then
      if [[ -d "$DESKTOP" ]]; then
        cat > "$SHORTCUT" << ENDSCRIPT
#!/usr/bin/env bash
cd "$SETUP_DIR"
bash companion-server/install.sh
ENDSCRIPT
        chmod +x "$SHORTCUT"
        echo "  Desktop shortcut created:"
        echo "  $SHORTCUT"
      fi
    fi

  elif [[ "$OS" == "Linux" ]]; then
    # Linux: XDG .desktop file -- recognised by GNOME, KDE, XFCE, etc.
    local SHORTCUT="$DESKTOP/lan-backup-server.desktop"
    if [[ ! -f "$SHORTCUT" ]]; then
      if [[ -d "$DESKTOP" ]]; then
        cat > "$SHORTCUT" << ENDDESKTOP
[Desktop Entry]
Type=Application
Name=LAN Backup Server
Comment=Start the LAN Backup companion server
Exec=bash -c "cd '$SETUP_DIR' && bash companion-server/install.sh; exec bash"
Terminal=true
Icon=network-server
Categories=Network;
ENDDESKTOP
        chmod +x "$SHORTCUT"
        echo "  Desktop shortcut created:"
        echo "  $SHORTCUT"
      fi
    fi
  fi
}

# -- Check for already-installed companion server ------------------------------
if [[ -f "$DEST_DIR/companion-server/server.js" ]]; then
  echo "  Companion server already installed."
  echo "  Starting it now..."
  echo ""
  create_shortcut
  export LB_BACKUP_DIR="$SETUP_DIR"
  exec bash "$DEST_DIR/companion-server/install.sh"
fi

# -- Download ------------------------------------------------------------------
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

# -- Extract -------------------------------------------------------------------
echo "  Extracting..."
tar -xzf "$DEST_DIR/companion-server.tar.gz" -C "$DEST_DIR"
rm -f "$DEST_DIR/companion-server.tar.gz"
echo "  Extracted to: $DEST_DIR/companion-server"

# -- Create desktop shortcut --------------------------------------------------
create_shortcut

# -- Run installer (pass backup dir so it is saved to .env on first run) ------
echo ""
export LB_BACKUP_DIR="$SETUP_DIR"
exec bash "$DEST_DIR/companion-server/install.sh"
