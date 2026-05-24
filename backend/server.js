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
app.use(express.json({ limit: "50mb" }));

const ROOT = path.resolve(__dirname, "..");
const DATA = path.join(__dirname, "data");
const PUBLIC = path.join(ROOT, "frontend", "public");

const HOTEL_FILE = path.join(DATA, "live-hotels.ndjson.gz");
const META_FILE = path.join(DATA, "live-hotels-meta.json");
const RATE_INDEX = path.join(DATA, "live-rate-index.json");
const BOOKINGS_FILE = path.join(DATA, "bookings.json");
const PARTNER_FILE = path.join(DATA, "partner_applications.json");

const DEST_FILES = [
  path.join(DATA, "live-destinations.json"),
  path.join(PUBLIC, "live-destinations.json")
];

const RATE_FILES = [
  path.join(DATA, "live-rate-index.json"),
  path.join(DATA, "REAL_ONLY_live_rates.json.gz"),
  path.join(DATA, "live-rates-000001.ndjson.gz"),
  path.join(DATA, "live-rates-000002.ndjson.gz"),
  path.join(DATA, "live-rate-cache", "live-rates-000001.ndjson.gz"),
  path.join(DATA, "live-rate-cache", "live-rates-000002.ndjson.gz")
];

const HOTELBEDS_API_KEY = process.env.HOTELBEDS_API_KEY || process.env.HOTELBEDS_KEY || "";
const HOTELBEDS_SECRET = process.env.HOTELBEDS_SECRET || process.env.HOTELBEDS_API_SECRET || "";
const HOTELBEDS_BASE = process.env.HOTELBEDS_BASE_URL || "https://api.hotelbeds.com";

function clean(v) {
  return String(v || "").replace(/\s+/g, " ").trim();
}

function key(v) {
  return clean(v).toLowerCase();
}

function safeJson(file, fallback) {
  try {
    if (!fs.existsSync(file)) return fallback;
    return JSON.parse(fs.readFileSync(file, "utf8"));
  } catch {
    return fallback;
  }
}

function writeJson(file, data) {
  try {
    if (!fs.existsSync(DATA)) fs.mkdirSync(DATA, { recursive: true });
    fs.writeFileSync(file, JSON.stringify(data, null, 2));
  } catch {}
}

function pick(o, keys) {
  for (const k of keys) {
    const v = o && o[k];
    if (v !== undefined && v !== null && String(v).trim()) return v;
  }
  return "";
}

function normalizeCountry(v) {
  const map = {
    uk: "United Kingdom",
    gb: "United Kingdom",
    gbr: "United Kingdom",
    england: "United Kingdom",
    usa: "United States",
    us: "United States",
    ae: "United Arab Emirates",
    uae: "United Arab Emirates",
    ng: "Nigeria",
    fr: "France",
    es: "Spain"
  };
  return map[key(v)] || clean(v);
}

function normalizeCity(v) {
  const map = {
    lon: "London",
    nyc: "New York",
    par: "Paris",
    dxb: "Dubai",
    los: "Lagos",
    abv: "Abuja",
    bni: "Benin City",
    mad: "Madrid",
    bcn: "Barcelona",
    lax: "Los Angeles",
    mia: "Miami"
  };
  return map[key(v)] || clean(v);
}

function normalizeHotel(row, index) {
  const hotelName = clean(pick(row, ["hotel_name", "hotelName", "name", "title"]));
  if (!hotelName) return null;

  const country = normalizeCountry(pick(row, ["country", "country_name", "countryName", "country_code", "countryCode"]));
  const city = normalizeCity(pick(row, ["city", "city_name", "cityName", "destination", "destination_name", "destinationName"]));
  if (!country || !city) return null;

  const id =
    clean(pick(row, ["hotel_id", "hotelId", "id", "code", "hotelCode", "supplier_hotel_id"])) ||
    `hotel-${index}`;

  const image = clean(pick(row, ["image_url", "image", "photo", "main_image", "thumbnail"]));

  return {
    id,
    hotel_id: id,
    hotelbeds_code:
      clean(pick(row, ["hotelbeds_code", "hotel_code", "hotelCode", "hotel_id", "hotelId", "code", "id"])) || id,
    supplier: clean(row.supplier || row.provider || row.source) || "hotelbeds",
    hotel_name: hotelName,
    name: hotelName,
    country,
    city,
    address: clean(pick(row, ["address", "street", "address1"])),
    area: clean(pick(row, ["area", "zone", "district"])),
    rating: clean(pick(row, ["rating", "category", "stars"])),
    latitude: pick(row, ["latitude", "lat"]) || "",
    longitude: pick(row, ["longitude", "lng", "lon"]) || "",
    image_url: image,
    has_verified_image: Boolean(image)
  };
}

function hotelStayType(name) {
  const text = key(name);
  const otherWords = [
    "apartment", "apartments", "flat", "flats", "villa", "villas",
    "suite", "suites", "guesthouse", "guest house", "home", "homes",
    "residence", "residences", "hostel", "house", "houses", "farmhouse",
    "studio", "studios", "bnb", "b&b", "bed and breakfast", "shortlet",
    "short-let", "serviced apartment", "holiday rental"
  ];

  for (const word of otherWords) {
    if (text.includes(word)) return "other";
  }

  return "hotel";
}

function stayMatch(type, hotelName) {
  if (!type || type === "both") return true;
  const found = hotelStayType(hotelName);
  if (type === "hotel") return found === "hotel";
  if (type === "other") return found === "other";
  return true;
}

function getDestinations() {
  for (const file of DEST_FILES) {
    const data = safeJson(file, null);
    if (data && Array.isArray(data.countries) && data.countries.length > 50) {
      return data.countries
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
  }

  return [];
}

async function streamHotels({ country, city, stay_type, limit }) {
  const hotels = [];
  const seen = new Set();

  if (!fs.existsSync(HOTEL_FILE)) return [];

  const stream = fs.createReadStream(HOTEL_FILE).pipe(zlib.createGunzip());
  const rl = readline.createInterface({ input: stream, crlfDelay: Infinity });

  let index = 0;

  for await (const line of rl) {
    if (!line.trim()) continue;

    try {
      const hotel = normalizeHotel(JSON.parse(line), index++);
      if (!hotel) continue;
      if (key(hotel.country) !== key(normalizeCountry(country))) continue;
      if (key(hotel.city) !== key(normalizeCity(city))) continue;
      if (!stayMatch(stay_type, hotel.hotel_name)) continue;

      const dedupe = [key(hotel.hotel_name), key(hotel.address), key(hotel.city), key(hotel.country)].join("|");
      if (seen.has(dedupe)) continue;

      seen.add(dedupe);
      hotels.push(hotel);

      if (hotels.length >= limit) {
        rl.close();
        stream.destroy();
        break;
      }
    } catch {}
  }

  return hotels;
}

async function findHotel(hotelId) {
  if (!fs.existsSync(HOTEL_FILE)) return null;

  const wanted = clean(hotelId);
  const stream = fs.createReadStream(HOTEL_FILE).pipe(zlib.createGunzip());
  const rl = readline.createInterface({ input: stream, crlfDelay: Infinity });

  let index = 0;

  for await (const line of rl) {
    if (!line.trim()) continue;

    try {
      const hotel = normalizeHotel(JSON.parse(line), index++);
      if (!hotel) continue;

      if (
        clean(hotel.hotel_id) === wanted ||
        clean(hotel.id) === wanted ||
        clean(hotel.hotelbeds_code) === wanted
      ) {
        rl.close();
        stream.destroy();
        return hotel;
      }
    } catch {}
  }

  return null;
}

function hotelbedsReady() {
  return Boolean(HOTELBEDS_API_KEY && HOTELBEDS_SECRET);
}

function hotelbedsSignature() {
  const timestamp = Math.floor(Date.now() / 1000);
  return crypto
    .createHash("sha256")
    .update(HOTELBEDS_API_KEY + HOTELBEDS_SECRET + timestamp)
    .digest("hex");
}

async function searchHotelbeds({ hotel, checkin, checkout, guests, rooms }) {
  if (!hotelbedsReady()) {
    return {
      ok: false,
      customer_message: "Today’s price could not be checked at the moment.",
      internal_reason: "missing_keys"
    };
  }

  const code = Number(hotel.hotelbeds_code);
  if (!Number.isFinite(code)) {
    return {
      ok: false,
      customer_message: "Today’s price could not be checked for this stay.",
      internal_reason: "invalid_code"
    };
  }

  const body = {
    stay: { checkIn: checkin, checkOut: checkout },
    occupancies: [
      {
        rooms: Math.max(1, Number(rooms || 1)),
        adults: Math.max(1, Number(guests || 2)),
        children: 0
      }
    ],
    hotels: { hotel: [code] }
  };

  try {
    const response = await fetch(`${HOTELBEDS_BASE}/hotel-api/1.0/hotels`, {
      method: "POST",
      headers: {
        "Api-key": HOTELBEDS_API_KEY,
        "X-Signature": hotelbedsSignature(),
        Accept: "application/json",
        "Content-Type": "application/json"
      },
      body: JSON.stringify(body)
    });

    const text = await response.text();
    let json = null;

    try {
      json = JSON.parse(text);
    } catch {}

    if (!response.ok) {
      const quota = response.status === 403 && String(text).toLowerCase().includes("quota");

      return {
        ok: false,
        customer_message: quota
          ? "Today’s price check is busy, so we are checking our most recent verified price."
          : "Today’s price could not be checked at the moment.",
        internal_reason: quota ? "quota_exceeded" : "live_price_failed",
        status: response.status,
        body: text.slice(0, 500)
      };
    }

    const hbHotel = json && json.hotels && json.hotels.hotels && json.hotels.hotels[0];
    if (!hbHotel) {
      return {
        ok: false,
        customer_message: "This stay is not showing instant availability for the selected dates.",
        internal_reason: "no_availability"
      };
    }

    let best = null;

    for (const room of hbHotel.rooms || []) {
      for (const rate of room.rates || []) {
        const amount = Number(rate.net || rate.sellingRate || rate.amount || 0);
        if (!(amount > 0)) continue;

        const candidate = {
          amount,
          currency: rate.currency || (json.hotels && json.hotels.currency) || "GBP",
          rate_key: rate.rateKey || "",
          room_name: room.name || room.code || "",
          board_name: rate.boardName || rate.boardCode || "",
          source: "today_price"
        };

        if (candidate.rate_key && (!best || candidate.amount < best.amount)) best = candidate;
      }
    }

    if (!best) {
      return {
        ok: false,
        customer_message: "This stay is not showing instant pricing for the selected dates.",
        internal_reason: "no_payable_rate"
      };
    }

    return {
      ok: true,
      rate_status: "fresh_live",
      customer_message: "Today’s available price is confirmed.",
      rate: best
    };
  } catch (error) {
    return {
      ok: false,
      customer_message: "Today’s price could not be checked at the moment.",
      internal_reason: "request_error",
      error: error.message || "request_error"
    };
  }
}

function getAmount(src) {
  return Number(src?.amount || src?.price || src?.total || src?.net || src?.sellingRate || src?.rate || 0);
}

function getCurrency(src) {
  return clean(src?.currency || src?.currencyCode || src?.netCurrency || "GBP") || "GBP";
}

function getRateKey(src, fallback) {
  return clean(src?.rate_key || src?.rateKey || src?.key || fallback || "");
}

function hotelIdsForRow(row) {
  return [
    clean(row.hotel_id),
    clean(row.hotelId),
    clean(row.hotel_code),
    clean(row.hotelCode),
    clean(row.code),
    clean(row.supplier_hotel_id),
    clean(row.hotelbeds_code)
  ].filter(Boolean);
}

function extractSavedRate(row, hotel) {
  const src = row.first_rate || row.rate || row;
  const amount = getAmount(src);
  if (!(amount > 0)) return null;

  return {
    amount,
    currency: getCurrency(src),
    rate_key: getRateKey(src, `RECENT-${hotel.hotel_id}`),
    source: "recent_verified_price"
  };
}

function rowMatchesHotel(row, hotel) {
  const hotelIds = [hotel.hotelbeds_code, hotel.hotel_id, hotel.id].map(clean).filter(Boolean);
  const rowIds = hotelIdsForRow(row);

  if (rowIds.some((x) => hotelIds.includes(x))) return true;

  const hotelName = key(hotel.hotel_name || hotel.name);
  const hotelCity = key(hotel.city);
  const hotelCountry = key(hotel.country);

  const rowHotelName = key(row.hotel_name || row.hotelName || row.name || row.title);
  const rowCity = key(row.city || row.city_name || row.destination || row.destination_name);
  const rowCountry = key(row.country || row.country_name || row.countryCode);

  if (rowHotelName && hotelName && rowHotelName === hotelName && rowCity === hotelCity) return true;
  if (rowHotelName && hotelName && rowHotelName.includes(hotelName) && rowCity === hotelCity && rowCountry === hotelCountry) return true;

  return false;
}

async function savedRateFromIndex(hotel) {
  const index = safeJson(RATE_INDEX, {});
  const ids = [hotel.hotelbeds_code, hotel.hotel_id, hotel.id].map(clean).filter(Boolean);

  for (const id of ids) {
    const row = index[id];

    if (row && Number(row.amount) > 0) {
      return {
        amount: Number(row.amount),
        currency: clean(row.currency || "GBP"),
        rate_key: clean(row.rate_key || `RECENT-${id}`),
        source: "recent_verified_price"
      };
    }
  }

  return null;
}

async function savedRateFromHarvestFiles(hotel) {
  let best = null;

  for (const file of RATE_FILES) {
    if (!fs.existsSync(file)) continue;

    try {
      if (file.toLowerCase().endsWith(".json")) {
        const index = safeJson(file, {});
        const ids = [hotel.hotelbeds_code, hotel.hotel_id, hotel.id].map(clean).filter(Boolean);

        for (const id of ids) {
          const row = index[id];
          if (row && Number(row.amount) > 0) {
            const candidate = {
              amount: Number(row.amount),
              currency: clean(row.currency || "GBP"),
              rate_key: clean(row.rate_key || `RECENT-${id}`),
              source: "recent_verified_price"
            };

            if (!best || candidate.amount < best.amount) best = candidate;
          }
        }

        continue;
      }

      if (file.toLowerCase().endsWith(".ndjson.gz")) {
        const stream = fs.createReadStream(file).pipe(zlib.createGunzip());
        const rl = readline.createInterface({ input: stream, crlfDelay: Infinity });

        for await (const line of rl) {
          if (!line.trim()) continue;

          try {
            const row = JSON.parse(line);
            if (!rowMatchesHotel(row, hotel)) continue;

            const candidate = extractSavedRate(row, hotel);
            if (candidate && (!best || candidate.amount < best.amount)) best = candidate;
          } catch {}
        }
      } else {
        const text = zlib.gunzipSync(fs.readFileSync(file)).toString("utf8");
        const parsed = JSON.parse(text);
        const rows = Array.isArray(parsed) ? parsed : parsed.hotels || parsed.rates || parsed.data || parsed.results || [];

        for (const row of rows) {
          if (!rowMatchesHotel(row, hotel)) continue;

          const candidate = extractSavedRate(row, hotel);
          if (candidate && (!best || candidate.amount < best.amount)) best = candidate;
        }
      }
    } catch {}
  }

  return best;
}

async function bestAvailableRate(hotel, query) {
  const fresh = await searchHotelbeds({
    hotel,
    checkin: query.checkin,
    checkout: query.checkout,
    guests: query.guests,
    rooms: query.rooms
  });

  if (fresh.ok && fresh.rate) {
    return {
      ok: true,
      live_available: true,
      hotel,
      rate_status: "fresh_live",
      customer_message: "Today’s available price is confirmed.",
      warning: "",
      rate: fresh.rate
    };
  }

  const indexed = await savedRateFromIndex(hotel);
  const harvested = indexed || (await savedRateFromHarvestFiles(hotel));

  if (harvested) {
    return {
      ok: true,
      live_available: true,
      hotel,
      rate_status: "saved_recent",
      customer_message: "A recent verified price is available for this stay.",
      warning: "Final confirmation happens before payment is completed.",
      rate: harvested,
      fresh_price_check: {
        customer_message: fresh.customer_message,
        internal_reason: fresh.internal_reason
      }
    };
  }

  return {
    ok: false,
    live_available: false,
    hotel,
    rate_status: "unavailable",
    customer_message: "This stay is not available for instant pricing right now. Please choose another stay.",
    fresh_price_check: {
      customer_message: fresh.customer_message,
      internal_reason: fresh.internal_reason
    }
  };
}

app.get("/", (req, res) => {
  res.json({ ok: true, service: "MySpace Hotel backend" });
});

app.get("/status", (req, res) => {
  const meta = safeJson(META_FILE, { total_hotels: 0 });
  const destinations = getDestinations();

  res.json({
    ok: true,
    service: "MySpace Hotel backend",
    hotels: Number(meta.total_hotels || 0),
    countries: destinations.length,
    cities: destinations.reduce((s, c) => s + (Array.isArray(c.cities) ? c.cities.length : 0), 0),
    stripe_ready: Boolean(stripe),
    hotelbeds_ready: hotelbedsReady(),
    recent_verified_prices_ready: fs.existsSync(RATE_INDEX) || RATE_FILES.some((f) => fs.existsSync(f)),
    pricing_mode: "today_price_first_recent_verified_price_second"
  });
});

app.get("/api/destinations", (req, res) => {
  const countries = getDestinations();
  res.json({ ok: true, total_countries: countries.length, countries });
});

app.get("/api/real-catalog/destinations", (req, res) => {
  const countries = getDestinations();
  res.json({ ok: true, total_countries: countries.length, countries });
});

app.get("/api/hotels/search", async (req, res) => {
  try {
    const hotels = await streamHotels({
      country: req.query.country,
      city: req.query.city,
      stay_type: req.query.stay_type || "hotel",
      limit: Math.min(Number(req.query.limit || 100), 200)
    });

    res.json({ ok: true, total: hotels.length, hotels });
  } catch {
    res.status(500).json({ ok: false, message: "Stays could not be loaded. Please try again." });
  }
});

app.get("/api/hotels/live-rate", async (req, res) => {
  try {
    const hotel = await findHotel(req.query.hotel_id);

    if (!hotel) {
      return res.json({
        ok: false,
        live_available: false,
        customer_message: "Selected stay was not found. Please choose another stay."
      });
    }

    const result = await bestAvailableRate(hotel, req.query);
    res.json(result);
  } catch {
    res.status(500).json({
      ok: false,
      live_available: false,
      customer_message: "Price could not be checked. Please try another stay."
    });
  }
});

app.get("/api/hotels/live-rate-debug", async (req, res) => {
  try {
    const hotel = await findHotel(req.query.hotel_id);
    if (!hotel) return res.json({ ok: false, reason: "hotel_not_found" });

    const result = await bestAvailableRate(hotel, req.query);

    res.json({
      ok: true,
      hotel_id: hotel.hotel_id,
      hotel_name: hotel.hotel_name,
      hotelbeds_code: hotel.hotelbeds_code,
      hotelbeds_ready: hotelbedsReady(),
      result
    });
  } catch (error) {
    res.status(500).json({ ok: false, error: error.message || "debug_failed" });
  }
});

async function createCheckoutSession(req, res) {
  try {
    if (!stripe) {
      return res.status(500).json({ ok: false, message: "Secure checkout is currently unavailable." });
    }

    const body = req.body || {};
    const amount = Number(body.amount || 0);

    if (!(amount > 0)) {
      return res.status(400).json({ ok: false, message: "A confirmed stay price is required before payment." });
    }

    if (!clean(body.rate_key)) {
      return res.status(400).json({ ok: false, message: "This price cannot be used for checkout. Please choose another stay." });
    }

    const existing = safeJson(BOOKINGS_FILE, []);

    const booking = {
      id: `MSH-${Date.now()}`,
      created_at: new Date().toISOString(),
      hotel_id: clean(body.hotel_id),
      hotel_name: clean(body.hotel_name),
      destination: clean(body.destination),
      checkin: clean(body.checkin),
      checkout: clean(body.checkout),
      guests: Number(body.guests || 1),
      rooms: Number(body.rooms || 1),
      amount,
      currency: clean(body.currency || "GBP"),
      rate_key: clean(body.rate_key),
      rate_status: clean(body.rate_status),
      customer_name: clean(body.customer_name),
      customer_email: clean(body.customer_email),
      customer_phone: clean(body.customer_phone),
      status: "PAYMENT_PENDING"
    };

    existing.push(booking);
    writeJson(BOOKINGS_FILE, existing);

    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      success_url: process.env.STRIPE_SUCCESS_URL || "https://www.myspace-hotel.com/?payment=success",
      cancel_url: process.env.STRIPE_CANCEL_URL || "https://www.myspace-hotel.com/?payment=cancelled",
      customer_email: body.customer_email || undefined,
      line_items: [
        {
          quantity: 1,
          price_data: {
            currency: String(body.currency || "GBP").toLowerCase(),
            unit_amount: Math.round(amount * 100),
            product_data: {
              name: body.hotel_name || "MySpace Hotel stay",
              description: `${body.destination || ""} | ${body.checkin || ""} to ${body.checkout || ""}`
            }
          }
        }
      ],
      metadata: {
        booking_id: booking.id,
        hotel_id: String(body.hotel_id || ""),
        rate_status: String(body.rate_status || ""),
        source: "myspace_hotel_customer_checkout"
      }
    });

    res.json({ ok: true, url: session.url, booking_id: booking.id });
  } catch {
    res.status(500).json({ ok: false, message: "Unable to open secure checkout. Please try again." });
  }
}

app.post("/api/create-checkout-session", createCheckoutSession);
app.post("/api/create-checkout", createCheckoutSession);

app.post("/api/extranet/register", (req, res) => {
  const body = req.body || {};
  const existing = safeJson(PARTNER_FILE, []);

  existing.push({
    id: `partner-${Date.now()}`,
    created_at: new Date().toISOString(),
    ...body
  });

  writeJson(PARTNER_FILE, existing);

  res.json({
    ok: true,
    message: "Thank you. Your partner application has been received.",
    business_name: body.business_name || body.hotel_name || "",
    email: body.email || ""
  });
});

app.post("/api/auth/login", (req, res) => {
  res.status(401).json({
    ok: false,
    message: "Partner access is available only after approval."
  });
});

app.listen(PORT, "0.0.0.0", () => {
  const destinations = getDestinations();
  const meta = safeJson(META_FILE, { total_hotels: 0 });

  console.log("MYSPACE HOTEL BACKEND LIVE");
  console.log("Hotels:", meta.total_hotels || 0);
  console.log("Countries:", destinations.length);
  console.log("Cities:", destinations.reduce((s, c) => s + (Array.isArray(c.cities) ? c.cities.length : 0), 0));
  console.log("Stripe ready:", Boolean(stripe));
  console.log("Hotelbeds ready:", hotelbedsReady());
  console.log("Recent verified prices ready:", fs.existsSync(RATE_INDEX) || RATE_FILES.some((f) => fs.existsSync(f)));
});