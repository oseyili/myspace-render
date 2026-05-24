const fs = require("fs");
const path = require("path");
const zlib = require("zlib");
const readline = require("readline");

const DATA = path.join(process.cwd(), "backend", "data");
const PUBLIC = path.join(process.cwd(), "frontend", "public");
const HOTEL_FILE = path.join(DATA, "live-hotels.ndjson.gz");

function clean(v) {
  return String(v || "").replace(/\s+/g, " ").trim();
}

function key(v) {
  return clean(v).toLowerCase();
}

function pick(o, keys) {
  for (const k of keys) {
    const v = o?.[k];
    if (v !== undefined && v !== null && String(v).trim()) return v;
  }
  return "";
}

const countryMap = {
  uk: "United Kingdom",
  gb: "United Kingdom",
  gbr: "United Kingdom",
  england: "United Kingdom",
  us: "United States",
  usa: "United States",
  ae: "United Arab Emirates",
  uae: "United Arab Emirates",
  ng: "Nigeria",
  fr: "France",
  es: "Spain"
};

const cityMap = {
  lon: "London",
  nyc: "New York",
  dxb: "Dubai",
  par: "Paris",
  los: "Lagos",
  abv: "Abuja",
  bni: "Benin City",
  mad: "Madrid",
  bcn: "Barcelona",
  lax: "Los Angeles",
  mia: "Miami"
};

function normalizeCountry(v) {
  return countryMap[key(v)] || clean(v);
}

function normalizeCity(v) {
  return cityMap[key(v)] || clean(v);
}

async function main() {
  const map = new Map();

  const stream = fs.createReadStream(HOTEL_FILE).pipe(zlib.createGunzip());
  const rl = readline.createInterface({ input: stream, crlfDelay: Infinity });

  for await (const line of rl) {
    if (!line.trim()) continue;

    try {
      const row = JSON.parse(line);

      const country = normalizeCountry(pick(row, [
        "country",
        "country_name",
        "countryName",
        "country_code",
        "countryCode"
      ]));

      const city = normalizeCity(pick(row, [
        "city",
        "city_name",
        "cityName",
        "destination",
        "destination_name",
        "destinationName"
      ]));

      const hotelName = clean(pick(row, [
        "hotel_name",
        "hotelName",
        "name",
        "title"
      ]));

      if (!country || !city || !hotelName) continue;
      if (country.toLowerCase() === "unknown") continue;
      if (city.toLowerCase() === "unknown") continue;

      if (!map.has(country)) map.set(country, new Set());
      map.get(country).add(city);
    } catch {}
  }

  const countries = Array.from(map.entries())
    .map(([country, cities]) => ({
      country,
      cities: Array.from(cities)
        .sort((a, b) => a.localeCompare(b))
        .map((city) => ({ city }))
    }))
    .sort((a, b) => a.country.localeCompare(b.country));

  const output = {
    ok: true,
    source: "rebuilt from exact searchable hotel catalogue",
    generated_at: new Date().toISOString(),
    total_countries: countries.length,
    total_cities: countries.reduce((s, c) => s + c.cities.length, 0),
    countries
  };

  fs.writeFileSync(path.join(DATA, "live-destinations.json"), JSON.stringify(output, null, 2));
  fs.writeFileSync(path.join(PUBLIC, "live-destinations.json"), JSON.stringify(output, null, 2));

  console.log("DONE");
  console.log("Countries:", output.total_countries);
  console.log("Cities:", output.total_cities);
  console.log("Sample United Kingdom cities:", (map.get("United Kingdom") ? Array.from(map.get("United Kingdom")).slice(0, 20).join(", ") : "NONE"));
}

main();
