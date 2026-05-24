# PROJECT ROOT — Windows PowerShell

cd C:\frontend\hotel-booking-app

@'
const express = require("express");
const cors = require("cors");
const fs = require("fs");
const path = require("path");
const zlib = require("zlib");
const readline = require("readline");

let stripe = null;
try {
  if (process.env.STRIPE_SECRET_KEY) {
    stripe = require("stripe")(process.env.STRIPE_SECRET_KEY);
  }
} catch {}

const app = express();
const PORT = process.env.PORT || 5050;

app.use(cors());
app.use(express.json({ limit: "10mb" }));

const ROOT = path.resolve(__dirname, "..");
const BACKEND_DATA = path.join(__dirname, "data");
const PUBLIC = path.join(ROOT, "frontend", "public");

const DESTINATION_FILE_BACKEND = path.join(BACKEND_DATA, "live-destinations.json");
const DESTINATION_FILE_PUBLIC = path.join(PUBLIC, "live-destinations.json");
const HOTEL_GZ_FILE = path.join(BACKEND_DATA, "live-hotels.ndjson.gz");
const HOTEL_META_FILE = path.join(BACKEND_DATA, "live-hotels-meta.json");

const CITY_ALIASES = {
  london: ["london", "lon"],
  paris: ["paris", "par"],
  dubai: ["dubai", "dxb"],
  "new york": ["new york", "nyc"],
  barcelona: ["barcelona", "bcn"],
  madrid: ["madrid", "mad"],
  lagos: ["lagos", "los"],
  abuja: ["abuja", "abv"],
  "benin city": ["benin city", "bni"],
  manchester: ["manchester", "man"],
  birmingham: ["birmingham", "bhx"],
  miami: ["miami", "mia"],
  "los angeles": ["los angeles", "lax"],
  nice: ["nice", "nce"],
  lyon: ["lyon", "lys"],
  "abu dhabi": ["abu dhabi", "auh"]
};

function cleanText(value) {
  return String(value || "")
    .replace(/\s*\(\s*\d+\s*\)\s*$/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function keyText(value) {
  return cleanText(value).toLowerCase();
}

function aliasesForCity(city) {
  const key = keyText(city);
  const set = new Set([key]);

  if (CITY_ALIASES[key]) {
    for (const alias of CITY_ALIASES[key]) set.add(alias);
  }

  for (const [name, aliases] of Object.entries(CITY_ALIASES)) {
    if (aliases.includes(key)) {
      set.add(name);
      for (const alias of aliases) set.add(alias);
    }
  }

  return set;
}

function readJson(filePath, fallback) {
  try {
    if (!fs.existsSync(filePath)) return fallback;
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch {
    return fallback;
  }
}

function pick(obj, keys) {
  for (const key of keys) {
    const value = obj?.[key];
    if (value !== undefined && value !== null && String(value).trim()) return value;
  }
  return "";
}

function normalizeHotel(h, index) {
  const rateSource = h.first_rate || h.rate || h;

  const hotel_id =
    cleanText(pick(h, ["hotel_id", "id", "code", "hotelCode", "supplier_hotel_id"])) ||
    `hotel-${index}`;

  const hotel_name = cleanText(pick(h, ["hotel_name", "name", "hotelName", "title"]));
  const country = cleanText(pick(h, ["country", "country_name", "countryName", "country_code", "countryCode"]));
  const city = cleanText(pick(h, ["city", "city_name", "cityName", "destination", "destination_name", "destinationName"]));

  if (!hotel_name || !country || !city) return null;

  const amount = Number(pick(rateSource, ["amount", "price", "total", "net", "sellingRate", "rate"]));
  const currency = cleanText(pick(rateSource, ["currency", "currencyCode"])) || "GBP";
  const rate_key = cleanText(pick(rateSource, ["rate_key", "rateKey"]));
  const image_url = cleanText(pick(h, ["image_url", "image", "main_image", "photo", "thumbnail"]));

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
    image_caption: image_url ? "Verified property image" : "",
    image_source: image_url ? "MySpace Hotel verified image" : "",
    has_verified_image: Boolean(image_url),
    latitude: pick(h, ["latitude", "lat"]),
    longitude: pick(h, ["longitude", "lng", "lon"]),
    first_rate: amount > 0 ? { amount, currency, rate_key } : null
  };
}

function getDestinations() {
  const payload =
    readJson(DESTINATION_FILE_BACKEND, null) ||
    readJson(DESTINATION_FILE_PUBLIC, null) ||
    { countries: [] };

  const countries = Array.isArray(payload.countries)
    ? payload.countries
    : Array.isArray(payload)
      ? payload
      : [];

  return countries
    .map((c) => ({
      country: cleanText(c.country || c.country_name || c.name),
      cities: Array.isArray(c.cities)
        ? c.cities
            .map((x) => ({
              city: cleanText(typeof x === "string" ? x : x.city || x.city_name || x.name)
            }))
            .filter((x) => x.city)
        : []
    }))
    .filter((c) => c.country && c.cities.length)
    .sort((a, b) => a.country.localeCompare(b.country));
}

async function searchCompressedHotels(country, city, limit) {
  const results = [];
  const wantedCountry = keyText(country);
  const wantedCityAliases = aliasesForCity(city);

  if (!fs.existsSync(HOTEL_GZ_FILE)) return results;

  const stream = fs.createReadStream(HOTEL_GZ_FILE).pipe(zlib.createGunzip());

  const rl = readline.createInterface({
    input: stream,
    crlfDelay: Infinity
  });

  let index = 0;

  for await (const line of rl) {
    if (results.length >= limit) {
      rl.close();
      stream.destroy();
      break;
    }

    if (!line.trim()) continue;

    try {
      const hotel = normalizeHotel(JSON.parse(line), index);
      index += 1;

      if (!hotel) continue;

      const hc = keyText(hotel.country);
      const hcity = keyText(hotel.city);

      const countryMatch =
        !wantedCountry ||
        hc === wantedCountry ||
        hc.includes(wantedCountry) ||
        wantedCountry.includes(hc);

      const cityMatch =
        !city ||
        wantedCityAliases.has(hcity) ||
        hcity.includes(keyText(city)) ||
        keyText(city).includes(hcity);

      if (!countryMatch || !cityMatch) continue;

      results.push(hotel);
    } catch {}
  }

  return results;
}

app.get("/", (req, res) => {
  res.json({ ok: true, service: "MySpace Hotel backend" });
});

app.get("/status", (req, res) => {
  const destinations = getDestinations();
  const meta = readJson(HOTEL_META_FILE, { total_hotels: 0 });

  res.json({
    ok: true,
    service: "MySpace Hotel backend",
    hotels: Number(meta.total_hotels || 0),
    countries: destinations.length,
    cities: destinations.reduce((sum, c) => sum + c.cities.length, 0),
    stripe_ready: Boolean(stripe),
    storage: fs.existsSync(HOTEL_GZ_FILE) ? "compressed_streaming" : "missing"
  });
});

app.get("/api/real-catalog/destinations", (req, res) => {
  const countries = getDestinations();
  res.json({
    ok: true,
    total_countries: countries.length,
    countries
  });
});

app.get("/api/destinations", (req, res) => {
  const countries = getDestinations();
  res.json({
    ok: true,
    total_countries: countries.length,
    countries
  });
});

app.get("/api/hotels/search", async (req, res) => {
  try {
    const limit = Math.min(Number(req.query.limit || 100), 200);
    const hotels = await searchCompressedHotels(req.query.country, req.query.city, limit);

    res.json({
      ok: true,
      total: hotels.length,
      hotels
    });
  } catch (error) {
    res.status(500).json({
      ok: false,
      error: error.message || "Hotel search failed."
    });
  }
});

app.post("/api/create-checkout-session", async (req, res) => {
  try {
    if (!stripe) {
      return res.status(500).json({
        ok: false,
        error: "Stripe is not configured."
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

    const old = readJson(file, []);
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
  const destinations = getDestinations();
  const meta = readJson(HOTEL_META_FILE, { total_hotels: 0 });

  console.log(`MySpace Hotel backend running on port ${PORT}`);
  console.log(`Hotels: ${meta.total_hotels || 0}`);
  console.log(`Countries: ${destinations.length}`);
  console.log(`Cities: ${destinations.reduce((sum, c) => sum + c.cities.length, 0)}`);
  console.log(`Stripe ready: ${Boolean(stripe)}`);
});
'@ | Set-Content -Encoding UTF8 .\backend\server.js

git add backend/server.js

git commit -m "Match hotel search city names and codes"

git push origin main