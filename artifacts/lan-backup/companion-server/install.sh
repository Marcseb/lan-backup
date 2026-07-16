#!/usr/bin/env bash
# LAN Backup — Companion Server Installer (Linux & macOS)
#
# What this script does:
#   1. Checks whether Node.js is installed; installs it if not.
#   2. Starts the companion server.
#   3. On first run the server generates a secure token automatically,
#      saves it to .env, and prints it for you to copy into the app.
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
    echo "  Installing Node.js via Homebrew..."
    brew install node
  else
    echo "  Homebrew not found — installing it first (takes a few minutes)..."
    /bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"
    if [[ -f /opt/homebrew/bin/brew ]]; then
      eval "$(/opt/homebrew/bin/brew shellenv)"
    elif [[ -f /usr/local/bin/brew ]]; then
      eval "$(/usr/local/bin/brew shellenv)"
    fi
    echo ""
    echo "  Installing Node.js via Homebrew..."
    brew install node
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
    echo "  ❌  Could not detect your package manager."
    echo "      Please install Node.js manually from https://nodejs.org"
    echo "      then run:  node server.js"
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

echo ""
echo "─────────────────────────────────────────────────"
echo "  Starting LAN Backup server..."
echo "  Press Ctrl+C to stop."
echo "─────────────────────────────────────────────────"
echo ""

exec node "$SCRIPT_DIR/server.js"
