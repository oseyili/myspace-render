import os
import psycopg

db_url = os.environ["HOTEL_APP_DATABASE_URL"]

try:
    conn = psycopg.connect(db_url)
    conn.close()
    print("[OK] PostgreSQL login succeeded")
except Exception as e:
    print("[ERROR] PostgreSQL login failed")
    print(str(e))
    raise
