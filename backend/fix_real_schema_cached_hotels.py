from pathlib import Path
import re

p = Path("hotel_app.py")
s = p.read_text(encoding="utf-8")

pattern = r'def get_cached_hotels\(.*?\n\s*return hotels'
m = re.search(pattern, s, flags=re.S)
if not m:
    raise SystemExit("Could not find get_cached_hotels")

new_func = r'''
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
            "hotel_code": clean(r[0]),
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
            "price_confirmation_required": False,
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
'''

s = s[:m.start()] + new_func + s[m.end():]
p.write_text(s, encoding="utf-8")
print("Restored get_cached_hotels to real schema.")
