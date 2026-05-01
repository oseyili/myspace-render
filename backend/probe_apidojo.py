import os, json, requests

host = os.getenv("RAPIDAPI_HOST", "apidojo-booking-v1.p.rapidapi.com")
key = os.getenv("RAPIDAPI_KEY", "")

if not key:
    raise SystemExit("RAPIDAPI_KEY is not loaded.")

headers = {
    "X-RapidAPI-Key": key,
    "X-RapidAPI-Host": host,
}

def show(path, params):
    print("\nENDPOINT:", path)
    print("PARAMS:", params)
    r = requests.get(f"https://{host}{path}", headers=headers, params=params, timeout=35)
    print("STATUS:", r.status_code)
    text = r.text[:3000]
    print(text)

print("HOST:", host)

show("/locations/auto-complete", {
    "text": "London",
    "languagecode": "en-us"
})

show("/properties/list", {
    "dest_id": "-2601889",
    "search_type": "CITY",
    "arrival_date": "2026-06-10",
    "departure_date": "2026-06-11",
    "adults": "2",
    "children_age": "0,17",
    "room_qty": "1",
    "page_number": "1",
    "units": "metric",
    "temperature_unit": "c",
    "languagecode": "en-us",
    "currency_code": "GBP"
})

show("/properties/list-by-map", {
    "bbox": "51.30,-0.50,51.70,0.30",
    "arrival_date": "2026-06-10",
    "departure_date": "2026-06-11",
    "adults": "2",
    "room_qty": "1",
    "units": "metric",
    "languagecode": "en-us",
    "currency_code": "GBP"
})
