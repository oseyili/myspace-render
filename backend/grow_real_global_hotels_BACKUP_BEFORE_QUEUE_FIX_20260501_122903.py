import os
import time
import json
import sqlite3
import requests
import shutil
from datetime import datetime, UTC
from pathlib import Path

DB = "hotel_catalog.db"
STATE_FILE = Path("fast_deep_city_state.json")
BACKUP_DIR = Path(r"D:\hotel_backups")
BACKUP_DIR.mkdir(parents=True, exist_ok=True)

TARGET = 300000
SLEEP = 0.85
MAX_PAGES_PER_DESTINATION = 12
LOW_YIELD_CHECK_PAGE = 4
LOW_YIELD_MIN_ADDED = 8
ZERO_STREAK_LIMIT = 3
BACKUP_EVERY_ADDED = 5000

def load_env():
    env_file = Path(".env")
    if env_file.exists():
        for line in env_file.read_text(encoding="utf-8", errors="ignore").splitlines():
            line = line.strip()
            if line and not line.startswith("#") and "=" in line:
                key, value = line.split("=", 1)
                os.environ.setdefault(key.strip(), value.strip().strip('"').strip("'"))

load_env()

HOST = os.getenv("RAPIDAPI_HOST", "apidojo-booking-v1.p.rapidapi.com")
KEY = os.getenv("RAPIDAPI_KEY", "")

if not KEY:
    raise SystemExit("RAPIDAPI_KEY not loaded. No fake hotels created.")

HEADERS = {
    "X-RapidAPI-Key": KEY,
    "X-RapidAPI-Host": HOST,
}

COUNTRY_PRIORITY = [
    "United Kingdom",
    "Nigeria",
    "United States",
    "Brazil",
    "Kenya",
    "South Africa",
    "France",
    "Spain",
    "Italy",
    "Germany",
    "Netherlands",
    "Portugal",
    "Greece",
    "Turkey",
    "United Arab Emirates",
    "Saudi Arabia",
    "Qatar",
    "Egypt",
    "Morocco",
    "Ghana",
    "Tanzania",
    "Uganda",
    "Rwanda",
    "Thailand",
    "Malaysia",
    "Indonesia",
    "Philippines",
    "Vietnam",
    "Japan",
    "South Korea",
    "India",
    "Sri Lanka",
    "Nepal",
    "Australia",
    "New Zealand",
    "Canada",
    "Mexico",
    "Argentina",
    "Chile",
    "Colombia",
    "Peru",
]

BASE_PLACES = [
    "London","Manchester","Birmingham","Liverpool","Leeds","Bristol","Newcastle","Nottingham","Sheffield","Leicester",
    "Oxford","Cambridge","York","Bath","Brighton","Bournemouth","Southampton","Portsmouth","Cardiff","Edinburgh","Glasgow","Aberdeen","Belfast",
    "Lagos","Abuja","Port Harcourt","Ibadan","Kano","Enugu","Calabar","Uyo","Benin City","Abeokuta","Owerri","Warri","Asaba","Ilorin","Jos","Kaduna","Akure",
    "New York","Los Angeles","Miami","Orlando","Las Vegas","Chicago","San Francisco","Boston","Washington","Seattle","San Diego","Houston","Dallas","Austin","Atlanta","New Orleans","Nashville","Denver","Phoenix","Honolulu",
    "Rio de Janeiro","Sao Paulo","Salvador","Brasilia","Florianopolis","Recife","Fortaleza","Natal","Curitiba","Manaus",
    "Nairobi","Mombasa","Malindi","Diani Beach","Naivasha","Kisumu","Nakuru","Eldoret","Lamu",
    "Cape Town","Johannesburg","Durban","Pretoria","Sandton","Stellenbosch","Port Elizabeth","Knysna","Hermanus","Bloemfontein",
    "Paris","Nice","Lyon","Marseille","Madrid","Barcelona","Valencia","Seville","Malaga","Rome","Milan","Venice","Florence","Naples",
    "Berlin","Munich","Hamburg","Frankfurt","Amsterdam","Rotterdam","Brussels","Bruges","Lisbon","Porto","Zurich","Geneva","Vienna","Prague","Budapest","Athens","Santorini","Mykonos","Istanbul","Antalya",
    "Dubai","Abu Dhabi","Doha","Riyadh","Jeddah","Cairo","Marrakech","Casablanca","Accra","Dar es Salaam","Zanzibar","Kampala","Kigali",
    "Bangkok","Phuket","Krabi","Singapore","Tokyo","Osaka","Kyoto","Seoul","Busan","Hong Kong","Kuala Lumpur","Penang","Bali","Jakarta","Manila","Cebu","Hanoi","Ho Chi Minh City","Da Nang",
    "Mumbai","Delhi","Goa","Jaipur","Sydney","Melbourne","Brisbane","Perth","Auckland","Queenstown","Toronto","Vancouver","Montreal","Mexico City","Cancun","Tulum","Buenos Aires","Santiago","Bogota","Cartagena","Lima",
]

DISCOVERY_TERMS = [
    "",
    "city",
    "town",
    "district",
    "central",
    "city centre",
    "downtown",
    "airport",
    "station",
    "business district",
    "market",
    "university",
    "beach",
    "coast",
    "harbour",
    "island",
    "resort",
    "old town",
    "nearby",
]

UK_DEEP_TERMS = [
    "Greater London","Central London","Westminster London","Kensington London","Chelsea London","Canary Wharf London","Paddington London","Camden London","Greenwich London","Shoreditch London","Heathrow London","Gatwick London",
    "Essex United Kingdom","Kent United Kingdom","Surrey United Kingdom","Sussex United Kingdom","Cornwall United Kingdom","Devon United Kingdom","Norfolk United Kingdom","Suffolk United Kingdom","Yorkshire United Kingdom",
    "Lancashire United Kingdom","Cumbria United Kingdom","Derbyshire United Kingdom","Warwickshire United Kingdom","Hampshire United Kingdom","Somerset United Kingdom","Wiltshire United Kingdom","Dorset United Kingdom",
]

def db():
    con = sqlite3.connect(DB)
    con.row_factory = sqlite3.Row
    return con

def count_hotels():
    con = db()
    total = con.execute("SELECT COUNT(*) FROM hotels").fetchone()[0]
    con.close()
    return total

def backup(label):
    stamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    safe = label.replace(" ", "_").replace("/", "_").replace("-", "m").replace(",", "")
    out = BACKUP_DIR / f"hotel_catalog_{safe}_{stamp}.db"
    shutil.copyfile(DB, out)
    print("LOCAL BACKUP SAVED:", out, flush=True)

def known_ids():
    con = db()
    ids = set(str(row[0]) for row in con.execute(
        "SELECT supplier_hotel_id FROM hotels WHERE supplier_hotel_id IS NOT NULL AND supplier_hotel_id != ''"
    ))
    con.close()
    return ids

KNOWN = known_ids()

def load_state():
    if STATE_FILE.exists():
        try:
            return json.loads(STATE_FILE.read_text(encoding="utf-8"))
        except Exception:
            pass
    return {
        "seen_destinations": [],
        "dead_destinations": [],
        "queue": [],
        "country_index": 0,
        "place_index": 0,
        "term_index": 0,
        "deep_uk_index": 0
    }

STATE = load_state()
SEEN_DESTINATIONS = set(STATE.get("seen_destinations", []))
DEAD_DESTINATIONS = set(STATE.get("dead_destinations", []))

def save_state():
    STATE["seen_destinations"] = list(SEEN_DESTINATIONS)
    STATE["dead_destinations"] = list(DEAD_DESTINATIONS)
    STATE_FILE.write_text(json.dumps(STATE, indent=2), encoding="utf-8")

def high_res(url):
    return str(url or "").replace("square60", "max1024x768").replace("square90", "max1024x768").replace("square200", "max1024x768").replace("max300", "max1024x768")

def safe_get(path, params):
    time.sleep(SLEEP)

    try:
        response = requests.get(f"https://{HOST}{path}", headers=HEADERS, params=params, timeout=35)
    except Exception as exc:
        print("Request error:", exc, flush=True)
        time.sleep(10)
        return None

    if response.status_code == 429:
        print("RATE LIMIT 429. Sleeping safely for 90 seconds.", flush=True)
        time.sleep(90)
        return None

    if response.status_code in [401, 403]:
        raise SystemExit(f"Provider blocked/unauthorized: {response.status_code} {response.text[:200]}")

    if response.status_code != 200:
        return None

    try:
        return response.json()
    except Exception:
        return None

def add_destination(dest_id, label, dest_type, source_text):
    if not dest_id:
        return False

    dest_id = str(dest_id)
    dest_type = str(dest_type or "").lower()

    allowed_types = {"city", "district", "region", "airport", "landmark"}
    if dest_type not in allowed_types:
        return False

    if dest_id in SEEN_DESTINATIONS or dest_id in DEAD_DESTINATIONS:
        return False

    STATE["queue"].append({
        "dest_id": dest_id,
        "label": label or source_text,
        "dest_type": dest_type,
        "source": source_text
    })
    SEEN_DESTINATIONS.add(dest_id)
    save_state()
    return True

def discover_text(text):
    data = safe_get("/locations/auto-complete", {
        "text": text,
        "languagecode": "en-us"
    })

    items = data if isinstance(data, list) else (data or {}).get("data") or []
    added = 0

    for item in items:
        dest_id = item.get("dest_id")
        dest_type = item.get("dest_type")
        label = item.get("label") or item.get("name") or text
        if add_destination(dest_id, label, dest_type, text):
            added += 1

    print("DISCOVER:", text, "| new destinations:", added, flush=True)
    return added

def fill_queue():
    print("Filling destination queue...", flush=True)

    attempts = 0

    while len(STATE["queue"]) < 30 and attempts < 80:
        attempts += 1

        if STATE["deep_uk_index"] < len(UK_DEEP_TERMS):
            text = UK_DEEP_TERMS[STATE["deep_uk_index"]]
            STATE["deep_uk_index"] += 1
            save_state()
            discover_text(text)
            continue

        country = COUNTRY_PRIORITY[STATE["country_index"] % len(COUNTRY_PRIORITY)]
        place = BASE_PLACES[STATE["place_index"] % len(BASE_PLACES)]
        term = DISCOVERY_TERMS[STATE["term_index"] % len(DISCOVERY_TERMS)]

        if term:
            text = f"{place} {term} {country}".strip()
        else:
            text = f"{place} {country}".strip()

        STATE["term_index"] += 1
        if STATE["term_index"] >= len(DISCOVERY_TERMS):
            STATE["term_index"] = 0
            STATE["place_index"] += 1

        if STATE["place_index"] >= len(BASE_PLACES):
            STATE["place_index"] = 0
            STATE["country_index"] += 1

        save_state()
        discover_text(text)

    print("Queue size:", len(STATE["queue"]), flush=True)

def fetch_properties(dest_id, dest_type, page):
    search_type = "city"
    if dest_type in ["district", "region", "airport", "landmark"]:
        search_type = dest_type

    data = safe_get("/properties/list", {
        "dest_ids": dest_id,
        "search_type": search_type,
        "arrival_date": "2026-06-10",
        "departure_date": "2026-06-11",
        "adults": "2",
        "room_qty": "1",
        "page_number": str(page),
        "units": "metric",
        "languagecode": "en-us",
        "currency_code": "GBP",
    })

    if not isinstance(data, dict):
        return []

    result = data.get("result") or []

    if not result and search_type != "city":
        data = safe_get("/properties/list", {
            "dest_ids": dest_id,
            "search_type": "city",
            "arrival_date": "2026-06-10",
            "departure_date": "2026-06-11",
            "adults": "2",
            "room_qty": "1",
            "page_number": str(page),
            "units": "metric",
            "languagecode": "en-us",
            "currency_code": "GBP",
        })
        if isinstance(data, dict):
            result = data.get("result") or []

    return result

def normalize(hotel):
    hid = str(hotel.get("hotel_id") or "").strip()
    name = str(hotel.get("hotel_name") or hotel.get("hotel_name_trans") or "").strip()

    if not hid or not name or hid in KNOWN:
        return None

    image = high_res(hotel.get("main_photo_url") or "")
    if not image:
        return None

    now = datetime.now(UTC).isoformat()
    accommodation_type = str(hotel.get("accommodation_type_name") or "")
    review_word = str(hotel.get("review_score_word") or "")
    description = (accommodation_type + " " + review_word).strip()

    return (
        "rapid-" + hid,
        "apidojo-booking",
        hid,
        name,
        str(hotel.get("country_trans") or hotel.get("cc1") or ""),
        str(hotel.get("city") or hotel.get("city_name_en") or ""),
        str(hotel.get("district") or hotel.get("districts") or ""),
        str(hotel.get("address") or hotel.get("address_trans") or ""),
        str(hotel.get("currencycode") or hotel.get("currency_code") or ""),
        str(hotel.get("min_total_price") or ""),
        str(hotel.get("class") or ""),
        str(hotel.get("review_nr") or ""),
        image,
        str(hotel.get("latitude") or ""),
        str(hotel.get("longitude") or ""),
        "",
        "FAST DEEP CITY ALL BOOKABLE ACCOMMODATIONS IMPORT",
        now,
        image,
        str(hotel.get("hotel_facilities") or ""),
        description,
        now,
        now,
    )

def insert_rows(rows):
    if not rows:
        return 0

    con = db()
    sql = """
    INSERT OR IGNORE INTO hotels
    (id,supplier,supplier_hotel_id,name,country,city,area,address,currency,price,rating,review_count,image,latitude,longitude,map_url,source_note,imported_at,high_res_image,facilities,description,last_enriched_at,image_currency_fixed_at)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
    """

    added = 0

    for row in rows:
        before = con.total_changes
        con.execute(sql, row)
        if con.total_changes > before:
            added += 1
            KNOWN.add(str(row[2]))

    con.commit()
    con.close()
    return added

print("FAST DEEP CITY EXTRACTION — ALL BOOKABLE ACCOMMODATIONS STARTED", flush=True)
print("Starting count:", count_hotels(), flush=True)
backup("BEFORE_FAST_DEEP_CITY_ALL_ACCOMMODATIONS")

added_since_backup = 0

while count_hotels() < TARGET:
    if not STATE["queue"]:
        fill_queue()

    if not STATE["queue"]:
        print("No destinations discovered. Sleeping and retrying.", flush=True)
        time.sleep(300)
        continue

    item = STATE["queue"].pop(0)
    save_state()

    dest_id = item["dest_id"]
    label = item["label"]
    dest_type = item.get("dest_type", "city")

    print("\nDESTINATION:", label, "|", dest_type, "|", dest_id, flush=True)

    destination_added = 0
    zero_streak = 0

    for page in range(1, MAX_PAGES_PER_DESTINATION + 1):
        hotels = fetch_properties(dest_id, dest_type, page)
        rows = [row for row in (normalize(h) for h in hotels) if row]

        added = insert_rows(rows)
        destination_added += added
        added_since_backup += added

        current = count_hotels()
        print(f"{current:,}/{TARGET:,} | {label} | page {page} | fetched {len(hotels)} | added {added} | destination_added {destination_added}", flush=True)

        if added == 0:
            zero_streak += 1
        else:
            zero_streak = 0

        if page >= LOW_YIELD_CHECK_PAGE and destination_added < LOW_YIELD_MIN_ADDED:
            print("Low-yield destination. Moving on quickly.", flush=True)
            break

        if zero_streak >= ZERO_STREAK_LIMIT:
            print("Destination saturated. Moving on.", flush=True)
            break

        if not hotels:
            print("No more results for this destination.", flush=True)
            break

        if added_since_backup >= BACKUP_EVERY_ADDED:
            backup("PROGRESS_FAST_DEEP_CITY")
            added_since_backup = 0

    if destination_added == 0:
        DEAD_DESTINATIONS.add(dest_id)
        save_state()

    pass  # storage optimized: no per-destination full DB backup

print("Target reached:", count_hotels(), flush=True)
backup("FINAL_FAST_DEEP_CITY_ALL_ACCOMMODATIONS")





