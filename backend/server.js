const express = require("express");
const cors = require("cors");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const app = express();

const PORT = Number(process.env.PORT || 5050);
const PUBLIC_FRONTEND_URL = process.env.PUBLIC_FRONTEND_URL || "http://127.0.0.1:5050";
const PUBLIC_BACKEND_URL = process.env.PUBLIC_BACKEND_URL || `http://127.0.0.1:${PORT}`;

const STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY || "";
const STRIPE_PRICE_MODE = process.env.STRIPE_PRICE_MODE || "dynamic";

let stripe = null;
if (STRIPE_SECRET_KEY) {
  try {
    stripe = require("stripe")(STRIPE_SECRET_KEY);
  } catch {
    stripe = null;
  }
}

app.use(cors({
  origin: true,
  credentials: true,
}));

app.use(express.json({ limit: "2mb" }));

const DESTINATIONS = {
  LON: {
    code: "LON",
    name: "London",
    country: "United Kingdom",
    country_code: "GB",
    currency: "GBP",
    aliases: ["london", "ldn", "lon", "london uk", "tower bridge", "heathrow", "gatwick", "mayfair", "westminster", "kensington", "canary wharf", "paddington", "victoria", "kings cross"],
  },
  PAR: {
    code: "PAR",
    name: "Paris",
    country: "France",
    country_code: "FR",
    currency: "EUR",
    aliases: ["paris", "par", "paris france", "cdg", "orly", "eiffel", "le marais", "saint germain", "louvre"],
  },
  BCN: {
    code: "BCN",
    name: "Barcelona",
    country: "Spain",
    country_code: "ES",
    currency: "EUR",
    aliases: ["barcelona", "bcn", "barcelona spain", "sagrada familia", "gothic quarter", "eixample", "barceloneta"],
  },
  DXB: {
    code: "DXB",
    name: "Dubai",
    country: "United Arab Emirates",
    country_code: "AE",
    currency: "AED",
    aliases: ["dubai", "dxb", "dubai marina", "downtown dubai", "palm jumeirah", "deira", "burj khalifa"],
  },
  AMS: {
    code: "AMS",
    name: "Amsterdam",
    country: "Netherlands",
    country_code: "NL",
    currency: "EUR",
    aliases: ["amsterdam", "ams", "netherlands", "canal ring", "jordaan", "museum quarter"],
  },
  NYC: {
    code: "NYC",
    name: "New York",
    country: "United States",
    country_code: "US",
    currency: "USD",
    aliases: ["new york", "nyc", "new york city", "manhattan", "brooklyn", "jfk", "laguardia", "newark"],
  },
  ROM: {
    code: "ROM",
    name: "Rome",
    country: "Italy",
    country_code: "IT",
    currency: "EUR",
    aliases: ["rome", "rom", "roma", "rome italy", "colosseum", "vatican"],
  },
  MAD: {
    code: "MAD",
    name: "Madrid",
    country: "Spain",
    country_code: "ES",
    currency: "EUR",
    aliases: ["madrid", "mad", "madrid spain", "gran via", "retiro", "salamanca"],
  },
  IST: {
    code: "IST",
    name: "Istanbul",
    country: "Türkiye",
    country_code: "TR",
    currency: "TRY",
    aliases: ["istanbul", "ist", "sultanahmet", "bosphorus", "taksim", "istanbul turkey"],
  },
  PRG: {
    code: "PRG",
    name: "Prague",
    country: "Czech Republic",
    country_code: "CZ",
    currency: "CZK",
    aliases: ["prague", "prg", "praha", "old town", "charles bridge"],
  },
};

const BLOCKED_IMAGE_TERMS = [
  "unsplash",
  "pexels",
  "pixabay",
  "placeholder",
  "paste_real",
  "put_the_real",
  "dummyimage",
  "fakeimg",
  "placehold",
];

const INVENTORY_FILES = [
  process.env.HOTEL_INVENTORY_FILE,
  path.join(__dirname, "hotel_inventory.json"),
  path.join(__dirname, "hotels.json"),
  path.join(__dirname, "availability_cache.json"),
  path.join(__dirname, "saved_availability.json"),
].filter(Boolean);

const reservations = new Map();

function cleanText(value) {
  return String(value || "").trim();
}

function normalizeText(value) {
  return cleanText(value)
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function safeNumber(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function moneyToNumber(value) {
  const cleaned = String(value || "").replace(/[^0-9.]/g, "");
  const number = Number(cleaned);
  return Number.isFinite(number) ? number : 0;
}

function resolveDestination(input) {
  const raw = cleanText(input || "LON");
  const upper = raw.toUpperCase();
  const normalized = normalizeText(raw);

  if (DESTINATIONS[upper]) return DESTINATIONS[upper];

  for (const destination of Object.values(DESTINATIONS)) {
    if (destination.aliases.some((alias) => normalized === alias || normalized.includes(alias))) {
      return destination;
    }
  }

  return {
    code: upper || "GLOBAL",
    name: raw || "Destination",
    country: "",
    country_code: "",
    currency: "",
    aliases: [],
  };
}

function isValidRealImage(url) {
  const value = cleanText(url);
  const lower = value.toLowerCase();

  if (!value) return false;
  if (!value.startsWith("http://") && !value.startsWith("https://")) return false;
  if (BLOCKED_IMAGE_TERMS.some((term) => lower.includes(term))) return false;

  return true;
}

function getRateAmount(rate) {
  if (!rate) return "";
  return (
    rate.display_amount ||
    rate.selling_rate ||
    rate.sellingRate ||
    rate.supplier_selling_rate ||
    rate.net ||
    rate.amount ||
    ""
  );
}

function getRateCurrency(rate, destination) {
  if (!rate) return destination.currency || "";
  return rate.display_currency || rate.currency || destination.currency || "";
}

function getPaymentAmount(rate) {
  if (!rate) return "";
  return rate.payment_amount || rate.paymentAmount || getRateAmount(rate);
}

function getPaymentCurrency(rate, destination) {
  if (!rate) return destination.currency || "";
  return rate.payment_currency || rate.paymentCurrency || getRateCurrency(rate, destination);
}

function normalizeRate(rate, destination) {
  if (!rate || typeof rate !== "object") return null;

  const displayCurrency = getRateCurrency(rate, destination);
  const paymentCurrency = getPaymentCurrency(rate, destination);
  const displayAmount = String(getRateAmount(rate) || "");
  const paymentAmount = String(getPaymentAmount(rate) || displayAmount || "");

  return {
    rate_key: rate.rate_key || rate.rateKey || "",
    currency: rate.currency || displayCurrency,
    display_currency: displayCurrency,
    display_amount: displayAmount,
    payment_currency: paymentCurrency,
    payment_amount: paymentAmount,
    currency_note:
      rate.currency_note ||
      (displayCurrency && paymentCurrency && displayCurrency !== paymentCurrency
        ? `Displayed in ${displayCurrency}. Payment may be processed in ${paymentCurrency}.`
        : displayCurrency
          ? `Displayed and expected payment currency: ${displayCurrency}.`
          : ""),
    currency_is_estimate: Boolean(rate.currency_is_estimate),
    net: String(rate.net || displayAmount || ""),
    selling_rate: String(rate.selling_rate || rate.sellingRate || displayAmount || ""),
    supplier_selling_rate: String(rate.supplier_selling_rate || rate.supplierSellingRate || displayAmount || ""),
    board_name: rate.board_name || rate.boardName || "",
    room_name: rate.room_name || rate.roomName || "",
    cancellation_policies: Array.isArray(rate.cancellation_policies)
      ? rate.cancellation_policies
      : Array.isArray(rate.cancellationPolicies)
        ? rate.cancellationPolicies
        : [],
    payment_type: rate.payment_type || rate.paymentType || "",
    packaging: String(rate.packaging || ""),
    allotment: String(rate.allotment || ""),
  };
}

function normalizeHotel(raw, index, destination) {
  const firstRate = normalizeRate(raw.first_rate || raw.rate || raw.lowest_rate || null, destination);
  const id = cleanText(raw.hotel_id || raw.id || raw.code || `hotel-${index}`);
  const imageUrl = isValidRealImage(raw.image_url || raw.image || raw.main_image)
    ? cleanText(raw.image_url || raw.image || raw.main_image)
    : "";

  return {
    id,
    hotel_id: id,
    hotel_name: cleanText(raw.hotel_name || raw.name || "Hotel"),
    name: cleanText(raw.hotel_name || raw.name || "Hotel"),
    city: cleanText(raw.city || raw.destination_code || destination.code),
    country: cleanText(raw.country || destination.country || destination.country_code || ""),
    area: cleanText(raw.area || raw.zoneName || raw.zone || raw.neighbourhood || raw.neighborhood || ""),
    address: cleanText(raw.address || raw.address_line || raw.location || raw.area || ""),
    rating: cleanText(raw.rating || raw.categoryName || raw.category || "Available"),
    image_url: imageUrl,
    image_caption: imageUrl ? cleanText(raw.image_caption || "Verified supplier property image") : "",
    image_source: imageUrl ? cleanText(raw.image_source || raw.source || "verified_supplier_image") : "",
    has_verified_image: Boolean(imageUrl && raw.has_verified_image !== false),
    latitude: cleanText(raw.latitude || raw.lat || ""),
    longitude: cleanText(raw.longitude || raw.lng || raw.lon || ""),
    first_rate: firstRate,
    source: cleanText(raw.source || "inventory"),
    price_confirmation_required: Boolean(raw.price_confirmation_required || !firstRate || !firstRate.rate_key),
    availability_message: cleanText(raw.availability_message || ""),
    raw_rank: safeNumber(raw.rank || raw.score, 0),
  };
}

function readJsonFile(filePath) {
  if (!filePath) return null;

  try {
    if (!fs.existsSync(filePath)) return null;
    const raw = fs.readFileSync(filePath, "utf8");
    if (!raw.trim()) return null;
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function extractHotelsFromJson(json) {
  if (!json) return [];

  if (Array.isArray(json)) return json;
  if (Array.isArray(json.hotels)) return json.hotels;
  if (Array.isArray(json.data)) return json.data;
  if (json.ok && Array.isArray(json.results)) return json.results;

  return [];
}

function loadInventory() {
  const allHotels = [];

  for (const filePath of INVENTORY_FILES) {
    const json = readJsonFile(filePath);
    const hotels = extractHotelsFromJson(json);
    if (hotels.length) allHotels.push(...hotels);
  }

  return allHotels;
}

function destinationMatchesHotel(hotel, destination, queryCity) {
  const haystack = normalizeText([
    hotel.city,
    hotel.country,
    hotel.area,
    hotel.address,
    hotel.hotel_name,
    hotel.name,
    hotel.source,
  ].join(" "));

  const cityQuery = normalizeText(queryCity);
  const destinationCode = normalizeText(destination.code);
  const destinationName = normalizeText(destination.name);

  if (!cityQuery && destination.code === "GLOBAL") return true;
  if (hotel.city && normalizeText(hotel.city) === destinationCode) return true;
  if (hotel.city && normalizeText(hotel.city) === destinationName) return true;
  if (haystack.includes(destinationName)) return true;
  if (haystack.includes(destinationCode)) return true;
  if (cityQuery && haystack.includes(cityQuery)) return true;

  return destination.aliases.some((alias) => haystack.includes(normalizeText(alias)));
}

function keywordMatchesHotel(hotel, keyword, area) {
  const keywordValue = normalizeText(keyword);
  const areaValue = normalizeText(area);

  if (!keywordValue && !areaValue) return true;

  const haystack = normalizeText([
    hotel.hotel_name,
    hotel.name,
    hotel.area,
    hotel.address,
    hotel.rating,
    hotel.first_rate?.room_name,
    hotel.first_rate?.board_name,
  ].join(" "));

  if (keywordValue && !haystack.includes(keywordValue)) return false;
  if (areaValue && !haystack.includes(areaValue)) return false;

  return true;
}

function calculateHotelScore(hotel, destination, keyword, area) {
  let score = 0;

  const rate = hotel.first_rate;
  const price = moneyToNumber(rate?.display_amount || rate?.selling_rate || rate?.net);
  const haystack = normalizeText([
    hotel.hotel_name,
    hotel.name,
    hotel.area,
    hotel.address,
    hotel.rating,
    rate?.room_name,
    rate?.board_name,
  ].join(" "));

  if (rate && rate.rate_key) score += 260;
  if (hotel.has_verified_image && hotel.image_url) score += 220;
  if (!hotel.price_confirmation_required) score += 160;
  if (hotel.latitude && hotel.longitude) score += 55;
  if (rate?.cancellation_policies?.length) score += 45;
  if (rate?.allotment && Number(rate.allotment) > 1) score += Math.min(Number(rate.allotment), 100);
  if (String(hotel.rating).includes("5")) score += 80;
  if (String(hotel.rating).includes("4")) score += 55;
  if (String(hotel.rating).includes("3")) score += 25;
  if (rate?.board_name && normalizeText(rate.board_name).includes("breakfast")) score += 25;

  if (price > 0) {
    if (price <= 80) score += 80;
    else if (price <= 150) score += 70;
    else if (price <= 250) score += 55;
    else if (price <= 400) score += 35;
    else score += 15;
  }

  const destinationName = normalizeText(destination.name);
  if (destinationName && haystack.includes(destinationName)) score += 45;

  const areaValue = normalizeText(area);
  if (areaValue && haystack.includes(areaValue)) score += 120;

  const keywordValue = normalizeText(keyword);
  if (keywordValue && haystack.includes(keywordValue)) score += 100;

  if (hotel.raw_rank) score += hotel.raw_rank;

  return score;
}

function productionRankHotels(hotels, destination, keyword, area) {
  return hotels
    .map((hotel, index) => ({
      hotel,
      index,
      score: calculateHotelScore(hotel, destination, keyword, area),
    }))
    .sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      return a.index - b.index;
    })
    .map((entry) => ({
      ...entry.hotel,
      production_score: Math.round(entry.score),
    }));
}

function paginate(items, page, limit) {
  const safePage = Math.max(1, Number(page) || 1);
  const safeLimit = Math.min(100, Math.max(1, Number(limit) || 50));
  const start = (safePage - 1) * safeLimit;
  return {
    page: safePage,
    limit: safeLimit,
    total: items.length,
    total_pages: Math.max(1, Math.ceil(items.length / safeLimit)),
    items: items.slice(start, start + safeLimit),
  };
}

function makeReservationCode() {
  return `MSH-${Date.now().toString(36).toUpperCase()}-${crypto.randomBytes(3).toString("hex").toUpperCase()}`;
}

function publicReservation(reservation) {
  return {
    reservation_code: reservation.reservation_code,
    hotel_id: reservation.hotel_id,
    hotel_name: reservation.hotel_name,
    destination: reservation.destination,
    checkin: reservation.checkin,
    checkout: reservation.checkout,
    guests: reservation.guests,
    rooms: reservation.rooms,
    customer_name: reservation.customer_name,
    customer_email: reservation.customer_email,
    amount: reservation.amount,
    currency: reservation.currency,
    display_amount: reservation.display_amount,
    display_currency: reservation.display_currency,
    status: reservation.status,
    paid: reservation.paid,
    created_at: reservation.created_at,
  };
}

app.get("/", (req, res) => {
  res.json({
    ok: true,
    service: "MySpace Hotel backend",
    port: PORT,
    search_endpoint: "/api/hotels/search",
    frontend_port: 5050,
  });
});

app.get("/health", (req, res) => {
  res.json({
    ok: true,
    service: "hotel-backend",
    port: PORT,
    stripe_enabled: Boolean(stripe),
    inventory_files_checked: INVENTORY_FILES.map((file) => ({
      file,
      exists: fs.existsSync(file),
    })),
  });
});

app.get("/api/destinations", (req, res) => {
  res.json({
    ok: true,
    destinations: Object.values(DESTINATIONS),
  });
});

app.get("/api/hotels/search", async (req, res) => {
  try {
    const country = cleanText(req.query.country || "");
    const city = cleanText(req.query.city || req.query.destination || req.query.destination_code || "LON");
    const destinationCode = cleanText(req.query.destination_code || city);
    const area = cleanText(req.query.area || "");
    const keyword = cleanText(req.query.keyword || "");
    const checkin = cleanText(req.query.checkin || "");
    const checkout = cleanText(req.query.checkout || "");
    const guests = Math.max(1, Number(req.query.guests || 2));
    const rooms = Math.max(1, Number(req.query.rooms || 1));
    const page = Math.max(1, Number(req.query.page || 1));
    const limit = Math.min(100, Math.max(1, Number(req.query.limit || 50)));

    const destination = resolveDestination(destinationCode || city);
    const inventory = loadInventory();

    const normalized = inventory.map((hotel, index) => normalizeHotel(hotel, index, destination));

    const matched = normalized.filter((hotel) => {
      if (!destinationMatchesHotel(hotel, destination, city)) return false;
      if (!keywordMatchesHotel(hotel, keyword, area)) return false;
      return true;
    });

    const ranked = productionRankHotels(matched, destination, keyword, area);
    const paged = paginate(ranked, page, limit);

    res.json({
      ok: true,
      hotels: paged.items,
      count: ranked.length,
      returned: paged.items.length,
      page: paged.page,
      limit: paged.limit,
      total_pages: paged.total_pages,
      destination_code: destination.code,
      destination_name: destination.name,
      destination_country: destination.country,
      local_currency: destination.currency,
      country,
      checkin,
      checkout,
      guests,
      rooms,
      source: inventory.length ? "local_real_inventory_ranked" : "empty_inventory_no_fake_hotels",
      availability_message: inventory.length
        ? "Live or saved supplier inventory is ranked by availability, verified image, location relevance, price clarity, and booking confidence."
        : "No local supplier inventory file was found. Add real supplier inventory to hotel_inventory.json, hotels.json, availability_cache.json, or saved_availability.json. No fake hotels or placeholder images are returned.",
    });
  } catch (error) {
    res.status(500).json({
      ok: false,
      message: "Hotel search failed.",
      detail: error.message,
    });
  }
});

app.post("/api/hotels/search", async (req, res) => {
  req.query = {
    ...req.query,
    ...req.body,
  };

  return app._router.handle(req, res);
});

app.post("/reservation-request", async (req, res) => {
  try {
    const body = req.body || {};

    const hotelName = cleanText(body.hotel_name);
    const customerName = cleanText(body.customer_name);
    const customerEmail = cleanText(body.customer_email);
    const rateKey = cleanText(body.rate_key);
    const amount = moneyToNumber(body.amount || body.display_amount);
    const currency = cleanText(body.currency || body.display_currency || "GBP").toLowerCase();

    if (!hotelName) {
      return res.status(400).json({ ok: false, message: "Hotel name is required." });
    }

    if (!customerName || !customerEmail) {
      return res.status(400).json({ ok: false, message: "Customer name and email are required." });
    }

    if (!rateKey) {
      return res.status(400).json({ ok: false, message: "A valid supplier rate key is required before payment." });
    }

    if (!amount || amount <= 0) {
      return res.status(400).json({ ok: false, message: "A valid payment amount is required." });
    }

    const reservationCode = makeReservationCode();

    const reservation = {
      reservation_code: reservationCode,
      hotel_id: cleanText(body.hotel_id),
      hotel_name: hotelName,
      destination: cleanText(body.destination),
      destination_code: cleanText(body.destination_code),
      checkin: cleanText(body.checkin),
      checkout: cleanText(body.checkout),
      guests: Math.max(1, Number(body.guests || 1)),
      rooms: Math.max(1, Number(body.rooms || 1)),
      customer_name: customerName,
      customer_email: customerEmail,
      customer_phone: cleanText(body.customer_phone),
      note: cleanText(body.note),
      rate_key: rateKey,
      amount: String(body.amount || body.display_amount || ""),
      currency: cleanText(body.currency || body.display_currency || "GBP").toUpperCase(),
      display_amount: String(body.display_amount || body.amount || ""),
      display_currency: cleanText(body.display_currency || body.currency || "GBP").toUpperCase(),
      room_name: cleanText(body.room_name),
      board_name: cleanText(body.board_name),
      payment_type: cleanText(body.payment_type),
      cancellation_policies: Array.isArray(body.cancellation_policies) ? body.cancellation_policies : [],
      packaging: cleanText(body.packaging),
      allotment: cleanText(body.allotment),
      status: "pending_payment",
      paid: false,
      created_at: new Date().toISOString(),
    };

    reservations.set(reservationCode, reservation);

    if (!stripe) {
      return res.json({
        ok: true,
        reservation_code: reservationCode,
        payment_url: `${PUBLIC_FRONTEND_URL}/reservation-confirmed?code=${encodeURIComponent(reservationCode)}`,
        message: "Reservation recorded. Stripe is not configured, so payment is bypassed for local testing.",
      });
    }

    const amountMinor = Math.round(amount * 100);

    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      success_url: `${PUBLIC_FRONTEND_URL}/reservation-confirmed?code=${encodeURIComponent(reservationCode)}`,
      cancel_url: `${PUBLIC_FRONTEND_URL}/`,
      customer_email: customerEmail,
      metadata: {
        reservation_code: reservationCode,
        hotel_id: reservation.hotel_id,
        hotel_name: reservation.hotel_name.slice(0, 250),
      },
      line_items: [
        {
          quantity: 1,
          price_data: {
            currency,
            unit_amount: amountMinor,
            product_data: {
              name: hotelName.slice(0, 250),
              description: `${reservation.checkin} to ${reservation.checkout} · ${reservation.room_name || "Selected room"}`.slice(0, 250),
            },
          },
        },
      ],
    });

    reservation.stripe_session_id = session.id;
    reservations.set(reservationCode, reservation);

    return res.json({
      ok: true,
      reservation_code: reservationCode,
      payment_url: session.url,
    });
  } catch (error) {
    return res.status(500).json({
      ok: false,
      message: "Could not prepare secure booking.",
      detail: error.message,
    });
  }
});

app.post("/reservation/:code/mark-paid", (req, res) => {
  const code = cleanText(req.params.code);
  const reservation = reservations.get(code);

  if (!reservation) {
    return res.json({
      ok: true,
      reservation_code: code,
      message: "Payment received. Reservation record will be reconciled by booking support.",
    });
  }

  reservation.status = "paid_pending_supplier_confirmation";
  reservation.paid = true;
  reservation.paid_at = new Date().toISOString();
  reservations.set(code, reservation);

  return res.json({
    ok: true,
    reservation: publicReservation(reservation),
  });
});

app.get("/reservation/:code", (req, res) => {
  const code = cleanText(req.params.code);
  const reservation = reservations.get(code);

  if (!reservation) {
    return res.status(404).json({
      ok: false,
      message: "Reservation not found.",
    });
  }

  return res.json({
    ok: true,
    reservation: publicReservation(reservation),
  });
});

app.get("/api/reservations/:code", (req, res) => {
  const code = cleanText(req.params.code);
  const reservation = reservations.get(code);

  if (!reservation) {
    return res.status(404).json({
      ok: false,
      message: "Reservation not found.",
    });
  }

  return res.json({
    ok: true,
    reservation: publicReservation(reservation),
  });
});

app.use((req, res) => {
  res.status(404).json({
    ok: false,
    message: "Endpoint not found.",
    path: req.path,
  });
});

app.listen(PORT, "0.0.0.0", () => {
  console.log(`MySpace Hotel backend running on port ${PORT}`);
  console.log(`Search endpoint: http://127.0.0.1:${PORT}/api/hotels/search`);
});