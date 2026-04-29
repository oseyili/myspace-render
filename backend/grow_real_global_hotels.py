import os, time, sqlite3, requests, shutil
from datetime import datetime, UTC
from pathlib import Path

DB = "hotel_catalog.db"
TARGET = 300000

SLEEP_BETWEEN_REQUESTS = 0.8
PAUSE_ON_429_SECONDS = 90
MAX_PAGES_PER_CITY = 80
ZERO_STREAK_LIMIT = 8
BACKUP_DIR = Path(r"C:\frontend\hotel-booking-app\database_backups")
BACKUP_DIR.mkdir(parents=True, exist_ok=True)

def load_env():
    if os.path.exists(".env"):
        for line in open(".env", encoding="utf-8", errors="ignore"):
            line = line.strip()
            if line and not line.startswith("#") and "=" in line:
                k, v = line.split("=", 1)
                os.environ.setdefault(k.strip(), v.strip().strip('"').strip("'"))

load_env()

HOST = os.getenv("RAPIDAPI_HOST", "apidojo-booking-v1.p.rapidapi.com")
KEY = os.getenv("RAPIDAPI_KEY", "")

if not KEY:
    raise SystemExit("RAPIDAPI_KEY not loaded. No fake hotels created.")

HEADERS = {"X-RapidAPI-Key": KEY, "X-RapidAPI-Host": HOST}

PRIORITY_CITIES = [
    # UK
    "London United Kingdom","Manchester United Kingdom","Birmingham United Kingdom","Liverpool United Kingdom",
    "Leeds United Kingdom","Bristol United Kingdom","Newcastle United Kingdom","Nottingham United Kingdom",
    "Sheffield United Kingdom","Leicester United Kingdom","Coventry United Kingdom","Oxford United Kingdom",
    "Cambridge United Kingdom","York United Kingdom","Bath United Kingdom","Brighton United Kingdom",
    "Bournemouth United Kingdom","Southampton United Kingdom","Portsmouth United Kingdom","Cardiff United Kingdom",
    "Swansea United Kingdom","Edinburgh United Kingdom","Glasgow United Kingdom","Aberdeen United Kingdom",
    "Inverness United Kingdom","Belfast United Kingdom",

    # Nigeria
    "Lagos Nigeria","Abuja Nigeria","Port Harcourt Nigeria","Ibadan Nigeria","Kano Nigeria","Enugu Nigeria",
    "Calabar Nigeria","Uyo Nigeria","Benin City Nigeria","Abeokuta Nigeria","Owerri Nigeria","Warri Nigeria",
    "Asaba Nigeria","Ilorin Nigeria","Jos Nigeria","Kaduna Nigeria","Akure Nigeria",

    # USA
    "New York United States","Los Angeles United States","Miami United States","Orlando United States",
    "Las Vegas United States","Chicago United States","San Francisco United States","Boston United States",
    "Washington United States","Seattle United States","San Diego United States","Houston United States",
    "Dallas United States","Austin United States","Atlanta United States","New Orleans United States",
    "Nashville United States","Denver United States","Phoenix United States","Honolulu United States",

    # Brazil
    "Rio de Janeiro Brazil","Sao Paulo Brazil","Salvador Brazil","Brasilia Brazil","Florianopolis Brazil",
    "Recife Brazil","Fortaleza Brazil","Natal Brazil","Curitiba Brazil","Manaus Brazil",

    # Kenya
    "Nairobi Kenya","Mombasa Kenya","Malindi Kenya","Diani Beach Kenya","Naivasha Kenya","Kisumu Kenya",
    "Nakuru Kenya","Eldoret Kenya","Lamu Kenya",

    # South Africa
    "Cape Town South Africa","Johannesburg South Africa","Durban South Africa","Pretoria South Africa",
    "Sandton South Africa","Stellenbosch South Africa","Port Elizabeth South Africa","Knysna South Africa",
    "Hermanus South Africa","Bloemfontein South Africa",

    # Major world hubs
    "Paris France","Nice France","Lyon France","Marseille France","Madrid Spain","Barcelona Spain",
    "Valencia Spain","Seville Spain","Malaga Spain","Rome Italy","Milan Italy","Venice Italy",
    "Florence Italy","Naples Italy","Berlin Germany","Munich Germany","Hamburg Germany","Frankfurt Germany",
    "Amsterdam Netherlands","Rotterdam Netherlands","Brussels Belgium","Bruges Belgium","Lisbon Portugal",
    "Porto Portugal","Zurich Switzerland","Geneva Switzerland","Vienna Austria","Prague Czech Republic",
    "Budapest Hungary","Athens Greece","Santorini Greece","Mykonos Greece","Istanbul Turkey","Antalya Turkey",
    "Dubai United Arab Emirates","Abu Dhabi United Arab Emirates","Doha Qatar","Riyadh Saudi Arabia",
    "Jeddah Saudi Arabia","Cairo Egypt","Marrakech Morocco","Casablanca Morocco","Accra Ghana",
    "Dar es Salaam Tanzania","Zanzibar Tanzania","Kampala Uganda","Kigali Rwanda","Bangkok Thailand",
    "Phuket Thailand","Krabi Thailand","Singapore Singapore","Tokyo Japan","Osaka Japan","Kyoto Japan",
    "Seoul South Korea","Busan South Korea","Hong Kong","Kuala Lumpur Malaysia","Penang Malaysia",
    "Bali Indonesia","Jakarta Indonesia","Manila Philippines","Cebu Philippines","Hanoi Vietnam",
    "Ho Chi Minh City Vietnam","Da Nang Vietnam","Mumbai India","Delhi India","Goa India","Jaipur India",
    "Sydney Australia","Melbourne Australia","Brisbane Australia","Perth Australia","Auckland New Zealand",
    "Queenstown New Zealand","Toronto Canada","Vancouver Canada","Montreal Canada","Mexico City Mexico",
    "Cancun Mexico","Playa del Carmen Mexico","Tulum Mexico","Buenos Aires Argentina","Santiago Chile",
    "Bogota Colombia","Cartagena Colombia","Lima Peru"
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
    safe_label = label.replace(" ", "_").replace("/", "_").replace("-", "m")
    out = BACKUP_DIR / f"hotel_catalog_{safe_label}_{stamp}.db"
    shutil.copyfile(DB, out)
    print("LOCAL BACKUP SAVED:", out, flush=True)

def known_ids():
    con = db()
    ids = set(str(r[0]) for r in con.execute(
        "SELECT supplier_hotel_id FROM hotels WHERE supplier_hotel_id IS NOT NULL AND supplier_hotel_id != ''"
    ))
    con.close()
    return ids

KNOWN = known_ids()

def high_res(url):
    return str(url or "").replace("square60", "max1024x768").replace("square90", "max1024x768").replace("square200", "max1024x768").replace("max300", "max1024x768")

def safe_get(path, params):
    time.sleep(SLEEP_BETWEEN_REQUESTS)
    r = requests.get(f"https://{HOST}{path}", headers=HEADERS, params=params, timeout=35)

    if r.status_code == 429:
        print("RATE LIMIT 429. Pausing safely.", flush=True)
        time.sleep(PAUSE_ON_429_SECONDS)
        return None

    if r.status_code in [401, 403]:
        raise SystemExit(f"Provider blocked or unauthorized: {r.status_code} {r.text[:200]}")

    if r.status_code != 200:
        print("Provider status:", r.status_code, r.text[:120], flush=True)
        return None

    try:
        return r.json()
    except Exception:
        return None

def find_destination(search_text):
    data = safe_get("/locations/auto-complete", {"text": search_text, "languagecode": "en-us"})
    items = data if isinstance(data, list) else (data or {}).get("data") or []

    best = None
    for item in items:
        if str(item.get("dest_type", "")).lower() == "city" and item.get("dest_id"):
            best = item
            break

    if not best:
        return None, None

    return str(best["dest_id"]), best.get("label") or best.get("name") or search_text

def fetch_page(dest_id, page):
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

    if not isinstance(data, dict):
        return []

    return data.get("result") or []

def normalize(hotel):
    hid = str(hotel.get("hotel_id") or "").strip()
    name = str(hotel.get("hotel_name") or hotel.get("hotel_name_trans") or "").strip()

    if not hid or not name or hid in KNOWN:
        return None

    image = high_res(hotel.get("main_photo_url") or "")
    if not image:
        return None

    now = datetime.now(UTC).isoformat()

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
        "COUNTRY PRIORITY DEEP CITY IMPORT",
        now,
        image,
        str(hotel.get("hotel_facilities") or ""),
        str(hotel.get("accommodation_type_name") or hotel.get("review_score_word") or ""),
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

print("COUNTRY PRIORITY DEEP IMPORT STARTED", flush=True)
print("Starting count:", count_hotels(), flush=True)
backup("BEFORE_COUNTRY_PRIORITY_DEEP_IMPORT")

for search_text in PRIORITY_CITIES:
    if count_hotels() >= TARGET:
        break

    dest_id, label = find_destination(search_text)
    print("\nCITY:", search_text, "| DEST:", dest_id, "| LABEL:", label, flush=True)

    if not dest_id:
        continue

    city_added = 0
    zero_streak = 0

    for page in range(1, MAX_PAGES_PER_CITY + 1):
        hotels = fetch_page(dest_id, page)
        rows = [row for row in (normalize(h) for h in hotels) if row]

        added = insert_rows(rows)
        city_added += added
        current = count_hotels()

        print(f"{current:,}/{TARGET:,} | {label} | page {page} | fetched {len(hotels)} | added {added} | city_added {city_added}", flush=True)

        if added == 0:
            zero_streak += 1
        else:
            zero_streak = 0

        if page >= 5 and city_added < 10:
            print("City is saturated. Backing up and moving to next major city.", flush=True)
            break

        if not hotels:
            print("Provider returned no hotels for this page. City done.", flush=True)
            break

        if current >= TARGET:
            break

    backup("AFTER_CITY_" + search_text)

backup("FINAL_COUNTRY_PRIORITY_DEEP_IMPORT")
print("Finished count:", count_hotels(), flush=True)

