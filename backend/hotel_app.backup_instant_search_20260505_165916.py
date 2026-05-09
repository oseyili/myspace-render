from fastapi import FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from dotenv import load_dotenv
import os
import uuid
import json
import sqlite3
import requests
import time
from datetime import datetime
from pathlib import Path
from urllib.parse import urljoin

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
    row = con.execute("""
    SELECT image_url, caption, source
    FROM hotel_images
    WHERE hotel_code = ?
      AND verified = 1
      AND image_url IS NOT NULL
      AND image_url != ''
    ORDER BY updated_at DESC, id DESC
    LIMIT 1
    """, (clean(hotel_code),)).fetchone()

    if not row:
        auto_resolve_image_for_hotel(con, hotel_code)

        row = con.execute("""
        SELECT image_url, caption, source
        FROM hotel_images
        WHERE hotel_code = ?
          AND verified = 1
          AND image_url IS NOT NULL
          AND image_url != ''
        ORDER BY updated_at DESC, id DESC
        LIMIT 1
        """, (clean(hotel_code),)).fetchone()

    if not row:
        hotel_row = con.execute("""
        SELECT hotel_name, destination_code
        FROM hotel_live_rates
        WHERE hotel_code = ?
        ORDER BY created_at DESC
        LIMIT 1
        """, (clean(hotel_code),)).fetchone()

        if hotel_row:
            catalog_image = get_catalog_image_for_hotel(hotel_row[0], hotel_row[1])
            if catalog_image:
                save_verified_image(
                    con,
                    hotel_code,
                    hotel_row[1],
                    hotel_row[0],
                    catalog_image,
                    "existing_catalog_real_property_image"
                )

                row = (catalog_image, "Verified real catalog property image", "existing_catalog_real_property_image")

    if not row or is_bad_image_url(row[0]):
        return {"image_url": "", "image_caption": "", "image_source": "", "has_verified_image": False}

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
                "currency": clean(r[13] or "GBP"),
                "net": clean(r[11]),
                "selling_rate": clean(r[12] or r[11]),
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
        "currency": clean(row[9] or "GBP"),
        "cancellation_policies": cancellation_policies,
        "packaging": clean(row[11]),
        "allotment": clean(row[12]),
        "created_at": clean(row[13]),
    }


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

    return {
        "ok": True,
        "hotels": hotels,
        "count": len(hotels),
        "destination_code": selected_destination,
        "source": "saved_availability",
        "availability_message": "Available stays are ready for review.",
    }


@app.post("/reservation-request")
async def create_reservation(req: Request):
    data = await req.json()

    rate_key = clean(data.get("rate_key"))
    if not rate_key:
        raise HTTPException(400, "This stay is no longer available. Please choose another available stay.")

    cached_rate = get_cached_rate(rate_key)
    if not cached_rate:
        raise HTTPException(400, "This stay is no longer available. Please choose another available stay.")

    customer_email = clean(data.get("customer_email")).strip()
    if not customer_email:
        raise HTTPException(400, "Please enter your email address to continue.")

    if not STRIPE_SECRET_KEY:
        raise HTTPException(500, "Secure payment is temporarily unavailable. Please try again shortly.")

    code = make_reservation_code()
    created = now_iso()

    hotel_name = clean(data.get("hotel_name") or cached_rate["hotel_name"] or "Selected hotel")
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
            "metadata[booking_status]": "PAID_PENDING_SUPPLIER_CONFIRMATION",
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
        clean(data.get("hotel_id") or cached_rate["hotel_id"]),
        hotel_name,
        clean(data.get("destination") or cached_rate["destination"]),
        clean(data.get("customer_name") or "Guest"),
        customer_email,
        clean(data.get("customer_phone")),
        int(data.get("guests", 1)),
        int(data.get("rooms", 1)),
        clean(data.get("checkin")),
        clean(data.get("checkout")),
        clean(data.get("note")),
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
    con.commit()
    con.close()

    return {"ok": True, "total_images": total, "verified_images": verified}


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




