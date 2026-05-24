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
} catch {
  console.log("Stripe not configured");
}

const app = express();
const PORT = process.env.PORT || 5050;

app.use(cors());
app.use(express.json({ limit: "10mb" }));

const ROOT = path.resolve(__dirname, "..");
const DATA = path.join(__dirname, "data");
const PUBLIC = path.join(ROOT, "frontend", "public");

const DEST_FILE_BACKEND = path.join(DATA, "live-destinations.json");
const DEST_FILE_PUBLIC = path.join(PUBLIC, "live-destinations.json");

const HOTEL_FILE = path.join(DATA, "live-hotels.ndjson.gz");
const HOTEL_META = path.join(DATA, "live-hotels-meta.json");

const RATE_INDEX = path.join(DATA, "live-rate-index.json");

function clean(v) {
  return String(v || "")
    .replace(/\s+/g, " ")
    .trim();
}

function key(v) {
  return clean(v).toLowerCase();
}

function pick(o, keys) {
  for (const k of keys) {
    const v = o?.[k];
    if (v !== undefined && v !== null && String(v).trim()) {
      return v;
    }
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
  usa: "United States",
  us: "United States",
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
  const k = key(v);
  return COUNTRY_MAP[k] || clean(v);
}

function normalizeCity(v) {
  const k = key(v);
  return CITY_MAP[k] || clean(v);
}

function normalizeHotel(h, index) {
  const hotel_id =
    clean(
      pick(h, [
        "hotel_id",
        "hotelId",
        "id",
        "code",
        "hotelCode",
        "supplier_hotel_id"
      ])
    ) || `hotel-${index}`;

  const hotel_name = clean(
    pick(h, [
      "hotel_name",
      "hotelName",
      "name",
      "title"
    ])
  );

  const country = normalizeCountry(
    pick(h, [
      "country",
      "country_name",
      "countryName",
      "country_code",
      "countryCode"
    ])
  );

  const city = normalizeCity(
    pick(h, [
      "city",
      "city_name",
      "cityName",
      "destination",
      "destination_name",
      "destinationName"
    ])
  );

  if (!hotel_name || !country || !city) {
    return null;
  }

  const image_url = clean(
    pick(h, [
      "image_url",
      "image",
      "main_image",
      "mainImage",
      "photo",
      "thumbnail"
    ])
  );

  return {
    id: hotel_id,
    hotel_id,
    hotel_name,
    name: hotel_name,
    country,
    city,
    area: clean(
      pick(h, [
        "area",
        "zone",
        "district"
      ])
    ),
    address: clean(
      pick(h, [
        "address",
        "address1",
        "street"
      ])
    ),
    rating: clean(
      pick(h, [
        "rating",
        "category",
        "stars"
      ])
    ),
    image_url,
    image_caption: image_url
      ? "Verified property image"
      : "",
    image_source: image_url
      ? "MySpace Hotel verified image"
      : "",
    has_verified_image: Boolean(image_url),
    latitude: pick(h, ["latitude", "lat"]),
    longitude: pick(h, ["longitude", "lng", "lon"])
  };
}

function getDestinations() {
  const payload =
    readJson(DEST_FILE_BACKEND, null) ||
    readJson(DEST_FILE_PUBLIC, null) ||
    { countries: [] };

  const countries = Array.isArray(payload.countries)
    ? payload.countries
    : [];

  return countries
    .map((c) => ({
      country: clean(
        c.country ||
        c.country_name ||
        c.name
      ),
      cities: Array.isArray(c.cities)
        ? c.cities
            .map((x) => ({
              city: clean(
                typeof x === "string"
                  ? x
                  : x.city ||
                    x.city_name ||
                    x.name
              )
            }))
            .filter((x) => x.city)
        : []
    }))
    .filter(
      (c) =>
        c.country &&
        c.cities.length
    )
    .sort((a, b) =>
      a.country.localeCompare(b.country)
    );
}

async function searchHotels({
  country,
  city,
  stay_type,
  limit
}) {
  const results = [];
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
    if (results.length >= limit) {
      rl.close();
      stream.destroy();
      break;
    }

    if (!line.trim()) continue;

    try {
      const hotel = normalizeHotel(
        JSON.parse(line),
        index
      );

      index += 1;

      if (!hotel) continue;

      if (
        key(hotel.country) !==
        key(normalizeCountry(country))
      ) {
        continue;
      }

      if (
        key(hotel.city) !==
        key(normalizeCity(city))
      ) {
        continue;
      }

      const hotelTypeText = [
        hotel.hotel_name,
        hotel.area,
        hotel.address
      ]
        .join(" ")
        .toLowerCase();

      const isHotel =
        hotelTypeText.includes("hotel");

      const isOther =
        hotelTypeText.includes("apartment") ||
        hotelTypeText.includes("hostel") ||
        hotelTypeText.includes("villa") ||
        hotelTypeText.includes("suite") ||
        hotelTypeText.includes("residence");

      if (stay_type === "hotel" && !isHotel) {
        continue;
      }

      if (stay_type === "other" && !isOther) {
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

      results.push(hotel);
    } catch {}
  }

  return results;
}

function getLiveRate(hotel_id) {
  const index = readJson(RATE_INDEX, {});

  const rate = index[String(hotel_id)];

  if (!rate) {
    return null;
  }

  return {
    amount: Number(rate.amount || 0),
    currency: clean(rate.currency || "GBP"),
    rate_key: clean(rate.rate_key || "")
  };
}

app.get("/", (req, res) => {
  res.json({
    ok: true,
    service: "MySpace Hotel backend"
  });
});

app.get("/status", (req, res) => {
  const destinations = getDestinations();

  const meta = readJson(
    HOTEL_META,
    { total_hotels: 0 }
  );

  res.json({
    ok: true,
    service: "MySpace Hotel backend",
    hotels: Number(meta.total_hotels || 0),
    countries: destinations.length,
    cities: destinations.reduce(
      (sum, c) => sum + c.cities.length,
      0
    ),
    stripe_ready: Boolean(stripe),
    storage: fs.existsSync(HOTEL_FILE)
      ? "compressed_streaming"
      : "missing"
  });
});

app.get(
  "/api/real-catalog/destinations",
  (req, res) => {
    const countries = getDestinations();

    res.json({
      ok: true,
      total_countries: countries.length,
      countries
    });
  }
);

app.get("/api/destinations", (req, res) => {
  const countries = getDestinations();

  res.json({
    ok: true,
    total_countries: countries.length,
    countries
  });
});

app.get(
  "/api/hotels/search",
  async (req, res) => {
    try {
      const hotels =
        await searchHotels({
          country: req.query.country,
          city: req.query.city,
          stay_type:
            req.query.stay_type ||
            "both",
          limit: Math.min(
            Number(req.query.limit || 100),
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
          "Hotel search failed."
      });
    }
  }
);

app.get(
  "/api/hotels/live-rate",
  (req, res) => {
    try {
      const hotel_id = clean(
        req.query.hotel_id
      );

      if (!hotel_id) {
        return res.status(400).json({
          ok: false,
          error: "hotel_id required"
        });
      }

      const rate =
        getLiveRate(hotel_id);

      if (!rate) {
        return res.json({
          ok: false,
          live_available: false,
          message:
            "Live rate currently unavailable. Request confirmation."
        });
      }

      res.json({
        ok: true,
        live_available: true,
        hotel_id,
        rate
      });
    } catch (error) {
      res.status(500).json({
        ok: false,
        error:
          error.message ||
          "Live rate lookup failed."
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

      const amount = Math.max(
        50,
        Math.round(
          Number(body.amount || 0) *
            100
        )
      );

      const currency = String(
        body.currency || "GBP"
      ).toLowerCase();

      const session =
        await stripe.checkout.sessions.create({
          mode: "payment",

          success_url:
            process.env
              .STRIPE_SUCCESS_URL ||
            "https://www.myspace-hotel.com/?payment=success",

          cancel_url:
            process.env
              .STRIPE_CANCEL_URL ||
            "https://www.myspace-hotel.com/?payment=cancelled",

          line_items: [
            {
              quantity: 1,
              price_data: {
                currency,
                unit_amount: amount,
                product_data: {
                  name:
                    body.hotel_name ||
                    "MySpace Hotel reservation"
                }
              }
            }
          ]
        });

      res.json({
        ok: true,
        url: session.url
      });
    } catch (error) {
      res.status(500).json({
        ok: false,
        error:
          error.message ||
          "Checkout failed."
      });
    }
  }
);

app.listen(PORT, "0.0.0.0", () => {
  const destinations =
    getDestinations();

  const meta = readJson(
    HOTEL_META,
    { total_hotels: 0 }
  );

  console.log(
    `MySpace Hotel backend running on port ${PORT}`
  );

  console.log(
    `Hotels: ${meta.total_hotels || 0}`
  );

  console.log(
    `Countries: ${destinations.length}`
  );

  console.log(
    `Cities: ${destinations.reduce(
      (sum, c) => sum + c.cities.length,
      0
    )}`
  );

  console.log(
    `Stripe ready: ${Boolean(stripe)}`
  );
});