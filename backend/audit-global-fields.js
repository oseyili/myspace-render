const fs = require("fs");
const zlib = require("zlib");

const files = [
  "data/live_rate_cache_joined_geo_images_DEST_FIXED.json.gz",
  "data/live_rate_cache_joined_geo_images_SMART.json.gz",
  "data/destination_master.json.gz",
  "data/master_hotel_registry.json.gz"
];

function read(file) {
  const b = fs.readFileSync(file);
  const text = file.endsWith(".gz") ? zlib.gunzipSync(b).toString("utf8") : b.toString("utf8");
  return JSON.parse(text);
}

for (const file of files) {
  if (!fs.existsSync(file)) continue;

  const arr = read(file);
  const sample = Array.isArray(arr) ? arr.slice(0, 5) : Object.values(arr).slice(0, 5);

  console.log("\n==============================");
  console.log(file);
  console.log("ROWS:", Array.isArray(arr) ? arr.length : Object.keys(arr).length);
  console.log("SAMPLE KEYS:");
  for (const x of sample) console.log(Object.keys(x || {}));

  const countries = new Set();
  const cities = new Set();

  for (const x of Array.isArray(arr) ? arr : Object.values(arr)) {
    const country = String(x.country || x.countryName || x.country_name || x.destination_country || x.destinationCountry || "").trim();
    const city = String(x.city || x.cityName || x.city_name || x.destination || x.destinationName || x.destination_name || "").trim();
    if (country) countries.add(country);
    if (city) cities.add(city);
  }

  console.log("TOP LEVEL COUNTRIES:", countries.size);
  console.log("TOP LEVEL CITIES:", cities.size);
}
