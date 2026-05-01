import re
from pathlib import Path

p = Path("grow_real_global_hotels.py")
s = p.read_text(encoding="utf-8")

helper = r'''
BAD_FRANCE_PLACE_TERMS = {
    "owerri", "warri", "lagos", "abuja", "kano", "ibadan", "benin city",
    "port harcourt", "accra", "kumasi", "nairobi", "mombasa", "kampala",
    "dar es salaam", "addis ababa", "casablanca", "marrakech", "cairo",
    "alexandria", "johannesburg", "cape town", "durban"
}

def is_bad_country_mix(place, country):
    place_l = str(place or "").strip().lower()
    country_l = str(country or "").strip().lower()

    if country_l == "france" and place_l in BAD_FRANCE_PLACE_TERMS:
        return True

    return False
'''

if "def is_bad_country_mix(place, country):" not in s:
    s = s.replace("def fill_queue():", helper + "\n\ndef fill_queue():", 1)

old = '''        if term:
            text = f"{place} {term} {country}".strip()
        else:
            text = f"{place} {country}".strip()
'''

new = '''        if is_bad_country_mix(place, country):
            print("SKIP bad country/place mix:", place, country, flush=True)
            STATE["place_index"] += 1
            save_state()
            continue

        if term:
            text = f"{place} {term} {country}".strip()
        else:
            text = f"{place} {country}".strip()
'''

if old not in s:
    raise RuntimeError("Could not find discovery text builder block.")

s = s.replace(old, new, 1)

p.write_text(s, encoding="utf-8")
print("Discovery country-mix filter added.")
