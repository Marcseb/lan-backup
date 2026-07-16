# LAN Backup - Setup (Windows)
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

# NOTE: no $ErrorActionPreference = "Stop" here - we handle errors explicitly
# so the window stays open on failure and the user can read the message.

$ReleaseUrl = "https://github.com/Marcseb/lan-backup/releases/latest/download/companion-server.zip"

# Resolve the folder this script lives in.
$DestDir = Split-Path -Parent $MyInvocation.MyCommand.Definition
if ([string]::IsNullOrEmpty($DestDir)) { $DestDir = (Get-Location).Path }

$ZipPath       = Join-Path $DestDir "companion-server.zip"
$ServerDir     = Join-Path $DestDir "companion-server"
$InstallScript = Join-Path $ServerDir "install.ps1"

function Bail($msg) {
    Write-Host ""
    Write-Host "  ERROR: $msg" -ForegroundColor Red
    Write-Host ""
    Read-Host "  Press Enter to close"
    exit 1
}

Write-Host ""
Write-Host "=============================================="
Write-Host "   LAN Backup -- Setup (Windows)"
Write-Host "=============================================="
Write-Host ""
Write-Host "  Backup folder : $DestDir"
Write-Host ""

# Pass the backup folder to the server so it is written to .env on first run.
$env:LB_BACKUP_DIR = $DestDir

# -- Already installed? -------------------------------------------------------
if (Test-Path (Join-Path $ServerDir "server.js")) {
    Write-Host "  Companion server already installed."
    Write-Host "  Starting it now..."
    Write-Host ""
    Get-ChildItem $ServerDir -ErrorAction SilentlyContinue | Unblock-File -ErrorAction SilentlyContinue
    powershell.exe -ExecutionPolicy Bypass -File $InstallScript
    exit
}

# -- Download -----------------------------------------------------------------
Write-Host "  Downloading companion server..."

try {
    [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
} catch {
    # Not fatal - proceed with the default TLS setting
}

try {
    Invoke-WebRequest -Uri $ReleaseUrl -OutFile $ZipPath -UseBasicParsing -ErrorAction Stop
} catch {
    Bail "Download failed: $_  Check your internet connection and try again."
}

if (-not (Test-Path $ZipPath)) {
    Bail "Download appeared to succeed but companion-server.zip was not saved to $ZipPath - check write permissions."
}

Write-Host "  Download complete."

# -- Extract ------------------------------------------------------------------
Write-Host "  Extracting..."

try {
    Expand-Archive -Path $ZipPath -DestinationPath $DestDir -Force -ErrorAction Stop
} catch {
    Remove-Item -Path $ZipPath -ErrorAction SilentlyContinue
    Bail "Extraction failed: $_"
}

Remove-Item -Path $ZipPath -ErrorAction SilentlyContinue

if (-not (Test-Path $InstallScript)) {
    Bail "Extraction finished but install.ps1 was not found at $InstallScript - the zip may be corrupt, delete the companion-server folder and try again."
}

Write-Host "  Extracted to: $ServerDir"

# -- Unblock extracted files --------------------------------------------------
# Files from a downloaded zip carry a Windows "internet zone" mark that
# causes PowerShell to block them. Unblock-File removes that mark.
Write-Host "  Unblocking extracted files..."
Get-ChildItem $ServerDir -ErrorAction SilentlyContinue | Unblock-File -ErrorAction SilentlyContinue
Write-Host ""

# -- Run installer ------------------------------------------------------------
# -ExecutionPolicy Bypass ensures the script runs even if Unblock-File
# was not sufficient (e.g. restricted group policy).
powershell.exe -ExecutionPolicy Bypass -File $InstallScript
