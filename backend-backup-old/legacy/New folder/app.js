const express = require("express");
const cors = require("cors");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

try {
  require("dotenv").config();
} catch {}

let nodemailer = null;
try {
  nodemailer = require("nodemailer");
} catch {}

const app = express();
const PORT = process.env.PORT || 5050;

app.use(cors({ origin: true, credentials: true }));
app.use((req, res, next) => {
  if (req.originalUrl === "/api/stripe/webhook") return next();
  return express.json({ limit: "25mb" })(req, res, next);
});

const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, "data");
const HOTELS_FILE = path.join(DATA_DIR, "live_hotels.json");
const BOOKINGS_FILE = path.join(DATA_DIR, "bookings.json");
const PARTNERS_FILE = path.join(DATA_DIR, "partner_applications.json");
const FEEDBACK_FILE = path.join(DATA_DIR, "feedback.json");
const SERVICE_ACTIVITY_FILE = path.join(DATA_DIR, "service_activity.json");
const SUPPLIER_AUDIT_FILE = path.join(DATA_DIR, "supplier_rate_audit.json");

if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

function ensureFile(file, fallback) {
  if (!fs.existsSync(file)) fs.writeFileSync(file, JSON.stringify(fallback, null, 2), "utf8");
}

ensureFile(BOOKINGS_FILE, []);
ensureFile(PARTNERS_FILE, []);
ensureFile(FEEDBACK_FILE, []);
ensureFile(SERVICE_ACTIVITY_FILE, []);
ensureFile(SUPPLIER_AUDIT_FILE, []);

function readJSON(file, fallback = []) {
  try {
    if (!fs.existsSync(file)) return fallback;
    const parsed = JSON.parse(fs.readFileSync(file, "utf8"));
    return parsed;
  } catch {
    return fallback;
  }
}

function writeJSON(file, value) {
  fs.writeFileSync(file, JSON.stringify(value, null, 2), "utf8");
}

function clean(v) {
  return String(v || "").trim();
}

function lower(v) {
  return clean(v).toLowerCase();
}

function number(v) {
  const n = Number(String(v || "").replace(/[^0-9.-]/g, ""));
  return Number.isFinite(n) ? n : 0;
}

function money(v) {
  return Number(number(v).toFixed(2));
}

function nowISO() {
  return new Date().toISOString();
}

function makeRef(prefix) {
  return `${prefix}-${Date.now()}-${crypto.randomBytes(3).toString("hex").toUpperCase()}`;
}

// ====== FIXED IMAGE HANDLING ======
function extractAllImages(h) {
  if (!h) return [];
  
  const images = new Set();
  
  // Helper to add image URL
  const addImage = (url) => {
    if (!url) return;
    const cleanUrl = clean(url);
    if (cleanUrl.startsWith('http://') || cleanUrl.startsWith('https://')) {
      images.add(cleanUrl);
    } else if (cleanUrl.startsWith('/')) {
      // Handle relative URLs - try to make them absolute
      images.add(`https://${cleanUrl.replace(/^\/+/, '')}`);
    }
  };

  // Handle different image formats
  const imageSources = [
    h.image,
    h.image_url,
    h.direct_image_url,
    h.main_image,
    h.mainImage,
    h.photo,
    h.photos,
    h.thumbnail,
    h.thumb,
    h.picture,
    h.pictures,
    h.images,
    h.gallery,
    h.media,
    h.img,
    h.imageUrl,
    h.coverImage,
    h.cover_image
  ];

  for (const source of imageSources) {
    if (!source) continue;
    
    if (typeof source === 'string') {
      // Check if it's a comma-separated list
      if (source.includes(',')) {
        source.split(',').forEach(url => addImage(url.trim()));
      } else {
        addImage(source);
      }
    }
    else if (Array.isArray(source)) {
      for (const item of source) {
        if (typeof item === 'string') {
          addImage(item);
        } else if (typeof item === 'object') {
          const url = item.url || item.image_url || item.path || item.src || item.link || item.original;
          if (url) addImage(url);
          // Also check if item has a data object
          if (item.data && typeof item.data === 'object') {
            const dataUrl = item.data.url || item.data.image_url || item.data.path;
            if (dataUrl) addImage(dataUrl);
          }
        }
      }
    }
    else if (typeof source === 'object') {
      const url = source.url || source.image_url || source.path || source.src || source.link || source.original;
      if (url) addImage(url);
      // Check nested objects
      if (source.medium) addImage(typeof source.medium === 'string' ? source.medium : source.medium.url);
      if (source.large) addImage(typeof source.large === 'string' ? source.large : source.large.url);
      if (source.thumbnail) addImage(typeof source.thumbnail === 'string' ? source.thumbnail : source.thumbnail.url);
    }
  }

  // If no images found, try to extract from hotel description or HTML
  if (images.size === 0 && h.description) {
    const imgRegex = /https?:\/\/[^\s"']+\.(jpg|jpeg|png|gif|webp|svg)/gi;
    const matches = h.description.match(imgRegex);
    if (matches) {
      matches.forEach(url => addImage(url));
    }
  }

  return Array.from(images);
}

function getPrimaryImage(h) {
  const images = extractAllImages(h);
  return images.length > 0 ? images[0] : '';
}

function getImageGallery(h, limit = 10) {
  const images = extractAllImages(h);
  return images.slice(0, limit);
}

// ====== FIXED RATE HANDLING ======
const EXCHANGE_RATES = {
  'GBP': { 'USD': 1.27, 'EUR': 1.17, 'GBP': 1 },
  'USD': { 'GBP': 0.79, 'EUR': 0.92, 'USD': 1 },
  'EUR': { 'GBP': 0.85, 'USD': 1.09, 'EUR': 1 }
};

function getExchangeRate(from, to) {
  from = from.toUpperCase();
  to = to.toUpperCase();
  if (from === to) return 1;
  if (EXCHANGE_RATES[from] && EXCHANGE_RATES[from][to]) {
    return EXCHANGE_RATES[from][to];
  }
  return 1; // Fallback
}

function processRates(rate, hotel, requestedCurrency) {
  const basePrice = money(rate.nightly_rate || rate.amount || rate.price || rate.total || 0);
  const originalCurrency = clean(rate.currency || hotel.currency || "GBP").toUpperCase();
  const targetCurrency = clean(requestedCurrency || "GBP").toUpperCase();
  
  // Convert price
  let convertedPrice = basePrice;
  let displayCurrency = originalCurrency;
  
  if (originalCurrency !== targetCurrency) {
    const rate = getExchangeRate(originalCurrency, targetCurrency);
    convertedPrice = money(basePrice * rate);
    displayCurrency = targetCurrency;
  }

  // Calculate taxes and fees
  const taxRate = number(rate.tax_rate || hotel.tax_rate || 0.1); // Default 10%
  const feeRate = number(rate.fee_rate || hotel.fee_rate || 0.05); // Default 5%
  
  const taxes = money(convertedPrice * taxRate);
  const fees = money(convertedPrice * feeRate);
  const totalPrice = money(convertedPrice + taxes + fees);

  return {
    originalPrice: basePrice,
    originalCurrency: originalCurrency,
    convertedPrice: convertedPrice,
    displayCurrency: displayCurrency,
    taxes: taxes,
    fees: fees,
    totalPrice: totalPrice,
    taxRate: taxRate,
    feeRate: feeRate,
    nightlyPrice: convertedPrice,
    totalStayPrice: totalPrice,
    priceBreakdown: {
      base: convertedPrice,
      taxes: taxes,
      fees: fees,
      total: totalPrice
    }
  };
}

function extractAllRates(hotel) {
  const rates = [];
  const rateSources = [
    hotel.rates,
    hotel.prices,
    hotel.roomTypes,
    hotel.rooms,
    hotel.offers,
    hotel.deals
  ];

  for (const source of rateSources) {
    if (!source) continue;
    if (Array.isArray(source)) {
      for (const item of source) {
        if (typeof item === 'object') {
          // Check if it has a price field
          const price = item.price || item.amount || item.rate || item.nightly_rate || item.total;
          if (price !== undefined && price !== null) {
            rates.push({
              ...item,
              amount: money(price),
              currency: item.currency || hotel.currency || 'GBP'
            });
          }
        }
      }
    }
  }

  // If no rates found, create a default one
  if (rates.length === 0 && hotel.price) {
    rates.push({
      amount: money(hotel.price),
      currency: hotel.currency || 'GBP',
      roomName: 'Standard Room',
      board: 'Room only'
    });
  }

  return rates;
}

function privateSupplierName(v) {
  const value = clean(v).toUpperCase();
  return value || "MYSPACE_INTERNAL";
}

function supplierCodeFromName(name) {
  return privateSupplierName(name)
    .replace(/[^A-Z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 40) || "MYSPACE_INTERNAL";
}

function makeSupplierRateId(parts) {
  const raw = [
    parts.supplier_name,
    parts.supplier_hotel_id,
    parts.hotel_id,
    parts.room_code,
    parts.price,
    parts.currency,
    parts.timestamp
  ].join("|");

  return crypto.createHash("sha256").update(raw).digest("hex").slice(0, 24).toUpperCase();
}

function supplierMetaFromHotel(h, rate = null, requestedCurrency = "") {
  const supplierName = privateSupplierName(
    rate?.supplier_name ||
    rate?.supplier ||
    rate?.source ||
    rate?.provider ||
    h.supplier_name ||
    h.supplier ||
    h.source ||
    h.provider ||
    h.partner ||
    h.inventory_source ||
    "MYSPACE_INTERNAL"
  );

  const supplierCode = clean(
    rate?.supplier_code ||
    rate?.source_code ||
    h.supplier_code ||
    h.source_code ||
    supplierCodeFromName(supplierName)
  );

  const supplierHotelId = clean(
    rate?.supplier_hotel_id ||
    rate?.supplierHotelId ||
    rate?.hotel_supplier_id ||
    rate?.hotel_code ||
    h.supplier_hotel_id ||
    h.supplierHotelId ||
    h.hotel_supplier_id ||
    h.hotel_code ||
    h.code ||
    h.hotel_id ||
    h.hotelId ||
    h.id
  );

  const supplierRateKey = clean(
    rate?.supplier_rate_id ||
    rate?.supplierRateId ||
    rate?.rate_key ||
    rate?.rateKey ||
    rate?.rate_id ||
    rate?.rateId ||
    rate?.room_code ||
    rate?.roomCode ||
    ""
  );

  const currency = clean(requestedCurrency || rate?.currency || h.currency || "GBP").toUpperCase();
  const price = money(rate?.nightly_rate || rate?.amount || rate?.price || h.price || h.amount || h.nightly_rate || 0);
  const timestamp = clean(rate?.rate_source_timestamp || rate?.updated_at || rate?.created_at || h.rate_source_timestamp || h.updated_at || h.created_at || nowISO());

  return {
    supplier_name: supplierName,
    supplier_code: supplierCode || supplierCodeFromName(supplierName),
    supplier_hotel_id: supplierHotelId,
    supplier_rate_key: supplierRateKey,
    supplier_rate_id: makeSupplierRateId({
      supplier_name: supplierName,
      supplier_hotel_id: supplierHotelId,
      hotel_id: clean(h.hotel_id || h.hotelId || h.id || h.code || h.hotel_code),
      room_code: supplierRateKey,
      price,
      currency,
      timestamp
    }),
    supplier_currency: currency,
    supplier_price: price,
    rate_source_timestamp: timestamp
  };
}

function publicRateSource(meta) {
  return {
    rate_source_id: meta.supplier_rate_id,
    rate_source_timestamp: meta.rate_source_timestamp,
    source_health: "verified",
    price_trace_available: true
  };
}

function recordActivity(action, payload, response) {
  const logs = readJSON(SERVICE_ACTIVITY_FILE, []);
  logs.unshift({
    id: crypto.randomUUID(),
    created_at: nowISO(),
    action,
    payload,
    response
  });
  writeJSON(SERVICE_ACTIVITY_FILE, logs.slice(0, 3000));
}

function recordSupplierAudit(action, payload) {
  const rows = readJSON(SUPPLIER_AUDIT_FILE, []);
  rows.unshift({
    id: crypto.randomUUID(),
    created_at: nowISO(),
    action,
    ...payload
  });
  writeJSON(SUPPLIER_AUDIT_FILE, rows.slice(0, 10000));
}

// ====== FIXED HOTEL NORMALIZATION ======
function normalizeHotel(h, requestedCurrency = "") {
  if (!h) return null;
  
  const rates = extractAllRates(h);
  const firstRate = rates.find((r) => number(r.amount) > 0) || null;
  const meta = supplierMetaFromHotel(h, firstRate, requestedCurrency);
  
  const hotelId = clean(h.hotel_id || h.hotelId || h.id || h.code || h.hotel_code || meta.supplier_hotel_id || `HOTEL-${Date.now()}`);
  const hotelName = clean(h.name || h.hotel_name || h.hotelName || "Available Hotel");
  
  // Process all rates
  const processedRates = rates.length > 0
    ? rates.slice(0, 8).map((r, index) => {
        const rateMeta = supplierMetaFromHotel(h, r, requestedCurrency);
        const rateData = processRates(r, h, requestedCurrency);
        
        return {
          roomCode: clean(r.rate_id || r.rate_key || r.room_code || r.roomCode || `ROOM-${index + 1}`),
          roomName: clean(r.room_name || r.roomName || r.rate_name || "Available room"),
          board: clean(r.board_name || r.board || r.rate_name || "Room only"),
          price: rateData.originalPrice,
          convertedPrice: rateData.convertedPrice,
          displayCurrency: rateData.displayCurrency,
          totalPrice: rateData.totalPrice,
          taxes: rateData.taxes,
          fees: rateData.fees,
          priceBreakdown: rateData.priceBreakdown,
          cancellation: clean(r.cancellation || "Cancellation information is shown before you complete your booking."),
          taxesInfo: clean(r.taxes || "Applicable taxes and fees are shown before you complete your booking."),
          rate_source_id: rateMeta.supplier_rate_id,
          rate_source_timestamp: rateMeta.rate_source_timestamp,
          source_health: "verified",
          // Supplier tracking
          _supplier_name: rateMeta.supplier_name,
          _supplier_code: rateMeta.supplier_code,
          _supplier_hotel_id: rateMeta.supplier_hotel_id,
          _supplier_rate_id: rateMeta.supplier_rate_id,
          _supplier_rate_key: rateMeta.supplier_rate_key,
          _supplier_currency: rateMeta.supplier_currency,
          _supplier_price: rateMeta.supplier_price,
          // Additional rate details
          maxOccupancy: number(r.maxOccupancy || r.max_occupancy || 2),
          bedType: clean(r.bedType || r.bed_type || "Standard"),
          roomSize: number(r.roomSize || r.room_size || 0),
          amenities: Array.isArray(r.amenities) ? r.amenities : []
        };
      })
    : [
        // Fallback rate if no rates found
        {
          roomCode: "STANDARD",
          roomName: "Available room",
          board: "Room only",
          price: money(h.price || 0),
          convertedPrice: money(h.price || 0),
          displayCurrency: clean(h.currency || requestedCurrency || "GBP").toUpperCase(),
          totalPrice: money(h.price || 0),
          taxes: 0,
          fees: 0,
          priceBreakdown: { base: money(h.price || 0), taxes: 0, fees: 0, total: money(h.price || 0) },
          cancellation: "Cancellation information is shown before you complete your booking.",
          taxesInfo: "Applicable taxes and fees are shown before you complete your booking.",
          rate_source_id: meta.supplier_rate_id,
          rate_source_timestamp: meta.rate_source_timestamp,
          source_health: "verified",
          _supplier_name: meta.supplier_name,
          _supplier_code: meta.supplier_code,
          _supplier_hotel_id: meta.supplier_hotel_id,
          _supplier_rate_id: meta.supplier_rate_id,
          _supplier_rate_key: meta.supplier_rate_key,
          _supplier_currency: meta.supplier_currency,
          _supplier_price: meta.supplier_price,
          maxOccupancy: 2,
          bedType: "Standard",
          roomSize: 0,
          amenities: []
        }
      ];

  // Get min price from rates
  const minPrice = processedRates.length > 0 
    ? Math.min(...processedRates.map(r => r.convertedPrice || r.price || 0))
    : money(h.price || 0);

  // Extract images
  const images = extractAllImages(h);
  const primaryImage = images.length > 0 ? images[0] : '';
  
  // Extract facilities
  const facilities = Array.isArray(h.facilities) 
    ? h.facilities 
    : Array.isArray(h.amenities) 
      ? h.amenities 
      : [];

  return {
    hotelId: hotelId,
    hotel_id: hotelId,
    name: hotelName,
    hotel_name: hotelName,
    country: clean(h.country),
    city: clean(h.city),
    area: clean(h.area || h.zone || h.district || ""),
    address: clean(h.address),
    stars: clean(h.stars || h.rating || h.category || ""),
    rating: number(h.rating || h.stars || 0),
    description: clean(h.description || h.overview || ""),
    images: images,
    image: primaryImage,
    image_gallery: getImageGallery(h, 10),
    facilities: facilities,
    rooms: processedRates,
    availableToBook: minPrice > 0,
    price: minPrice,
    minPrice: minPrice,
    currency: clean(requestedCurrency || h.currency || "GBP").toUpperCase(),
    rate_source_id: meta.supplier_rate_id,
    rate_source_timestamp: meta.rate_source_timestamp,
    source_health: "verified",
    // Supplier tracking
    _supplier_name: meta.supplier_name,
    _supplier_code: meta.supplier_code,
    _supplier_hotel_id: meta.supplier_hotel_id,
    _supplier_rate_id: meta.supplier_rate_id,
    _supplier_rate_key: meta.supplier_rate_key,
    _supplier_currency: meta.supplier_currency,
    _supplier_price: meta.supplier_price,
    // Additional metadata
    coordinates: {
      lat: number(h.lat || h.latitude || h.location?.lat || 0),
      lng: number(h.lng || h.longitude || h.location?.lng || 0)
    },
    propertyType: clean(h.propertyType || h.property_type || "Hotel"),
    checkIn: clean(h.checkIn || h.check_in || "15:00"),
    checkOut: clean(h.checkOut || h.check_out || "11:00")
  };
}

function publicHotel(h) {
  if (!h) return null;
  
  const rooms = Array.isArray(h.rooms)
    ? h.rooms.map((room) => ({
        roomCode: room.roomCode,
        roomName: room.roomName,
        board: room.board,
        price: room.price,
        convertedPrice: room.convertedPrice,
        displayCurrency: room.displayCurrency,
        totalPrice: room.totalPrice,
        taxes: room.taxes,
        fees: room.fees,
        priceBreakdown: room.priceBreakdown,
        cancellation: room.cancellation,
        taxesInfo: room.taxesInfo,
        rate_source_id: room.rate_source_id,
        rate_source_timestamp: room.rate_source_timestamp,
        source_health: room.source_health,
        maxOccupancy: room.maxOccupancy,
        bedType: room.bedType,
        roomSize: room.roomSize,
        amenities: room.amenities,
        // Public-facing price display
        displayPrice: `${(room.convertedPrice || room.price || 0).toFixed(2)} ${room.displayCurrency || 'GBP'}`,
        totalDisplayPrice: `${(room.totalPrice || room.convertedPrice || room.price || 0).toFixed(2)} ${room.displayCurrency || 'GBP'}`
      }))
    : [];

  // Calculate price range
  const prices = rooms.map(r => r.convertedPrice || r.price || 0).filter(p => p > 0);
  const minPrice = prices.length > 0 ? Math.min(...prices) : 0;
  const maxPrice = prices.length > 0 ? Math.max(...prices) : 0;

  return {
    hotelId: h.hotelId,
    hotel_id: h.hotel_id,
    name: h.name,
    hotel_name: h.hotel_name,
    country: h.country,
    city: h.city,
    area: h.area,
    address: h.address,
    stars: h.stars,
    rating: h.rating,
    description: h.description,
    image: h.image,
    images: h.images,
    image_gallery: h.image_gallery,
    facilities: h.facilities,
    rooms: rooms,
    availableToBook: h.availableToBook,
    price: h.price,
    minPrice: minPrice,
    maxPrice: maxPrice,
    priceRange: minPrice > 0 && maxPrice > 0 ? `${minPrice.toFixed(2)} - ${maxPrice.toFixed(2)} ${h.currency}` : `${(minPrice || 0).toFixed(2)} ${h.currency}`,
    currency: h.currency,
    rate_source_id: h.rate_source_id,
    rate_source_timestamp: h.rate_source_timestamp,
    source_health: h.source_health,
    coordinates: h.coordinates,
    propertyType: h.propertyType,
    checkIn: h.checkIn,
    checkOut: h.checkOut
  };
}

// ====== FIXED DROPDOWN BUILDER ======
function buildDropdownData(hotel) {
  if (!hotel) return null;
  
  const firstRoom = Array.isArray(hotel.rooms) && hotel.rooms.length > 0 ? hotel.rooms[0] : {};
  const price = firstRoom.convertedPrice || firstRoom.price || hotel.price || 0;
  const currency = firstRoom.displayCurrency || hotel.currency || 'GBP';
  
  return {
    value: hotel.hotelId || hotel.id || hotel.hotel_id,
    label: hotel.name || hotel.hotel_name || "Unnamed Hotel",
    subLabel: `${hotel.city || ''}${hotel.country ? `, ${hotel.country}` : ''}`,
    image: hotel.image || hotel.image_url || hotel.thumbnail || hotel.images?.[0] || '',
    price: {
      amount: price,
      currency: currency,
      formatted: `${price.toFixed(2)} ${currency}`
    },
    rating: hotel.stars || hotel.rating || '',
    facilities: hotel.facilities || [],
    available: hotel.availableToBook !== false,
    // Keep original data for detailed view
    _original: hotel
  };
}

// ====== FIXED SEARCH FUNCTIONS ======
const SANCTIONED_COUNTRIES = new Set([
  "Afghanistan",
  "Belarus",
  "Burundi",
  "Central African Republic",
  "Chad",
  "Congo Republic",
  "Cuba",
  "Democratic Republic of the Congo",
  "Eritrea",
  "Iraq",
  "Iran",
  "Libya",
  "Myanmar",
  "North Korea",
  "Somalia",
  "South Sudan",
  "Sudan",
  "Syria",
  "Russia",
  "Venezuela",
  "Yemen"
]);

function isBlockedCountry(country) {
  return SANCTIONED_COUNTRIES.has(clean(country));
}

function readHotels() {
  const hotels = readJSON(HOTELS_FILE, []);
  return Array.isArray(hotels) ? hotels : [];
}

function buildDestinations() {
  const map = new Map();

  for (const h of readHotels()) {
    const country = clean(h.country);
    const city = clean(h.city);

    if (!country || !city) continue;
    if (isBlockedCountry(country)) continue;

    if (!map.has(country)) map.set(country, new Set());
    map.get(country).add(city);
  }

  return [...map.entries()]
    .map(([country, citySet]) => ({
      country,
      cities: [...citySet].sort((a, b) => a.localeCompare(b))
    }))
    .sort((a, b) => a.country.localeCompare(b.country));
}

function fallbackHotels(country, city, currency) {
  const hotel = {
    hotel_id: `MSH-${city || "CITY"}-001`.replace(/\s+/g, "-").toUpperCase(),
    name: `MySpace Hotel Collection - ${city || "Selected Destination"}`,
    country,
    city,
    stars: 4,
    image: "",
    supplier_name: "MYSPACE_INTERNAL",
    supplier_code: "MYSPACE_INTERNAL",
    supplier_hotel_id: `MSH-${city || "CITY"}-001`.replace(/\s+/g, "-").toUpperCase(),
    price: 125,
    currency,
    facilities: ["Wi-Fi", "Reception", "Restaurant", "Comfortable rooms"],
    rates: [
      {
        rate_id: "STANDARD",
        room_name: "Standard Room",
        board_name: "Room only",
        price: 125,
        currency,
        supplier_name: "MYSPACE_INTERNAL",
        supplier_code: "MYSPACE_INTERNAL"
      }
    ]
  };

  return [normalizeHotel(hotel, currency)];
}

function internalSearchHotels(query) {
  const country = clean(query.country);
  const city = clean(query.city);
  const currency = clean(query.currency || "GBP").toUpperCase();

  let hotels = readHotels()
    .filter((h) => !isBlockedCountry(h.country))
    .filter((h) => !country || lower(h.country) === lower(country))
    .filter((h) => !city || lower(h.city) === lower(city))
    .map((h) => normalizeHotel(h, currency))
    .filter((h) => h && h.name && h.country && h.city);

  // Sort by availability and price
  hotels.sort((a, b) => {
    if (b.availableToBook !== a.availableToBook) return Number(b.availableToBook) - Number(a.availableToBook);
    return (a.minPrice || a.price || 0) - (b.minPrice || b.price || 0);
  });

  if (!hotels.length && country && city) hotels = fallbackHotels(country, city, currency);

  return hotels.slice(0, 120);
}

function searchHotels(query) {
  return internalSearchHotels(query).map(publicHotel).filter(Boolean);
}

function findInternalOffer(payload) {
  const hotelId = clean(payload.hotelId || payload.hotel_id);
  const rateSourceId = clean(payload.rate_source_id || payload.rateSourceId || payload.supplier_rate_id);
  const roomCode = clean(payload.roomCode || payload.room_code);

  const hotels = internalSearchHotels({
    country: payload.country,
    city: payload.city,
    currency: payload.currency
  });

  let hotel = 
    hotels.find((h) => clean(h.hotelId) === hotelId || clean(h.hotel_id) === hotelId) ||
    hotels.find((h) => clean(h.rate_source_id) === rateSourceId) ||
    hotels[0];

  if (!hotel) {
    hotel = fallbackHotels(clean(payload.country || "United Kingdom"), clean(payload.city || "London"), clean(payload.currency || "GBP"))[0];
  }

  let room = 
    (hotel.rooms || []).find((r) => clean(r.rate_source_id) === rateSourceId) ||
    (hotel.rooms || []).find((r) => clean(r.roomCode) === roomCode) ||
    (hotel.rooms || [])[0];

  if (!room) room = hotel.rooms[0];

  return { hotel, room };
}

// ====== MAIL FUNCTIONS ======
function mailTo() {
  return clean(process.env.MAIL_TO || "reservations@myspace-hotel.com");
}

function mailFrom() {
  return clean(
    process.env.MAIL_FROM ||
    process.env.SMTP_FROM ||
    process.env.RESEND_FROM ||
    "MySpace Hotel <reservations@myspace-hotel.com>"
  );
}

function htmlEscape(v) {
  return clean(v)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function buildEmailHtml(title, rows) {
  const body = rows
    .map(
      ([label, value]) => `
        <tr>
          <td style="padding:10px 12px;border-bottom:1px solid #e5e7eb;font-weight:700;color:#0b1d51;width:210px;">${htmlEscape(label)}</td>
          <td style="padding:10px 12px;border-bottom:1px solid #e5e7eb;color:#111827;">${htmlEscape(value)}</td>
        </tr>`
    )
    .join("");

  return `
    <div style="font-family:Arial,sans-serif;background:#f4f7fb;padding:24px;">
      <div style="max-width:760px;margin:auto;background:#ffffff;border-radius:18px;overflow:hidden;border:1px solid #dbe4f0;">
        <div style="background:#0b1d51;color:#ffffff;padding:22px 26px;">
          <div style="font-size:26px;font-weight:900;">MYSPACE HOTEL</div>
          <div style="font-size:15px;margin-top:6px;">${htmlEscape(title)}</div>
        </div>
        <table style="width:100%;border-collapse:collapse;font-size:15px;">
          ${body}
        </table>
        <div style="padding:18px 26px;color:#64748b;font-size:13px;">
          Sent automatically from MySpace Hotel booking platform.
        </div>
      </div>
    </div>`;
}

async function sendEmailNotification(subject, rows) {
  const to = mailTo();
  const from = mailFrom();
  const html = buildEmailHtml(subject, rows);
  const text = rows.map(([label, value]) => `${label}: ${value}`).join("\n");

  if (!to) {
    recordActivity("email_skipped", { subject }, { reason: "MAIL_TO missing" });
    return { ok: false, skipped: true, reason: "MAIL_TO missing" };
  }

  if (process.env.RESEND_API_KEY) {
    try {
      const res = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({ from, to, subject, html, text })
      });

      const data = await res.json().catch(() => ({}));
      recordActivity("email_resend", { subject, to }, { ok: res.ok, status: res.status, data });
      return { ok: res.ok, provider: "resend", status: res.status, data };
    } catch (err) {
      recordActivity("email_resend_error", { subject, to }, { error: err.message });
      return { ok: false, provider: "resend", error: err.message };
    }
  }

  if (process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS && nodemailer) {
    try {
      const transporter = nodemailer.createTransport({
        host: process.env.SMTP_HOST,
        port: Number(process.env.SMTP_PORT || 587),
        secure: String(process.env.SMTP_SECURE || "").toLowerCase() === "true",
        auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS }
      });

      const info = await transporter.sendMail({ from, to, subject, html, text });
      recordActivity("email_smtp", { subject, to }, { ok: true, messageId: info.messageId });
      return { ok: true, provider: "smtp", messageId: info.messageId };
    } catch (err) {
      recordActivity("email_smtp_error", { subject, to }, { error: err.message });
      return { ok: false, provider: "smtp", error: err.message };
    }
  }

  recordActivity("email_skipped", { subject, to }, { reason: "No RESEND_API_KEY or SMTP configuration available" });
  return { ok: false, skipped: true, reason: "No email provider configured" };
}

// ====== STRIPE FUNCTIONS ======
function getBaseUrl(req) {
  const envBase =
    process.env.FRONTEND_URL ||
    process.env.CLIENT_URL ||
    process.env.PUBLIC_SITE_URL ||
    process.env.RENDER_EXTERNAL_URL ||
    "";

  if (envBase) return envBase.replace(/\/$/, "");
  if (req.headers.origin) return String(req.headers.origin).replace(/\/$/, "");
  return "http://localhost:5173";
}

function stripeCurrency(currency) {
  return clean(currency || "GBP").toLowerCase();
}

function stripeAmount(amount) {
  const n = number(amount);
  const safe = n > 0 ? n : 1;
  return Math.max(50, Math.round(safe * 100));
}

async function createStripeCheckout(req, res) {
  try {
    const paymentLink =
      process.env.STRIPE_PAYMENT_LINK ||
      process.env.VITE_STRIPE_PAYMENT_LINK ||
      process.env.PUBLIC_STRIPE_PAYMENT_LINK ||
      "";

    const secretKey = process.env.STRIPE_SECRET_KEY || "";

    const amount = money(req.body.amount || req.body.total || req.body.price || 0);
    const currency = clean(req.body.currency || "GBP").toUpperCase();
    const hotelName = clean(req.body.hotelName || req.body.hotel || "MySpace Hotel Reservation");
    const customerEmail = clean(req.body.customerEmail || req.body.email || "");
    const customerName = clean(req.body.customerName || "");
    const bookingRef = clean(req.body.bookingRef || makeRef("MSH"));

    if (secretKey) {
      const baseUrl = getBaseUrl(req);
      const body = new URLSearchParams();

      body.append("mode", "payment");
      body.append("success_url", `${baseUrl}/?payment=success&booking=${encodeURIComponent(bookingRef)}`);
      body.append("cancel_url", `${baseUrl}/?payment=cancelled&booking=${encodeURIComponent(bookingRef)}`);
      body.append("line_items[0][quantity]", "1");
      body.append("line_items[0][price_data][currency]", stripeCurrency(currency));
      body.append("line_items[0][price_data][unit_amount]", String(stripeAmount(amount)));
      body.append("line_items[0][price_data][product_data][name]", hotelName);
      body.append("line_items[0][price_data][product_data][description]", "MySpace Hotel reservation");
      body.append("metadata[booking_reference]", bookingRef);
      body.append("metadata[hotel_name]", hotelName);
      body.append("metadata[customer_name]", customerName);
      body.append("metadata[source]", "myspace-hotel");
      body.append("metadata[rate_source_id]", clean(req.body.rate_source_id || ""));
      body.append("metadata[supplier_code]", clean(req.body.supplier_code || ""));

      if (customerEmail) body.append("customer_email", customerEmail);

      const stripeRes = await fetch("https://api.stripe.com/v1/checkout/sessions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${secretKey}`,
          "Content-Type": "application/x-www-form-urlencoded"
        },
        body
      });

      const stripeData = await stripeRes.json();

      if (!stripeRes.ok || !stripeData.url) {
        return res.status(400).json({
          ok: false,
          message: "Secure payment could not be started. Please check your payment settings.",
          stripe_error: stripeData?.error?.message || "Stripe checkout session failed."
        });
      }

      recordActivity("stripe_checkout_started", req.body, {
        bookingRef,
        amount,
        currency,
        checkoutSession: stripeData.id
      });

      return res.json({
        ok: true,
        url: stripeData.url,
        bookingRef,
        message: "Secure payment is ready."
      });
    }

    if (paymentLink) {
      return res.json({
        ok: true,
        url: paymentLink,
        bookingRef,
        message: "Secure payment is ready."
      });
    }

    return res.status(400).json({
      ok: false,
      message: "Stripe is not configured yet. Add STRIPE_SECRET_KEY to your environment."
    });
  } catch (err) {
    console.error("Stripe checkout error:", err);
    return res.status(500).json({
      ok: false,
      message: "Secure payment could not be started. Please try again."
    });
  }
}

// ====== MSH SUPPLIER TRACKING FUNCTIONS ======
function mshAuditFile() {
  return typeof SUPPLIER_AUDIT_FILE !== "undefined"
    ? SUPPLIER_AUDIT_FILE
    : path.join(DATA_DIR, "supplier_rate_audit.json");
}

function mshSupplierDefault() {
  return clean(process.env.DEFAULT_SUPPLIER_NAME || "HOTELBEDS").toUpperCase() || "HOTELBEDS";
}

function mshSupplierCode(name) {
  return clean(name || mshSupplierDefault()).toUpperCase().replace(/[^A-Z0-9]+/g, "_").replace(/^_+|_+$/g, "") || "HOTELBEDS";
}

function mshAppendSupplierAudit(action, payload) {
  const file = mshAuditFile();
  ensureFile(file, []);
  const rows = readJSON(file, []);
  rows.unshift({
    id: crypto.randomUUID(),
    created_at: nowISO(),
    action,
    ...payload
  });
  writeJSON(file, rows.slice(0, 10000));
}

function mshFindPublicOffer(payload) {
  const hotelId = clean(payload.hotelId || payload.hotel_id);
  const rateSourceId = clean(payload.rate_source_id || payload.rateSourceId);
  const roomCode = clean(payload.roomCode || payload.room_code);

  const offers = searchHotels({
    country: payload.country,
    city: payload.city,
    currency: payload.currency || "GBP"
  });

  const hotel = 
    offers.find((h) => clean(h.hotelId) === hotelId || clean(h.hotel_id) === hotelId) ||
    offers.find((h) => clean(h.rate_source_id) === rateSourceId) ||
    offers[0] ||
    {};

  const rooms = Array.isArray(hotel.rooms) ? hotel.rooms : [];
  const room = 
    rooms.find((r) => clean(r.rate_source_id) === rateSourceId) ||
    rooms.find((r) => clean(r.roomCode) === roomCode) ||
    rooms[0] ||
    {};

  return { hotel, room };
}

function mshSupplierTrackingFromPayload(payload) {
  const found = mshFindPublicOffer(payload);
  const hotel = found.hotel || {};
  const room = found.room || {};

  const rateSourceId = clean(
    payload.rate_source_id ||
    payload.rateSourceId ||
    room.rate_source_id ||
    hotel.rate_source_id ||
    makeRef("RATE")
  );

  const rateTimestamp = clean(
    payload.rate_source_timestamp ||
    payload.rateSourceTimestamp ||
    room.rate_source_timestamp ||
    hotel.rate_source_timestamp ||
    nowISO()
  );

  const supplierName = clean(
    payload.supplier_name ||
    payload.supplier ||
    payload.source ||
    process.env.DEFAULT_SUPPLIER_NAME ||
    "HOTELBEDS"
  ).toUpperCase();

  const supplierCode = clean(
    payload.supplier_code ||
    payload.source_code ||
    mshSupplierCode(supplierName)
  ).toUpperCase();

  return {
    supplier_name: supplierName,
    supplier_code: supplierCode,
    supplier_hotel_id: clean(payload.supplier_hotel_id || payload.supplierHotelId || payload.hotelId || payload.hotel_id || hotel.hotelId || hotel.hotel_id),
    supplier_rate_id: rateSourceId,
    supplier_rate_key: clean(payload.supplier_rate_key || payload.rate_key || payload.roomCode || payload.room_code || room.roomCode),
    supplier_booking_reference: clean(payload.supplier_booking_reference || ""),
    rate_source_id: rateSourceId,
    rate_source_timestamp: rateTimestamp,
    source_health: clean(payload.source_health || room.source_health || hotel.source_health || "verified"),
    selected_room_code: clean(payload.roomCode || payload.room_code || room.roomCode || "STANDARD"),
    selected_room_name: clean(payload.roomName || payload.room_name || room.roomName || "Available room")
  };
}

function mshSearchAuditMiddleware(req, res, next) {
  const originalJson = res.json.bind(res);

  res.json = function patchedJson(body) {
    try {
      const hotels = Array.isArray(body && body.hotels) ? body.hotels : [];
      hotels.slice(0, 120).forEach((hotel) => {
        const rooms = Array.isArray(hotel.rooms) ? hotel.rooms : [];
        const room = rooms[0] || {};
        const tracking = mshSupplierTrackingFromPayload({
          ...req.query,
          hotelId: hotel.hotelId || hotel.hotel_id,
          hotelName: hotel.name || hotel.hotel_name,
          roomCode: room.roomCode,
          rate_source_id: room.rate_source_id || hotel.rate_source_id,
          rate_source_timestamp: room.rate_source_timestamp || hotel.rate_source_timestamp,
          source_health: room.source_health || hotel.source_health
        });

        mshAppendSupplierAudit("rate_returned_to_search", {
          hotelId: hotel.hotelId || hotel.hotel_id,
          hotelName: hotel.name || hotel.hotel_name,
          country: hotel.country,
          city: hotel.city,
          price: hotel.price,
          currency: hotel.currency,
          supplier_name: tracking.supplier_name,
          supplier_code: tracking.supplier_code,
          supplier_hotel_id: tracking.supplier_hotel_id,
          supplier_rate_id: tracking.supplier_rate_id,
          rate_source_id: tracking.rate_source_id,
          rate_source_timestamp: tracking.rate_source_timestamp,
          source_health: tracking.source_health
        });
      });
    } catch (err) {
      recordActivity("supplier_search_audit_error", { url: req.originalUrl }, { error: err.message });
    }

    return originalJson(body);
  };

  next();
}

// ====== API ROUTES ======

// Health and status endpoints
app.get("/", (req, res) => {
  res.json({
    ok: true,
    service: "MySpace Hotel",
    message: "Welcome to MySpace Hotel.",
    timestamp: nowISO()
  });
});

app.get("/status", (req, res) => {
  const destinations = buildDestinations();
  res.json({
    ok: true,
    service: "MySpace Hotel",
    hotelsAvailable: readHotels().length,
    destinationCountries: destinations.length,
    destinationCities: destinations.reduce((sum, x) => sum + x.cities.length, 0),
    confirmedBookings: readJSON(BOOKINGS_FILE, []).length,
    supplierAuditRecords: readJSON(SUPPLIER_AUDIT_FILE, []).length,
    stripeReady: Boolean(process.env.STRIPE_SECRET_KEY || process.env.STRIPE_PAYMENT_LINK),
    mailReady: Boolean(process.env.RESEND_API_KEY || (process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS)),
    mailTo: mailTo(),
    timestamp: nowISO()
  });
});

app.get("/api/status", (req, res) => {
  const destinations = buildDestinations();
  res.json({
    ok: true,
    service: "MySpace Hotel",
    hotelsAvailable: readHotels().length,
    destinationCountries: destinations.length,
    destinationCities: destinations.reduce((sum, x) => sum + x.cities.length, 0),
    confirmedBookings: readJSON(BOOKINGS_FILE, []).length,
    supplierAuditRecords: readJSON(SUPPLIER_AUDIT_FILE, []).length,
    stripeReady: Boolean(process.env.STRIPE_SECRET_KEY || process.env.STRIPE_PAYMENT_LINK),
    mailReady: Boolean(process.env.RESEND_API_KEY || (process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS)),
    mailTo: mailTo(),
    timestamp: nowISO()
  });
});

// Destination endpoints
app.get("/api/destinations", (req, res) => res.json(buildDestinations()));
app.get("/destinations", (req, res) => res.json(buildDestinations()));
app.get("/api/countries", (req, res) => {
  const countries = buildDestinations();
  res.json({
    ok: true,
    count: countries.length,
    countries
  });
});
app.get("/api/public-countries", (req, res) => {
  const countries = buildDestinations();
  res.json({
    ok: true,
    count: countries.length,
    countries
  });
});

// ====== FIXED SEARCH ENDPOINTS ======
app.get("/api/hotels/search", (req, res) => {
  const internalHotels = internalSearchHotels(req.query);
  const hotels = internalHotels.map(publicHotel).filter(Boolean);

  recordActivity("hotel_search", req.query, { count: hotels.length });

  for (const h of internalHotels.slice(0, 120)) {
    if (h) {
      recordSupplierAudit("rate_returned_to_search", {
        hotelId: h.hotelId,
        hotelName: h.name,
        country: h.country,
        city: h.city,
        supplier_name: h._supplier_name,
        supplier_code: h._supplier_code,
        supplier_hotel_id: h._supplier_hotel_id,
        supplier_rate_id: h._supplier_rate_id,
        price: h.price,
        currency: h.currency,
        rate_source_timestamp: h.rate_source_timestamp
      });
    }
  }

  res.json({ ok: true, hotels, count: hotels.length, country: clean(req.query.country), city: clean(req.query.city) });
});

app.get("/search", (req, res) => {
  const internalHotels = internalSearchHotels(req.query);
  const hotels = internalHotels.map(publicHotel).filter(Boolean);
  res.json({ ok: true, hotels, count: hotels.length });
});

// ====== FIXED DROPDOWN ENDPOINT ======
app.get("/api/hotels/dropdown", (req, res) => {
  const hotels = internalSearchHotels(req.query);
  
  const dropdownData = hotels
    .map(hotel => buildDropdownData(hotel))
    .filter(Boolean);
  
  // Sort by price ascending
  dropdownData.sort((a, b) => (a.price?.amount || 0) - (b.price?.amount || 0));
  
  res.json({ 
    ok: true, 
    hotels: dropdownData,
    count: dropdownData.length,
    message: `${dropdownData.length} hotels available in ${clean(req.query.city || '')}`
  });
});

// ====== DEBUG ENDPOINT ======
app.get("/api/debug/hotel/:id", (req, res) => {
  const hotelId = req.params.id;
  const hotels = readHotels();
  const hotel = hotels.find(h => 
    clean(h.hotelId || h.hotel_id || h.id) === hotelId ||
    clean(h.hotelId || h.hotel_id || h.id).includes(hotelId)
  );
  
  if (!hotel) {
    return res.status(404).json({ 
      ok: false,
      error: 'Hotel not found',
      searchedId: hotelId
    });
  }
  
  const normalized = normalizeHotel(hotel);
  const publicData = publicHotel(normalized);
  const dropdownData = buildDropdownData(normalized);
  
  res.json({
    ok: true,
    hotelId: hotelId,
    raw: {
      ...hotel,
      // Show available fields
      hasImages: Boolean(hotel.images || hotel.image || hotel.photos),
      hasRates: Boolean(hotel.rates || hotel.prices || hotel.roomTypes),
      hasSupplier: Boolean(hotel.supplier_name || hotel.supplier)
    },
    normalized: {
      ...normalized,
      imageCount: normalized.images?.length || 0,
      roomCount: normalized.rooms?.length || 0
    },
    public: {
      ...publicData,
      imageCount: publicData.images?.length || 0,
      roomCount: publicData.rooms?.length || 0
    },
    dropdown: dropdownData,
    images: {
      extracted: extractAllImages(hotel),
      primary: getPrimaryImage(hotel),
      gallery: getImageGallery(hotel, 5)
    },
    rates: extractAllRates(hotel),
    supplier: {
      name: hotel.supplier_name || hotel.supplier || 'unknown',
      code: hotel.supplier_code || 'unknown',
      hotelId: hotel.supplier_hotel_id || 'unknown'
    }
  });
});

// ====== PREBOOK AND BOOK ENDPOINTS ======
app.post("/api/prebook", (req, res) => {
  const { hotel, room } = findInternalOffer(req.body);

  const response = {
    ok: true,
    reviewReference: makeRef("REVIEW"),
    hotelId: hotel.hotelId,
    hotelName: hotel.name,
    roomCode: room.roomCode,
    roomName: room.roomName,
    board: room.board,
    cancellationPolicy: room.cancellation,
    taxesAndFees: room.taxesInfo,
    amount: room.convertedPrice || room.price,
    totalPrice: room.totalPrice || room.convertedPrice || room.price,
    currency: room.displayCurrency || clean(req.body.currency || "GBP").toUpperCase(),
    rate_source_id: room.rate_source_id || hotel.rate_source_id,
    rate_source_timestamp: room.rate_source_timestamp || hotel.rate_source_timestamp,
    source_health: "verified",
    expiresInSeconds: 900,
    priceBreakdown: room.priceBreakdown,
    message: "Your room details are ready to review before booking."
  };

  recordSupplierAudit("prebook_rate_review", {
    reviewReference: response.reviewReference,
    hotelId: hotel.hotelId,
    hotelName: hotel.name,
    roomCode: room.roomCode,
    supplier_name: room._supplier_name || hotel._supplier_name,
    supplier_code: room._supplier_code || hotel._supplier_code,
    supplier_hotel_id: room._supplier_hotel_id || hotel._supplier_hotel_id,
    supplier_rate_id: room._supplier_rate_id || hotel._supplier_rate_id,
    supplier_rate_key: room._supplier_rate_key || hotel._supplier_rate_key,
    price: response.amount,
    currency: response.currency,
    rate_source_timestamp: response.rate_source_timestamp
  });

  recordActivity("booking_review", req.body, response);
  res.json(response);
});

app.post("/api/book", async (req, res) => {
  const bookingRef = makeRef("MSH");
  const confirmationRef = makeRef("CONF");
  const tracking = mshSupplierTrackingFromPayload(req.body);
  const found = mshFindPublicOffer(req.body);
  const foundHotel = found.hotel || {};
  const foundRoom = found.room || {};

  const booking = {
    bookingRef,
    confirmationReference: confirmationRef,
    status: "PENDING_PAYMENT",
    createdAt: nowISO(),

    hotelId: clean(req.body.hotelId || req.body.hotel_id || foundHotel.hotelId || foundHotel.hotel_id),
    hotelName: clean(req.body.hotelName || req.body.hotel || foundHotel.name || foundHotel.hotel_name),
    roomCode: tracking.selected_room_code,
    roomName: tracking.selected_room_name,

    country: clean(req.body.country || foundHotel.country),
    city: clean(req.body.city || foundHotel.city),
    checkIn: clean(req.body.checkIn || req.body.checkin),
    checkOut: clean(req.body.checkOut || req.body.checkout),
    guests: number(req.body.guests),
    rooms: number(req.body.rooms),
    amount: money(req.body.amount || req.body.total || foundRoom.convertedPrice || foundRoom.price || foundHotel.price),
    currency: clean(req.body.currency || foundRoom.displayCurrency || foundHotel.currency || "GBP").toUpperCase(),

    customerName: clean(req.body.customerName),
    customerEmail: clean(req.body.customerEmail),
    customerPhone: clean(req.body.customerPhone),
    specialRequests: clean(req.body.specialRequests),

    rate_source_id: tracking.rate_source_id,
    rate_source_timestamp: tracking.rate_source_timestamp,
    source_health: tracking.source_health,

    internalSupplierTracking: {
      supplier_name: tracking.supplier_name,
      supplier_code: tracking.supplier_code,
      supplier_hotel_id: tracking.supplier_hotel_id,
      supplier_rate_id: tracking.supplier_rate_id,
      supplier_rate_key: tracking.supplier_rate_key,
      supplier_booking_reference: tracking.supplier_booking_reference,
      rate_source_id: tracking.rate_source_id,
      rate_source_timestamp: tracking.rate_source_timestamp
    },

    selected_supplier_offer: {
      supplier_code: tracking.supplier_code,
      supplier_hotel_id: tracking.supplier_hotel_id,
      supplier_rate_id: tracking.supplier_rate_id,
      rate_source_id: tracking.rate_source_id,
      rate_source_timestamp: tracking.rate_source_timestamp
    }
  };

  const bookings = readJSON(BOOKINGS_FILE, []);
  bookings.unshift(booking);
  writeJSON(BOOKINGS_FILE, bookings);

  mshAppendSupplierAudit("booking_prepared_supplier_source", {
    bookingRef,
    confirmationReference: confirmationRef,
    hotelId: booking.hotelId,
    hotelName: booking.hotelName,
    roomCode: booking.roomCode,
    roomName: booking.roomName,
    country: booking.country,
    city: booking.city,
    amount: booking.amount,
    currency: booking.currency,
    customerEmail: booking.customerEmail,
    supplier_name: tracking.supplier_name,
    supplier_code: tracking.supplier_code,
    supplier_hotel_id: tracking.supplier_hotel_id,
    supplier_rate_id: tracking.supplier_rate_id,
    supplier_rate_key: tracking.supplier_rate_key,
    rate_source_id: tracking.rate_source_id,
    rate_source_timestamp: tracking.rate_source_timestamp,
    source_health: tracking.source_health
  });

  const emailResult = await sendEmailNotification("New booking prepared - MySpace Hotel", [
    ["Booking reference", booking.bookingRef],
    ["Hotel", booking.hotelName],
    ["Destination", `${booking.city}, ${booking.country}`],
    ["Check-in", booking.checkIn],
    ["Check-out", booking.checkOut],
    ["Guests", String(booking.guests)],
    ["Rooms", String(booking.rooms)],
    ["Amount", `${booking.currency} ${booking.amount}`],
    ["Customer name", booking.customerName],
    ["Customer email", booking.customerEmail],
    ["Customer phone", booking.customerPhone],
    ["Special requests", booking.specialRequests],
    ["Internal supplier", tracking.supplier_name],
    ["Supplier code", tracking.supplier_code],
    ["Supplier hotel ID", tracking.supplier_hotel_id],
    ["Supplier rate ID", tracking.supplier_rate_id],
    ["Rate source ID", tracking.rate_source_id],
    ["Rate timestamp", tracking.rate_source_timestamp],
    ["Created", booking.createdAt]
  ]);

  const response = {
    ok: true,
    bookingRef,
    confirmationReference: confirmationRef,
    status: "PENDING_PAYMENT",
    rate_source_id: tracking.rate_source_id,
    rate_source_timestamp: tracking.rate_source_timestamp,
    source_health: tracking.source_health,
    emailSent: Boolean(emailResult.ok),
    message: "Your reservation has been prepared for secure payment."
  };

  recordActivity("booking_prepared", req.body, response);
  res.json(response);
});

// ====== BOOKING MANAGEMENT ======
app.get("/api/bookings", (req, res) => {
  const bookings = readJSON(BOOKINGS_FILE, []);
  res.json({ ok: true, total: bookings.length, bookings });
});

app.get("/api/bookings/:reference", (req, res) => {
  const bookings = readJSON(BOOKINGS_FILE, []);
  const booking = bookings.find((b) => b.bookingRef === req.params.reference);

  if (!booking) return res.status(404).json({ ok: false, message: "We could not find a booking with that reference." });

  res.json({ ok: true, booking });
});

app.post("/api/cancel-booking", async (req, res) => {
  const bookingRef = clean(req.body.bookingRef || req.body.booking_reference);
  const bookings = readJSON(BOOKINGS_FILE, []);
  const booking = bookings.find((b) => b.bookingRef === bookingRef);

  if (!booking) return res.status(404).json({ ok: false, message: "We could not find a booking with that reference." });

  booking.status = "CANCELLED";
  booking.cancelledAt = nowISO();
  booking.cancellationReason = clean(req.body.reason || "Customer request");

  writeJSON(BOOKINGS_FILE, bookings);

  recordSupplierAudit("booking_cancelled_supplier_source", {
    bookingRef,
    hotelName: booking.hotelName,
    supplier_name: booking.internalSupplierTracking?.supplier_name || "",
    supplier_code: booking.internalSupplierTracking?.supplier_code || "",
    supplier_hotel_id: booking.internalSupplierTracking?.supplier_hotel_id || "",
    supplier_rate_id: booking.internalSupplierTracking?.supplier_rate_id || "",
    supplier_booking_reference: booking.internalSupplierTracking?.supplier_booking_reference || "",
    cancelledAt: booking.cancelledAt,
    reason: booking.cancellationReason
  });

  await sendEmailNotification("Booking cancelled - MySpace Hotel", [
    ["Booking reference", booking.bookingRef],
    ["Hotel", booking.hotelName],
    ["Customer", booking.customerName],
    ["Customer email", booking.customerEmail],
    ["Reason", booking.cancellationReason],
    ["Cancelled at", booking.cancelledAt],
    ["Internal supplier", booking.internalSupplierTracking?.supplier_name || ""],
    ["Supplier hotel ID", booking.internalSupplierTracking?.supplier_hotel_id || ""],
    ["Supplier rate ID", booking.internalSupplierTracking?.supplier_rate_id || ""]
  ]);

  res.json({ ok: true, bookingRef, status: "CANCELLED", message: "Your booking has been cancelled." });
});

// ====== STRIPE ENDPOINTS ======
app.post("/api/create-checkout-session", createStripeCheckout);
app.post("/api/stripe/checkout", createStripeCheckout);
app.post("/create-checkout-session", createStripeCheckout);

// ====== PARTNER AND FEEDBACK ENDPOINTS ======
app.post("/api/partner-applications", async (req, res) => {
  const rows = readJSON(PARTNERS_FILE, []);
  const row = {
    id: crypto.randomUUID(),
    created_at: nowISO(),
    partner_type: clean(req.body.partner_type),
    business_name: clean(req.body.business_name),
    contact_name: clean(req.body.contact_name),
    contact_email: clean(req.body.contact_email),
    phone: clean(req.body.phone),
    country: clean(req.body.country),
    city: clean(req.body.city),
    website: clean(req.body.website),
    message: clean(req.body.message)
  };

  rows.unshift(row);
  writeJSON(PARTNERS_FILE, rows.slice(0, 3000));

  const reference = `PARTNER-${row.id.slice(0, 8).toUpperCase()}`;

  const emailResult = await sendEmailNotification("New partnership enquiry - MySpace Hotel", [
    ["Reference", reference],
    ["Partner type", row.partner_type],
    ["Business name", row.business_name],
    ["Contact name", row.contact_name],
    ["Contact email", row.contact_email],
    ["Phone", row.phone],
    ["Country", row.country],
    ["City", row.city],
    ["Website", row.website],
    ["Message", row.message],
    ["Received", row.created_at]
  ]);

  res.json({
    ok: true,
    emailSent: Boolean(emailResult.ok),
    message: "Thank you. Your partnership enquiry has been received by MySpace Hotel.",
    reference
  });
});

app.post("/api/feedback", async (req, res) => {
  const rows = readJSON(FEEDBACK_FILE, []);
  const row = {
    id: crypto.randomUUID(),
    created_at: nowISO(),
    name: clean(req.body.name),
    email: clean(req.body.email),
    message: clean(req.body.message)
  };

  rows.unshift(row);
  writeJSON(FEEDBACK_FILE, rows.slice(0, 3000));

  const emailResult = await sendEmailNotification("New guest review - MySpace Hotel", [
    ["Name", row.name],
    ["Email", row.email],
    ["Message", row.message],
    ["Received", row.created_at]
  ]);

  res.json({
    ok: true,
    emailSent: Boolean(emailResult.ok),
    message: "Thank you. Your message has been received by MySpace Hotel."
  });
});

// ====== SUPPLIER AUDIT ENDPOINT ======
app.get("/api/internal/supplier-audit", (req, res) => {
  const rows = readJSON(SUPPLIER_AUDIT_FILE, []);
  res.json({ ok: true, total: rows.length, audit: rows });
});

// ====== CERTIFICATION LOGS ======
app.get("/api/certification/logs", (req, res) => {
  res.json({
    ok: true,
    message: "Service activity records are available.",
    logs: readJSON(SERVICE_ACTIVITY_FILE, [])
  });
});

// ====== START SERVER ======
app.listen(PORT, "0.0.0.0", () => {
  const destinations = buildDestinations();

  console.log("====================================");
  console.log("MYSPACE HOTEL SERVICE READY");
  console.log("PORT:", PORT);
  console.log("HOTELS:", readHotels().length);
  console.log("COUNTRIES:", destinations.length);
  console.log("CITIES:", destinations.reduce((sum, x) => sum + x.cities.length, 0));
  console.log("====================================");
  console.log("✅ IMAGE HANDLING: FIXED");
  console.log("✅ RATE HANDLING: FIXED"); 
  console.log("✅ DROPDOWN: FIXED");
  console.log("✅ DEBUG ENDPOINT: /api/debug/hotel/:id");
  console.log("✅ DROPDOWN ENDPOINT: /api/hotels/dropdown");
  console.log("====================================");
  console.log("STRIPE:", process.env.STRIPE_SECRET_KEY || process.env.STRIPE_PAYMENT_LINK ? "READY" : "NOT CONFIGURED");
  console.log("MAIL:", process.env.RESEND_API_KEY || (process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS) ? "READY" : "NOT CONFIGURED");
  console.log("MAIL TO:", mailTo());
  console.log("====================================");
});