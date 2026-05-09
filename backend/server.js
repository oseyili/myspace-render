require("dotenv").config();

const express = require("express");
const cors = require("cors");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const nodemailer = require("nodemailer");

const app = express();
const PORT = Number(process.env.PORT || 5050);
const PUBLIC_FRONTEND_URL = process.env.PUBLIC_FRONTEND_URL || process.env.PUBLIC_APP_URL || process.env.FRONTEND_URL || "http://localhost:5173";
const STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY || "";

const SMTP_HOST = process.env.SMTP_HOST || "";
const SMTP_PORT = Number(process.env.SMTP_PORT || 587);
const SMTP_USER = process.env.SMTP_USER || process.env.SMTP_USERNAME || "";
const SMTP_PASS = process.env.SMTP_PASS || process.env.SMTP_PASSWORD || "";
const SMTP_FROM = process.env.SMTP_FROM || process.env.RESEND_FROM || process.env.RESERVATIONS_EMAIL || "reservations@myspace-hotel.com";

let stripe = null;
if (STRIPE_SECRET_KEY) {
  try {
    stripe = require("stripe")(STRIPE_SECRET_KEY);
  } catch {
    stripe = null;
  }
}

let transporter = null;
if (SMTP_HOST && SMTP_USER && SMTP_PASS) {
  try {
    transporter = nodemailer.createTransport({
      host: SMTP_HOST,
      port: SMTP_PORT,
      secure: SMTP_PORT === 465,
      auth: { user: SMTP_USER, pass: SMTP_PASS },
    });
  } catch {
    transporter = null;
  }
}

app.use(cors({ origin: true, credentials: true }));
app.use(express.json({ limit: "10mb" }));

const reservations = new Map();

const FILES = [
  "hotel_live_rates_seed.json",
  "hotel_live_rates_london_seed.json",
  "hotel_images_live_backup.json",
  "hotel_supplier_feed.json",
];

const DESTINATION_FALLBACK = {
  LON: { country: "United Kingdom", city: "London", currency: "GBP" },
  PAR: { country: "France", city: "Paris", currency: "EUR" },
  BCN: { country: "Spain", city: "Barcelona", currency: "EUR" },
  MAD: { country: "Spain", city: "Madrid", currency: "EUR" },
  DXB: { country: "United Arab Emirates", city: "Dubai", currency: "AED" },
  NYC: { country: "United States", city: "New York", currency: "USD" },
  LOS: { country: "Nigeria", city: "Lagos", currency: "NGN" },
  ABV: { country: "Nigeria", city: "Abuja", currency: "NGN" },
};

function clean(v) {
  return String(v ?? "").trim();
}

function norm(v) {
  return clean(v).toLowerCase().replace(/[^a-z0-9\s-]/g, " ").replace(/\s+/g, " ").trim();
}

function num(v) {
  const n = Number(String(v ?? "").replace(/[^0-9.]/g, ""));
  return Number.isFinite(n) ? n : 0;
}

function pick(obj, keys) {
  for (const k of keys) {
    if (obj && obj[k] !== undefined && obj[k] !== null && clean(obj[k]) !== "") return obj[k];
  }
  return "";
}

function makeCode() {
  return `MSH-${Date.now().toString(36).toUpperCase()}-${crypto.randomBytes(3).toString("hex").toUpperCase()}`;
}

function readJson(filename) {
  const file = path.join(__dirname, "data", filename);
  if (!fs.existsSync(file)) {
    console.log(`Missing file: ${filename}`);
    return null;
  }

  try {
    const raw = fs.readFileSync(file, "utf8");
    console.log(`Reading ${filename}: ${raw.length} bytes`);
    return JSON.parse(raw);
  } catch (err) {
    console.log(`Failed reading ${filename}: ${err.message}`);
    return null;
  }
}

function extractArray(json) {
  if (!json) return [];
  if (Array.isArray(json)) return json;
  if (Array.isArray(json.hotels)) return json.hotels;
  if (Array.isArray(json.data)) return json.data;
  if (Array.isArray(json.results)) return json.results;
  if (Array.isArray(json.items)) return json.items;
  if (Array.isArray(json.rates)) return json.rates;
  if (Array.isArray(json.destinations)) return json.destinations;
  if (Array.isArray(json.countries)) return json.countries;
  if (Array.isArray(json.cities)) return json.cities;
  if (json.data && Array.isArray(json.data.hotels)) return json.data.hotels;
  if (json.data && Array.isArray(json.data.results)) return json.data.results;
  if (json.catalog && Array.isArray(json.catalog.hotels)) return json.catalog.hotels;
  if (json.catalog && Array.isArray(json.catalog.destinations)) return json.catalog.destinations;
  if (json.catalog && Array.isArray(json.catalog.countries)) return json.catalog.countries;

  for (const value of Object.values(json)) {
    if (Array.isArray(value)) return value;
  }

  return [];
}

function loadArray(filename) {
  const arr = extractArray(readJson(filename));
  console.log(`${filename}: ${arr.length} top records`);
  return arr;
}

function firstRate(raw) {
  const rates = [];

  if (Array.isArray(raw.rates)) rates.push(...raw.rates);
  if (Array.isArray(raw.ratePlans)) rates.push(...raw.ratePlans);
  if (Array.isArray(raw.rate_plans)) rates.push(...raw.rate_plans);
  if (raw.rate) rates.push(raw.rate);
  if (raw.first_rate) rates.push(raw.first_rate);

  if (Array.isArray(raw.rooms)) {
    for (const room of raw.rooms) {
      if (Array.isArray(room.rates)) {
        for (const r of room.rates) {
          rates.push({
            ...r,
            room_name: pick(room, ["name", "roomName", "room_name"]) || pick(r, ["room_name", "roomName"]),
          });
        }
      }
    }
  }

  return rates[0] || raw;
}

function addDestination(map, country, city, destinationCode = "", currency = "") {
  country = clean(country);
  city = clean(city);
  destinationCode = clean(destinationCode).toUpperCase();

  if (!country || !city) return;
  if (country.length < 2 || city.length < 2) return;
  if (/^\d+$/.test(country) || /^\d+$/.test(city)) return;

  if (!map.has(country)) map.set(country, new Map());

  const cities = map.get(country);

  if (!cities.has(city)) {
    cities.set(city, {
      city,
      destination_code: destinationCode || city.toUpperCase(),
      currency: clean(currency).toUpperCase(),
      live_hotels: 0,
      image_hotels: 0,
    });
  }
}

function scanDestinationsDeep(node, map, parentCountry = "") {
  if (!node || typeof node !== "object") return;

  if (Array.isArray(node)) {
    for (const item of node) scanDestinationsDeep(item, map, parentCountry);
    return;
  }

  const destinationCode = clean(
    pick(node, ["destination_code", "destinationCode", "city_code", "cityCode", "code", "iata", "destination"])
  ).toUpperCase();

  const fallback = DESTINATION_FALLBACK[destinationCode] || {};

  const country = clean(
    pick(node, [
      "country",
      "countryName",
      "country_name",
      "destination_country",
      "destinationCountry",
      "country_name_en",
    ]) || parentCountry || fallback.country
  );

  const city = clean(
    pick(node, [
      "city",
      "cityName",
      "city_name",
      "destination_city",
      "destinationCity",
      "destinationName",
      "destination_name",
      "name",
      "city_name_en",
    ]) || fallback.city
  );

  if (country && city && norm(country) !== norm(city)) {
    addDestination(map, country, city, destinationCode, pick(node, ["currency", "currencyCode"]) || fallback.currency || "");
  }

  const nestedCountry = country || parentCountry;

  for (const [key, value] of Object.entries(node)) {
    if (!value || typeof value !== "object") continue;

    if (
      key.toLowerCase().includes("cities") ||
      key.toLowerCase().includes("destinations") ||
      key.toLowerCase().includes("children") ||
      key.toLowerCase().includes("items") ||
      key.toLowerCase().includes("data") ||
      key.toLowerCase().includes("results")
    ) {
      scanDestinationsDeep(value, map, nestedCountry);
    }
  }
}

let HOTEL_CACHE = null;
let CATALOG_CACHE = null;

function buildHotels() {
  if (HOTEL_CACHE) return HOTEL_CACHE;

  const rateRecords = [
    ...loadArray("hotel_live_rates_seed.json"),
    ...loadArray("hotel_live_rates_london_seed.json"),
  ];

  const imageRecords = loadArray("hotel_images_live_backup.json");
  const imageMap = new Map();
  const imageNameMap = new Map();

  for (const img of imageRecords) {
    const id = clean(pick(img, ["hotel_code", "hotelCode", "hotel_id", "hotelId", "code", "id"]));
    const name = clean(pick(img, ["hotel_name", "hotelName", "name"]));
    const url = clean(pick(img, ["image_url", "imageUrl", "url", "image", "src", "main_image", "mainImage", "thumbnail"]));

    if (id && url.startsWith("http")) imageMap.set(id, url);
    if (name && url.startsWith("http")) imageNameMap.set(norm(name), url);
  }

  const hotels = [];

  for (let i = 0; i < rateRecords.length; i++) {
    const raw = rateRecords[i];
    const rate = firstRate(raw);

    const hotelId =
      clean(
        pick(raw, [
          "hotel_code",
          "hotelCode",
          "hotel_id",
          "hotelId",
          "code",
          "id",
          "hotel",
          "hotelCodeSupplier",
        ])
      ) || `hotel-${i + 1}`;

    const destinationCode = clean(
      pick(raw, ["destination_code", "destinationCode", "city_code", "cityCode", "destination", "destinationCodeSupplier"])
    ).toUpperCase();

    const fallback = DESTINATION_FALLBACK[destinationCode] || {};

    const country = clean(
      pick(raw, ["country", "countryName", "country_name", "destination_country", "destinationCountry"]) ||
        fallback.country ||
        "Selected destination"
    );

    const city = clean(
      pick(raw, ["city", "cityName", "city_name", "destination_city", "destinationCity", "destinationName", "destination_name"]) ||
        fallback.city ||
        destinationCode ||
        "Selected city"
    );

    const hotelName =
      clean(pick(raw, ["hotel_name", "hotelName", "name", "hotel", "property_name", "propertyName"])) || `Hotel ${i + 1}`;

    const amount = num(
      pick(rate, ["selling_rate", "sellingRate", "net", "amount", "price", "total", "totalAmount"]) ||
        pick(raw, ["selling_rate", "sellingRate", "net", "amount", "price", "total", "totalAmount"])
    );

    const currency = clean(
      pick(rate, ["currency", "payment_currency", "paymentCurrency"]) ||
        pick(raw, ["currency", "payment_currency", "paymentCurrency"]) ||
        fallback.currency ||
        "GBP"
    ).toUpperCase();

    const rateKey =
      clean(pick(rate, ["rate_key", "rateKey", "key", "id"]) || pick(raw, ["rate_key", "rateKey", "key"])) ||
      `LOCAL-${hotelId}-${i}`;

    const imageUrl = clean(
      pick(raw, ["image_url", "imageUrl", "image", "main_image", "mainImage", "thumbnail"]) ||
        imageMap.get(hotelId) ||
        imageNameMap.get(norm(hotelName)) ||
        ""
    );

    hotels.push({
      id: hotelId,
      hotel_id: hotelId,
      hotel_code: hotelId,
      hotel_name: hotelName,
      country,
      city,
      destination_code: destinationCode || city.toUpperCase(),
      area: clean(pick(raw, ["zoneName", "zone_name", "area", "neighbourhood", "neighborhood", "district"])),
      address: clean(pick(raw, ["address", "addressLine", "full_address", "fullAddress"])),
      rating: clean(pick(raw, ["categoryName", "category", "stars", "rating"])) || "Available",
      latitude: clean(pick(raw, ["latitude", "lat"])),
      longitude: clean(pick(raw, ["longitude", "lng", "lon"])),
      image_url: imageUrl.startsWith("http") ? imageUrl : "",
      has_verified_image: imageUrl.startsWith("http"),
      live_rate_ready: amount > 0 && Boolean(currency) && Boolean(rateKey),
      first_rate: {
        rate_key: rateKey,
        amount,
        selling_rate: amount,
        currency,
        room_name: clean(pick(rate, ["room_name", "roomName", "room", "name"])) || "Selected room",
        board_name: clean(pick(rate, ["board_name", "boardName", "board", "mealPlan"])) || "Room only",
        payment_type: clean(pick(rate, ["payment_type", "paymentType"])) || "Stripe secure payment",
        cancellation_policies: Array.isArray(rate.cancellation_policies)
          ? rate.cancellation_policies
          : Array.isArray(rate.cancellationPolicies)
            ? rate.cancellationPolicies
            : [],
      },
    });
  }

  HOTEL_CACHE = hotels;

  console.log(`Loaded hotels: ${HOTEL_CACHE.length}`);
  console.log(`Live-rate hotels: ${HOTEL_CACHE.filter((h) => h.live_rate_ready).length}`);
  console.log(`Image hotels: ${HOTEL_CACHE.filter((h) => h.has_verified_image).length}`);

  return HOTEL_CACHE;
}

function buildDestinations() {
  if (CATALOG_CACHE) return CATALOG_CACHE;

  const map = new Map();

  for (const file of FILES) {
    const json = readJson(file);
    scanDestinationsDeep(json, map);
  }

  for (const h of buildHotels()) {
    addDestination(map, h.country, h.city, h.destination_code, h.first_rate.currency);

    const c = map.get(h.country)?.get(h.city);
    if (c) {
      if (h.live_rate_ready) c.live_hotels += 1;
      if (h.has_verified_image) c.image_hotels += 1;
      if (!c.currency && h.first_rate.currency) c.currency = h.first_rate.currency;
    }
  }

  CATALOG_CACHE = [...map.entries()]
    .map(([country, cityMap]) => ({
      country,
      city_count: cityMap.size,
      cities: [...cityMap.values()].sort((a, b) => a.city.localeCompare(b.city)),
    }))
    .filter((x) => x.city_count > 0)
    .sort((a, b) => a.country.localeCompare(b.country));

  console.log(`Catalogue countries: ${CATALOG_CACHE.length}`);
  console.log(`Catalogue cities: ${CATALOG_CACHE.reduce((s, x) => s + x.city_count, 0)}`);

  return CATALOG_CACHE;
}

function matchesHotel(h, country, city, area, keyword) {
  if (country && norm(h.country) !== norm(country)) return false;
  if (city && norm(h.city) !== norm(city) && norm(h.destination_code) !== norm(city)) return false;

  const text = norm([h.hotel_name, h.country, h.city, h.destination_code, h.area, h.address, h.rating].join(" "));

  if (area && !text.includes(norm(area))) return false;
  if (keyword && !text.includes(norm(keyword))) return false;

  return true;
}

async function sendReservationEmail(body, reservationCode, paymentUrl) {
  if (!transporter || !clean(body.customer_email)) return false;

  try {
    await transporter.sendMail({
      from: SMTP_FROM,
      to: clean(body.customer_email),
      subject: `MySpace Hotel reservation ${reservationCode}`,
      html: `
        <h2>Reservation received</h2>
        <p><b>Reservation code:</b> ${reservationCode}</p>
        <p><b>Hotel:</b> ${clean(body.hotel_name)}</p>
        <p><b>Destination:</b> ${clean(body.destination)}</p>
        <p><b>Dates:</b> ${clean(body.checkin)} to ${clean(body.checkout)}</p>
        <p><b>Guests:</b> ${clean(body.guests)}</p>
        <p><b>Rooms:</b> ${clean(body.rooms)}</p>
        <p><b>Amount:</b> ${clean(body.currency)} ${clean(body.amount)}</p>
        ${
          paymentUrl
            ? `<p><a href="${paymentUrl}">Continue secure payment</a></p>`
            : `<p>Your reservation was received. Payment link is not available until Stripe is configured.</p>`
        }
      `,
    });

    return true;
  } catch (err) {
    console.log(`Email failed: ${err.message}`);
    return false;
  }
}

app.get("/", (req, res) => {
  const countries = buildDestinations();
  const builtHotels = buildHotels();

  res.json({
    ok: true,
    service: "MySpace Hotel reservation service",
    hotels: builtHotels.length,
    live_hotels: builtHotels.filter((h) => h.live_rate_ready).length,
    image_hotels: builtHotels.filter((h) => h.has_verified_image).length,
    countries: countries.length,
    cities: countries.reduce((s, x) => s + x.city_count, 0),
    stripe: Boolean(stripe),
    smtp: Boolean(transporter),
  });
});

app.get("/health", (req, res) => {
  const countries = buildDestinations();
  const builtHotels = buildHotels();

  res.json({
    ok: true,
    hotels: builtHotels.length,
    live_hotels: builtHotels.filter((h) => h.live_rate_ready).length,
    image_hotels: builtHotels.filter((h) => h.has_verified_image).length,
    countries: countries.length,
    cities: countries.reduce((s, x) => s + x.city_count, 0),
    stripe: Boolean(stripe),
    smtp: Boolean(transporter),
  });
});

app.get("/api/real-catalog/destinations", (req, res) => {
  const countries = buildDestinations();

  res.json({
    ok: true,
    countries,
    total_countries: countries.length,
    total_cities: countries.reduce((s, x) => s + x.city_count, 0),
  });
});

app.get("/api/hotels/search", (req, res) => {
  const country = clean(req.query.country);
  const city = clean(req.query.city || req.query.destination_code);
  const area = clean(req.query.area);
  const keyword = clean(req.query.keyword);
  const limit = Math.min(250, Math.max(1, Number(req.query.limit || 120)));

  const hotels = buildHotels()
    .filter((h) => matchesHotel(h, country, city, area, keyword))
    .filter((h) => h.live_rate_ready)
    .slice(0, limit);

  res.json({ ok: true, count: hotels.length, hotels, country, city });
});

app.get("/image-proxy", (req, res) => {
  const url = clean(req.query.url);
  if (!url.startsWith("http://") && !url.startsWith("https://")) return res.status(400).send("Invalid image URL");
  res.redirect(url);
});


app.get("/api/currency/convert", (req, res) => {
  const amount = num(req.query.amount);
  const from = clean(req.query.from || "GBP").toUpperCase();
  const to = clean(req.query.to || "USD").toUpperCase();

  const ratesToGBP = {
    GBP: 1,
    USD: 0.79,
    EUR: 0.86,
    NGN: 0.00062,
    AED: 0.215,
    CAD: 0.58,
    AUD: 0.52,
    ZAR: 0.043,
    CHF: 0.94,
    JPY: 0.0053
  };

  if (!amount || !ratesToGBP[from] || !ratesToGBP[to]) {
    return res.json({ ok: false, message: "Conversion unavailable." });
  }

  const gbp = amount * ratesToGBP[from];
  const converted = gbp / ratesToGBP[to];

  res.json({
    ok: true,
    amount,
    from,
    to,
    converted: Number(converted.toFixed(2))
  });
});
app.post("/reservation-request", async (req, res) => {
  try {
    const body = req.body || {};
    const reservation_code = makeCode();
    const payAmount = num(body.amount);
    const currency = clean(body.currency).toLowerCase();

    reservations.set(reservation_code, {
      reservation_code,
      ...body,
      amount: payAmount,
      currency: currency.toUpperCase(),
      status: payAmount > 0 ? "ready_for_secure_payment" : "rate_confirmation_required",
      created_at: new Date().toISOString(),
    });

    let paymentUrl = "";

    if (stripe && payAmount > 0 && currency) {
      const session = await stripe.checkout.sessions.create({
        mode: "payment",
        success_url: `${PUBLIC_FRONTEND_URL}/reservation-confirmed?code=${encodeURIComponent(reservation_code)}`,
        cancel_url: `${PUBLIC_FRONTEND_URL}/?reservation=${encodeURIComponent(reservation_code)}&status=cancelled`,
        customer_email: clean(body.customer_email) || undefined,
        metadata: { reservation_code, hotel_id: clean(body.hotel_id) },
        line_items: [
          {
            quantity: 1,
            price_data: {
              currency,
              unit_amount: Math.round(payAmount * 100),
              product_data: {
                name: clean(body.hotel_name).slice(0, 250) || "Hotel reservation",
                description: `${clean(body.checkin)} to ${clean(body.checkout)}`.slice(0, 250),
              },
            },
          },
        ],
      });

      paymentUrl = session.url || "";
    }

    const email_sent = await sendReservationEmail(body, reservation_code, paymentUrl);

    if (paymentUrl) {
      return res.json({ ok: true, reservation_code, payment_url: paymentUrl, email_sent });
    }

    res.json({
      ok: true,
      reservation_code,
      email_sent,
      message: "Reservation received. Stripe checkout needs STRIPE_SECRET_KEY to open live payment.",
    });
  } catch (err) {
    console.log(`Reservation failed: ${err.message}`);
    res.status(500).json({ ok: false, message: "Reservation request could not be completed." });
  }
});

app.post("/reservation/:code/mark-paid", (req, res) => {
  const code = clean(req.params.code);
  const existing = reservations.get(code);

  if (existing) {
    existing.status = "paid";
    existing.paid_at = new Date().toISOString();
    reservations.set(code, existing);
  }

  res.json({ ok: true, reservation_code: code });
});

app.listen(PORT, "0.0.0.0", () => {
  const countries = buildDestinations();
  const builtHotels = buildHotels();

  console.log(`MySpace Hotel backend running on http://127.0.0.1:${PORT}`);
  console.log(`Hotels: ${builtHotels.length}`);
  console.log(`Live-rate hotels: ${builtHotels.filter((h) => h.live_rate_ready).length}`);
  console.log(`Image hotels: ${builtHotels.filter((h) => h.has_verified_image).length}`);
  console.log(`Countries: ${countries.length}`);
  console.log(`Cities: ${countries.reduce((s, x) => s + x.city_count, 0)}`);
  console.log(`Stripe enabled: ${Boolean(stripe)}`);
  console.log(`SMTP enabled: ${Boolean(transporter)}`);
});

