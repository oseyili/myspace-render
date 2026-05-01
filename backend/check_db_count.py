import sqlite3

db = "hotel_catalog.db"
con = sqlite3.connect(db)
cur = con.cursor()

tables = cur.execute("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name").fetchall()

print("TABLES:")
for t in tables:
    print("-", t[0])

print("\nCOUNTS:")
for (table,) in tables:
    try:
        count = cur.execute(f'SELECT COUNT(*) FROM "{table}"').fetchone()[0]
        print(table, count)
    except Exception as e:
        print(table, "ERR", e)

con.close()
