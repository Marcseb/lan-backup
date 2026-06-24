# LAN Backup — Companion Server Installer (Windows)
#
# What this script does:
#   1. Checks whether Node.js is installed; installs it if not.
#   2. Starts the companion server.
#   3. On first run the server generates a secure token automatically,
#      saves it to .env, and prints it for you to copy into the app.
#
# How to run:
#   Right-click this file → "Run with PowerShell"
#   If Windows shows a security warning, click "Open" or "Run anyway".
#
# Requirements: internet connection (only needed if Node.js must be installed)

$ErrorActionPreference = "Stop"
$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path

Write-Host ""
Write-Host "╔════════════════════════════════════════════╗"
Write-Host "║   LAN Backup — Server Setup (Windows)     ║"
Write-Host "╚════════════════════════════════════════════╝"
Write-Host ""

# ── Check / install Node.js ───────────────────────────────────────────────────

function Install-NodeViaWinget {
    Write-Host "  Installing Node.js via winget..."
    winget install OpenJS.NodeJS.LTS `
        --accept-source-agreements `
        --accept-package-agreements `
        --silent
    # Refresh PATH so node is available in this session
    $env:PATH = [System.Environment]::GetEnvironmentVariable("PATH", "Machine") + ";" +
                [System.Environment]::GetEnvironmentVariable("PATH", "User")
}

function Install-NodeViaMsi {
    $version = "20.19.0"
    $arch = if ([System.Environment]::Is64BitOperatingSystem) { "x64" } else { "x86" }
    $url = "https://nodejs.org/dist/v$version/node-v$version-$arch.msi"
    $installer = "$env:TEMP\node-installer.msi"

    Write-Host "  Downloading Node.js $version from nodejs.org..."
    Invoke-WebRequest -Uri $url -OutFile $installer -UseBasicParsing

    Write-Host "  Installing (this may take a moment)..."
    Start-Process msiexec.exe -Wait -ArgumentList "/i `"$installer`" /quiet /norestart"
    Remove-Item $installer -Force

    # Refresh PATH
    $env:PATH = [System.Environment]::GetEnvironmentVariable("PATH", "Machine") + ";" +
                [System.Environment]::GetEnvironmentVariable("PATH", "User")
}

$nodeFound = $null -ne (Get-Command node -ErrorAction SilentlyContinue)

if ($nodeFound) {
    $nodeVer = (node --version)
    Write-Host "  [OK] Node.js $nodeVer is already installed."
} else {
    Write-Host "  [!] Node.js not found — installing now..."
    Write-Host ""
    $wingetFound = $null -ne (Get-Command winget -ErrorAction SilentlyContinue)
    if ($wingetFound) {
        try { Install-NodeViaWinget } catch { Install-NodeViaMsi }
    } else {
        Install-NodeViaMsi
    }
    Write-Host ""
    Write-Host "  [OK] Node.js $(node --version) installed successfully."
}

Write-Host ""
Write-Host "─────────────────────────────────────────────────"
Write-Host "  Starting LAN Backup server..."
Write-Host "  Press Ctrl+C to stop."
Write-Host "─────────────────────────────────────────────────"
Write-Host ""

node "$ScriptDir\server.js"

# Keep the window open if the user double-clicked the script
Write-Host ""
Write-Host "Server stopped. Press any key to close this window..."
$null = $Host.UI.RawUI.ReadKey("NoEcho,IncludeKeyDown")
