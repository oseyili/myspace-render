# =========================================================
# BACKEND WINDOW — FIX BROKEN PYTHON FILE
# CONTEXT: Windows PowerShell
# =========================================================

# Press Ctrl+C if backend is running

$ErrorActionPreference = "Stop"

cd C:\frontend\hotel-booking-app\backend

# Overwrite with CLEAN Python ONLY (no PowerShell inside)

@'
from fastapi import FastAPI, Query
from fastapi.middleware.cors import CORSMiddleware
from math import ceil
import hashlib

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

COUNTRY_ALIASES = {
    "usa": "United States",
    "us": "United States",
}

COUNTRIES = {
    "United States": {
        "total": 128760,
        "currency": "USD",
        "locations": {
            "Florida": ["Miami", "Orlando", "Tampa", "Fort Lauderdale"],
            "California": ["Los Angeles", "San Francisco", "San Diego"],
            "New York": ["New York City", "Buffalo"],
        },
    }
}

def normalize_country(value):
    v = (value or "").lower()
    return COUNTRY_ALIASES.get(v, value.title())

def make_hotel(country, region, city, i):
    return {
        "id": f"{country}-{city}-{i}",
        "name": f"{city} Grand Hotel {i}",
        "country": country,
        "region": region,
        "city": city,
        "address": f"{city}, {region}, {country}",
        "map_query": f"{city}, {region}, {country}",
        "rating": 4.2,
        "facilities": ["wifi", "restaurant", "parking"],
        "reservation_status": "Request availability",
    }

@app.get("/api/search")
def search(country: str = "", city: str = ""):
    country = normalize_country(country)

    if country not in COUNTRIES:
        return {"total": 0, "hotels": []}

    data = COUNTRIES[country]

    hotels = []
    for region, cities in data["locations"].items():
        for c in cities:
            if city and city.lower() not in c.lower() and city.lower() not in region.lower():
                continue
            for i in range(20):
                hotels.append(make_hotel(country, region, c, i))

    return {
        "total": data["total"],
        "country": country,
        "locations": data["locations"],
        "hotels": hotels[:50],
    }
'@ | Set-Content -Path ".\hotel_app.py" -Encoding UTF8

# Restart backend locally (test before pushing)
python -m uvicorn hotel_app:app --host 127.0.0.1 --port 5050