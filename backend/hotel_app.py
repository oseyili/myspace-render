# =========================================================
# BACKEND WINDOW — COMPLETE REPLACE hotel_app.py
# CONTEXT: Windows PowerShell
# =========================================================

# Press Ctrl+C first in this backend window if the server is running.
# If asked "Terminate batch job (Y/N)?", type Y and press Enter.

$ErrorActionPreference = "Stop"

cd C:\frontend\hotel-booking-app\backend

@'
from fastapi import FastAPI, Query
from fastapi.middleware.cors import CORSMiddleware
from math import ceil
import hashlib

app = FastAPI(title="My Space Hotel API")

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
    "u.s.a": "United States",
    "u.s.": "United States",
    "america": "United States",
    "united states": "United States",
    "uk": "United Kingdom",
    "u.k.": "United Kingdom",
    "england": "United Kingdom",
    "united kingdom": "United Kingdom",
    "uae": "United Arab Emirates",
}

COUNTRIES = {
    "United States": {
        "total": 128760,
        "currency": "USD",
        "locations": {
            "Florida": ["Miami", "Orlando", "Tampa", "Fort Lauderdale", "Key West", "Naples", "Jacksonville"],
            "New York": ["New York City", "Brooklyn", "Queens", "Buffalo", "Albany"],
            "California": ["Los Angeles", "San Francisco", "San Diego", "Anaheim", "Sacramento"],
            "Nevada": ["Las Vegas", "Reno", "Henderson"],
            "Texas": ["Houston", "Dallas", "Austin", "San Antonio"],
        },
    },
    "United Kingdom": {
        "total": 42600,
        "currency": "GBP",
        "locations": {
            "England": ["London", "Manchester", "Birmingham", "Liverpool", "Leeds"],
            "Scotland": ["Edinburgh", "Glasgow", "Aberdeen"],
            "Wales": ["Cardiff", "Swansea"],
        },
    },
    "Nigeria": {
        "total": 18800,
        "currency": "NGN",
        "locations": {
            "Lagos": ["Lekki", "Victoria Island", "Ikeja", "Ikoyi", "Marina"],
            "Abuja": ["Wuse", "Maitama", "Garki", "Asokoro"],
        },
    },
    "United Arab Emirates": {
        "total": 16400,
        "currency": "AED",
        "locations": {
            "Dubai": ["Downtown Dubai", "Marina", "Palm Jumeirah", "Deira"],
            "Abu Dhabi": ["Corniche", "Yas Island", "Saadiyat Island"],
        },
    },
}

FACILITIES = ["wifi", "spa", "gym", "restaurant", "pool", "parking", "airport shuttle", "family rooms", "beach access", "business lounge"]

def normalize_country(value: str):
    v = (value or "").strip().lower()
    return COUNTRY_ALIASES.get(v, value.strip().title() if value else "")

def hotel_score(seed: str, low: int, high: int):
    digest = hashlib.sha256(seed.encode("utf-8")).hexdigest()
    return low + (int(digest[:8], 16) % (high - low + 1))

def all_locations(country_data):
    rows = []
    for region, cities in country_data["locations"].items():
        for city in cities:
            rows.append({"region": region, "city": city})
    return rows

def make_hotel(country, region, city, n):
    name_styles = ["Grand", "Central", "Royal", "Harbour", "Garden", "Skyline", "Riverside", "Palm", "Metro", "Premier"]
    stay_styles = ["Hotel", "Suites", "Residence", "Inn", "Resort", "Lodge"]
    seed = f"{country}-{region}-{city}-{n}"
    a = name_styles[hotel_score(seed + "a", 0, len(name_styles)-1)]
    b = stay_styles[hotel_score(seed + "b", 0, len(stay_styles)-1)]
    rating = round(hotel_score(seed + "r", 36, 49) / 10, 1)
    chosen = [f for i, f in enumerate(FACILITIES) if hotel_score(seed + f, 0, 100) > 47]
    if "wifi" not in chosen:
        chosen.insert(0, "wifi")
    return {
        "id": hashlib.md5(seed.encode("utf-8")).hexdigest()[:12],
        "name": f"{a} {city} {b}",
        "country": country,
        "region": region,
        "city": city,
        "area": city,
        "rating": rating,
        "currency": COUNTRIES[country]["currency"],
        "facilities": chosen[:7],
        "address": f"{hotel_score(seed, 1, 299)} {city} Hospitality Avenue, {region}, {country}",
        "map_query": f"{city}, {region}, {country}",
        "reservation_status": "Request availability",
    }

@app.get("/")
def root():
    return {"status": "online", "app": "My Space Hotel"}

@app.get("/api/locations")
def locations(country: str = Query("")):
    clean = normalize_country(country)
    if clean not in COUNTRIES:
        return {"country": clean, "total_hotels": 0, "currency": "", "locations": []}
    data = COUNTRIES[clean]
    return {
        "country": clean,
        "total_hotels": data["total"],
        "currency": data["currency"],
        "locations": [
            {"region": region, "cities": cities}
            for region, cities in data["locations"].items()
        ],
    }

@app.get("/api/search")
def search(
    country: str = Query(""),
    city: str = Query(""),
    area: str = Query(""),
    guests: int = Query(2),
    facilities: str = Query(""),
    page: int = Query(1),
    page_size: int = Query(24),
):
    clean_country = normalize_country(country)
    wanted_city = (city or "").strip().lower()
    wanted_area = (area or "").strip().lower()
    wanted_facilities = [x.strip().lower() for x in facilities.split(",") if x.strip()]

    if clean_country not in COUNTRIES:
        return {"total": 0, "page": page, "page_size": page_size, "pages": 0, "currency": "", "hotels": [], "locations": []}

    data = COUNTRIES[clean_country]
    locs = all_locations(data)

    matching_locs = []
    for loc in locs:
        region_l = loc["region"].lower()
        city_l = loc["city"].lower()
        if wanted_city and wanted_city not in city_l and wanted_city not in region_l:
            continue
        if wanted_area and wanted_area not in city_l and wanted_area not in region_l:
            continue
        matching_locs.append(loc)

    if not matching_locs:
        matching_locs = locs

    base_total = max(1, int(data["total"] * (len(matching_locs) / max(1, len(locs)))))
    page_size = max(6, min(page_size, 48))
    page = max(1, page)
    pages = ceil(base_total / page_size)
    start = (page - 1) * page_size

    hotels = []
    i = start
    while len(hotels) < page_size and i < base_total:
        loc = matching_locs[i % len(matching_locs)]
        hotel = make_hotel(clean_country, loc["region"], loc["city"], i + 1)
        if wanted_facilities:
            hotel_facilities = [f.lower() for f in hotel["facilities"]]
            if not all(f in hotel_facilities for f in wanted_facilities):
                i += 1
                continue
        hotels.append(hotel)
        i += 1

    return {
        "total": base_total,
        "page": page,
        "page_size": page_size,
        "pages": pages,
        "currency": data["currency"],
        "country": clean_country,
        "locations": [{"region": r, "cities": c} for r, c in data["locations"].items()],
        "hotels": hotels,
    }
'@ | Set-Content -Path ".\hotel_app.py" -Encoding UTF8

python -m uvicorn hotel_app:app --host 127.0.0.1 --port 5050