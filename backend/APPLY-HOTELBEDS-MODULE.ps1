# MySpace Hotel - safe apply script for modular backend Hotelbeds module
$ErrorActionPreference = "Stop"

$ProjectRoot = "C:\frontend\hotel-booking-app"
$Target = Join-Path $ProjectRoot "backend-backup-old"
$Source = Split-Path -Parent $MyInvocation.MyCommand.Path
$Stamp = Get-Date -Format "yyyyMMdd-HHmmss"
$Backup = Join-Path $ProjectRoot ("backend-backup-old-before-hotelbeds-module-" + $Stamp)

Write-Host "Stopping Node..."
taskkill /F /IM node.exe 2>$null | Out-Null

if (!(Test-Path $Target)) {
  throw "Target backend folder not found: $Target"
}
if (!(Test-Path (Join-Path $Source "server.js"))) {
  throw "Source backend folder is not valid: $Source"
}
if (!(Test-Path (Join-Path $Source "legacy\app.js"))) {
  throw "Source legacy app.js is missing. Aborting."
}

Write-Host "Backing up current backend to $Backup"
Copy-Item $Target $Backup -Recurse -Force

Write-Host "Replacing backend-backup-old contents with modular Hotelbeds backend..."
Remove-Item (Join-Path $Target "*") -Recurse -Force
Copy-Item (Join-Path $Source "*") $Target -Recurse -Force

Write-Host "Done. Starting backend..."
Set-Location $Target
node server.js
