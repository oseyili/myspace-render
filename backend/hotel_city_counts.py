import sqlite3
import csv
from datetime import datetime

db = "hotel_catalog.db"
stamp = datetime.now().strftime("%Y%m%d_%H%M%S")
out = f"C:\\frontend\\hotel-booking-app\\hotel_counts_by_city_{stamp}.csv"

con = sqlite3.connect(db)
cur = con.cursor()

rows = cur.execute("""
SELECT
  COALESCE(NULLIF(TRIM(country), ''), 'Unknown') AS country,
  COALESCE(NULLIF(TRIM(city), ''), 'Unknown') AS city,
  COUNT(*) AS total_rows,
  COUNT(DISTINCT supplier_hotel_id) AS unique_hotels
FROM hotels
GROUP BY
  COALESCE(NULLIF(TRIM(country), ''), 'Unknown'),
  COALESCE(NULLIF(TRIM(city), ''), 'Unknown')
ORDER BY unique_hotels DESC, country, city
""").fetchall()

with open(out, "w", newline="", encoding="utf-8-sig") as f:
    writer = csv.writer(f)
    writer.writerow(["country", "city", "total_rows", "unique_hotels"])
    writer.writerows(rows)

print("CSV saved:", out)
print("")
print("TOP 50 CITIES BY UNIQUE HOTELS")
for country, city, total_rows, unique_hotels in rows[:50]:
    print(f"{unique_hotels:>6} | {country} | {city}")

print("")
print("Total unique hotels:", cur.execute("SELECT COUNT(DISTINCT supplier_hotel_id) FROM hotels").fetchone()[0])
print("Total rows:", cur.execute("SELECT COUNT(*) FROM hotels").fetchone()[0])
print("Duplicate supplier IDs:", cur.execute("""
SELECT COUNT(*) FROM (
  SELECT supplier_hotel_id
  FROM hotels
  WHERE supplier_hotel_id IS NOT NULL AND supplier_hotel_id != ''
  GROUP BY supplier_hotel_id
  HAVING COUNT(*) > 1
)
""").fetchone()[0])

con.close()
