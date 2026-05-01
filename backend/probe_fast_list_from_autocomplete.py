import os, json, requests

def load_env():
    if os.path.exists(".env"):
        for line in open(".env", encoding="utf-8", errors="ignore"):
            line = line.strip()
            if line and not line.startswith("#") and "=" in line:
                k, v = line.split("=", 1)
                os.environ.setdefault(k.strip(), v.strip().strip('"').strip("'"))

load_env()

host = os.getenv("RAPIDAPI_HOST", "apidojo-booking-v1.p.rapidapi.com")
key = os.getenv("RAPIDAPI_KEY", "")

if not key:
    raise SystemExit("RAPIDAPI_KEY not loaded")

headers = {
    "X-RapidAPI-Key": key,
    "X-RapidAPI-Host": host,
}

print("HOST:", host)

r = requests.get(
    f"https://{host}/locations/auto-complete",
    headers=headers,
    params={"text": "London", "languagecode": "en-us"},
    timeout=35,
)

print("\nAUTOCOMPLETE STATUS:", r.status_code)
print(r.text[:3000])

data = r.json()
items = data if isinstance(data, list) else data.get("data") or data.get("result") or data.get("results") or []

print("\nCANDIDATES FOUND:", len(items))

for i, item in enumerate(items[:10]):
    print("\n--- CANDIDATE", i, "---")
    print(json.dumps(item, indent=2)[:2000])

    possible_ids = []
    for keyname in ["dest_id", "id", "city_ufi", "ufi", "value", "destId"]:
        if item.get(keyname) not in [None, ""]:
            possible_ids.append((keyname, str(item.get(keyname))))

    possible_types = []
    for typename in ["search_type", "dest_type", "type"]:
        if item.get(typename) not in [None, ""]:
            possible_types.append((typename, str(item.get(typename))))

    for id_name, dest_id in possible_ids:
        for type_name, search_type in possible_types:
            params = {
                "dest_id": dest_id,
                "search_type": search_type,
                "arrival_date": "2026-06-10",
                "departure_date": "2026-06-11",
                "adults": "2",
                "room_qty": "1",
                "page_number": "1",
                "units": "metric",
                "languagecode": "en-us",
                "currency_code": "GBP",
            }

            test = requests.get(
                f"https://{host}/properties/list",
                headers=headers,
                params=params,
                timeout=35,
            )

            print("\nTEST properties/list")
            print("id field:", id_name, "=", dest_id)
            print("type field:", type_name, "=", search_type)
            print("STATUS:", test.status_code)
            print(test.text[:500])

            if '"result"' in test.text or '"hotels"' in test.text:
                print("\n*** POSSIBLE FAST ENDPOINT COMBINATION FOUND ***")
                raise SystemExit(0)

print("\nNo working properties/list combination found from autocomplete candidates.")
