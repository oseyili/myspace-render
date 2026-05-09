import time
import requests
from datetime import datetime

API_BASE = "http://127.0.0.1:5050"

POPULAR_DESTINATIONS = [
    "LON", "PAR", "BCN", "DXB", "AMS", "MAD", "IST", "PMI",
    "PRG", "VIE", "BER", "NCE", "ATH", "DUB", "NYC",
    "LOS", "ABV", "PHC"
]

CHECKIN = "2026-06-01"
CHECKOUT = "2026-06-02"
GUESTS = 2
ROOMS = 1
REFRESH_EVERY_SECONDS = 600

def refresh_destination(code):
    url = (
        f"{API_BASE}/api/hotels/search"
        f"?city={code}"
        f"&destination_code={code}"
        f"&checkin={CHECKIN}"
        f"&checkout={CHECKOUT}"
        f"&guests={GUESTS}"
        f"&rooms={ROOMS}"
    )

    try:
        r = requests.get(url, timeout=60)
        data = r.json()
        count = len(data.get("hotels", []))
        print(datetime.utcnow().isoformat(), code, "hotels:", count, "ok:", data.get("ok"))
    except Exception as exc:
        print(datetime.utcnow().isoformat(), code, "FAILED:", str(exc)[:180])

def main():
    print("LIVE RATE WORKER STARTED")
    print("Refresh interval:", REFRESH_EVERY_SECONDS, "seconds")

    while True:
        for code in POPULAR_DESTINATIONS:
            refresh_destination(code)
            time.sleep(3)

        print("Cycle complete. Sleeping...")
        time.sleep(REFRESH_EVERY_SECONDS)

if __name__ == "__main__":
    main()
