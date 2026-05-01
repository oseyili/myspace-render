import os, requests, json

def load_env():
    if os.path.exists(".env"):
        for line in open(".env", encoding="utf-8", errors="ignore"):
            line=line.strip()
            if line and not line.startswith("#") and "=" in line:
                k,v=line.split("=",1)
                os.environ.setdefault(k.strip(), v.strip().strip('"').strip("'"))

load_env()

host=os.getenv("RAPIDAPI_HOST","apidojo-booking-v1.p.rapidapi.com")
key=os.getenv("RAPIDAPI_KEY","")
headers={"X-RapidAPI-Key":key,"X-RapidAPI-Host":host}

tests=[
  {"search_type":"city","dest_id":"-2601889"},
  {"search_type":"CITY","dest_id":"-2601889"},
  {"search_type":"district","dest_id":"-2601889"},
  {"search_type":"ufi","dest_id":"-2601889"},
  {"dest_type":"city","dest_id":"-2601889"},
  {"dest_type":"CITY","dest_id":"-2601889"},
]

for t in tests:
    params={
      **t,
      "arrival_date":"2026-06-10",
      "departure_date":"2026-06-11",
      "adults":"2",
      "room_qty":"1",
      "page_number":"1",
      "units":"metric",
      "languagecode":"en-us",
      "currency_code":"GBP",
    }
    r=requests.get(f"https://{host}/properties/list",headers=headers,params=params,timeout=35)
    print("\nTEST:",t)
    print("STATUS:",r.status_code)
    print(r.text[:700])
