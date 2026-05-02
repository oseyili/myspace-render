import gzip
import shutil
import sqlite3
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent
DB = BASE_DIR / "hotel_catalog.db"
SEED = BASE_DIR / "hotel_catalog_seed.db.gz"

def hotel_count(path):
    con = sqlite3.connect(path)
    try:
        return con.execute("SELECT COUNT(*) FROM hotels").fetchone()[0]
    finally:
        con.close()

def restore_if_needed():
    if DB.exists():
        try:
            count = hotel_count(DB)
            print(f"Render DB already exists. Hotel count: {count:,}", flush=True)
            return
        except Exception:
            print("Existing DB unreadable. Restoring from seed.", flush=True)

    if not SEED.exists():
        print("No hotel_catalog_seed.db.gz found. Public hotel count may be 0.", flush=True)
        return

    print("Restoring hotel_catalog.db from compressed seed...", flush=True)
    with gzip.open(SEED, "rb") as f_in, open(DB, "wb") as f_out:
        shutil.copyfileobj(f_in, f_out)

    count = hotel_count(DB)
    print(f"Restored public hotel database. Hotel count: {count:,}", flush=True)

if __name__ == "__main__":
    restore_if_needed()
