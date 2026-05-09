# BACKEND WINDOW — Windows PowerShell
# Fix hotel_app.py so it loads .env before reading Hotelbeds keys

$ErrorActionPreference = "Stop"

cd C:\frontend\hotel-booking-app\backend

Copy-Item .\hotel_app.py ".\hotel_app.backup_load_env_fix_$(Get-Date -Format yyyyMMdd_HHmmss).py" -Force

$text = Get-Content .\hotel_app.py -Raw

if ($text -notmatch "from dotenv import load_dotenv") {
    $text = $text -replace "import os", "import os`r`nfrom dotenv import load_dotenv"
}

if ($text -notmatch "load_dotenv\(\)") {
    $text = $text -replace "from dotenv import load_dotenv", "from dotenv import load_dotenv`r`nload_dotenv()"
}

if ($text -notmatch "HTTPException") {
    $text = $text -replace "from fastapi import FastAPI", "from fastapi import FastAPI, HTTPException"
}

Set-Content .\hotel_app.py $text -Encoding UTF8

python -m py_compile .\hotel_app.py

Write-Host "Env loading fixed. Restart backend now." -ForegroundColor Green