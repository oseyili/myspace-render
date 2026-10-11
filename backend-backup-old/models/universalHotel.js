const crypto = require("crypto");

function clean(value) {
  return String(value ?? "").trim();
}

function norm(value) {
  return clean(value)
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function number(value) {
  const parsed = Number(String(value ?? "").replace(/[^0-9.-]/g, ""));
  return Number.isFinite(parsed) ? parsed : 0;
}

function usablePropertyName(value) {
  const name = clean(value);
  if (!name) return false;
  if (/^(hotel|property|live hotel option|hotel name unavailable|available room|taxes? and fees?|fees?|room only)\s*\d*$/i.test(name)) return false;
  if (/(test|demo|placeholder|sample|fake|dummy|example)/i.test(name)) return false;
  if (/^(standard|double|single|twin|queen|king|family|private|shared|quad|triple)\b/i.test(name)) return false;
  return true;
}

function canonicalCountry(value) {
  const n = norm(value);
  if ([
    "uk",
    "gb",
    "great britain",
    "england",
    "scotland",
    "wales",
    "northern ireland",
    "united kingdom"
  ].includes(n)) {
    return "united kingdom";
  }
  return n;
}

function canonicalCity(value, country = "") {
  const raw = clean(value);
  const n = norm(raw);
  const c = canonicalCountry(country);

  if (c === "united kingdom") {
    const londonAreas = [
      "london",
      "greater london",
      "city of london",
      "central london",
      "westminster",
      "city of westminster",
      "kensington",
      "chelsea",
      "paddington",
      "bayswater",
      "mayfair",
      "soho",
      "covent garden",
      "bloomsbury",
      "marylebone",
      "canary wharf",
      "docklands",
      "camden",
      "hammersmith",
      "fulham",
      "greenwich",
      "islington",
      "shoreditch",
      "stratford",
      "victoria",
      "king cross",
      "kings cross",
      "st pancras",
      "heathrow",
      "wembley",
      "croydon"
    ];

    if (londonAreas.some((area) => n === area || n.includes(area))) return "London";
    if (n.includes("manchester")) return "Manchester";
    if (n.includes("birmingham")) return "Birmingham";
    if (n.includes("liverpool")) return "Liverpool";
    if (n.includes("edinburgh")) return "Edinburgh";
    if (n.includes("glasgow")) return "Glasgow";
  }

  return raw
    .replace(/\s+-\s+.*/, "")
    .replace(/,.*/, "")
    .replace(/\b(city centre|city center|centre|center|downtown|central)\b/gi, "")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/\b\w/g, (m) => m.toUpperCase());
}

function firstImage(raw) {
  const candidates = [
    raw?.image,
    raw?.image_url,
    raw?.direct_image_url,
    raw?.main_image,
    raw?.photo,
    raw?.thumbnail,
    Array.isArray(raw?.images) ? raw.images[0] : "",
    Array.isArray(raw?.photos) ? raw.photos[0] : ""
  ];

  for (const item of candidates) {
    if (!item) continue;

    if (typeof item === "string" && /^https?:\/\//i.test(item)) {
      return item;
    }

    if (typeof item === "object") {
      const url = clean(item.url || item.image_url || item.path);
      if (/^https?:\/\//i.test(url)) return url;
    }
  }

  return "";
}

function priceOf(raw) {
  if (!raw || typeof raw !== "object") return 0;

  const direct = [
    raw.price,
    raw.convertedPrice,
    raw.displayPrice,
    raw.amount,
    raw.total,
    raw.nightly_rate,
    raw.rate,
    raw.minPrice,
    raw.min_price
  ];

  for (const value of direct) {
    const parsed = number(value);
    if (parsed > 0) return Number(parsed.toFixed(2));
  }

  const roomCollections = [
    raw.rooms,
    raw.rates,
    raw.roomTypes,
    raw.room_types,
    raw.offers
  ];

  let best = 0;

  for (const collection of roomCollections) {
    if (!Array.isArray(collection)) continue;

    for (const item of collection) {
      const parsed = number(
        item?.convertedPrice ??
        item?.displayPrice ??
        item?.price ??
        item?.amount ??
        item?.total ??
        item?.nightly_rate ??
        item?.rate
      );

      if (parsed > 0 && (best === 0 || parsed < best)) best = parsed;
    }
  }

  return Number(best.toFixed(2));
}

function supplierCode(raw, fallbackSupplier = "") {
  const value = clean(
    raw?.supplier_code ||
    raw?.supplierCode ||
    raw?.supplier ||
    raw?.supplier_name ||
    raw?.supplierLabel ||
    raw?.provider ||
    raw?.source ||
    raw?.supplier_private?.supplier_code ||
    fallbackSupplier ||
    "CURRENT_SUPPLIER"
  ).toUpperCase();

  if (value.includes("WEBBEDS") || value.includes("DOTW")) return "WEBBEDS";
  if (value.includes("RATEHAWK") || value.includes("WORLDOTA")) return "RATEHAWK";
  if (value.includes("HYPERGUEST")) return "HYPERGUEST";
  if (value.includes("HOTELBEDS")) return "HOTELBEDS";

  return value.replace(/[^A-Z0-9]+/g, "_").replace(/^_+|_+$/g, "") || "CURRENT_SUPPLIER";
}

function roomOf(raw, currency) {
  const collections = [
    raw?.rooms,
    raw?.rates,
    raw?.roomTypes,
    raw?.room_types,
    raw?.offers
  ];

  const candidates = [];

  for (const collection of collections) {
    if (!Array.isArray(collection)) continue;

    for (const room of collection) {
      const amount = number(
        room?.convertedPrice ??
        room?.displayPrice ??
        room?.price ??
        room?.amount ??
        room?.total ??
        room?.nightly_rate ??
        room?.rate
      );

      if (amount <= 0) continue;
      candidates.push({ room, amount });
    }
  }

  candidates.sort((a, b) => a.amount - b.amount);
  const selected = candidates[0]?.room || {};
  const fallbackPrice = priceOf(raw);
  const amount = candidates[0]?.amount || fallbackPrice;

  return {
    roomCode: clean(
      selected.roomCode ||
      selected.room_code ||
      selected.rate_id ||
      selected.rate_key ||
      selected.code ||
      "STANDARD"
    ),
    roomName: clean(
      selected.roomName ||
      selected.room_name ||
      selected.name ||
      selected.rate_name ||
      "Available room"
    ),
    board: clean(
      selected.board ||
      selected.board_name ||
      selected.rateBasisName ||
      selected.rate_name ||
      "Room only"
    ),
    price: amount || null,
    convertedPrice: amount || null,
    displayCurrency: clean(
      selected.displayCurrency ||
      selected.currency ||
      raw?.displayCurrency ||
      raw?.currency ||
      currency ||
      "GBP"
    ).toUpperCase(),
    cancellation: clean(
      selected.cancellation ||
      selected.cancellationPolicy ||
      "Cancellation details are confirmed before booking."
    ),
    taxes: clean(
      selected.taxes ||
      selected.taxesAndFees ||
      "Taxes and fees are confirmed before booking."
    ),
    rate_source_id: clean(
      selected.rate_source_id ||
      selected.rateSourceId ||
      raw?.rate_source_id ||
      raw?.rateSourceId ||
      ""
    ),
    rate_source_timestamp: clean(
      selected.rate_source_timestamp ||
      selected.rateSourceTimestamp ||
      raw?.rate_source_timestamp ||
      raw?.rateSourceTimestamp ||
      new Date().toISOString()
    ),
    source_health: amount > 0 ? "verified" : "checking"
  };
}

function toUniversalHotel(raw, query = {}, fallbackSupplier = "") {
  const price = priceOf(raw);
  const currency = clean(raw?.currency || raw?.displayCurrency || query.currency || "GBP").toUpperCase();
  const supplier_code = supplierCode(raw, fallbackSupplier);
  const room = roomOf(raw, currency);
  const rawName = clean(raw?.name || raw?.hotel_name || raw?.hotelName || raw?.property_name || "");
  const name = usablePropertyName(rawName) ? rawName : "";
  const rawCountry = clean(raw?.country || raw?.countryName || raw?.location?.country || "");
  const rawCity = clean(raw?.city || raw?.cityName || raw?.destination || raw?.location?.city || "");

  const country = rawCountry
    ? (canonicalCountry(rawCountry) === "united kingdom" ? "United Kingdom" : rawCountry)
    : clean(query.country || "");

  const city = rawCity
    ? canonicalCity(rawCity, country || query.country)
    : canonicalCity(query.city || "", country || query.country);

  const hotelId = clean(
    raw?.hotelId ||
    raw?.hotel_id ||
    raw?.id ||
    raw?.code ||
    raw?.supplier_hotel_id ||
    `${supplier_code}-${name}-${city}-${country}`
  );

  const hasPlaceholderName = /^live hotel option$/i.test(name);

  const universalHotelId = crypto
    .createHash("sha1")
    .update(
      hasPlaceholderName
        ? `${supplier_code}|${hotelId}`
        : norm(`${name}|${city}|${country}`)
    )
    .digest("hex")
    .slice(0, 20);

  const image = firstImage(raw);
  const images = Array.isArray(raw?.images)
    ? raw.images
        .map((item) => typeof item === "string" ? item : clean(item?.url || item?.image_url || item?.path))
        .filter((url) => /^https?:\/\//i.test(url))
    : (image ? [image] : []);

  return {
    hotelId,
    hotel_id: hotelId,
    universalHotelId,
    supplier_code,
    supplier_name: clean(raw?.supplier_name || raw?.supplierLabel || raw?.supplier || supplier_code),
    supplier_hotel_id: clean(
      raw?.supplier_hotel_id ||
      raw?.supplierHotelId ||
      raw?.hotelId ||
      raw?.hotel_id ||
      raw?.id ||
      raw?.code ||
      hotelId
    ),
    name,
    hotel_name: name,
    country,
    city,
    address: clean(raw?.address || raw?.location?.address || ""),
    stars: clean(raw?.stars || raw?.rating || raw?.category || ""),
    image,
    images,
    facilities: Array.isArray(raw?.facilities) ? raw.facilities.slice(0, 12) : [],
    price: price || null,
    convertedPrice: price || null,
    displayPrice: price || null,
    currency,
    displayCurrency: currency,
    availableToBook: price > 0,
    rooms: [room],
    rate_source_id: room.rate_source_id,
    rate_source_timestamp: room.rate_source_timestamp,
    source_health: price > 0 ? "verified" : "checking",
    source: clean(raw?.source || `${supplier_code.toLowerCase()}_supplier`)
  };
}

module.exports = {
  toUniversalHotel,
  priceOf,
  roomOf
};
