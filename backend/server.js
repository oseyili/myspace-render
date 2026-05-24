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

const ROOT = path.resolve(__dirname, "..");

const DATA_DIR = path.join(__dirname, "data");

const HOTELS_GZ = path.join(
  DATA_DIR,
  "live-hotels.ndjson.gz"
);

const DESTINATIONS_FILE = path.join(
  DATA_DIR,
  "live-destinations.json"
);

const META_FILE = path.join(
  DATA_DIR,
  "live-hotels-meta.json"
);

const PARTNER_FILE = path.join(
  DATA_DIR,
  "partner_applications.json"
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
  const x = key(v);

  const map = {
    uk: "United Kingdom",
    gb: "United Kingdom",
    gbr: "United Kingdom",
    usa: "United States",
    us: "United States",
    ae: "United Arab Emirates",
    uae: "United Arab Emirates",
    ng: "Nigeria",
    fr: "France",
    es: "Spain"
  };

  return map[x] || clean(v);
}

function normalizeCity(v) {
  const x = key(v);

  const map = {
    lon: "London",
    nyc: "New York",
    dxb: "Dubai",
    par: "Paris",
    los: "Lagos",
    abv: "Abuja",
    bni: "Benin City",
    mad: "Madrid",
    bcn: "Barcelona",
    lax: "Los Angeles",
    mia: "Miami"
  };

  return map[x] || clean(v);
}

function hotelStayType(name) {
  const text = key(name);

  if (
    text.includes("apartment") ||
    text.includes("apartments") ||
    text.includes("villa") ||
    text.includes("hostel") ||
    text.includes("residence") ||
    text.includes("guest house") ||
    text.includes("guesthouse") ||
    text.includes("suite")
  ) {
    return "other";
  }

  return "hotel";
}

function stayTypeMatch(
  requested,
  hotelName
) {
  if (
    !requested ||
    requested === "both"
  ) {
    return true;
  }

  const type =
    hotelStayType(hotelName);

  if (requested === "hotel") {
    return type === "hotel";
  }

  if (requested === "other") {
    return type === "other";
  }

  return true;
}

function normalizeHotel(
  row,
  index
) {
  const hotel_name = clean(
    row.hotel_name ||
    row.hotelName ||
    row.name ||
    row.title
  );

  if (!hotel_name) {
    return null;
  }

  const country =
    normalizeCountry(
      row.country ||
      row.country_name ||
      row.countryCode
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

  const image =
    clean(
      row.image_url ||
      row.image ||
      row.photo ||
      row.main_image
    );

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

    hotel_code:
      clean(
        row.hotel_code ||
        row.hotel_id ||
        row.id ||
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
      row.street ||
      row.address1
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
      row.latitude ||
      row.lat ||
      "",

    longitude:
      row.longitude ||
      row.lng ||
      row.lon ||
      "",

    image_url: image,

    image_caption: image
      ? "Verified property image"
      : "",

    image_source: image
      ? "MySpace Hotel verified image"
      : "",

    has_verified_image:
      Boolean(image)
  };
}

function getDestinations() {
  const payload = safeJson(
    DESTINATIONS_FILE,
    {
      countries: []
    }
  );

  return Array.isArray(
    payload.countries
  )
    ? payload.countries
    : [];
}

async function streamHotels({
  country,
  city,
  stay_type,
  limit
}) {
  const hotels = [];
  const seen = new Set();

  if (!fs.existsSync(HOTELS_GZ)) {
    return [];
  }

  const stream = fs
    .createReadStream(HOTELS_GZ)
    .pipe(zlib.createGunzip());

  const rl = readline.createInterface({
    input: stream,
    crlfDelay: Infinity
  });

  let index = 0;

  for await (const line of rl) {
    if (!line.trim()) continue;

    try {
      const parsed =
        JSON.parse(line);

      const hotel =
        normalizeHotel(
          parsed,
          index++
        );

      if (!hotel) continue;

      if (
        key(hotel.country) !==
        key(
          normalizeCountry(country)
        )
      ) {
        continue;
      }

      if (
        key(hotel.city) !==
        key(normalizeCity(city))
      ) {
        continue;
      }

      if (
        !stayTypeMatch(
          stay_type,
          hotel.hotel_name
        )
      ) {
        continue;
      }

      const dedupe = [
        key(hotel.hotel_name),
        key(hotel.address),
        key(hotel.city),
        key(hotel.country)
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

async function findHotel(
  hotelId
) {
  if (!fs.existsSync(HOTELS_GZ)) {
    return null;
  }

  const wanted = clean(hotelId);

  const stream = fs
    .createReadStream(HOTELS_GZ)
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
          wanted ||
        clean(hotel.id) === wanted
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

async function searchHotelbeds({
  hotel,
  checkin,
  checkout,
  guests
}) {
  if (!hotelbedsReady()) {
    return null;
  }

  const hotelCode = Number(
    hotel.hotel_code
  );

  if (!Number.isFinite(hotelCode)) {
    return null;
  }

  const body = {
    stay: {
      checkIn: checkin,
      checkOut: checkout
    },

    occupancies: [
      {
        rooms: 1,

        adults: Math.max(
          1,
          Number(guests || 2)
        ),

        children: 0
      }
    ],

    hotels: {
      hotel: [hotelCode]
    }
  };

  const response = await fetch(
    `${HOTELBEDS_BASE}/hotel-api/1.0/hotels`,
    {
      method: "POST",

      headers: {
        "Api-key":
          HOTELBEDS_API_KEY,

        "X-Signature":
          hotelbedsSignature(),

        "Content-Type":
          "application/json",

        Accept:
          "application/json"
      },

      body: JSON.stringify(body)
    }
  );

  if (!response.ok) {
    console.log(
      "HOTELBEDS STATUS:",
      response.status
    );

    return null;
  }

  const data =
    await response.json();

  const hbHotel =
    data?.hotels?.hotels?.[0];

  if (!hbHotel) {
    return null;
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
        supplier: "hotelbeds",

        source:
          "hotelbeds_live_search",

        currency:
          rate.currency ||
          "GBP",

        amount,

        rate_key:
          rate.rateKey || "",

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

  return best;
}

app.get("/", (req, res) => {
  res.json({
    ok: true,
    service:
      "MySpace Hotel backend"
  });
});

app.get("/status", (req, res) => {
  const destinations =
    getDestinations();

  const meta = safeJson(
    META_FILE,
    {
      total_hotels: 0
    }
  );

  res.json({
    ok: true,

    service:
      "MySpace Hotel backend",

    hotels:
      Number(
        meta.total_hotels || 0
      ),

    countries:
      destinations.length,

    cities:
      destinations.reduce(
        (s, x) =>
          s +
          (
            Array.isArray(
              x.cities
            )
              ? x.cities.length
              : 0
          ),
        0
      ),

    stripe_ready:
      Boolean(stripe),

    hotelbeds_ready:
      hotelbedsReady(),

    live_rate_engine:
      "selected_hotel_live_supplier_search"
  });
});

app.get(
  "/api/real-catalog/destinations",
  (req, res) => {
    const countries =
      getDestinations();

    res.json({
      ok: true,

      total_countries:
        countries.length,

      countries
    });
  }
);

app.get(
  "/api/destinations",
  (req, res) => {
    const countries =
      getDestinations();

    res.json({
      ok: true,

      total_countries:
        countries.length,

      countries
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
            req.query.country,

          city:
            req.query.city,

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
          error.message ||
          "Hotel search failed"
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

          live_available: false,

          message:
            "Hotel not found."
        });
      }

      const hotelbeds =
        await searchHotelbeds({
          hotel,

          checkin:
            req.query.checkin,

          checkout:
            req.query.checkout,

          guests:
            req.query.guests
        });

      if (hotelbeds) {
        return res.json({
          ok: true,

          live_available: true,

          supplier:
            "hotelbeds",

          hotel,

          rate: hotelbeds
        });
      }

      return res.json({
        ok: false,

        live_available: false,

        suppliers_checked: [
          "hotelbeds"
        ],

        message:
          "No supplier returned a live rate for this selected stay."
      });
    } catch (error) {
      res.status(500).json({
        ok: false,

        live_available: false,

        error:
          error.message ||
          "Live rate failed"
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
            "Stripe is not configured."
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
            "A real supplier live rate is required before checkout."
        });
      }

      if (!body.rate_key) {
        return res.status(400).json({
          ok: false,

          error:
            "Missing live supplier rate key."
        });
      }

      const session =
        await stripe.checkout.sessions.create(
          {
            mode: "payment",

            success_url:
              process.env
                .STRIPE_SUCCESS_URL ||
              "https://www.myspace-hotel.com/?payment=success",

            cancel_url:
              process.env
                .STRIPE_CANCEL_URL ||
              "https://www.myspace-hotel.com/?payment=cancelled",

            customer_email:
              body.customer_email ||
              undefined,

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
                      body.hotel_name ||
                      "MySpace Hotel stay",

                    description:
                      `${body.destination || ""} | ${body.checkin || ""} to ${body.checkout || ""}`
                  }
                }
              }
            ],

            metadata: {
              hotel_id:
                String(
                  body.hotel_id ||
                    ""
                ),

              rate_key:
                String(
                  body.rate_key ||
                    ""
                ).slice(0, 450),

              source:
                "live_supplier_only"
            }
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
          error.message ||
          "Checkout failed"
      });
    }
  }
);

app.post(
  "/api/extranet/register",
  (req, res) => {
    const body = req.body || {};

    try {
      const existing =
        safeJson(
          PARTNER_FILE,
          []
        );

      existing.push({
        id:
          "partner-" +
          Date.now(),

        created_at:
          new Date().toISOString(),

        ...body
      });

      fs.writeFileSync(
        PARTNER_FILE,
        JSON.stringify(
          existing,
          null,
          2
        )
      );
    } catch {}

    res.json({
      ok: true,

      message:
        "Partner application received.",

      business_name:
        body.business_name ||
        "",

      email:
        body.email || ""
    });
  }
);

app.post(
  "/api/auth/login",
  (req, res) => {
    res.status(401).json({
      ok: false,

      error:
        "Partner login requires approved credentials."
    });
  }
);

app.listen(
  PORT,
  "0.0.0.0",
  () => {
    const destinations =
      getDestinations();

    const meta = safeJson(
      META_FILE,
      {
        total_hotels: 0
      }
    );

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
      "Hotels:",
      meta.total_hotels || 0
    );

    console.log(
      "Countries:",
      destinations.length
    );

    console.log(
      "Cities:",
      destinations.reduce(
        (s, x) =>
          s +
          (
            Array.isArray(
              x.cities
            )
              ? x.cities.length
              : 0
          ),
        0
      )
    );

    console.log(
      "Hotelbeds ready:",
      hotelbedsReady()
    );

    console.log(
      "Stripe ready:",
      Boolean(stripe)
    );

    console.log(
      "================================="
    );
  }
);