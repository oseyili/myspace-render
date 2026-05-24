const express = require("express");
const cors = require("cors");
const fs = require("fs");
const path = require("path");
const zlib = require("zlib");
const readline = require("readline");
const crypto = require("crypto");

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
const DATA = path.join(__dirname, "data");
const PUBLIC = path.join(ROOT, "frontend", "public");

const DEST_BACKEND = path.join(DATA, "live-destinations.json");
const DEST_PUBLIC = path.join(PUBLIC, "live-destinations.json");
const HOTELS_GZ = path.join(DATA, "live-hotels.ndjson.gz");
const HOTELS_META = path.join(DATA, "live-hotels-meta.json");

const HOTELBEDS_API_KEY =
  process.env.HOTELBEDS_API_KEY ||
  process.env.HOTELBEDS_KEY ||
  "";

const HOTELBEDS_SECRET =
  process.env.HOTELBEDS_SECRET ||
  process.env.HOTELBEDS_API_SECRET ||
  "";

const HOTELBEDS_BASE_URL =
  process.env.HOTELBEDS_BASE_URL ||
  "https://api.hotelbeds.com";

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

function readJson(file, fallback) {
  try {
    if (!fs.existsSync(file)) return fallback;
    return JSON.parse(fs.readFileSync(file, "utf8"));
  } catch {
    return fallback;
  }
}

const COUNTRY_MAP = {
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

const CITY_MAP = {
  lon: "London",
  par: "Paris",
  dxb: "Dubai",
  nyc: "New York",
  mad: "Madrid",
  bcn: "Barcelona",
  los: "Lagos",
  abv: "Abuja",
  bni: "Benin City",
  man: "Manchester",
  bhx: "Birmingham",
  lax: "Los Angeles",
  mia: "Miami"
};

function normalizeCountry(v) {
  return COUNTRY_MAP[key(v)] || clean(v);
}

function normalizeCity(v) {
  return CITY_MAP[key(v)] || clean(v);
}

function normalizeHotel(h, index) {
  const hotel_id =
    clean(pick(h, ["hotel_id", "hotelId", "id", "code", "hotelCode", "supplier_hotel_id"])) ||
    `hotel-${index}`;

  const hotel_code =
    clean(pick(h, ["hotel_code", "hotelCode", "code", "supplier_hotel_id", "hotel_id", "id"])) ||
    hotel_id;

  const supplier =
    clean(pick(h, ["supplier", "source", "provider"])) ||
    "hotelbeds";

  const hotel_name = clean(pick(h, ["hotel_name", "hotelName", "name", "title"]));

  const country = normalizeCountry(
    pick(h, ["country", "country_name", "countryName", "country_code", "countryCode"])
  );

  const city = normalizeCity(
    pick(h, ["city", "city_name", "cityName", "destination", "destination_name", "destinationName"])
  );

  if (!hotel_name || !country || !city) return null;

  const image_url = clean(pick(h, ["image_url", "image", "main_image", "mainImage", "photo", "thumbnail"]));

  return {
    id: hotel_id,
    hotel_id,
    hotel_code,
    supplier,
    hotel_name,
    name: hotel_name,
    country,
    city,
    area: clean(pick(h, ["area", "zone", "district"])),
    address: clean(pick(h, ["address", "address1", "street"])),
    rating: clean(pick(h, ["rating", "category", "stars"])),
    image_url,
    image_caption: image_url ? "Verified property image" : "",
    image_source: image_url ? "MySpace Hotel verified image" : "",
    has_verified_image: Boolean(image_url),
    latitude: pick(h, ["latitude", "lat"]),
    longitude: pick(h, ["longitude", "lng", "lon"])
  };
}

function getDestinations() {
  const payload = readJson(DEST_BACKEND, null) || readJson(DEST_PUBLIC, null) || { countries: [] };
  const countries = Array.isArray(payload.countries) ? payload.countries : [];

  return countries
    .map((c) => ({
      country: clean(c.country || c.country_name || c.name),
      cities: Array.isArray(c.cities)
        ? c.cities
            .map((x) => ({
              city: clean(typeof x === "string" ? x : x.city || x.city_name || x.name)
            }))
            .filter((x) => x.city)
        : []
    }))
    .filter((c) => c.country && c.cities.length)
    .sort((a, b) => a.country.localeCompare(b.country));
}

function accommodationTypeText(hotel) {
  return [hotel.hotel_name, hotel.name, hotel.area, hotel.address].join(" ").toLowerCase();
}

function stayTypeMatches(hotel, stayType) {
  if (!stayType || stayType === "both") return true;

  const text = accommodationTypeText(hotel);
  const isOther =
    text.includes("apartment") ||
    text.includes("apartments") ||
    text.includes("residence") ||
    text.includes("villa") ||
    text.includes("hostel") ||
    text.includes("suite") ||
    text.includes("guesthouse") ||
    text.includes("guest house");

  const isHotel = text.includes("hotel") || !isOther;

  if (stayType === "hotel") return isHotel;
  if (stayType === "other") return isOther;

  return true;
}

async function searchHotels({ country, city, stay_type, limit }) {
  const results = [];
  const seen = new Set();

  if (!fs.existsSync(HOTELS_GZ)) return [];

  const stream = fs.createReadStream(HOTELS_GZ).pipe(zlib.createGunzip());
  const rl = readline.createInterface({ input: stream, crlfDelay: Infinity });

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
      if (key(hotel.country) !== key(normalizeCountry(country))) continue;
      if (key(hotel.city) !== key(normalizeCity(city))) continue;
      if (!stayTypeMatches(hotel, stay_type)) continue;

      const dedupe = [key(hotel.hotel_name), key(hotel.address), key(hotel.city), key(hotel.country)].join("|");
      if (seen.has(dedupe)) continue;
      seen.add(dedupe);

      results.push(hotel);
    } catch {}
  }

  return results;
}

async function findHotelById(hotelId) {
  if (!fs.existsSync(HOTELS_GZ)) return null;

  const wanted = clean(hotelId);
  const stream = fs.createReadStream(HOTELS_GZ).pipe(zlib.createGunzip());
  const rl = readline.createInterface({ input: stream, crlfDelay: Infinity });

  let index = 0;

  for await (const line of rl) {
    if (!line.trim()) continue;

    try {
      const hotel = normalizeHotel(JSON.parse(line), index);
      index += 1;

      if (!hotel) continue;

      if (
        clean(hotel.hotel_id) === wanted ||
        clean(hotel.id) === wanted ||
        clean(hotel.hotel_code) === wanted
      ) {
        rl.close();
        stream.destroy();
        return hotel;
      }
    } catch {}
  }

  return null;
}

function hotelbedsSignature() {
  const timestamp = Math.floor(Date.now() / 1000);
  return crypto
    .createHash("sha256")
    .update(HOTELBEDS_API_KEY + HOTELBEDS_SECRET + timestamp)
    .digest("hex");
}

function hotelbedsReady() {
  return Boolean(HOTELBEDS_API_KEY && HOTELBEDS_SECRET);
}

function roomOccupancy(guests) {
  const adults = Math.max(1, Number(guests || 2));
  return [{ rooms: 1, adults, children: 0 }];
}

async function fetchHotelbedsLiveRate({ hotel, checkin, checkout, guests, rooms }) {
  if (!hotelbedsReady()) {
    return null;
  }

  const hotelCode = clean(hotel.hotel_code || hotel.hotel_id || hotel.id);
  if (!hotelCode) return null;

  const occupancy = roomOccupancy(guests);

  const body = {
    stay: {
      checkIn: checkin,
      checkOut: checkout
    },
    occupancies: occupancy,
    hotels: {
      hotel: [Number(hotelCode)]
    }
  };

  if (!Number.isFinite(Number(hotelCode))) {
    return null;
  }

  const response = await fetch(`${HOTELBEDS_BASE_URL}/hotel-api/1.0/hotels`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Api-key": HOTELBEDS_API_KEY,
      "X-Signature": hotelbedsSignature(),
      Accept: "application/json",
      "Accept-Encoding": "gzip"
    },
    body: JSON.stringify(body)
  });

  if (!response.ok) {
    return null;
  }

  const data = await response.json();

  const hbHotel = data?.hotels?.hotels?.[0];
  const roomsList = Array.isArray(hbHotel?.rooms) ? hbHotel.rooms : [];

  let best = null;

  for (const room of roomsList) {
    const rates = Array.isArray(room.rates) ? room.rates : [];

    for (const rate of rates) {
      const amount = Number(rate.net || rate.sellingRate || rate.amount || 0);
      if (!(amount > 0)) continue;

      const candidate = {
        amount,
        currency: clean(rate.currency || data?.hotels?.currency || "GBP"),
        rate_key: clean(rate.rateKey || rate.rate_key || ""),
        supplier: "hotelbeds",
        source: "hotelbeds_live_availability",
        room_name: clean(room.name || room.code || ""),
        board_name: clean(rate.boardName || rate.boardCode || ""),
        cancellation: rate.cancellationPolicies || []
      };

      if (candidate.rate_key && (!best || candidate.amount < best.amount)) {
        best = candidate;
      }
    }
  }

  return best;
}

async function fetchPartnerLiveRate(payload) {
  const hotel = await findHotelById(payload.hotel_id);

  if (!hotel) {
    return {
      ok: false,
      live_available: false,
      message: "Selected stay was not found in the searchable catalogue."
    };
  }

  const suppliersTried = [];

  suppliersTried.push("hotelbeds");

  const hotelbedsRate = await fetchHotelbedsLiveRate({
    hotel,
    checkin: payload.checkin,
    checkout: payload.checkout,
    guests: payload.guests,
    rooms: payload.rooms
  });

  if (hotelbedsRate) {
    return {
      ok: true,
      live_available: true,
      hotel,
      rate: hotelbedsRate,
      suppliers_tried: suppliersTried
    };
  }

  return {
    ok: false,
    live_available: false,
    hotel,
    suppliers_tried: suppliersTried,
    message: "No connected supplier returned a live rate for this selected stay."
  };
}

app.get("/", (req, res) => {
  res.json({ ok: true, service: "MySpace Hotel backend" });
});

app.get("/status", (req, res) => {
  const destinations = getDestinations();
  const meta = readJson(HOTELS_META, { total_hotels: 0 });

  res.json({
    ok: true,
    service: "MySpace Hotel backend",
    hotels: Number(meta.total_hotels || 0),
    countries: destinations.length,
    cities: destinations.reduce((sum, c) => sum + c.cities.length, 0),
    stripe_ready: Boolean(stripe),
    hotelbeds_ready: hotelbedsReady(),
    storage: fs.existsSync(HOTELS_GZ) ? "compressed_streaming" : "missing",
    live_rate_mode: "selected_hotel_live_supplier_search_no_fallback_price"
  });
});

app.get("/api/real-catalog/destinations", (req, res) => {
  const countries = getDestinations();
  res.json({ ok: true, total_countries: countries.length, countries });
});

app.get("/api/destinations", (req, res) => {
  const countries = getDestinations();
  res.json({ ok: true, total_countries: countries.length, countries });
});

app.get("/api/hotels/search", async (req, res) => {
  try {
    const hotels = await searchHotels({
      country: req.query.country,
      city: req.query.city,
      stay_type: req.query.stay_type || "both",
      limit: Math.min(Number(req.query.limit || 100), 200)
    });

    res.json({ ok: true, total: hotels.length, hotels });
  } catch (error) {
    res.status(500).json({ ok: false, error: error.message || "Hotel search failed." });
  }
});

app.get("/api/hotels/live-rate", async (req, res) => {
  try {
    const result = await fetchPartnerLiveRate({
      hotel_id: req.query.hotel_id,
      checkin: req.query.checkin,
      checkout: req.query.checkout,
      guests: req.query.guests,
      rooms: req.query.rooms
    });

    res.json(result);
  } catch (error) {
    res.status(500).json({
      ok: false,
      live_available: false,
      error: error.message || "Live supplier rate lookup failed."
    });
  }
});

app.post("/api/create-checkout-session", async (req, res) => {
  try {
    if (!stripe) {
      return res.status(500).json({ ok: false, error: "Stripe is not configured." });
    }

    const body = req.body || {};
    const amountValue = Number(body.amount || 0);
    const rateKey = clean(body.rate_key || "");

    if (!(amountValue > 0) || !rateKey) {
      return res.status(400).json({
        ok: false,
        error: "Checkout blocked. A real supplier live rate is required before payment."
      });
    }

    const amount = Math.round(amountValue * 100);
    const currency = String(body.currency || "GBP").toLowerCase();

    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      success_url: process.env.STRIPE_SUCCESS_URL || "https://www.myspace-hotel.com/?payment=success",
      cancel_url: process.env.STRIPE_CANCEL_URL || "https://www.myspace-hotel.com/?payment=cancelled",
      customer_email: body.customer_email || undefined,
      line_items: [
        {
          quantity: 1,
          price_data: {
            currency,
            unit_amount: amount,
            product_data: {
              name: body.hotel_name || "MySpace Hotel reservation",
              description: `${body.destination || "Selected stay"} | ${body.checkin || ""} to ${body.checkout || ""}`
            }
          }
        }
      ],
      metadata: {
        hotel_id: String(body.hotel_id || ""),
        rate_key: String(rateKey).slice(0, 450),
        source: "selected_supplier_live_rate_only"
      }
    });

    res.json({ ok: true, url: session.url });
  } catch (error) {
    res.status(500).json({ ok: false, error: error.message || "Checkout failed." });
  }
});

app.post("/api/extranet/register", (req, res) => {
  const body = req.body || {};
  const file = path.join(DATA, "partner_applications.json");

  try {
    if (!fs.existsSync(DATA)) fs.mkdirSync(DATA, { recursive: true });
    const old = readJson(file, []);
    old.push({ id: `partner-${Date.now()}`, created_at: new Date().toISOString(), ...body });
    fs.writeFileSync(file, JSON.stringify(old, null, 2));
  } catch {}

  res.json({
    ok: true,
    message: "Partner application received.",
    partner_type: body.partner_type || "partner",
    business_name: body.business_name || body.hotel_name || "",
    email: body.email || ""
  });
});

app.post("/api/auth/login", (req, res) => {
  res.status(401).json({ ok: false, error: "Partner login requires an approved token." });
});

app.listen(PORT, "0.0.0.0", () => {
  const destinations = getDestinations();
  const meta = readJson(HOTELS_META, { total_hotels: 0 });

  console.log(`MySpace Hotel backend running on port ${PORT}`);
  console.log(`Hotels: ${meta.total_hotels || 0}`);
  console.log(`Countries: ${destinations.length}`);
  console.log(`Cities: ${destinations.reduce((sum, c) => sum + c.cities.length, 0)}`);
  console.log(`Stripe ready: ${Boolean(stripe)}`);
  console.log(`Hotelbeds ready: ${hotelbedsReady()}`);
});