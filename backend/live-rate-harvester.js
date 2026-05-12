require("dotenv").config();

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const axios = require("axios");

const DATA_DIR = path.join(__dirname, "data");
const CACHE_FILE = path.join(DATA_DIR, "live_rate_cache.json");
const BAD_FILE = path.join(DATA_DIR, "bad_hotel_code_harvest.json");

const HOTELBEDS_API_KEY = process.env.HOTELBEDS_API_KEY || "";
const HOTELBEDS_SECRET = process.env.HOTELBEDS_SECRET || process.env.HOTELBEDS_API_SECRET || "";
const HOTELBEDS_BASE_URL =
  process.env.HOTELBEDS_BASE_URL ||
  process.env.HOTELBEDS_API_URL ||
  "https://api.test.hotelbeds.com";

const MAX_LOCATIONS = Number(process.env.HARVEST_MAX_LOCATIONS || 1200);
const HOTEL_CODES_PER_LOCATION = Number(process.env.HARVEST_HOTELS_PER_LOCATION || 300);
const HOTEL_CODES_PER_REQUEST = Number(process.env.HARVEST_HOTELS_PER_REQUEST || 120);
const PAUSE_MS = Number(process.env.HARVEST_PAUSE_MS || 2500);
const RATE_LIMIT_BACKOFF_MS = Number(process.env.HARVEST_429_BACKOFF_MS || 45000);

const DATE_OFFSETS = [2, 4, 7, 10, 14, 21, 30, 45, 60, 75, 90];

const OCCUPANCIES = [
  { rooms: 1, adults: 1, children: 0 },
  { rooms: 1, adults: 2, children: 0 },
  { rooms: 1, adults: 3, children: 0 },
  { rooms: 2, adults: 4, children: 0 },
];

const LIVE_RATE_MAP = new Map();
let NEW_RATES_THIS_RUN = 0;

const DESTINATION_FIX = {
  PAR: { city: "Paris", country: "France" },
  LON: { city: "London", country: "United Kingdom" },
  BCN: { city: "Barcelona", country: "Spain" },
  MAD: { city: "Madrid", country: "Spain" },
  PMI: { city: "Majorca", country: "Spain" },
  SVQ: { city: "Seville", country: "Spain" },
  AGP: { city: "Malaga", country: "Spain" },
  DXB: { city: "Dubai", country: "United Arab Emirates" },
  NYC: { city: "New York", country: "United States" },
  MIA: { city: "Miami", country: "United States" },
  ORL: { city: "Orlando", country: "United States" },
  LAS: { city: "Las Vegas", country: "United States" },
  LAX: { city: "Los Angeles", country: "United States" },
  SFO: { city: "San Francisco", country: "United States" },
  IST: { city: "Istanbul", country: "Turkey" },
  AYT: { city: "Antalya", country: "Turkey" },
  LIS: { city: "Lisbon", country: "Portugal" },
  OPO: { city: "Porto", country: "Portugal" },
  FCO: { city: "Rome", country: "Italy" },
  NAP: { city: "Naples", country: "Italy" },
  FLR: { city: "Florence", country: "Italy" },
  BLQ: { city: "Bologna", country: "Italy" },
  TRN: { city: "Turin", country: "Italy" },
  MXP: { city: "Milan", country: "Italy" },
  MIL: { city: "Milan", country: "Italy" },
  VIE: { city: "Vienna", country: "Austria" },
  WAW: { city: "Warsaw", country: "Poland" },
  ATH: { city: "Athens", country: "Greece" },
  BKK: { city: "Bangkok", country: "Thailand" },
  NBO: { city: "Nairobi", country: "Kenya" },
  LOS: { city: "Lagos", country: "Nigeria" },
};

function clean(value) {
  return String(value ?? "").trim();
}

function num(value) {
  const n = Number(String(value ?? "").replace(/[^0-9.]/g, ""));
  return Number.isFinite(n) ? n : 0;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function safeJson(value) {
  if (typeof value !== "string") return value;

  const raw = value.trim();

  if (!raw || (!raw.startsWith("{") && !raw.startsWith("["))) return value;

  try {
    return JSON.parse(raw);
  } catch {
    return value;
  }
}

function readJson(file) {
  try {
    if (!fs.existsSync(file)) return null;
    return JSON.parse(fs.readFileSync(file, "utf8"));
  } catch {
    return null;
  }
}

function writeJson(file, value) {
  fs.writeFileSync(file, JSON.stringify(value, null, 2), "utf8");
}

function extractRows(json) {
  if (!json) return [];
  if (Array.isArray(json)) return json;

  for (const key of ["hotels", "data", "results", "items", "rows", "destinations", "countries", "live_rates"]) {
    const value = safeJson(json[key]);
    if (Array.isArray(value)) return value;
  }

  for (const value of Object.values(json)) {
    const parsed = safeJson(value);
    if (Array.isArray(parsed)) return parsed;
  }

  return [];
}

function pick(obj, keys) {
  for (const key of keys) {
    if (obj && obj[key] !== undefined && obj[key] !== null && clean(obj[key]) !== "") {
      return obj[key];
    }
  }

  return "";
}

function rawHotelObject(row) {
  const parsed = safeJson(row.raw_hotel_json);
  return parsed && typeof parsed === "object" ? parsed : row;
}

function normalTitle(value) {
  const raw = clean(value);

  if (!raw) return "";
  if (/^\d/.test(raw)) return "";
  if (raw.includes("_") || raw.includes("|")) return "";
  if (raw.length < 2 || raw.length > 80) return "";

  return raw
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim()
    .split(" ")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

function getDestination(row) {
  const hotel = rawHotelObject(row);

  const destinationCode = clean(
    pick(row, ["destination_code", "destinationCode", "city_code", "cityCode"]) ||
      pick(hotel, ["destinationCode", "destination_code", "cityCode", "city_code"])
  ).toUpperCase();

  const fixed = DESTINATION_FIX[destinationCode] || null;

  const city =
    normalTitle(
      pick(row, ["city", "cityName", "city_name", "destination_name", "destinationName"]) ||
        pick(hotel, ["city", "cityName", "city_name", "destinationName", "destination_name"])
    ) ||
    fixed?.city ||
    destinationCode;

  const country =
    normalTitle(
      pick(row, ["country", "countryName", "country_name"]) ||
        pick(hotel, ["country", "countryName", "country_name"])
    ) ||
    fixed?.country ||
    "";

  if (!city || !country || country.toLowerCase() === "unknown") return null;

  return {
    destinationCode,
    city,
    country,
  };
}

function getHotelCode(row) {
  const hotel = rawHotelObject(row);

  return clean(
    pick(row, ["hotel_code", "hotelCode", "hotel_id", "hotelId", "code", "id"]) ||
      pick(hotel, ["code", "hotelCode", "hotel_code", "hotel_id", "id"])
  );
}

function loadAllRows() {
  const rows = [];

  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

  const files = fs
    .readdirSync(DATA_DIR)
    .filter((file) => file.toLowerCase().endsWith(".json"))
    .filter((file) => file !== "booking_ledger.json")
    .filter((file) => file !== "live_rate_cache.json")
    .filter((file) => file !== "bad_destination_codes.json")
    .filter((file) => file !== "bad_hotel_code_harvest.json")
    .filter((file) => !file.includes("BACKUP"));

  for (const file of files) {
    const loaded = extractRows(readJson(path.join(DATA_DIR, file)));

    console.log(`READ ${file}: ${loaded.length} rows`);

    for (const row of loaded) {
      if (row && typeof row === "object") rows.push(row);
    }
  }

  return rows;
}

function loadExistingCacheIntoMap() {
  const existing = readJson(CACHE_FILE);

  const rows = Array.isArray(existing)
    ? existing
    : Array.isArray(existing?.live_rates)
      ? existing.live_rates
      : Array.isArray(existing?.hotels)
        ? existing.hotels
        : [];

  for (const row of rows) {
    const compact = compactRateRow(row);
    const key = rateDedupeKey(compact);

    if (key) LIVE_RATE_MAP.set(key, compact);
  }

  console.log(`EXISTING CACHE RATES LOADED: ${LIVE_RATE_MAP.size}`);
}

function loadBadState() {
  const parsed = readJson(BAD_FILE);

  return {
    bad_locations: new Set(Array.isArray(parsed?.bad_locations) ? parsed.bad_locations : []),
    bad_batches: new Set(Array.isArray(parsed?.bad_batches) ? parsed.bad_batches : []),
  };
}

function saveBadState(state) {
  writeJson(BAD_FILE, {
    updated_at: new Date().toISOString(),
    bad_locations: [...state.bad_locations].sort(),
    bad_batches: [...state.bad_batches].sort(),
  });
}

function buildHotelCodeLocations(rows, badState) {
  const grouped = new Map();

  for (const row of rows) {
    const destination = getDestination(row);
    const hotelCode = getHotelCode(row);

    if (!destination || !hotelCode) continue;

    const locationKey = `${destination.country}|${destination.city}`;

    if (badState.bad_locations.has(locationKey)) continue;

    if (!grouped.has(locationKey)) {
      grouped.set(locationKey, {
        country: destination.country,
        city: destination.city,
        destinationCode: destination.destinationCode,
        hotelCodes: new Set(),
        sourceRows: 0,
      });
    }

    const location = grouped.get(locationKey);

    location.hotelCodes.add(hotelCode);
    location.sourceRows += 1;
  }

  return [...grouped.values()]
    .map((location) => ({
      country: location.country,
      city: location.city,
      destinationCode: location.destinationCode,
      hotelCodes: [...location.hotelCodes].slice(0, HOTEL_CODES_PER_LOCATION),
      sourceRows: location.sourceRows,
    }))
    .filter((location) => location.hotelCodes.length > 0)
    .sort((a, b) => {
      if (a.country !== b.country) return a.country.localeCompare(b.country);
      return b.hotelCodes.length - a.hotelCodes.length;
    })
    .slice(0, MAX_LOCATIONS);
}

function buildBalancedLocationOrder(locations) {
  const byCountry = new Map();

  for (const location of locations) {
    if (!byCountry.has(location.country)) byCountry.set(location.country, []);
    byCountry.get(location.country).push(location);
  }

  for (const list of byCountry.values()) {
    list.sort((a, b) => b.hotelCodes.length - a.hotelCodes.length);
  }

  const countries = [...byCountry.keys()].sort();
  const ordered = [];

  let added = true;
  let round = 0;

  while (added && ordered.length < MAX_LOCATIONS) {
    added = false;

    for (const country of countries) {
      const item = byCountry.get(country)[round];

      if (item) {
        ordered.push(item);
        added = true;
      }

      if (ordered.length >= MAX_LOCATIONS) break;
    }

    round += 1;
  }

  return ordered;
}

function chunkArray(values, size) {
  const chunks = [];

  for (let i = 0; i < values.length; i += size) {
    chunks.push(values.slice(i, i + size));
  }

  return chunks;
}

function todayPlus(days) {
  const date = new Date(Date.now() + days * 86400000);
  return date.toISOString().slice(0, 10);
}

function signature() {
  const unix = Math.floor(Date.now() / 1000).toString();

  return crypto
    .createHash("sha256")
    .update(HOTELBEDS_API_KEY + HOTELBEDS_SECRET + unix)
    .digest("hex");
}

async function hotelbedsPost(body) {
  const url = `${HOTELBEDS_BASE_URL.replace(/\/$/, "")}/hotel-api/1.0/hotels`;

  const response = await axios.post(url, body, {
    timeout: 70000,
    headers: {
      "Api-key": HOTELBEDS_API_KEY,
      "X-Signature": signature(),
      Accept: "application/json",
      "Accept-Encoding": "gzip",
      "Content-Type": "application/json",
      "User-Agent": "MySpaceHotel/1.0",
    },
  });

  return {
    hotels: response?.data?.hotels?.hotels || [],
    currency: response?.data?.hotels?.currency || "",
  };
}

function makeHotelCodeBody(hotelCodes, checkin, checkout, occupancy) {
  return {
    stay: {
      checkIn: checkin,
      checkOut: checkout,
    },
    occupancies: [occupancy],
    hotels: {
      hotel: hotelCodes,
    },
  };
}

function rateDedupeKey(row) {
  return (
    clean(row.rate_key) ||
    `${clean(row.hotel_code)}|${clean(row.checkin)}|${clean(row.checkout)}|${clean(row.room_code)}|${clean(row.board_code)}|${clean(row.net)}`
  );
}

function compactRateRow(row) {
  return {
    hotel_code: clean(row.hotel_code),
    hotel_name: clean(row.hotel_name),

    destination_code: clean(row.destination_code),
    country: clean(row.country),
    city: clean(row.city),

    latitude: clean(row.latitude),
    longitude: clean(row.longitude),

    category_name: clean(row.category_name),

    room_code: clean(row.room_code),
    room_name: clean(row.room_name || "Selected room"),

    board_code: clean(row.board_code),
    board_name: clean(row.board_name || "Room only"),

    rate_key: clean(row.rate_key),
    rate_type: clean(row.rate_type),
    rate_class: clean(row.rate_class),

    payment_type: clean(row.payment_type),

    net: clean(row.net),
    selling_rate: clean(row.selling_rate || row.net),

    currency: clean(row.currency || "GBP"),

    cancellation_policies: clean(row.cancellation_policies || "[]"),

    checkin: clean(row.checkin),
    checkout: clean(row.checkout),

    guests: Number(row.guests || 2),
    rooms: Number(row.rooms || 1),

    created_at: clean(row.created_at),

    live_rate_ready: true,
  };
}

function addRowsToLiveMap(rows) {
  let added = 0;

  for (const row of rows || []) {
    const compact = compactRateRow(row);
    const key = rateDedupeKey(compact);

    if (!key) continue;

    if (!LIVE_RATE_MAP.has(key)) {
      added += 1;
      NEW_RATES_THIS_RUN += 1;
    }

    LIVE_RATE_MAP.set(key, compact);
  }

  return added;
}

function writeCache(reason = "save") {
  const finalRates = [...LIVE_RATE_MAP.values()].map(compactRateRow);

  fs.writeFileSync(
    CACHE_FILE,
    JSON.stringify({
      generated_at: new Date().toISOString(),
      reason,
      total_live_rates: finalRates.length,
      new_rates_this_run: NEW_RATES_THIS_RUN,
      live_rates: finalRates,
    }),
    "utf8"
  );

  const stats = fs.statSync(CACHE_FILE);

  console.log("");
  console.log("CACHE WRITE COMPLETE");
  console.log("REASON:", reason);
  console.log("TOTAL LIVE RATES:", finalRates.length);
  console.log("NEW RATES THIS RUN:", NEW_RATES_THIS_RUN);
  console.log("CACHE SIZE MB:", (stats.size / 1024 / 1024).toFixed(2));
  console.log("");
}

function flattenRates(hotels, source, checkin, checkout, fallbackCurrency, occupancy) {
  const rows = [];

  for (const hotel of hotels || []) {
    for (const room of hotel.rooms || []) {
      for (const rate of room.rates || []) {
        const rateKey = clean(rate.rateKey);
        const net = clean(rate.net || rate.sellingRate);

        if (!rateKey || !num(net)) continue;

        rows.push({
          hotel_code: clean(hotel.code),
          hotel_name: clean(hotel.name),

          destination_code: clean(hotel.destinationCode || source.destinationCode),
          country: source.country,
          city: source.city,

          latitude: clean(hotel.latitude),
          longitude: clean(hotel.longitude),

          category_name: clean(hotel.categoryName),

          room_code: clean(room.code),
          room_name: clean(room.name),

          board_code: clean(rate.boardCode),
          board_name: clean(rate.boardName),

          rate_key: rateKey,
          rate_type: clean(rate.rateType),
          rate_class: clean(rate.rateClass),

          payment_type: clean(rate.paymentType),

          net,
          selling_rate: clean(rate.sellingRate || rate.net),

          currency: clean(hotel.currency || fallbackCurrency || "GBP"),

          cancellation_policies: JSON.stringify(rate.cancellationPolicies || []),

          checkin,
          checkout,

          guests: Number(occupancy.adults || 2),
          rooms: Number(occupancy.rooms || 1),

          created_at: new Date().toISOString(),

          live_rate_ready: true,
        });
      }
    }
  }

  return rows;
}

async function hotelCodeHarvest(locations, badState) {
  console.log("");
  console.log("========================================");
  console.log("GLOBAL HOTEL-CODE HARVEST STARTING");
  console.log("========================================");
  console.log("");

  console.log("REAL GLOBAL LOCATIONS:", locations.length);
  console.log("");

  locations.slice(0, 80).forEach((location, index) => {
    console.log(`${index + 1}. ${location.country} | ${location.city} | hotels ${location.hotelCodes.length}`);
  });

  console.log("");

  for (const offset of DATE_OFFSETS) {
    for (const occupancy of OCCUPANCIES) {
      console.log("");
      console.log(`ROUND ${todayPlus(offset)} | ${occupancy.adults}A/${occupancy.rooms}R`);
      console.log("");

      for (const location of locations) {
        const locationKey = `${location.country}|${location.city}`;
        if (badState.bad_locations.has(locationKey)) continue;

        const checkin = todayPlus(offset);
        const checkout = todayPlus(offset + 1);
        const batches = chunkArray(location.hotelCodes, HOTEL_CODES_PER_REQUEST);

        for (let batchIndex = 0; batchIndex < batches.length; batchIndex += 1) {
          const batch = batches[batchIndex];
          const batchKey = `${locationKey}|${batchIndex}`;

          if (badState.bad_batches.has(batchKey)) continue;

          console.log(
            `SEARCH ${location.city}, ${location.country} | batch ${batchIndex + 1}/${batches.length} | hotels ${batch.length}`
          );

          try {
            const result = await hotelbedsPost(makeHotelCodeBody(batch, checkin, checkout, occupancy));

            const rows = flattenRates(result.hotels, location, checkin, checkout, result.currency, occupancy);
            const added = addRowsToLiveMap(rows);

            console.log(`SUCCESS ${location.country} / ${location.city} -> ${rows.length} rates (${added} new)`);

            if (added > 0) {
              writeCache(`hotel-code-${location.country}-${location.city}`);
            }
          } catch (err) {
            const status = err?.response?.status || 0;

            console.log(`FAILED ${location.city}, ${location.country}:`, status || err.message);

            if (status === 400 || status === 403) {
              badState.bad_batches.add(batchKey);
              saveBadState(badState);
            }

            if (status === 429) {
              writeCache("before-rate-limit");
              console.log(`RATE LIMITED. Waiting ${Math.round(RATE_LIMIT_BACKOFF_MS / 1000)} seconds...`);
              await sleep(RATE_LIMIT_BACKOFF_MS);
            }
          }

          await sleep(PAUSE_MS);
        }
      }
    }
  }
}

async function main() {
  console.log("");
  console.log("========================================");
  console.log("MYSPACE HOTEL GLOBAL HOTEL-CODE HARVESTER");
  console.log("========================================");
  console.log("");

  if (!HOTELBEDS_API_KEY || !HOTELBEDS_SECRET) {
    console.log("Missing Hotelbeds credentials in .env. Do not paste keys in chat.");
    process.exit(1);
  }

  loadExistingCacheIntoMap();

  const rows = loadAllRows();
  const badState = loadBadState();
  const locations = buildBalancedLocationOrder(buildHotelCodeLocations(rows, badState));

  console.log("");
  console.log(`GLOBAL LOCATIONS READY: ${locations.length}`);
  console.log(`KNOWN BAD LOCATIONS: ${badState.bad_locations.size}`);
  console.log(`KNOWN BAD BATCHES: ${badState.bad_batches.size}`);
  console.log(`DATE WINDOWS: ${DATE_OFFSETS.length}`);
  console.log(`OCCUPANCY TYPES: ${OCCUPANCIES.length}`);
  console.log(`HOTELS PER REQUEST: ${HOTEL_CODES_PER_REQUEST}`);
  console.log(`PAUSE BETWEEN REQUESTS: ${PAUSE_MS}ms`);
  console.log("");

  writeCache("startup");

  await hotelCodeHarvest(locations, badState);

  writeCache("harvest-complete");

  console.log("");
  console.log("HARVEST COMPLETE");
  console.log(`TOTAL CACHED LIVE RATES: ${LIVE_RATE_MAP.size}`);
  console.log("");
}

process.on("SIGINT", () => {
  console.log("");
  console.log("STOP REQUESTED. SAVING CACHE BEFORE EXIT...");
  writeCache("manual-stop");
  process.exit(0);
});

process.on("uncaughtException", (err) => {
  console.log("");
  console.log("UNCAUGHT ERROR:", err.message);
  writeCache("uncaught-exception");
  process.exit(1);
});

process.on("unhandledRejection", (err) => {
  console.log("");
  console.log("UNHANDLED ERROR:", err?.message || err);
  writeCache("unhandled-rejection");
  process.exit(1);
});

main();