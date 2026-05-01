import sqlite3, os

db = "hotel_catalog.db"
print("DB file:", os.path.abspath(db))

if not os.path.exists(db):
    raise SystemExit("hotel_catalog.db was not found in backend folder.")

print("DB size bytes:", os.path.getsize(db))

con = sqlite3.connect(db)
cur = con.cursor()

tables = [r[0] for r in cur.execute("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name").fetchall()]
print("Tables:", tables)

for table in tables:
    try:
        count = cur.execute("SELECT COUNT(*) FROM " + table).fetchone()[0]
        print(table + ": " + format(count, ","))
    except Exception as e:
        print(table + ": unable to count - " + str(e))

con.close()
