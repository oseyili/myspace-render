# =========================================================
# MY SPACE HOTEL — LOW STORAGE 300K SCALABLE BACKEND
# NON-AFFILIATE — DISCOVERY + RESERVATION PLATFORM
# =========================================================

from fastapi import FastAPI, Query
from fastapi.middleware.cors import CORSMiddleware
from datetime import datetime
import requests
import os
import json

app = FastAPI()

# =========================================================
# CORS
# =========================================================
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# =========================================================
# PATHS
# =========================================================
DATA_DIR = "data"
INDEX_FILE = os.path.join(DATA_DIR, "hotels_index.jsonl")
RESERVATION_FILE = os.path.join(DATA_DIR, "reservations.json")

os.makedirs(DATA_DIR, exist_ok=True)

# =========================================================
# API CONFIG
# =========================================================
RAPIDAPI_HOST = "booking-com.p.rapidapi.com"
RAPIDAPI_KEY = os.getenv("RAPIDAPI_KEY")

HEADERS = {
    "X-RapidAPI-Key": RAPIDAPI_KEY,
    "X-RapidAPI-Host": RAPIDAPI_HOST,
}

# =========================================================
# UTILS
# =========================================================

def append_index(record):
    with open(INDEX_FILE, "a", encoding="utf-8") as f:
        f.write(json.dumps(record) + "\n")


def load_index():
    if not os.path.exists(INDEX_FILE):
        return []

    with open(INDEX_FILE, "r", encoding="utf-8") as f:
        return [json.loads(line) for line in f]


def hotel_exists(hotel_id):
    if not os.path.exists(INDEX_FILE):
        return False

    with open(INDEX_FILE, "r", encoding="utf-8") as f:
        for line in f:
            if hotel_id in line:
                return True
    return False


def rapid_get(path, params):
    url = f"https://{RAPIDAPI_HOST}{path}"
    try:
        r = requests.get(url, headers=HEADERS, params=params, timeout=25)
        if r.status_code != 200:
            return None
        return r.json()
    except:
        return None


# =========================================================
# DESTINATION FIX (IMPORTANT)
# =========================================================

def find_destination(city):
    data = rapid_get("/v1/hotels/locations", {
        "name": city,
        "locale": "en-gb"
    })

    if not data:
        return None

    # Prefer city/district results
    for item in data:
        if item.get("dest_type") in ["city", "district", "region"]:
            return item

    return data[0]


# =========================================================
# DISCOVERY ENGINE
# =========================================================

def discover_city(city):
    dest = find_destination(city)
    if not dest:
        return 0

    dest_id = dest["dest_id"]
    added = 0

    # MULTI PAGE EXPANSION
    for page in range(0, 5):

        data = rapid_get("/v1/hotels/search", {
            "dest_id": dest_id,
            "dest_type": "city",
            "checkin_date": "2026-06-01",
            "checkout_date": "2026-06-02",
            "adults_number": 2,
            "room_number": 1,
            "page_number": page,
            "locale": "en-gb"
        })

        if not data or "result" not in data:
            continue

        for h in data["result"]:
            hid = str(h.get("hotel_id"))

            if not hid or hotel_exists(hid):
                continue

            record = {
                "hotel_id": hid,
                "name": h.get("hotel_name"),
                "city": city,
                "country": h.get("country_trans"),
                "lat": h.get("latitude"),
                "lon": h.get("longitude"),
                "last_seen": datetime.utcnow().isoformat()
            }

            append_index(record)
            added += 1

    return added


# =========================================================
# API ROUTES
# =========================================================

@app.get("/")
def home():
    return {"status": "My Space Hotel backend running (300K mode)"}


@app.get("/search")
def search(city: str = Query(...)):
    results = []

    if os.path.exists(INDEX_FILE):
        with open(INDEX_FILE, "r", encoding="utf-8") as f:
            for line in f:
                if city.lower() in line.lower():
                    results.append(json.loads(line))
                if len(results) >= 50:
                    break

    # Auto-grow if empty
    if not results:
        discover_city(city)
        return search(city)

    return {
        "city": city,
        "count": len(results),
        "results": results
    }


@app.get("/hotel")
def hotel_details(hotel_id: str):
    data = rapid_get("/v1/hotels/get-hotel-details", {
        "hotel_id": hotel_id,
        "locale": "en-gb"
    })

    return data if data else {"error": "not found"}


# =========================================================
# RESERVATION SYSTEM (NON-AFFILIATE)
# =========================================================

@app.post("/reserve")
def reserve(
    hotel_id: str,
    hotel_name: str,
    city: str,
    customer_name: str,
    customer_email: str,
    checkin: str,
    checkout: str
):
    record = {
        "hotel_id": hotel_id,
        "hotel_name": hotel_name,
        "city": city,
        "customer_name": customer_name,
        "customer_email": customer_email,
        "checkin": checkin,
        "checkout": checkout,
        "created_at": datetime.utcnow().isoformat()
    }

    data = []
    if os.path.exists(RESERVATION_FILE):
        with open(RESERVATION_FILE, "r") as f:
            data = json.load(f)

    data.append(record)

    with open(RESERVATION_FILE, "w") as f:
        json.dump(data, f)

    return {"status": "reservation saved"}


@app.get("/reservations")
def get_reservations():
    if not os.path.exists(RESERVATION_FILE):
        return []

    with open(RESERVATION_FILE, "r") as f:
        return json.load(f)


# =========================================================
# STATS
# =========================================================

@app.get("/stats")
def stats():
    count = 0

    if os.path.exists(INDEX_FILE):
        with open(INDEX_FILE, "r") as f:
            for _ in f:
                count += 1

    return {"total_hotels": count}


# =========================================================
# GROWTH ENDPOINTS
# =========================================================

@app.post("/grow")
def grow():
    cities = [
        "London", "Paris", "Dubai", "New York", "Tokyo",
        "Rome", "Barcelona", "Amsterdam", "Berlin",
        "Istanbul", "Bangkok", "Singapore"
    ]

    report = {}

    for c in cities:
        added = discover_city(c)
        report[c] = added

    return report


@app.post("/grow-country")
def grow_country(country: str):
    # Smart expansion keywords
    seeds = [
        country,
        f"{country} capital",
        f"{country} city",
        f"{country} tourism",
        f"{country} airport",
        f"{country} downtown"
    ]

    report = {}

    for s in seeds:
        added = discover_city(s)
        report[s] = added

    return report
# =========================================================
# PUBLIC HOTEL COUNT / STATUS ENDPOINTS
# Safe public endpoints for Render customer-visible database status.
# =========================================================
from pathlib import Path as _Path
import sqlite3 as _sqlite3

def _public_hotel_db_path():
    return _Path(__file__).resolve().parent / "hotel_catalog.db"

def _public_hotel_count():
    db_path = _public_hotel_db_path()
    if not db_path.exists():
        return {
            "database_found": False,
            "total_hotels": 0,
            "database_path": str(db_path.name),
            "message": "Public hotel database is not present on this Render service."
        }

    try:
        con = _sqlite3.connect(db_path)
        total = con.execute("SELECT COUNT(*) FROM hotels").fetchone()[0]
        countries = con.execute("SELECT COUNT(DISTINCT country) FROM hotels WHERE country IS NOT NULL AND country != ''").fetchone()[0]
        cities = con.execute("SELECT COUNT(DISTINCT city) FROM hotels WHERE city IS NOT NULL AND city != ''").fetchone()[0]
        con.close()
        return {
            "database_found": True,
            "total_hotels": int(total),
            "countries_loaded": int(countries),
            "cities_loaded": int(cities),
            "database_path": str(db_path.name),
            "message": "Public hotel database loaded."
        }
    except Exception as exc:
        return {
            "database_found": True,
            "total_hotels": 0,
            "database_path": str(db_path.name),
            "error": str(exc),
            "message": "Public hotel database exists but could not be counted."
        }

@app.get("/status")
def public_status():
    data = _public_hotel_count()
    data["ok"] = True
    data["app"] = "My Space Hotel Backend"
    data["support"] = "reservations@myspace-hotel.com"
    return data

@app.get("/stats")
def public_stats():
    return public_status()

@app.get("/api/status")
def public_api_status():
    return public_status()

@app.get("/api/stats")
def public_api_stats():
    return public_status()
