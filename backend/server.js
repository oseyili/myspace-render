const express = require("express");
const cors = require("cors");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const { Pool } = require("pg");

const app = express();

const ALLOWED_ORIGINS = [
  "http://localhost:3000",
  "http://127.0.0.1:3000",
  "http://localhost:5173",
  "http://127.0.0.1:5173",
  "https://myspace-hotel.com",
  "https://www.myspace-hotel.com",
  "https://myspace-hotel.vercel.app",
  "https://hotel-frontend-vlwa.onrender.com",
];

app.use(
  cors({
    origin(origin, callback) {
      if (!origin) {
        return callback(null, true);
      }

      if (ALLOWED_ORIGINS.includes(origin)) {
        return callback(null, true);
      }

      return callback(new Error(`CORS blocked for origin: ${origin}`));
    },
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"],
    credentials: false,
  })
);

app.options("*", cors());
app.use(express.json());

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_URL ? { rejectUnauthorized: false } : false,
});

const CITY_COUNTRY_MAP = {
  london: "United Kingdom",
  manchester: "United Kingdom",
  paris: "France",
  lyon: "France",
  "new york": "United States",
  "los angeles": "United States",
  dubai: "United Arab Emirates",
  "abu dhabi": "United Arab Emirates",
  lagos: "Nigeria",
  abuja: "Nigeria",
  rome: "Italy",
  milan: "Italy",
  madrid: "Spain",
  barcelona: "Spain",
};

const CITY_COORDS = {
  london: { lat: 51.5074, lng: -0.1278 },
  manchester: { lat: 53.4808, lng: -2.2426 },
  paris: { lat: 48.8566, lng: 2.3522 },
  lyon: { lat: 45.764, lng: 4.8357 },
  "new york": { lat: 40.7128, lng: -74.006 },
  "los angeles": { lat: 34.0522, lng: -118.2437 },
  dubai: { lat: 25.2048, lng: 55.2708 },
  "abu dhabi": { lat: 24.4539, lng: 54.3773 },
  lagos: { lat: 6.5244, lng: 3.3792 },
  abuja: { lat: 9.0765, lng: 7.3986 },
  rome: { lat: 41.9028, lng: 12.4964 },
  milan: { lat: 45.4642, lng: 9.19 },
  madrid: { lat: 40.4168, lng: -3.7038 },
  barcelona: { lat: 41.3851, lng: 2.1734 },
};

const FALLBACK_IMAGES = [
  "https://images.unsplash.com/photo-1566073771259-6a8506099945?auto=format&fit=crop&w=1600&q=80",
  "https://images.unsplash.com/photo-1551882547-ff40c63fe5fa?auto=format&fit=crop&w=1600&q=80",
  "https://images.unsplash.com/photo-1501117716987-c8e1ecb210ea?auto=format&fit=crop&w=1600&q=80",
  "https://images.unsplash.com/photo-1522798514-97ceb8c4f1c8?auto=format&fit=crop&w=1600&q=80",
  "https://images.unsplash.com/photo-1445019980597-93fa8acb246c?auto=format&fit=crop&w=1600&q=80",
  "https://images.unsplash.com/photo-1455587734955-081b22074882?auto=format&fit=crop&w=1600&q=80",
];

const HOTEL_PREFIXES = [
  "Grand",
  "Royal",
  "Central",
  "Premier",
  "Elite",
  "Signature",
  "Imperial",
  "Harbour",
  "Skyline",
  "Regency",
  "Majestic",
  "Urban",
  "City",
  "Boutique",
  "Crown",
  "Plaza",
  "Heritage",
  "Garden",
  "Riverside",
  "Landmark",
];

const HOTEL_SUFFIXES = [
  "Hotel",
  "Suites",
  "Residence",
  "Inn",
  "Resort",
  "Plaza",
  "Palace",
  "Lodge",
  "Stay",
  "Apartments",
];

const AREAS = [
  "Central",
  "Riverside",
  "Airport",
  "Downtown",
  "Marina",
  "West End",
  "City Centre",
  "Waterfront",
  "Business District",
  "Old Town",
];

const FACILITY_POOL = [
  "Free WiFi",
  "Breakfast included",
  "Parking",
  "Gym",
  "Swimming pool",
  "Airport shuttle",
  "Family rooms",
  "Free cancellation",
];

function normalize(value) {
  return String(value || "").trim();
}

function guessCountry(city, country) {
  if (normalize(country)) return normalize(country);
  return CITY_COUNTRY_MAP[String(city || "").trim().toLowerCase()] || "United Kingdom";
}

function getCoords(city) {
  return CITY_COORDS[String(city || "").trim().toLowerCase()] || {
    lat: 51.5074,
    lng: -0.1278,
  };
}

function makeHotel(city, country, index) {
  const coords = getCoords(city);
  const prefix = HOTEL_PREFIXES[index % HOTEL_PREFIXES.length];
  const suffix = HOTEL_SUFFIXES[index % HOTEL_SUFFIXES.length];
  const area = AREAS[index % AREAS.length];
  const image = FALLBACK_IMAGES[index % FALLBACK_IMAGES.length];

  const lat = Number((coords.lat + ((index % 9) - 4) * 0.01).toFixed(6));
  const lng = Number((coords.lng + ((index % 11) - 5) * 0.01).toFixed(6));

  const facilities = [
    FACILITY_POOL[index % FACILITY_POOL.length],
    FACILITY_POOL[(index + 2) % FACILITY_POOL.length],
    FACILITY_POOL[(index + 4) % FACILITY_POOL.length],
  ];

  let price = 75 + (index % 17) * 11;
  let rating = Number((3.6 + (index % 14) * 0.1).toFixed(1));
  if (rating > 4.9) rating = 4.9;

  return {
    id: `${city.toLowerCase().replace(/\s+/g, "-")}-${index + 1}`,
    name: `${prefix} ${city} ${suffix} ${index + 1}`,
    city,
    country,
    location: area,
    address: `${index + 10} ${area}, ${city}, ${country}`,
    price,
    rating,
    image,
    lat,
    lng,
    facilities,
    summary: `${prefix} ${city} ${suffix} near ${area} with flexible stay options.`,
  };
}

function buildCityInventory(city, country) {
  const safeCity = city || "London";
  const safeCountry = guessCountry(safeCity, country);

  const countMap = {
    london: 2400,
    paris: 1800,
    "new york": 2000,
    dubai: 1500,
    lagos: 900,
    rome: 1200,
    madrid: 1100,
    barcelona: 1100,
    manchester: 700,
    abuja: 500,
  };

  const targetCount = countMap[String(safeCity).trim().toLowerCase()] || 600;
  const items = [];
  for (let i = 0; i < targetCount; i += 1) {
    items.push(makeHotel(safeCity, safeCountry, i));
  }
  return items;
}

app.get("/api/maps-config", (req, res) => {
  return res.json({
    googleMapsApiKey: (process.env.GOOGLE_MAPS_API_KEY || "").trim(),
  });
});

app.get("/api/hotels", (req, res) => {
  try {
    const destination = normalize(req.query.destination);
    const country = normalize(req.query.country);
    const city = normalize(req.query.city);
    const location = normalize(req.query.location).toLowerCase();
    const page = Math.max(1, Number(req.query.page || 1));
    const pageSize = Math.min(60, Math.max(1, Number(req.query.page_size || 24)));

    const facilities = String(req.query.facilities || "")
      .split(",")
      .map((x) => x.trim().toLowerCase())
      .filter(Boolean);

    const requestedCity = city || destination || normalize(req.query.location) || "London";
    const requestedCountry = guessCountry(requestedCity, country);

    const inventory = buildCityInventory(requestedCity, requestedCountry);

    const filtered = inventory.filter((hotel) => {
      let matchesLocation = true;
      if (location) {
        const hay = `${hotel.location} ${hotel.address} ${hotel.city}`.toLowerCase();
        matchesLocation = hay.includes(location);
      }

      let matchesFacilities = true;
      if (facilities.length > 0) {
        const hotelFacilities = (hotel.facilities || []).map((x) => String(x).toLowerCase());
        matchesFacilities = facilities.every((item) => {
          return hotelFacilities.some((facility) => facility.includes(item));
        });
      }

      return matchesLocation && matchesFacilities;
    });

    const total = filtered.length;
    const start = (page - 1) * pageSize;
    const end = start + pageSize;
    const items = filtered.slice(start, end);
    const hasMore = end < total;

    const message =
      total > 0
        ? `Showing page ${page}. Found ${total} hotel results for ${requestedCity}, ${requestedCountry}.`
        : `No matching hotels were found for ${requestedCity}.`;

    return res.json({
      items,
      page,
      page_size: pageSize,
      total,
      has_more: hasMore,
      message,
      detail: total > 0 ? "" : message,
    });
  } catch (e) {
    console.error("Hotel search error:", e);
    return res.status(500).json({
      items: [],
      page: 1,
      page_size: 24,
      total: 0,
      has_more: false,
      message: "",
      detail: "Hotel search is temporarily unavailable. Please try again shortly.",
    });
  }
});

app.post("/auth/register", async (req, res) => {
  try {
    const { email, password } = req.body || {};
    if (!email || !password) {
      return res.status(400).json({ message: "email and password required" });
    }

    const passwordHash = await bcrypt.hash(password, 10);

    const result = await pool.query(
      "INSERT INTO users (email, password_hash) VALUES ($1, $2) RETURNING id, email",
      [email.toLowerCase(), passwordHash]
    );

    return res.status(201).json(result.rows[0]);
  } catch (e) {
    const msg = String(e || "").toLowerCase();
    if (msg.includes("unique")) {
      return res.status(409).json({ message: "email already exists" });
    }
    console.error("Register error:", e);
    return res.status(500).json({ message: "server error" });
  }
});

app.post("/auth/login", async (req, res) => {
  try {
    const { email, password } = req.body || {};
    if (!email || !password) {
      return res.status(400).json({ message: "email and password required" });
    }

    const result = await pool.query(
      "SELECT id, email, password_hash FROM users WHERE email=$1",
      [email.toLowerCase()]
    );

    const user = result.rows[0];
    if (!user) return res.status(401).json({ message: "invalid credentials" });

    const ok = await bcrypt.compare(password, user.password_hash);
    if (!ok) return res.status(401).json({ message: "invalid credentials" });

    if (!process.env.JWT_SECRET) {
      return res.status(500).json({ message: "JWT_SECRET not set" });
    }

    const token = jwt.sign(
      { sub: user.id, email: user.email },
      process.env.JWT_SECRET,
      { expiresIn: "7d" }
    );

    return res.json({ token });
  } catch (e) {
    console.error("Login error:", e);
    return res.status(500).json({ message: "server error" });
  }
});

app.get("/", (req, res) => {
  return res.json({
    status: "myspace-backend running",
    cors_allowed_origins: ALLOWED_ORIGINS,
    hotels_endpoint: "/api/hotels",
  });
});

const PORT = Number(process.env.PORT || 3010);
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));