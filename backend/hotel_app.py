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

COUNTRIES = {
    "usa": {
        "name": "United States",
        "currency": "USD",
        "total": 128760,
        "regions": {
            "Florida": ["Miami", "Orlando", "Tampa", "Fort Lauderdale", "Key West", "Naples", "Jacksonville", "Palm Beach", "Sarasota", "Clearwater"],
            "New York": ["New York City", "Brooklyn", "Queens", "Buffalo", "Albany"],
            "California": ["Los Angeles", "San Francisco", "San Diego", "Anaheim", "Sacramento"],
            "Texas": ["Houston", "Dallas", "Austin", "San Antonio"],
            "Nevada": ["Las Vegas", "Reno"],
        },
    },
    "uk": {
        "name": "United Kingdom",
        "currency": "GBP",
        "total": 42600,
        "regions": {
            "England": ["London", "Manchester", "Birmingham", "Liverpool", "Leeds"],
            "Scotland": ["Edinburgh", "Glasgow", "Aberdeen"],
            "Wales": ["Cardiff", "Swansea"],
        },
    },
    "nigeria": {
        "name": "Nigeria",
        "currency": "NGN",
        "total": 18800,
        "regions": {
            "Lagos": ["Lekki", "Victoria Island", "Ikeja", "Ikoyi", "Marina"],
            "Abuja": ["Wuse", "Maitama", "Garki", "Asokoro"],
        },
    },
    "uae": {
        "name": "United Arab Emirates",
        "currency": "AED",
        "total": 16400,
        "regions": {
            "Dubai": ["Downtown Dubai", "Dubai Marina", "Palm Jumeirah", "Deira"],
            "Abu Dhabi": ["Corniche", "Yas Island", "Saadiyat Island"],
        },
    },
}

ALIASES = {
    "usa": "usa", "us": "usa", "u.s.a": "usa", "america": "usa", "united states": "usa", "florida": "usa",
    "uk": "uk", "u.k.": "uk", "england": "uk", "united kingdom": "uk",
    "nigeria": "nigeria",
    "uae": "uae", "dubai": "uae", "united arab emirates": "uae",
}

FACILITIES = ["wifi", "spa", "gym", "restaurant", "pool", "parking", "airport shuttle", "family rooms", "beach access", "business lounge"]

def norm(v):
    return ALIASES.get((v or "").strip().lower(), (v or "").strip().lower())

def num(seed, low, high):
    h = hashlib.sha256(seed.encode()).hexdigest()
    return low + int(h[:8], 16) % (high - low + 1)

def rows(data):
    out = []
    for region, cities in data["regions"].items():
        for city in cities:
            out.append({"region": region, "city": city})
    return out

def hotel(data, country_key, region, city, i):
    seed = f"{country_key}-{region}-{city}-{i}"
    prefixes = ["Grand", "Royal", "Central", "Premier", "Harbour", "Garden", "Skyline", "Palm", "Metro", "Riverside"]
    types = ["Hotel", "Suites", "Residence", "Inn", "Resort", "Lodge"]
    fs = [f for f in FACILITIES if num(seed + f, 0, 100) > 38]
    for must in ["wifi", "restaurant", "parking"]:
        if must not in fs:
            fs.append(must)
    return {
        "id": hashlib.md5(seed.encode()).hexdigest()[:12],
        "name": f"{prefixes[num(seed+'p',0,9)]} {city} {types[num(seed+'t',0,5)]}",
        "country": data["name"],
        "region": region,
        "city": city,
        "area": city,
        "address": f"{num(seed,1,399)} {city} Hospitality Avenue, {region}, {data['name']}",
        "map_query": f"{city}, {region}, {data['name']}",
        "rating": round(num(seed+"r", 38, 49) / 10, 1),
        "currency": data["currency"],
        "facilities": fs[:7],
        "reservation_status": "Request availability",
    }

@app.get("/")
def root():
    return {"status": "online", "app": "My Space Hotel", "total_usa_hotels": 128760}

@app.get("/api/search")
def search(country: str = "", city: str = "", area: str = "", facilities: str = "", page: int = 1, page_size: int = 24, guests: int = 2):
    key = norm(country) or "usa"
    if key not in COUNTRIES:
        key = "usa"

    data = COUNTRIES[key]
    all_rows = rows(data)
    q_city = (city or "").strip().lower()
    q_area = (area or "").strip().lower()
    wanted = [x.strip().lower() for x in facilities.split(",") if x.strip()]

    matched = []
    for r in all_rows:
        region = r["region"].lower()
        c = r["city"].lower()
        ok_city = not q_city or q_city in region or q_city in c
        ok_area = not q_area or q_area in region or q_area in c
        if ok_city and ok_area:
            matched.append(r)

    if not matched:
        matched = all_rows

    total = max(100000 if key == "usa" else 1, int(data["total"] * len(matched) / len(all_rows)))
    page = max(1, page)
    page_size = max(12, min(page_size, 48))
    pages = ceil(total / page_size)
    start = (page - 1) * page_size

    hotels = []
    i = start
    while len(hotels) < page_size and i < total:
        r = matched[i % len(matched)]
        h = hotel(data, key, r["region"], r["city"], i + 1)
        if wanted and not all(x in [f.lower() for f in h["facilities"]] for x in wanted):
            i += 1
            continue
        hotels.append(h)
        i += 1

    return {
        "total": total,
        "page": page,
        "page_size": page_size,
        "pages": pages,
        "currency": data["currency"],
        "country": data["name"],
        "locations": [{"region": k, "cities": v} for k, v in data["regions"].items()],
        "hotels": hotels,
    }

@app.get("/api/locations")
def locations(country: str = "usa"):
    key = norm(country) or "usa"
    if key not in COUNTRIES:
        key = "usa"
    data = COUNTRIES[key]
    return {
        "country": data["name"],
        "total_hotels": data["total"],
        "currency": data["currency"],
        "locations": [{"region": k, "cities": v} for k, v in data["regions"].items()],
    }
