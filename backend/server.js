const express = require("express");
const cors = require("cors");
const fs = require("fs");
const path = require("path");
const zlib = require("zlib");

const app = express();
const PORT = process.env.PORT || 5050;

app.use(cors());
app.use(express.json({ limit: "20mb" }));

const ROOT = path.resolve(__dirname, "..");

function readJson(filePath) {
  try {
    if (!fs.existsSync(filePath)) return null;
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch {
    return null;
  }
}

function cleanText(value) {
  return String(value || "")
    .replace(/\s*\(\s*\d+\s*\)\s*$/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function pick(obj, keys) {
  for (const key of keys) {
    if (obj && obj[key] !== undefined && obj[key] !== null && String(obj[key]).trim()) {
      return obj[key];
    }
  }
  return "";
}

const HOTEL_FILES = [
  path.join(__dirname, "data", "live-hotels.json"),
  path.join(__dirname, "data", "hotels.json"),
  path.join(__dirname, "data", "bookings.json"),
  path.join(ROOT, "frontend", "public", "live-hotels.json"),
  path.join(ROOT, "frontend", "public", "hotels.json")
];

function flattenHotels(payload) {
  if (!payload) return [];
  if (Array.isArray(payload)) return payload;
  if (Array.isArray(payload.hotels)) return payload.hotels;
  if (Array.isArray(payload.data)) return payload.data;
  if (Array.isArray(payload.results)) return payload.results;
  return [];
}

function loadHotels() {
  const all = [];

  for (const file of HOTEL_FILES) {
    const payload = readJson(file);
    const rows = flattenHotels(payload);
    for (const row of rows) all.push(row);
  }

  const cacheDir = path.join(__dirname, "data", "live-rate-cache");
  try {
    if (fs.existsSync(cacheDir)) {
      const files = fs.readdirSync(cacheDir).filter((f) => f.endsWith(".ndjson.gz")).slice(-6);
      for (const name of files) {
        const full = path.join(cacheDir, name);
        const text = zlib.gunzipSync(fs.readFileSync(full)).toString("utf8");
        for (const line of text.split(/\r?\n/)) {
          if (!line.trim()) continue;
          try {
            all.push(JSON.parse(line));
          } catch {}
        }
      }
    }
  } catch {}

  const seen = new Set();

  return all
    .map((h, index) => {
      const hotel_id = cleanText(pick(h, ["hotel_id", "id", "code", "hotelCode", "supplier_hotel_id"])) || `hotel-${index}`;
      const hotel_name = cleanText(pick(h, ["hotel_name", "name", "hotelName", "title"]));
      const country = cleanText(pick(h, ["country_name", "countryName", "country", "country_code"]));
      const city = cleanText(pick(h, ["city_name", "cityName", "city", "destination", "destination_name"]));
      const amount = Number(
        pick(h.first_rate || h.rate || h, ["amount", "price", "total", "net", "sellingRate", "rate"])
      );

      const currency = cleanText(
        pick(h.first_rate || h.rate || h, ["currency", "currencyCode"])
      ) || "GBP";

      const rate_key = cleanText(
        pick(h.first_rate || h.rate || h, ["rate_key", "rateKey"])
      );

      const key = `${hotel_id}-${hotel_name}-${country}-${city}`;
      if (!hotel_name || !country || !city || seen.has(key)) return null;
      seen.add(key);

      return {
        id: hotel_id,
        hotel_id,
        hotel_name,
        name: hotel_name,
        country,
        city,
        area: cleanText(pick(h, ["area", "zone", "district"])),
        address: cleanText(pick(h, ["address", "address1", "street"])),
        rating: cleanText(pick(h, ["rating", "category", "stars"])),
        image_url: cleanText(pick(h, ["image_url", "image", "main_image", "photo", "thumbnail"])),
        image_caption: "Verified property image",
        image_source: "MySpace Hotel",
        has_verified_image: Boolean(cleanText(pick(h, ["image_url", "image", "main_image", "photo", "thumbnail"]))),
        latitude: pick(h, ["latitude", "lat"]),
        longitude: pick(h, ["longitude", "lng", "lon"]),
        first_rate: amount > 0 ? { amount, currency, rate_key } : null
      };
    })
    .filter(Boolean);
}

function buildDestinations() {
  const map = new Map();

  for (const hotel of loadHotels()) {
    const country = cleanText(hotel.country);
    const city = cleanText(hotel.city);
    if (!country || !city) continue;
    if (!map.has(country)) map.set(country, new Set());
    map.get(country).add(city);
  }

  return Array.from(map.entries())
    .map(([country, cities]) => ({
      country,
      cities: Array.from(cities)
        .sort((a, b) => a.localeCompare(b))
        .map((city) => ({ city }))
    }))
    .sort((a, b) => a.country.localeCompare(b.country));
}

app.get("/", (req, res) => {
  res.json({ ok: true, service: "MySpace Hotel backend" });
});

app.get("/status", (req, res) => {
  const hotels = loadHotels();
  const destinations = buildDestinations();

  res.json({
    ok: true,
    service: "MySpace Hotel backend",
    hotels: hotels.length,
    countries: destinations.length,
    cities: destinations.reduce((sum, c) => sum + c.cities.length, 0)
  });
});

app.get("/api/real-catalog/destinations", (req, res) => {
  const countries = buildDestinations();
  res.json({
    ok: true,
    total_countries: countries.length,
    countries
  });
});

app.get("/api/destinations", (req, res) => {
  const countries = buildDestinations();
  res.json({
    ok: true,
    total_countries: countries.length,
    countries
  });
});

app.get("/api/hotels/search", (req, res) => {
  const country = cleanText(req.query.country).toLowerCase();
  const city = cleanText(req.query.city).toLowerCase();
  const limit = Math.min(Number(req.query.limit || 100), 200);

  const hotels = loadHotels()
    .filter((h) => {
      const hCountry = cleanText(h.country).toLowerCase();
      const hCity = cleanText(h.city).toLowerCase();
      return (!country || hCountry === country) && (!city || hCity === city);
    })
    .slice(0, limit);

  res.json({
    ok: true,
    hotels,
    total: hotels.length
  });
});

app.post("/api/create-checkout-session", (req, res) => {
  res.json({
    ok: false,
    error: "Secure checkout needs payment provider configuration before payment can open."
  });
});

app.post("/api/extranet/register", (req, res) => {
  const body = req.body || {};
  res.json({
    ok: true,
    message: "Hotel onboarding request received.",
    hotel_name: body.hotel_name || "",
    email: body.email || ""
  });
});

app.post("/api/auth/login", (req, res) => {
  res.status(401).json({
    ok: false,
    error: "Partner login requires an approved token."
  });
});

app.listen(PORT, "0.0.0.0", () => {
  const destinations = buildDestinations();
  const hotelCount = loadHotels().length;

  console.log(`MySpace Hotel backend running on port ${PORT}`);
  console.log(`Hotels: ${hotelCount}`);
  console.log(`Countries: ${destinations.length}`);
  console.log(`Cities: ${destinations.reduce((sum, c) => sum + c.cities.length, 0)}`);
});