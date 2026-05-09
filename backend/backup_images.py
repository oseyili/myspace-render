import sqlite3
import json

DB_PATH = r"C:\frontend\hotel-booking-app\backend\myspace_auto_bookings.db"
OUTPUT_PATH = r"D:\hotel_image_backup_200k.json"

con = sqlite3.connect(DB_PATH)

rows = con.execute("""
SELECT DISTINCT
    hotel_code,
    destination_code,
    hotel_name,
    image_url,
    source,
    updated_at
FROM hotel_images
WHERE verified = 1
  AND image_url IS NOT NULL
  AND image_url != ''
LIMIT 200000
""").fetchall()

con.close()

data = []
for r in rows:
    data.append({
        "hotel_code": r[0],
        "destination_code": r[1],
        "hotel_name": r[2],
        "image_url": r[3],
        "source": r[4],
        "updated_at": r[5],
    })

with open(OUTPUT_PATH, "w", encoding="utf-8") as f:
    json.dump(data, f, ensure_ascii=False, indent=2)

print("DONE")
print("Saved records:", len(data))
print("File:", OUTPUT_PATH)
