$ErrorActionPreference = "Continue"

$backend = "C:\frontend\hotel-booking-app\backend"
$data = Join-Path $backend "data"
$backupRoot = "D:\MySpaceHotelBackups\live-rates-continuous"

if (!(Test-Path $backupRoot)) {
    New-Item -ItemType Directory -Path $backupRoot | Out-Null
}

while ($true) {

    cd $backend

    Write-Host ""
    Write-Host "======================================" -ForegroundColor Cyan
    Write-Host "MYSPACE HOTEL LIVE RATE GROWTH CYCLE" -ForegroundColor Yellow
    Write-Host "======================================" -ForegroundColor Cyan
    Write-Host ""

    node live-rate-harvester.js

    cd $data

    $stamp = Get-Date -Format "yyyyMMdd-HHmmss"

    $json = Join-Path $data "live_rate_cache.json"
    $gz = Join-Path $data "live_rate_cache.json.gz"

    $backupFolder = Join-Path $backupRoot $stamp

    if (!(Test-Path $json)) {
        Write-Host "live_rate_cache.json missing." -ForegroundColor Red
        Start-Sleep -Seconds 300
        continue
    }

    New-Item -ItemType Directory -Path $backupFolder -Force | Out-Null

    Write-Host "Backing up JSON to D drive..." -ForegroundColor Yellow

    Copy-Item $json (Join-Path $backupFolder "live_rate_cache.json") -Force

    Write-Host "Compressing cache..." -ForegroundColor Yellow

    node compress-cache.js

    if (Test-Path $gz) {

        Copy-Item $gz (Join-Path $backupFolder "live_rate_cache.json.gz") -Force

        Copy-Item $gz (Join-Path $backupRoot "LATEST_live_rate_cache.json.gz") -Force
    }

    Copy-Item $json (Join-Path $backupRoot "LATEST_live_rate_cache.json") -Force

    $jsonMB = [math]::Round((Get-Item $json).Length / 1MB, 2)

    $gzMB = 0

    if (Test-Path $gz) {
        $gzMB = [math]::Round((Get-Item $gz).Length / 1MB, 2)
    }

    Write-Host ""
    Write-Host "======================================" -ForegroundColor Green
    Write-Host "LIVE RATE CYCLE COMPLETE" -ForegroundColor Green
    Write-Host "======================================" -ForegroundColor Green
    Write-Host ""

    Write-Host ("JSON MB: " + $jsonMB) -ForegroundColor Yellow
    Write-Host ("GZ MB: " + $gzMB) -ForegroundColor Cyan
    Write-Host ("Backup folder: " + $backupFolder) -ForegroundColor Green

    Write-Host ""
    Write-Host "Waiting 10 minutes before next harvest cycle..." -ForegroundColor Yellow

    Start-Sleep -Seconds 600
}
