@app.get("/api/hotels/search")
def search_hotels(
    country: str = "",
    city: str = "",
    area: str = "",
    keyword: str = "",
    facilities: str = "",
    guests: int = 1,
    limit: int = 100,
    offset: int = 0
):
    import sqlite3

    DB = "hotel_catalog.db"

    con = sqlite3.connect(DB)
    con.row_factory = sqlite3.Row
    cur = con.cursor()

    query = "SELECT * FROM hotels WHERE 1=1"
    params = []

    # ✅ Normalize country input (UK → United Kingdom etc.)
    country_map = {
        "uk": "united kingdom",
        "usa": "united states",
        "us": "united states",
        "ng": "nigeria"
    }

    if country:
        c = country.lower().strip()
        c = country_map.get(c, c)
        query += " AND LOWER(country) LIKE ?"
        params.append(f"%{c}%")

    if city:
        query += " AND LOWER(city) LIKE ?"
        params.append(f"%{city.lower()}%")

    # 🚨 Only apply area if meaningful
    if area and len(area.strip()) > 2:
        query += " AND LOWER(area) LIKE ?"
        params.append(f"%{area.lower()}%")

    # 🚨 Keyword (hotel name)
    if keyword and len(keyword.strip()) > 2:
        query += " AND LOWER(name) LIKE ?"
        params.append(f"%{keyword.lower()}%")

    # 🚨 Facilities ONLY if user selected
    if facilities:
        facility_list = [f.strip().lower() for f in facilities.split(",") if f.strip()]
        for f in facility_list:
            query += " AND LOWER(facilities) LIKE ?"
            params.append(f"%{f}%")

    # ✅ Always order by quality
    query += " ORDER BY CAST(rating AS REAL) DESC NULLS LAST"

    # ✅ Pagination (no hard 60 limit anymore)
    query += " LIMIT ? OFFSET ?"
    params.append(limit)
    params.append(offset)

    rows = cur.execute(query, params).fetchall()

    con.close()

    return {
        "ok": True,
        "count": len(rows),
        "results": [dict(r) for r in rows]
    }