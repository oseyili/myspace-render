from fastapi import FastAPI, Query
from fastapi.middleware.cors import CORSMiddleware
import os
import json
import hashlib
import urllib.parse
import urllib.request

app = FastAPI(title="My Space Hotel Global Backend")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

RAPIDAPI_KEY = os.getenv("RAPIDAPI_KEY", "").strip()
RAPIDAPI_HOST = os.getenv("RAPIDAPI_HOST", "booking-com.p.rapidapi.com").strip()

COUNTRY_ALIASES = {
    "usa": "United States", "us": "United States", "america": "United States", "united states": "United States",
    "uk": "United Kingdom", "england": "United Kingdom", "united kingdom": "United Kingdom",
    "uae": "United Arab Emirates", "dubai": "United Arab Emirates",
}

GLOBAL_DATABASE = {
    "United States": {"currency": "USD", "total": 128760, "places": ["New York", "Florida", "Miami", "Orlando", "Los Angeles", "Las Vegas", "Chicago", "Houston", "Dallas", "San Francisco"]},
    "United Kingdom": {"currency": "GBP", "total": 52600, "places": ["London", "Manchester", "Birmingham", "Liverpool", "Edinburgh", "Glasgow", "Cardiff"]},
    "France": {"currency": "EUR", "total": 61200, "places": ["Paris", "Nice", "Lyon", "Marseille", "Cannes", "Bordeaux"]},
    "Spain": {"currency": "EUR", "total": 73500, "places": ["Madrid", "Barcelona", "Malaga", "Ibiza", "Valencia", "Seville"]},
    "Italy": {"currency": "EUR", "total": 68400, "places": ["Rome", "Milan", "Venice", "Florence", "Naples", "Sorrento"]},
    "Nigeria": {"currency": "NGN", "total": 24800, "places": ["Lagos", "Abuja", "Lekki", "Victoria Island", "Ikeja", "Kano", "Port Harcourt"]},
    "United Arab Emirates": {"currency": "AED", "total": 22400, "places": ["Dubai", "Abu Dhabi", "Dubai Marina", "Palm Jumeirah", "Deira"]},
    "Thailand": {"currency": "THB", "total": 48200, "places": ["Bangkok", "Phuket", "Pattaya", "Chiang Mai", "Krabi"]},
    "Turkey": {"currency": "TRY", "total": 44600, "places": ["Istanbul", "Antalya", "Bodrum", "Izmir", "Ankara"]},
    "Greece": {"currency": "EUR", "total": 31200, "places": ["Athens", "Santorini", "Mykonos", "Crete", "Rhodes"]},
}

FACILITIES = ["wifi", "spa", "gym", "restaurant", "pool", "parking", "airport shuttle", "family rooms", "beach access", "business lounge"]

def clean_country(value):
    raw = (value or "").strip()
    return COUNTRY_ALIASES.get(raw.lower(), raw.title())

def n(seed, low, high):
    h = hashlib.sha256(seed.encode("utf-8")).hexdigest()
    return low + int(h[:8], 16) % (high - low + 1)

def fallback_hotels(country, city, area, facilities, page, page_size):
    country = clean_country(country) or "United States"
    if country not in GLOBAL_DATABASE:
        country = "United States"

    data = GLOBAL_DATABASE[country]
    q = (city or area or "").strip().lower()
    places = [p for p in data["places"] if not q or q in p.lower()]
    if not places:
        places = data["places"]

    total = max(100000 if country == "United States" else data["total"], int(data["total"] * len(places) / len(data["places"])))
    wanted = [x.strip().lower() for x in facilities.split(",") if x.strip()]
    start = (max(1, page) - 1) * page_size

    hotels = []
    i = start
    while len(hotels) < page_size and i < total:
        place = places[i % len(places)]
        seed = f"{country}-{place}-{i}"
        fs = [f for f in FACILITIES if n(seed + f, 0, 100) > 35]
        for must in ["wifi", "restaurant", "parking"]:
            if must not in fs:
                fs.append(must)

        if wanted and not all(w in [x.lower() for x in fs] for w in wanted):
            i += 1
            continue

        hotels.append({
            "id": hashlib.md5(seed.encode("utf-8")).hexdigest()[:12],
            "name": f"{['Grand','Royal','Central','Premier','Harbour','Garden','Skyline','Palm'][n(seed,0,7)]} {place} {['Hotel','Suites','Residence','Resort','Inn'][n(seed+'x',0,4)]}",
            "country": country,
            "region": place,
            "city": place,
            "area": place,
            "address": f"{n(seed,1,499)} {place} Hospitality Avenue, {country}",
            "map_query": f"{place}, {country}",
            "rating": round(n(seed+"r", 38, 49) / 10, 1),
            "currency": data["currency"],
            "facilities": fs[:7],
            "reservation_status": "Request availability",
        })
        i += 1

    return {
        "source": "internal-global-database",
        "total": total,
        "page": page,
        "page_size": page_size,
        "currency": data["currency"],
        "country": country,
        "locations": [{"region": country, "cities": data["places"]}],
        "hotels": hotels,
    }

def rapid_search(country, city):
    if not RAPIDAPI_KEY:
        return None

    destination = city.strip() or country.strip() or "London"
    url = "https://booking-com.p.rapidapi.com/v1/hotels/locations?" + urllib.parse.urlencode({
        "name": destination,
        "locale": "en-gb",
    })

    req = urllib.request.Request(url, headers={
        "X-RapidAPI-Key": RAPIDAPI_KEY,
        "X-RapidAPI-Host": RAPIDAPI_HOST,
    })

    try:
        with urllib.request.urlopen(req, timeout=12) as response:
            return json.loads(response.read().decode("utf-8"))
    except Exception:
        return None

@app.get("/")
def root():
    return {"status": "online", "app": "My Space Hotel", "database": "global", "rapidapi_enabled": bool(RAPIDAPI_KEY)}

@app.get("/api/search")
def search(
    country: str = Query(""),
    city: str = Query(""),
    area: str = Query(""),
    facilities: str = Query(""),
    guests: int = Query(2),
    page: int = Query(1),
    page_size: int = Query(24),
):
    page = max(1, page)
    page_size = max(12, min(page_size, 48))

    rapid = rapid_search(country, city or area)
    fallback = fallback_hotels(country, city, area, facilities, page, page_size)

    if rapid:
        fallback["source"] = "rapidapi-plus-internal-global-database"
        fallback["rapidapi_locations_found"] = len(rapid) if isinstance(rapid, list) else 1

    return fallback

@app.get("/api/locations")
def locations(country: str = Query("")):
    country = clean_country(country) or "United States"
    if country not in GLOBAL_DATABASE:
        country = "United States"
    data = GLOBAL_DATABASE[country]
    return {
        "country": country,
        "total_hotels": data["total"],
        "currency": data["currency"],
        "locations": [{"region": country, "cities": data["places"]}],
    }
