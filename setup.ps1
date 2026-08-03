# LAN Backup - Setup (Windows)
#
# Paste this into a PowerShell window to install in your home folder:
#   mkdir ~\LAN_backup; cd ~\LAN_backup; Invoke-WebRequest -Uri https://raw.githubusercontent.com/Marcseb/lan-backup/main/setup.ps1 -OutFile setup.ps1; powershell.exe -ExecutionPolicy Bypass -File setup.ps1
#
# Replace ~\LAN_backup with any folder you prefer, e.g. ~\Desktop\LAN_backup
#
# What this does:
#   1. Downloads the companion server from GitHub.
#   2. Extracts it into a "companion-server" sub-folder here.
#   3. Installs Node.js if needed, then starts the server.
#   4. Sets the backup directory to THIS folder (where setup.ps1 lives).
#   5. Creates a desktop shortcut so you can start the server with one click.

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

# Creates a desktop shortcut (.lnk) that re-runs this setup.ps1.
# Safe to call multiple times -- skips silently if the shortcut already exists.
function Create-Shortcut {
    $DesktopPath = [Environment]::GetFolderPath("Desktop")
    if ([string]::IsNullOrEmpty($DesktopPath) -or -not (Test-Path $DesktopPath)) { return }

    $ShortcutPath = Join-Path $DesktopPath "LAN Backup Server.lnk"
    if (Test-Path $ShortcutPath) { return }

    try {
        $WshShell  = New-Object -ComObject WScript.Shell
        $Shortcut  = $WshShell.CreateShortcut($ShortcutPath)
        $Shortcut.TargetPath      = "powershell.exe"
        $Shortcut.Arguments       = "-ExecutionPolicy Bypass -File `"$DestDir\setup.ps1`""
        $Shortcut.WorkingDirectory = $DestDir
        $Shortcut.Description     = "Start LAN Backup companion server"
        $Shortcut.IconLocation    = "shell32.dll,22"
        $Shortcut.Save()
        Write-Host "  Desktop shortcut created:"
        Write-Host "  $ShortcutPath"
    } catch {
        Write-Host "  (Could not create desktop shortcut: $_)"
    }
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

# -- Already installed? Re-download to get the latest version. ----------------
if (Test-Path (Join-Path $ServerDir "server.js")) {
    Write-Host "  Existing installation found -- downloading latest version..."
    Write-Host ""

    try {
        [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
    } catch { }

    try {
        Invoke-WebRequest -Uri $ReleaseUrl -OutFile $ZipPath -UseBasicParsing -ErrorAction Stop
    } catch {
        Bail "Download failed: $_  Check your internet connection and try again."
    }

    # Extract over the existing folder; .env is not in the archive so it survives.
    Expand-Archive -Path $ZipPath -DestinationPath $DestDir -Force
    Remove-Item $ZipPath -Force
    Write-Host "  Updated to latest version."
    Write-Host ""

    if (Test-Path (Join-Path $ServerDir ".env")) {
        Write-Host "  OK  Auth token preserved from companion-server\.env"
    } else {
        Write-Host "  i   No .env found -- the server will ask you to set an auth token now."
    }
    Write-Host ""
    Create-Shortcut
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
Write-Host "  Unblocking extracted files..."
Get-ChildItem $ServerDir -ErrorAction SilentlyContinue | Unblock-File -ErrorAction SilentlyContinue

# -- Create desktop shortcut --------------------------------------------------
Create-Shortcut
Write-Host ""

# -- Run installer ------------------------------------------------------------
powershell.exe -ExecutionPolicy Bypass -File $InstallScript
