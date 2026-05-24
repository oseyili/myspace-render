const express = require("express");
const cors = require("cors");
const fs = require("fs");
const path = require("path");
const zlib = require("zlib");
const readline = require("readline");
const crypto = require("crypto");

global.fetch = global.fetch || require("node-fetch");

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

const DATA_DIR = path.join(__dirname, "data");

const HOTEL_FILE = path.join(
  DATA_DIR,
  "live-hotels.ndjson.gz"
);

const DEST_FILE = path.join(
  DATA_DIR,
  "live-destinations.json"
);

const META_FILE = path.join(
  DATA_DIR,
  "live-hotels-meta.json"
);

const LIVE_RATE_INDEX = path.join(
  DATA_DIR,
  "live-rate-index.json"
);

const HOTELBEDS_API_KEY =
  process.env.HOTELBEDS_API_KEY ||
  process.env.HOTELBEDS_KEY ||
  "";

const HOTELBEDS_SECRET =
  process.env.HOTELBEDS_SECRET ||
  process.env.HOTELBEDS_API_SECRET ||
  "";

const HOTELBEDS_BASE =
  process.env.HOTELBEDS_BASE_URL ||
  "https://api.hotelbeds.com";

function clean(v) {
  return String(v || "")
    .replace(/\s+/g, " ")
    .trim();
}

function key(v) {
  return clean(v).toLowerCase();
}

function safeJson(file, fallback) {
  try {
    if (!fs.existsSync(file)) {
      return fallback;
    }

    return JSON.parse(
      fs.readFileSync(file, "utf8")
    );
  } catch {
    return fallback;
  }
}

function normalizeCountry(v) {
  const map = {
    uk: "United Kingdom",
    gb: "United Kingdom",
    usa: "United States",
    us: "United States",
    uae: "United Arab Emirates",
    ae: "United Arab Emirates"
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
    bni: "Benin City"
  };

  return map[key(v)] || clean(v);
}

function hotelStayType(name) {
  const text = key(name);

  const otherWords = [
    "apartment",
    "apartments",
    "flat",
    "villa",
    "suite",
    "guesthouse",
    "guest house",
    "home",
    "residence",
    "hostel",
    "house",
    "farmhouse"
  ];

  for (const word of otherWords) {
    if (text.includes(word)) {
      return "other";
    }
  }

  return "hotel";
}

function stayMatch(type, hotelName) {
  if (!type || type === "both") {
    return true;
  }

  const found =
    hotelStayType(hotelName);

  if (type === "hotel") {
    return found === "hotel";
  }

  if (type === "other") {
    return found === "other";
  }

  return true;
}

function normalizeHotel(row, index) {
  const hotel_name = clean(
    row.hotel_name ||
    row.hotelName ||
    row.name
  );

  if (!hotel_name) {
    return null;
  }

  const country =
    normalizeCountry(
      row.country ||
      row.country_name
    );

  const city =
    normalizeCity(
      row.city ||
      row.city_name ||
      row.destination
    );

  if (!country || !city) {
    return null;
  }

  return {
    id:
      clean(
        row.hotel_id ||
        row.id ||
        row.code
      ) || `hotel-${index}`,

    hotel_id:
      clean(
        row.hotel_id ||
        row.id ||
        row.code
      ) || `hotel-${index}`,

    hotelbeds_code:
      clean(
        row.hotelbeds_code ||
        row.hotel_code ||
        row.hotel_id ||
        row.code
      ),

    supplier:
      clean(row.supplier) ||
      "hotelbeds",

    hotel_name,

    name: hotel_name,

    country,

    city,

    address: clean(
      row.address ||
      row.street
    ),

    area: clean(
      row.area ||
      row.zone
    ),

    rating: clean(
      row.rating ||
      row.category
    ),

    latitude:
      row.latitude || "",

    longitude:
      row.longitude || "",

    image_url:
      clean(
        row.image_url ||
        row.image
      ),

    has_verified_image:
      Boolean(
        row.image_url ||
        row.image
      )
  };
}

async function streamHotels({
  country,
  city,
  stay_type,
  limit
}) {
  const hotels = [];

  const seen = new Set();

  if (!fs.existsSync(HOTEL_FILE)) {
    return [];
  }

  const stream = fs
    .createReadStream(HOTEL_FILE)
    .pipe(zlib.createGunzip());

  const rl = readline.createInterface({
    input: stream,
    crlfDelay: Infinity
  });

  let index = 0;

  for await (const line of rl) {
    if (!line.trim()) continue;

    try {
      const hotel =
        normalizeHotel(
          JSON.parse(line),
          index++
        );

      if (!hotel) continue;

      if (
        key(hotel.country) !==
        key(country)
      ) {
        continue;
      }

      if (
        key(hotel.city) !==
        key(city)
      ) {
        continue;
      }

      if (
        !stayMatch(
          stay_type,
          hotel.hotel_name
        )
      ) {
        continue;
      }

      const dedupe = [
        key(hotel.hotel_name),
        key(hotel.address)
      ].join("|");

      if (seen.has(dedupe)) {
        continue;
      }

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
  if (!fs.existsSync(HOTEL_FILE)) {
    return null;
  }

  const stream = fs
    .createReadStream(HOTEL_FILE)
    .pipe(zlib.createGunzip());

  const rl = readline.createInterface({
    input: stream,
    crlfDelay: Infinity
  });

  let index = 0;

  for await (const line of rl) {
    if (!line.trim()) continue;

    try {
      const hotel =
        normalizeHotel(
          JSON.parse(line),
          index++
        );

      if (!hotel) continue;

      if (
        clean(hotel.hotel_id) ===
        clean(hotelId)
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
  return Boolean(
    HOTELBEDS_API_KEY &&
    HOTELBEDS_SECRET
  );
}

function hotelbedsSignature() {
  const timestamp =
    Math.floor(Date.now() / 1000);

  return crypto
    .createHash("sha256")
    .update(
      HOTELBEDS_API_KEY +
      HOTELBEDS_SECRET +
      timestamp
    )
    .digest("hex");
}

function getSavedRate(hotel) {
  const index = safeJson(
    LIVE_RATE_INDEX,
    {}
  );

  const keys = [
    hotel.hotelbeds_code,
    hotel.hotel_id,
    hotel.id
  ];

  for (const k of keys) {
    if (
      k &&
      index[k] &&
      Number(index[k].amount) > 0
    ) {
      return {
        ok: true,

        supplier:
          "saved_live_database",

        rate_status:
          "saved_recent",

        warning:
          "This is a recently saved supplier rate and may not reflect the latest live supplier update.",

        amount:
          Number(index[k].amount),

        currency:
          index[k].currency ||
          "GBP",

        rate_key:
          index[k].rate_key ||
          "",

        source:
          "saved_live_rate_database"
      };
    }
  }

  return null;
}

async function searchHotelbeds({
  hotel,
  checkin,
  checkout,
  guests,
  rooms
}) {
  if (!hotelbedsReady()) {
    return {
      ok: false,
      reason:
        "Hotelbeds keys missing"
    };
  }

  const code = Number(
    hotel.hotelbeds_code
  );

  if (!Number.isFinite(code)) {
    return {
      ok: false,
      reason:
        "Invalid Hotelbeds hotel code"
    };
  }

  const body = {
    stay: {
      checkIn: checkin,
      checkOut: checkout
    },

    occupancies: [
      {
        rooms:
          Number(rooms || 1),

        adults:
          Number(guests || 2),

        children: 0
      }
    ],

    hotels: {
      hotel: [code]
    }
  };

  try {
    const response = await fetch(
      `${HOTELBEDS_BASE}/hotel-api/1.0/hotels`,
      {
        method: "POST",

        headers: {
          "Api-key":
            HOTELBEDS_API_KEY,

          "X-Signature":
            hotelbedsSignature(),

          Accept:
            "application/json",

          "Content-Type":
            "application/json"
        },

        body: JSON.stringify(body)
      }
    );

    const text =
      await response.text();

    let json = null;

    try {
      json = JSON.parse(text);
    } catch {}

    if (!response.ok) {
      return {
        ok: false,

        reason:
          "Hotelbeds request failed",

        status:
          response.status,

        body:
          text.slice(0, 1000)
      };
    }

    const hbHotel =
      json?.hotels?.hotels?.[0];

    if (!hbHotel) {
      return {
        ok: false,
        reason:
          "No hotel returned"
      };
    }

    let best = null;

    for (const room of hbHotel.rooms || []) {
      for (const rate of room.rates || []) {
        const amount = Number(
          rate.net ||
          rate.sellingRate ||
          0
        );

        if (!(amount > 0)) {
          continue;
        }

        const candidate = {
          amount,

          currency:
            rate.currency ||
            "GBP",

          rate_key:
            rate.rateKey ||
            "",

          room_name:
            room.name || "",

          board_name:
            rate.boardName || ""
        };

        if (
          candidate.rate_key &&
          (
            !best ||
            candidate.amount <
            best.amount
          )
        ) {
          best = candidate;
        }
      }
    }

    if (!best) {
      return {
        ok: false,
        reason:
          "No live rates available"
      };
    }

    return {
      ok: true,

      supplier:
        "hotelbeds",

      rate_status:
        "fresh_live",

      warning: "",

      live_rate: best
    };
  } catch (error) {
    return {
      ok: false,
      reason:
        error.message
    };
  }
}

app.get("/status", (req, res) => {
  const meta = safeJson(
    META_FILE,
    {
      total_hotels: 0
    }
  );

  const destinations =
    safeJson(
      DEST_FILE,
      {
        countries: []
      }
    );

  res.json({
    ok: true,

    service:
      "MySpace Hotel backend",

    hotels:
      meta.total_hotels || 0,

    countries:
      destinations.countries
        ?.length || 0,

    cities:
      destinations.countries?.reduce(
        (s, c) =>
          s +
          (
            c.cities?.length || 0
          ),
        0
      ),

    stripe_ready:
      Boolean(stripe),

    hotelbeds_ready:
      hotelbedsReady(),

    fallback_saved_rates:
      fs.existsSync(
        LIVE_RATE_INDEX
      ),

    live_rate_engine:
      "fresh_live_then_saved_fallback"
  });
});

app.get(
  "/api/destinations",
  (req, res) => {
    const data = safeJson(
      DEST_FILE,
      {
        countries: []
      }
    );

    res.json({
      ok: true,
      ...data
    });
  }
);

app.get(
  "/api/hotels/search",
  async (req, res) => {
    try {
      const hotels =
        await streamHotels({
          country:
            normalizeCountry(
              req.query.country
            ),

          city:
            normalizeCity(
              req.query.city
            ),

          stay_type:
            req.query.stay_type ||
            "both",

          limit: Math.min(
            Number(
              req.query.limit ||
              100
            ),
            200
          )
        });

      res.json({
        ok: true,
        total: hotels.length,
        hotels
      });
    } catch (error) {
      res.status(500).json({
        ok: false,
        error:
          error.message
      });
    }
  }
);

app.get(
  "/api/hotels/live-rate",
  async (req, res) => {
    try {
      const hotel =
        await findHotel(
          req.query.hotel_id
        );

      if (!hotel) {
        return res.json({
          ok: false,
          reason:
            "Hotel not found"
        });
      }

      const fresh =
        await searchHotelbeds({
          hotel,

          checkin:
            req.query.checkin,

          checkout:
            req.query.checkout,

          guests:
            req.query.guests,

          rooms:
            req.query.rooms
        });

      if (fresh.ok) {
        return res.json({
          ok: true,

          hotel,

          supplier:
            "hotelbeds",

          rate_status:
            "fresh_live",

          warning: "",

          result:
            fresh.live_rate
        });
      }

      const saved =
        getSavedRate(hotel);

      if (saved) {
        return res.json({
          ok: true,

          hotel,

          supplier:
            "saved_live_database",

          rate_status:
            "saved_recent",

          warning:
            saved.warning,

          result: saved,

          live_supplier_failure:
            fresh
        });
      }

      return res.json({
        ok: false,

        hotel,

        rate_status:
          "unavailable",

        live_supplier_failure:
          fresh,

        message:
          "No supplier rate available."
      });
    } catch (error) {
      res.status(500).json({
        ok: false,
        error:
          error.message
      });
    }
  }
);

app.post(
  "/api/create-checkout-session",
  async (req, res) => {
    try {
      if (!stripe) {
        return res.status(500).json({
          ok: false,
          error:
            "Stripe not configured"
        });
      }

      const body = req.body || {};

      const amount = Number(
        body.amount || 0
      );

      if (!(amount > 0)) {
        return res.status(400).json({
          ok: false,
          error:
            "Real supplier or saved rate required."
        });
      }

      const session =
        await stripe.checkout.sessions.create(
          {
            mode: "payment",

            success_url:
              "https://www.myspace-hotel.com/?payment=success",

            cancel_url:
              "https://www.myspace-hotel.com/?payment=cancelled",

            line_items: [
              {
                quantity: 1,

                price_data: {
                  currency:
                    (
                      body.currency ||
                      "GBP"
                    ).toLowerCase(),

                  unit_amount:
                    Math.round(
                      amount * 100
                    ),

                  product_data: {
                    name:
                      body.hotel_name
                  }
                }
              }
            ]
          }
        );

      res.json({
        ok: true,
        url: session.url
      });
    } catch (error) {
      res.status(500).json({
        ok: false,
        error:
          error.message
      });
    }
  }
);

app.listen(
  PORT,
  "0.0.0.0",
  () => {
    console.log(
      "================================="
    );

    console.log(
      "MYSPACE HOTEL BACKEND LIVE"
    );

    console.log(
      "================================="
    );

    console.log(
      "Hotelbeds Ready:",
      hotelbedsReady()
    );

    console.log(
      "Saved Rate Index:",
      fs.existsSync(
        LIVE_RATE_INDEX
      )
    );

    console.log(
      "Stripe Ready:",
      Boolean(stripe)
    );

    console.log(
      "================================="
    );
  }
);