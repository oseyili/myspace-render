from fastapi import FastAPI, Query
from fastapi.middleware.cors import CORSMiddleware
from math import ceil
import hashlib

app = FastAPI(title="My Space Hotel Backend")

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
    "dubai": "United Arab Emirates",
    "nigeria": "Nigeria",
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
            "Dubai": ["Downtown Dubai", "Dubai Marina", "Palm Jumeirah", "Deira"],
            "Abu Dhabi": ["Corniche", "Yas Island", "Saadiyat Island"],
        },
    },
}

FACILITIES = [
    "wifi",
    "spa",
    "gym",
    "restaurant",
    "pool",
    "parking",
    "airport shuttle",
    "family rooms",
    "beach access",
    "business lounge",
]

def normalize_country(value: str) -> str:
    raw = (value or "").strip()
    lower = raw.lower()
    return COUNTRY_ALIASES.get(lower, raw.title())

def stable_number(seed: str, low: int, high: int) -> int:
    digest = hashlib.sha256(seed.encode("utf-8")).hexdigest()
    return low + (int(digest[:8], 16) % (high - low + 1))

def all_locations(country_data):
    rows = []
    for region, cities in country_data["locations"].items():
        for city in cities:
            rows.append({"region": region, "city": city})
    return rows

def make_hotel(country: str, region: str, city: str, index: int):
    seed = f"{country}-{region}-{city}-{index}"
    prefixes = ["Grand", "Royal", "Central", "Premier", "Harbour", "Garden", "Skyline", "Palm", "Metro", "Riverside"]
    types = ["Hotel", "Suites", "Residence", "Inn", "Resort", "Lodge"]

    prefix = prefixes[stable_number(seed + "prefix", 0, len(prefixes) - 1)]
    stay_type = types[stable_number(seed + "type", 0, len(types) - 1)]

    hotel_facilities = []
    for item in FACILITIES:
        if stable_number(seed + item, 0, 100) > 40:
            hotel_facilities.append(item)

    if "wifi" not in hotel_facilities:
        hotel_facilities.insert(0, "wifi")
    if "restaurant" not in hotel_facilities:
        hotel_facilities.append("restaurant")
    if "parking" not in hotel_facilities:
        hotel_facilities.append("parking")

    return {
        "id": hashlib.md5(seed.encode("utf-8")).hexdigest()[:12],
        "name": f"{prefix} {city} {stay_type}",
        "country": country,
        "region": region,
        "city": city,
        "area": city,
        "address": f"{stable_number(seed, 1, 299)} {city} Hospitality Avenue, {region}, {country}",
        "map_query": f"{city}, {region}, {country}",
        "rating": round(stable_number(seed + "rating", 38, 49) / 10, 1),
        "currency": COUNTRIES[country]["currency"],
        "facilities": hotel_facilities[:7],
        "reservation_status": "Request availability",
    }

@app.get("/")
def root():
    return {
        "status": "online",
        "app": "My Space Hotel",
        "message": "Backend is running",
    }

@app.get("/api/health")
def health():
    return {"status": "ok"}

@app.get("/api/locations")
def locations(country: str = Query("")):
    clean_country = normalize_country(country)

    if clean_country not in COUNTRIES:
        return {
            "country": clean_country,
            "total_hotels": 0,
            "currency": "",
            "locations": [],
        }

    data = COUNTRIES[clean_country]

    return {
        "country": clean_country,
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

    if clean_country not in COUNTRIES:
        return {
            "total": 0,
            "page": 1,
            "page_size": page_size,
            "pages": 0,
            "currency": "",
            "country": clean_country,
            "locations": [],
            "hotels": [],
        }

    data = COUNTRIES[clean_country]
    location_rows = all_locations(data)

    wanted_city = (city or "").strip().lower()
    wanted_area = (area or "").strip().lower()
    wanted_facilities = [x.strip().lower() for x in facilities.split(",") if x.strip()]

    matched_locations = []

    for loc in location_rows:
        region_lower = loc["region"].lower()
        city_lower = loc["city"].lower()

        city_ok = True
        area_ok = True

        if wanted_city:
            city_ok = wanted_city in city_lower or wanted_city in region_lower

        if wanted_area:
            area_ok = wanted_area in city_lower or wanted_area in region_lower

        if city_ok and area_ok:
            matched_locations.append(loc)

    if not matched_locations:
        matched_locations = location_rows

    total = max(1, int(data["total"] * (len(matched_locations) / max(1, len(location_rows)))))
    page = max(1, page)
    page_size = max(6, min(page_size, 48))
    pages = ceil(total / page_size)
    start = (page - 1) * page_size

    hotels = []
    i = start

    while len(hotels) < page_size and i < total:
        loc = matched_locations[i % len(matched_locations)]
        hotel = make_hotel(clean_country, loc["region"], loc["city"], i + 1)

        if wanted_facilities:
            hotel_facilities = [f.lower() for f in hotel["facilities"]]
            if not all(f in hotel_facilities for f in wanted_facilities):
                i += 1
                continue

        hotels.append(hotel)
        i += 1

    return {
        "total": total,
        "page": page,
        "page_size": page_size,
        "pages": pages,
        "currency": data["currency"],
        "country": clean_country,
        "locations": [
            {"region": region, "cities": cities}
            for region, cities in data["locations"].items()
        ],
        "hotels": hotels,
    }
