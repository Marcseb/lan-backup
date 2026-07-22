# LAN Backup - Companion Server Installer (Windows)
#
# What this script does:
#   1. Checks whether Node.js is installed; installs it if not.
#   2. Starts the companion server.
#   3. On first run the server generates a secure token automatically,
#      saves it to .env, and prints it for you to copy into the app.
#
# How to run:
#   Open PowerShell in this folder and run:
#   powershell.exe -ExecutionPolicy Bypass -File install.ps1
#
# Requirements: internet connection (only needed if Node.js must be installed)

$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path

Write-Host ""
Write-Host "=============================================="
Write-Host "   LAN Backup -- Server Setup (Windows)"
Write-Host "=============================================="
Write-Host ""

# -- Check / install Node.js --------------------------------------------------

function Refresh-NodePath {
    # Re-read Machine + User PATH from the registry and apply to this session
    $machinePath = [System.Environment]::GetEnvironmentVariable("PATH", "Machine")
    $userPath    = [System.Environment]::GetEnvironmentVariable("PATH", "User")
    $env:PATH    = "$machinePath;$userPath"

    # winget sometimes installs to a versioned sub-folder that isn't yet in the
    # registry PATH.  Probe the two most common locations and add them if needed.
    $candidates = @(
        "$env:ProgramFiles\nodejs",
        "${env:ProgramFiles(x86)}\nodejs",
        "$env:LOCALAPPDATA\Programs\nodejs"
    )
    foreach ($dir in $candidates) {
        if ((Test-Path "$dir\node.exe") -and ($env:PATH -notlike "*$dir*")) {
            $env:PATH = "$dir;$env:PATH"
        }
    }
}

function Install-NodeViaWinget {
    Write-Host "  Installing Node.js via winget..."
    # Use --source winget explicitly to avoid the msstore certificate error
    # (0x8a15005e) that occurs on some corporate / restricted networks.
    winget install OpenJS.NodeJS.LTS `
        --source winget `
        --accept-source-agreements `
        --accept-package-agreements `
        --silent
    Refresh-NodePath
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

    Refresh-NodePath
}

$nodeFound = $null -ne (Get-Command node -ErrorAction SilentlyContinue)

if ($nodeFound) {
    $nodeVer = node --version
    Write-Host "  [OK] Node.js $nodeVer is already installed."
} else {
    Write-Host "  [!] Node.js not found - installing now..."
    Write-Host ""
    $wingetFound = $null -ne (Get-Command winget -ErrorAction SilentlyContinue)
    if ($wingetFound) {
        try {
            Install-NodeViaWinget
        } catch {
            Write-Host "  [!] winget failed, falling back to direct download..."
            Install-NodeViaMsi
        }
    } else {
        Install-NodeViaMsi
    }

    # Verify node is now reachable
    $nodeCmd = Get-Command node -ErrorAction SilentlyContinue
    if ($null -eq $nodeCmd) {
        Write-Host ""
        Write-Host "  [!] Node.js was installed but could not be found in PATH."
        Write-Host "      Please close this window, reopen PowerShell, and run install.ps1 again."
        Write-Host ""
        Read-Host "  Press Enter to close"
        exit 1
    }

    $nodeVer = node --version
    Write-Host ""
    Write-Host "  [OK] Node.js $nodeVer installed successfully."
}

Write-Host ""
Write-Host "-------------------------------------------------"
Write-Host "  Starting LAN Backup server..."
Write-Host "  Press Ctrl+C to stop."
Write-Host "-------------------------------------------------"
Write-Host ""

node "$ScriptDir\server.js"

# Keep the window open if the user double-clicked the script
Write-Host ""
Write-Host "Server stopped. Press any key to close this window..."
$null = $Host.UI.RawUI.ReadKey("NoEcho,IncludeKeyDown")
