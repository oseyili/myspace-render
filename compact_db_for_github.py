import sqlite3
from pathlib import Path

db = Path("backend/hotel_catalog.db")
con = sqlite3.connect(db)
cur = con.cursor()

before = cur.execute("SELECT COUNT(*) FROM hotels").fetchone()[0]
print("Before hotels:", before)
print("Before size MB:", round(db.stat().st_size / 1024 / 1024, 2))

# Remove obvious non-stay / bad records only
bad_terms = [
    "railway", "train station", "metro station", "bus station",
    "stadium", "arena", "shopping mall", "museum", "university",
    "hospital", "bridge", "church", "cathedral", "zoo"
]

keep_terms = [
    "hotel", "guest", "guesthouse", "guest house", "b&b", "bed and breakfast",
    "inn", "apartment", "apartments", "aparthotel", "hostel", "villa",
    "resort", "lodge", "motel", "suites", "rooms", "residence",
    "holiday home", "homestay", "accommodation"
]

deleted = 0

for term in bad_terms:
    keep_sql = " OR ".join([
        "LOWER(COALESCE(name,'')) LIKE ?",
        "LOWER(COALESCE(description,'')) LIKE ?"
    ] * len(keep_terms))

    keep_params = []
    for k in keep_terms:
        keep_params.extend([f"%{k}%", f"%{k}%"])

    sql = f"""
    DELETE FROM hotels
    WHERE (
        LOWER(COALESCE(name,'')) LIKE ?
        OR LOWER(COALESCE(area,'')) LIKE ?
        OR LOWER(COALESCE(address,'')) LIKE ?
        OR LOWER(COALESCE(description,'')) LIKE ?
    )
    AND NOT ({keep_sql})
    """

    before_changes = con.total_changes
    cur.execute(sql, [f"%{term}%"] * 4 + keep_params)
    deleted += con.total_changes - before_changes

# Remove rows without usable hotel name
cur.execute("""
DELETE FROM hotels
WHERE name IS NULL OR TRIM(name) = ''
""")

# Remove duplicate supplier ids if any, keeping first row
cur.execute("""
DELETE FROM hotels
WHERE rowid NOT IN (
    SELECT MIN(rowid)
    FROM hotels
    GROUP BY COALESCE(NULLIF(supplier_hotel_id,''), id)
)
""")

# Drop heavy indexes before Git push. Render can recreate later if needed.
idx = cur.execute("SELECT name FROM sqlite_master WHERE type='index' AND name NOT LIKE 'sqlite_autoindex%'").fetchall()
for (name,) in idx:
    cur.execute(f'DROP INDEX IF EXISTS "{name}"')

con.commit()
cur.execute("VACUUM")
con.close()

con = sqlite3.connect(db)
after = con.execute("SELECT COUNT(*) FROM hotels").fetchone()[0]
con.close()

print("After hotels:", after)
print("Removed:", before - after)
print("After size MB:", round(db.stat().st_size / 1024 / 1024, 2))
