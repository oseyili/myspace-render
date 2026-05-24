const fs = require("fs");
const path = require("path");
const zlib = require("zlib");

const ROOT = process.cwd();
const DROOT = "D:\\";
const BACKEND_DATA = path.join(ROOT, "backend", "data");
const PUBLIC = path.join(ROOT, "frontend", "public");

function clean(v) {
  return String(v || "").replace(/\s+/g, " ").trim();
}

function pick(o, keys) {
  for (const k of keys) {
    if (o && o[k] !== undefined && o[k] !== null && String(o[k]).trim()) return o[k];
  }
  return "";
}

function rows(payload) {
  if (!payload) return [];
  if (Array.isArray(payload)) return payload;
  if (Array.isArray(payload.hotels)) return payload.hotels;
  if (Array.isArray(payload.data)) return payload.data;
  if (Array.isArray(payload.results)) return payload.results;
  return [];
}

function walk(dir, out = []) {
  if (!fs.existsSync(dir)) return out;

  for (const name of fs.readdirSync(dir)) {
    const full = path.join(dir, name);

    let stat;
    try {
      stat = fs.statSync(full);
    } catch {
      continue;
    }

    if (stat.isDirectory()) {
      const lower = full.toLowerCase();

      if (
        lower.includes("hotel") ||
        lower.includes("booking") ||
        lower.includes("live") ||
        lower.includes("rate") ||
        lower.includes("myspace") ||
        lower.includes("destination")
      ) {
        walk(full, out);
      }

      continue;
    }

    const lower = full.toLowerCase();

    if (
      lower.endsWith(".json") ||
      lower.endsWith(".ndjson.gz")
    ) {
      if (
        lower.includes("hotel") ||
        lower.includes("live") ||
        lower.includes("rate") ||
        lower.includes("booking") ||
        lower.includes("catalog")
      ) {
        out.push(full);
      }
    }
  }

  return out;
}

function normalizeHotel(h, index) {
  const hotel_id = clean(pick(h, ["hotel_id", "id", "code", "hotelCode", "supplier_hotel_id"])) || `restored-${index}`;
  const hotel_name = clean(pick(h, ["hotel_name", "name", "hotelName", "title"]));
  const country = clean(pick(h, ["country", "country_name", "countryName", "country_code", "countryCode"]));
  const city = clean(pick(h, ["city", "city_name", "cityName", "destination", "destination_name", "destinationName"]));

  if (!hotel_name || !country || !city) return null;
  if (country.toLowerCase() === "unknown" || city.toLowerCase() === "unknown") return null;

  const rateSource = h.first_rate || h.rate || h;
  const amount = Number(pick(rateSource, ["amount", "price", "total", "net", "sellingRate", "rate"]));
  const currency = clean(pick(rateSource, ["currency", "currencyCode"])) || "GBP";
  const rate_key = clean(pick(rateSource, ["rate_key", "rateKey"]));

  const image_url = clean(pick(h, ["image_url", "image", "main_image", "photo", "thumbnail"]));

  return {
    id: hotel_id,
    hotel_id,
    hotel_name,
    name: hotel_name,
    country,
    city,
    area: clean(pick(h, ["area", "zone", "district"])),
    address: clean(pick(h, ["address", "address1", "street"])),
    rating: clean(pick(h, ["rating", "category", "stars"])),
    image_url,
    image_caption: image_url ? "Verified property image" : "",
    image_source: image_url ? "MySpace Hotel verified image URL" : "",
    has_verified_image: Boolean(image_url),
    latitude: pick(h, ["latitude", "lat"]),
    longitude: pick(h, ["longitude", "lng", "lon"]),
    first_rate: amount > 0 ? { amount, currency, rate_key } : null
  };
}

const files = walk(DROOT);
const hotels = [];
const seen = new Set();

console.log("Scanning D drive files:", files.length);

for (const file of files) {
  const lower = file.toLowerCase();

  try {
    if (lower.endsWith(".json")) {
      const payload = JSON.parse(fs.readFileSync(file, "utf8"));
      for (const row of rows(payload)) {
        const hotel = normalizeHotel(row, hotels.length);
        if (!hotel) continue;

        const key = `${hotel.hotel_id}|${hotel.hotel_name}|${hotel.country}|${hotel.city}`;
        if (seen.has(key)) continue;

        seen.add(key);
        hotels.push(hotel);
      }
    }

    if (lower.endsWith(".ndjson.gz")) {
      const text = zlib.gunzipSync(fs.readFileSync(file)).toString("utf8");

      for (const line of text.split(/\r?\n/)) {
        if (!line.trim()) continue;

        try {
          const hotel = normalizeHotel(JSON.parse(line), hotels.length);
          if (!hotel) continue;

          const key = `${hotel.hotel_id}|${hotel.hotel_name}|${hotel.country}|${hotel.city}`;
          if (seen.has(key)) continue;

          seen.add(key);
          hotels.push(hotel);
        } catch {}
      }
    }
  } catch {}
}

const countryMap = new Map();

for (const hotel of hotels) {
  if (!countryMap.has(hotel.country)) countryMap.set(hotel.country, new Set());
  countryMap.get(hotel.country).add(hotel.city);
}

const countries = Array.from(countryMap.entries())
  .map(([country, cities]) => ({
    country,
    cities: Array.from(cities)
      .sort((a, b) => a.localeCompare(b))
      .map((city) => ({ city }))
  }))
  .sort((a, b) => a.country.localeCompare(b.country));

const hotelOutput = {
  ok: true,
  source: "D drive restored hotel catalogue",
  generated_at: new Date().toISOString(),
  total_hotels: hotels.length,
  hotels
};

const destinationOutput = {
  ok: true,
  source: "D drive restored destination catalogue",
  generated_at: new Date().toISOString(),
  total_countries: countries.length,
  total_cities: countries.reduce((sum, item) => sum + item.cities.length, 0),
  countries
};

fs.mkdirSync(PUBLIC, { recursive: true });
fs.mkdirSync(BACKEND_DATA, { recursive: true });

fs.writeFileSync(path.join(PUBLIC, "live-hotels.json"), JSON.stringify(hotelOutput, null, 2));
fs.writeFileSync(path.join(BACKEND_DATA, "live-hotels.json"), JSON.stringify(hotelOutput, null, 2));

fs.writeFileSync(path.join(PUBLIC, "live-destinations.json"), JSON.stringify(destinationOutput, null, 2));
fs.writeFileSync(path.join(BACKEND_DATA, "live-destinations.json"), JSON.stringify(destinationOutput, null, 2));

console.log("DONE");
console.log("Hotels:", hotelOutput.total_hotels);
console.log("Countries:", destinationOutput.total_countries);
console.log("Cities:", destinationOutput.total_cities);
