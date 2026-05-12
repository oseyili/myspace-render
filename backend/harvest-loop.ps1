while ($true) {

  Clear-Host

  Write-Host ""
  Write-Host "=========================================" -ForegroundColor Cyan
  Write-Host "MYSPACE HOTEL LIVE HARVEST LOOP" -ForegroundColor Yellow
  Write-Host "=========================================" -ForegroundColor Cyan
  Write-Host ""

  cd "C:\frontend\hotel-booking-app\backend"

  node live-rate-harvester.js

  Write-Host ""
  Write-Host "Harvest cycle completed." -ForegroundColor Green
  Write-Host "Sleeping 10 minutes before next cycle..." -ForegroundColor Yellow
  Write-Host ""

  Start-Sleep -Seconds 600
}