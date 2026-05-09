from fastapi import FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from dotenv import load_dotenv
import os
import uuid
import json
import sqlite3
import requests
import time
from datetime import datetime
from pathlib import Path
from urllib.parse import urljoin, urlparse

load_dotenv()

app = FastAPI(title="MySpace Hotel Booking Backend")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

STRIPE_SECRET_KEY = os.getenv("STRIPE_SECRET_KEY", "")
PUBLIC_APP_URL = os.getenv("PUBLIC_APP_URL", "http://localhost:5173").rstrip("/")
HOTELBEDS_DEFAULT_DESTINATION = os.getenv("HOTELBEDS_DEFAULT_DESTINATION", "LON")

DESTINATION_LOCAL_CURRENCY = {
    "LON": "GBP", "DUB": "EUR",
    "PAR": "EUR", "BCN": "EUR", "MAD": "EUR", "PMI": "EUR", "AGP": "EUR", "ALC": "EUR",
    "AMS": "EUR", "BER": "EUR", "VIE": "EUR", "FAO": "EUR", "NCE": "EUR", "ATH": "EUR", "ROM": "EUR", "LIS": "EUR",
    "PRG": "CZK",
    "IST": "TRY",
    "DXB": "AED",
    "NYC": "USD",
    "BKK": "THB",
    "TYO": "JPY",
    "SIN": "SGD",
    "ABV": "NGN", "LOS": "NGN", "NG": "NGN",
}

# Conservative display-only FX estimates against GBP. Stripe/payment still uses supplier/account currency.
GBP_TO_LOCAL_ESTIMATE = {
    "GBP": 1.0,
    "EUR": 1.17,
    "USD": 1.25,
    "AED": 4.59,
    "CZK": 29.3,
    "TRY": 40.4,
    "NGN": 1880.0,
    "THB": 45.8,
    "JPY": 193.0,
    "SGD": 1.69,
}

def expected_local_currency(destination_code):
    return DESTINATION_LOCAL_CURRENCY.get(clean(destination_code).upper(), "")

def safe_float(value):
    try:
        return float(clean(value).replace(",", ""))
    except Exception:
        return 0.0

def local_display_price(destination_code, amount, payment_currency):
    payment_currency = clean(payment_currency or "GBP").upper()
    local_currency = expected_local_currency(destination_code) or payment_currency
    amount_number = safe_float(amount)

    if amount_number <= 0:
        return {
            "display_amount": "",
            "display_currency": local_currency,
            "payment_amount": clean(amount),
            "payment_currency": payment_currency,
            "currency_note": "",
            "currency_is_estimate": False,
        }

    if local_currency == payment_currency:
        display_amount = amount_number
        note = ""
        estimate = False
    elif payment_currency == "GBP" and local_currency in GBP_TO_LOCAL_ESTIMATE:
        display_amount = amount_number * GBP_TO_LOCAL_ESTIMATE[local_currency]
        note = f"Local estimate shown in {local_currency}; payment provider may charge in {payment_currency}."
        estimate = True
    else:
        display_amount = amount_number
        local_currency = payment_currency
        note = f"Price shown in payment currency {payment_currency}."
        estimate = False

    return {
        "display_amount": f"{display_amount:.2f}",
        "display_currency": local_currency,
        "payment_amount": clean(amount),
        "payment_currency": payment_currency,
        "currency_note": note,
        "currency_is_estimate": estimate,
    }

RAPIDAPI_KEY = os.getenv("RAPIDAPI_KEY", "").strip()
RAPIDAPI_HOST = os.getenv("RAPIDAPI_HOST", "booking-com15.p.rapidapi.com").strip()
RAPIDAPI_HEADERS = {
    "X-RapidAPI-Key": RAPIDAPI_KEY,
    "X-RapidAPI-Host": RAPIDAPI_HOST,
}
DB_PATH = Path(os.getenv("DB_PATH", r"C:\frontend\hotel-booking-app\backend\myspace_auto_bookings.db"))
CATALOG_DB_PATH = Path(os.getenv("CATALOG_DB_PATH", r"C:\frontend\hotel-booking-app\backend\hotel_catalog.db"))

HOTELBEDS_IMAGE_BASES = [
    "https://photos.hotelbeds.com/giata/bigger/",
    "https://photos.hotelbeds.com/giata/medium/",
    "https://photos.hotelbeds.com/giata/small/",
]


def db():
    return sqlite3.connect(DB_PATH)


def now_iso():
    return datetime.utcnow().isoformat()


def clean(value):
    return "" if value is None else str(value)


def safe_json(value):
    try:
        return json.dumps(value)
    except Exception:
        return json.dumps([])


def make_reservation_code():
    return "MSH-" + datetime.utcnow().strftime("%Y%m%d") + "-" + uuid.uuid4().hex[:6].upper()


def ensure_column(con, table, column, definition):
    existing = [row[1] for row in con.execute(f"PRAGMA table_info({table})").fetchall()]
    if column not in existing:
        con.execute(f"ALTER TABLE {table} ADD COLUMN {column} {definition}")




def import_seed_data_if_empty():
    data_dir = Path(__file__).parent / "data"
    rates_path = data_dir / "hotel_live_rates_seed.json"
    images_path = data_dir / "hotel_images_live_backup.json"

    con = db()

    try:
        existing_rates = con.execute("SELECT COUNT(*) FROM hotel_live_rates").fetchone()[0]
        existing_images = con.execute("SELECT COUNT(*) FROM hotel_images").fetchone()[0]

        if existing_rates == 0 and rates_path.exists():
            import json
            rates = json.loads(rates_path.read_text(encoding="utf-8"))

            for r in rates:
                columns = list(r.keys())
                values = [r.get(c) for c in columns]
                placeholders = ",".join(["?"] * len(columns))
                col_sql = ",".join(columns)

                con.execute(
                    f"INSERT OR IGNORE INTO hotel_live_rates ({col_sql}) VALUES ({placeholders})",
                    values,
                )

            print("SEEDED LIVE RATES:", len(rates))

        if existing_images == 0 and images_path.exists():
            import json
            images = json.loads(images_path.read_text(encoding="utf-8"))

            for item in images:
                save_verified_image(
                    con,
                    clean(item.get("hotel_code")),
                    clean(item.get("destination_code")).upper(),
                    clean(item.get("hotel_name")),
                    clean(item.get("image_url")),
                    clean(item.get("source") or "seeded_live_image_backup"),
                )

            print("SEEDED IMAGE URLS:", len(images))

        con.commit()

    except Exception as exc:
        print("SEED IMPORT SKIPPED:", str(exc)[:500])

    finally:
        con.close()


def init_db():
    con = db()

    con.execute("""
    CREATE TABLE IF NOT EXISTS hotel_live_rates (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        search_reference TEXT,
        hotel_code TEXT,
        hotel_name TEXT,
        destination_code TEXT,
        zone_code TEXT,
        zone_name TEXT,
        latitude TEXT,
        longitude TEXT,
        category_code TEXT,
        category_name TEXT,
        room_code TEXT,
        room_name TEXT,
        board_code TEXT,
        board_name TEXT,
        rate_key TEXT,
        rate_type TEXT,
        payment_type TEXT,
        packaging TEXT,
        allotment TEXT,
        net TEXT,
        selling_rate TEXT,
        currency TEXT,
        cancellation_policies TEXT,
        rate_comments TEXT,
        raw_hotel_json TEXT,
        raw_room_json TEXT,
        raw_rate_json TEXT,
        checkin TEXT,
        checkout TEXT,
        guests INTEGER,
        rooms INTEGER,
        created_at TEXT
    )
    """)

    con.execute("""
    CREATE TABLE IF NOT EXISTS hotel_images (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        hotel_code TEXT NOT NULL,
        destination_code TEXT,
        hotel_name TEXT,
        image_url TEXT NOT NULL,
        caption TEXT,
        source TEXT,
        verified INTEGER DEFAULT 1,
        updated_at TEXT,
        UNIQUE(hotel_code, image_url)
    )
    """)

    con.execute("""
    CREATE INDEX IF NOT EXISTS idx_hotel_images_code_verified
    ON hotel_images(hotel_code, verified)
    """)

    con.execute("""
    CREATE TABLE IF NOT EXISTS bookings (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        reservation_code TEXT UNIQUE,
        hotel_id TEXT,
        hotel_name TEXT,
        destination TEXT,
        customer_name TEXT,
        customer_email TEXT,
        customer_phone TEXT,
        guests INTEGER,
        rooms INTEGER,
        checkin TEXT,
        checkout TEXT,
        note TEXT,
        rate_key TEXT,
        amount TEXT,
        currency TEXT,
        room_name TEXT,
        board_name TEXT,
        payment_type TEXT,
        cancellation_policies TEXT,
        packaging TEXT,
        allotment TEXT,
        status TEXT,
        supplier_reference TEXT,
        stripe_session_id TEXT,
        created_at TEXT,
        updated_at TEXT
    )
    """)

    required_booking_columns = {
        "reservation_code": "TEXT UNIQUE",
        "hotel_id": "TEXT",
        "hotel_name": "TEXT",
        "destination": "TEXT",
        "customer_name": "TEXT",
        "customer_email": "TEXT",
        "customer_phone": "TEXT",
        "guests": "INTEGER",
        "rooms": "INTEGER",
        "checkin": "TEXT",
        "checkout": "TEXT",
        "note": "TEXT",
        "rate_key": "TEXT",
        "amount": "TEXT",
        "currency": "TEXT",
        "room_name": "TEXT",
        "board_name": "TEXT",
        "payment_type": "TEXT",
        "cancellation_policies": "TEXT",
        "packaging": "TEXT",
        "allotment": "TEXT",
        "status": "TEXT",
        "supplier_reference": "TEXT",
        "stripe_session_id": "TEXT",
        "created_at": "TEXT",
        "updated_at": "TEXT",
    }

    for column, definition in required_booking_columns.items():
        ensure_column(con, "bookings", column, definition)

    con.commit()
    con.close()


@app.on_event("startup")
def startup():
    init_db()
    import_seed_data_if_empty()


def pick(item, keys, default=""):
    if not isinstance(item, dict):
        return default
    for key in keys:
        if key in item and item[key] not in [None, ""]:
            return item[key]
    return default


def extract_list(data):
    if isinstance(data, list):
        return data
    if not isinstance(data, dict):
        return []

    for key in ["data", "result", "results", "hotels", "properties", "items"]:
        value = data.get(key)
        if isinstance(value, list):
            return value
        if isinstance(value, dict):
            nested = extract_list(value)
            if nested:
                return nested

    return []


def rapid_get(path, params):
    if not RAPIDAPI_KEY:
        return None

    try:
        response = requests.get(
            f"https://{RAPIDAPI_HOST}{path}",
            headers=RAPIDAPI_HEADERS,
            params=params,
            timeout=25,
        )
    except Exception:
        return None

    if response.status_code != 200:
        return None

    try:
        return response.json()
    except Exception:
        return None


def is_bad_image_url(url):
    value = clean(url).strip()
    upper = value.upper()

    if not value:
        return True

    bad_parts = [
        "PASTE_REAL",
        "PUT_THE_REAL",
        "PLACEHOLDER",
        "IMAGE_URL_HERE",
        "UNSPLASH.COM",
        "PEXELS.COM",
        "PIXABAY.COM",
    ]

    return any(part in upper for part in bad_parts)


def image_domain(url):
    try:
        return urlparse(clean(url).strip()).netloc.lower()
    except Exception:
        return ""


def normalize_supplier_image_url(value):
    raw = clean(value).strip()

    if is_bad_image_url(raw):
        return ""

    lowered = raw.lower()

    if lowered.startswith("http://") or lowered.startswith("https://"):
        if any(ext in lowered for ext in [".jpg", ".jpeg", ".png", ".webp"]):
            return raw
        return ""

    if any(ext in lowered for ext in [".jpg", ".jpeg", ".png", ".webp"]):
        path = raw.lstrip("/")
        return urljoin(HOTELBEDS_IMAGE_BASES[0], path)

    return ""


def collect_image_urls_from_json(value):
    urls = []

    def walk(node):
        if isinstance(node, dict):
            for key, val in node.items():
                key_text = clean(key).lower()

                if isinstance(val, str):
                    possible_image_key = (
                        "image" in key_text
                        or "photo" in key_text
                        or "picture" in key_text
                        or key_text in ["path", "url"]
                    )

                    if possible_image_key:
                        normalized = normalize_supplier_image_url(val)
                        if normalized and normalized not in urls:
                            urls.append(normalized)

                walk(val)

        elif isinstance(node, list):
            for item in node:
                walk(item)

    if not value:
        return urls

    try:
        parsed = json.loads(value) if isinstance(value, str) else value
    except Exception:
        return urls

    walk(parsed)
    return urls


def find_supplier_image_by_hotel_name(hotel_name, destination_code):
    if not RAPIDAPI_KEY:
        return ""

    query = clean(hotel_name).strip()
    if not query:
        return ""

    search_paths = [
        "/api/v1/hotels/searchDestination",
        "/v1/hotels/locations",
    ]

    destination_items = []

    for path in search_paths:
        params = {"query": query} if "api/v1" in path else {"name": query, "locale": "en-gb"}
        data = rapid_get(path, params)
        destination_items.extend(extract_list(data))
        time.sleep(0.15)

    hotel_name_lower = query.lower()

    for item in destination_items:
        item_name = clean(pick(item, [
            "name", "label", "hotel_name", "hotelName", "property_name", "propertyName",
            "display_name", "displayName"
        ])).lower()

        image = clean(pick(item, [
            "main_photo_url", "photoMainUrl", "image_url", "imageUrl",
            "max_photo_url", "photo_url", "thumbnail"
        ])).strip()

        if image and not is_bad_image_url(image) and hotel_name_lower in item_name:
            return image

    return ""


def delete_bad_verified_images(con):
    con.execute("""
    DELETE FROM hotel_images
    WHERE image_url IS NULL
       OR image_url = ''
       OR UPPER(image_url) LIKE '%PASTE_REAL%'
       OR UPPER(image_url) LIKE '%PUT_THE_REAL%'
       OR UPPER(image_url) LIKE '%PLACEHOLDER%'
       OR UPPER(image_url) LIKE '%IMAGE_URL_HERE%'
       OR UPPER(image_url) LIKE '%UNSPLASH.COM%'
       OR UPPER(image_url) LIKE '%PEXELS.COM%'
       OR UPPER(image_url) LIKE '%PIXABAY.COM%'
    """)


def save_verified_image(con, hotel_code, destination_code, hotel_name, image_url, source="supplier_saved_hotel_json"):
    if is_bad_image_url(image_url):
        return False

    con.execute("""
    INSERT OR REPLACE INTO hotel_images (
        hotel_code,
        destination_code,
        hotel_name,
        image_url,
        caption,
        source,
        verified,
        updated_at
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    """, (
        clean(hotel_code),
        clean(destination_code).upper(),
        clean(hotel_name),
        clean(image_url),
        "Verified supplier property image",
        source,
        1,
        now_iso(),
    ))

    return True


def auto_resolve_image_for_hotel(con, hotel_code):
    try:
        row = con.execute("""
        SELECT hotel_code, hotel_name, destination_code, raw_hotel_json, raw_room_json, raw_rate_json
        FROM hotel_live_rates
        WHERE hotel_code = ?
        ORDER BY created_at DESC
        LIMIT 1
        """, (clean(hotel_code),)).fetchone()

        if not row:
            return False

        urls = []
        urls.extend(collect_image_urls_from_json(row[3]))
        urls.extend(collect_image_urls_from_json(row[4]))
        urls.extend(collect_image_urls_from_json(row[5]))

        try:
            supplier_url = find_supplier_image_by_hotel_name(row[1], row[2])
            if supplier_url:
                urls.insert(0, supplier_url)
        except Exception as exc:
            print("Supplier image lookup skipped:", str(exc)[:250])

        for url in urls:
            try:
                if save_verified_image(con, row[0], row[2], row[1], url, "rapidapi_supplier_property_image"):
                    return True
            except Exception as exc:
                print("Image save skipped:", str(exc)[:250])

        return False

    except Exception as exc:
        print("Auto image resolver failed safely:", str(exc)[:250])
        return False


def get_catalog_image_for_hotel(hotel_name, destination_code=""):
    if not CATALOG_DB_PATH.exists():
        return ""

    name = clean(hotel_name).strip()
    if not name:
        return ""

    try:
        con = sqlite3.connect(CATALOG_DB_PATH)

        row = con.execute("""
        SELECT high_res_image, image
        FROM hotels
        WHERE LOWER(name) = LOWER(?)
          AND (high_res_image IS NOT NULL OR image IS NOT NULL)
        ORDER BY imported_at DESC
        LIMIT 1
        """, (name,)).fetchone()

        if not row:
            words = [w for w in name.lower().replace(",", " ").split() if len(w) >= 4]
            if words:
                like = "%" + "%".join(words[:3]) + "%"
                row = con.execute("""
                SELECT high_res_image, image
                FROM hotels
                WHERE LOWER(name) LIKE ?
                  AND (high_res_image IS NOT NULL OR image IS NOT NULL)
                ORDER BY imported_at DESC
                LIMIT 1
                """, (like,)).fetchone()

        con.close()

        if not row:
            return ""

        image_url = clean(row[0] or row[1]).strip()

        if is_bad_image_url(image_url):
            return ""

        return image_url

    except Exception as exc:
        print("Catalog image lookup skipped:", str(exc)[:250])
        return ""


def get_verified_image_for_hotel(con, hotel_code):
    code = clean(hotel_code)

    possible_codes = []
    if code:
        possible_codes.append(code)

        if not code.startswith("hb-"):
            possible_codes.append("hb-" + code)

        if code.startswith("hb-"):
            possible_codes.append(code.replace("hb-", "", 1))

        if not code.startswith("catalog-"):
            possible_codes.append("catalog-" + code)

    possible_codes = list(dict.fromkeys([c for c in possible_codes if c]))

    placeholders = ",".join(["?"] * len(possible_codes)) if possible_codes else "?"

    row = None

    if possible_codes:
        row = con.execute(f"""
        SELECT image_url, caption, source
        FROM hotel_images
        WHERE hotel_code IN ({placeholders})
          AND verified = 1
          AND image_url IS NOT NULL
          AND image_url != ''
          AND UPPER(image_url) NOT LIKE '%PASTE_REAL%'
          AND UPPER(image_url) NOT LIKE '%PUT_THE_REAL%'
          AND UPPER(image_url) NOT LIKE '%PLACEHOLDER%'
          AND UPPER(image_url) NOT LIKE '%IMAGE_URL_HERE%'
          AND UPPER(image_url) NOT LIKE '%UNSPLASH.COM%'
          AND UPPER(image_url) NOT LIKE '%PEXELS.COM%'
          AND UPPER(image_url) NOT LIKE '%PIXABAY.COM%'
        ORDER BY updated_at DESC, id DESC
        LIMIT 1
        """, possible_codes).fetchone()

    if not row:
        return {
            "image_url": "",
            "image_caption": "",
            "image_source": "",
            "has_verified_image": False,
        }

    return {
        "image_url": clean(row[0]),
        "image_caption": clean(row[1]),
        "image_source": clean(row[2]),
        "has_verified_image": True,
    }


def get_cached_hotels(destination_code="LON", checkin="", checkout="", guests=2, rooms=1, limit=100):
    selected_destination = clean(destination_code or HOTELBEDS_DEFAULT_DESTINATION).upper()
    con = db()
    rows = con.execute("""
    SELECT
        hotel_code,
        hotel_name,
        destination_code,
        zone_name,
        latitude,
        longitude,
        category_name,
        room_name,
        board_name,
        rate_key,
        payment_type,
        net,
        selling_rate,
        currency,
        cancellation_policies,
        packaging,
        allotment,
        MAX(created_at) as latest_created
    FROM hotel_live_rates
    WHERE destination_code = ?
      AND checkin = ?
      AND checkout = ?
      AND guests = ?
      AND rooms = ?
      AND rate_key IS NOT NULL
      AND rate_key != ''
    GROUP BY hotel_code
    ORDER BY latest_created DESC
    LIMIT ?
    """, (
        selected_destination,
        clean(checkin),
        clean(checkout),
        int(guests),
        int(rooms),
        int(limit),
    )).fetchall()

    if not rows:
        rows = con.execute("""
        SELECT
            hotel_code,
            hotel_name,
            destination_code,
            zone_name,
            latitude,
            longitude,
            category_name,
            room_name,
            board_name,
            rate_key,
            payment_type,
            net,
            selling_rate,
            currency,
            cancellation_policies,
            packaging,
            allotment,
            MAX(created_at) as latest_created
        FROM hotel_live_rates
        WHERE destination_code = ?
          AND rate_key IS NOT NULL
          AND rate_key != ''
        GROUP BY hotel_code
        ORDER BY latest_created DESC
        LIMIT ?
        """, (
            selected_destination,
            int(limit),
        )).fetchall()

    hotels = []

    for r in rows:
        try:
            cancellation_policies = json.loads(r[14] or "[]")
        except Exception:
            cancellation_policies = []

        image_data = get_verified_image_for_hotel(con, r[0])
        payment_currency = clean(r[13] or "GBP").upper()
        payment_amount = clean(r[12] or r[11])
        display_price = local_display_price(selected_destination, payment_amount, payment_currency)

        hotels.append({
            "id": clean(r[0]),
            "hotel_id": clean(r[0]),
            "hotel_name": clean(r[1]),
            "name": clean(r[1]),
            "city": clean(r[2]),
            "country": clean(r[2]),
            "area": clean(r[3]),
            "address": clean(r[3]),
            "rating": clean(r[6] or "Available"),
            "image_url": image_data["image_url"],
            "image_caption": image_data["image_caption"],
            "image_source": image_data["image_source"],
            "has_verified_image": image_data["has_verified_image"],
            "latitude": clean(r[4]),
            "longitude": clean(r[5]),
            "first_rate": {
                "rate_key": clean(r[9]),
                "currency": display_price["display_currency"],
                "display_currency": display_price["display_currency"],
                "display_amount": display_price["display_amount"],
                "payment_currency": display_price["payment_currency"],
                "payment_amount": display_price["payment_amount"],
                "currency_note": display_price["currency_note"],
                "currency_is_estimate": display_price["currency_is_estimate"],
                "net": clean(r[11]),
                "selling_rate": display_price["display_amount"],
                "supplier_selling_rate": payment_amount,
                "board_name": clean(r[8]),
                "room_name": clean(r[7] or "Selected room"),
                "cancellation_policies": cancellation_policies,
                "payment_type": clean(r[10]),
                "packaging": clean(r[15]),
                "allotment": clean(r[16]),
            },
            "source": "saved_availability",
        })

    con.commit()
    con.close()
    return hotels


DESTINATION_CODE_TO_CITY = {
    "LON": ["London", "Greater London"],
    "PAR": ["Paris"],
    "BCN": ["Barcelona"],
    "PRG": ["Prague"],
    "MAD": ["Madrid"],
    "IST": ["Istanbul"],
    "PMI": ["Palma", "Palma de Mallorca", "Mallorca"],
    "DXB": ["Dubai"],
    "AMS": ["Amsterdam"],
    "VIE": ["Vienna"],
    "FAO": ["Faro"],
    "BER": ["Berlin"],
    "AGP": ["Malaga", "MÃ¡laga"],
    "NCE": ["Nice"],
    "ATH": ["Athens"],
    "DUB": ["Dublin"],
    "ALC": ["Alicante"],
    "NYC": ["New York"],
    "ROM": ["Rome"],
    "LIS": ["Lisbon"],
    "BKK": ["Bangkok"],
    "TYO": ["Tokyo"],
    "SIN": ["Singapore"],
}


def get_catalog_hotels(destination_code="LON", keyword="", area="", limit=100, exclude_names=None):
    if not CATALOG_DB_PATH.exists():
        return []

    selected = clean(destination_code).upper()
    city_names = DESTINATION_CODE_TO_CITY.get(selected, [selected])
    exclude_names = set((exclude_names or []))

    where_parts = []
    params = []

    city_clauses = []
    for city_name in city_names:
        city_clauses.append("LOWER(city) LIKE ?")
        params.append("%" + city_name.lower() + "%")

    if city_clauses:
        where_parts.append("(" + " OR ".join(city_clauses) + ")")

    if keyword:
        where_parts.append("LOWER(name) LIKE ?")
        params.append("%" + keyword.lower().strip() + "%")

    if area:
        where_parts.append("(LOWER(area) LIKE ? OR LOWER(address) LIKE ? OR LOWER(name) LIKE ?)")
        area_text = "%" + area.lower().strip() + "%"
        params.extend([area_text, area_text, area_text])

    where_sql = " AND ".join(where_parts) if where_parts else "1=1"

    sql = f"""
    SELECT
      supplier_hotel_id,
      name,
      country,
      city,
      area,
      address,
      rating,
      image,
      high_res_image,
      latitude,
      longitude,
      review_score
    FROM hotels
    WHERE {where_sql}
      AND name IS NOT NULL
      AND TRIM(name) != ''
      AND COALESCE(high_res_image, image) IS NOT NULL
      AND COALESCE(high_res_image, image) != ''
    ORDER BY
      CASE WHEN review_score IS NULL OR review_score = '' THEN 1 ELSE 0 END,
      CAST(COALESCE(review_score, rating, 0) AS REAL) DESC
    LIMIT ?
    """
    params.append(int(limit))

    hotels = []

    try:
        con = sqlite3.connect(CATALOG_DB_PATH)
        rows = con.execute(sql, params).fetchall()
        con.close()
    except Exception as exc:
        print("Catalog fallback skipped:", str(exc)[:250])
        return []

    for r in rows:
        hotel_name = clean(r[1])
        if hotel_name.lower() in exclude_names:
            continue

        image_url = clean(r[8] or r[7])
        if is_bad_image_url(image_url):
            continue

        supplier_id = clean(r[0])
        hotel_id = "catalog-" + supplier_id if supplier_id else "catalog-" + str(abs(hash(hotel_name)))

        hotels.append({
            "id": hotel_id,
            "hotel_id": hotel_id,
            "hotel_name": hotel_name,
            "name": hotel_name,
            "city": selected,
            "country": clean(r[2]),
            "area": clean(r[4] or r[3]),
            "address": clean(r[5] or r[4] or r[3]),
            "rating": clean(r[6] or r[11] or "Real catalog hotel"),
            "image_url": image_url,
            "image_caption": "Verified real supplier image",
            "image_source": "real_catalog_fallback",
            "has_verified_image": True,
            "latitude": clean(r[9]),
            "longitude": clean(r[10]),
            "first_rate": None,
            "price_confirmation_required": True,
            "availability_message": "Real catalog hotel. Current live price and availability must be confirmed before payment.",
            "source": "real_catalog_fallback",
        })

    return hotels


def get_cached_rate(rate_key):
    con = db()
    row = con.execute("""
    SELECT
        hotel_code,
        hotel_name,
        destination_code,
        zone_name,
        room_name,
        board_name,
        payment_type,
        net,
        selling_rate,
        currency,
        cancellation_policies,
        packaging,
        allotment,
        created_at
    FROM hotel_live_rates
    WHERE rate_key = ?
    ORDER BY created_at DESC
    LIMIT 1
    """, (clean(rate_key),)).fetchone()
    con.close()

    if not row:
        return None

    try:
        cancellation_policies = json.loads(row[10] or "[]")
    except Exception:
        cancellation_policies = []

    return {
        "hotel_id": clean(row[0]),
        "hotel_name": clean(row[1]),
        "destination": clean(row[2]),
        "area": clean(row[3]),
        "room_name": clean(row[4]),
        "board_name": clean(row[5]),
        "payment_type": clean(row[6]),
        "net": clean(row[7]),
        "amount": clean(row[8] or row[7]),
        "currency": clean(row[9] or "GBP").upper(),
        "payment_amount": clean(row[8] or row[7]),
        "payment_currency": clean(row[9] or "GBP").upper(),
        "cancellation_policies": cancellation_policies,
        "packaging": clean(row[11]),
        "allotment": clean(row[12]),
        "created_at": clean(row[13]),
    }


def catalog_inventory_report():
    report = {
        "catalog_db_exists": CATALOG_DB_PATH.exists(),
        "catalog_total_hotels": 0,
        "catalog_hotels_with_images": 0,
        "catalog_unique_image_urls": 0,
        "catalog_countries_covered": 0,
        "catalog_cities_covered": 0,
        "catalog_bad_or_blocked_images": 0,
        "catalog_duplicate_image_urls": 0,
        "catalog_top_countries": [],
        "catalog_top_cities": [],
        "catalog_supplier_domains": [],
    }

    if not CATALOG_DB_PATH.exists():
        return report

    try:
        con = sqlite3.connect(CATALOG_DB_PATH)

        report["catalog_total_hotels"] = con.execute("""
        SELECT COUNT(*)
        FROM hotels
        """).fetchone()[0]

        report["catalog_hotels_with_images"] = con.execute("""
        SELECT COUNT(*)
        FROM hotels
        WHERE COALESCE(high_res_image, image) IS NOT NULL
          AND COALESCE(high_res_image, image) != ''
        """).fetchone()[0]

        report["catalog_unique_image_urls"] = con.execute("""
        SELECT COUNT(DISTINCT COALESCE(high_res_image, image))
        FROM hotels
        WHERE COALESCE(high_res_image, image) IS NOT NULL
          AND COALESCE(high_res_image, image) != ''
        """).fetchone()[0]

        report["catalog_countries_covered"] = con.execute("""
        SELECT COUNT(DISTINCT country)
        FROM hotels
        WHERE country IS NOT NULL AND TRIM(country) != ''
        """).fetchone()[0]

        report["catalog_cities_covered"] = con.execute("""
        SELECT COUNT(DISTINCT city)
        FROM hotels
        WHERE city IS NOT NULL AND TRIM(city) != ''
        """).fetchone()[0]

        bad_rows = con.execute("""
        SELECT COALESCE(high_res_image, image)
        FROM hotels
        WHERE COALESCE(high_res_image, image) IS NOT NULL
          AND COALESCE(high_res_image, image) != ''
        """).fetchall()

        bad_count = 0
        domains = {}

        for row in bad_rows:
            url = clean(row[0])
            if is_bad_image_url(url):
                bad_count += 1
            domain = image_domain(url)
            if domain:
                domains[domain] = domains.get(domain, 0) + 1

        report["catalog_bad_or_blocked_images"] = bad_count
        report["catalog_duplicate_image_urls"] = max(0, report["catalog_hotels_with_images"] - report["catalog_unique_image_urls"])

        report["catalog_top_countries"] = [
            {"country": clean(r[0]), "hotels": r[1]}
            for r in con.execute("""
            SELECT country, COUNT(*)
            FROM hotels
            WHERE country IS NOT NULL AND TRIM(country) != ''
            GROUP BY country
            ORDER BY COUNT(*) DESC
            LIMIT 20
            """).fetchall()
        ]

        report["catalog_top_cities"] = [
            {"city": clean(r[0]), "country": clean(r[1]), "hotels": r[2]}
            for r in con.execute("""
            SELECT city, country, COUNT(*)
            FROM hotels
            WHERE city IS NOT NULL AND TRIM(city) != ''
            GROUP BY city, country
            ORDER BY COUNT(*) DESC
            LIMIT 30
            """).fetchall()
        ]

        report["catalog_supplier_domains"] = [
            {"domain": k, "images": v}
            for k, v in sorted(domains.items(), key=lambda item: item[1], reverse=True)[:20]
        ]

        con.close()
        return report

    except Exception as exc:
        report["catalog_error"] = str(exc)[:250]
        return report


@app.get("/api/hotels/search")
def search_hotels(
    country: str = "uk",
    city: str = "LON",
    area: str = "",
    keyword: str = "",
    checkin: str = "",
    checkout: str = "",
    guests: int = 2,
    adults: int = 0,
    rooms: int = 1,
    destination_code: str = "",
    hotel_codes: str = "",
    facilities: str = "",
):
    selected_destination = clean(destination_code or city or HOTELBEDS_DEFAULT_DESTINATION).upper()
    selected_guests = int(adults or guests or 2)

    hotels = get_cached_hotels(
        destination_code=selected_destination,
        checkin=checkin,
        checkout=checkout,
        guests=selected_guests,
        rooms=rooms,
        limit=100,
    )

    if keyword:
        q = keyword.lower().strip()
        hotels = [h for h in hotels if q in h.get("hotel_name", "").lower()]

    if area:
        a = area.lower().strip()
        hotels = [
            h for h in hotels
            if a in h.get("area", "").lower()
            or a in h.get("address", "").lower()
            or a in h.get("hotel_name", "").lower()
        ]

    existing_names = set(clean(h.get("hotel_name")).lower() for h in hotels)
    catalog_limit = max(0, 100 - len(hotels))

    if catalog_limit > 0:
        catalog_hotels = get_catalog_hotels(
            destination_code=selected_destination,
            keyword=keyword,
            area=area,
            limit=catalog_limit,
            exclude_names=existing_names,
        )
        hotels.extend(catalog_hotels)

    return {
        "ok": True,
        "hotels": hotels,
        "count": len(hotels),
        "destination_code": selected_destination,
        "source": "saved_availability_plus_real_catalog",
        "availability_message": "Live availability is shown first. Real catalog hotels require current price confirmation before payment.",
    }



def send_reservation_email(to_email, subject, body):
    smtp_host = os.getenv("SMTP_HOST", "")
    smtp_port = int(os.getenv("SMTP_PORT", "587"))
    smtp_user = os.getenv("SMTP_USER", "")
    smtp_pass = os.getenv("SMTP_PASS", "")
    smtp_from = os.getenv("SMTP_FROM", os.getenv("SUPPORT_EMAIL", "reservations@myspace-hotel.com"))

    if not smtp_host or not smtp_user or not smtp_pass:
        print("EMAIL NOT SENT - SMTP not configured")
        print("TO:", to_email)
        print("SUBJECT:", subject)
        return False

    try:
        import smtplib
        from email.message import EmailMessage

        msg = EmailMessage()
        msg["From"] = smtp_from
        msg["To"] = to_email
        msg["Subject"] = subject
        msg.set_content(body)

        with smtplib.SMTP(smtp_host, smtp_port, timeout=30) as server:
            server.starttls()
            server.login(smtp_user, smtp_pass)
            server.send_message(msg)

        return True
    except Exception as exc:
        print("EMAIL SEND FAILED:", str(exc)[:300])
        return False


@app.get("/admin/system-check")
def admin_system_check():
    return {
        "ok": True,
        "stripe_configured": bool(os.getenv("STRIPE_SECRET_KEY", "").strip()),
        "email_configured": bool(
            os.getenv("SMTP_HOST", "").strip()
            and os.getenv("SMTP_USER", "").strip()
            and os.getenv("SMTP_PASS", "").strip()
        ),
        "reservations_email": os.getenv("RESERVATIONS_EMAIL", os.getenv("SUPPORT_EMAIL", "reservations@myspace-hotel.com")),
        "public_app_url": os.getenv("PUBLIC_APP_URL", "http://localhost:5173"),
        "note": "Secrets are not displayed.",
    }

@app.post("/reservation-request")
async def create_reservation(req: Request):
    data = await req.json()

    customer_email = clean(data.get("customer_email")).strip()
    customer_name = clean(data.get("customer_name") or "Guest").strip()
    hotel_name = clean(data.get("hotel_name") or "Selected hotel").strip()
    hotel_id = clean(data.get("hotel_id")).strip()
    destination = clean(data.get("destination")).strip()
    checkin = clean(data.get("checkin")).strip()
    checkout = clean(data.get("checkout")).strip()
    customer_phone = clean(data.get("customer_phone")).strip()
    note = clean(data.get("note")).strip()
    guests = int(data.get("guests", 1) or 1)
    rooms = int(data.get("rooms", 1) or 1)
    rate_key = clean(data.get("rate_key")).strip()
    amount_raw = clean(data.get("amount")).strip()
    currency = clean(data.get("currency")).strip().upper()
    price_display = clean(data.get("price_display")).strip()
    if not price_display:
        price_display = ((currency + " ") if currency else "") + amount_raw if amount_raw else "Latest price to be confirmed"

    if not customer_email:
        raise HTTPException(400, "Please enter your email address to continue.")

    code = make_reservation_code()
    created = now_iso()

    # 1) LIVE RATE FLOW: Stripe checkout is only used when a confirmed supplier/live rate exists.
    if rate_key:
        cached_rate = get_cached_rate(rate_key)
        if not cached_rate:
            raise HTTPException(400, "This stay is no longer available. Please choose another available stay.")

        if not STRIPE_SECRET_KEY:
            raise HTTPException(500, "Secure payment is temporarily unavailable. Please try again shortly.")

        amount_raw = clean(cached_rate.get("amount") or data.get("amount") or "50")
        currency = clean(cached_rate.get("currency") or data.get("currency") or "GBP").lower()

        try:
            amount_pence = int(round(float(amount_raw) * 100))
        except Exception:
            amount_pence = 5000

        if amount_pence < 50:
            amount_pence = 5000

        stripe_res = requests.post(
            "https://api.stripe.com/v1/checkout/sessions",
            headers={"Authorization": f"Bearer {STRIPE_SECRET_KEY}"},
            data={
                "mode": "payment",
                "success_url": f"{PUBLIC_APP_URL}/reservation-confirmed?code={code}",
                "cancel_url": f"{PUBLIC_APP_URL}/",
                "line_items[0][price_data][currency]": currency,
                "line_items[0][price_data][product_data][name]": hotel_name,
                "line_items[0][price_data][unit_amount]": str(amount_pence),
                "line_items[0][quantity]": "1",
                "customer_email": customer_email,
                "metadata[reservation_code]": code,
                "metadata[booking_status]": "PAYMENT_PENDING",
                "metadata[rate_source]": "saved_availability",
                "payment_intent_data[metadata][reservation_code]": code,
            },
            timeout=30,
        )

        try:
            stripe_data = stripe_res.json()
        except Exception:
            raise HTTPException(400, "We could not prepare secure payment at the moment. Please try again shortly.")

        if stripe_res.status_code >= 400 or not stripe_data.get("url"):
            print("Stripe checkout error:", stripe_data)
            raise HTTPException(400, "We could not prepare secure payment at the moment. Please try again shortly.")

        con = db()
        con.execute("""
        INSERT INTO bookings (
            reservation_code, hotel_id, hotel_name, destination, customer_name, customer_email,
            customer_phone, guests, rooms, checkin, checkout, note, rate_key, amount, currency,
            room_name, board_name, payment_type, cancellation_policies, packaging, allotment,
            status, stripe_session_id, created_at, updated_at
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """, (
            code,
            hotel_id or cached_rate["hotel_id"],
            hotel_name or cached_rate["hotel_name"],
            destination or cached_rate["destination"],
            customer_name,
            customer_email,
            customer_phone,
            guests,
            rooms,
            checkin,
            checkout,
            note,
            rate_key,
            amount_raw,
            currency.upper(),
            clean(data.get("room_name") or cached_rate["room_name"]),
            clean(data.get("board_name") or cached_rate["board_name"]),
            clean(data.get("payment_type") or cached_rate["payment_type"]),
            safe_json(data.get("cancellation_policies") or cached_rate["cancellation_policies"]),
            clean(data.get("packaging") or cached_rate["packaging"]),
            clean(data.get("allotment") or cached_rate["allotment"]),
            "PAYMENT_PENDING",
            stripe_data.get("id", ""),
            created,
            created,
        ))
        con.commit()
        con.close()

        return {
            "ok": True,
            "payment_url": stripe_data["url"],
            "reservation_code": code,
            "message": "Secure payment is ready.",
        }

    # 2) GLOBAL CATALOG FLOW: no Stripe yet. Customer and reservations team get emails.
    # This prevents broken Stripe checkout for hotels where current price still needs confirmation.
    con = db()
    con.execute("""
    INSERT INTO bookings (
        reservation_code, hotel_id, hotel_name, destination, customer_name, customer_email,
        customer_phone, guests, rooms, checkin, checkout, note, rate_key, amount, currency,
        room_name, board_name, payment_type, cancellation_policies, packaging, allotment,
        status, stripe_session_id, created_at, updated_at
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    """, (
        code,
        hotel_id,
        hotel_name,
        destination,
        customer_name,
        customer_email,
        customer_phone,
        guests,
        rooms,
        checkin,
        checkout,
        note,
        amount_raw,
        currency,
        amount_raw,
        currency,
        amount_raw,
        currency,
        "[]",
        amount_raw,
        currency,
        "PRICE_CONFIRMATION_REQUIRED",
        "",
        created,
        created,
    ))
    con.commit()
    con.close()

    reservations_email = os.getenv("RESERVATIONS_EMAIL", os.getenv("SUPPORT_EMAIL", "reservations@myspace-hotel.com"))

    customer_body = f"""Hello {customer_name},

Thank you for choosing MySpace Hotel.

We have received your reservation request.

Reservation code: {code}
Hotel: {hotel_name}
Destination: {destination}
Check-in: {checkin}
Check-out: {checkout}
Guests: {guests}
Rooms: {rooms}
Price shown: {price_display}

No payment is required yet.

Our reservations team will confirm the latest room availability, price, and booking conditions. Once confirmed, we will send the next secure booking step.

MySpace Hotel Reservations
{reservations_email}
"""

    admin_body = f"""New MySpace Hotel reservation request.

Reservation code: {code}
Status: PRICE_CONFIRMATION_REQUIRED

Customer:
Name: {customer_name}
Email: {customer_email}
Phone: {customer_phone}

Hotel:
Hotel ID: {hotel_id}
Hotel name: {hotel_name}
Destination: {destination}
Check-in: {checkin}
Check-out: {checkout}
Guests: {guests}
Rooms: {rooms}
Price shown to customer: {price_display}

Customer note:
{note}

Next action:
Confirm current availability, current price, cancellation terms, and payment requirement before sending secure payment.
"""

    customer_email_sent = send_reservation_email(customer_email, "MySpace Hotel reservation request received - " + code, customer_body)
    admin_email_sent = send_reservation_email(reservations_email, "New reservation request - " + code, admin_body)

    return {
        "ok": True,
        "reservation_code": code,
        "status": "PRICE_CONFIRMATION_REQUIRED",
        "customer_email_sent": customer_email_sent,
        "reservations_email_sent": admin_email_sent,
        "message": "Your request has been received. Our reservations team will confirm the latest availability, price, and next steps before payment.",
    }


@app.post("/reservation/{code}/mark-paid")
def mark_paid_return(code: str):
    con = db()
    con.execute("""
    UPDATE bookings
    SET status=?, updated_at=?
    WHERE reservation_code=?
    """, ("PAID_PENDING_SUPPLIER_CONFIRMATION", now_iso(), code))
    con.commit()
    con.close()

    return {
        "ok": True,
        "reservation_code": code,
        "message": "Payment received. Your reservation update is being processed securely.",
    }


@app.post("/admin/images/upsert")
async def upsert_hotel_image(req: Request):
    data = await req.json()

    hotel_code = clean(data.get("hotel_code")).strip()
    image_url = clean(data.get("image_url")).strip()

    if not hotel_code:
        raise HTTPException(400, "Missing hotel_code.")
    if not image_url:
        raise HTTPException(400, "Missing image_url.")
    if is_bad_image_url(image_url):
        raise HTTPException(400, "Rejected unsafe placeholder or generic image URL.")

    con = db()
    save_verified_image(
        con,
        hotel_code,
        clean(data.get("destination_code")).upper(),
        clean(data.get("hotel_name")),
        image_url,
        clean(data.get("source") or "manual_verified_property_image"),
    )
    con.commit()
    con.close()

    return {"ok": True, "hotel_code": hotel_code, "image_url": image_url}


@app.post("/admin/images/bulk-upsert")
async def bulk_upsert_hotel_images(req: Request):
    data = await req.json()

    if isinstance(data, list):
        items = data
    else:
        items = data.get("items", [])

    if not isinstance(items, list):
        raise HTTPException(400, "items must be a list.")

    con = db()
    saved = 0
    rejected = 0

    for item in items:
        hotel_code = clean(item.get("hotel_code")).strip()
        image_url = clean(item.get("image_url")).strip()

        if not hotel_code or not image_url or is_bad_image_url(image_url):
            rejected += 1
            continue

        if save_verified_image(
            con,
            hotel_code,
            clean(item.get("destination_code")).upper(),
            clean(item.get("hotel_name")),
            image_url,
            clean(item.get("source") or "bulk_verified_property_image"),
        ):
            saved += 1

    con.commit()
    con.close()

    return {"ok": True, "saved": saved, "rejected": rejected}


@app.post("/admin/images/resolve-missing")
def resolve_missing_images(destination_code: str = "LON", limit: int = 100):
    con = db()
    rows = con.execute("""
    SELECT DISTINCT hotel_code
    FROM hotel_live_rates
    WHERE destination_code = ?
    ORDER BY hotel_code
    LIMIT ?
    """, (clean(destination_code).upper(), int(limit))).fetchall()

    resolved = 0

    for row in rows:
        if auto_resolve_image_for_hotel(con, row[0]):
            resolved += 1

    con.commit()
    con.close()

    return {
        "ok": True,
        "destination_code": clean(destination_code).upper(),
        "checked": len(rows),
        "resolved": resolved,
    }


@app.post("/admin/images/cleanup-placeholders")
def cleanup_placeholder_images():
    con = db()
    before = con.execute("SELECT COUNT(*) FROM hotel_images").fetchone()[0]
    delete_bad_verified_images(con)
    after = con.execute("SELECT COUNT(*) FROM hotel_images").fetchone()[0]
    con.commit()
    con.close()

    return {
        "ok": True,
        "deleted": before - after,
        "remaining": after,
    }


@app.get("/admin/images/count")
def hotel_images_count():
    con = db()

    total = con.execute("SELECT COUNT(*) FROM hotel_images").fetchone()[0]
    verified = con.execute("SELECT COUNT(*) FROM hotel_images WHERE verified=1").fetchone()[0]
    unique_image_urls = con.execute("""
    SELECT COUNT(DISTINCT image_url)
    FROM hotel_images
    WHERE image_url IS NOT NULL AND image_url != ''
    """).fetchone()[0]
    unique_hotels_with_images = con.execute("""
    SELECT COUNT(DISTINCT hotel_code)
    FROM hotel_images
    WHERE verified=1
      AND image_url IS NOT NULL
      AND image_url != ''
    """).fetchone()[0]
    destinations_with_images = con.execute("""
    SELECT COUNT(DISTINCT destination_code)
    FROM hotel_images
    WHERE destination_code IS NOT NULL
      AND destination_code != ''
    """).fetchone()[0]
    bad_or_blocked = con.execute("""
    SELECT COUNT(*)
    FROM hotel_images
    WHERE image_url IS NULL
       OR image_url = ''
       OR UPPER(image_url) LIKE '%PASTE_REAL%'
       OR UPPER(image_url) LIKE '%PUT_THE_REAL%'
       OR UPPER(image_url) LIKE '%PLACEHOLDER%'
       OR UPPER(image_url) LIKE '%IMAGE_URL_HERE%'
       OR UPPER(image_url) LIKE '%UNSPLASH.COM%'
       OR UPPER(image_url) LIKE '%PEXELS.COM%'
       OR UPPER(image_url) LIKE '%PIXABAY.COM%'
    """).fetchone()[0]

    image_rows = con.execute("""
    SELECT image_url
    FROM hotel_images
    WHERE image_url IS NOT NULL AND image_url != ''
    """).fetchall()

    domains = {}
    for row in image_rows:
        domain = image_domain(row[0])
        if domain:
            domains[domain] = domains.get(domain, 0) + 1

    images_by_destination = [
        {"destination_code": clean(r[0]), "images": r[1], "hotels": r[2]}
        for r in con.execute("""
        SELECT destination_code, COUNT(*), COUNT(DISTINCT hotel_code)
        FROM hotel_images
        WHERE destination_code IS NOT NULL AND destination_code != ''
        GROUP BY destination_code
        ORDER BY COUNT(*) DESC
        LIMIT 50
        """).fetchall()
    ]

    source_breakdown = [
        {"source": clean(r[0]), "images": r[1]}
        for r in con.execute("""
        SELECT source, COUNT(*)
        FROM hotel_images
        GROUP BY source
        ORDER BY COUNT(*) DESC
        LIMIT 30
        """).fetchall()
    ]

    live_rates_saved = con.execute("SELECT COUNT(*) FROM hotel_live_rates").fetchone()[0]
    unique_live_rate_hotels = con.execute("SELECT COUNT(DISTINCT hotel_code) FROM hotel_live_rates").fetchone()[0]
    live_rate_destinations = con.execute("""
    SELECT COUNT(DISTINCT destination_code)
    FROM hotel_live_rates
    WHERE destination_code IS NOT NULL AND destination_code != ''
    """).fetchone()[0]

    con.close()

    catalog_report = catalog_inventory_report()

    saved_duplicate_image_urls = max(0, total - unique_image_urls)
    catalog_unique = int(catalog_report.get("catalog_unique_image_urls", 0) or 0)
    saved_unique = int(unique_image_urls or 0)

    return {
        "ok": True,
        "target_unique_real_images": 1000000,
        "saved_image_table": {
            "total_image_rows": total,
            "verified_image_rows": verified,
            "unique_image_urls": unique_image_urls,
            "unique_hotels_with_images": unique_hotels_with_images,
            "destinations_with_images": destinations_with_images,
            "duplicate_image_rows": saved_duplicate_image_urls,
            "bad_or_blocked_images": bad_or_blocked,
            "images_by_destination": images_by_destination,
            "source_breakdown": source_breakdown,
            "supplier_domains": [
                {"domain": k, "images": v}
                for k, v in sorted(domains.items(), key=lambda item: item[1], reverse=True)[:30]
            ],
        },
        "live_rate_inventory": {
            "live_rates_saved": live_rates_saved,
            "unique_live_rate_hotels": unique_live_rate_hotels,
            "live_rate_destinations": live_rate_destinations,
        },
        "catalog_inventory": catalog_report,
        "combined_current_unique_image_urls_estimate": saved_unique + catalog_unique,
        "remaining_to_1m_estimate": max(0, 1000000 - (saved_unique + catalog_unique)),
        "important_note": "This counts stored real supplier image URLs. It does not download or store image files locally.",
    }


@app.get("/reservation/{code}")
def get_reservation(code: str):
    con = db()
    row = con.execute("""
    SELECT reservation_code, hotel_name, customer_email, status, created_at
    FROM bookings
    WHERE reservation_code=?
    """, (code,)).fetchone()
    con.close()

    if not row:
        raise HTTPException(404, "Reservation not found.")

    return {
        "reservation_code": row[0],
        "hotel_name": row[1],
        "customer_email": row[2],
        "status": row[3],
        "created_at": row[4],
    }


@app.get("/admin/rates/count")
def admin_rates_count():
    con = db()
    live_rates = con.execute("SELECT COUNT(*) FROM hotel_live_rates").fetchone()[0]
    unique_hotels = con.execute("SELECT COUNT(DISTINCT hotel_code) FROM hotel_live_rates").fetchone()[0]
    latest = con.execute("SELECT MAX(created_at) FROM hotel_live_rates").fetchone()[0]
    destinations = con.execute("""
    SELECT destination_code, COUNT(DISTINCT hotel_code)
    FROM hotel_live_rates
    WHERE destination_code IS NOT NULL AND destination_code != ''
    GROUP BY destination_code
    ORDER BY COUNT(DISTINCT hotel_code) DESC
    """).fetchall()
    con.close()

    return {
        "ok": True,
        "live_rates_saved": live_rates,
        "unique_hotels_saved": unique_hotels,
        "latest_update": latest,
        "destinations": [{"code": d[0], "hotels": d[1]} for d in destinations],
    }


@app.get("/status")
def status():
    return {"ready": True, "service": "myspace-hotel-booking"}


@app.get("/image-proxy")
def image_proxy(url: str):
    try:
        if not url.startswith("http"):
            raise HTTPException(status_code=400, detail="Invalid image URL")

        if is_bad_image_url(url):
            raise HTTPException(status_code=400, detail="Blocked image URL")

        r = requests.get(url, stream=True, timeout=10)

        if r.status_code != 200:
            raise HTTPException(status_code=404, detail="Image not found")

        return StreamingResponse(
            r.iter_content(chunk_size=1024),
            media_type=r.headers.get("Content-Type", "image/jpeg")
        )

    except HTTPException:
        raise
    except Exception:
        raise HTTPException(status_code=500, detail="Image proxy failed")

@app.get("/api/real-catalog/destinations")
def api_real_catalog_destinations():
    catalog_path = Path(os.getenv("CATALOG_DB_PATH", r"C:\frontend\hotel-booking-app\backend\hotel_catalog.db"))

    if not catalog_path.exists():
        return {"ok": False, "countries": [], "total_countries": 0, "total_cities": 0, "message": "Catalog database not found."}

    con = sqlite3.connect(catalog_path)

    rows = con.execute("""
    SELECT
        COALESCE(NULLIF(TRIM(country), ''), 'Unknown') AS country,
        COALESCE(NULLIF(TRIM(city), ''), 'Unknown') AS city,
        COUNT(*) AS hotels,
        SUM(CASE WHEN COALESCE(high_res_image, image) IS NOT NULL AND COALESCE(high_res_image, image) != '' THEN 1 ELSE 0 END) AS images
    FROM hotels
    WHERE name IS NOT NULL
      AND TRIM(name) != ''
    GROUP BY country, city
    HAVING hotels > 0
    ORDER BY country ASC, hotels DESC, city ASC
    """).fetchall()

    con.close()

    grouped = {}
    for country, city, hotels, images in rows:
        country = clean(country)
        city = clean(city)
        grouped.setdefault(country, [])
        grouped[country].append({
            "city": city,
            "hotels": int(hotels or 0),
            "images": int(images or 0),
        })

    countries = [
        {
            "country": country,
            "cities": cities,
            "hotel_count": sum(c["hotels"] for c in cities),
            "image_count": sum(c["images"] for c in cities),
        }
        for country, cities in grouped.items()
    ]

    countries.sort(key=lambda x: x["hotel_count"], reverse=True)

    return {
        "ok": True,
        "countries": countries,
        "total_countries": len(countries),
        "total_cities": sum(len(c["cities"]) for c in countries),
    }


@app.get("/api/real-catalog/search")
def api_real_catalog_search(
    country: str = "",
    city: str = "",
    area: str = "",
    keyword: str = "",
    limit: int = 100,
):
    catalog_path = Path(os.getenv("CATALOG_DB_PATH", r"C:\frontend\hotel-booking-app\backend\hotel_catalog.db"))

    if not catalog_path.exists():
        return {"ok": False, "hotels": [], "count": 0, "message": "Catalog database not found."}

    selected_country = clean(country).strip()
    selected_city = clean(city).strip()
    selected_area = clean(area).strip()
    selected_keyword = clean(keyword).strip()

    where = [
        "name IS NOT NULL",
        "TRIM(name) != ''",
        "COALESCE(high_res_image, image) IS NOT NULL",
        "COALESCE(high_res_image, image) != ''",
    ]
    params = []

    if selected_country:
        where.append("LOWER(country) = LOWER(?)")
        params.append(selected_country)

    if selected_city:
        where.append("LOWER(city) = LOWER(?)")
        params.append(selected_city)

    if selected_area:
        where.append("(LOWER(area) LIKE ? OR LOWER(address) LIKE ? OR LOWER(name) LIKE ?)")
        term = "%" + selected_area.lower() + "%"
        params.extend([term, term, term])

    if selected_keyword:
        where.append("LOWER(name) LIKE ?")
        params.append("%" + selected_keyword.lower() + "%")

    params.append(max(1, min(int(limit), 200)))

    sql = f"""
    SELECT
        id,
        supplier_hotel_id,
        name,
        country,
        city,
        area,
        address,
        currency,
        price,
        rating,
        review_count,
        COALESCE(high_res_image, image) AS image_url,
        latitude,
        longitude,
        review_score
    FROM hotels
    WHERE {" AND ".join(where)}
    ORDER BY
        CASE WHEN review_score IS NULL OR review_score = '' THEN 1 ELSE 0 END,
        CAST(COALESCE(review_score, rating, 0) AS REAL) DESC,
        name ASC
    LIMIT ?
    """

    con = sqlite3.connect(catalog_path)
    rows = con.execute(sql, params).fetchall()
    con.close()

    hotels = []
    for r in rows:
        image_url = clean(r[11])
        if not image_url.startswith("http"):
            continue

        hotels.append({
            "id": clean(r[0]),
            "hotel_id": clean(r[0]),
            "supplier_hotel_id": clean(r[1]),
            "hotel_name": clean(r[2]),
            "name": clean(r[2]),
            "country": clean(r[3]),
            "city": clean(r[4]),
            "area": clean(r[5]),
            "address": clean(r[6]),
            "currency": clean(r[7] or "CONFIRM"),
            "price": clean(r[8] or ""),
            "rating": clean(r[9] or r[14] or "Real catalog hotel"),
            "review_count": clean(r[10]),
            "image_url": image_url,
            "has_verified_image": True,
            "image_source": "real_catalog",
            "latitude": clean(r[12]),
            "longitude": clean(r[13]),
            "source": "real_catalog",
            "price_confirmation_required": True,
            "availability_message": "Real catalog hotel. Current price and availability must be confirmed before payment.",
        })

    return {
        "ok": True,
        "hotels": hotels,
        "count": len(hotels),
        "source": "real_catalog",
        "message": "Real catalog hotels returned from local verified supplier catalog.",
    }


@app.get("/api/real-catalog/stats")
def api_real_catalog_stats():
    catalog_path = Path(os.getenv("CATALOG_DB_PATH", r"C:\frontend\hotel-booking-app\backend\hotel_catalog.db"))

    if not catalog_path.exists():
        return {"ok": False, "catalog_hotels": 0, "catalog_with_images": 0}

    con = sqlite3.connect(catalog_path)
    total = con.execute("SELECT COUNT(*) FROM hotels").fetchone()[0]
    images = con.execute("""
    SELECT COUNT(*) FROM hotels
    WHERE COALESCE(high_res_image, image) IS NOT NULL
      AND COALESCE(high_res_image, image) != ''
    """).fetchone()[0]
    countries = con.execute("SELECT COUNT(DISTINCT country) FROM hotels WHERE country IS NOT NULL AND TRIM(country) != ''").fetchone()[0]
    cities = con.execute("SELECT COUNT(DISTINCT country || '|' || city) FROM hotels WHERE city IS NOT NULL AND TRIM(city) != ''").fetchone()[0]
    con.close()

    return {
        "ok": True,
        "catalog_hotels": total,
        "catalog_with_images": images,
        "countries": countries,
        "cities": cities,
    }






def get_catalog_supplier_hotel(hotel_id="", hotel_name=""):
    catalog_path = Path(__file__).resolve().parent / "hotel_catalog.db"
    if not catalog_path.exists():
        return None

    con = sqlite3.connect(catalog_path)
    con.row_factory = sqlite3.Row

    row = None

    if clean(hotel_id):
        raw_id = clean(hotel_id).replace("rapid-", "")
        row = con.execute("""
        SELECT id, supplier, supplier_hotel_id, name, country, city, area, address, currency, price
        FROM hotels
        WHERE id = ?
           OR supplier_hotel_id = ?
        LIMIT 1
        """, (clean(hotel_id), raw_id)).fetchone()

    if not row and clean(hotel_name):
        row = con.execute("""
        SELECT id, supplier, supplier_hotel_id, name, country, city, area, address, currency, price
        FROM hotels
        WHERE LOWER(name) = LOWER(?)
        LIMIT 1
        """, (clean(hotel_name),)).fetchone()

    con.close()
    return dict(row) if row else None


def recursive_find_price_currency(value):
    prices = []

    def walk(x):
        if isinstance(x, dict):
            currency = clean(
                x.get("currency")
                or x.get("currency_code")
                or x.get("currencyCode")
                or x.get("hotel_currency_code")
                or x.get("gross_amount_hotel_currency", {}).get("currency")
                if isinstance(x.get("gross_amount_hotel_currency"), dict) else ""
            )

            for key in [
                "price",
                "gross_amount",
                "all_inclusive_amount",
                "amount",
                "value",
                "gross_amount_per_night",
            ]:
                v = x.get(key)
                if isinstance(v, dict):
                    amount = v.get("value") or v.get("amount")
                    cur = v.get("currency") or currency
                    try:
                        if amount:
                            prices.append((float(amount), clean(cur)))
                    except Exception:
                        pass
                else:
                    try:
                        if v not in [None, ""]:
                            prices.append((float(v), currency))
                    except Exception:
                        pass

            for v in x.values():
                walk(v)

        elif isinstance(x, list):
            for item in x:
                walk(item)

    walk(value)

    for amount, currency in prices:
        if amount > 0:
            return amount, currency

    return None, ""


def fetch_supplier_live_price_for_selected_hotel(supplier_hotel_id, checkin, checkout, guests, rooms, currency_hint=""):
    rapid_host = os.getenv("RAPIDAPI_HOST", "").strip()
    rapid_key = os.getenv("RAPIDAPI_KEY", "").strip()

    if not rapid_host or not rapid_key:
        return None

    headers = {
        "X-RapidAPI-Key": rapid_key,
        "X-RapidAPI-Host": rapid_host,
    }

    params = {
        "hotel_id": clean(supplier_hotel_id),
        "arrival_date": clean(checkin),
        "departure_date": clean(checkout),
        "adults": str(int(guests)),
        "room_qty": str(int(rooms)),
        "currency_code": clean(currency_hint or "USD"),
        "languagecode": "en-us",
    }

    try:
        r = requests.get(
            f"https://{rapid_host}/properties/detail",
            headers=headers,
            params=params,
            timeout=35,
        )
    except Exception as exc:
        print("Supplier detail failed:", str(exc)[:220])
        return None

    if r.status_code != 200:
        print("Supplier detail status:", r.status_code, r.text[:220])
        return None

    try:
        data = r.json()
    except Exception:
        return None

    item = data[0] if isinstance(data, list) and data else data
    if not isinstance(item, dict):
        return None

    cant_book = str(item.get("cant_book", "0"))
    if cant_book not in ["0", "False", "false", ""]:
        return None

    amount = None
    currency = ""

    for alt in item.get("alternate_availability", []) if isinstance(item.get("alternate_availability"), list) else []:
        if clean(alt.get("checkin")) == clean(checkin) and clean(alt.get("checkout")) == clean(checkout):
            try:
                amount = float(alt.get("price"))
                currency = clean(alt.get("currency") or currency_hint)
                break
            except Exception:
                pass

    if not amount:
        amount, currency = recursive_find_price_currency(item)

    if not amount:
        return None

    if not currency:
        currency = clean(currency_hint or item.get("currencycode") or item.get("currency") or "USD")

    return {
        "amount": amount,
        "currency": currency.upper(),
        "raw": item,
    }


@app.get("/api/hotels/live-check")
def api_selected_hotel_live_check(
    hotel_id: str = "",
    hotel_name: str = "",
    destination_code: str = "",
    checkin: str = "",
    checkout: str = "",
    guests: int = 2,
    rooms: int = 1,
):
    selected_destination = clean(destination_code).upper()

    con = db()

    cached = con.execute("""
    SELECT
        hotel_code, hotel_name, destination_code, zone_name, room_name, board_name,
        payment_type, net, selling_rate, currency, cancellation_policies, packaging,
        allotment, rate_key, created_at
    FROM hotel_live_rates
    WHERE (
        hotel_code = ?
        OR LOWER(hotel_name) = LOWER(?)
    )
      AND checkin = ?
      AND checkout = ?
      AND guests = ?
      AND rooms = ?
      AND rate_key IS NOT NULL
      AND rate_key != ''
    ORDER BY created_at DESC
    LIMIT 1
    """, (
        clean(hotel_id),
        clean(hotel_name),
        clean(checkin),
        clean(checkout),
        int(guests),
        int(rooms),
    )).fetchone()

    if cached:
        try:
            cancellation_policies = json.loads(cached[10] or "[]")
        except Exception:
            cancellation_policies = []

        selling = clean(cached[8] or cached[7])
        currency = clean(cached[9] or "USD")

        con.close()

        return {
            "ok": True,
            "live_payment_ready": True,
            "price_status": "Live room price available for secure checkout.",
            "hotel_id": clean(cached[0]),
            "hotel_name": clean(cached[1]),
            "amount": selling,
            "currency": currency,
            "price_last_checked_at": clean(cached[14]),
            "first_rate": {
                "rate_key": clean(cached[13]),
                "currency": currency,
                "net": clean(cached[7]),
                "selling_rate": selling,
                "board_name": clean(cached[5]),
                "room_name": clean(cached[4] or "Selected room"),
                "cancellation_policies": cancellation_policies,
                "payment_type": clean(cached[6]),
                "packaging": clean(cached[11]),
                "allotment": clean(cached[12]),
            },
        }

    catalog = get_catalog_supplier_hotel(hotel_id=hotel_id, hotel_name=hotel_name)

    if not catalog or not clean(catalog.get("supplier_hotel_id")):
        con.close()
        return {
            "ok": True,
            "live_payment_ready": False,
            "price_status": "Latest room price and availability will be confirmed before payment.",
            "message": "Supplier hotel ID is not available for live pricing.",
        }

    supplier_live = fetch_supplier_live_price_for_selected_hotel(
        catalog.get("supplier_hotel_id"),
        checkin,
        checkout,
        guests,
        rooms,
        catalog.get("currency") or "USD",
    )

    if not supplier_live:
        con.close()
        return {
            "ok": True,
            "live_payment_ready": False,
            "price_status": "Latest room price and availability will be confirmed before payment.",
            "message": "Supplier did not return a payable live price for this selected hotel and date.",
        }

    now = now_iso()
    amount = "{:.2f}".format(float(supplier_live["amount"]))
    currency = clean(supplier_live["currency"] or catalog.get("currency") or "USD").upper()
    rate_key = "SUPPLIER_DETAIL-" + clean(catalog.get("supplier_hotel_id")) + "-" + uuid.uuid4().hex[:10].upper()

    con.execute("""
    INSERT INTO hotel_live_rates (
        search_reference, hotel_code, hotel_name, destination_code, zone_name,
        room_code, room_name, board_code, board_name, rate_key, rate_type,
        payment_type, packaging, allotment, net, selling_rate, currency,
        cancellation_policies, raw_hotel_json, raw_rate_json, checkin, checkout,
        guests, rooms, created_at
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    """, (
        "selected_supplier_live_check",
        clean(catalog.get("supplier_hotel_id")),
        clean(catalog.get("name") or hotel_name),
        selected_destination or clean(catalog.get("city")).upper(),
        clean(catalog.get("area") or catalog.get("address")),
        "SELECTED",
        "Selected room",
        "ROOM_ONLY",
        "Room only",
        rate_key,
        "BOOKABLE",
        "AT_WEB",
        "",
        "1",
        amount,
        amount,
        currency,
        "[]",
        safe_json(supplier_live.get("raw")),
        safe_json({"source": "rapidapi_properties_detail", "supplier_hotel_id": catalog.get("supplier_hotel_id")}),
        clean(checkin),
        clean(checkout),
        int(guests),
        int(rooms),
        now,
    ))

    con.commit()
    con.close()

    return {
        "ok": True,
        "live_payment_ready": True,
        "price_status": "Live room price available for secure checkout.",
        "hotel_id": clean(catalog.get("supplier_hotel_id")),
        "hotel_name": clean(catalog.get("name") or hotel_name),
        "amount": amount,
        "currency": currency,
        "price_last_checked_at": now,
        "first_rate": {
            "rate_key": rate_key,
            "currency": currency,
            "net": amount,
            "selling_rate": amount,
            "board_name": "Room only",
            "room_name": "Selected room",
            "cancellation_policies": [],
            "payment_type": "AT_WEB",
            "packaging": "",
            "allotment": "1",
        },
    }
