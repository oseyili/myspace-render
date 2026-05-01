import sqlite3

con = sqlite3.connect("hotel_catalog.db")
con.row_factory = sqlite3.Row
cur = con.cursor()

print("TOTAL:", cur.execute("SELECT COUNT(*) FROM hotels").fetchone()[0])

print("")
print("COLUMNS:")
print([r[1] for r in cur.execute("PRAGMA table_info(hotels)").fetchall()])

print("")
print("SAMPLE RECORDS:")
rows = cur.execute("SELECT * FROM hotels LIMIT 5").fetchall()

for i, row in enumerate(rows, 1):
    d = dict(row)
    print("")
    print("--- HOTEL", i, "---")
    for k in ["id","hotel_id","name","hotel_name","city","country","source","image","max_photo_url","main_photo_url","photo_url","raw"]:
        if k in d:
            print(k + ":", str(d.get(k))[:700])

print("")
print("SOURCE COUNTS:")
try:
    for r in cur.execute("SELECT source, COUNT(*) FROM hotels GROUP BY source ORDER BY COUNT(*) DESC LIMIT 20"):
        print(r[0], r[1])
except Exception as e:
    print("No source count:", e)

con.close()
