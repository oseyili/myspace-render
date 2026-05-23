const express = require("express");
const cors = require("cors");
const fs = require("fs");
const path = require("path");
const zlib = require("zlib");

let stripe = null;
try {
  if (process.env.STRIPE_SECRET_KEY) {
    stripe = require("stripe")(process.env.STRIPE_SECRET_KEY);
  }
} catch {}

const app = express();
const PORT = process.env.PORT || 5050;

app.use(cors());
app.use(express.json({ limit: "25mb" }));

const ROOT = path.resolve(__dirname, "..");
const FRONTEND_PUBLIC = path.join(ROOT, "frontend", "public");

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
    const value = obj?.[key];
    if (value !== undefined && value !== null && String(value).trim()) return value;
  }
  return "";
}

function arrayFromPayload(payload) {
  if (!payload) return [];
  if (Array.isArray(payload)) return payload;
  if (Array.isArray(payload.countries)) return payload.countries;
  if (Array.isArray(payload.destinations)) return payload.destinations;
  if (Array.isArray(payload.hotels)) return payload.hotels;
  if (Array.isArray(payload.data)) return payload.data;
  if (Array.isArray(payload.results)) return payload.results;
  return [];
}

const DESTINATION_FILES = [
  path.join(FRONTEND_PUBLIC, "live-destinations.json"),
  path.join(FRONTEND_PUBLIC, "destinations.json"),
  path.join(__dirname, "data", "live-destinations.json"),
  path.join(__dirname, "data", "destinations.json")
];

const HOTEL_FILES = [
  path.join(FRONTEND_PUBLIC, "live-hotels.json"),
  path.join(FRONTEND_PUBLIC, "hotels.json"),
  path.join(__dirname, "data", "live-hotels.json"),
  path.join(__dirname, "data", "hotels.json"),
  path.join(__dirname, "data", "bookings.json")
];

function loadHotels() {
  const all = [];

  for (const file of HOTEL_FILES) {
    const payload = readJson(file);
    const rows = arrayFromPayload(payload);
    for (const row of rows) all.push(row);
  }

  const cacheDir = path.join(__dirname, "data", "live-rate-cache");
  try {
    if (fs.existsSync(cacheDir)) {
      const files = fs.readdirSync(cacheDir).filter((f) => f.endsWith(".ndjson.gz"));
      for (const name of files.slice(-12)) {
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

      if (!hotel_name || !country || !city) return null;

      const rateSource = h.first_rate || h.rate || h;
      const amount = Number(pick(rateSource, ["amount", "price", "total", "net", "sellingRate", "rate"]));
      const currency = cleanText(pick(rateSource, ["currency", "currencyCode"])) || "GBP";
      const rate_key = cleanText(pick(rateSource, ["rate_key", "rateKey"]));

      const image_url = cleanText(pick(h, ["image_url", "image", "main_image", "photo", "thumbnail"]));
      const key = `${hotel_id}-${hotel_name}-${country}-${city}`;

      if (seen.has(key)) return null;
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
        image_url,
        image_caption: "Verified property image",
        image_source: "MySpace Hotel",
        has_verified_image: Boolean(image_url),
        latitude: pick(h, ["latitude", "lat"]),
        longitude: pick(h, ["longitude", "lng", "lon"]),
        first_rate: amount > 0 ? { amount, currency, rate_key } : null
      };
    })
    .filter(Boolean);
}

function normalizeDestinationsFromFiles() {
  const map = new Map();

  for (const file of DESTINATION_FILES) {
    const payload = readJson(file);
    const rows = arrayFromPayload(payload);

    for (const row of rows) {
      const country = cleanText(pick(row, ["country", "country_name", "countryName", "name", "label"]));
      if (!country || country.toLowerCase() === "unknown") continue;

      const citiesRaw = Array.isArray(row.cities)
        ? row.cities
        : Array.isArray(row.destinations)
          ? row.destinations
          : Array.isArray(row.locations)
            ? row.locations
            : [];

      if (!map.has(country)) map.set(country, new Set());

      for (const item of citiesRaw) {
        const city = cleanText(
          typeof item === "string"
            ? item
            : pick(item, ["city", "city_name", "cityName", "name", "label", "destination"])
        );
        if (city && city.toLowerCase() !== "unknown") map.get(country).add(city);
      }
    }
  }

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
        .filter(Boolean)
        .sort((a, b) => a.localeCompare(b))
        .map((city) => ({ city }))
    }))
    .filter((x) => x.country && x.cities.length)
    .sort((a, b) => a.country.localeCompare(b.country));
}

app.get("/", (req, res) => {
  res.json({ ok: true, service: "MySpace Hotel backend" });
});

app.get("/status", (req, res) => {
  const hotels = loadHotels();
  const countries = normalizeDestinationsFromFiles();

  res.json({
    ok: true,
    service: "MySpace Hotel backend",
    hotels: hotels.length,
    countries: countries.length,
    cities: countries.reduce((sum, c) => sum + c.cities.length, 0),
    stripe_ready: Boolean(stripe)
  });
});

app.get("/api/real-catalog/destinations", (req, res) => {
  const countries = normalizeDestinationsFromFiles();
  res.json({ ok: true, total_countries: countries.length, countries });
});

app.get("/api/destinations", (req, res) => {
  const countries = normalizeDestinationsFromFiles();
  res.json({ ok: true, total_countries: countries.length, countries });
});

app.get("/api/hotels/search", (req, res) => {
  const country = cleanText(req.query.country).toLowerCase();
  const city = cleanText(req.query.city).toLowerCase();
  const limit = Math.min(Number(req.query.limit || 100), 250);

  const hotels = loadHotels()
    .filter((h) => {
      const hc = cleanText(h.country).toLowerCase();
      const hcity = cleanText(h.city).toLowerCase();
      return (!country || hc === country) && (!city || hcity === city);
    })
    .slice(0, limit);

  res.json({ ok: true, total: hotels.length, hotels });
});

app.post("/api/create-checkout-session", async (req, res) => {
  try {
    if (!stripe) {
      return res.status(500).json({
        ok: false,
        error: "Stripe is not configured. Add STRIPE_SECRET_KEY in Render environment variables."
      });
    }

    const body = req.body || {};
    const amount = Math.max(50, Math.round(Number(body.amount || 0) * 100));
    const currency = String(body.currency || "GBP").toLowerCase();

    const successUrl =
      process.env.STRIPE_SUCCESS_URL ||
      "https://www.myspace-hotel.com/?payment=success";

    const cancelUrl =
      process.env.STRIPE_CANCEL_URL ||
      "https://www.myspace-hotel.com/?payment=cancelled";

    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      success_url: successUrl,
      cancel_url: cancelUrl,
      customer_email: body.customer_email || undefined,
      line_items: [
        {
          quantity: 1,
          price_data: {
            currency,
            unit_amount: amount,
            product_data: {
              name: body.hotel_name || "MySpace Hotel reservation",
              description: `${body.destination || "Hotel stay"} | ${body.checkin || ""} to ${body.checkout || ""}`
            }
          }
        }
      ],
      metadata: {
        hotel_id: String(body.hotel_id || ""),
        hotel_name: String(body.hotel_name || ""),
        destination: String(body.destination || ""),
        checkin: String(body.checkin || ""),
        checkout: String(body.checkout || ""),
        guests: String(body.guests || ""),
        rooms: String(body.rooms || ""),
        rate_key: String(body.rate_key || "").slice(0, 450)
      }
    });

    res.json({ ok: true, url: session.url });
  } catch (error) {
    res.status(500).json({
      ok: false,
      error: error.message || "Checkout could not be created."
    });
  }
});

app.post("/api/extranet/register", (req, res) => {
  const body = req.body || {};
  const dir = path.join(__dirname, "data");
  const file = path.join(dir, "partner_applications.json");

  try {
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

    const old = readJson(file) || [];
    old.push({
      id: `partner-${Date.now()}`,
      created_at: new Date().toISOString(),
      ...body
    });

    fs.writeFileSync(file, JSON.stringify(old, null, 2));
  } catch {}

  res.json({
    ok: true,
    message: "Partner application received.",
    partner_type: body.partner_type || "hotel",
    business_name: body.business_name || body.hotel_name || "",
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
  const hotels = loadHotels();
  const countries = normalizeDestinationsFromFiles();

  console.log(`MySpace Hotel backend running on port ${PORT}`);
  console.log(`Hotels: ${hotels.length}`);
  console.log(`Countries: ${countries.length}`);
  console.log(`Cities: ${countries.reduce((sum, c) => sum + c.cities.length, 0)}`);
  console.log(`Stripe ready: ${Boolean(stripe)}`);
});