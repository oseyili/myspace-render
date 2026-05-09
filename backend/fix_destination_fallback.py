from pathlib import Path
import re

p = Path("hotel_app.py")
s = p.read_text(encoding="utf-8")

pattern = r'def get_cached_hotels\(.*?return hotels'
match = re.search(pattern, s, flags=re.S)

if not match:
    raise SystemExit("get_cached_hotels function not found")

new_func = '''
def get_cached_hotels(destination_code="LON", checkin="", checkout="", guests=2, rooms=1,
                      min_price=0, max_price=0, facilities=None, limit=100):

    selected_destination = clean(destination_code or HOTELBEDS_DEFAULT_DESTINATION).upper()

    con = db()
    con.row_factory = sqlite3.Row

    rows = con.execute("""
    SELECT
        hotel_code,
        hotel_name,
        destination_code,
        city,
        country,
        address,
        stars,
        review_score,
        room_name,
        board_name,
        price,
        currency,
        rate_key,
        payment_type,
        image_url,
        created_at
    FROM hotel_live_rates
    WHERE destination_code = ?
    ORDER BY created_at DESC
    LIMIT ?
    """, (selected_destination, limit)).fetchall()

    hotels = []

    if rows:
        for row in rows:
            item = dict(row)

            hotels.append({
                "hotel_code": item.get("hotel_code"),
                "hotel_name": item.get("hotel_name"),
                "destination_code": item.get("destination_code"),
                "city": item.get("city"),
                "country": item.get("country"),
                "address": item.get("address"),
                "stars": item.get("stars"),
                "review_score": item.get("review_score"),
                "image_url": item.get("image_url"),
                "price_confirmation_required": False,
                "first_rate": {
                    "room_name": item.get("room_name"),
                    "board_name": item.get("board_name"),
                    "price": item.get("price"),
                    "currency": item.get("currency"),
                    "rate_key": item.get("rate_key"),
                    "payment_type": item.get("payment_type")
                }
            })

        con.close()
        return hotels

    image_rows = con.execute("""
    SELECT
        hotel_code,
        hotel_name,
        destination_code,
        image_url
    FROM hotel_images
    WHERE destination_code = ?
    GROUP BY hotel_code
    LIMIT ?
    """, (selected_destination, limit)).fetchall()

    for row in image_rows:
        item = dict(row)

        hotels.append({
            "hotel_code": item.get("hotel_code"),
            "hotel_name": item.get("hotel_name"),
            "destination_code": item.get("destination_code"),
            "city": selected_destination,
            "country": "",
            "address": "",
            "stars": "",
            "review_score": "",
            "image_url": item.get("image_url"),
            "price_confirmation_required": True,
            "first_rate": None
        })

    con.close()
    return hotels
'''

s = s[:match.start()] + new_func + s[match.end():]

p.write_text(s, encoding="utf-8")

print("Destination fallback fixed.")
