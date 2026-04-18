import os
import psycopg
import sys

db_url = os.environ["HOTEL_APP_DATABASE_URL"]
admin_url = db_url.replace("/hotel_booking_app", "/postgres")

print("[INFO] Testing PostgreSQL login...")

try:
    conn = psycopg.connect(admin_url)
    conn.close()
    print("[OK] PostgreSQL login succeeded")
except Exception as e:
    print("[ERROR] PostgreSQL login failed")
    print(str(e))
    sys.exit(1)

print("[INFO] Ensuring hotel_booking_app database exists...")

try:
    conn = psycopg.connect(admin_url, autocommit=True)
    cur = conn.cursor()
    cur.execute("SELECT 1 FROM pg_database WHERE datname = 'hotel_booking_app'")
    exists = cur.fetchone()

    if not exists:
        cur.execute("CREATE DATABASE hotel_booking_app")
        print("[OK] Created database: hotel_booking_app")
    else:
        print("[OK] Database already exists: hotel_booking_app")

    cur.close()
    conn.close()
except Exception as e:
    print("[ERROR] Failed while checking or creating hotel_booking_app")
    print(str(e))
    sys.exit(2)
