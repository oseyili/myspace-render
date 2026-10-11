const crypto = require("crypto");
const { clean, money, number, nowISO } = require("../../../utils/text");
const { toUniversalHotel } = require("../../../models/universalHotel");
const logger = require("../../../config/logger");
const { canonicalCity, hotelMatchesRequestedLocation } = require("../../destination/rules");

const CONTENT_CACHE = new Map();

function tomorrowISO(daysAhead = 14) {
  const d = new Date(Date.now() + Number(daysAhead || 1) * 86400000);
  return d.toISOString().slice(0, 10);
}

function config() {
  const baseUrl = clean(process.env.HOTELBEDS_BASE_URL || "https://api.test.hotelbeds.com").replace(/\/$/, "");
  const apiKey = clean(process.env.HOTELBEDS_API_KEY || process.env.HOTELBEDS_KEY);
  const secret = clean(process.env.HOTELBEDS_SECRET || process.env.HOTELBEDS_API_SECRET);
  const defaultDestination = clean(process.env.HOTELBEDS_DEFAULT_DESTINATION || "").toUpperCase();
  const enabled = String(process.env.HOTELBEDS_ENABLED || "true").toLowerCase() !== "false";
  return {
    code: "HOTELBEDS",
    name: "Hotelbeds",
    enabled,
    baseUrl,
    apiKey,
    secret,
    defaultDestination,
    ready: Boolean(enabled && baseUrl && apiKey && secret)
  };
}

function signature() {
  const cfg = config();
  const timestamp = Math.floor(Date.now() / 1000);
  return crypto.createHash("sha256").update(cfg.apiKey + cfg.secret + timestamp).digest("hex");
}

function destinationCode(country, city, countryCodeOverride) {
  const wantedCountry = clean(country).toLowerCase();
  const wantedCity = clean(city).toLowerCase();

  try {
    const map = JSON.parse(process.env.HOTELBEDS_DESTINATIONS || "{}");
    const keys = [`${wantedCountry}|${wantedCity}`, wantedCity, clean(city), clean(country)];
    for (const key of keys) {
      if (map[key]) return clean(map[key]).toUpperCase();
    }
  } catch {}

  const fallback = {
    "united kingdom|london": "LON",
    london: "LON",
    "united kingdom|manchester": "MAN",
    manchester: "MAN",
    "united kingdom|birmingham": "BHX",
    birmingham: "BHX",
    "united kingdom|bristol": "BRS",
    bristol: "BRS",
    "united kingdom|leeds": "LBA",
    leeds: "LBA",
    "united kingdom|liverpool": "LPL",
    liverpool: "LPL",
    "united kingdom|edinburgh": "EDI",
    edinburgh: "EDI",
    "united kingdom|glasgow": "GLA",
    glasgow: "GLA",
    "united kingdom|cardiff": "CWL",
    cardiff: "CWL",
    "united kingdom|belfast": "BFS",
    belfast: "BFS",
    "united states|los angeles": "LAX",
    "los angeles": "LAX",
    "united states|new york": "NYC",
    "new york": "NYC",
    "france|paris": "PAR",
    paris: "PAR",
    "united arab emirates|dubai": "DXB",
    dubai: "DXB",
    "united arab emirates|abu dhabi": "AUH",
    "abu dhabi": "AUH"
  };

  const mapped = clean(fallback[`${wantedCountry}|${wantedCity}`] || fallback[wantedCity]).toUpperCase();
  if (mapped) return mapped;

  // If we have a countryCode passed directly from Orchestrator (e.g. "GB"), use that
  if (countryCodeOverride) return countryCodeOverride.toUpperCase();

  // Use default destination if no city was requested
  if (!wantedCity) return clean(config().defaultDestination).toUpperCase();

  return "";
}

function imageUrlFromHotelbedsPath(pathValue) {
  const value = clean(pathValue);
  if (!value) return "";
  if (/^https?:\/\//i.test(value)) return value;
  return `https://photos.hotelbeds.com/giata/original/${value.replace(/^\/+/, "")}`;
}

async function contentDetails(hotelCode) {
  const code = clean(hotelCode || "");
  if (!code) return {};
  if (CONTENT_CACHE.has(code)) return CONTENT_CACHE.get(code);

  try {
    const cfg = config();
    if (!cfg.ready) return {};
    const url = `${cfg.baseUrl}/hotel-content-api/1.0/hotels/${encodeURIComponent(code)}/details?language=ENG&useSecondaryLanguage=false`;
    const response = await fetch(url, {
      method: "GET",
      headers: {
        "Api-key": cfg.apiKey,
        "X-Signature": signature(),
        Accept: "application/json"
      }
    });
    if (!response.ok) {
      CONTENT_CACHE.set(code, {});
      return {};
    }
    const data = await response.json().catch(() => ({}));
    const h = data?.hotel || data || {};
    const images = Array.isArray(h?.images) ? h.images : [];
    const first = images.find((x) => clean(x?.path || x?.url || x?.imageUrl || ""));
    const image = imageUrlFromHotelbedsPath(first?.path || first?.url || first?.imageUrl || "");
    const city = clean(
      h?.city?.content ||
      h?.city ||
      h?.destinationName ||
      h?.destination?.name ||
      h?.zoneName ||
      h?.zone?.name ||
      ""
    );
    const country = clean(
      h?.country?.description?.content ||
      h?.country?.content ||
      h?.countryName ||
      h?.country?.name ||
      ""
    );
    const address = clean(
      h?.address?.content ||
      h?.address ||
      h?.addressLine ||
      [h?.street, h?.number, h?.postalCode].filter(Boolean).join(" ")
    );
    const details = { image, city, country, address };
    CONTENT_CACHE.set(code, details);
    return details;
  } catch (err) {
    CONTENT_CACHE.set(code, {});
    logger.warn(`Hotelbeds content lookup failed for ${code}: ${err.message}`);
    return {};
  }
}

function directImageUrl(hotel) {
  const image = Array.isArray(hotel?.images) && hotel.images.length ? hotel.images[0] : null;
  return imageUrlFromHotelbedsPath(image?.path || image?.url || "");
}

function bestRoom(hotel) {
  const rooms = Array.isArray(hotel?.rooms) ? hotel.rooms : [];
  const candidates = [];
  for (const room of rooms) {
    const rates = Array.isArray(room?.rates) ? room.rates : [];
    for (const rate of rates) {
      const amount = number(rate?.net || rate?.sellingRate || rate?.hotelSellingRate || rate?.amount || 0);
      if (amount > 0) candidates.push({ room, rate, amount });
    }
  }
  candidates.sort((a, b) => a.amount - b.amount);
  return candidates[0] || null;
}

function availabilityBody(criteria, destination) {
  const formatDate = (dateStr) => {
    if (!dateStr) return "";
    try {
      return new Date(dateStr).toISOString().split('T')[0];
    } catch { return ""; }
  };

  const checkIn = formatDate(criteria.checkIn || criteria.checkin || criteria.check_in || tomorrowISO(14));
  const checkOut = formatDate(criteria.checkOut || criteria.checkout || criteria.check_out || tomorrowISO(15));
  const guests = Math.max(1, Number(criteria.guests || 2));
  const rooms = Math.max(1, Number(criteria.rooms || 1));
  return {
    stay: { checkIn, checkOut },
    occupancies: [{ rooms, adults: guests, children: 0 }],
    destination: { code: destination },
    filter: { maxHotels: Math.max(1, Math.min(Number(criteria.limit || 100), 1000)) }
  };
}

function mapHotel(hotel, best, criteria, destination, details = {}) {
  const country = clean(details.country || "");
  const city = clean(details.city || "");
  const image = clean(details.image || "");
  const address = clean(details.address || "");
  const hotelCode = clean(hotel.code || hotel.id || "");
  const hotelName = clean(hotel?.name || hotel?.hotelName || "Hotel");
  const amount = money(best.amount);
  const currency = clean(best.rate?.currency || criteria.currency || "GBP").toUpperCase();
  const roomName = clean(best.room?.name || "Available room");
  const rateKey = clean(best.rate?.rateKey || "");

  return toUniversalHotel({
    hotelId: `HOTELBEDS-${hotelCode || hotelName}`,
    hotel_id: `HOTELBEDS-${hotelCode || hotelName}`,
    id: `HOTELBEDS-${hotelCode || hotelName}`,
    code: `HOTELBEDS-${hotelCode || hotelName}`,
    supplier_hotel_id: hotelCode,
    supplier_code: "HOTELBEDS",
    supplier_name: "Hotelbeds",
    name: hotelName,
    hotel_name: hotelName,
    city,
    country,
    address,
    destinationCode: destination,
    price: amount,
    convertedPrice: amount,
    displayPrice: amount,
    currency,
    displayCurrency: currency,
    availableToBook: amount > 0,
    image,
    images: image ? [image] : [],
    source: "hotelbeds_live_supplier",
    supplierLabel: "Hotelbeds live rate",
    supplier_private: {
      supplier_code: "HOTELBEDS",
      destination_code: destination,
      supplier_hotel_id: hotelCode
    },
    rooms: [{
      roomCode: clean(best.room?.code || rateKey || "STANDARD"),
      roomName,
      room_name: roomName,
      board: clean(best.rate?.boardName || best.rate?.boardCode || "Available room"),
      cancellation: "Cancellation information is shown before you complete your booking.",
      taxes: "Applicable taxes and fees are shown before you complete your booking.",
      price: amount,
      convertedPrice: amount,
      displayCurrency: currency,
      rate_source_id: rateKey || hotelCode,
      rate_source_timestamp: nowISO(),
      supplier_private: {
        supplier_code: "HOTELBEDS",
        destination_code: destination,
        rate_key: rateKey
      }
    }]
  }, criteria, "HOTELBEDS");
}

async function availabilitySearch(criteria = {}) {
  const cfg = config();
  if (!cfg.ready) {
    return { ok: false, supplier: "HOTELBEDS", configured: false, hotels: [], status: 400, message: "Hotelbeds is not configured." };
  }

  const country = clean(criteria.country || "");
  const city = clean(criteria.city || "");
  // --- FIXED: Pass criteria.countryCode to the destination lookup ---
  const destination = clean(criteria.destination || criteria.destinationCode || destinationCode(country, city, criteria.countryCode)).toUpperCase();
  
  if (!destination) {
    return { ok: false, supplier: "HOTELBEDS", hotels: [], status: 400, message: "No Hotelbeds destination code is mapped for this search." };
  }

  const body = availabilityBody(criteria, destination);
  const started = Date.now();
  const response = await fetch(`${cfg.baseUrl}/hotel-api/1.0/hotels`, {
    method: "POST",
    headers: {
      "Api-key": cfg.apiKey,
      "X-Signature": signature(),
      Accept: "application/json",
      "Content-Type": "application/json"
    },
    body: JSON.stringify(body)
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    return {
      ok: false,
      supplier: "HOTELBEDS",
      hotels: [],
      status: response.status,
      message: data?.error?.message || data?.message || "Hotelbeds availability request failed.",
      data
    };
  }

  const rawHotels = Array.isArray(data?.hotels?.hotels) ? data.hotels.hotels : [];
  const hotels = (await Promise.all(rawHotels.map(async (hotel) => {
    const best = bestRoom(hotel);
    if (!best) return null;
    const hotelName = clean(hotel?.name || hotel?.hotelName || "");
    if (!hotelName) return null;
    const details = await contentDetails(hotel.code || hotel.id || "");
    const image = directImageUrl(hotel) || details.image || "";
    const mapped = mapHotel(hotel, best, { ...criteria, country, city }, destination, { ...details, image });
    if (!hotelMatchesRequestedLocation(mapped, { country, city })) return null;
    return mapped;
  }))).filter(Boolean);

  return {
    ok: true,
    supplier: "HOTELBEDS",
    source: "hotelbeds_live_supplier",
    destination,
    count: hotels.length,
    rawCount: rawHotels.length,
    hotels,
    ms: Date.now() - started
  };
}

async function search(criteria = {}) {
  if (String(process.env.HOTELBEDS_ENABLED || "true").toLowerCase() === "false") return [];
  try {
    const result = await availabilitySearch(criteria);
    if (result.ok && Array.isArray(result.hotels)) return result.hotels;
    logger.warn(`Hotelbeds returned no modular rows: ${result.message || result.status || "unknown"}`);
    return [];
  } catch (err) {
    logger.warn(`Hotelbeds modular search failed: ${err.message}`);
    return [];
  }
}

function status() {
  const cfg = config();
  return {
    ok: true,
    supplier: "HOTELBEDS",
    configured: cfg.ready,
    enabled: cfg.enabled,
    hasApiKey: Boolean(cfg.apiKey),
    hasSecret: Boolean(cfg.secret),
    baseUrl: cfg.baseUrl,
    defaultDestination: cfg.defaultDestination,
    message: cfg.ready ? "Hotelbeds dedicated module is configured." : "Hotelbeds dedicated module is not ready."
  };
}

module.exports = {
  code: "HOTELBEDS",
  name: "Hotelbeds",
  config,
  status,
  search,
  availabilitySearch,
  destinationCode
};