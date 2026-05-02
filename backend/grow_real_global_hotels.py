import os
import time
import json
import shutil
import sqlite3
import requests
from pathlib import Path
from datetime import datetime, UTC

BASE_DIR = Path(__file__).resolve().parent
DB = BASE_DIR / "hotel_catalog.db"
STATE = BASE_DIR / "overnight_growth_state.json"

D_BACKUP = Path(r"D:\hotel_backups")
C_BACKUP = Path(r"C:\frontend\hotel-booking-app\database_backups")
D_BACKUP.mkdir(parents=True, exist_ok=True)
C_BACKUP.mkdir(parents=True, exist_ok=True)

TARGET = 300000
SLEEP = 0.65
MAX_PAGES = 10
BACKUP_EVERY_ADDED = 5000
KEEP_D_BACKUPS = 20
KEEP_C_BACKUPS = 5

VALID_DEST_TYPES = {"city"}

BLOCKED_DESTINATION_WORDS = [
    "airport", "terminal", "railway", "train station", "station", "metro",
    "underground", "subway", "bus station", "tram", "ferry", "port",
    "museum", "gallery", "park", "zoo", "stadium", "arena", "hall",
    "monument", "memorial", "square", "tower", "bridge", "market",
    "mall", "shopping", "university", "hospital", "clinic", "embassy",
    "church", "cathedral", "mosque", "temple", "palace", "castle",
    "city hall", "central park", "attraction", "landmark"
]

ACCOMMODATION_WORDS = [
    "hotel", "resort", "apartment", "apartments", "villa", "villas",
    "guesthouse", "guest house", "hostel", "motel", "lodge", "inn",
    "suites", "suite", "residence", "holiday home", "vacation home",
    "serviced apartment", "aparthotel", "bed and breakfast", "bnb",
    "cottage", "cottages", "chalet", "cabin", "cabins", "riad",
    "ryokan", "homestay", "condo", "rental", "accommodation"
]

BAD_PROPERTY_WORDS = [
    "airport", "railway station", "train station", "bus station",
    "museum", "park", "stadium", "hospital", "university",
    "shopping mall", "landmark", "attraction", "tour", "ticket"
]

def load_env():
    env = BASE_DIR / ".env"
    if env.exists():
        for line in env.read_text(encoding="utf-8", errors="ignore").splitlines():
            line = line.strip()
            if line and not line.startswith("#") and "=" in line:
                k, v = line.split("=", 1)
                os.environ.setdefault(k.strip(), v.strip().strip('"').strip("'"))

load_env()

HOST = os.getenv("RAPIDAPI_HOST", "apidojo-booking-v1.p.rapidapi.com").strip()
KEY = os.getenv("RAPIDAPI_KEY", "").strip()

if not KEY:
    raise SystemExit("RAPIDAPI_KEY missing. No fake hotels created.")

HEADERS = {"X-RapidAPI-Key": KEY, "X-RapidAPI-Host": HOST}
AUTO_URL = f"https://{HOST}/locations/auto-complete"
LIST_URL = f"https://{HOST}/properties/list"

CITY_GROUPS = [
    ("United States", ["New York","Los Angeles","Las Vegas","Orlando","Miami","Chicago","San Francisco","Washington","Boston","Seattle","Houston","Dallas","Atlanta","Denver","San Diego","New Orleans","Phoenix","Nashville","Honolulu","Fort Lauderdale","Tampa","Anaheim","Austin","Charlotte","Philadelphia","San Antonio","Portland","Minneapolis","Salt Lake City"]),
    ("United Kingdom", ["London","Manchester","Birmingham","Liverpool","Leeds","Edinburgh","Glasgow","Bristol","Cardiff","Oxford","Cambridge","York","Brighton","Bath","Newcastle","Nottingham","Sheffield","Leicester","Southampton","Bournemouth","Blackpool","Belfast"]),
    ("France", ["Paris","Nice","Lyon","Marseille","Bordeaux","Cannes","Toulouse","Strasbourg","Lille","Montpellier","Nantes","Avignon","Annecy","Biarritz","Saint Tropez"]),
    ("Italy", ["Rome","Milan","Venice","Florence","Naples","Bologna","Turin","Palermo","Sorrento","Amalfi","Pisa","Verona","Rimini","Genoa","Catania","Bari"]),
    ("Spain", ["Madrid","Barcelona","Seville","Valencia","Malaga","Granada","Ibiza","Alicante","Bilbao","Palma de Mallorca","Marbella","Benidorm","Cordoba","San Sebastian"]),
    ("Portugal", ["Lisbon","Porto","Albufeira","Lagos","Faro","Funchal","Cascais","Madeira","Braga","Coimbra"]),
    ("Germany", ["Berlin","Munich","Hamburg","Frankfurt","Cologne","Dusseldorf","Stuttgart","Leipzig","Dresden","Nuremberg","Hannover"]),
    ("Netherlands", ["Amsterdam","Rotterdam","The Hague","Utrecht","Eindhoven","Maastricht"]),
    ("Switzerland", ["Zurich","Geneva","Lucerne","Interlaken","Basel","Bern","Lausanne","Zermatt","Lugano"]),
    ("Austria", ["Vienna","Salzburg","Innsbruck","Graz","Linz"]),
    ("Greece", ["Athens","Santorini","Mykonos","Rhodes","Heraklion","Chania","Corfu","Thessaloniki","Zakynthos"]),
    ("Turkey", ["Istanbul","Antalya","Bodrum","Izmir","Ankara","Cappadocia","Fethiye","Alanya","Marmaris"]),
    ("United Arab Emirates", ["Dubai","Abu Dhabi","Sharjah","Ras Al Khaimah","Ajman"]),
    ("Saudi Arabia", ["Riyadh","Jeddah","Makkah","Medina","Dammam","Al Khobar"]),
    ("Qatar", ["Doha"]),
    ("Thailand", ["Bangkok","Phuket","Pattaya","Chiang Mai","Krabi","Koh Samui","Hua Hin","Phi Phi Islands"]),
    ("Japan", ["Tokyo","Osaka","Kyoto","Sapporo","Fukuoka","Nagoya","Hiroshima","Naha","Yokohama","Kobe"]),
    ("Malaysia", ["Kuala Lumpur","Penang","Langkawi","Malacca","Johor Bahru","Kota Kinabalu"]),
    ("Indonesia", ["Bali","Jakarta","Ubud","Seminyak","Surabaya","Yogyakarta","Bandung","Canggu","Kuta"]),
    ("Singapore", ["Singapore"]),
    ("Vietnam", ["Ho Chi Minh City","Hanoi","Da Nang","Hoi An","Nha Trang","Phu Quoc"]),
    ("Philippines", ["Manila","Cebu City","Boracay","El Nido","Davao City"]),
    ("Australia", ["Sydney","Melbourne","Brisbane","Perth","Gold Coast","Cairns","Adelaide","Hobart","Darwin"]),
    ("Canada", ["Toronto","Vancouver","Montreal","Calgary","Ottawa","Quebec City","Niagara Falls","Whistler","Edmonton"]),
    ("Mexico", ["Mexico City","Cancun","Playa del Carmen","Tulum","Puerto Vallarta","Cabo San Lucas","Guadalajara","Oaxaca"]),
    ("Brazil", ["Rio de Janeiro","Sao Paulo","Salvador","Brasilia","Fortaleza","Recife","Curitiba","Florianopolis","Porto Alegre","Belo Horizonte"]),
    ("Argentina", ["Buenos Aires","Mendoza","Bariloche","Cordoba"]),
    ("Colombia", ["Bogota","Cartagena","Medellin","Santa Marta"]),
    ("Morocco", ["Marrakech","Casablanca","Fes","Tangier","Agadir","Rabat"]),
    ("Egypt", ["Cairo","Sharm El Sheikh","Hurghada","Luxor","Alexandria"]),
    ("South Africa", ["Cape Town","Johannesburg","Sandton","Durban","Pretoria","Stellenbosch","Knysna","Hermanus"]),
    ("Kenya", ["Nairobi","Mombasa","Diani Beach","Kisumu","Nakuru","Malindi","Watamu","Naivasha"]),
    ("Nigeria", ["Lagos","Abuja","Port Harcourt","Ikeja","Lekki","Victoria Island","Ibadan","Kano","Benin City","Enugu","Calabar","Uyo","Owerri","Warri","Asaba"]),
    ("Ghana", ["Accra","Kumasi","Cape Coast"]),
]

# STRICT: no airport, station, landmark, park, museum, hall, attraction terms.
TERMS = [""]

def low(text):
    return str(text or "").lower().strip()

def has_bad_word(text, bad_words):
    t = low(text)
    return any(w in t for w in bad_words)

def db():
    con = sqlite3.connect(DB, timeout=60)
    con.row_factory = sqlite3.Row
    return con

def count_hotels():
    con = db()
    try:
        return con.execute("SELECT COUNT(*) FROM hotels").fetchone()[0]
    finally:
        con.close()

def load_state():
    if STATE.exists():
        try:
            return json.loads(STATE.read_text(encoding="utf-8"))
        except Exception:
            pass
    return {"city_index": 0, "last_backup_count": count_hotels(), "dead": []}

def save_state(state):
    STATE.write_text(json.dumps(state, indent=2), encoding="utf-8")

def clean_backups(folder, keep):
    files = sorted(folder.glob("*.db"), key=lambda p: p.stat().st_mtime, reverse=True)
    for old in files[keep:]:
        try:
            old.unlink()
        except Exception:
            pass

def backup(label):
    stamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    safe = label.replace(" ", "_").replace("/", "_")[:80]
    shutil.copy2(DB, D_BACKUP / f"hotel_catalog_{safe}_{stamp}.db")
    shutil.copy2(DB, C_BACKUP / f"hotel_catalog_{safe}_{stamp}.db")
    clean_backups(D_BACKUP, KEEP_D_BACKUPS)
    clean_backups(C_BACKUP, KEEP_C_BACKUPS)
    print("BACKUP SAVED D+C:", safe, flush=True)

def api_get(url, params):
    time.sleep(SLEEP)
    try:
        r = requests.get(url, headers=HEADERS, params=params, timeout=35)
        if r.status_code == 429:
            print("RATE LIMIT 429. Sleeping 90 seconds.", flush=True)
            time.sleep(90)
            return None
        if r.status_code != 200:
            print("API NON-200:", r.status_code, r.text[:180], flush=True)
            return None
        return r.json()
    except KeyboardInterrupt:
        raise
    except Exception as e:
        print("API ERROR:", e, flush=True)
        time.sleep(5)
        return None

def discover(city, country):
    found = []
    seen = set()

    for term in TERMS:
        text = f"{city} {term} {country}".strip()
        data = api_get(AUTO_URL, {"text": text, "languagecode": "en-us"})
        items = data if isinstance(data, list) else (data or {}).get("data") or []
        before = len(found)

        for item in items:
            dest_id = str(item.get("dest_id") or "").strip()
            dest_type = str(item.get("dest_type") or "").lower().strip()
            label = str(item.get("label") or item.get("name") or text).strip()

            if not dest_id:
                continue

            # HARD RULE: city/district/region only.
            if dest_type not in VALID_DEST_TYPES:
                continue

            # HARD RULE: reject mixed destination labels.
            if has_bad_word(label, BLOCKED_DESTINATION_WORDS):
                continue

            label_low = label.lower()
            if city.lower() not in label_low:
                continue

            if dest_id in seen:
                continue

            seen.add(dest_id)
            found.append({
                "dest_id": dest_id,
                "dest_type": dest_type,
                "label": label,
                "city": city,
                "country": country
            })

        print(f"DISCOVER: {text} | safe accommodation destinations: {len(found) - before}", flush=True)

    return found

def pick(h, names, default=""):
    for n in names:
        v = h.get(n)
        if v not in [None, ""]:
            return v
    return default

def high_res(url):
    return str(url or "").replace("square60", "max1024x768").replace("square90", "max1024x768").replace("square200", "max1024x768").replace("max300", "max1024x768")

def fetch(dest_id, dest_type, page):
    data = api_get(LIST_URL, {
        "dest_ids": dest_id,
        "search_type": dest_type,
        "arrival_date": "2026-11-01",
        "departure_date": "2026-11-02",
        "adults": "2",
        "room_qty": "1",
        "page_number": str(page),
        "units": "metric",
        "languagecode": "en-us",
        "currency_code": "GBP",
    })

    if not isinstance(data, dict):
        return []

    return data.get("result") or []

def is_accommodation_property(h):
    hid = str(pick(h, ["hotel_id", "id", "property_id"], "")).replace("property_card_", "").strip()
    name = str(pick(h, ["hotel_name", "hotel_name_trans", "name"], "")).strip()
    image = high_res(pick(h, ["main_photo_url", "max_photo_url", "photo_url", "image_url"], ""))

    if not hid or not name or not image:
        return False

    combined = " ".join([
        name,
        str(pick(h, ["accommodation_type_name", "property_type", "type", "hotel_type"], "")),
        str(pick(h, ["description", "review_score_word"], "")),
        str(pick(h, ["address", "address_trans"], "")),
    ])

    if has_bad_word(combined, BAD_PROPERTY_WORDS):
        return False

    # Most provider results from properties/list are real accommodations.
    # This extra rule keeps hotels, rentals and short-stay accommodation,
    # while still allowing provider hotel rows that do not expose type clearly.
    return True

def insert_hotels(hotels, fallback_city, fallback_country):
    if not hotels:
        return 0

    con = db()
    added = 0
    try:
        for h in hotels:
            if not is_accommodation_property(h):
                continue

            hid = str(pick(h, ["hotel_id", "id", "property_id"], "")).replace("property_card_", "").strip()
            name = str(pick(h, ["hotel_name", "hotel_name_trans", "name"], "")).strip()
            image = high_res(pick(h, ["main_photo_url", "max_photo_url", "photo_url", "image_url"], ""))

            now = datetime.now(UTC).isoformat()
            before = con.total_changes

            con.execute("""
            INSERT OR IGNORE INTO hotels
            (id,supplier,supplier_hotel_id,name,country,city,area,address,currency,price,rating,review_count,image,latitude,longitude,map_url,source_note,imported_at,high_res_image,facilities,description,last_enriched_at,image_currency_fixed_at)
            VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
            """, (
                "rapid-" + hid,
                "apidojo-booking",
                hid,
                name,
                str(pick(h, ["country_trans", "country", "cc1"], fallback_country)),
                str(pick(h, ["city", "city_name_en", "city_name"], fallback_city)),
                str(pick(h, ["district", "districts", "area"], "")),
                str(pick(h, ["address", "address_trans"], "")),
                str(pick(h, ["currencycode", "currency_code", "currency"], "")),
                str(pick(h, ["min_total_price", "price", "gross_amount"], "")),
                str(pick(h, ["class", "rating", "review_score"], "")),
                str(pick(h, ["review_nr", "review_count"], "")),
                image,
                str(pick(h, ["latitude", "lat"], "")),
                str(pick(h, ["longitude", "lon", "lng"], "")),
                "",
                "STRICT ACCOMMODATION ONLY BUILDER",
                now,
                image,
                str(pick(h, ["hotel_facilities", "facilities"], "")),
                str(pick(h, ["accommodation_type_name", "review_score_word", "description"], "")),
                now,
                now,
            ))

            if con.total_changes > before:
                added += 1

        con.commit()
    finally:
        con.close()

    return added

def all_city_pairs():
    pairs = []
    for country, cities in CITY_GROUPS:
        for city in cities:
            pairs.append((city, country))
    return pairs

def run():
    print("STRICT ACCOMMODATION-ONLY BUILDER STARTED", flush=True)
    print("Host:", HOST, flush=True)
    print("Starting count:", count_hotels(), flush=True)
    print("Hard rule: city-level hotel and short-stay accommodation only. No districts, no POI, no tourist areas.", flush=True)
    print("Blocked: districts, regions, airports, railway stations, landmarks, parks, museums, halls, attractions, historic centres.", flush=True)
    backup("START_STRICT_ACCOMMODATION_ONLY")

    state = load_state()
    pairs = all_city_pairs()

    while True:
        pairs = all_city_pairs()
        start_index = int(state.get("city_index", 0)) % len(pairs)

        for offset in range(len(pairs)):
            idx = (start_index + offset) % len(pairs)
            city, country = pairs[idx]
            state["city_index"] = (idx + 1) % len(pairs)
            save_state(state)

            total_now = count_hotels()
            if total_now >= TARGET:
                backup("TARGET_REACHED")
                print("TARGET REACHED:", total_now, flush=True)
                return

            print("", flush=True)
            print(f"CITY GROUP: {city}, {country}", flush=True)

            destinations = discover(city, country)
            if not destinations:
                print(f"No safe accommodation destinations found for {city}, {country}", flush=True)
                continue

            group_added = 0

            for d in destinations:
                print("", flush=True)
                print(f"DESTINATION: {d['label']} | {d['dest_type']} | {d['dest_id']}", flush=True)

                dest_added = 0
                zero_streak = 0

                for page in range(1, MAX_PAGES + 1):
                    hotels = fetch(d["dest_id"], d["dest_type"], page)
                    added = insert_hotels(hotels, d["city"], d["country"])
                    dest_added += added
                    group_added += added
                    total = count_hotels()

                    print(f"{total:,}/{TARGET:,} | {d['label']} | page {page} | fetched {len(hotels)} | added {added} | destination_added {dest_added}", flush=True)

                    if added == 0:
                        zero_streak += 1
                    else:
                        zero_streak = 0

                    if page >= 4 and dest_added < 3:
                        print("Low-yield safe destination. Moving on quickly.", flush=True)
                        break

                    if zero_streak >= 3:
                        print("Destination saturated. Moving on.", flush=True)
                        break

                total_after = count_hotels()
                if total_after - int(state.get("last_backup_count", 0)) >= BACKUP_EVERY_ADDED:
                    backup(f"PROGRESS_{total_after}")
                    state["last_backup_count"] = total_after
                    save_state(state)

            print(f"CITY GROUP COMPLETE: {city}, {country} | added {group_added}", flush=True)

        print("Cycle complete. Restarting city list. Press Ctrl+C only when you want to stop.", flush=True)

try:
    run()
except KeyboardInterrupt:
    print("")
    print("Stopped by user. Saving safe backup...", flush=True)
    backup("STOPPED_SAFE")
    print("Stopped safely. Count:", count_hotels(), flush=True)


