import os
import json
import sqlite3
import time
import requests
from datetime import datetime
from typing import Optional, List
from fastapi import FastAPI, Query
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

APP_NAME = "My Space Hotel Backend"
DB_FILE = "hotel_catalog.db"

RAPIDAPI_KEY = os.getenv("RAPIDAPI_KEY", "").strip()
RAPIDAPI_HOST = os.getenv("RAPIDAPI_HOST", "booking-com.p.rapidapi.com").strip()
SUPPORT_EMAIL = os.getenv("SUPPORT_EMAIL", "reservations@myspace-hotel.com").strip()

app = FastAPI(title=APP_NAME)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

COUNTRY_ALIASES = {
    "uk": "gb", "united kingdom": "gb", "england": "gb", "britain": "gb", "gb": "gb",
    "usa": "us", "us": "us", "america": "us", "united states": "us",
    "nigeria": "ng", "ng": "ng",
    "uae": "ae", "dubai": "ae", "united arab emirates": "ae",
    "south africa": "za", "za": "za",
    "ghana": "gh", "canada": "ca", "france": "fr", "spain": "es",
    "italy": "it", "germany": "de", "netherlands": "nl",
}

SITE_IMAGES = {
    "abuja": [
        {"name": "Aso Rock", "image": "https://images.unsplash.com/photo-1578894381163-e72c17f2d45f?auto=format&fit=crop&w=1200&q=80"},
        {"name": "National Mosque", "image": "https://images.unsplash.com/photo-1580191947416-62d35a55e71d?auto=format&fit=crop&w=1200&q=80"},
    ],
    "london": [
        {"name": "Tower Bridge", "image": "https://images.unsplash.com/photo-1513635269975-59663e0ac1ad?auto=format&fit=crop&w=1200&q=80"},
        {"name": "Westminster", "image": "https://images.unsplash.com/photo-1520986606214-8b456906c813?auto=format&fit=crop&w=1200&q=80"},
    ],
    "paris": [
        {"name": "Eiffel Tower", "image": "https://images.unsplash.com/photo-1502602898657-3e91760cbb34?auto=format&fit=crop&w=1200&q=80"},
        {"name": "Seine", "image": "https://images.unsplash.com/photo-1431274172761-fca41d930114?auto=format&fit=crop&w=1200&q=80"},
    ],
    "new york": [
        {"name": "Manhattan", "image": "https://images.unsplash.com/photo-1485871981521-5b1fd3805eee?auto=format&fit=crop&w=1200&q=80"},
        {"name": "Times Square", "image": "https://images.unsplash.com/photo-1546436836-07a91091f160?auto=format&fit=crop&w=1200&q=80"},
    ],
}

def db():
    con = sqlite3.connect(DB_FILE)
    con.row_factory = sqlite3.Row
    return con

def init_db():
    con = db()
    con.execute("""
        CREATE TABLE IF NOT EXISTS hotels (
            id TEXT PRIMARY KEY,
            name TEXT NOT NULL,
            country TEXT,
            city TEXT,
            area TEXT,
            address TEXT,
            latitude REAL,
            longitude REAL,
            rating REAL,
            review_score REAL,
            price TEXT,
            currency TEXT,
            image TEXT,
            facilities TEXT,
            source TEXT NOT NULL,
            raw TEXT,
            created_at TEXT
        )
    """)
    con.commit()
    con.close()

init_db()

def headers():
    return {
        "X-RapidAPI-Key": RAPIDAPI_KEY,
        "X-RapidAPI-Host": RAPIDAPI_HOST,
    }

def clean(v):
    return str(v or "").strip()

def country_code(country):
    c = clean(country).lower()
    return COUNTRY_ALIASES.get(c, c[:2] if len(c) == 2 else c)

def rapid_get(path, params):
    if not RAPIDAPI_KEY:
        return {"ok": False, "error": "RapidAPI key is not loaded."}
    url = f"https://{RAPIDAPI_HOST}{path}"
    try:
        r = requests.get(url, headers=headers(), params=params, timeout=25)
        if r.status_code != 200:
            return {
                "ok": False,
                "status_code": r.status_code,
                "error": "Hotel provider returned a temporary error.",
                "body": r.text[:300],
            }
        return {"ok": True, "data": r.json()}
    except Exception as e:
        return {"ok": False, "error": str(e)}

def find_destination(country, city, area=""):
    query = " ".join([clean(area), clean(city), clean(country)]).strip()
    if not query:
        return None

    result = rapid_get("/v1/hotels/locations", {
        "name": query,
        "locale": "en-gb",
    })

    if not result.get("ok"):
        return None

    data = result.get("data") or []
    if not isinstance(data, list) or not data:
        return None

    preferred = None
    for item in data:
        if item.get("dest_type") in ["city", "district", "landmark", "region"]:
            preferred = item
            break

    return preferred or data[0]

def normalize_hotel(item, country="", city="", area=""):
    hotel_id = clean(
        item.get("hotel_id")
        or item.get("id")
        or item.get("cc1") + "-" + item.get("hotel_name", "")
        or item.get("name")
    )

    name = clean(item.get("hotel_name") or item.get("name") or item.get("title"))
    if not hotel_id or not name:
        return None

    price = ""
    currency = clean(item.get("currencycode") or item.get("currency") or item.get("price_currency"))
    if isinstance(item.get("min_total_price"), (int, float)):
        price = str(item.get("min_total_price"))
    elif item.get("price_breakdown"):
        pb = item.get("price_breakdown") or {}
        price = clean(pb.get("gross_price") or pb.get("all_inclusive_price"))

    image = clean(
        item.get("max_photo_url")
        or item.get("main_photo_url")
        or item.get("photo_url")
        or item.get("image_url")
    )

    facilities = item.get("hotel_facilities") or item.get("facilities") or []
    if isinstance(facilities, list):
        facilities_text = ", ".join([clean(x) for x in facilities if clean(x)])
    else:
        facilities_text = clean(facilities)

    return {
        "id": hotel_id,
        "name": name,
        "country": clean(country or item.get("country_trans") or item.get("countrycode")),
        "city": clean(city or item.get("city") or item.get("city_name")),
        "area": clean(area or item.get("district") or item.get("districts")),
        "address": clean(item.get("address") or item.get("address_trans")),
        "latitude": item.get("latitude") or item.get("lat"),
        "longitude": item.get("longitude") or item.get("lng"),
        "rating": item.get("class") or item.get("hotel_class") or item.get("stars"),
        "review_score": item.get("review_score") or item.get("score"),
        "price": price,
        "currency": currency,
        "image": image,
        "facilities": facilities_text,
        "source": "rapidapi",
        "raw": json.dumps(item)[:10000],
        "created_at": datetime.utcnow().isoformat(),
    }

def save_hotels(hotels):
    con = db()
    count = 0
    for h in hotels:
        con.execute("""
            INSERT OR REPLACE INTO hotels
            (id,name,country,city,area,address,latitude,longitude,rating,review_score,price,currency,image,facilities,source,raw,created_at)
            VALUES
            (:id,:name,:country,:city,:area,:address,:latitude,:longitude,:rating,:review_score,:price,:currency,:image,:facilities,:source,:raw,:created_at)
        """, h)
        count += 1
    con.commit()
    con.close()
    return count

def search_live(country="", city="", area="", keyword="", guests=2, facilities=None, limit=60):
    dest = find_destination(country, city, area)
    if not dest:
        return {"hotels": [], "provider_ok": False, "message": "Destination was not found by the live hotel provider."}

    params = {
        "dest_id": dest.get("dest_id"),
        "dest_type": dest.get("dest_type"),
        "adults_number": max(int(guests or 2), 1),
        "room_number": 1,
        "locale": "en-gb",
        "units": "metric",
        "filter_by_currency": "LOCAL",
        "order_by": "popularity",
        "checkin_date": "2026-06-10",
        "checkout_date": "2026-06-11",
        "page_number": 0,
    }

    result = rapid_get("/v1/hotels/search", params)
    if not result.get("ok"):
        return {"hotels": [], "provider_ok": False, "message": result.get("error", "Provider unavailable."), "provider": result}

    data = result.get("data") or {}
    raw_hotels = data.get("result") or data.get("hotels") or []
    hotels = []

    wanted = [f.lower().strip() for f in (facilities or []) if f]
    key = clean(keyword).lower()

    for item in raw_hotels:
        h = normalize_hotel(item, country=country, city=city, area=area)
        if not h:
            continue
        blob = " ".join([h["name"], h["city"], h["area"], h["address"], h["facilities"]]).lower()
        if key and key not in blob:
            continue
        if wanted and not all(w in blob for w in wanted):
            continue
        hotels.append(h)
        if len(hotels) >= limit:
            break

    save_hotels(hotels)
    return {"hotels": hotels, "provider_ok": True, "destination": dest}

def db_search(country="", city="", area="", keyword="", facilities=None, limit=60, offset=0):
    clauses = []
    vals = {}

    for field, value in [("country", country), ("city", city), ("area", area)]:
        if clean(value):
            clauses.append(f"LOWER({field}) LIKE :{field}")
            vals[field] = f"%{clean(value).lower()}%"

    if clean(keyword):
        clauses.append("(LOWER(name) LIKE :kw OR LOWER(address) LIKE :kw OR LOWER(facilities) LIKE :kw)")
        vals["kw"] = f"%{clean(keyword).lower()}%"

    for i, f in enumerate(facilities or []):
        if clean(f):
            clauses.append(f"LOWER(facilities) LIKE :fac{i}")
            vals[f"fac{i}"] = f"%{clean(f).lower()}%"

    where = "WHERE " + " AND ".join(clauses) if clauses else ""
    vals["limit"] = int(limit)
    vals["offset"] = int(offset)

    con = db()
    rows = con.execute(f"""
        SELECT * FROM hotels
        {where}
        ORDER BY review_score DESC, rating DESC, name ASC
        LIMIT :limit OFFSET :offset
    """, vals).fetchall()

    total = con.execute(f"SELECT COUNT(*) AS c FROM hotels {where}", vals).fetchone()["c"]
    con.close()

    return [dict(r) for r in rows], total

@app.get("/")
def root():
    return {"ok": True, "app": APP_NAME, "support": SUPPORT_EMAIL}

@app.get("/api/admin/catalogue-status")
def catalogue_status():
    con = db()
    total = con.execute("SELECT COUNT(*) AS c FROM hotels").fetchone()["c"]
    countries = [r["country"] for r in con.execute("SELECT country FROM hotels WHERE country IS NOT NULL AND country != '' GROUP BY country ORDER BY country LIMIT 40").fetchall()]
    cities = [r["city"] for r in con.execute("SELECT city FROM hotels WHERE city IS NOT NULL AND city != '' GROUP BY city ORDER BY city LIMIT 80").fetchall()]
    con.close()
    return {
        "total_hotels": total,
        "countries_loaded": countries,
        "cities_loaded": cities,
        "database_file": DB_FILE,
        "database_protected": True,
        "fake_data": False,
        "rapidapi_key_loaded": bool(RAPIDAPI_KEY),
        "email_ready": bool(SUPPORT_EMAIL),
    }

@app.post("/api/admin/catalogue-grow")
@app.get("/api/admin/catalogue-grow")
def catalogue_grow(
    country: str = Query("UK"),
    city: str = Query("London"),
    pages: int = Query(1, ge=1, le=10),
):
    added = 0
    for _ in range(pages):
        result = search_live(country=country, city=city, limit=80)
        added += len(result.get("hotels", []))
        time.sleep(0.4)
    return {"ok": True, "added_or_updated": added, "fake_data": False}

@app.get("/api/hotels/search")
@app.get("/api/search-hotels")
@app.get("/api/search")
def search_hotels(
    country: str = "",
    city: str = "",
    area: str = "",
    destination: str = "",
    keyword: str = "",
    guests: int = 2,
    facilities: Optional[str] = "",
    limit: int = 60,
    offset: int = 0,
):
    if destination and not city:
        city = destination

    facility_list = [x.strip() for x in clean(facilities).split(",") if x.strip()]

    cached, total = db_search(country, city, area, keyword, facility_list, limit, offset)
    if cached:
        return {
            "ok": True,
            "source": "database",
            "fake_data": False,
            "total": total,
            "shown": len(cached),
            "hotels": cached,
            "results": cached,
        }

    live = search_live(country, city, area, keyword, guests, facility_list, limit)
    hotels = live.get("hotels", [])

    return {
        "ok": True,
        "source": "live_provider" if hotels else "no_match",
        "fake_data": False,
        "total": len(hotels),
        "shown": len(hotels),
        "hotels": hotels,
        "results": hotels,
        "message": "" if hotels else "No matching hotels found yet. Try country and city, for example UK and London.",
    }

@app.get("/api/travel-guide")
def travel_guide(country: str = "", city: str = "", area: str = ""):
    place = clean(area or city or country or "destination")
    key = place.lower()

    images = SITE_IMAGES.get(key, SITE_IMAGES.get(clean(city).lower(), []))

    map_query = "+".join([x for x in [area, city, country] if clean(x)])
    map_embed = f"https://www.google.com/maps?q={map_query}&output=embed" if map_query else ""

    return {
        "ok": True,
        "place": place.title(),
        "headline": f"Explore {place.title()} before choosing your stay",
        "summary": f"Compare hotel locations around {place.title()}, check nearby areas, and choose a stay that fits the reason for your trip.",
        "map_embed": map_embed,
        "images": images,
        "highlights": [
            "Check distance from the area you will visit most.",
            "Compare transport access before requesting availability.",
            "Use facilities to narrow the list before choosing a hotel.",
            "Review the map position before continuing."
        ],
    }

class AvailabilityRequest(BaseModel):
    hotel_id: Optional[str] = ""
    hotel_name: Optional[str] = ""
    name: str
    email: str
    message: Optional[str] = ""

@app.post("/api/request-availability")
def request_availability(req: AvailabilityRequest):
    return {
        "ok": True,
        "message": "Availability request received.",
        "support_email": SUPPORT_EMAIL,
        "hotel": req.hotel_name or req.hotel_id,
    }
