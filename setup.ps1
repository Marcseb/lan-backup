# LAN Backup — Setup (Windows)
#
# Place this file in the folder where you want backups to be saved
# (e.g. C:\LAN_backup), then right-click it and choose
# "Run with PowerShell".
#
# Or paste this into a PowerShell window:
#   mkdir C:\LAN_backup; cd C:\LAN_backup
#   Invoke-WebRequest -Uri https://raw.githubusercontent.com/Marcseb/lan-backup/main/setup.ps1 -OutFile setup.ps1; .\setup.ps1
#
# What this does:
#   1. Downloads the companion server from GitHub.
#   2. Extracts it into a "companion-server" sub-folder here.
#   3. Installs Node.js if needed, then starts the server.
#   4. Sets the backup directory to THIS folder (where setup.ps1 lives).

$ErrorActionPreference = "Stop"

# Keep the window open on any unexpected error so the user can read it.
trap {
    Write-Host ""
    Write-Host "  ERROR: $_" -ForegroundColor Red
    Write-Host ""
    Read-Host "  Press Enter to close"
    exit 1
}

$ReleaseUrl    = "https://github.com/Marcseb/lan-backup/releases/latest/download/companion-server.zip"
$DestDir       = Split-Path -Parent $MyInvocation.MyCommand.Definition
if (-not $DestDir) { $DestDir = $PWD.Path }   # fallback when run from a pipe
$ZipPath       = Join-Path $DestDir "companion-server.zip"
$ServerDir     = Join-Path $DestDir "companion-server"
$InstallScript = Join-Path $ServerDir "install.ps1"

Write-Host ""
Write-Host "╔══════════════════════════════════════════════╗"
Write-Host "║        LAN Backup — Setup (Windows)         ║"
Write-Host "╚══════════════════════════════════════════════╝"
Write-Host ""
Write-Host "  Backup folder : $DestDir"
Write-Host ""

# Pass the backup folder to the server so it is written to .env on first run.
$env:LB_BACKUP_DIR = $DestDir

# ── Already installed? ────────────────────────────────────────────────────────
if (Test-Path (Join-Path $ServerDir "server.js")) {
    Write-Host "  Companion server already installed."
    Write-Host "  Starting it now..."
    Write-Host ""
    # Unblock in case Windows re-marks files after an update
    Get-ChildItem $ServerDir | Unblock-File -ErrorAction SilentlyContinue
    powershell.exe -ExecutionPolicy Bypass -File $InstallScript
    exit
}

# ── Download ──────────────────────────────────────────────────────────────────
Write-Host "  Downloading companion server..."

try {
    [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
    Invoke-WebRequest -Uri $ReleaseUrl -OutFile $ZipPath -UseBasicParsing
} catch {
    Write-Host ""
    Write-Host "  ERROR: Download failed: $_" -ForegroundColor Red
    Write-Host "         Check your internet connection and try again."
    Write-Host ""
    Read-Host "  Press Enter to close"
    exit 1
}

Write-Host "  Download complete."

# ── Extract ───────────────────────────────────────────────────────────────────
Write-Host "  Extracting..."

try {
    Expand-Archive -Path $ZipPath -DestinationPath $DestDir -Force
} catch {
    Write-Host ""
    Write-Host "  ERROR: Extraction failed: $_" -ForegroundColor Red
    Write-Host ""
    Remove-Item -Path $ZipPath -ErrorAction SilentlyContinue
    Read-Host "  Press Enter to close"
    exit 1
}

Remove-Item -Path $ZipPath -ErrorAction SilentlyContinue
Write-Host "  Extracted to: $ServerDir"

# ── Unblock extracted files ───────────────────────────────────────────────────
# Files from a downloaded zip are tagged by Windows as internet-zone and blocked
# by PowerShell's execution policy.  Unblock-File removes that tag.
Write-Host "  Unblocking extracted files..."
Get-ChildItem $ServerDir | Unblock-File -ErrorAction SilentlyContinue
Write-Host ""

# ── Run installer ─────────────────────────────────────────────────────────────
# Use -ExecutionPolicy Bypass so Windows cannot block the script even if
# Unblock-File was insufficient (e.g. restricted group policy).
powershell.exe -ExecutionPolicy Bypass -File $InstallScript
