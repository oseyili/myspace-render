import sqlite3
import sys

db = sys.argv[1]
con = sqlite3.connect(db)
cur = con.cursor()

checks = {
    "TOTAL HOTELS": "SELECT COUNT(*) FROM hotels",
    "UNIQUE IDS": "SELECT COUNT(DISTINCT id) FROM hotels",
    "DUPLICATE IDS": "SELECT COUNT(*) FROM (SELECT id FROM hotels GROUP BY id HAVING COUNT(*) > 1)",
    "UNIQUE SUPPLIER IDS": "SELECT COUNT(DISTINCT supplier_hotel_id) FROM hotels",
    "DUPLICATE SUPPLIER IDS": """
        SELECT COUNT(*) FROM (
            SELECT supplier_hotel_id
            FROM hotels
            WHERE supplier_hotel_id IS NOT NULL AND supplier_hotel_id != ''
            GROUP BY supplier_hotel_id
            HAVING COUNT(*) > 1
        )
    """,
    "UNIQUE CITY COUNTRY": "SELECT COUNT(*) FROM (SELECT city, country FROM hotels GROUP BY city, country)",
    "UNIQUE COUNTRIES": "SELECT COUNT(DISTINCT country) FROM hotels",
    "POSSIBLE NAME DUPLICATES": """
        SELECT COUNT(*) FROM (
            SELECT LOWER(name), LOWER(city), LOWER(country)
            FROM hotels
            GROUP BY LOWER(name), LOWER(city), LOWER(country)
            HAVING COUNT(*) > 1
        )
    """
}

print("DB:", db)
for label, sql in checks.items():
    try:
        print(label + ":", cur.execute(sql).fetchone()[0])
    except Exception as e:
        print(label + ": ERROR -", e)

con.close()
