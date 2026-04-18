from __future__ import annotations

import math
import os
from typing import Dict, List, Optional

from fastapi import FastAPI, Query
from fastapi.middleware.cors import CORSMiddleware

app = FastAPI(
    title="My Space Hotel Backend",
    docs_url="/docs",
    redoc_url="/redoc",
    openapi_url="/openapi.json",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

GOOGLE_MAPS_API_KEY = os.getenv("GOOGLE_MAPS_API_KEY", "").strip()

CITY_COUNTRY_MAP: Dict[str, str] = {
    "london": "United Kingdom",
    "manchester": "United Kingdom",
    "paris": "France",
    "lyon": "France",
    "new york": "United States",
    "los angeles": "United States",
    "dubai": "United Arab Emirates",
    "abu dhabi": "United Arab Emirates",
    "lagos": "Nigeria",
    "abuja": "Nigeria",
    "rome": "Italy",
    "milan": "Italy",
    "madrid": "Spain",
    "barcelona": "Spain",
}

CITY_COORDS: Dict[str, Dict[str, float]] = {
    "london": {"lat": 51.5074, "lng": -0.1278},
    "manchester": {"lat": 53.4808, "lng": -2.2426},
    "paris": {"lat": 48.8566, "lng": 2.3522},
    "lyon": {"lat": 45.7640, "lng": 4.8357},
    "new york": {"lat": 40.7128, "lng": -74.0060},
    "los angeles": {"lat": 34.0522, "lng": -118.2437},
    "dubai": {"lat": 25.2048, "lng": 55.2708},
    "abu dhabi": {"lat": 24.4539, "lng": 54.3773},
    "lagos": {"lat": 6.5244, "lng": 3.3792},
    "abuja": {"lat": 9.0765, "lng": 7.3986},
    "rome": {"lat": 41.9028, "lng": 12.4964},
    "milan": {"lat": 45.4642, "lng": 9.1900},
    "madrid": {"lat": 40.4168, "lng": -3.7038},
    "barcelona": {"lat": 41.3851, "lng": 2.1734},
}

FALLBACK_IMAGES = [
    "https://images.unsplash.com/photo-1566073771259-6a8506099945?auto=format&fit=crop&w=1600&q=80",
    "https://images.unsplash.com/photo-1551882547-ff40c63fe5fa?auto=format&fit=crop&w=1600&q=80",
    "https://images.unsplash.com/photo-1501117716987-c8e1ecb210ea?auto=format&fit=crop&w=1600&q=80",
    "https://images.unsplash.com/photo-1522798514-97ceb8c4f1c8?auto=format&fit=crop&w=1600&q=80",
    "https://images.unsplash.com/photo-1445019980597-93fa8acb246c?auto=format&fit=crop&w=1600&q=80",
    "https://images.unsplash.com/photo-1455587734955-081b22074882?auto=format&fit=crop&w=1600&q=80",
]

HOTEL_PREFIXES = [
    "Grand",
    "Royal",
    "Central",
    "Premier",
    "Elite",
    "Signature",
    "Imperial",
    "Harbour",
    "Skyline",
    "Regency",
    "Majestic",
    "Urban",
    "City",
    "Boutique",
    "Crown",
    "Plaza",
    "Heritage",
    "Garden",
    "Riverside",
    "Landmark",
]

HOTEL_SUFFIXES = [
    "Hotel",
    "Suites",
    "Residence",
    "Inn",
    "Resort",
    "Plaza",
    "Palace",
    "Lodge",
    "Stay",
    "Apartments",
]

AREAS = [
    "Central",
    "Riverside",
    "Airport",
    "Downtown",
    "Marina",
    "West End",
    "City Centre",
    "Waterfront",
    "Business District",
    "Old Town",
]

FACILITY_POOL = [
    "Free WiFi",
    "Breakfast included",
    "Parking",
    "Gym",
    "Swimming pool",
    "Airport shuttle",
    "Family rooms",
    "Free cancellation",
]


def normalize(value: Optional[str]) -> str:
    return (value or "").strip()


def guess_country(city: str, country: str) -> str:
    if normalize(country):
        return normalize(country)
    return CITY_COUNTRY_MAP.get(city.strip().lower(), "United Kingdom")


def get_coords(city: str) -> Dict[str, float]:
    return CITY_COORDS.get(city.strip().lower(), {"lat": 51.5074, "lng": -0.1278})


def make_hotel(city: str, country: str, index: int) -> Dict:
    coords = get_coords(city)
    prefix = HOTEL_PREFIXES[index % len(HOTEL_PREFIXES)]
    suffix = HOTEL_SUFFIXES[index % len(HOTEL_SUFFIXES)]
    area = AREAS[index % len(AREAS)]
    image = FALLBACK_IMAGES[index % len(FALLBACK_IMAGES)]

    lat = round(coords["lat"] + ((index % 9) - 4) * 0.01, 6)
    lng = round(coords["lng"] + ((index % 11) - 5) * 0.01, 6)

    facilities = [
        FACILITY_POOL[index % len(FACILITY_POOL)],
        FACILITY_POOL[(index + 2) % len(FACILITY_POOL)],
        FACILITY_POOL[(index + 4) % len(FACILITY_POOL)],
    ]

    price = 75 + (index % 17) * 11
    rating = round(3.6 + ((index % 14) * 0.1), 1)
    if rating > 4.9:
        rating = 4.9

    return {
        "id": f"{city.lower().replace(' ', '-')}-{index + 1}",
        "name": f"{prefix} {city} {suffix} {index + 1}",
        "city": city,
        "country": country,
        "location": area,
        "address": f"{index + 10} {area}, {city}, {country}",
        "price": price,
        "rating": rating,
        "image": image,
        "lat": lat,
        "lng": lng,
        "facilities": facilities,
        "summary": f"{prefix} {city} {suffix} near {area} with flexible stay options.",
    }


def build_city_inventory(city: str, country: str) -> List[Dict]:
    city = city or "London"
    country = guess_country(city, country)

    count_map = {
        "london": 2400,
        "paris": 1800,
        "new york": 2000,
        "dubai": 1500,
        "lagos": 900,
        "rome": 1200,
        "madrid": 1100,
        "barcelona": 1100,
        "manchester": 700,
        "abuja": 500,
    }

    target_count = count_map.get(city.strip().lower(), 600)
    return [make_hotel(city, country, i) for i in range(target_count)]


@app.get("/")
def root():
    return {"message": "Backend is LIVE"}


@app.get("/api/test")
def api_test():
    return {"status": "API working"}


@app.get("/api/maps-config")
def maps_config():
    return {"googleMapsApiKey": GOOGLE_MAPS_API_KEY}


@app.get("/api/hotels")
def search_hotels(
    destination: str = Query("", description="Destination text"),
    country: str = Query("", description="Country"),
    city: str = Query("", description="City"),
    location: str = Query("", description="Location / area"),
    facilities: str = Query("", description="Comma-separated facilities"),
    page: int = Query(1, ge=1),
    page_size: int = Query(24, ge=1, le=60),
):
    requested_city = normalize(city) or normalize(destination) or normalize(location) or "London"
    requested_country = guess_country(requested_city, country)
    requested_location = normalize(location).lower()

    inventory = build_city_inventory(requested_city, requested_country)

    selected_facilities = [
        item.strip().lower()
        for item in facilities.split(",")
        if item.strip()
    ]

    filtered: List[Dict] = []
    for hotel in inventory:
        matches_location = True
        if requested_location:
            hay = f"{hotel['location']} {hotel['address']} {hotel['city']}".lower()
            matches_location = requested_location in hay

        matches_facilities = True
        if selected_facilities:
            hotel_facilities = [x.lower() for x in hotel["facilities"]]
            matches_facilities = all(item in hotel_facilities for item in selected_facilities)

        if matches_location and matches_facilities:
            filtered.append(hotel)

    total = len(filtered)
    start = (page - 1) * page_size
    end = start + page_size
    items = filtered[start:end]
    has_more = end < total

    message = (
        f"Showing page {page}. Found {total} hotel results for {requested_city}, {requested_country}."
        if total > 0
        else f"No matching hotels were found for {requested_city}."
    )

    return {
        "items": items,
        "page": page,
        "page_size": page_size,
        "total": total,
        "has_more": has_more,
        "message": message,
        "detail": "" if total > 0 else message,
    }