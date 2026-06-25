# LAN Backup — Setup (Windows)
#
# Place this file in the folder where you want the companion server to live
# (e.g. C:\Users\You\LAN_backup), then right-click it and choose
# "Run with PowerShell".
#
# If Windows shows a blue security warning, click "Open anyway".
# If PowerShell refuses to run scripts, open PowerShell as Administrator and run:
#   Set-ExecutionPolicy -Scope CurrentUser RemoteSigned
# then try again.
#
# What this does:
#   1. Downloads the companion server from GitHub.
#   2. Extracts it into a "companion-server" sub-folder here.
#   3. Installs Node.js if needed, then starts the server.

$ErrorActionPreference = "Stop"

$ReleaseUrl  = "https://github.com/Marcseb/lan-backup/releases/latest/download/companion-server.zip"
$DestDir     = Split-Path -Parent $MyInvocation.MyCommand.Definition
$ZipPath     = Join-Path $DestDir "companion-server.zip"
$ServerDir   = Join-Path $DestDir "companion-server"
$InstallScript = Join-Path $ServerDir "install.ps1"

Write-Host ""
Write-Host "╔══════════════════════════════════════════════╗"
Write-Host "║        LAN Backup — Setup (Windows)         ║"
Write-Host "╚══════════════════════════════════════════════╝"
Write-Host ""

# ── Already installed? ────────────────────────────────────────────────────────
if (Test-Path (Join-Path $ServerDir "server.js")) {
    Write-Host "  ✅  Companion server already installed."
    Write-Host "      Starting it now..."
    Write-Host ""
    & $InstallScript
    exit
}

# ── Download ──────────────────────────────────────────────────────────────────
Write-Host "  Downloading companion server..."

try {
    # Use TLS 1.2+ (required by GitHub)
    [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
    Invoke-WebRequest -Uri $ReleaseUrl -OutFile $ZipPath -UseBasicParsing
} catch {
    Write-Host ""
    Write-Host "  ❌  Download failed: $_"
    Write-Host "      Check your internet connection and try again."
    Write-Host ""
    Read-Host "  Press Enter to close"
    exit 1
}

Write-Host "  ✅  Download complete."

# ── Extract ───────────────────────────────────────────────────────────────────
Write-Host "  Extracting..."

try {
    Expand-Archive -Path $ZipPath -DestinationPath $DestDir -Force
} catch {
    Write-Host ""
    Write-Host "  ❌  Extraction failed: $_"
    Write-Host ""
    Remove-Item -Path $ZipPath -ErrorAction SilentlyContinue
    Read-Host "  Press Enter to close"
    exit 1
}

Remove-Item -Path $ZipPath -ErrorAction SilentlyContinue
Write-Host "  ✅  Extracted to: $ServerDir"
Write-Host ""

# ── Run installer ─────────────────────────────────────────────────────────────
& $InstallScript
