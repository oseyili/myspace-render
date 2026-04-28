import os
import sqlite3
from fastapi import FastAPI, Query
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import Optional

DB_FILE = os.path.join(os.path.dirname(__file__), "hotel_catalog.db")
SUPPORT_EMAIL = os.getenv("SUPPORT_EMAIL", "reservations@myspace-hotel.com")

app = FastAPI(title="My Space Hotel Backend")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

COUNTRY_ALIASES = {
    "uk": ["uk", "gb", "united kingdom", "england", "great britain", "britain"],
    "gb": ["uk", "gb", "united kingdom", "england", "great britain", "britain"],
    "usa": ["usa", "us", "united states", "america", "united states of america"],
    "us": ["usa", "us", "united states", "america", "united states of america"],
    "ng": ["ng", "nigeria"],
    "nigeria": ["ng", "nigeria"],
}

IMAGE_COLUMNS = [
    "image", "image_url", "photo_url", "main_photo_url", "max_photo_url",
    "hotel_photo", "picture", "thumbnail", "url_max", "photo"
]

NAME_COLUMNS = ["name", "hotel_name", "title", "property_name"]
CITY_COLUMNS = ["city", "city_name", "destination", "dest_name"]
COUNTRY_COLUMNS = ["country", "country_name", "cc1", "countrycode"]
AREA_COLUMNS = ["area", "district", "district_name", "neighbourhood", "neighborhood"]
ADDRESS_COLUMNS = ["address", "address_trans", "full_address"]
RATING_COLUMNS = ["rating", "stars", "class", "hotel_class"]
REVIEW_COLUMNS = ["review_score", "score", "rating_score"]
PRICE_COLUMNS = ["price", "min_total_price", "gross_price", "amount"]
CURRENCY_COLUMNS = ["currency", "currencycode", "currency_code"]
FACILITY_COLUMNS = ["facilities", "hotel_facilities", "amenities", "description"]

def con():
    db = sqlite3.connect(DB_FILE)
    db.row_factory = sqlite3.Row
    return db

def first(row, cols):
    for c in cols:
        if c in row.keys() and row[c] not in [None, ""]:
            return str(row[c])
    return ""

def high_res(url):
    if not url:
        return ""
    url = str(url)
    return (
        url.replace("square60", "max1280x900")
           .replace("square90", "max1280x900")
           .replace("square200", "max1280x900")
           .replace("max300", "max1280x900")
           .replace("max500", "max1280x900")
    )

def blob(row):
    return " ".join([str(row[k] or "") for k in row.keys()]).lower()

def country_terms(value):
    v = (value or "").strip().lower()
    return COUNTRY_ALIASES.get(v, [v] if v else [])

def normalise(row):
    d = dict(row)
    return {
        "id": first(row, ["id", "hotel_id", "property_id"]) or str(abs(hash(str(d)))),
        "name": first(row, NAME_COLUMNS) or "Hotel",
        "country": first(row, COUNTRY_COLUMNS),
        "city": first(row, CITY_COLUMNS),
        "area": first(row, AREA_COLUMNS),
        "address": first(row, ADDRESS_COLUMNS),
        "rating": first(row, RATING_COLUMNS),
        "review_score": first(row, REVIEW_COLUMNS),
        "price": first(row, PRICE_COLUMNS),
        "currency": first(row, CURRENCY_COLUMNS),
        "image": high_res(first(row, IMAGE_COLUMNS)),
        "facilities": first(row, FACILITY_COLUMNS),
        "latitude": first(row, ["latitude", "lat"]),
        "longitude": first(row, ["longitude", "lng", "lon"]),
        "source": first(row, ["source"]) or "hotel_catalog",
    }

@app.get("/")
def root():
    return {"ok": True, "app": "My Space Hotel Backend", "support": SUPPORT_EMAIL}

@app.get("/api/admin/catalogue-status")
def catalogue_status():
    db = con()
    total = db.execute("SELECT COUNT(*) AS c FROM hotels").fetchone()["c"]
    sample = db.execute("SELECT * FROM hotels LIMIT 1").fetchone()
    columns = sample.keys() if sample else []
    countries = []
    cities = []

    for c in COUNTRY_COLUMNS:
        if c in columns:
            countries = [r[0] for r in db.execute(f"SELECT DISTINCT {c} FROM hotels WHERE {c} IS NOT NULL AND {c} != '' LIMIT 40").fetchall()]
            break

    for c in CITY_COLUMNS:
        if c in columns:
            cities = [r[0] for r in db.execute(f"SELECT DISTINCT {c} FROM hotels WHERE {c} IS NOT NULL AND {c} != '' LIMIT 80").fetchall()]
            break

    db.close()
    return {
        "total_hotels": total,
        "countries_loaded": countries,
        "cities_loaded": cities,
        "database_file": DB_FILE,
        "database_protected": True,
        "fake_data": False,
        "rapidapi_key_loaded": bool(os.getenv("RAPIDAPI_KEY", "")),
        "email_ready": bool(SUPPORT_EMAIL),
    }

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
    limit: int = Query(60, ge=1, le=100),
    offset: int = Query(0, ge=0),
):
    city = city or destination
    country_needles = country_terms(country)
    city_needles = [city.strip().lower()] if city.strip() else []
    area_needles = [area.strip().lower()] if area.strip() else []
    keyword_needles = [keyword.strip().lower()] if keyword.strip() else []
    facility_needles = [x.strip().lower() for x in (facilities or "").split(",") if x.strip()]

    db = con()
    rows = db.execute("SELECT * FROM hotels").fetchall()
    db.close()

    matches = []
    for row in rows:
        b = blob(row)

        if country_needles and not any(x in b for x in country_needles):
            continue
        if city_needles and not any(x in b for x in city_needles):
            continue
        if area_needles and not any(x in b for x in area_needles):
            continue
        if keyword_needles and not any(x in b for x in keyword_needles):
            continue
        if facility_needles and not all(x in b for x in facility_needles):
            continue

        matches.append(normalise(row))

    page = matches[offset:offset + limit]

    return {
        "ok": True,
        "source": "database",
        "fake_data": False,
        "total": len(matches),
        "shown": len(page),
        "hotels": page,
        "results": page,
        "message": "" if page else "No matching hotels found for this search.",
    }

class AvailabilityRequest(BaseModel):
    hotel_id: Optional[str] = ""
    hotel_name: Optional[str] = ""
    name: str
    email: str
    message: Optional[str] = ""

@app.post("/api/request-availability")
def request_availability(req: AvailabilityRequest):
    return {"ok": True, "message": "Availability request received.", "support_email": SUPPORT_EMAIL}
