const fs = require("fs");
const zlib = require("zlib");

const gz = "./backend/data/REAL_ONLY_live_rates.json.gz";
const out = "./frontend/public/live-destinations.json";

fs.mkdirSync("./frontend/public", { recursive: true });

const rows = JSON.parse(zlib.gunzipSync(fs.readFileSync(gz)).toString("utf8"));
const map = new Map();

for (const r of rows) {
  const country = String(r.country || "").trim();
  const city = String(r.city || "").trim();
  if (!country || !city) continue;
  if (country.toLowerCase() === "unknown" || city.toLowerCase() === "unknown") continue;

  if (!map.has(country)) map.set(country, new Map());
  const cities = map.get(country);

  if (!cities.has(city)) {
    cities.set(city, {
      city,
      live_hotels: 0,
      destination_code: String(r.destination_code || "")
    });
  }

  cities.get(city).live_hotels++;
}

const countries = [...map.entries()].map(([country, cities]) => ({
  country,
  cities: [...cities.values()].sort((a, b) => b.live_hotels - a.live_hotels || a.city.localeCompare(b.city))
})).sort((a, b) => a.country.localeCompare(b.country));

fs.writeFileSync(out, JSON.stringify({ ok: true, countries }, null, 2));
console.log("Exported:", countries.length, "countries");
