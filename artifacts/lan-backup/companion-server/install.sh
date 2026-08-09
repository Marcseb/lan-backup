#!/usr/bin/env bash
# LAN Backup — Companion Server Installer (Linux & macOS)
#
# What this script does:
#   1. Checks whether Node.js is installed; installs it if not.
#   2. On first run, asks you to choose an auth token (in bash, so it works
#      reliably even when started via "curl | bash").
#   3. Starts the companion server.
#
# Usage:
#   bash install.sh
#
# Requirements: internet connection (only needed if Node.js must be installed)

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

echo ""
echo "LAN Backup -- Server Setup (Linux / macOS)"
echo "============================================="
echo ""

# -- Load Node.js from common version managers --------------------------------
# Needed when the script is launched from a desktop shortcut or cron job
# where ~/.bashrc / ~/.bash_profile is not sourced automatically.

# NVM (most common on Linux)
export NVM_DIR="${NVM_DIR:-$HOME/.nvm}"
if [ -s "$NVM_DIR/nvm.sh" ]; then
  # shellcheck disable=SC1091
  . "$NVM_DIR/nvm.sh"
fi

# nodenv
if [ -d "$HOME/.nodenv/bin" ]; then
  export PATH="$HOME/.nodenv/bin:$PATH"
  eval "$(nodenv init -)" 2>/dev/null || true
fi

# fnm (Fast Node Manager)
if [ -d "$HOME/.local/share/fnm" ]; then
  export PATH="$HOME/.local/share/fnm:$PATH"
  eval "$(fnm env)" 2>/dev/null || true
fi

# Homebrew on macOS (Apple Silicon and Intel)
for brew_path in /opt/homebrew/bin /usr/local/bin; do
  if [ -x "$brew_path/brew" ]; then
    eval "$("$brew_path/brew" shellenv)" 2>/dev/null || true
    break
  fi
done

# -- Helpers ------------------------------------------------------------------

need_sudo() {
  if command -v sudo &>/dev/null; then echo sudo; else echo ""; fi
}

# -- Node.js installation -----------------------------------------------------

install_node_macos() {
  if command -v brew &>/dev/null; then
    # Homebrew is already installed — node is one small formula, no extra tools needed.
    echo "  Installing Node.js via Homebrew (~50 MB)..."
    brew install node
  else
    # Homebrew is NOT installed.  Installing it from scratch pulls in Xcode
    # Command Line Tools (~7-8 GB) — a huge download just to get Node.js.
    # Instead, use the official Node.js .pkg installer: ~30 MB download,
    # ~150 MB installed, no Xcode or Homebrew required at all.
    local ARCH PKG_ARCH LTS_DIR PKG_FILE
    ARCH="$(uname -m)"
    [[ "$ARCH" == "arm64" ]] && PKG_ARCH="arm64" || PKG_ARCH="x64"
    LTS_DIR="https://nodejs.org/dist/latest-v22.x"

    echo "  Installing official Node.js LTS from nodejs.org"
    echo "  (~30 MB download — no Homebrew or Xcode Command Line Tools needed)"
    echo ""

    # Scrape the directory listing for the matching .pkg filename.
    PKG_FILE=$(curl -fsSL "$LTS_DIR/" \
      | grep -o "\"node-v[0-9.]*-darwin-${PKG_ARCH}\.pkg\"" \
      | head -1 \
      | tr -d '"')

    if [[ -z "$PKG_FILE" ]]; then
      echo ""
      echo "  ⚠️   Could not detect the Node.js package filename automatically."
      echo "      Please install Node.js LTS manually:"
      echo "        1. Open https://nodejs.org/en/download/ in your browser"
      echo "        2. Download the macOS .pkg installer"
      echo "        3. Run it, then re-run this script"
      echo ""
      exit 1
    fi

    echo "  Downloading $PKG_FILE ..."
    curl -fsSL "$LTS_DIR/$PKG_FILE" -o /tmp/lan_backup_node.pkg

    echo "  Installing Node.js (you may be prompted for your Mac login password)..."
    sudo installer -pkg /tmp/lan_backup_node.pkg -target /
    rm -f /tmp/lan_backup_node.pkg
    echo ""
  fi
}

install_node_linux() {
  SUDO=$(need_sudo)
  if command -v apt-get &>/dev/null; then
    echo "  Installing Node.js via apt (NodeSource LTS)..."
    curl -fsSL https://deb.nodesource.com/setup_lts.x | $SUDO bash -
    $SUDO apt-get install -y nodejs
  elif command -v dnf &>/dev/null; then
    echo "  Installing Node.js via dnf..."
    $SUDO dnf install -y nodejs npm
  elif command -v pacman &>/dev/null; then
    echo "  Installing Node.js via pacman..."
    $SUDO pacman -S --noconfirm nodejs npm
  elif command -v zypper &>/dev/null; then
    echo "  Installing Node.js via zypper..."
    $SUDO zypper install -y nodejs
  else
    echo ""
    echo "  ERROR: Could not detect your package manager."
    echo "         Please install Node.js manually from https://nodejs.org"
    echo "         then run:  node server.js"
    echo ""
    exit 1
  fi
}

if command -v node &>/dev/null; then
  NODE_VER=$(node --version)
  echo "  ✅  Node.js $NODE_VER is already installed."
else
  echo "  ⚠️   Node.js not found — installing now..."
  echo ""
  if [[ "$OSTYPE" == "darwin"* ]]; then
    install_node_macos
  else
    install_node_linux
  fi
  echo ""
  echo "  ✅  Node.js $(node --version) installed successfully."
fi

# -- First-run token setup (bash-level) ---------------------------------------
# Done here in bash rather than in server.js so that "read </dev/tty" works
# reliably even when this script was launched via a pipe ("curl ... | bash").
# server.js still has a fallback firstRunSetup() for direct "node server.js"
# invocations, but install.sh is the canonical path and handles it here.

ENV_FILE="$SCRIPT_DIR/.env"

if [[ ! -f "$ENV_FILE" ]]; then
  echo ""
  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
  echo "  LAN Backup — First-time Setup"
  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
  echo ""
  echo "  Choose an auth token for this server."
  echo "  You will copy it into the app once — then it is saved."
  echo ""
  echo "  [1]  Generate a secure random token  (recommended)"
  echo "  [2]  Enter my own token"
  echo ""
  printf "  Your choice (1 or 2, default 1): "
  read -r CHOICE </dev/tty || CHOICE=""

  if [[ "$CHOICE" == "2" ]]; then
    LB_TOKEN_VALUE=""
    while [[ -z "$LB_TOKEN_VALUE" ]]; do
      printf "\n  Enter your token: "
      read -r LB_TOKEN_VALUE </dev/tty || LB_TOKEN_VALUE=""
      if [[ -z "$LB_TOKEN_VALUE" ]]; then
        echo "  Token cannot be empty — please try again."
      fi
    done
  else
    LB_TOKEN_VALUE=$(node -e "process.stdout.write(require('crypto').randomBytes(16).toString('hex'))")
    echo ""
    echo "  Generating random token..."
  fi

  # Write .env
  {
    echo "# LAN Backup companion server — configuration"
    echo "# Auto-generated: $(date -u +%Y-%m-%d 2>/dev/null || date +%Y-%m-%d)"
    echo "#"
    echo "# IMPORTANT: copy LB_TOKEN into the LAN Backup app"
    echo "#            Open the app -> Settings tab -> Auth Token field"
    echo "#"
    echo "LB_TOKEN=$LB_TOKEN_VALUE"
    echo ""
    echo "# Optional -- remove the # to change a default:"
    echo "# LB_PORT=7823"
    if [[ -n "${LB_BACKUP_DIR:-}" ]]; then
      echo "LB_BACKUP_DIR=$LB_BACKUP_DIR"
    else
      echo "# LB_BACKUP_DIR=$HOME/LAN-Backup"
    fi
  } > "$ENV_FILE"

  echo ""
  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
  echo "  Token saved!  Copy it into the app now."
  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
  echo ""
  echo "  App -> Settings tab -> Auth Token field"
  echo ""
  echo "  Token:  $LB_TOKEN_VALUE"
  echo ""
  echo "  This is shown only once. To view it later:"
  echo "  open $ENV_FILE and look for LB_TOKEN"
  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
  echo ""
fi

echo ""
echo "─────────────────────────────────────────────────"
echo "  Starting LAN Backup server..."
echo "  Press Ctrl+C to stop."
echo "─────────────────────────────────────────────────"
echo ""

exec node "$SCRIPT_DIR/server.js"
