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

function MSH_PARENT_CITY_FIX(country, inputCity) {
  const raw = String(inputCity || "").trim();
  const s = raw
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9,\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  const parentAreas = [
    { country: "united kingdom", city: "London", areas: ["central london", "canary wharf", "greater london", "westminster", "paddington", "kensington", "chelsea", "mayfair", "soho", "shoreditch", "camden", "greenwich", "docklands", "isle of dogs", "limehouse", "poplar", "stratford", "excel", "heathrow", "gatwick", "victoria", "king's cross", "kings cross", "earls court", "hammersmith", "chiswick", "ealing", "wembley"] },
    { country: "united kingdom", city: "Manchester", areas: ["central manchester", "salford", "old trafford", "media city", "manchester airport"] },
    { country: "united kingdom", city: "Birmingham", areas: ["central birmingham", "nec", "birmingham airport", "solihull"] },

    { country: "united arab emirates", city: "Dubai", areas: ["dubai marina", "marina", "jbr", "palm jumeirah", "downtown dubai", "deira", "bur dubai", "business bay", "jumeirah", "al barsha", "dubai airport"] },
    { country: "united arab emirates", city: "Abu Dhabi", areas: ["abu dhabi city", "central abu dhabi", "yas island", "saadiyat", "saadiyat island", "corniche", "al maryah", "al reem", "al raha", "masdar", "abu dhabi airport"] },

    { country: "united states", city: "New York", areas: ["manhattan", "brooklyn", "queens", "bronx", "times square", "midtown", "central park", "soho", "wall street", "jfk", "la guardia", "laguardia"] },
    { country: "united states", city: "Los Angeles", areas: ["hollywood", "beverly hills", "santa monica", "venice beach", "downtown la", "lax"] },
    { country: "united states", city: "Miami", areas: ["south beach", "miami beach", "downtown miami", "brickell"] },
    { country: "united states", city: "Orlando", areas: ["disney", "universal", "international drive", "lake buena vista"] },

    { country: "nigeria", city: "Lagos", areas: ["victoria island", "ikoyi", "lekki", "ikeja", "ajah", "banana island", "maryland", "lagos island"] },
    { country: "nigeria", city: "Abuja", areas: ["wuse", "maitama", "asokoro", "garki", "central business district", "abuja municipal", "jabi", "gwarinpa"] },

    { country: "france", city: "Paris", areas: ["central paris", "eiffel tower", "champs elysees", "montmartre", "la defense", "charles de gaulle", "orly"] },
    { country: "spain", city: "Barcelona", areas: ["central barcelona", "las ramblas", "gothic quarter", "eixample", "barcelona airport"] },
    { country: "spain", city: "Madrid", areas: ["central madrid", "gran via", "atocha", "barajas"] },
    { country: "italy", city: "Rome", areas: ["central rome", "termini", "vatican", "colosseum", "fiumicino"] },
    { country: "turkey", city: "Istanbul", areas: ["sultanahmet", "taksim", "beyoglu", "fatih", "istanbul airport"] }
  ];

  const countryNorm = String(country || "").toLowerCase().trim();

  for (const row of parentAreas) {
    if (countryNorm && row.country !== countryNorm) continue;

    const cityNorm = row.city.toLowerCase();
    if (s === cityNorm || s.includes(cityNorm)) {
      const beforeComma = raw.split(",")[0].trim();
      const area = beforeComma && beforeComma.toLowerCase() !== cityNorm ? beforeComma : "";
      return { supplierCity: row.city, area };
    }

    for (const area of row.areas) {
      if (s === area || s.includes(area)) {
        return { supplierCity: row.city, area };
      }
    }
  }

  if (s.includes(",")) {
    const parts = raw.split(",").map((x) => x.trim()).filter(Boolean);
    const possibleCity = parts[parts.length - 1];
    const possibleArea = parts.slice(0, -1).join(", ");
    if (possibleCity) return { supplierCity: possibleCity, area: possibleArea };
  }

  return { supplierCity: raw, area: "" };
}


function MSH_TEXT(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function MSH_TITLE(value) {
  return String(value || "")
    .trim()
    .replace(/\s+/g, " ")
    .replace(/\b\w/g, (m) => m.toUpperCase());
}

function MSH_READ_JSON(file, fallback) {
  try {
    if (fs.existsSync(file)) return JSON.parse(fs.readFileSync(file, "utf8"));
  } catch {}
  return fallback;
}

function MSH_LIVE_HOTELS() {
  const file = path.join(__dirname, "data", "live_hotels.json");
  const raw = MSH_READ_JSON(file, []);
  return Array.isArray(raw) ? raw : Array.isArray(raw.hotels) ? raw.hotels : [];
}

function MSH_FIELD(hotel, keys) {
  for (const key of keys) {
    const v = key.split(".").reduce((obj, part) => (obj ? obj[part] : undefined), hotel);
    if (v !== undefined && v !== null && String(v).trim()) return String(v).trim();
  }
  return "";
}

function MSH_PRICE(hotel) {
  const room = Array.isArray(hotel?.rooms) && hotel.rooms.length ? hotel.rooms[0] : {};
  const candidates = [
    hotel?.price,
    hotel?.convertedPrice,
    hotel?.displayPrice,
    hotel?.amount,
    hotel?.total,
    hotel?.totalPrice,
    hotel?.net,
    hotel?.sellingRate,
    hotel?.rate,
    hotel?.nightly_rate,
    hotel?.nightlyRate,
    room?.price,
    room?.convertedPrice,
    room?.displayPrice,
    room?.amount,
    room?.total,
    room?.net,
    room?.sellingRate,
    room?.rate
  ];
  for (const v of candidates) {
    const n = Number(v || 0);
    if (Number.isFinite(n) && n > 0) return n;
  }
  return 0;
}

function MSH_SUPPLIER(hotel) {
  const raw = String(
    hotel?.supplierLabel ||
    hotel?.supplier ||
    hotel?.source ||
    hotel?.provider ||
    hotel?.supplierCode ||
    hotel?.supplier_code ||
    hotel?.supplier_private?.supplier_code ||
    ""
  ).toUpperCase();

  if (raw.includes("WEBBEDS")) return "WebBeds";
  if (raw.includes("HOTELBEDS")) return "Hotelbeds";
  return "Inventory";
}

function MSH_BUILD_LOCATION_INDEX(country) {
  const wantedCountry = MSH_TEXT(country);
  const hotels = MSH_LIVE_HOTELS();
  const cityMap = new Map();

  for (const hotel of hotels) {
    const hotelCountry = MSH_FIELD(hotel, ["country", "location.country"]);
    if (wantedCountry && MSH_TEXT(hotelCountry) !== wantedCountry) continue;

    const city =
      MSH_FIELD(hotel, ["city", "destination", "location.city"]) ||
      MSH_FIELD(hotel, ["area", "zone", "district"]);

    if (!city) continue;

    const cityNorm = MSH_TEXT(city);
    if (!cityNorm) continue;

    if (!cityMap.has(cityNorm)) {
      cityMap.set(cityNorm, {
        city: MSH_TITLE(city),
        aliases: new Set([cityNorm]),
        count: 0,
        areas: new Map()
      });
    }

    const item = cityMap.get(cityNorm);
    item.count += 1;

    const areaCandidates = [
      MSH_FIELD(hotel, ["area"]),
      MSH_FIELD(hotel, ["zone"]),
      MSH_FIELD(hotel, ["district"]),
      MSH_FIELD(hotel, ["location.area"]),
      MSH_FIELD(hotel, ["address"])
    ].filter(Boolean);

    for (const area of areaCandidates) {
      const areaNorm = MSH_TEXT(area);
      if (!areaNorm || areaNorm === cityNorm) continue;
      item.areas.set(areaNorm, {
        area: MSH_TITLE(area),
        count: (item.areas.get(areaNorm)?.count || 0) + 1
      });
    }
  }

  return Array.from(cityMap.values()).sort((a, b) => b.count - a.count);
}

function MSH_RESOLVE_FROM_INVENTORY(country, inputCity) {
  const raw = String(inputCity || "").trim();
  const rawNorm = MSH_TEXT(raw);
  const parts = raw.split(",").map((x) => x.trim()).filter(Boolean);
  const index = MSH_BUILD_LOCATION_INDEX(country);

  let area = "";
  let city = "";

  if (parts.length >= 2) {
    area = parts.slice(0, -1).join(", ");
    const finalPartNorm = MSH_TEXT(parts[parts.length - 1]);
    const exact = index.find((x) => MSH_TEXT(x.city) === finalPartNorm);
    if (exact) city = exact.city;
  }

  if (!city) {
    const exact = index.find((x) => MSH_TEXT(x.city) === rawNorm);
    if (exact) city = exact.city;
  }

  if (!city) {
    const containsCity = index.find((x) => {
      const c = MSH_TEXT(x.city);
      return c && (rawNorm.includes(c) || c.includes(rawNorm));
    });
    if (containsCity) city = containsCity.city;
  }

  if (!city) {
    for (const item of index) {
      for (const [areaNorm, areaData] of item.areas.entries()) {
        if (rawNorm.includes(areaNorm) || areaNorm.includes(rawNorm)) {
          city = item.city;
          area = areaData.area;
          break;
        }
      }
      if (city) break;
    }
  }

  if (!city) city = MSH_TITLE(raw);

  return {
    requestedCity: raw,
    supplierCity: city,
    area,
    locationIndexCityCount: index.length,
    candidates: Array.from(new Set([city, raw, ...parts].filter(Boolean).map(MSH_TITLE)))
  };
}

function MSH_AREA_SCORE(hotel, area) {
  if (!area) return 0;
  const a = MSH_TEXT(area);
  const text = MSH_TEXT([
    hotel?.area,
    hotel?.zone,
    hotel?.district,
    hotel?.address,
    hotel?.location,
    hotel?.description,
    hotel?.name,
    hotel?.hotel_name,
    hotel?.hotelName
  ].join(" "));
  if (text.includes(a)) return 100;
  return a.split(" ").reduce((sum, part) => sum + (text.includes(part) ? 10 : 0), 0);
}

function MSH_SUPPLIER_ID_TEXT(value) {
  return String(value || "").replace(/^WEBBEDS-/i, "").replace(/^HOTELBEDS-/i, "").trim();
}

function MSH_SUPPLIER_IMAGES_FROM(hotel) {
  const list = [
    hotel?.image,
    hotel?.image_url,
    hotel?.direct_image_url,
    hotel?.main_image,
    hotel?.photo,
    hotel?.thumbnail,
    ...(Array.isArray(hotel?.images) ? hotel.images : []),
    ...(Array.isArray(hotel?.photos) ? hotel.photos : [])
  ];

  return Array.from(new Set(list.map((x) => {
    if (!x) return "";
    if (typeof x === "string") return x.trim();
    return String(x.url || x.image_url || x.path || "").trim();
  }).filter((x) => /^https?:\/\//i.test(x))));
}

function MSH_WEBBEDS_STATIC_ROWS() {
  const files = [
    path.join(DATA_DIR, "webbeds-static-hotels.json"),
    path.join(__dirname, "data", "webbeds-static-hotels.json")
  ];

  for (const file of files) {
    try {
      if (!fs.existsSync(file)) continue;
      const raw = JSON.parse(fs.readFileSync(file, "utf8"));
      if (Array.isArray(raw)) return raw;
      if (Array.isArray(raw.hotels)) return raw.hotels;
      if (Array.isArray(raw.data)) return raw.data;
      if (Array.isArray(raw.results)) return raw.results;
    } catch {}
  }

  return [];
}

let MSH_WEBBEDS_STATIC_MAP_CACHE = null;

function MSH_WEBBEDS_STATIC_MAP() {
  if (MSH_WEBBEDS_STATIC_MAP_CACHE) return MSH_WEBBEDS_STATIC_MAP_CACHE;

  const map = new Map();

  for (const hotel of MSH_WEBBEDS_STATIC_ROWS()) {
    const ids = [
      hotel?.hotelId,
      hotel?.hotel_id,
      hotel?.id,
      hotel?.code,
      hotel?.hotelCode,
      hotel?.hotel_code,
      hotel?.hotelid,
      hotel?.hotel_id_webbeds,
      hotel?.supplier_hotel_id,
      hotel?.supplierHotelId
    ].map(MSH_SUPPLIER_ID_TEXT).filter(Boolean);

    for (const id of ids) {
      if (!map.has(id)) map.set(id, hotel);
    }
  }

  MSH_WEBBEDS_STATIC_MAP_CACHE = map;
  return map;
}

function MSH_ENRICH_HOTEL_WITH_STATIC_DATA(hotel, query) {
  const supplier = MSH_SUPPLIER(hotel);
  const rawId = MSH_SUPPLIER_ID_TEXT(
    hotel?.hotelId ||
    hotel?.hotel_id ||
    hotel?.id ||
    hotel?.code ||
    hotel?.supplier_hotel_id ||
    hotel?.supplierHotelId
  );

  let staticHotel = null;

  if (supplier === "WebBeds" && rawId) {
    staticHotel = MSH_WEBBEDS_STATIC_MAP().get(rawId) || null;
  }

  const merged = staticHotel ? { ...staticHotel, ...hotel } : { ...hotel };

  const images = Array.from(new Set([
    ...MSH_SUPPLIER_IMAGES_FROM(staticHotel || {}),
    ...MSH_SUPPLIER_IMAGES_FROM(hotel || {})
  ]));

  const name = clean(
    merged.name ||
    merged.hotel_name ||
    merged.hotelName ||
    staticHotel?.name ||
    staticHotel?.hotel_name ||
    staticHotel?.hotelName ||
    ""
  );

  const isBadGenericName = /^Hotel\s+\d+$/i.test(name) || /^Live supplier property/i.test(name);

  return {
    ...merged,
    name: isBadGenericName ? "" : name,
    hotel_name: isBadGenericName ? "" : name,
    country: clean(merged.country || staticHotel?.country || query?.country || ""),
    city: clean(merged.city || staticHotel?.city || staticHotel?.destination || query?.city || ""),
    area: clean(merged.area || staticHotel?.area || staticHotel?.zone || staticHotel?.district || query?.area || ""),
    address: clean(merged.address || staticHotel?.address || ""),
    image: images[0] || "",
    images,
    supplierLabel: merged.supplierLabel || supplier,
    supplierCode: merged.supplierCode || supplier
  };
}
function MSH_CLEAN_CUSTOMER_HOTELS(hotels, query) {
  const seen = new Set();
  return (hotels || [])
    .map((hotel, index) => {
      hotel = MSH_ENRICH_HOTEL_WITH_STATIC_DATA(hotel, query);
      const room = Array.isArray(hotel?.rooms) && hotel.rooms.length ? hotel.rooms[0] : {};
      const price = MSH_PRICE(hotel);
      const supplierLabel = MSH_SUPPLIER(hotel);
      const key = [
        supplierLabel,
        hotel?.hotelId || hotel?.hotel_id || hotel?.id || hotel?.code || hotel?.name || index,
        price
      ].join("|");

      if (seen.has(key)) return null;
      seen.add(key);

      return {
        ...hotel,
        id: hotel.id || hotel.hotelId || hotel.hotel_id || hotel.code || `LIVE-${index}`,
        hotelId: hotel.hotelId || hotel.hotel_id || hotel.id || hotel.code || `LIVE-${index}`,
        hotel_id: hotel.hotel_id || hotel.hotelId || hotel.id || hotel.code || `LIVE-${index}`,
        city: hotel.city || query.city,
        country: hotel.country || query.country,
        price,
        convertedPrice: hotel.convertedPrice || price,
        currency: hotel.currency || hotel.displayCurrency || room.displayCurrency || query.currency || "GBP",
        displayCurrency: hotel.displayCurrency || hotel.currency || room.displayCurrency || query.currency || "GBP",
        supplierLabel,
        supplierCode: supplierLabel,
        areaMatchScore: MSH_AREA_SCORE(hotel, query.area || ""),
        rooms: Array.isArray(hotel.rooms) && hotel.rooms.length
          ? hotel.rooms
          : [{
              roomCode: hotel.roomCode || "STANDARD",
              roomName: hotel.roomName || "Available room",
              price,
              convertedPrice: price,
              displayCurrency: hotel.displayCurrency || hotel.currency || query.currency || "GBP"
            }]
      };
    })
    .filter(Boolean)
    .filter((hotel) => Number(hotel.price || 0) > 0)
    .filter((hotel) => clean(hotel.name || hotel.hotel_name) && clean(hotel.image))
    .sort((a, b) => {
      if ((b.areaMatchScore || 0) !== (a.areaMatchScore || 0)) return (b.areaMatchScore || 0) - (a.areaMatchScore || 0);
      return Number(a.price || 0) - Number(b.price || 0);
    });
}

function MSH_LOCAL_INVENTORY_SEARCH(country, city, currency, limit) {
  const wantedCountry = MSH_TEXT(country);
  const place = MSH_RESOLVE_FROM_INVENTORY(country, city);
  const cityNorm = MSH_TEXT(place.supplierCity);
  const requestedNorm = MSH_TEXT(place.requestedCity);
  const areaNorm = MSH_TEXT(place.area);
  const max = Number(limit || 1000);

  const rows = MSH_LIVE_HOTELS()
    .filter((hotel) => {
      const c = MSH_TEXT(MSH_FIELD(hotel, ["country", "location.country"]));
      if (wantedCountry && c !== wantedCountry) return false;

      const hotelCity = MSH_TEXT(MSH_FIELD(hotel, ["city", "destination", "location.city", "area"]));
      const searchable = MSH_TEXT([
        hotel?.name,
        hotel?.hotel_name,
        hotel?.hotelName,
        hotel?.city,
        hotel?.destination,
        hotel?.area,
        hotel?.zone,
        hotel?.district,
        hotel?.address,
        hotel?.description
      ].join(" "));

      return (
        hotelCity === cityNorm ||
        hotelCity.includes(cityNorm) ||
        cityNorm.includes(hotelCity) ||
        searchable.includes(cityNorm) ||
        searchable.includes(requestedNorm) ||
        (areaNorm && searchable.includes(areaNorm))
      );
    })
    .map((hotel, index) => ({
      ...hotel,
      source: hotel.source || "local_inventory",
      supplierLabel: hotel.supplierLabel || MSH_SUPPLIER(hotel),
      hotelId: hotel.hotelId || hotel.hotel_id || hotel.id || `LOCAL-${index}`,
      hotel_id: hotel.hotel_id || hotel.hotelId || hotel.id || `LOCAL-${index}`,
      price: MSH_PRICE(hotel),
      currency: hotel.currency || hotel.displayCurrency || currency || "GBP",
      displayCurrency: hotel.displayCurrency || hotel.currency || currency || "GBP"
    }))
    .filter((hotel) => Number(hotel.price || 0) > 0);

  return {
    place,
    hotels: MSH_CLEAN_CUSTOMER_HOTELS(rows, {
      country,
      city: place.supplierCity,
      area: place.area,
      currency
    }).slice(0, max)
  };
}

async function MSH_CALL_MULTI_SUPPLIER(app, query) {
  const routeLayer = app._router && app._router.stack
    ? app._router.stack.find((layer) => layer.route && layer.route.path === "/api/multi-supplier-hotels")
    : null;

  if (!routeLayer) return { hotels: [], supplierStatus: {}, suppliers: {} };

  let payload = null;
  const mockReq = { query };
  const mockRes = {
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(data) {
      payload = data;
      return data;
    }
  };

  await routeLayer.route.stack[0].handle(mockReq, mockRes);
  return payload || { hotels: [], supplierStatus: {}, suppliers: {} };
}


function MSH_norm(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function MSH_title(value) {
  return String(value || "")
    .trim()
    .replace(/\s+/g, " ")
    .replace(/\b\w/g, (m) => m.toUpperCase());
}

function MSH_safeDestinations() {
  try {
    if (typeof buildDestinations === "function") {
      const rows = buildDestinations();
      return Array.isArray(rows) ? rows : [];
    }
  } catch {}
  return [];
}

function MSH_allCountryCities(country) {
  const wanted = MSH_norm(country);
  const rows = MSH_safeDestinations();
  const match = rows.find((x) => MSH_norm(x.country) === wanted);
  if (match && Array.isArray(match.cities)) return match.cities.filter(Boolean);

  const all = [];
  rows.forEach((x) => {
    if (Array.isArray(x.cities)) all.push(...x.cities);
  });
  return Array.from(new Set(all.filter(Boolean)));
}

const MSH_MAJOR_CITY_ALIASES = {
  lon: "London",
  ldn: "London",
  london: "London",
  auh: "Abu Dhabi",
  "abu dhabi": "Abu Dhabi",
  dxb: "Dubai",
  dubai: "Dubai",
  nyc: "New York",
  "new york": "New York",
  lax: "Los Angeles",
  "los angeles": "Los Angeles",
  par: "Paris",
  paris: "Paris",
  man: "Manchester",
  manchester: "Manchester",
  bhx: "Birmingham",
  birmingham: "Birmingham",
  atl: "Atlanta",
  atlanta: "Atlanta",
  mia: "Miami",
  miami: "Miami",
  orlando: "Orlando",
  las: "Las Vegas",
  "las vegas": "Las Vegas",
  toronto: "Toronto",
  doha: "Doha",
  riyadh: "Riyadh",
  jeddah: "Jeddah",
  istanbul: "Istanbul",
  singapore: "Singapore",
  bangkok: "Bangkok",
  sydney: "Sydney",
  melbourne: "Melbourne"
};

const MSH_AREA_PARENT_CITY = {
  "canary wharf": "London",
  docklands: "London",
  "isle of dogs": "London",
  limehouse: "London",
  poplar: "London",
  westminster: "London",
  paddington: "London",
  kensington: "London",
  chelsea: "London",
  mayfair: "London",
  soho: "London",
  shoreditch: "London",
  camden: "London",
  greenwich: "London",
  stratford: "London",
  "excel london": "London",
  heathrow: "London",
  gatwick: "London",

  "yas island": "Abu Dhabi",
  saadiyat: "Abu Dhabi",
  "saadiyat island": "Abu Dhabi",
  corniche: "Abu Dhabi",
  "al maryah": "Abu Dhabi",
  "al reem": "Abu Dhabi",
  "al raha": "Abu Dhabi",

  "dubai marina": "Dubai",
  marina: "Dubai",
  jbr: "Dubai",
  "palm jumeirah": "Dubai",
  "downtown dubai": "Dubai",
  deira: "Dubai",
  "bur dubai": "Dubai"
};

function MSH_resolveGlobalPlace(country, rawCity) {
  const original = String(rawCity || "").trim();
  const loose = MSH_norm(original);
  const cities = MSH_allCountryCities(country);
  const cityByNorm = new Map(cities.map((c) => [MSH_norm(c), c]));

  let area = "";
  let supplierCity = "";

  const commaParts = original.split(",").map((x) => x.trim()).filter(Boolean);
  if (commaParts.length >= 2) {
    const possibleCity = commaParts[commaParts.length - 1];
    const possibleArea = commaParts.slice(0, -1).join(", ");
    const cityNorm = MSH_norm(possibleCity);
    supplierCity = cityByNorm.get(cityNorm) || MSH_MAJOR_CITY_ALIASES[cityNorm] || MSH_title(possibleCity);
    area = possibleArea;
  }

  if (!supplierCity) {
    const aliasKey = Object.keys(MSH_AREA_PARENT_CITY).find((key) => loose.includes(key));
    if (aliasKey) {
      area = MSH_title(aliasKey);
      supplierCity = MSH_AREA_PARENT_CITY[aliasKey];
    }
  }

  if (!supplierCity && MSH_MAJOR_CITY_ALIASES[loose]) {
    supplierCity = MSH_MAJOR_CITY_ALIASES[loose];
  }

  if (!supplierCity && cityByNorm.has(loose)) {
    supplierCity = cityByNorm.get(loose);
  }

  if (!supplierCity) {
    const longestCityInsideInput = cities
      .filter((city) => {
        const c = MSH_norm(city);
        return c && (loose.includes(c) || c.includes(loose));
      })
      .sort((a, b) => MSH_norm(b).length - MSH_norm(a).length)[0];

    if (longestCityInsideInput) supplierCity = longestCityInsideInput;
  }

  if (!supplierCity) supplierCity = MSH_title(original);

  const candidates = [
    supplierCity,
    original,
    ...commaParts.reverse(),
  ]
    .map((x) => MSH_title(x))
    .filter(Boolean);

  return {
    requestedCity: original,
    supplierCity,
    area,
    candidates: Array.from(new Set(candidates))
  };
}

function MSH_supplierName(hotel) {
  const raw = String(
    hotel?.supplierLabel ||
    hotel?.supplier ||
    hotel?.source ||
    hotel?.provider ||
    hotel?.supplierCode ||
    hotel?.supplier_private?.supplier_code ||
    ""
  );

  const upper = raw.toUpperCase();
  if (upper.includes("WEBBEDS")) return "WebBeds";
  if (upper.includes("HOTELBEDS")) return "Hotelbeds";
  return raw || "Live supplier";
}

function MSH_price(hotel) {
  const room = Array.isArray(hotel?.rooms) && hotel.rooms.length ? hotel.rooms[0] : {};
  const candidates = [
    hotel?.price,
    hotel?.convertedPrice,
    hotel?.displayPrice,
    hotel?.amount,
    hotel?.total,
    hotel?.totalPrice,
    hotel?.net,
    hotel?.sellingRate,
    hotel?.rate,
    room?.price,
    room?.convertedPrice,
    room?.displayPrice,
    room?.amount,
    room?.total,
    room?.net,
    room?.sellingRate,
    room?.rate
  ];

  for (const v of candidates) {
    const n = Number(v || 0);
    if (Number.isFinite(n) && n > 0) return n;
  }

  return 0;
}

function MSH_areaScore(hotel, area) {
  if (!area) return 0;
  const a = MSH_norm(area);
  const text = MSH_norm([
    hotel?.area,
    hotel?.zone,
    hotel?.district,
    hotel?.address,
    hotel?.location,
    hotel?.description,
    hotel?.name,
    hotel?.hotel_name,
    hotel?.hotelName
  ].join(" "));

  if (text.includes(a)) return 100;
  return a.split(" ").reduce((sum, part) => sum + (text.includes(part) ? 10 : 0), 0);
}

function MSH_cleanLiveHotels(hotels, query) {
  const seen = new Set();

  return (hotels || [])
    .map((hotel, index) => {
      hotel = MSH_ENRICH_HOTEL_WITH_STATIC_DATA(hotel, query);
      const room = Array.isArray(hotel?.rooms) && hotel.rooms.length ? hotel.rooms[0] : {};
      const price = MSH_price(hotel);
      const supplierLabel = MSH_supplierName(hotel);
      const key = [
        supplierLabel,
        hotel?.hotelId || hotel?.hotel_id || hotel?.id || hotel?.code || hotel?.name || index,
        price
      ].join("|");

      if (seen.has(key)) return null;
      seen.add(key);

      return {
        ...hotel,
        id: hotel.id || hotel.hotelId || hotel.hotel_id || hotel.code || `LIVE-${index}`,
        hotelId: hotel.hotelId || hotel.hotel_id || hotel.id || hotel.code || `LIVE-${index}`,
        hotel_id: hotel.hotel_id || hotel.hotelId || hotel.id || hotel.code || `LIVE-${index}`,
        city: hotel.city || query.city,
        country: hotel.country || query.country,
        price,
        convertedPrice: hotel.convertedPrice || price,
        currency: hotel.currency || hotel.displayCurrency || room.displayCurrency || query.currency || "GBP",
        displayCurrency: hotel.displayCurrency || hotel.currency || room.displayCurrency || query.currency || "GBP",
        supplierLabel,
        supplierCode: supplierLabel,
        areaMatchScore: MSH_areaScore(hotel, query.area || ""),
        rooms: Array.isArray(hotel.rooms) && hotel.rooms.length
          ? hotel.rooms
          : [{
              roomCode: hotel.roomCode || "STANDARD",
              roomName: hotel.roomName || "Available room",
              price,
              convertedPrice: price,
              displayCurrency: hotel.displayCurrency || hotel.currency || query.currency || "GBP"
            }]
      };
    })
    .filter(Boolean)
    .filter((hotel) => Number(hotel.price || 0) > 0)
    .filter((hotel) => clean(hotel.name || hotel.hotel_name) && clean(hotel.image))
    .sort((a, b) => {
      if ((b.areaMatchScore || 0) !== (a.areaMatchScore || 0)) return (b.areaMatchScore || 0) - (a.areaMatchScore || 0);
      return Number(a.price || 0) - Number(b.price || 0);
    });
}

async function MSH_callMultiSupplier(app, query) {
  const routeLayer = app._router && app._router.stack
    ? app._router.stack.find((layer) => layer.route && layer.route.path === "/api/multi-supplier-hotels")
    : null;

  if (!routeLayer) return { hotels: [], supplierStatus: {}, suppliers: {} };

  let payload = null;
  const mockReq = { query };
  const mockRes = {
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(data) {
      payload = data;
      return data;
    }
  };

  await routeLayer.route.stack[0].handle(mockReq, mockRes);
  return payload || { hotels: [], supplierStatus: {}, suppliers: {} };
}


function normaliseLooseText(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/&/g, "and")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

const GLOBAL_AREA_TO_CITY = {
  "canary wharf": "London",
  "docklands": "London",
  "isle of dogs": "London",
  "limehouse": "London",
  "poplar": "London",
  "westminster": "London",
  "paddington": "London",
  "kensington": "London",
  "chelsea": "London",
  "mayfair": "London",
  "soho": "London",
  "shoreditch": "London",
  "camden": "London",
  "greenwich": "London",
  "stratford": "London",
  "excel": "London",
  "excel london": "London",
  "heathrow": "London",
  "gatwick": "London",

  "yas island": "Abu Dhabi",
  "saadiyat": "Abu Dhabi",
  "saadiyat island": "Abu Dhabi",
  "corniche": "Abu Dhabi",
  "al maryah": "Abu Dhabi",
  "al reem": "Abu Dhabi",
  "al raha": "Abu Dhabi",

  "dubai marina": "Dubai",
  "marina": "Dubai",
  "jbr": "Dubai",
  "palm jumeirah": "Dubai",
  "downtown dubai": "Dubai",
  "deira": "Dubai",
  "bur dubai": "Dubai",

  "manhattan": "New York",
  "brooklyn": "New York",
  "queens": "New York",
  "times square": "New York",

  "south beach": "Miami",
  "miami beach": "Miami",

  "hollywood": "Los Angeles",
  "beverly hills": "Los Angeles",
  "santa monica": "Los Angeles"
};

const HOTELBEDS_DESTINATION_ALIASES = {
  "london": "LON",
  "abu dhabi": "AUH",
  "dubai": "DXB",
  "paris": "PAR",
  "new york": "NYC",
  "miami": "MIA",
  "los angeles": "LAX",
  "orlando": "ORL",
  "las vegas": "LAS",
  "atlanta": "ATL",
  "manchester": "MAN",
  "birmingham": "BHX",
  "barcelona": "BCN",
  "madrid": "MAD",
  "rome": "ROM",
  "milan": "MIL",
  "amsterdam": "AMS",
  "berlin": "BER",
  "lisbon": "LIS",
  "istanbul": "IST",
  "doha": "DOH",
  "riyadh": "RUH",
  "jeddah": "JED",
  "cairo": "CAI",
  "lagos": "LOS",
  "accra": "ACC",
  "nairobi": "NBO",
  "cape town": "CPT",
  "johannesburg": "JNB",
  "singapore": "SIN",
  "bangkok": "BKK",
  "tokyo": "TYO",
  "sydney": "SYD",
  "melbourne": "MEL",
  "toronto": "YTO"
};

function resolveSearchPlace(country, city) {
  const original = String(city || "").trim();
  const loose = normaliseLooseText(original);

  let area = "";
  let resolvedCity = original;

  Object.keys(GLOBAL_AREA_TO_CITY).forEach((key) => {
    if (!area && loose.includes(key)) {
      area = key;
      resolvedCity = GLOBAL_AREA_TO_CITY[key];
    }
  });

  if (!area && loose.includes(",")) {
    const first = loose.split(",")[0].trim();
    if (GLOBAL_AREA_TO_CITY[first]) {
      area = first;
      resolvedCity = GLOBAL_AREA_TO_CITY[first];
    }
  }

  if (!area) {
    if (loose === "lon" || loose === "london") resolvedCity = "London";
    if (loose === "auh" || loose === "abu dhabi") resolvedCity = "Abu Dhabi";
    if (loose === "dxb" || loose === "dubai") resolvedCity = "Dubai";
    if (loose === "nyc" || loose === "new york") resolvedCity = "New York";
  }

  const resolvedLoose = normaliseLooseText(resolvedCity);
  const hotelbedsDestination = HOTELBEDS_DESTINATION_ALIASES[resolvedLoose] || "";

  return {
    originalCity: original,
    city: resolvedCity || original,
    cityLoose: resolvedLoose,
    area,
    hotelbedsDestination
  };
}

function supplierDisplayNameServer(hotel) {
  const raw = String(
    hotel?.supplierLabel ||
    hotel?.supplier ||
    hotel?.source ||
    hotel?.provider ||
    hotel?.supplier_private?.supplier_code ||
    ""
  ).toUpperCase();

  if (raw.includes("WEBBEDS")) return "WebBeds";
  if (raw.includes("HOTELBEDS")) return "Hotelbeds";
  return hotel?.supplierLabel || hotel?.supplier || "Live supplier";
}

function areaScoreHotel(hotel, area) {
  if (!area) return 0;
  const text = normaliseLooseText([
    hotel?.area,
    hotel?.zone,
    hotel?.district,
    hotel?.address,
    hotel?.location,
    hotel?.description,
    hotel?.name,
    hotel?.hotel_name,
    hotel?.hotelName
  ].join(" "));

  if (text.includes(area)) return 100;
  const parts = area.split(" ").filter(Boolean);
  return parts.reduce((score, part) => score + (text.includes(part) ? 10 : 0), 0);
}

function liveHotelPriceServer(hotel) {
  const room = Array.isArray(hotel?.rooms) && hotel.rooms.length ? hotel.rooms[0] : {};
  const candidates = [
    hotel?.price,
    hotel?.convertedPrice,
    hotel?.displayPrice,
    hotel?.amount,
    hotel?.total,
    hotel?.totalPrice,
    hotel?.net,
    hotel?.sellingRate,
    hotel?.rate,
    room?.price,
    room?.convertedPrice,
    room?.displayPrice,
    room?.amount,
    room?.total,
    room?.net,
    room?.sellingRate,
    room?.rate
  ];

  for (const value of candidates) {
    const n = Number(value || 0);
    if (Number.isFinite(n) && n > 0) return n;
  }

  return 0;
}

function cleanSupplierHotelsForCustomer(hotels, query) {
  const area = query.area || "";
  return (hotels || [])
    .map((hotel, index) => {
      hotel = MSH_ENRICH_HOTEL_WITH_STATIC_DATA(hotel, query);
      const room = Array.isArray(hotel?.rooms) && hotel.rooms.length ? hotel.rooms[0] : {};
      const price = liveHotelPriceServer(hotel);
      const supplierLabel = supplierDisplayNameServer(hotel);
      const areaScore = areaScoreHotel(hotel, area);

      return {
        ...hotel,
        id: hotel.id || hotel.hotelId || hotel.hotel_id || hotel.code || `LIVE-${index}`,
        hotelId: hotel.hotelId || hotel.hotel_id || hotel.id || hotel.code || `LIVE-${index}`,
        hotel_id: hotel.hotel_id || hotel.hotelId || hotel.id || hotel.code || `LIVE-${index}`,
        city: hotel.city || query.city,
        country: hotel.country || query.country,
        price,
        convertedPrice: hotel.convertedPrice || price,
        currency: hotel.currency || hotel.displayCurrency || room.displayCurrency || query.currency || "GBP",
        displayCurrency: hotel.displayCurrency || hotel.currency || room.displayCurrency || query.currency || "GBP",
        supplierLabel,
        supplierCode: supplierLabel,
        areaMatchScore: areaScore,
        rooms: Array.isArray(hotel.rooms) && hotel.rooms.length
          ? hotel.rooms
          : [{
              roomCode: hotel.roomCode || "STANDARD",
              roomName: hotel.roomName || "Available room",
              price,
              convertedPrice: price,
              displayCurrency: hotel.displayCurrency || hotel.currency || query.currency || "GBP"
            }]
      };
    })
    .filter((hotel) => Number(hotel.price || 0) > 0)
    .sort((a, b) => {
      if ((b.areaMatchScore || 0) !== (a.areaMatchScore || 0)) return (b.areaMatchScore || 0) - (a.areaMatchScore || 0);
      return Number(a.price || 0) - Number(b.price || 0);
    });
}


app.use((req, res, next) => {
  const allowedOrigins = [
    "https://www.myspace-hotel.com",
    "https://myspace-hotel.com",
    "http://localhost:5173",
    "http://127.0.0.1:5173"
  ];

  const origin = req.headers.origin;
  if (origin && allowedOrigins.includes(origin)) {
    res.setHeader("Access-Control-Allow-Origin", origin);
  } else {
    res.setHeader("Access-Control-Allow-Origin", "*");
  }

  res.setHeader("Vary", "Origin");
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Accept, Authorization");
  res.setHeader("Access-Control-Max-Age", "86400");

  if (req.method === "OPTIONS") {
    return res.status(204).end();
  }

  next();
});


app.use((req, res, next) => {
  res.header("Access-Control-Allow-Origin", req.headers.origin || "*");
  res.header("Vary", "Origin");
  res.header("Access-Control-Allow-Credentials", "true");
  res.header("Access-Control-Allow-Methods", "GET,POST,PUT,PATCH,DELETE,OPTIONS");
  res.header("Access-Control-Allow-Headers", "Origin, X-Requested-With, Content-Type, Accept, Authorization");
  if (req.method === "OPTIONS") return res.sendStatus(204);
  next();
});

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

function firstImage(h) {
  const candidates = [
    h.image,
    h.image_url,
    h.direct_image_url,
    h.main_image,
    h.photo,
    h.thumbnail,
    Array.isArray(h.images) ? h.images[0] : "",
    Array.isArray(h.photos) ? h.photos[0] : ""
  ];

  for (const item of candidates) {
    if (!item) continue;
    if (typeof item === "string" && item.startsWith("http")) return item;
    if (typeof item === "object") {
      const url = item.url || item.image_url || item.path;
      if (typeof url === "string" && url.startsWith("http")) return url;
    }
  }

  return "";
}

function normalizeRoomRate(r, h, index, amount, currency) {
  const meta = supplierMetaFromHotel(h, r, currency);

  return {
    roomCode: clean(r.rate_id || r.rate_key || r.room_code || meta.supplier_rate_key || `ROOM-${index + 1}`),
    roomName: clean(r.room_name || r.roomName || r.rate_name || "Available room"),
    board: clean(r.board_name || r.board || r.rate_name || "Room only"),
    price: money(r.nightly_rate || r.amount || r.price || amount),
    convertedPrice: money(r.nightly_rate || r.amount || r.price || amount),
    displayCurrency: clean(r.currency || currency).toUpperCase(),
    cancellation: clean(r.cancellation || "Cancellation information is shown before you complete your booking."),
    taxes: clean(r.taxes || "Applicable taxes and fees are shown before you complete your booking."),

    rate_source_id: meta.supplier_rate_id,
    rate_source_timestamp: meta.rate_source_timestamp,
    source_health: "verified",

    _supplier_name: meta.supplier_name,
    _supplier_code: meta.supplier_code,
    _supplier_hotel_id: meta.supplier_hotel_id,
    _supplier_rate_id: meta.supplier_rate_id,
    _supplier_rate_key: meta.supplier_rate_key,
    _supplier_currency: meta.supplier_currency,
    _supplier_price: meta.supplier_price
  };
}

function normalizeHotel(h, requestedCurrency = "") {
  const rates = Array.isArray(h.rates) ? h.rates : [];
  const firstRate = rates.find((r) => number(r.nightly_rate || r.amount || r.price) > 0) || null;
  const meta = supplierMetaFromHotel(h, firstRate, requestedCurrency);

  const amount = firstRate
    ? money(firstRate.nightly_rate || firstRate.amount || firstRate.price)
    : money(h.price || h.amount || h.nightly_rate || 0);

  const currency = clean(requestedCurrency || firstRate?.currency || h.currency || "GBP").toUpperCase();
  const hotelId = clean(h.hotel_id || h.hotelId || h.id || h.code || h.hotel_code || meta.supplier_hotel_id);

  const rooms = rates.length
    ? rates.slice(0, 8).map((r, index) => normalizeRoomRate(r, h, index, amount, currency))
    : [
        {
          roomCode: "STANDARD",
          roomName: "Available room",
          board: "Room only",
          price: amount,
          convertedPrice: amount,
          displayCurrency: currency,
          cancellation: "Cancellation information is shown before you complete your booking.",
          taxes: "Applicable taxes and fees are shown before you complete your booking.",
          ...publicRateSource(meta),
          _supplier_name: meta.supplier_name,
          _supplier_code: meta.supplier_code,
          _supplier_hotel_id: meta.supplier_hotel_id,
          _supplier_rate_id: meta.supplier_rate_id,
          _supplier_rate_key: meta.supplier_rate_key,
          _supplier_currency: meta.supplier_currency,
          _supplier_price: meta.supplier_price
        }
      ];

  return {
    hotelId,
    hotel_id: hotelId,
    name: clean(h.name || h.hotel_name || h.hotelName || "Hotel"),
    hotel_name: clean(h.name || h.hotel_name || h.hotelName || "Hotel"),
    country: clean(h.country),
    city: clean(h.city),
    area: clean(h.area),
    address: clean(h.address),
    stars: clean(h.stars || h.rating || h.category || ""),
    image: firstImage(h),
    facilities: Array.isArray(h.facilities) ? h.facilities.slice(0, 8) : [],
    rooms,
    availableToBook: amount > 0,
    price: amount,
    currency,
    rate_source_id: meta.supplier_rate_id,
    rate_source_timestamp: meta.rate_source_timestamp,
    source_health: "verified",

    _supplier_name: meta.supplier_name,
    _supplier_code: meta.supplier_code,
    _supplier_hotel_id: meta.supplier_hotel_id,
    _supplier_rate_id: meta.supplier_rate_id,
    _supplier_rate_key: meta.supplier_rate_key,
    _supplier_currency: meta.supplier_currency,
    _supplier_price: meta.supplier_price
  };
}

function publicHotel(h) {
  const rooms = Array.isArray(h.rooms)
    ? h.rooms.map((room) => ({
        roomCode: room.roomCode,
        roomName: room.roomName,
        board: room.board,
        price: room.price,
        convertedPrice: room.convertedPrice,
        displayCurrency: room.displayCurrency,
        cancellation: room.cancellation,
        taxes: room.taxes,
        rate_source_id: room.rate_source_id,
        rate_source_timestamp: room.rate_source_timestamp,
        source_health: room.source_health
      }))
    : [];

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
    image: h.image,
    facilities: h.facilities,
    rooms,
    availableToBook: h.availableToBook,
    price: h.price,
    currency: h.currency,
    rate_source_id: h.rate_source_id,
    rate_source_timestamp: h.rate_source_timestamp,
    source_health: h.source_health
  };
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
    .filter((h) => h.name && h.country && h.city);

  hotels.sort((a, b) => {
    if (b.availableToBook !== a.availableToBook) return Number(b.availableToBook) - Number(a.availableToBook);
    return a.name.localeCompare(b.name);
  });

  if (!hotels.length && country && city) hotels = fallbackHotels(country, city, currency);

  return hotels.slice(0, 120);
}

function searchHotels(query) {
  return internalSearchHotels(query).map(publicHotel);
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

app.get("/api/destinations", (req, res) => res.json(buildDestinations()));
app.get("/destinations", (req, res) => res.json(buildDestinations()));


app.get("/api/hotels/search", (req, res) => {
  const internalHotels = internalSearchHotels(req.query);
  const hotels = internalHotels.map(publicHotel);

  recordActivity("hotel_search", req.query, { count: hotels.length });

  for (const h of internalHotels.slice(0, 120)) {
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

  res.json({ ok: true, hotels, count: hotels.length, country: clean(req.query.country), city: clean(req.query.city) });
});

app.get("/search", (req, res) => {
  const internalHotels = internalSearchHotels(req.query);
  const hotels = internalHotels.map(publicHotel);
  res.json({ ok: true, hotels, count: hotels.length });
});

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
    taxesAndFees: room.taxes,
    amount: room.convertedPrice || room.price,
    currency: room.displayCurrency || clean(req.body.currency || "GBP").toUpperCase(),
    rate_source_id: room.rate_source_id || hotel.rate_source_id,
    rate_source_timestamp: room.rate_source_timestamp || hotel.rate_source_timestamp,
    source_health: "verified",
    expiresInSeconds: 900,
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

// MSH SUPPLIER TRACKING OVERRIDE START
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

app.use("/search", mshSearchAuditMiddleware);
app.use("/api/hotels/search", mshSearchAuditMiddleware);

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

  const affiliateConversion = recordAffiliateConversionIfPresent({ ...booking, affiliateCode: req.body.affiliateCode || req.body.affiliate_code || req.body.ref });

  const response = {
    ok: true,
    bookingRef,
    confirmationReference: confirmationRef,
    status: "PENDING_PAYMENT",
    rate_source_id: tracking.rate_source_id,
    rate_source_timestamp: tracking.rate_source_timestamp,
    source_health: tracking.source_health,
    emailSent: Boolean(emailResult.ok),
    affiliateTracked: Boolean(affiliateConversion),
    affiliateCode: affiliateConversion?.affiliateCode || "",
    message: "Your reservation has been prepared for secure payment."
  };

  recordActivity("booking_prepared", req.body, response);
  res.json(response);
});
// MSH SUPPLIER TRACKING OVERRIDE END

app.post("/api/book", async (req, res) => {
  const bookingRef = makeRef("MSH");
  const confirmationRef = makeRef("CONF");
  const { hotel, room } = findInternalOffer(req.body);

  const supplierSnapshot = {
    supplier_name: room._supplier_name || hotel._supplier_name,
    supplier_code: room._supplier_code || hotel._supplier_code,
    supplier_hotel_id: room._supplier_hotel_id || hotel._supplier_hotel_id,
    supplier_rate_id: room._supplier_rate_id || hotel._supplier_rate_id,
    supplier_rate_key: room._supplier_rate_key || hotel._supplier_rate_key,
    supplier_currency: room._supplier_currency || hotel._supplier_currency,
    supplier_price: room._supplier_price || hotel._supplier_price,
    rate_source_timestamp: room.rate_source_timestamp || hotel.rate_source_timestamp,
    supplier_booking_reference: clean(req.body.supplier_booking_reference || "")
  };

  const booking = {
    bookingRef,
    confirmationReference: confirmationRef,
    status: "PENDING_PAYMENT",
    createdAt: nowISO(),
    hotelId: clean(req.body.hotelId || hotel.hotelId),
    hotelName: clean(req.body.hotelName || hotel.name),
    roomCode: clean(req.body.roomCode || room.roomCode),
    roomName: clean(req.body.roomName || room.roomName),
    country: clean(req.body.country || hotel.country),
    city: clean(req.body.city || hotel.city),
    checkIn: clean(req.body.checkIn || req.body.checkin),
    checkOut: clean(req.body.checkOut || req.body.checkout),
    guests: number(req.body.guests),
    rooms: number(req.body.rooms),
    amount: money(req.body.amount),
    currency: clean(req.body.currency || room.displayCurrency || hotel.currency || "GBP").toUpperCase(),
    customerName: clean(req.body.customerName),
    customerEmail: clean(req.body.customerEmail),
    customerPhone: clean(req.body.customerPhone),
    specialRequests: clean(req.body.specialRequests),

    internalSupplierTracking: supplierSnapshot,
    selected_supplier_offer: {
      supplier_code: supplierSnapshot.supplier_code,
      supplier_hotel_id: supplierSnapshot.supplier_hotel_id,
      supplier_rate_id: supplierSnapshot.supplier_rate_id,
      rate_source_timestamp: supplierSnapshot.rate_source_timestamp
    }
  };

  const bookings = readJSON(BOOKINGS_FILE, []);
  bookings.unshift(booking);
  writeJSON(BOOKINGS_FILE, bookings);

  recordSupplierAudit("booking_prepared_supplier_source", {
    bookingRef,
    confirmationReference: confirmationRef,
    hotelId: booking.hotelId,
    hotelName: booking.hotelName,
    roomCode: booking.roomCode,
    supplier_name: supplierSnapshot.supplier_name,
    supplier_code: supplierSnapshot.supplier_code,
    supplier_hotel_id: supplierSnapshot.supplier_hotel_id,
    supplier_rate_id: supplierSnapshot.supplier_rate_id,
    supplier_rate_key: supplierSnapshot.supplier_rate_key,
    supplier_booking_reference: supplierSnapshot.supplier_booking_reference,
    amount: booking.amount,
    currency: booking.currency,
    customerEmail: booking.customerEmail,
    rate_source_timestamp: supplierSnapshot.rate_source_timestamp
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
    ["Internal supplier", supplierSnapshot.supplier_name],
    ["Supplier code", supplierSnapshot.supplier_code],
    ["Supplier hotel ID", supplierSnapshot.supplier_hotel_id],
    ["Supplier rate ID", supplierSnapshot.supplier_rate_id],
    ["Rate timestamp", supplierSnapshot.rate_source_timestamp],
    ["Created", booking.createdAt]
  ]);

  const affiliateConversion = recordAffiliateConversionIfPresent({ ...booking, affiliateCode: req.body.affiliateCode || req.body.affiliate_code || req.body.ref });

  const response = {
    ok: true,
    bookingRef,
    confirmationReference: confirmationRef,
    status: "PENDING_PAYMENT",
    rate_source_id: supplierSnapshot.supplier_rate_id,
    rate_source_timestamp: supplierSnapshot.rate_source_timestamp,
    emailSent: Boolean(emailResult.ok),
    affiliateTracked: Boolean(affiliateConversion),
    affiliateCode: affiliateConversion?.affiliateCode || "",
    message: "Your reservation has been prepared for secure payment."
  };

  recordActivity("booking_prepared", req.body, response);
  res.json(response);
});


// MSH STRIPE WEBHOOK AFFILIATE PAID START
function markBookingPaidFromStripe(bookingRef, stripePayload) {
  const ref = clean(bookingRef);
  if (!ref) return { ok: false, reason: "Missing booking reference" };

  const bookings = readJSON(BOOKINGS_FILE, []);
  const index = bookings.findIndex((b) => clean(b.bookingRef) === ref);

  if (index >= 0) {
    bookings[index] = {
      ...bookings[index],
      status: "PAID",
      paidAt: nowISO(),
      stripeSessionId: clean(stripePayload.stripeSessionId),
      stripePaymentIntent: clean(stripePayload.stripePaymentIntent),
      stripePaymentStatus: clean(stripePayload.stripePaymentStatus || "paid"),
      paymentReference: clean(stripePayload.paymentReference || stripePayload.stripePaymentIntent || stripePayload.stripeSessionId)
    };

    writeJSON(BOOKINGS_FILE, bookings);
  }

  const conversions = readJSON(AFFILIATE_CONVERSIONS_FILE, []);
  const conversionIndex = conversions.findIndex((x) => clean(x.bookingRef) === ref);

  if (conversionIndex >= 0) {
    conversions[conversionIndex] = {
      ...conversions[conversionIndex],
      status: "PAID",
      paidAt: nowISO(),
      paymentReference: clean(stripePayload.paymentReference || stripePayload.stripePaymentIntent || stripePayload.stripeSessionId),
      stripeSessionId: clean(stripePayload.stripeSessionId),
      stripePaymentIntent: clean(stripePayload.stripePaymentIntent)
    };

    writeJSON(AFFILIATE_CONVERSIONS_FILE, conversions);
  }

  recordActivity("stripe_payment_confirmed", { bookingRef: ref }, {
    bookingUpdated: index >= 0,
    affiliateConversionUpdated: conversionIndex >= 0,
    stripeSessionId: clean(stripePayload.stripeSessionId),
    stripePaymentIntent: clean(stripePayload.stripePaymentIntent)
  });

  return {
    ok: true,
    bookingUpdated: index >= 0,
    affiliateConversionUpdated: conversionIndex >= 0
  };
}

app.post("/api/stripe/webhook", express.raw({ type: "application/json" }), async (req, res) => {
  try {
    const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET || "";
    const stripeSecretKey = process.env.STRIPE_SECRET_KEY || "";
    const signature = req.headers["stripe-signature"];

    let event;

    if (webhookSecret && stripeSecretKey && signature) {
      const verifyRes = await fetch("https://api.stripe.com/v1/webhook_endpoints", {
        headers: { Authorization: `Bearer ${stripeSecretKey}` }
      }).catch(() => null);

      try {
        const Stripe = require("stripe");
        const stripe = Stripe(stripeSecretKey);
        event = stripe.webhooks.constructEvent(req.body, signature, webhookSecret);
      } catch (err) {
        recordActivity("stripe_webhook_signature_failed", {}, { error: err.message });
        return res.status(400).json({ ok: false, message: "Invalid Stripe webhook signature." });
      }
    } else {
      const raw = Buffer.isBuffer(req.body) ? req.body.toString("utf8") : JSON.stringify(req.body || {});
      event = JSON.parse(raw || "{}");
    }

    if (event.type === "checkout.session.completed") {
      const session = event.data && event.data.object ? event.data.object : {};
      const bookingRef =
        clean(session.metadata?.booking_reference) ||
        clean(session.client_reference_id) ||
        clean(session.metadata?.bookingRef);

      const result = markBookingPaidFromStripe(bookingRef, {
        stripeSessionId: session.id,
        stripePaymentIntent: session.payment_intent,
        stripePaymentStatus: session.payment_status,
        paymentReference: session.payment_intent || session.id
      });

      return res.json({ ok: true, handled: true, event: event.type, result });
    }

    return res.json({ ok: true, handled: false, event: event.type || "unknown" });
  } catch (err) {
    recordActivity("stripe_webhook_error", {}, { error: err.message });
    return res.status(500).json({ ok: false, message: "Stripe webhook could not be processed." });
  }
});

app.post("/api/internal/stripe-webhook-test-paid", (req, res) => {
  const bookingRef = clean(req.body.bookingRef || req.body.booking_reference);

  if (!bookingRef) {
    return res.status(400).json({ ok: false, message: "bookingRef is required." });
  }

  const result = markBookingPaidFromStripe(bookingRef, {
    stripeSessionId: clean(req.body.stripeSessionId || "LOCAL-TEST-SESSION"),
    stripePaymentIntent: clean(req.body.stripePaymentIntent || "LOCAL-TEST-PI"),
    stripePaymentStatus: "paid",
    paymentReference: clean(req.body.paymentReference || "LOCAL-TEST-PAYMENT")
  });

  res.json({ ok: true, result });
});
// MSH STRIPE WEBHOOK AFFILIATE PAID END


// MSH AFFILIATE TEST BOOKING MODE START
app.post("/api/internal/affiliate-test-booking-checkout", async (req, res) => {
  try {
    const affiliateCode = clean(req.body.affiliateCode || req.body.ref || "LUKAKA-91F16B").toUpperCase();
    const customerEmail = clean(req.body.customerEmail || "reservations@myspace-hotel.com");
    const customerName = clean(req.body.customerName || "Affiliate Test Guest");

    const affiliates = readAffiliates();
    const affiliate = affiliates.find((x) => clean(x.affiliateCode).toUpperCase() === affiliateCode);

    if (!affiliate || clean(affiliate.status).toUpperCase() !== "APPROVED") {
      return res.status(400).json({
        ok: false,
        message: "Approved affiliate code was not found."
      });
    }

    const bookingRef = `AFF-TEST-${Date.now()}-${crypto.randomBytes(3).toString("hex").toUpperCase()}`;
    const amount = 0.5;
    const currency = "GBP";
    const commissionRate = 3;
    const commissionAmount = money(amount * commissionRate / 100);

    const booking = {
      id: crypto.randomUUID(),
      bookingRef,
      confirmationReference: `TEST-${Date.now()}`,
      status: "PENDING_PAYMENT",
      createdAt: nowISO(),
      hotelId: "AFFILIATE-TEST-HOTEL",
      hotelName: "Affiliate Test Booking",
      country: "United Kingdom",
      city: "London",
      customerName,
      customerEmail,
      amount,
      currency,
      affiliateCode,
      testMode: true,
      note: "Internal low-value affiliate test booking."
    };

    const bookings = readJSON(BOOKINGS_FILE, []);
    bookings.unshift(booking);
    writeJSON(BOOKINGS_FILE, bookings);

    const conversions = readJSON(AFFILIATE_CONVERSIONS_FILE, []);
    conversions.unshift({
      id: crypto.randomUUID(),
      createdAt: nowISO(),
      affiliateCode,
      affiliateFound: true,
      affiliateStatus: "APPROVED",
      bookingRef,
      hotelName: booking.hotelName,
      customerEmail,
      amount,
      currency,
      commissionRate,
      commissionAmount,
      status: "PENDING_PAYMENT",
      testMode: true
    });
    writeJSON(AFFILIATE_CONVERSIONS_FILE, conversions);

    req.body = {
      bookingRef,
      hotelName: booking.hotelName,
      customerEmail,
      amount,
      currency,
      affiliateCode,
      testMode: true
    };

    return createStripeCheckout(req, res);
  } catch (err) {
    console.error("Affiliate test checkout error:", err);
    return res.status(500).json({
      ok: false,
      message: "Affiliate test checkout could not be created."
    });
  }
});
// MSH AFFILIATE TEST BOOKING MODE END

app.post("/api/create-checkout-session", createStripeCheckout);
app.post("/api/stripe/checkout", createStripeCheckout);
app.post("/create-checkout-session", createStripeCheckout);

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

app.get("/api/internal/supplier-audit", (req, res) => {
  const rows = readJSON(SUPPLIER_AUDIT_FILE, []);
  res.json({ ok: true, total: rows.length, audit: rows });
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


// MSH SUPPLIER REGISTRY START
const SUPPLIER_REGISTRY_FILE = path.join(DATA_DIR, "supplier_registry.json");

ensureFile(SUPPLIER_REGISTRY_FILE, [
  {
    supplier_code: "HOTELBEDS",
    supplier_name: "Hotelbeds",
    supplier_type: "bedbank",
    status: "active",
    priority: 1,
    customer_visible: false,
    notes: "Primary hotel inventory and rate source."
  },
  {
    supplier_code: "WEBBEDS",
    supplier_name: "WebBeds",
    supplier_type: "bedbank",
    status: "contracted_pending_integration",
    priority: 2,
    customer_visible: false,
    notes: "Contract signed. Integration pending."
  },
  {
    supplier_code: "HYPERGUEST",
    supplier_name: "HyperGuest",
    supplier_type: "direct_connectivity",
    status: "contracted_pending_integration",
    priority: 3,
    customer_visible: false,
    notes: "Direct hotel connectivity partner."
  },
  {
    supplier_code: "HOTELRUNNER",
    supplier_name: "HotelRunner",
    supplier_type: "channel_connectivity",
    status: "onboarding",
    priority: 4,
    customer_visible: false,
    notes: "Partner onboarding requested."
  },
  {
    supplier_code: "SITEMINDER",
    supplier_name: "SiteMinder",
    supplier_type: "channel_manager",
    status: "onboarding",
    priority: 5,
    customer_visible: false,
    notes: "Channel manager partnership in progress."
  },
  {
    supplier_code: "DIRECT_CONTRACT",
    supplier_name: "Direct Hotel Contract",
    supplier_type: "direct_contract",
    status: "planned",
    priority: 6,
    customer_visible: false,
    notes: "For direct hotel agreements."
  },
  {
    supplier_code: "MYSPACE_INTERNAL",
    supplier_name: "MySpace Internal",
    supplier_type: "internal",
    status: "active",
    priority: 99,
    customer_visible: false,
    notes: "Internal fallback or manually controlled inventory."
  }
]);

function readSupplierRegistry() {
  const rows = readJSON(SUPPLIER_REGISTRY_FILE, []);
  return Array.isArray(rows) ? rows : [];
}

function supplierRegistryMap() {
  const map = new Map();
  for (const supplier of readSupplierRegistry()) {
    const code = clean(supplier.supplier_code).toUpperCase();
    if (code) map.set(code, supplier);
  }
  return map;
}

function resolveSupplierForAdmin(tracking) {
  const registry = supplierRegistryMap();
  const code = clean(
    tracking?.supplier_code ||
    tracking?.supplier_name ||
    "HOTELBEDS"
  ).toUpperCase();

  const supplier = registry.get(code) || registry.get("HOTELBEDS") || {
    supplier_code: code || "HOTELBEDS",
    supplier_name: code || "Hotelbeds",
    supplier_type: "unknown",
    status: "unknown",
    priority: 99,
    customer_visible: false
  };

  return {
    supplier_code: clean(supplier.supplier_code || code).toUpperCase(),
    supplier_name: clean(supplier.supplier_name || supplier.supplier_code || code),
    supplier_type: clean(supplier.supplier_type || "unknown"),
    status: clean(supplier.status || "unknown"),
    priority: number(supplier.priority || 99),
    customer_visible: Boolean(supplier.customer_visible),
    notes: clean(supplier.notes)
  };
}

app.get("/api/internal/supplier-registry", (req, res) => {
  const suppliers = readSupplierRegistry().sort((a, b) => number(a.priority) - number(b.priority));
  res.json({
    ok: true,
    total: suppliers.length,
    suppliers
  });
});

app.post("/api/internal/supplier-registry", (req, res) => {
  const rows = readSupplierRegistry();
  const supplierCode = clean(req.body.supplier_code || req.body.supplierCode).toUpperCase();

  if (!supplierCode) {
    return res.status(400).json({
      ok: false,
      message: "supplier_code is required."
    });
  }

  const incoming = {
    supplier_code: supplierCode,
    supplier_name: clean(req.body.supplier_name || req.body.supplierName || supplierCode),
    supplier_type: clean(req.body.supplier_type || req.body.supplierType || "unknown"),
    status: clean(req.body.status || "active"),
    priority: number(req.body.priority || 99),
    customer_visible: Boolean(req.body.customer_visible),
    notes: clean(req.body.notes)
  };

  const index = rows.findIndex((x) => clean(x.supplier_code).toUpperCase() === supplierCode);

  if (index >= 0) rows[index] = { ...rows[index], ...incoming, updated_at: nowISO() };
  else rows.unshift({ ...incoming, created_at: nowISO() });

  writeJSON(SUPPLIER_REGISTRY_FILE, rows);

  res.json({
    ok: true,
    supplier: index >= 0 ? rows[index] : rows[0],
    message: "Supplier registry updated."
  });
});


// MSH MULTI SUPPLIER COMPARE START
function mshComparableHotelName(v) {
  return clean(v).toLowerCase().replace(/[^a-z0-9]+/g, " ").replace(/\s+/g, " ").trim();
}

function mshBuildSupplierCompareOffers(query) {
  const country = clean(query.country);
  const city = clean(query.city);
  const currency = clean(query.currency || "GBP").toUpperCase();
  const requestedHotelId = clean(query.hotelId || query.hotel_id);
  const requestedHotelName = mshComparableHotelName(query.hotelName || query.hotel_name);

  const hotels = searchHotels({ country, city, currency });

  const selected =
    hotels.find((h) => clean(h.hotelId) === requestedHotelId || clean(h.hotel_id) === requestedHotelId) ||
    hotels.find((h) => mshComparableHotelName(h.name || h.hotel_name) === requestedHotelName) ||
    hotels[0];

  if (!selected) {
    return {
      selected_hotel: null,
      winning_offer: null,
      competing_offers: [],
      customer_offer: null
    };
  }

  const selectedName = mshComparableHotelName(selected.name || selected.hotel_name);

  const sameHotelOffers = hotels
    .filter((hotel) => {
      const nameMatch = mshComparableHotelName(hotel.name || hotel.hotel_name) === selectedName;
      const idMatch = clean(hotel.hotelId) === clean(selected.hotelId) || clean(hotel.hotel_id) === clean(selected.hotel_id);
      return nameMatch || idMatch;
    })
    .flatMap((hotel) => {
      const rooms = Array.isArray(hotel.rooms) && hotel.rooms.length ? hotel.rooms : [{}];

      return rooms.map((room, index) => {
        const price = money(room.convertedPrice || room.price || hotel.price);
        const rateSourceId = clean(room.rate_source_id || hotel.rate_source_id || makeRef("RATE"));
        const timestamp = clean(room.rate_source_timestamp || hotel.rate_source_timestamp || nowISO());

        const tracking = mshSupplierTrackingFromPayload({
          ...query,
          hotelId: hotel.hotelId || hotel.hotel_id,
          hotelName: hotel.name || hotel.hotel_name,
          roomCode: room.roomCode || `ROOM-${index + 1}`,
          roomName: room.roomName || "Available room",
          rate_source_id: rateSourceId,
          rate_source_timestamp: timestamp,
          source_health: room.source_health || hotel.source_health || "verified"
        });

        const supplier = resolveSupplierForAdmin(tracking);

        return {
          compare_offer_id: makeRef("OFFER"),
          hotelId: hotel.hotelId || hotel.hotel_id,
          hotelName: hotel.name || hotel.hotel_name,
          country: hotel.country,
          city: hotel.city,
          roomCode: room.roomCode || `ROOM-${index + 1}`,
          roomName: room.roomName || "Available room",
          board: room.board || "Room only",
          amount: price,
          currency: clean(room.displayCurrency || hotel.currency || currency).toUpperCase(),
          cancellation: room.cancellation || "",
          taxes: room.taxes || "",
          rate_source_id: rateSourceId,
          rate_source_timestamp: timestamp,
          source_health: room.source_health || hotel.source_health || "verified",
          supplier,
          internal_supplier_tracking: {
            supplier_code: supplier.supplier_code,
            supplier_name: supplier.supplier_name,
            supplier_hotel_id: tracking.supplier_hotel_id,
            supplier_rate_id: tracking.supplier_rate_id,
            rate_source_id: tracking.rate_source_id,
            rate_source_timestamp: tracking.rate_source_timestamp
          }
        };
      });
    })
    .filter((offer) => offer.amount > 0)
    .sort((a, b) => a.amount - b.amount);

  const winning = sameHotelOffers[0] || null;

  const customerOffer = winning
    ? {
        hotelId: winning.hotelId,
        hotelName: winning.hotelName,
        country: winning.country,
        city: winning.city,
        roomCode: winning.roomCode,
        roomName: winning.roomName,
        board: winning.board,
        amount: winning.amount,
        currency: winning.currency,
        rate_source_id: winning.rate_source_id,
        rate_source_timestamp: winning.rate_source_timestamp,
        source_health: winning.source_health,
        message: "Best available stay option selected for review."
      }
    : null;

  return {
    selected_hotel: {
      hotelId: selected.hotelId || selected.hotel_id,
      hotelName: selected.name || selected.hotel_name,
      country: selected.country,
      city: selected.city
    },
    winning_offer: winning,
    competing_offers: sameHotelOffers,
    customer_offer: customerOffer
  };
}

app.get("/api/internal/compare-supplier-rates", (req, res) => {
  const result = mshBuildSupplierCompareOffers(req.query);

  if (!result.selected_hotel) {
    return res.status(404).json({
      ok: false,
      message: "No comparable hotel offers were found."
    });
  }

  mshAppendSupplierAudit("supplier_rate_comparison_requested", {
    country: clean(req.query.country),
    city: clean(req.query.city),
    hotelId: result.selected_hotel.hotelId,
    hotelName: result.selected_hotel.hotelName,
    winning_supplier_code: result.winning_offer?.supplier?.supplier_code || "",
    winning_supplier_name: result.winning_offer?.supplier?.supplier_name || "",
    winning_amount: result.winning_offer?.amount || 0,
    winning_currency: result.winning_offer?.currency || "",
    competing_offer_count: result.competing_offers.length,
    rate_source_id: result.winning_offer?.rate_source_id || "",
    rate_source_timestamp: result.winning_offer?.rate_source_timestamp || ""
  });

  res.json({
    ok: true,
    generated_at: nowISO(),
    selected_hotel: result.selected_hotel,
    winning_offer: result.winning_offer,
    competing_offers: result.competing_offers,
    customer_offer: result.customer_offer
  });
});

app.get("/api/compare-prices", (req, res) => {
  const result = mshBuildSupplierCompareOffers(req.query);

  if (!result.selected_hotel) {
    return res.status(404).json({
      ok: false,
      message: "No comparable hotel offers were found."
    });
  }

  res.json({
    ok: true,
    selected_hotel: result.selected_hotel,
    customer_offer: result.customer_offer,
    comparison_summary: {
      compared_options: result.competing_offers.length,
      best_amount: result.customer_offer?.amount || 0,
      currency: result.customer_offer?.currency || clean(req.query.currency || "GBP").toUpperCase(),
      message: "Best available stay option selected for review."
    }
  });
});
// MSH MULTI SUPPLIER COMPARE END

app.get("/api/internal/supplier-dashboard", (req, res) => {
  const bookings = readJSON(BOOKINGS_FILE, []);
  const audit = readJSON(SUPPLIER_AUDIT_FILE, []);
  const suppliers = readSupplierRegistry();
  const supplierStats = new Map();

  for (const supplier of suppliers) {
    const code = clean(supplier.supplier_code).toUpperCase();
    if (!code) continue;

    supplierStats.set(code, {
      ...supplier,
      supplier_code: code,
      searches: 0,
      bookings: 0,
      pending_payment: 0,
      cancelled: 0,
      total_amount: 0,
      currencies: {}
    });
  }

  function ensureSupplierStat(code, tracking) {
    const resolved = resolveSupplierForAdmin({
      supplier_code: code,
      supplier_name: tracking?.supplier_name
    });

    const finalCode = resolved.supplier_code || "UNKNOWN";

    if (!supplierStats.has(finalCode)) {
      supplierStats.set(finalCode, {
        ...resolved,
        searches: 0,
        bookings: 0,
        pending_payment: 0,
        cancelled: 0,
        total_amount: 0,
        currencies: {}
      });
    }

    return supplierStats.get(finalCode);
  }

  for (const item of audit) {
    const code = clean(item.supplier_code || item.supplier_name || "HOTELBEDS").toUpperCase();
    const stat = ensureSupplierStat(code, item);
    if (String(item.action || "").includes("rate_returned")) stat.searches += 1;
  }

  for (const booking of bookings) {
    const tracking = booking.internalSupplierTracking || {};
    const code = clean(tracking.supplier_code || tracking.supplier_name || "HOTELBEDS").toUpperCase();
    const stat = ensureSupplierStat(code, tracking);

    stat.bookings += 1;
    if (booking.status === "PENDING_PAYMENT") stat.pending_payment += 1;
    if (booking.status === "CANCELLED") stat.cancelled += 1;

    const amount = money(booking.amount);
    const currency = clean(booking.currency || "GBP").toUpperCase();

    stat.total_amount += amount;
    stat.currencies[currency] = money((stat.currencies[currency] || 0) + amount);
  }

  const newestBookings = bookings.slice(0, 50).map((booking) => {
    const tracking = booking.internalSupplierTracking || {};
    const supplier = resolveSupplierForAdmin(tracking);

    return {
      bookingRef: booking.bookingRef,
      confirmationReference: booking.confirmationReference,
      status: booking.status,
      createdAt: booking.createdAt,
      hotelId: booking.hotelId,
      hotelName: booking.hotelName,
      roomCode: booking.roomCode,
      roomName: booking.roomName,
      country: booking.country,
      city: booking.city,
      amount: booking.amount,
      currency: booking.currency,
      customerEmail: booking.customerEmail,
      rate_source_id: booking.rate_source_id || tracking.rate_source_id,
      rate_source_timestamp: booking.rate_source_timestamp || tracking.rate_source_timestamp,
      supplier
    };
  });

  res.json({
    ok: true,
    generated_at: nowISO(),
    totals: {
      suppliers: suppliers.length,
      bookings: bookings.length,
      audit_records: audit.length
    },
    supplier_stats: Array.from(supplierStats.values()).sort((a, b) => number(a.priority) - number(b.priority)),
    newest_bookings: newestBookings
  });
});
// MSH SUPPLIER REGISTRY END


// MSH AFFILIATE NETWORK START
const AFFILIATES_FILE = path.join(DATA_DIR, "affiliates.json");
const AFFILIATE_CLICKS_FILE = path.join(DATA_DIR, "affiliate_clicks.json");
const AFFILIATE_CONVERSIONS_FILE = path.join(DATA_DIR, "affiliate_conversions.json");

ensureFile(AFFILIATES_FILE, []);
ensureFile(AFFILIATE_CLICKS_FILE, []);
ensureFile(AFFILIATE_CONVERSIONS_FILE, []);

function makeAffiliateCode(name) {
  const base = clean(name)
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, "")
    .slice(0, 10) || "AFFILIATE";

  return `${base}-${crypto.randomBytes(3).toString("hex").toUpperCase()}`;
}

function readAffiliates() {
  const rows = readJSON(AFFILIATES_FILE, []);
  return Array.isArray(rows) ? rows : [];
}

function publicAffiliate(row) {
  return {
    affiliateCode: row.affiliateCode,
    status: row.status,
    businessName: row.businessName,
    contactName: row.contactName,
    website: row.website,
    referralLink: row.referralLink,
    commissionRate: row.commissionRate,
    createdAt: row.createdAt
  };
}

app.post("/api/affiliates/apply", async (req, res) => {
  const businessName = clean(req.body.businessName || req.body.business_name);
  const contactName = clean(req.body.contactName || req.body.contact_name);
  const email = clean(req.body.email || req.body.contactEmail || req.body.contact_email);
  const phone = clean(req.body.phone);
  const website = clean(req.body.website);
  const audience = clean(req.body.audience);
  const promotionPlan = clean(req.body.promotionPlan || req.body.promotion_plan);

  if (!businessName || !contactName || !email) {
    return res.status(400).json({
      ok: false,
      message: "Please provide business name, contact name and email address."
    });
  }

  const rows = readAffiliates();
  const affiliateCode = makeAffiliateCode(businessName);
  const frontendBase = clean(process.env.FRONTEND_URL || process.env.CLIENT_URL || process.env.PUBLIC_SITE_URL || "http://localhost:5173").replace(/\/$/, "");

  const row = {
    id: crypto.randomUUID(),
    affiliateCode,
    status: "PENDING_REVIEW",
    businessName,
    contactName,
    email,
    phone,
    website,
    audience,
    promotionPlan,
    commissionRate: 5,
    referralLink: `${frontendBase}/?ref=${encodeURIComponent(affiliateCode)}`,
    createdAt: nowISO(),
    approvedAt: "",
    notes: ""
  };

  rows.unshift(row);
  writeJSON(AFFILIATES_FILE, rows.slice(0, 5000));

  await sendEmailNotification("New affiliate application - MySpace Hotel", [
    ["Affiliate code", affiliateCode],
    ["Business name", businessName],
    ["Contact name", contactName],
    ["Email", email],
    ["Phone", phone],
    ["Website", website],
    ["Audience", audience],
    ["Promotion plan", promotionPlan],
    ["Status", row.status],
    ["Referral link", row.referralLink],
    ["Received", row.createdAt]
  ]);

  res.json({
    ok: true,
    message: "Thank you. Your affiliate application has been received by MySpace Hotel.",
    affiliate: publicAffiliate(row)
  });
});

app.get("/api/affiliates/validate/:code", (req, res) => {
  const code = clean(req.params.code).toUpperCase();
  const affiliate = readAffiliates().find((x) => clean(x.affiliateCode).toUpperCase() === code);

  if (!affiliate) {
    return res.status(404).json({ ok: false, message: "Affiliate code was not found." });
  }

  res.json({
    ok: true,
    affiliate: publicAffiliate(affiliate)
  });
});

app.get("/r/:code", (req, res) => {
  const code = clean(req.params.code).toUpperCase();
  const rows = readAffiliates();
  const affiliate = rows.find((x) => clean(x.affiliateCode).toUpperCase() === code);

  const clicks = readJSON(AFFILIATE_CLICKS_FILE, []);
  clicks.unshift({
    id: crypto.randomUUID(),
    createdAt: nowISO(),
    affiliateCode: code,
    foundAffiliate: Boolean(affiliate),
    ip: req.headers["x-forwarded-for"] || req.socket.remoteAddress || "",
    userAgent: req.headers["user-agent"] || "",
    referrer: req.headers.referer || ""
  });
  writeJSON(AFFILIATE_CLICKS_FILE, clicks.slice(0, 20000));

  const frontendBase = clean(process.env.FRONTEND_URL || process.env.CLIENT_URL || process.env.PUBLIC_SITE_URL || "http://localhost:5173").replace(/\/$/, "");
  res.redirect(`${frontendBase}/?ref=${encodeURIComponent(code)}`);
});

function recordAffiliateConversionIfPresent(booking) {
  const affiliateCode = clean(booking.affiliateCode || booking.affiliate_code || booking.ref || "").toUpperCase();
  if (!affiliateCode) return null;

  const affiliate = readAffiliates().find((x) => clean(x.affiliateCode).toUpperCase() === affiliateCode);
  const commissionRate = number(affiliate?.commissionRate || 5);
  const amount = money(booking.amount);
  const commissionAmount = money((amount * commissionRate) / 100);

  const conversion = {
    id: crypto.randomUUID(),
    createdAt: nowISO(),
    affiliateCode,
    affiliateFound: Boolean(affiliate),
    affiliateStatus: affiliate?.status || "UNKNOWN",
    bookingRef: booking.bookingRef,
    hotelName: booking.hotelName,
    customerEmail: booking.customerEmail,
    amount,
    currency: booking.currency,
    commissionRate,
    commissionAmount,
    status: "PENDING_PAYMENT"
  };

  const rows = readJSON(AFFILIATE_CONVERSIONS_FILE, []);
  rows.unshift(conversion);
  writeJSON(AFFILIATE_CONVERSIONS_FILE, rows.slice(0, 20000));

  return conversion;
}


// MSH AFFILIATE APPROVAL EMAIL START
app.post("/api/internal/affiliates/:code/approve", async (req, res) => {
  const code = clean(req.params.code).toUpperCase();
  const affiliates = readAffiliates();
  const index = affiliates.findIndex((x) => clean(x.affiliateCode).toUpperCase() === code);

  if (index < 0) {
    return res.status(404).json({ ok: false, message: "Affiliate was not found." });
  }

  affiliates[index] = {
    ...affiliates[index],
    status: "APPROVED",
    approvedAt: nowISO(),
    notes: clean(req.body.notes || affiliates[index].notes || "")
  };

  writeJSON(AFFILIATES_FILE, affiliates);

  const affiliate = affiliates[index];

  await sendEmailNotification(
    "Affiliate approved - MySpace Hotel",
    [
      ["Business name", affiliate.businessName],
      ["Contact name", affiliate.contactName],
      ["Email", affiliate.email],
      ["Affiliate code", affiliate.affiliateCode],
      ["Referral link", affiliate.referralLink],
      ["Status", affiliate.status],
      ["Approved", affiliate.approvedAt]
    ],
    affiliate.email
  );

  res.json({
    ok: true,
    message: "Affiliate approved and approval email sent.",
    affiliate: publicAffiliate(affiliate)
  });
});

app.post("/api/internal/affiliates/:code/reject", async (req, res) => {
  const code = clean(req.params.code).toUpperCase();
  const affiliates = readAffiliates();
  const index = affiliates.findIndex((x) => clean(x.affiliateCode).toUpperCase() === code);

  if (index < 0) {
    return res.status(404).json({ ok: false, message: "Affiliate was not found." });
  }

  affiliates[index] = {
    ...affiliates[index],
    status: "REJECTED",
    rejectedAt: nowISO(),
    notes: clean(req.body.notes || affiliates[index].notes || "")
  };

  writeJSON(AFFILIATES_FILE, affiliates);

  res.json({
    ok: true,
    message: "Affiliate application rejected.",
    affiliate: publicAffiliate(affiliates[index])
  });
});

app.post("/api/internal/affiliates/:code/resend-welcome", async (req, res) => {
  const code = clean(req.params.code).toUpperCase();
  const affiliate = readAffiliates().find((x) => clean(x.affiliateCode).toUpperCase() === code);

  if (!affiliate) {
    return res.status(404).json({ ok: false, message: "Affiliate was not found." });
  }

  await sendEmailNotification(
    "Welcome to the MySpace Hotel Affiliate Network",
    [
      ["Hello", affiliate.contactName],
      ["Status", affiliate.status],
      ["Affiliate code", affiliate.affiliateCode],
      ["Your referral link", affiliate.referralLink],
      ["How to use it", "Share your referral link with customers, followers, travel groups, businesses, communities and social media audiences."],
      ["Commission", `${affiliate.commissionRate || 5}% on qualifying completed stays, subject to approval and programme terms.`],
      ["Support", "reservations@myspace-hotel.com"],
      ["Website", "myspace-hotel.com"]
    ],
    affiliate.email
  );

  res.json({
    ok: true,
    message: "Affiliate welcome email sent.",
    affiliate: publicAffiliate(affiliate)
  });
});
// MSH AFFILIATE APPROVAL EMAIL END


// MSH AFFILIATE DIRECT CONVERSION START
app.post("/api/internal/affiliate-conversion-test", (req, res) => {
  const affiliateCode = clean(req.body.affiliateCode || req.body.affiliate_code || req.body.ref).toUpperCase();

  if (!affiliateCode) {
    return res.status(400).json({
      ok: false,
      message: "affiliateCode is required."
    });
  }

  const conversion = recordAffiliateConversionIfPresent({
    affiliateCode,
    bookingRef: clean(req.body.bookingRef || makeRef("AFFTEST")),
    hotelName: clean(req.body.hotelName || "Affiliate Test Booking"),
    customerEmail: clean(req.body.customerEmail || "test@example.com"),
    amount: money(req.body.amount || 100),
    currency: clean(req.body.currency || "GBP").toUpperCase()
  });

  res.json({
    ok: true,
    conversion
  });
});
// MSH AFFILIATE DIRECT CONVERSION END


// MSH PAID AFFILIATE COMMISSION OVERRIDE START
app.post("/api/internal/affiliate-conversions/:bookingRef/confirm-paid", (req, res) => {
  const bookingRef = clean(req.params.bookingRef);
  const paymentReference = clean(req.body.paymentReference || req.body.stripePaymentIntent || req.body.stripeSessionId || "");

  const rows = readJSON(AFFILIATE_CONVERSIONS_FILE, []);
  const index = rows.findIndex((x) => clean(x.bookingRef) === bookingRef);

  if (index < 0) {
    return res.status(404).json({ ok: false, message: "Affiliate conversion was not found." });
  }

  rows[index] = {
    ...rows[index],
    status: "PAID",
    paidAt: nowISO(),
    paymentReference
  };

  writeJSON(AFFILIATE_CONVERSIONS_FILE, rows);

  res.json({
    ok: true,
    message: "Affiliate conversion marked as paid.",
    conversion: rows[index]
  });
});

app.get("/api/internal/affiliate-dashboard-paid", (req, res) => {
  const affiliates = readAffiliates();
  const clicks = readJSON(AFFILIATE_CLICKS_FILE, []);
  const conversions = readJSON(AFFILIATE_CONVERSIONS_FILE, []);

  const stats = affiliates.map((affiliate) => {
    const code = clean(affiliate.affiliateCode).toUpperCase();
    const affiliateClicks = clicks.filter((x) => clean(x.affiliateCode).toUpperCase() === code);
    const affiliateConversions = conversions.filter((x) => clean(x.affiliateCode).toUpperCase() === code);
    const paidConversions = affiliateConversions.filter((x) => clean(x.status).toUpperCase() === "PAID");
    const pendingConversions = affiliateConversions.filter((x) => clean(x.status).toUpperCase() !== "PAID");

    return {
      affiliateCode: affiliate.affiliateCode,
      businessName: affiliate.businessName,
      contactName: affiliate.contactName,
      email: affiliate.email,
      status: affiliate.status,
      referralLink: affiliate.referralLink,
      clicks: affiliateClicks.length,

      conversions: paidConversions.length,
      pendingConversions: pendingConversions.length,

      paidBookingValue: money(paidConversions.reduce((sum, x) => sum + number(x.amount), 0)),
      payableCommission: money(paidConversions.reduce((sum, x) => sum + number(x.commissionAmount), 0)),

      pendingBookingValue: money(pendingConversions.reduce((sum, x) => sum + number(x.amount), 0)),
      pendingCommission: money(pendingConversions.reduce((sum, x) => sum + number(x.commissionAmount), 0)),

      currency: affiliateConversions[0]?.currency || "GBP",
      createdAt: affiliate.createdAt
    };
  });

  res.json({
    ok: true,
    generatedAt: nowISO(),
    rule: "Only PAID affiliate conversions count as payable commission.",
    totals: {
      affiliates: affiliates.length,
      clicks: clicks.length,
      paidConversions: conversions.filter((x) => clean(x.status).toUpperCase() === "PAID").length,
      pendingConversions: conversions.filter((x) => clean(x.status).toUpperCase() !== "PAID").length,
      pendingApplications: affiliates.filter((x) => x.status === "PENDING_REVIEW").length
    },
    stats,
    recentPaidConversions: conversions.filter((x) => clean(x.status).toUpperCase() === "PAID").slice(0, 50),
    recentPendingConversions: conversions.filter((x) => clean(x.status).toUpperCase() !== "PAID").slice(0, 50)
  });
});
// MSH PAID AFFILIATE COMMISSION OVERRIDE END




// MSH AFFILIATE PORTAL API START
function affiliatePublicCommissionRate(affiliate) {
  const custom = number(affiliate.commissionRate);
  if (custom > 0 && custom < 3) return custom;
  if (custom > 3 && clean(affiliate.tier).toUpperCase() === "STRATEGIC") return custom;
  return 3;
}

app.post("/api/affiliate-portal/login", (req, res) => {
  const email = clean(req.body.email).toLowerCase();
  const affiliateCode = clean(req.body.affiliateCode || req.body.code).toUpperCase();

  const affiliates = readAffiliates();
  const affiliate = affiliates.find((x) =>
    clean(x.email).toLowerCase() === email &&
    clean(x.affiliateCode).toUpperCase() === affiliateCode
  );

  if (!affiliate) {
    return res.status(401).json({
      ok: false,
      message: "We could not find an approved affiliate account with those details."
    });
  }

  if (clean(affiliate.status).toUpperCase() !== "APPROVED") {
    return res.status(403).json({
      ok: false,
      message: "Your affiliate account is not approved yet."
    });
  }

  res.json({
    ok: true,
    message: "Affiliate login successful.",
    affiliate: {
      affiliateCode: affiliate.affiliateCode,
      businessName: affiliate.businessName,
      contactName: affiliate.contactName,
      email: affiliate.email,
      status: affiliate.status,
      referralLink: affiliate.referralLink,
      commissionRate: affiliatePublicCommissionRate(affiliate),
      minimumPayout: 50,
      payoutSchedule: "Monthly"
    }
  });
});

app.get("/api/affiliate-portal/dashboard", (req, res) => {
  const email = clean(req.query.email).toLowerCase();
  const affiliateCode = clean(req.query.affiliateCode || req.query.code).toUpperCase();

  const affiliates = readAffiliates();
  const affiliate = affiliates.find((x) =>
    clean(x.email).toLowerCase() === email &&
    clean(x.affiliateCode).toUpperCase() === affiliateCode
  );

  if (!affiliate) {
    return res.status(401).json({
      ok: false,
      message: "Affiliate account not found."
    });
  }

  if (clean(affiliate.status).toUpperCase() !== "APPROVED") {
    return res.status(403).json({
      ok: false,
      message: "Affiliate account is not approved yet."
    });
  }

  const code = clean(affiliate.affiliateCode).toUpperCase();
  const clicks = readJSON(AFFILIATE_CLICKS_FILE, []).filter((x) => clean(x.affiliateCode).toUpperCase() === code);

  const allConversions = readJSON(AFFILIATE_CONVERSIONS_FILE, []);
  const conversions = allConversions.filter((x) => clean(x.affiliateCode).toUpperCase() === code);

  const paidConversions = conversions.filter((x) => clean(x.status).toUpperCase() === "PAID");
  const pendingConversions = conversions.filter((x) => {
    const status = clean(x.status).toUpperCase();
    return status !== "PAID" && status !== "CANCELLED" && status !== "REFUNDED";
  });

  const payableCommission = money(paidConversions.reduce((sum, x) => sum + number(x.commissionAmount), 0));
  const pendingCommission = money(pendingConversions.reduce((sum, x) => sum + number(x.commissionAmount), 0));
  const paidBookingValue = money(paidConversions.reduce((sum, x) => sum + number(x.amount), 0));
  const pendingBookingValue = money(pendingConversions.reduce((sum, x) => sum + number(x.amount), 0));
  const conversionRate = clicks.length > 0 ? money((paidConversions.length / clicks.length) * 100) : 0;
  const minimumPayout = 50;

  res.json({
    ok: true,
    generatedAt: nowISO(),
    affiliate: {
      affiliateCode: affiliate.affiliateCode,
      businessName: affiliate.businessName,
      contactName: affiliate.contactName,
      email: affiliate.email,
      status: affiliate.status,
      referralLink: affiliate.referralLink,
      commissionRate: affiliatePublicCommissionRate(affiliate),
      minimumPayout,
      payoutSchedule: "Monthly",
      createdAt: affiliate.createdAt
    },
    summary: {
      clicks: clicks.length,
      paidBookings: paidConversions.length,
      pendingBookings: pendingConversions.length,
      conversionRatePercent: conversionRate,
      paidBookingValue,
      pendingBookingValue,
      payableCommission,
      pendingCommission,
      lifetimeCommission: money(payableCommission + pendingCommission),
      nextPayoutThreshold: minimumPayout,
      amountNeededForPayout: money(Math.max(0, minimumPayout - payableCommission))
    },
    recentClicks: clicks.slice(0, 25),
    bookings: conversions.slice(0, 100).map((x) => ({
      createdAt: x.createdAt,
      bookingRef: x.bookingRef,
      hotelName: x.hotelName,
      customerEmail: x.customerEmail,
      amount: money(x.amount),
      currency: x.currency || "GBP",
      commissionRate: number(x.commissionRate || affiliatePublicCommissionRate(affiliate)),
      commissionAmount: money(x.commissionAmount),
      status: x.status,
      paidAt: x.paidAt || ""
    }))
  });
});
// MSH AFFILIATE PORTAL API END


// MSH AFFILIATE PORTAL BOOKING FALLBACK START
function buildAffiliatePortalDashboard(affiliate) {
  const code = clean(affiliate.affiliateCode).toUpperCase();
  const rate = 3;
  const minimumPayout = 50;

  const clicks = readJSON(AFFILIATE_CLICKS_FILE, []).filter((x) => clean(x.affiliateCode).toUpperCase() === code);
  const conversionRows = readJSON(AFFILIATE_CONVERSIONS_FILE, []).filter((x) => clean(x.affiliateCode).toUpperCase() === code);
  const bookingRows = readJSON(BOOKINGS_FILE, []).filter((booking) => {
    const bookingAffiliate =
      clean(booking.affiliateCode) ||
      clean(booking.affiliate_code) ||
      clean(booking.ref) ||
      clean(booking.referralCode) ||
      clean(booking.referral_code);

    return bookingAffiliate.toUpperCase() === code;
  });

  const merged = [];

  for (const x of conversionRows) {
    merged.push({
      source: "conversion",
      createdAt: x.createdAt || "",
      bookingRef: clean(x.bookingRef),
      hotelName: clean(x.hotelName),
      customerEmail: clean(x.customerEmail),
      amount: money(x.amount),
      currency: clean(x.currency || "GBP").toUpperCase(),
      commissionRate: number(x.commissionRate || rate),
      commissionAmount: money(x.commissionAmount || (number(x.amount) * rate / 100)),
      status: clean(x.status || "PENDING_PAYMENT").toUpperCase(),
      paidAt: x.paidAt || ""
    });
  }

  for (const booking of bookingRows) {
    const existing = merged.find((x) => clean(x.bookingRef) === clean(booking.bookingRef));
    if (existing) continue;

    const status = clean(booking.status || "PENDING_PAYMENT").toUpperCase();
    const amount = money(booking.amount);
    merged.push({
      source: "booking",
      createdAt: booking.createdAt || "",
      bookingRef: clean(booking.bookingRef),
      hotelName: clean(booking.hotelName),
      customerEmail: clean(booking.customerEmail),
      amount,
      currency: clean(booking.currency || "GBP").toUpperCase(),
      commissionRate: rate,
      commissionAmount: money(amount * rate / 100),
      status,
      paidAt: booking.paidAt || ""
    });
  }

  const paidConversions = merged.filter((x) => clean(x.status).toUpperCase() === "PAID");
  const pendingConversions = merged.filter((x) => {
    const status = clean(x.status).toUpperCase();
    return status !== "PAID" && status !== "CANCELLED" && status !== "REFUNDED";
  });

  const payableCommission = money(paidConversions.reduce((sum, x) => sum + number(x.commissionAmount), 0));
  const pendingCommission = money(pendingConversions.reduce((sum, x) => sum + number(x.commissionAmount), 0));
  const paidBookingValue = money(paidConversions.reduce((sum, x) => sum + number(x.amount), 0));
  const pendingBookingValue = money(pendingConversions.reduce((sum, x) => sum + number(x.amount), 0));
  const conversionRate = clicks.length > 0 ? money((paidConversions.length / clicks.length) * 100) : 0;

  return {
    affiliate: {
      affiliateCode: affiliate.affiliateCode,
      businessName: affiliate.businessName,
      contactName: affiliate.contactName,
      email: affiliate.email,
      status: affiliate.status,
      referralLink: affiliate.referralLink,
      commissionRate: rate,
      minimumPayout,
      payoutSchedule: "Monthly",
      createdAt: affiliate.createdAt
    },
    summary: {
      clicks: clicks.length,
      paidBookings: paidConversions.length,
      pendingBookings: pendingConversions.length,
      conversionRatePercent: conversionRate,
      paidBookingValue,
      pendingBookingValue,
      payableCommission,
      pendingCommission,
      lifetimeCommission: money(payableCommission + pendingCommission),
      nextPayoutThreshold: minimumPayout,
      amountNeededForPayout: money(Math.max(0, minimumPayout - payableCommission))
    },
    recentClicks: clicks.slice(0, 25),
    bookings: merged.slice(0, 100)
  };
}

app.get("/api/affiliate-portal/dashboard-v2", (req, res) => {
  const email = clean(req.query.email).toLowerCase();
  const affiliateCode = clean(req.query.affiliateCode || req.query.code).toUpperCase();

  const affiliate = readAffiliates().find((x) =>
    clean(x.email).toLowerCase() === email &&
    clean(x.affiliateCode).toUpperCase() === affiliateCode
  );

  if (!affiliate) {
    return res.status(401).json({ ok: false, message: "Affiliate account not found." });
  }

  if (clean(affiliate.status).toUpperCase() !== "APPROVED") {
    return res.status(403).json({ ok: false, message: "Affiliate account is not approved yet." });
  }

  const dashboard = buildAffiliatePortalDashboard(affiliate);

  res.json({
    ok: true,
    generatedAt: nowISO(),
    ...dashboard
  });
});
// MSH AFFILIATE PORTAL BOOKING FALLBACK END


// MSH AFFILIATE PAYOUT CENTRE START
const AFFILIATE_PAYOUTS_FILE = path.join(DATA_DIR, "affiliate_payouts.json");
ensureFile(AFFILIATE_PAYOUTS_FILE, []);

function affiliatePayoutSummary(affiliateCode) {
  const code = clean(affiliateCode).toUpperCase();
  const payouts = readJSON(AFFILIATE_PAYOUTS_FILE, []).filter((x) => clean(x.affiliateCode).toUpperCase() === code);
  const paidTotal = money(payouts.filter((x) => clean(x.status).toUpperCase() === "PAID").reduce((sum, x) => sum + number(x.amount), 0));
  const pendingPayoutTotal = money(payouts.filter((x) => clean(x.status).toUpperCase() !== "PAID").reduce((sum, x) => sum + number(x.amount), 0));

  return {
    paidTotal,
    pendingPayoutTotal,
    payouts: payouts.slice(0, 100)
  };
}

app.get("/api/affiliate-portal/payout-centre", (req, res) => {
  const email = clean(req.query.email).toLowerCase();
  const affiliateCode = clean(req.query.affiliateCode || req.query.code).toUpperCase();

  const affiliate = readAffiliates().find((x) =>
    clean(x.email).toLowerCase() === email &&
    clean(x.affiliateCode).toUpperCase() === affiliateCode
  );

  if (!affiliate) {
    return res.status(401).json({ ok: false, message: "Affiliate account not found." });
  }

  if (clean(affiliate.status).toUpperCase() !== "APPROVED") {
    return res.status(403).json({ ok: false, message: "Affiliate account is not approved yet." });
  }

  const dashboard = buildAffiliatePortalDashboard(affiliate);
  const payout = affiliatePayoutSummary(affiliateCode);
  const available = money(dashboard.summary.payableCommission - payout.pendingPayoutTotal - payout.paidTotal);
  const minimumPayout = 50;

  res.json({
    ok: true,
    generatedAt: nowISO(),
    affiliate: dashboard.affiliate,
    payoutCentre: {
      availableCommission: available,
      minimumPayout,
      amountNeededForPayout: money(Math.max(0, minimumPayout - available)),
      eligibleForPayout: available >= minimumPayout,
      nextScheduledPayout: "Monthly payout review",
      paymentMethod: "Bank transfer after approval",
      paidTotal: payout.paidTotal,
      pendingPayoutTotal: payout.pendingPayoutTotal,
      payoutHistory: payout.payouts
    }
  });
});

app.post("/api/internal/affiliate-payouts/create", (req, res) => {
  const affiliateCode = clean(req.body.affiliateCode).toUpperCase();
  const amount = money(req.body.amount);
  const currency = clean(req.body.currency || "GBP").toUpperCase();
  const note = clean(req.body.note || "Affiliate payout review");

  if (!affiliateCode || amount <= 0) {
    return res.status(400).json({ ok: false, message: "affiliateCode and amount are required." });
  }

  const affiliate = readAffiliates().find((x) => clean(x.affiliateCode).toUpperCase() === affiliateCode);

  if (!affiliate) {
    return res.status(404).json({ ok: false, message: "Affiliate not found." });
  }

  const payouts = readJSON(AFFILIATE_PAYOUTS_FILE, []);
  const payout = {
    id: crypto.randomUUID(),
    createdAt: nowISO(),
    affiliateCode,
    businessName: affiliate.businessName,
    contactName: affiliate.contactName,
    email: affiliate.email,
    amount,
    currency,
    status: "PENDING_REVIEW",
    note
  };

  payouts.unshift(payout);
  writeJSON(AFFILIATE_PAYOUTS_FILE, payouts);

  res.json({ ok: true, payout });
});

app.post("/api/internal/affiliate-payouts/mark-paid", (req, res) => {
  const payoutId = clean(req.body.payoutId);
  const paymentReference = clean(req.body.paymentReference || "MANUAL-PAYOUT");

  const payouts = readJSON(AFFILIATE_PAYOUTS_FILE, []);
  const index = payouts.findIndex((x) => clean(x.id) === payoutId);

  if (index < 0) {
    return res.status(404).json({ ok: false, message: "Payout not found." });
  }

  payouts[index] = {
    ...payouts[index],
    status: "PAID",
    paidAt: nowISO(),
    paymentReference
  };

  writeJSON(AFFILIATE_PAYOUTS_FILE, payouts);

  res.json({ ok: true, payout: payouts[index] });
});
// MSH AFFILIATE PAYOUT CENTRE END


// MSH AFFILIATE PHASE 2 START
const AFFILIATE_PAYMENT_DETAILS_FILE = path.join(DATA_DIR, "affiliate_payment_details.json");
const AFFILIATE_PAYOUT_REQUESTS_FILE = path.join(DATA_DIR, "affiliate_payout_requests.json");

ensureFile(AFFILIATE_PAYMENT_DETAILS_FILE, []);
ensureFile(AFFILIATE_PAYOUT_REQUESTS_FILE, []);

function findApprovedAffiliateByLogin(email, affiliateCode) {
  const mail = clean(email).toLowerCase();
  const code = clean(affiliateCode).toUpperCase();

  const affiliate = readAffiliates().find((x) =>
    clean(x.email).toLowerCase() === mail &&
    clean(x.affiliateCode).toUpperCase() === code
  );

  if (!affiliate) return null;
  if (clean(affiliate.status).toUpperCase() !== "APPROVED") return null;

  return affiliate;
}

app.get("/api/affiliate-portal/payment-details", (req, res) => {
  const email = clean(req.query.email).toLowerCase();
  const affiliateCode = clean(req.query.affiliateCode || req.query.code).toUpperCase();
  const affiliate = findApprovedAffiliateByLogin(email, affiliateCode);

  if (!affiliate) {
    return res.status(401).json({ ok: false, message: "Approved affiliate account not found." });
  }

  const rows = readJSON(AFFILIATE_PAYMENT_DETAILS_FILE, []);
  const details = rows.find((x) => clean(x.affiliateCode).toUpperCase() === affiliateCode) || null;

  res.json({
    ok: true,
    affiliateCode,
    paymentDetails: details
      ? {
          paymentMethod: details.paymentMethod,
          accountName: details.accountName,
          bankName: details.bankName,
          sortCodeLast2: clean(details.sortCode).slice(-2),
          accountNumberLast4: clean(details.accountNumber).slice(-4),
          paypalEmail: details.paypalEmail,
          updatedAt: details.updatedAt || details.createdAt
        }
      : null
  });
});

app.post("/api/affiliate-portal/payment-details", (req, res) => {
  const email = clean(req.body.email).toLowerCase();
  const affiliateCode = clean(req.body.affiliateCode || req.body.code).toUpperCase();
  const affiliate = findApprovedAffiliateByLogin(email, affiliateCode);

  if (!affiliate) {
    return res.status(401).json({ ok: false, message: "Approved affiliate account not found." });
  }

  const paymentMethod = clean(req.body.paymentMethod || "BANK_TRANSFER").toUpperCase();
  const accountName = clean(req.body.accountName);
  const bankName = clean(req.body.bankName);
  const sortCode = clean(req.body.sortCode);
  const accountNumber = clean(req.body.accountNumber);
  const paypalEmail = clean(req.body.paypalEmail);

  if (paymentMethod === "BANK_TRANSFER" && (!accountName || !bankName || !sortCode || !accountNumber)) {
    return res.status(400).json({
      ok: false,
      message: "Please provide account name, bank name, sort code and account number."
    });
  }

  if (paymentMethod === "PAYPAL" && !paypalEmail) {
    return res.status(400).json({
      ok: false,
      message: "Please provide PayPal email address."
    });
  }

  const rows = readJSON(AFFILIATE_PAYMENT_DETAILS_FILE, []);
  const index = rows.findIndex((x) => clean(x.affiliateCode).toUpperCase() === affiliateCode);

  const row = {
    id: index >= 0 ? rows[index].id : crypto.randomUUID(),
    affiliateCode,
    businessName: affiliate.businessName,
    contactName: affiliate.contactName,
    email: affiliate.email,
    paymentMethod,
    accountName,
    bankName,
    sortCode,
    accountNumber,
    paypalEmail,
    updatedAt: nowISO(),
    createdAt: index >= 0 ? rows[index].createdAt : nowISO()
  };

  if (index >= 0) rows[index] = row;
  else rows.unshift(row);

  writeJSON(AFFILIATE_PAYMENT_DETAILS_FILE, rows.slice(0, 5000));

  res.json({
    ok: true,
    message: "Payment details saved.",
    paymentDetails: {
      paymentMethod: row.paymentMethod,
      accountName: row.accountName,
      bankName: row.bankName,
      sortCodeLast2: row.sortCode.slice(-2),
      accountNumberLast4: row.accountNumber.slice(-4),
      paypalEmail: row.paypalEmail,
      updatedAt: row.updatedAt
    }
  });
});

app.post("/api/affiliate-portal/request-payout", (req, res) => {
  const email = clean(req.body.email).toLowerCase();
  const affiliateCode = clean(req.body.affiliateCode || req.body.code).toUpperCase();
  const affiliate = findApprovedAffiliateByLogin(email, affiliateCode);

  if (!affiliate) {
    return res.status(401).json({ ok: false, message: "Approved affiliate account not found." });
  }

  const dashboard = buildAffiliatePortalDashboard(affiliate);
  const payout = affiliatePayoutSummary(affiliateCode);
  const availableCommission = money(dashboard.summary.payableCommission - payout.pendingPayoutTotal - payout.paidTotal);
  const minimumPayout = 50;

  if (availableCommission < minimumPayout) {
    return res.status(400).json({
      ok: false,
      message: `Payout can be requested once available commission reaches GBP ${minimumPayout}.`,
      availableCommission,
      minimumPayout
    });
  }

  const paymentRows = readJSON(AFFILIATE_PAYMENT_DETAILS_FILE, []);
  const paymentDetails = paymentRows.find((x) => clean(x.affiliateCode).toUpperCase() === affiliateCode);

  if (!paymentDetails) {
    return res.status(400).json({
      ok: false,
      message: "Please save payment details before requesting payout."
    });
  }

  const requests = readJSON(AFFILIATE_PAYOUT_REQUESTS_FILE, []);
  const openRequest = requests.find((x) =>
    clean(x.affiliateCode).toUpperCase() === affiliateCode &&
    ["PENDING_REVIEW", "APPROVED"].includes(clean(x.status).toUpperCase())
  );

  if (openRequest) {
    return res.status(400).json({
      ok: false,
      message: "You already have an open payout request.",
      payoutRequest: openRequest
    });
  }

  const payoutRequest = {
    id: crypto.randomUUID(),
    requestReference: makeRef("PAYOUT"),
    createdAt: nowISO(),
    affiliateCode,
    businessName: affiliate.businessName,
    contactName: affiliate.contactName,
    email: affiliate.email,
    amount: availableCommission,
    currency: "GBP",
    status: "PENDING_REVIEW",
    paymentMethod: paymentDetails.paymentMethod,
    note: clean(req.body.note || "Affiliate payout requested from portal.")
  };

  requests.unshift(payoutRequest);
  writeJSON(AFFILIATE_PAYOUT_REQUESTS_FILE, requests.slice(0, 5000));

  res.json({
    ok: true,
    message: "Payout request submitted for review.",
    payoutRequest
  });
});

app.get("/api/affiliate-portal/payout-requests", (req, res) => {
  const email = clean(req.query.email).toLowerCase();
  const affiliateCode = clean(req.query.affiliateCode || req.query.code).toUpperCase();
  const affiliate = findApprovedAffiliateByLogin(email, affiliateCode);

  if (!affiliate) {
    return res.status(401).json({ ok: false, message: "Approved affiliate account not found." });
  }

  const requests = readJSON(AFFILIATE_PAYOUT_REQUESTS_FILE, [])
    .filter((x) => clean(x.affiliateCode).toUpperCase() === affiliateCode)
    .slice(0, 100);

  res.json({
    ok: true,
    affiliateCode,
    payoutRequests: requests
  });
});

app.get("/api/internal/affiliate-payout-requests", (req, res) => {
  const requests = readJSON(AFFILIATE_PAYOUT_REQUESTS_FILE, []);
  res.json({
    ok: true,
    generatedAt: nowISO(),
    total: requests.length,
    pending: requests.filter((x) => clean(x.status).toUpperCase() === "PENDING_REVIEW").length,
    approved: requests.filter((x) => clean(x.status).toUpperCase() === "APPROVED").length,
    paid: requests.filter((x) => clean(x.status).toUpperCase() === "PAID").length,
    rejected: requests.filter((x) => clean(x.status).toUpperCase() === "REJECTED").length,
    payoutRequests: requests.slice(0, 300)
  });
});

app.post("/api/internal/affiliate-payout-requests/:id/approve", (req, res) => {
  const id = clean(req.params.id);
  const requests = readJSON(AFFILIATE_PAYOUT_REQUESTS_FILE, []);
  const index = requests.findIndex((x) => clean(x.id) === id || clean(x.requestReference) === id);

  if (index < 0) {
    return res.status(404).json({ ok: false, message: "Payout request not found." });
  }

  requests[index] = {
    ...requests[index],
    status: "APPROVED",
    approvedAt: nowISO(),
    adminNote: clean(req.body.note || "")
  };

  writeJSON(AFFILIATE_PAYOUT_REQUESTS_FILE, requests);

  res.json({
    ok: true,
    message: "Payout request approved.",
    payoutRequest: requests[index]
  });
});

app.post("/api/internal/affiliate-payout-requests/:id/mark-paid", (req, res) => {
  const id = clean(req.params.id);
  const paymentReference = clean(req.body.paymentReference || "MANUAL-PAYOUT");
  const requests = readJSON(AFFILIATE_PAYOUT_REQUESTS_FILE, []);
  const index = requests.findIndex((x) => clean(x.id) === id || clean(x.requestReference) === id);

  if (index < 0) {
    return res.status(404).json({ ok: false, message: "Payout request not found." });
  }

  requests[index] = {
    ...requests[index],
    status: "PAID",
    paidAt: nowISO(),
    paymentReference,
    adminNote: clean(req.body.note || requests[index].adminNote || "")
  };

  writeJSON(AFFILIATE_PAYOUT_REQUESTS_FILE, requests);

  const payouts = readJSON(AFFILIATE_PAYOUTS_FILE, []);
  payouts.unshift({
    id: crypto.randomUUID(),
    createdAt: nowISO(),
    affiliateCode: requests[index].affiliateCode,
    businessName: requests[index].businessName,
    contactName: requests[index].contactName,
    email: requests[index].email,
    amount: money(requests[index].amount),
    currency: requests[index].currency || "GBP",
    status: "PAID",
    paidAt: nowISO(),
    paymentReference,
    sourceRequestId: requests[index].id,
    sourceRequestReference: requests[index].requestReference,
    note: "Paid from affiliate payout request."
  });
  writeJSON(AFFILIATE_PAYOUTS_FILE, payouts.slice(0, 5000));

  res.json({
    ok: true,
    message: "Payout request marked as paid.",
    payoutRequest: requests[index]
  });
});

app.post("/api/internal/affiliate-payout-requests/:id/reject", (req, res) => {
  const id = clean(req.params.id);
  const requests = readJSON(AFFILIATE_PAYOUT_REQUESTS_FILE, []);
  const index = requests.findIndex((x) => clean(x.id) === id || clean(x.requestReference) === id);

  if (index < 0) {
    return res.status(404).json({ ok: false, message: "Payout request not found." });
  }

  requests[index] = {
    ...requests[index],
    status: "REJECTED",
    rejectedAt: nowISO(),
    adminNote: clean(req.body.note || "Rejected after review.")
  };

  writeJSON(AFFILIATE_PAYOUT_REQUESTS_FILE, requests);

  res.json({
    ok: true,
    message: "Payout request rejected.",
    payoutRequest: requests[index]
  });
});
// MSH AFFILIATE PHASE 2 END

app.get("/api/internal/affiliate-dashboard", (req, res) => {
  const affiliates = readAffiliates();
  const clicks = readJSON(AFFILIATE_CLICKS_FILE, []);
  const conversions = readJSON(AFFILIATE_CONVERSIONS_FILE, []);

  const stats = affiliates.map((affiliate) => {
    const code = clean(affiliate.affiliateCode).toUpperCase();
    const affiliateClicks = clicks.filter((x) => clean(x.affiliateCode).toUpperCase() === code);
    const affiliateConversions = conversions.filter((x) => clean(x.affiliateCode).toUpperCase() === code);

    return {
      affiliateCode: affiliate.affiliateCode,
      businessName: affiliate.businessName,
      contactName: affiliate.contactName,
      email: affiliate.email,
      status: affiliate.status,
      referralLink: affiliate.referralLink,
      clicks: affiliateClicks.length,
      conversions: affiliateConversions.length,
      totalBookingValue: money(affiliateConversions.reduce((sum, x) => sum + number(x.amount), 0)),
      totalCommission: money(affiliateConversions.reduce((sum, x) => sum + number(x.commissionAmount), 0)),
      currency: affiliateConversions[0]?.currency || "GBP",
      createdAt: affiliate.createdAt
    };
  });

  res.json({
    ok: true,
    generatedAt: nowISO(),
    totals: {
      affiliates: affiliates.length,
      clicks: clicks.length,
      conversions: conversions.length,
      pendingApplications: affiliates.filter((x) => x.status === "PENDING_REVIEW").length
    },
    stats,
    recentClicks: clicks.slice(0, 50),
    recentConversions: conversions.slice(0, 50)
  });
});
// MSH AFFILIATE NETWORK END


// MSH BOOKING FINANCE DASHBOARD START
function estimateStripeFee(amount, currency) {
  const value = money(amount);
  const ccy = clean(currency || "GBP").toUpperCase();

  // Conservative UK card estimate. Replace with exact Stripe balance transaction later.
  const percent = ccy === "GBP" ? 0.015 : 0.025;
  const fixed = ccy === "GBP" ? 0.20 : 0.25;

  return money((value * percent) + fixed);
}

function estimateSupplierCost(booking) {
  const customerAmount = money(booking.amount);

  // Temporary conservative estimate until supplier net-rate settlement is added.
  // Assumes MySpace gross markup around 15%.
  const supplierCost = money(customerAmount * 0.85);

  return supplierCost;
}

function affiliateCommissionForBooking(booking, conversions) {
  const ref = clean(booking.bookingRef);
  const conversion = conversions.find((x) => clean(x.bookingRef) === ref);

  if (!conversion) {
    return {
      affiliateCode: "",
      status: "NONE",
      commissionRate: 0,
      commissionAmount: 0,
      payableCommission: 0,
      pendingCommission: 0
    };
  }

  const status = clean(conversion.status).toUpperCase();
  const amount = money(conversion.commissionAmount);

  return {
    affiliateCode: clean(conversion.affiliateCode),
    status,
    commissionRate: number(conversion.commissionRate),
    commissionAmount: amount,
    payableCommission: status === "PAID" ? amount : 0,
    pendingCommission: status === "PAID" ? 0 : amount
  };
}

function supplierForBooking(booking) {
  const tracking = booking.internalSupplierTracking || {};
  const supplier = typeof resolveSupplierForAdmin === "function"
    ? resolveSupplierForAdmin(tracking)
    : {
        supplier_code: clean(tracking.supplier_code || tracking.supplier_name || "UNKNOWN"),
        supplier_name: clean(tracking.supplier_name || tracking.supplier_code || "Unknown"),
        supplier_type: "unknown",
        status: "unknown"
      };

  return supplier;
}

app.get("/api/internal/booking-finance-dashboard", (req, res) => {
  const bookings = readJSON(BOOKINGS_FILE, []);
  const conversions = readJSON(AFFILIATE_CONVERSIONS_FILE, []);

  const rows = bookings.map((booking) => {
    const customerPaid = money(booking.amount);
    const currency = clean(booking.currency || "GBP").toUpperCase();
    const supplierCost = estimateSupplierCost(booking);
    const stripeFee = estimateStripeFee(customerPaid, currency);
    const affiliate = affiliateCommissionForBooking(booking, conversions);
    const payableAffiliate = money(affiliate.payableCommission);
    const estimatedMargin = money(customerPaid - supplierCost - stripeFee - payableAffiliate);
    const supplier = supplierForBooking(booking);

    return {
      bookingRef: booking.bookingRef,
      confirmationReference: booking.confirmationReference,
      status: booking.status,
      createdAt: booking.createdAt,
      paidAt: booking.paidAt || "",
      hotelId: booking.hotelId,
      hotelName: booking.hotelName,
      country: booking.country,
      city: booking.city,
      customerEmail: booking.customerEmail,

      currency,
      customerPaid,
      supplierCostEstimate: supplierCost,
      stripeFeeEstimate: stripeFee,

      affiliateCode: affiliate.affiliateCode,
      affiliateStatus: affiliate.status,
      affiliateCommissionRate: affiliate.commissionRate,
      affiliateCommissionTotal: affiliate.commissionAmount,
      affiliateCommissionPayable: affiliate.payableCommission,
      affiliateCommissionPending: affiliate.pendingCommission,

      myspaceEstimatedMargin: estimatedMargin,
      myspaceEstimatedMarginPercent: customerPaid > 0 ? money((estimatedMargin / customerPaid) * 100) : 0,

      supplier,
      rate_source_id: booking.rate_source_id || booking.internalSupplierTracking?.rate_source_id || "",
      rate_source_timestamp: booking.rate_source_timestamp || booking.internalSupplierTracking?.rate_source_timestamp || ""
    };
  });

  const totals = rows.reduce((acc, row) => {
    acc.bookings += 1;
    acc.customerPaid += row.customerPaid;
    acc.supplierCostEstimate += row.supplierCostEstimate;
    acc.stripeFeeEstimate += row.stripeFeeEstimate;
    acc.affiliateCommissionPayable += row.affiliateCommissionPayable;
    acc.affiliateCommissionPending += row.affiliateCommissionPending;
    acc.myspaceEstimatedMargin += row.myspaceEstimatedMargin;
    if (row.status === "PAID") acc.paidBookings += 1;
    if (row.status === "PENDING_PAYMENT") acc.pendingBookings += 1;
    if (row.status === "CANCELLED") acc.cancelledBookings += 1;
    return acc;
  }, {
    bookings: 0,
    paidBookings: 0,
    pendingBookings: 0,
    cancelledBookings: 0,
    customerPaid: 0,
    supplierCostEstimate: 0,
    stripeFeeEstimate: 0,
    affiliateCommissionPayable: 0,
    affiliateCommissionPending: 0,
    myspaceEstimatedMargin: 0
  });

  for (const key of Object.keys(totals)) {
    if (typeof totals[key] === "number") totals[key] = money(totals[key]);
  }

  res.json({
    ok: true,
    generatedAt: nowISO(),
    rule: "Finance dashboard estimates margin. Replace supplier cost and Stripe fee with exact settlement values when available.",
    totals,
    bookings: rows.slice(0, 200)
  });
});
// MSH BOOKING FINANCE DASHBOARD END

app.get("/api/certification/logs", (req, res) => {
  res.json({
    ok: true,
    message: "Service activity records are available.",
    logs: readJSON(SERVICE_ACTIVITY_FILE, [])
  });
});


// MSH ANCILLARY REVENUE STREAMS START
const INSURANCE_BOOKINGS_FILE = path.join(DATA_DIR, "travel_insurance_bookings.json");
const TRANSFER_BOOKINGS_FILE = path.join(DATA_DIR, "airport_transfer_bookings.json");
const ATTRACTION_BOOKINGS_FILE = path.join(DATA_DIR, "attraction_bookings.json");
const FEATURED_HOTELS_FILE = path.join(DATA_DIR, "featured_hotel_advertising.json");

ensureFile(INSURANCE_BOOKINGS_FILE, []);
ensureFile(TRANSFER_BOOKINGS_FILE, []);
ensureFile(ATTRACTION_BOOKINGS_FILE, []);
ensureFile(FEATURED_HOTELS_FILE, []);

function ancillaryRef(prefix) {
  return `${prefix}-${Date.now()}-${crypto.randomBytes(3).toString("hex").toUpperCase()}`;
}

function ancillaryCommission(amount, rate) {
  return money(number(amount) * number(rate) / 100);
}

app.get("/api/insurance/options", (req, res) => {
  const destination = clean(req.query.destination || req.query.city || "your trip");
  const tripTotal = money(req.query.tripTotal || req.query.total || 0);
  const base = tripTotal > 0 ? Math.max(12, tripTotal * 0.06) : 24;

  res.json({
    ok: true,
    destination,
    options: [
      {
        id: "single-trip-standard",
        name: "Single Trip Standard",
        description: "Trip cancellation, travel disruption and emergency support cover.",
        price: 0,
        currency: "GBP",
        commissionRate: 25,
        recommended: true
      },
      {
        id: "family-trip-cover",
        name: "Family Trip Cover",
        description: "Flexible travel protection for families travelling together.",
        price: 0,
        currency: "GBP",
        commissionRate: 25,
        recommended: false
      },
      {
        id: "business-travel-cover",
        name: "Business Travel Cover",
        description: "Travel protection designed for business and corporate trips.",
        price: 0,
        currency: "GBP",
        commissionRate: 25,
        recommended: false
      }
    ]
  });
});

app.post("/api/insurance/book", async (req, res) => {
  const rows = readJSON(INSURANCE_BOOKINGS_FILE, []);
  const amount = money(req.body.amount || req.body.price || 0);
  const commissionRate = number(req.body.commissionRate || 25);

  const row = {
    id: crypto.randomUUID(),
    reference: ancillaryRef("INS"),
    createdAt: nowISO(),
    bookingRef: clean(req.body.bookingRef),
    hotelName: clean(req.body.hotelName),
    destination: clean(req.body.destination || req.body.city),
    customerName: clean(req.body.customerName),
    customerEmail: clean(req.body.customerEmail),
    productId: clean(req.body.productId),
    productName: clean(req.body.productName || "Travel Insurance"),
    amount,
    currency: clean(req.body.currency || "GBP").toUpperCase(),
    commissionRate,
    commissionAmount: ancillaryCommission(amount, commissionRate),
    status: "REQUESTED"
  };

  rows.unshift(row);
  writeJSON(INSURANCE_BOOKINGS_FILE, rows.slice(0, 5000));

  await sendEmailNotification("New travel insurance request - MySpace Hotel", [
    ["Reference", row.reference],
    ["Hotel booking", row.bookingRef],
    ["Hotel", row.hotelName],
    ["Destination", row.destination],
    ["Customer", row.customerName],
    ["Email", row.customerEmail],
    ["Product", row.productName],
    ["Amount", `${row.currency} ${row.amount}`],
    ["Commission estimate", `${row.currency} ${row.commissionAmount}`],
    ["Created", row.createdAt]
  ]);

  res.json({
    ok: true,
    message: "Travel insurance request received.",
    insurance: row
  });
});

app.get("/api/transfers/search", (req, res) => {
  const city = clean(req.query.city || "Destination");
  const currency = clean(req.query.currency || "GBP").toUpperCase();

  res.json({
    ok: true,
    city,
    currency,
    options: [
      {
        id: "airport-standard",
        name: "Standard Airport Transfer",
        description: `Private transfer between the airport and your hotel in ${city}.`,
        price: 0,
        currency,
        commissionRate: 18,
        passengers: "1-3"
      },
      {
        id: "airport-family",
        name: "Family / Group Transfer",
        description: `Larger vehicle for families, groups and luggage in ${city}.`,
        price: 0,
        currency,
        commissionRate: 18,
        passengers: "4-7"
      },
      {
        id: "airport-executive",
        name: "Executive Transfer",
        description: `Premium transfer option for business and comfort travel in ${city}.`,
        price: 0,
        currency,
        commissionRate: 18,
        passengers: "1-3"
      }
    ]
  });
});

app.post("/api/transfers/book", async (req, res) => {
  const rows = readJSON(TRANSFER_BOOKINGS_FILE, []);
  const amount = money(req.body.amount || req.body.price || 0);
  const commissionRate = number(req.body.commissionRate || 18);

  const row = {
    id: crypto.randomUUID(),
    reference: ancillaryRef("TRF"),
    createdAt: nowISO(),
    bookingRef: clean(req.body.bookingRef),
    hotelName: clean(req.body.hotelName),
    city: clean(req.body.city),
    country: clean(req.body.country),
    customerName: clean(req.body.customerName),
    customerEmail: clean(req.body.customerEmail),
    transferType: clean(req.body.transferType || req.body.productName || "Airport Transfer"),
    pickup: clean(req.body.pickup || "Airport"),
    dropoff: clean(req.body.dropoff || req.body.hotelName || "Hotel"),
    travelDate: clean(req.body.travelDate),
    amount,
    currency: clean(req.body.currency || "GBP").toUpperCase(),
    commissionRate,
    commissionAmount: ancillaryCommission(amount, commissionRate),
    status: "REQUESTED"
  };

  rows.unshift(row);
  writeJSON(TRANSFER_BOOKINGS_FILE, rows.slice(0, 5000));

  await sendEmailNotification("New airport transfer request - MySpace Hotel", [
    ["Reference", row.reference],
    ["Hotel booking", row.bookingRef],
    ["Hotel", row.hotelName],
    ["Destination", `${row.city}, ${row.country}`],
    ["Customer", row.customerName],
    ["Email", row.customerEmail],
    ["Transfer", row.transferType],
    ["Route", `${row.pickup} to ${row.dropoff}`],
    ["Amount", `${row.currency} ${row.amount}`],
    ["Commission estimate", `${row.currency} ${row.commissionAmount}`],
    ["Created", row.createdAt]
  ]);

  res.json({
    ok: true,
    message: "Airport transfer request received.",
    transfer: row
  });
});

app.get("/api/attractions", (req, res) => {
  const city = clean(req.query.city || "Destination");
  const currency = clean(req.query.currency || "GBP").toUpperCase();

  res.json({
    ok: true,
    city,
    currency,
    attractions: [
      {
        id: "city-tour",
        name: `${city} City Tour`,
        category: "Sightseeing",
        description: "A customer-friendly city tour option for discovering the destination.",
        price: 0,
        currency,
        commissionRate: 15
      },
      {
        id: "museum-culture-pass",
        name: "Museums and Culture Pass",
        category: "Culture",
        description: "A useful option for museums, galleries and cultural attractions.",
        price: 0,
        currency,
        commissionRate: 15
      },
      {
        id: "family-attractions",
        name: "Family Attractions",
        category: "Family",
        description: "Family-friendly attractions such as parks, zoos and visitor experiences.",
        price: 0,
        currency,
        commissionRate: 15
      },
      {
        id: "evening-experience",
        name: "Evening Experience",
        category: "Experience",
        description: "Evening activity suggestions for customers who want more from their trip.",
        price: 0,
        currency,
        commissionRate: 15
      }
    ]
  });
});

app.post("/api/attractions/book", async (req, res) => {
  const rows = readJSON(ATTRACTION_BOOKINGS_FILE, []);
  const amount = money(req.body.amount || req.body.price || 0);
  const commissionRate = number(req.body.commissionRate || 15);

  const row = {
    id: crypto.randomUUID(),
    reference: ancillaryRef("ACT"),
    createdAt: nowISO(),
    bookingRef: clean(req.body.bookingRef),
    hotelName: clean(req.body.hotelName),
    city: clean(req.body.city),
    country: clean(req.body.country),
    customerName: clean(req.body.customerName),
    customerEmail: clean(req.body.customerEmail),
    attractionId: clean(req.body.attractionId),
    attractionName: clean(req.body.attractionName || "Tours and Attractions"),
    category: clean(req.body.category),
    travelDate: clean(req.body.travelDate),
    guests: number(req.body.guests || 1),
    amount,
    currency: clean(req.body.currency || "GBP").toUpperCase(),
    commissionRate,
    commissionAmount: ancillaryCommission(amount, commissionRate),
    status: "REQUESTED"
  };

  rows.unshift(row);
  writeJSON(ATTRACTION_BOOKINGS_FILE, rows.slice(0, 5000));

  await sendEmailNotification("New tours and attractions request - MySpace Hotel", [
    ["Reference", row.reference],
    ["Hotel booking", row.bookingRef],
    ["Hotel", row.hotelName],
    ["Destination", `${row.city}, ${row.country}`],
    ["Customer", row.customerName],
    ["Email", row.customerEmail],
    ["Attraction", row.attractionName],
    ["Guests", String(row.guests)],
    ["Amount", `${row.currency} ${row.amount}`],
    ["Commission estimate", `${row.currency} ${row.commissionAmount}`],
    ["Created", row.createdAt]
  ]);

  res.json({
    ok: true,
    message: "Tours and attractions request received.",
    attractionBooking: row
  });
});

app.post("/api/hotels/feature", async (req, res) => {
  const rows = readJSON(FEATURED_HOTELS_FILE, []);
  const packageName = clean(req.body.packageName || "Bronze").toUpperCase();
  const amountMap = { BRONZE: 49, SILVER: 99, GOLD: 199, PLATINUM: 499 };
  const amount = money(req.body.amount || amountMap[packageName] || 49);

  const row = {
    id: crypto.randomUUID(),
    reference: ancillaryRef("AD"),
    createdAt: nowISO(),
    hotelName: clean(req.body.hotelName),
    country: clean(req.body.country),
    city: clean(req.body.city),
    contactName: clean(req.body.contactName),
    contactEmail: clean(req.body.contactEmail),
    phone: clean(req.body.phone),
    website: clean(req.body.website),
    packageName,
    amount,
    currency: clean(req.body.currency || "GBP").toUpperCase(),
    status: "PENDING_REVIEW",
    notes: clean(req.body.notes)
  };

  rows.unshift(row);
  writeJSON(FEATURED_HOTELS_FILE, rows.slice(0, 5000));

  await sendEmailNotification("New featured hotel advertising request - MySpace Hotel", [
    ["Reference", row.reference],
    ["Hotel", row.hotelName],
    ["Destination", `${row.city}, ${row.country}`],
    ["Contact", row.contactName],
    ["Email", row.contactEmail],
    ["Package", row.packageName],
    ["Amount", `${row.currency} ${row.amount}`],
    ["Created", row.createdAt]
  ]);

  res.json({
    ok: true,
    message: "Featured hotel advertising request received.",
    featuredHotel: row
  });
});

app.get("/api/internal/ancillary-dashboard", (req, res) => {
  const insurance = readJSON(INSURANCE_BOOKINGS_FILE, []);
  const transfers = readJSON(TRANSFER_BOOKINGS_FILE, []);
  const attractions = readJSON(ATTRACTION_BOOKINGS_FILE, []);
  const featured = readJSON(FEATURED_HOTELS_FILE, []);

  function totals(rows) {
    return rows.reduce((acc, x) => {
      acc.count += 1;
      acc.revenue += money(x.amount);
      acc.commission += money(x.commissionAmount || x.amount);
      return acc;
    }, { count: 0, revenue: 0, commission: 0 });
  }

  const data = {
    insurance: totals(insurance),
    transfers: totals(transfers),
    attractions: totals(attractions),
    featuredHotels: totals(featured)
  };

  const totalRevenue = money(data.insurance.revenue + data.transfers.revenue + data.attractions.revenue + data.featuredHotels.revenue);
  const totalCommission = money(data.insurance.commission + data.transfers.commission + data.attractions.commission + data.featuredHotels.commission);

  res.json({
    ok: true,
    generatedAt: nowISO(),
    totals: {
      totalRevenue,
      totalCommission,
      requests: data.insurance.count + data.transfers.count + data.attractions.count + data.featuredHotels.count
    },
    streams: data,
    latest: {
      insurance: insurance.slice(0, 25),
      transfers: transfers.slice(0, 25),
      attractions: attractions.slice(0, 25),
      featuredHotels: featured.slice(0, 25)
    }
  });
});

app.get("/api/internal/insurance-dashboard", (req, res) => {
  const rows = readJSON(INSURANCE_BOOKINGS_FILE, []);
  res.json({ ok: true, total: rows.length, insuranceBookings: rows });
});

app.get("/api/internal/transfer-dashboard", (req, res) => {
  const rows = readJSON(TRANSFER_BOOKINGS_FILE, []);
  res.json({ ok: true, total: rows.length, transferBookings: rows });
});

app.get("/api/internal/attraction-dashboard", (req, res) => {
  const rows = readJSON(ATTRACTION_BOOKINGS_FILE, []);
  res.json({ ok: true, total: rows.length, attractionBookings: rows });
});

app.get("/api/internal/advertising-dashboard", (req, res) => {
  const rows = readJSON(FEATURED_HOTELS_FILE, []);
  res.json({ ok: true, total: rows.length, featuredHotels: rows });
});
// MSH ANCILLARY REVENUE STREAMS END


// MSH REAL ANCILLARY EMAIL ROUTES START
const MSH_ANCILLARY_DIR = path.join(__dirname, "data");
const MSH_ANCILLARY_INSURANCE_FILE = path.join(MSH_ANCILLARY_DIR, "travel_insurance_leads.json");
const MSH_ANCILLARY_TRANSFER_FILE = path.join(MSH_ANCILLARY_DIR, "airport_transfer_leads.json");
const MSH_ANCILLARY_ATTRACTION_FILE = path.join(MSH_ANCILLARY_DIR, "attraction_leads.json");
const MSH_ANCILLARY_FEATURED_FILE = path.join(MSH_ANCILLARY_DIR, "hotel_partner_visibility_leads.json");

function mshEnsureJson(file, fallback) {
  try {
    if (!fs.existsSync(MSH_ANCILLARY_DIR)) fs.mkdirSync(MSH_ANCILLARY_DIR, { recursive: true });
    if (!fs.existsSync(file)) fs.writeFileSync(file, JSON.stringify(fallback, null, 2), "utf8");
  } catch (err) {
    console.error("MSH ensure json failed:", err.message);
  }
}

function mshReadJson(file, fallback) {
  try {
    mshEnsureJson(file, fallback);
    return JSON.parse(fs.readFileSync(file, "utf8"));
  } catch {
    return fallback;
  }
}

function mshWriteJson(file, data) {
  mshEnsureJson(file, []);
  fs.writeFileSync(file, JSON.stringify(data, null, 2), "utf8");
}

function mshClean(v) {
  return String(v || "").trim();
}

function mshLeadRef(prefix) {
  return `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2, 8).toUpperCase()}`;
}

async function mshSendAncillaryEmail(subject, lead) {
  const apiKey = process.env.RESEND_API_KEY;
  const from =
    process.env.RESEND_FROM ||
    process.env.SMTP_FROM ||
    process.env.RESERVATIONS_EMAIL ||
    "reservations@myspace-hotel.com";

  const to =
    process.env.RESERVATIONS_EMAIL ||
    process.env.EMAIL_TO ||
    process.env.SMTP_FROM ||
    "reservations@myspace-hotel.com";

  const rows = Object.entries(lead)
    .map(([key, value]) => `<tr><td style="padding:8px;border:1px solid #ddd;font-weight:bold;">${key}</td><td style="padding:8px;border:1px solid #ddd;">${String(value || "")}</td></tr>`)
    .join("");

  const html = `
    <div style="font-family:Arial,sans-serif;color:#0b1d51;">
      <h2>${subject}</h2>
      <p>A new MySpace Hotel customer or partner request has been received.</p>
      <table style="border-collapse:collapse;width:100%;max-width:800px;">${rows}</table>
    </div>
  `;

  if (!apiKey) {
    console.error("MSH ancillary email not sent: RESEND_API_KEY missing.");
    return { sent: false, reason: "RESEND_API_KEY missing" };
  }

  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${apiKey}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      from,
      to,
      subject,
      html
    })
  });

  const text = await response.text();

  if (!response.ok) {
    console.error("MSH ancillary email failed:", response.status, text);
    return { sent: false, reason: text };
  }

  return { sent: true, provider: "resend" };
}

app.post("/api/ancillary/insurance/book", async (req, res) => {
  const leads = mshReadJson(MSH_ANCILLARY_INSURANCE_FILE, []);
  const lead = {
    reference: mshLeadRef("INS"),
    createdAt: new Date().toISOString(),
    type: "Trip Protection Quote Request",
    hotelName: mshClean(req.body.hotelName),
    destination: mshClean(req.body.destination),
    customerName: mshClean(req.body.customerName),
    customerEmail: mshClean(req.body.customerEmail),
    productName: mshClean(req.body.productName),
    status: "REQUEST_RECEIVED_PRICE_NOT_CONFIRMED"
  };

  leads.unshift(lead);
  mshWriteJson(MSH_ANCILLARY_INSURANCE_FILE, leads.slice(0, 5000));

  const email = await mshSendAncillaryEmail("New Trip Protection Quote Request - MySpace Hotel", lead);
  res.json({ ok: true, message: "Trip protection request received.", lead, emailSent: email.sent });
});

app.post("/api/ancillary/transfers/book", async (req, res) => {
  const leads = mshReadJson(MSH_ANCILLARY_TRANSFER_FILE, []);
  const lead = {
    reference: mshLeadRef("TRF"),
    createdAt: new Date().toISOString(),
    type: "Airport Transfer Quote Request",
    hotelName: mshClean(req.body.hotelName),
    city: mshClean(req.body.city),
    country: mshClean(req.body.country),
    customerName: mshClean(req.body.customerName),
    customerEmail: mshClean(req.body.customerEmail),
    transferType: mshClean(req.body.transferType),
    pickup: mshClean(req.body.pickup),
    dropoff: mshClean(req.body.dropoff),
    travelDate: mshClean(req.body.travelDate),
    status: "REQUEST_RECEIVED_PRICE_NOT_CONFIRMED"
  };

  leads.unshift(lead);
  mshWriteJson(MSH_ANCILLARY_TRANSFER_FILE, leads.slice(0, 5000));

  const email = await mshSendAncillaryEmail("New Airport Transfer Quote Request - MySpace Hotel", lead);
  res.json({ ok: true, message: "Airport transfer request received.", lead, emailSent: email.sent });
});

app.post("/api/ancillary/attractions/book", async (req, res) => {
  const leads = mshReadJson(MSH_ANCILLARY_ATTRACTION_FILE, []);
  const lead = {
    reference: mshLeadRef("ACT"),
    createdAt: new Date().toISOString(),
    type: "Things To Do Availability Request",
    hotelName: mshClean(req.body.hotelName),
    city: mshClean(req.body.city),
    country: mshClean(req.body.country),
    customerName: mshClean(req.body.customerName),
    customerEmail: mshClean(req.body.customerEmail),
    attractionName: mshClean(req.body.attractionName),
    category: mshClean(req.body.category),
    travelDate: mshClean(req.body.travelDate),
    guests: mshClean(req.body.guests),
    status: "REQUEST_RECEIVED_PRICE_NOT_CONFIRMED"
  };

  leads.unshift(lead);
  mshWriteJson(MSH_ANCILLARY_ATTRACTION_FILE, leads.slice(0, 5000));

  const email = await mshSendAncillaryEmail("New Things To Do Availability Request - MySpace Hotel", lead);
  res.json({ ok: true, message: "Things to do request received.", lead, emailSent: email.sent });
});

app.post("/api/ancillary/hotels/feature", async (req, res) => {
  const leads = mshReadJson(MSH_ANCILLARY_FEATURED_FILE, []);
  const lead = {
    reference: mshLeadRef("HOTEL"),
    createdAt: new Date().toISOString(),
    type: "Hotel Partner Visibility Request",
    hotelName: mshClean(req.body.hotelName),
    country: mshClean(req.body.country),
    city: mshClean(req.body.city),
    contactName: mshClean(req.body.contactName),
    contactEmail: mshClean(req.body.contactEmail),
    phone: mshClean(req.body.phone),
    website: mshClean(req.body.website),
    packageName: mshClean(req.body.packageName),
    status: "REQUEST_RECEIVED_COMMERCIAL_TERMS_NOT_CONFIRMED"
  };

  leads.unshift(lead);
  mshWriteJson(MSH_ANCILLARY_FEATURED_FILE, leads.slice(0, 5000));

  const email = await mshSendAncillaryEmail("New Hotel Partner Visibility Request - MySpace Hotel", lead);
  res.json({ ok: true, message: "Hotel partner request received.", lead, emailSent: email.sent });
});
// MSH REAL ANCILLARY EMAIL ROUTES END
// MSH RATEHAWK SANDBOX CONNECTOR START
function ratehawkConfig() {
  const enabled = String(process.env.RATEHAWK_ENABLED || "").toLowerCase() === "true";
  const baseUrl = clean(process.env.RATEHAWK_BASE_URL || "https://api-sandbox.worldota.net").replace(/\/$/, "");
  const keyId = clean(process.env.RATEHAWK_KEY_ID);
  const keyToken = clean(process.env.RATEHAWK_KEY_TOKEN);
  const userAgent = clean(process.env.RATEHAWK_USER_AGENT || "MySpaceHotel/1.0");
  const env = clean(process.env.RATEHAWK_ENV || "sandbox");

  return {
    enabled,
    env,
    baseUrl,
    keyId,
    keyToken,
    userAgent,
    ready: Boolean(enabled && baseUrl && keyId && keyToken)
  };
}

function ratehawkAuthHeader() {
  const cfg = ratehawkConfig();
  return `Basic ${Buffer.from(`${cfg.keyId}:${cfg.keyToken}`).toString("base64")}`;
}

async function ratehawkPost(pathname, body) {
  const cfg = ratehawkConfig();

  if (!cfg.ready) {
    return {
      ok: false,
      status: 400,
      data: {
        message: "RateHawk is not configured. Check RATEHAWK_ENABLED, RATEHAWK_BASE_URL, RATEHAWK_KEY_ID and RATEHAWK_KEY_TOKEN."
      }
    };
  }

  const url = `${cfg.baseUrl}${pathname}`;

  const response = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: ratehawkAuthHeader(),
      "Content-Type": "application/json",
      "User-Agent": cfg.userAgent
    },
    body: JSON.stringify(body || {})
  });

  const text = await response.text();
  let data = {};

  try {
    data = text ? JSON.parse(text) : {};
  } catch {
    data = { raw: text.slice(0, 1000) };
  }

  return {
    ok: response.ok,
    status: response.status,
    data
  };
}

app.get("/api/ratehawk/status", (req, res) => {
  const cfg = ratehawkConfig();

  res.json({
    ok: true,
    enabled: cfg.enabled,
    env: cfg.env,
    baseUrl: cfg.baseUrl,
    hasKeyId: Boolean(cfg.keyId),
    hasKeyToken: Boolean(cfg.keyToken),
    userAgent: cfg.userAgent,
    ready: cfg.ready,
    message: cfg.ready ? "RateHawk connector is configured." : "RateHawk connector is not ready."
  });
});

app.get("/api/ratehawk/test", async (req, res) => {
  try {
    const checkin = clean(req.query.checkin || req.query.checkIn || tomorrowISOForRatehawk(14));
    const checkout = clean(req.query.checkout || req.query.checkOut || tomorrowISOForRatehawk(15));
    const residency = clean(req.query.residency || "gb").toLowerCase();
    const language = clean(req.query.language || "en");
    const regionId = Number(req.query.region_id || req.query.regionId || 2011);

    const payload = {
      checkin,
      checkout,
      residency,
      language,
      guests: [
        {
          adults: 2,
          children: []
        }
      ],
      region_id: regionId,
      currency: "USD"
    };

    const result = await ratehawkPost("/api/b2b/v3/search/serp/region/", payload);

    recordActivity("ratehawk_test", {
      region_id: regionId,
      checkin,
      checkout,
      residency,
      language
    }, {
      ok: result.ok,
      status: result.status
    });

    res.status(result.ok ? 200 : 502).json({
      ok: result.ok,
      supplier: "configured_private_supplier",
      status: result.status,
      request: {
        region_id: regionId,
        checkin,
        checkout,
        residency,
        language,
        currency: "USD"
      },
      result: result.data
    });
  } catch (err) {
    recordActivity("ratehawk_test_error", {}, { error: err.message });

    res.status(500).json({
      ok: false,
      message: "RateHawk test failed.",
      error: err.message
    });
  }
});

function tomorrowISOForRatehawk(daysAhead) {
  const d = new Date(Date.now() + Number(daysAhead || 1) * 86400000);
  return d.toISOString().slice(0, 10);
}
// MSH RATEHAWK SANDBOX CONNECTOR END
// MSH WEBBEDS DOTW XML CONNECTOR START
function webbedsConfig() {
  const enabled = String(process.env.WEBBEDS_ENABLED || "").toLowerCase() === "true";
  const baseUrl = clean(process.env.WEBBEDS_BASE_URL || "https://xmldev.dotwconnect.com/gatewayV4.dotw");
  const username = clean(process.env.WEBBEDS_USERNAME);
  const password = clean(process.env.WEBBEDS_PASSWORD);
  const companyId = clean(process.env.WEBBEDS_COMPANY_ID || process.env.WEBBEDS_COMPANY_CODE);
  const source = clean(process.env.WEBBEDS_SOURCE || "1");

  return {
    enabled,
    env: clean(process.env.WEBBEDS_ENV || "sandbox"),
    baseUrl,
    username,
    password,
    companyId,
    source,
    userAgent: clean(process.env.WEBBEDS_USER_AGENT || "MySpaceHotel/1.0"),
    ready: Boolean(enabled && baseUrl && username && password && companyId)
  };
}

function webbedsMd5Password() {
  return crypto.createHash("md5").update(webbedsConfig().password).digest("hex");
}

function xmlEscapeValue(v) {
  return clean(v)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}

function webbedsDateISO(daysAhead) {
  const d = new Date(Date.now() + Number(daysAhead || 1) * 86400000);
  return d.toISOString().slice(0, 10);
}

function webbedsCustomerXml(innerXml) {
  const cfg = webbedsConfig();

  return `<customer>
  <username>${xmlEscapeValue(cfg.username)}</username>
  <password>${webbedsMd5Password()}</password>
  <id>${xmlEscapeValue(cfg.companyId)}</id>
  <source>${xmlEscapeValue(cfg.source)}</source>
  <product>hotel</product>
  ${innerXml}
</customer>`;
}

async function webbedsPostXml(xml) {
  const cfg = webbedsConfig();

  if (!cfg.ready) {
    return {
      ok: false,
      status: 400,
      text: "WebBeds is not configured. Check WEBBEDS_ENABLED, WEBBEDS_BASE_URL, WEBBEDS_USERNAME, WEBBEDS_PASSWORD and WEBBEDS_COMPANY_ID."
    };
  }

  const response = await fetch(cfg.baseUrl, {
    method: "POST",
    headers: {
      "Content-Type": "text/xml",
      "Accept-Encoding": "gzip",
      "Connection": "close",
      "User-Agent": cfg.userAgent
    },
    body: xml
  });

  const text = await response.text();

  return {
    ok: response.ok,
    status: response.status,
    text
  };
}

function buildWebbedsInternalCodeXml(command) {
  return webbedsCustomerXml(`<request command="${xmlEscapeValue(command)}"></request>`);
}

function positiveIntegerOrBlank(v) {
  const value = clean(v);
  return /^[1-9][0-9]*$/.test(value) ? value : "";
}

function buildWebbedsSearchXml(query) {
  const fromDate = xmlEscapeValue(query.fromDate || query.checkIn || query.checkin || webbedsDateISO(14));
  const toDate = xmlEscapeValue(query.toDate || query.checkOut || query.checkout || webbedsDateISO(15));

  const cityId = positiveIntegerOrBlank(query.cityId || query.city_id || query.city);
  const currencyId = positiveIntegerOrBlank(query.currencyId || query.currency_id || query.currency);
  const nationalityId = positiveIntegerOrBlank(query.nationalityId || query.nationality_id || query.passengerNationality);
  const residenceId = positiveIntegerOrBlank(query.residenceId || query.residence_id || query.passengerCountryOfResidence);
  const adults = positiveIntegerOrBlank(query.adults || 2) || "2";

  if (!cityId || !currencyId || !nationalityId || !residenceId) {
    return {
      ok: false,
      message: "DOTW/WebBeds search requires numeric internal IDs, not names. Use /api/webbeds/internal-code/getallcities, /api/webbeds/internal-code/getcurrenciesids and /api/webbeds/internal-code/getallcountries first.",
      required: {
        cityId: "numeric DOTW city ID",
        currencyId: "numeric DOTW currency ID",
        nationalityId: "numeric DOTW country/nationality ID",
        residenceId: "numeric DOTW country/residence ID"
      },
      received: {
        city: clean(query.city || query.cityId || ""),
        currency: clean(query.currency || query.currencyId || ""),
        nationality: clean(query.nationality || query.nationalityId || query.passengerNationality || ""),
        residence: clean(query.residence || query.residenceId || query.passengerCountryOfResidence || "")
      }
    };
  }

  return {
    ok: true,
    xml: webbedsCustomerXml(`<request command="searchhotels">
    <bookingDetails>
      <fromDate>${fromDate}</fromDate>
      <toDate>${toDate}</toDate>
      <currency>${currencyId}</currency>
      <rooms no="1">
        <room runno="0">
          <adultsCode>${adults}</adultsCode>
          <children no="0"></children>
          <rateBasis>-1</rateBasis>
          <passengerNationality>${nationalityId}</passengerNationality>
          <passengerCountryOfResidence>${residenceId}</passengerCountryOfResidence>
        </room>
      </rooms>
    </bookingDetails>
    <return>
      <filters xmlns:c="http://us.dotwconnect.com/xsd/complexCondition" xmlns:a="http://us.dotwconnect.com/xsd/atomicCondition">
        <city>${cityId}</city>
      </filters>
    </return>
  </request>`)
  };
}

app.get("/api/webbeds/status", (req, res) => {
  const cfg = webbedsConfig();

  res.json({
    ok: true,
    enabled: cfg.enabled,
    env: cfg.env,
    baseUrl: cfg.baseUrl,
    hasUsername: Boolean(cfg.username),
    hasPassword: Boolean(cfg.password),
    hasCompanyId: Boolean(cfg.companyId),
    source: cfg.source,
    ready: cfg.ready,
    message: cfg.ready ? "WebBeds connector is configured." : "WebBeds connector is not ready."
  });
});

app.get("/api/webbeds/internal-code/:command", async (req, res) => {
  try {
    const allowed = new Set([
      "getallcities",
      "getallcountries",
      "getservingcities",
      "getservingcountries",
      "getcurrenciesids",
      "getlanguageids",
      "getleisureids",
      "getbusinessids",
      "getamenitieids",
      "getroomamenitieids",
      "getsalutationsids",
      "getspecialrequestsids",
      "gethotelchainsids",
      "gethotelclassificationids",
      "getratebasisids",
      "getlocationids"
    ]);

    const command = clean(req.params.command).toLowerCase();

    if (!allowed.has(command)) {
      return res.status(400).json({
        ok: false,
        message: "Unsupported WebBeds internal-code command.",
        allowed: Array.from(allowed).sort()
      });
    }

    const xml = buildWebbedsInternalCodeXml(command);
    const result = await webbedsPostXml(xml);

    recordActivity("webbeds_internal_code", { command }, {
      ok: result.ok,
      status: result.status,
      preview: result.text.slice(0, 500)
    });

    res.status(result.ok ? 200 : 502).json({
      ok: result.ok,
      command,
      status: result.status,
      responsePreview: result.text
    });
  } catch (err) {
    recordActivity("webbeds_internal_code_error", { command: req.params.command }, { error: err.message });
    res.status(500).json({ ok: false, message: "WebBeds internal-code request failed.", error: err.message });
  }
});

app.get("/api/webbeds/test-search", async (req, res) => {
  try {
    const built = buildWebbedsSearchXml(req.query);

    if (!built.ok) {
      return res.status(400).json(built);
    }

    const result = await webbedsPostXml(built.xml);

    recordActivity("webbeds_test_search", {
      cityId: clean(req.query.cityId || req.query.city || ""),
      currencyId: clean(req.query.currencyId || req.query.currency || ""),
      nationalityId: clean(req.query.nationalityId || req.query.passengerNationality || ""),
      residenceId: clean(req.query.residenceId || req.query.passengerCountryOfResidence || "")
    }, {
      ok: result.ok,
      status: result.status,
      preview: result.text.slice(0, 500)
    });

    res.status(result.ok ? 200 : 502).json({
      ok: result.ok,
      supplier: "configured_private_supplier",
      status: result.status,
      responsePreview: result.text
    });
  } catch (err) {
    recordActivity("webbeds_test_search_error", {}, { error: err.message });
    res.status(500).json({ ok: false, message: "WebBeds test search failed.", error: err.message });
  }
});

// MSH WEBBEDS JSON SEARCH NORMALIZER START
function extractXmlTag(block, tag) {
  const match = String(block || "").match(new RegExp("<" + tag + ">([\\s\\S]*?)<\\/" + tag + ">", "i"));
  return match ? clean(match[1]) : "";
}

function extractXmlAttr(block, attr) {
  const match = String(block || "").match(new RegExp(attr + "=\"([^\"]*)\"", "i"));
  return match ? clean(match[1]) : "";
}

function parseWebbedsHotels(xml, currencyCode) {
  const hotels = [];
  const hotelBlocks = String(xml || "").match(/<hotel[\s\S]*?<\/hotel>/gi) || [];

  for (const hotelBlock of hotelBlocks) {
    const hotelId = extractXmlAttr(hotelBlock, "hotelid");
    const roomBlocks = hotelBlock.match(/<roomType[\s\S]*?<\/roomType>/gi) || [];

    const rooms = [];

    for (const roomBlock of roomBlocks.slice(0, 10)) {
      const roomTypeCode = extractXmlAttr(roomBlock, "roomtypecode");
      const roomName = extractXmlTag(roomBlock, "name") || "Available room";
      const rateBlocks = roomBlock.match(/<rateBasis[\s\S]*?<\/rateBasis>/gi) || [];

      for (const rateBlock of rateBlocks.slice(0, 4)) {
        const rateBasisId = extractXmlAttr(rateBlock, "id");
        const total = money(extractXmlTag(rateBlock, "total"));

        if (total <= 0) continue;

        rooms.push({
          roomCode: roomTypeCode,
          roomName,
          board: `Rate basis ${rateBasisId || "standard"}`,
          price: total,
          convertedPrice: total,
          displayCurrency: currencyCode || "USD",
          cancellation: "Cancellation details are confirmed before booking.",
          taxes: "Taxes and fees are confirmed before booking.",
          rate_source_id: `WEBBEDS-${hotelId}-${roomTypeCode}-${rateBasisId}`,
          rate_source_timestamp: nowISO(),
          source_health: "verified",
          supplier_private: {
            supplier_code: "WEBBEDS",
            supplier_hotel_id: hotelId,
            room_type_code: roomTypeCode,
            rate_basis_id: rateBasisId
          }
        });
      }
    }

    rooms.sort((a, b) => number(a.price) - number(b.price));

    if (hotelId && rooms.length) {
      hotels.push({
        hotelId: `WEBBEDS-${hotelId}`,
        hotel_id: `WEBBEDS-${hotelId}`,
        name: `Hotel ${hotelId}`,
        hotel_name: `Hotel ${hotelId}`,
        country: "United Arab Emirates",
        city: "Abu Dhabi",
        area: "",
        address: "",
        stars: "",
        image: "",
        facilities: [],
        availableToBook: true,
        price: rooms[0].price,
        currency: rooms[0].displayCurrency,
        rooms: rooms.slice(0, 8),
        rate_source_id: rooms[0].rate_source_id,
        rate_source_timestamp: rooms[0].rate_source_timestamp,
        source_health: "verified"
      });
    }
  }

  hotels.sort((a, b) => number(a.price) - number(b.price));
  return hotels;
}

function webbedsCurrencyIdFromCode(code) {
  const c = clean(code || "USD").toUpperCase();
  if (c === "GBP") return "416";
  if (c === "EUR") return "413";
  return "520";
}

function webbedsCountryIdFromCode(code) {
  const c = clean(code || "GB").toUpperCase();
  if (c === "AE" || c === "UAE" || c === "UNITED ARAB EMIRATES") return "6";
  if (c === "US" || c === "USA" || c === "UNITED STATES") return "102";
  return "88";
}

function webbedsCityIdFromName(city) {
  const c = clean(city).toUpperCase();
  if (c === "ABU DHABI") return "334";
  return "";
}

app.get("/api/webbeds/search", async (req, res) => {
  try {
    const cityId = positiveIntegerOrBlank(req.query.cityId || req.query.city_id) || findWebbedsCityCodeFromCache(req.query.city) || webbedsCityIdFromName(req.query.city);
    const currencyId = positiveIntegerOrBlank(req.query.currencyId || req.query.currency_id) || webbedsCurrencyIdFromCode(req.query.currency);
    const nationalityId = positiveIntegerOrBlank(req.query.nationalityId || req.query.nationality_id) || webbedsCountryIdFromCode(req.query.nationality || "GB");
    const residenceId = positiveIntegerOrBlank(req.query.residenceId || req.query.residence_id) || webbedsCountryIdFromCode(req.query.residence || "GB");

    if (!cityId) {
      return res.status(400).json({
        ok: false,
        message: "This WebBeds city is not mapped yet. Use cityId directly or add the city to the WebBeds city map.",
        example: "/api/webbeds/search?cityId=334&currency=USD&nationality=GB&residence=GB"
      });
    }

    const built = buildWebbedsSearchXml({
      ...req.query,
      cityId,
      currencyId,
      nationalityId,
      residenceId
    });

    if (!built.ok) return res.status(400).json(built);

    const result = await webbedsPostXml(built.xml);
    const hotels = parseWebbedsHotels(result.text, clean(req.query.currency || "USD").toUpperCase());

    recordActivity("webbeds_json_search", {
      cityId,
      currencyId,
      nationalityId,
      residenceId,
      count: hotels.length
    }, {
      ok: result.ok,
      status: result.status
    });

    res.status(result.ok ? 200 : 502).json({
      ok: result.ok,
      supplier: "configured_private_supplier",
      source: "live",
      count: hotels.length,
      message: hotels.length ? "Verified live hotel rates returned." : `No verified live hotel rates were returned for ${resolvedCity}, ${country}. Try a nearby major city.`,
      hotels,
      quoteRequired: hotels.length === 0,
      quoteDestination: {
        country,
        city: resolvedCity,
        requestedCity: city,
        currency
      }
    });
  } catch (err) {
    recordActivity("webbeds_json_search_error", {}, { error: err.message });
    res.status(500).json({
      ok: false,
      message: "WebBeds JSON search failed.",
      error: err.message
    });
  }
});

// MSH WEBBEDS CITY MAP CACHE START
function parseWebbedsCityMap(xml) {
  const map = {};
  const cities = [];
  const cityBlocks = String(xml || "").match(/<city[\s\S]*?<\/city>/gi) || [];

  for (const block of cityBlocks) {
    const name = extractXmlTag(block, "name");
    const code = extractXmlTag(block, "code");

    if (!name || !code) continue;

    const key = clean(name).toUpperCase();
    map[key] = code;

    cities.push({
      name,
      key,
      code
    });
  }

  cities.sort((a, b) => a.name.localeCompare(b.name));

  return {
    generated_at: nowISO(),
    count: cities.length,
    map,
    cities
  };
}

function webbedsCityMapFile() {
  return path.join(DATA_DIR, "webbeds-city-map.json");
}

function loadWebbedsCityMap() {
  try {
    const file = webbedsCityMapFile();
    if (!fs.existsSync(file)) return null;
    return JSON.parse(fs.readFileSync(file, "utf8"));
  } catch {
    return null;
  }
}

function saveWebbedsCityMap(data) {
  fs.writeFileSync(webbedsCityMapFile(), JSON.stringify(data, null, 2), "utf8");
}

function findWebbedsCityCodeFromCache(city) {
  const cityMap = loadWebbedsCityMap();
  if (!cityMap || !cityMap.map) return "";

  const key = clean(city).toUpperCase();
  if (cityMap.map[key]) return cityMap.map[key];

  const partial = (cityMap.cities || []).find((item) => {
    const itemKey = clean(item.key || item.name).toUpperCase();
    return itemKey === key || itemKey.startsWith(key + " -") || itemKey.includes(key);
  });

  return partial ? clean(partial.code) : "";
}

app.get("/api/webbeds/build-city-map", async (req, res) => {
  try {
    const xml = buildWebbedsInternalCodeXml("getservingcities");
    const result = await webbedsPostXml(xml);

    if (!result.ok) {
      return res.status(502).json({
        ok: false,
        message: "Could not download WebBeds serving cities.",
        status: result.status,
        responsePreview: result.text.slice(0, 2000)
      });
    }

    const parsed = parseWebbedsCityMap(result.text);
    saveWebbedsCityMap(parsed);

    recordActivity("webbeds_build_city_map", {}, {
      ok: true,
      cities: parsed.count
    });

    res.json({
      ok: true,
      file: "backend/data/webbeds-city-map.json",
      count: parsed.count,
      generated_at: parsed.generated_at,
      examples: parsed.cities.slice(0, 120)
    });
  } catch (err) {
    recordActivity("webbeds_build_city_map_error", {}, { error: err.message });

    res.status(500).json({
      ok: false,
      message: "WebBeds city map build failed.",
      error: err.message
    });
  }
});

app.get("/api/webbeds/city-code", (req, res) => {
  const city = clean(req.query.city || req.query.q || "");
  const cityMap = loadWebbedsCityMap();

  if (!cityMap) {
    return res.status(404).json({
      ok: false,
      message: "WebBeds city map has not been built yet. Run /api/webbeds/build-city-map first."
    });
  }

  const code = findWebbedsCityCodeFromCache(city);

  res.json({
    ok: Boolean(code),
    city,
    code,
    message: code ? "City code found." : "City is not mapped yet."
  });
});

// MSH CUSTOMER LIVE HOTEL SEARCH VIA WEBBEDS START
app.get("/api/live-webbeds-hotels", async (req, res) => {
  try {
    const city = clean(req.query.city || req.query.destination || "DUBAI");
    const currency = clean(req.query.currency || "USD").toUpperCase();
    const nationality = clean(req.query.nationality || "GB");
    const residence = clean(req.query.residence || "GB");

    const cityId =
      positiveIntegerOrBlank(req.query.cityId || req.query.city_id) ||
      findWebbedsCityCodeFromCache(city) ||
      webbedsCityIdFromName(city);

    if (!cityId) {
      return res.status(400).json({
        ok: false,
        source: "live",
        message: "Live hotel rates are not available for this city yet.",
        city
      });
    }

    const built = buildWebbedsSearchXml({
      ...req.query,
      cityId,
      currencyId: webbedsCurrencyIdFromCode(currency),
      nationalityId: webbedsCountryIdFromCode(nationality),
      residenceId: webbedsCountryIdFromCode(residence)
    });

    if (!built.ok) return res.status(400).json(built);

    const result = await webbedsPostXml(built.xml);
    const hotels = parseWebbedsHotels(result.text, currency).map((hotel) => ({
      ...hotel,
      city,
      country: city.toUpperCase() === "DUBAI" || city.toUpperCase() === "ABU DHABI"
        ? "United Arab Emirates"
        : hotel.country,
      source: "live",
      supplier: "configured_private_supplier"
    }));

    return res.json({
      ok: result.ok,
      source: "live",
      city,
      cityId,
      currency,
      count: hotels.length,
      message: hotels.length ? "Verified live hotel rates returned." : `No verified live hotel rates were returned for ${resolvedCity}, ${country}. Try a nearby major city.`,
      hotels,
      quoteRequired: hotels.length === 0,
      quoteDestination: {
        country,
        city: resolvedCity,
        requestedCity: city,
        currency
      }
    });
  } catch (err) {
    res.status(500).json({
      ok: false,
      message: "Live hotel search failed.",
      error: err.message
    });
  }
});

// MSH WEBBEDS HOTEL DETAILS TEST START
function buildWebbedsHotelDetailsXml(hotelId) {
  return webbedsCustomerXml(`<request command="gethoteldetails">
    <hotelId>${xmlEscapeValue(hotelId)}</hotelId>
  </request>`);
}

app.get("/api/webbeds/hotel-details", async (req, res) => {
  try {
    const hotelId = clean(req.query.hotelId || req.query.hotelid || req.query.id || "");

    if (!hotelId) {
      return res.status(400).json({
        ok: false,
        message: "hotelId is required.",
        example: "/api/webbeds/hotel-details?hotelId=313455"
      });
    }

    const xml = buildWebbedsHotelDetailsXml(hotelId);
    const result = await webbedsPostXml(xml);

    recordActivity("webbeds_hotel_details", { hotelId }, {
      ok: result.ok,
      status: result.status,
      preview: result.text.slice(0, 500)
    });

    res.status(result.ok ? 200 : 502).json({
      ok: result.ok,
      supplier: "configured_private_supplier",
      hotelId,
      status: result.status,
      responsePreview: result.text.slice(0, 12000)
    });
  } catch (err) {
    recordActivity("webbeds_hotel_details_error", {}, { error: err.message });

    res.status(500).json({
      ok: false,
      message: "WebBeds hotel details request failed.",
      error: err.message
    });
  }
});

// MSH WEBBEDS HOTEL ID BATCH SEARCH START
function buildWebbedsHotelIdSearchXml(query) {
  const fromDate = xmlEscapeValue(query.fromDate || query.checkIn || query.checkin || webbedsDateISO(14));
  const toDate = xmlEscapeValue(query.toDate || query.checkOut || query.checkout || webbedsDateISO(15));

  const currencyId = positiveIntegerOrBlank(query.currencyId || query.currency_id) || webbedsCurrencyIdFromCode(query.currency);
  const nationalityId = positiveIntegerOrBlank(query.nationalityId || query.nationality_id) || webbedsCountryIdFromCode(query.nationality || "GB");
  const residenceId = positiveIntegerOrBlank(query.residenceId || query.residence_id) || webbedsCountryIdFromCode(query.residence || "GB");

  const hotelIds = clean(query.hotelIds || query.hotelids || query.ids || "")
    .split(",")
    .map((x) => clean(x))
    .filter((x) => /^[0-9]+$/.test(x))
    .slice(0, 50);

  if (!hotelIds.length) {
    return { ok: false, message: "hotelIds is required. Example: hotelIds=31354,31064,1073078" };
  }

  const fieldValues = hotelIds.map((id) => `<fieldValue>${xmlEscapeValue(id)}</fieldValue>`).join("");

  return {
    ok: true,
    xml: webbedsCustomerXml(`<request command="searchhotels">
    <bookingDetails>
      <fromDate>${fromDate}</fromDate>
      <toDate>${toDate}</toDate>
      <currency>${currencyId}</currency>
      <rooms no="1">
        <room runno="0">
          <adultsCode>2</adultsCode>
          <children no="0"></children>
          <rateBasis>-1</rateBasis>
          <passengerNationality>${nationalityId}</passengerNationality>
          <passengerCountryOfResidence>${residenceId}</passengerCountryOfResidence>
        </room>
      </rooms>
    </bookingDetails>
    <return>
      <filters xmlns:a="http://us.dotwconnect.com/xsd/atomicCondition" xmlns:c="http://us.dotwconnect.com/xsd/complexCondition">
        <c:condition>
          <a:condition>
            <fieldName>hotelId</fieldName>
            <fieldTest>in</fieldTest>
            <fieldValues>${fieldValues}</fieldValues>
          </a:condition>
        </c:condition>
      </filters>
    </return>
  </request>`)
  };
}

app.get("/api/webbeds/search-by-hotel-ids", async (req, res) => {
  try {
    const built = buildWebbedsHotelIdSearchXml(req.query);
    if (!built.ok) return res.status(400).json(built);

    const result = await webbedsPostXml(built.xml);
    const hotels = parseWebbedsHotels(result.text, clean(req.query.currency || "USD").toUpperCase());

    res.status(result.ok ? 200 : 502).json({
      ok: result.ok,
      supplier: "configured_private_supplier",
      source: "live_hotel_id_batch",
      status: result.status,
      count: hotels.length,
      message: hotels.length ? "Verified live hotel rates returned." : `No verified live hotel rates were returned for ${resolvedCity}, ${country}. Try a nearby major city.`,
      hotels,
      responsePreview: result.text.slice(0, 15000)
    });
  } catch (err) {
    res.status(500).json({
      ok: false,
      message: "WebBeds hotel ID batch search failed.",
      error: err.message
    });
  }
});
// MSH WEBBEDS HOTEL ID BATCH SEARCH END

// MSH WEBBEDS HOTEL DETAILS TEST END

// MSH CUSTOMER LIVE HOTEL SEARCH VIA WEBBEDS END

// MSH WEBBEDS CITY MAP CACHE END


// MSH WEBBEDS CITY MAP CACHE START
function parseWebbedsCityMap(xml) {
  const map = {};
  const cities = [];
  const cityBlocks = String(xml || "").match(/<city[\s\S]*?<\/city>/gi) || [];

  for (const block of cityBlocks) {
    const name = extractXmlTag(block, "name");
    const code = extractXmlTag(block, "code");

    if (!name || !code) continue;

    const key = clean(name).toUpperCase();
    map[key] = code;

    cities.push({
      name,
      key,
      code
    });
  }

  cities.sort((a, b) => a.name.localeCompare(b.name));

  return {
    generated_at: nowISO(),
    count: cities.length,
    map,
    cities
  };
}

function webbedsCityMapFile() {
  return path.join(DATA_DIR, "webbeds-city-map.json");
}

function loadWebbedsCityMap() {
  try {
    const file = webbedsCityMapFile();
    if (!fs.existsSync(file)) return null;
    return JSON.parse(fs.readFileSync(file, "utf8"));
  } catch {
    return null;
  }
}

function saveWebbedsCityMap(data) {
  fs.writeFileSync(webbedsCityMapFile(), JSON.stringify(data, null, 2), "utf8");
}

function findWebbedsCityCodeFromCache(city) {
  const cityMap = loadWebbedsCityMap();
  if (!cityMap || !cityMap.map) return "";

  const key = clean(city).toUpperCase();
  if (cityMap.map[key]) return cityMap.map[key];

  const partial = (cityMap.cities || []).find((item) => {
    const itemKey = clean(item.key || item.name).toUpperCase();
    return itemKey === key || itemKey.startsWith(key + " -") || itemKey.includes(key);
  });

  return partial ? clean(partial.code) : "";
}

app.get("/api/webbeds/build-city-map", async (req, res) => {
  try {
    const xml = buildWebbedsInternalCodeXml("getservingcities");
    const result = await webbedsPostXml(xml);

    if (!result.ok) {
      return res.status(502).json({
        ok: false,
        message: "Could not download WebBeds serving cities.",
        status: result.status,
        responsePreview: result.text.slice(0, 2000)
      });
    }

    const parsed = parseWebbedsCityMap(result.text);
    saveWebbedsCityMap(parsed);

    recordActivity("webbeds_build_city_map", {}, {
      ok: true,
      cities: parsed.count
    });

    res.json({
      ok: true,
      file: "backend/data/webbeds-city-map.json",
      count: parsed.count,
      generated_at: parsed.generated_at,
      examples: parsed.cities.slice(0, 120)
    });
  } catch (err) {
    recordActivity("webbeds_build_city_map_error", {}, { error: err.message });

    res.status(500).json({
      ok: false,
      message: "WebBeds city map build failed.",
      error: err.message
    });
  }
});

app.get("/api/webbeds/city-code", (req, res) => {
  const city = clean(req.query.city || req.query.q || "");
  const cityMap = loadWebbedsCityMap();

  if (!cityMap) {
    return res.status(404).json({
      ok: false,
      message: "WebBeds city map has not been built yet. Run /api/webbeds/build-city-map first."
    });
  }

  const code = findWebbedsCityCodeFromCache(city);

  res.json({
    ok: Boolean(code),
    city,
    code,
    message: code ? "City code found." : "City is not mapped yet."
  });
});

// MSH CUSTOMER LIVE HOTEL SEARCH VIA WEBBEDS START
app.get("/api/live-webbeds-hotels", async (req, res) => {
  try {
    const city = clean(req.query.city || req.query.destination || "DUBAI");
    const currency = clean(req.query.currency || "USD").toUpperCase();
    const nationality = clean(req.query.nationality || "GB");
    const residence = clean(req.query.residence || "GB");

    const cityId =
      positiveIntegerOrBlank(req.query.cityId || req.query.city_id) ||
      findWebbedsCityCodeFromCache(city) ||
      webbedsCityIdFromName(city);

    if (!cityId) {
      return res.status(400).json({
        ok: false,
        source: "live",
        message: "Live hotel rates are not available for this city yet.",
        city
      });
    }

    const built = buildWebbedsSearchXml({
      ...req.query,
      cityId,
      currencyId: webbedsCurrencyIdFromCode(currency),
      nationalityId: webbedsCountryIdFromCode(nationality),
      residenceId: webbedsCountryIdFromCode(residence)
    });

    if (!built.ok) return res.status(400).json(built);

    const result = await webbedsPostXml(built.xml);
    const hotels = parseWebbedsHotels(result.text, currency).map((hotel) => ({
      ...hotel,
      city,
      country: city.toUpperCase() === "DUBAI" || city.toUpperCase() === "ABU DHABI"
        ? "United Arab Emirates"
        : hotel.country,
      source: "live",
      supplier: "configured_private_supplier"
    }));

    return res.json({
      ok: result.ok,
      source: "live",
      city,
      cityId,
      currency,
      count: hotels.length,
      message: hotels.length ? "Verified live hotel rates returned." : `No verified live hotel rates were returned for ${resolvedCity}, ${country}. Try a nearby major city.`,
      hotels,
      quoteRequired: hotels.length === 0,
      quoteDestination: {
        country,
        city: resolvedCity,
        requestedCity: city,
        currency
      }
    });
  } catch (err) {
    res.status(500).json({
      ok: false,
      message: "Live hotel search failed.",
      error: err.message
    });
  }
});

// MSH WEBBEDS HOTEL DETAILS TEST START
function buildWebbedsHotelDetailsXml(hotelId) {
  return webbedsCustomerXml(`<request command="gethoteldetails">
    <hotelId>${xmlEscapeValue(hotelId)}</hotelId>
  </request>`);
}

app.get("/api/webbeds/hotel-details", async (req, res) => {
  try {
    const hotelId = clean(req.query.hotelId || req.query.hotelid || req.query.id || "");

    if (!hotelId) {
      return res.status(400).json({
        ok: false,
        message: "hotelId is required.",
        example: "/api/webbeds/hotel-details?hotelId=313455"
      });
    }

    const xml = buildWebbedsHotelDetailsXml(hotelId);
    const result = await webbedsPostXml(xml);

    recordActivity("webbeds_hotel_details", { hotelId }, {
      ok: result.ok,
      status: result.status,
      preview: result.text.slice(0, 500)
    });

    res.status(result.ok ? 200 : 502).json({
      ok: result.ok,
      supplier: "configured_private_supplier",
      hotelId,
      status: result.status,
      responsePreview: result.text.slice(0, 12000)
    });
  } catch (err) {
    recordActivity("webbeds_hotel_details_error", {}, { error: err.message });

    res.status(500).json({
      ok: false,
      message: "WebBeds hotel details request failed.",
      error: err.message
    });
  }
});

// MSH WEBBEDS HOTEL ID BATCH SEARCH START
function buildWebbedsHotelIdSearchXml(query) {
  const fromDate = xmlEscapeValue(query.fromDate || query.checkIn || query.checkin || webbedsDateISO(14));
  const toDate = xmlEscapeValue(query.toDate || query.checkOut || query.checkout || webbedsDateISO(15));

  const currencyId = positiveIntegerOrBlank(query.currencyId || query.currency_id) || webbedsCurrencyIdFromCode(query.currency);
  const nationalityId = positiveIntegerOrBlank(query.nationalityId || query.nationality_id) || webbedsCountryIdFromCode(query.nationality || "GB");
  const residenceId = positiveIntegerOrBlank(query.residenceId || query.residence_id) || webbedsCountryIdFromCode(query.residence || "GB");

  const hotelIds = clean(query.hotelIds || query.hotelids || query.ids || "")
    .split(",")
    .map((x) => clean(x))
    .filter((x) => /^[0-9]+$/.test(x))
    .slice(0, 50);

  if (!hotelIds.length) {
    return { ok: false, message: "hotelIds is required. Example: hotelIds=31354,31064,1073078" };
  }

  const fieldValues = hotelIds.map((id) => `<fieldValue>${xmlEscapeValue(id)}</fieldValue>`).join("");

  return {
    ok: true,
    xml: webbedsCustomerXml(`<request command="searchhotels">
    <bookingDetails>
      <fromDate>${fromDate}</fromDate>
      <toDate>${toDate}</toDate>
      <currency>${currencyId}</currency>
      <rooms no="1">
        <room runno="0">
          <adultsCode>2</adultsCode>
          <children no="0"></children>
          <rateBasis>-1</rateBasis>
          <passengerNationality>${nationalityId}</passengerNationality>
          <passengerCountryOfResidence>${residenceId}</passengerCountryOfResidence>
        </room>
      </rooms>
    </bookingDetails>
    <return>
      <filters xmlns:a="http://us.dotwconnect.com/xsd/atomicCondition" xmlns:c="http://us.dotwconnect.com/xsd/complexCondition">
        <c:condition>
          <a:condition>
            <fieldName>hotelId</fieldName>
            <fieldTest>in</fieldTest>
            <fieldValues>${fieldValues}</fieldValues>
          </a:condition>
        </c:condition>
      </filters>
    </return>
  </request>`)
  };
}

app.get("/api/webbeds/search-by-hotel-ids", async (req, res) => {
  try {
    const built = buildWebbedsHotelIdSearchXml(req.query);
    if (!built.ok) return res.status(400).json(built);

    const result = await webbedsPostXml(built.xml);
    const hotels = parseWebbedsHotels(result.text, clean(req.query.currency || "USD").toUpperCase());

    res.status(result.ok ? 200 : 502).json({
      ok: result.ok,
      supplier: "configured_private_supplier",
      source: "live_hotel_id_batch",
      status: result.status,
      count: hotels.length,
      message: hotels.length ? "Verified live hotel rates returned." : `No verified live hotel rates were returned for ${resolvedCity}, ${country}. Try a nearby major city.`,
      hotels,
      responsePreview: result.text.slice(0, 15000)
    });
  } catch (err) {
    res.status(500).json({
      ok: false,
      message: "WebBeds hotel ID batch search failed.",
      error: err.message
    });
  }
});
// MSH WEBBEDS HOTEL ID BATCH SEARCH END

// MSH WEBBEDS HOTEL DETAILS TEST END

// MSH CUSTOMER LIVE HOTEL SEARCH VIA WEBBEDS END

// MSH WEBBEDS CITY MAP CACHE END

// MSH WEBBEDS JSON SEARCH NORMALIZER END


// MSH WEBBEDS JSON SEARCH NORMALIZER START
function extractXmlTag(block, tag) {
  const match = String(block || "").match(new RegExp("<" + tag + ">([\\s\\S]*?)<\\/" + tag + ">", "i"));
  return match ? clean(match[1]) : "";
}

function extractXmlAttr(block, attr) {
  const match = String(block || "").match(new RegExp(attr + "=\"([^\"]*)\"", "i"));
  return match ? clean(match[1]) : "";
}

function parseWebbedsHotels(xml, currencyCode) {
  const hotels = [];
  const hotelBlocks = String(xml || "").match(/<hotel[\s\S]*?<\/hotel>/gi) || [];

  for (const hotelBlock of hotelBlocks) {
    const hotelId = extractXmlAttr(hotelBlock, "hotelid");
    const roomBlocks = hotelBlock.match(/<roomType[\s\S]*?<\/roomType>/gi) || [];

    const rooms = [];

    for (const roomBlock of roomBlocks.slice(0, 10)) {
      const roomTypeCode = extractXmlAttr(roomBlock, "roomtypecode");
      const roomName = extractXmlTag(roomBlock, "name") || "Available room";
      const rateBlocks = roomBlock.match(/<rateBasis[\s\S]*?<\/rateBasis>/gi) || [];

      for (const rateBlock of rateBlocks.slice(0, 4)) {
        const rateBasisId = extractXmlAttr(rateBlock, "id");
        const total = money(extractXmlTag(rateBlock, "total"));

        if (total <= 0) continue;

        rooms.push({
          roomCode: roomTypeCode,
          roomName,
          board: `Rate basis ${rateBasisId || "standard"}`,
          price: total,
          convertedPrice: total,
          displayCurrency: currencyCode || "USD",
          cancellation: "Cancellation details are confirmed before booking.",
          taxes: "Taxes and fees are confirmed before booking.",
          rate_source_id: `WEBBEDS-${hotelId}-${roomTypeCode}-${rateBasisId}`,
          rate_source_timestamp: nowISO(),
          source_health: "verified",
          supplier_private: {
            supplier_code: "WEBBEDS",
            supplier_hotel_id: hotelId,
            room_type_code: roomTypeCode,
            rate_basis_id: rateBasisId
          }
        });
      }
    }

    rooms.sort((a, b) => number(a.price) - number(b.price));

    if (hotelId && rooms.length) {
      hotels.push({
        hotelId: `WEBBEDS-${hotelId}`,
        hotel_id: `WEBBEDS-${hotelId}`,
        name: `Hotel ${hotelId}`,
        hotel_name: `Hotel ${hotelId}`,
        country: "United Arab Emirates",
        city: "Abu Dhabi",
        area: "",
        address: "",
        stars: "",
        image: "",
        facilities: [],
        availableToBook: true,
        price: rooms[0].price,
        currency: rooms[0].displayCurrency,
        rooms: rooms.slice(0, 8),
        rate_source_id: rooms[0].rate_source_id,
        rate_source_timestamp: rooms[0].rate_source_timestamp,
        source_health: "verified"
      });
    }
  }

  hotels.sort((a, b) => number(a.price) - number(b.price));
  return hotels;
}

function webbedsCurrencyIdFromCode(code) {
  const c = clean(code || "USD").toUpperCase();
  if (c === "GBP") return "416";
  if (c === "EUR") return "413";
  return "520";
}

function webbedsCountryIdFromCode(code) {
  const c = clean(code || "GB").toUpperCase();
  if (c === "AE" || c === "UAE" || c === "UNITED ARAB EMIRATES") return "6";
  if (c === "US" || c === "USA" || c === "UNITED STATES") return "102";
  return "88";
}

function webbedsCityIdFromName(city) {
  const c = clean(city).toUpperCase();
  if (c === "ABU DHABI") return "334";
  return "";
}

app.get("/api/webbeds/search", async (req, res) => {
  try {
    const cityId = positiveIntegerOrBlank(req.query.cityId || req.query.city_id) || findWebbedsCityCodeFromCache(req.query.city) || webbedsCityIdFromName(req.query.city);
    const currencyId = positiveIntegerOrBlank(req.query.currencyId || req.query.currency_id) || webbedsCurrencyIdFromCode(req.query.currency);
    const nationalityId = positiveIntegerOrBlank(req.query.nationalityId || req.query.nationality_id) || webbedsCountryIdFromCode(req.query.nationality || "GB");
    const residenceId = positiveIntegerOrBlank(req.query.residenceId || req.query.residence_id) || webbedsCountryIdFromCode(req.query.residence || "GB");

    if (!cityId) {
      return res.status(400).json({
        ok: false,
        message: "This WebBeds city is not mapped yet. Use cityId directly or add the city to the WebBeds city map.",
        example: "/api/webbeds/search?cityId=334&currency=USD&nationality=GB&residence=GB"
      });
    }

    const built = buildWebbedsSearchXml({
      ...req.query,
      cityId,
      currencyId,
      nationalityId,
      residenceId
    });

    if (!built.ok) return res.status(400).json(built);

    const result = await webbedsPostXml(built.xml);
    const hotels = parseWebbedsHotels(result.text, clean(req.query.currency || "USD").toUpperCase());

    recordActivity("webbeds_json_search", {
      cityId,
      currencyId,
      nationalityId,
      residenceId,
      count: hotels.length
    }, {
      ok: result.ok,
      status: result.status
    });

    res.status(result.ok ? 200 : 502).json({
      ok: result.ok,
      supplier: "configured_private_supplier",
      source: "live",
      count: hotels.length,
      message: hotels.length ? "Verified live hotel rates returned." : `No verified live hotel rates were returned for ${resolvedCity}, ${country}. Try a nearby major city.`,
      hotels,
      quoteRequired: hotels.length === 0,
      quoteDestination: {
        country,
        city: resolvedCity,
        requestedCity: city,
        currency
      }
    });
  } catch (err) {
    recordActivity("webbeds_json_search_error", {}, { error: err.message });
    res.status(500).json({
      ok: false,
      message: "WebBeds JSON search failed.",
      error: err.message
    });
  }
});

// MSH WEBBEDS CITY MAP CACHE START
function parseWebbedsCityMap(xml) {
  const map = {};
  const cities = [];
  const cityBlocks = String(xml || "").match(/<city[\s\S]*?<\/city>/gi) || [];

  for (const block of cityBlocks) {
    const name = extractXmlTag(block, "name");
    const code = extractXmlTag(block, "code");

    if (!name || !code) continue;

    const key = clean(name).toUpperCase();
    map[key] = code;

    cities.push({
      name,
      key,
      code
    });
  }

  cities.sort((a, b) => a.name.localeCompare(b.name));

  return {
    generated_at: nowISO(),
    count: cities.length,
    map,
    cities
  };
}

function webbedsCityMapFile() {
  return path.join(DATA_DIR, "webbeds-city-map.json");
}

function loadWebbedsCityMap() {
  try {
    const file = webbedsCityMapFile();
    if (!fs.existsSync(file)) return null;
    return JSON.parse(fs.readFileSync(file, "utf8"));
  } catch {
    return null;
  }
}

function saveWebbedsCityMap(data) {
  fs.writeFileSync(webbedsCityMapFile(), JSON.stringify(data, null, 2), "utf8");
}

function findWebbedsCityCodeFromCache(city) {
  const cityMap = loadWebbedsCityMap();
  if (!cityMap || !cityMap.map) return "";

  const key = clean(city).toUpperCase();
  if (cityMap.map[key]) return cityMap.map[key];

  const partial = (cityMap.cities || []).find((item) => {
    const itemKey = clean(item.key || item.name).toUpperCase();
    return itemKey === key || itemKey.startsWith(key + " -") || itemKey.includes(key);
  });

  return partial ? clean(partial.code) : "";
}

app.get("/api/webbeds/build-city-map", async (req, res) => {
  try {
    const xml = buildWebbedsInternalCodeXml("getservingcities");
    const result = await webbedsPostXml(xml);

    if (!result.ok) {
      return res.status(502).json({
        ok: false,
        message: "Could not download WebBeds serving cities.",
        status: result.status,
        responsePreview: result.text.slice(0, 2000)
      });
    }

    const parsed = parseWebbedsCityMap(result.text);
    saveWebbedsCityMap(parsed);

    recordActivity("webbeds_build_city_map", {}, {
      ok: true,
      cities: parsed.count
    });

    res.json({
      ok: true,
      file: "backend/data/webbeds-city-map.json",
      count: parsed.count,
      generated_at: parsed.generated_at,
      examples: parsed.cities.slice(0, 120)
    });
  } catch (err) {
    recordActivity("webbeds_build_city_map_error", {}, { error: err.message });

    res.status(500).json({
      ok: false,
      message: "WebBeds city map build failed.",
      error: err.message
    });
  }
});

app.get("/api/webbeds/city-code", (req, res) => {
  const city = clean(req.query.city || req.query.q || "");
  const cityMap = loadWebbedsCityMap();

  if (!cityMap) {
    return res.status(404).json({
      ok: false,
      message: "WebBeds city map has not been built yet. Run /api/webbeds/build-city-map first."
    });
  }

  const code = findWebbedsCityCodeFromCache(city);

  res.json({
    ok: Boolean(code),
    city,
    code,
    message: code ? "City code found." : "City is not mapped yet."
  });
});

// MSH CUSTOMER LIVE HOTEL SEARCH VIA WEBBEDS START
app.get("/api/live-webbeds-hotels", async (req, res) => {
  try {
    const city = clean(req.query.city || req.query.destination || "DUBAI");
    const currency = clean(req.query.currency || "USD").toUpperCase();
    const nationality = clean(req.query.nationality || "GB");
    const residence = clean(req.query.residence || "GB");

    const cityId =
      positiveIntegerOrBlank(req.query.cityId || req.query.city_id) ||
      findWebbedsCityCodeFromCache(city) ||
      webbedsCityIdFromName(city);

    if (!cityId) {
      return res.status(400).json({
        ok: false,
        source: "live",
        message: "Live hotel rates are not available for this city yet.",
        city
      });
    }

    const built = buildWebbedsSearchXml({
      ...req.query,
      cityId,
      currencyId: webbedsCurrencyIdFromCode(currency),
      nationalityId: webbedsCountryIdFromCode(nationality),
      residenceId: webbedsCountryIdFromCode(residence)
    });

    if (!built.ok) return res.status(400).json(built);

    const result = await webbedsPostXml(built.xml);
    const hotels = parseWebbedsHotels(result.text, currency).map((hotel) => ({
      ...hotel,
      city,
      country: city.toUpperCase() === "DUBAI" || city.toUpperCase() === "ABU DHABI"
        ? "United Arab Emirates"
        : hotel.country,
      source: "live",
      supplier: "configured_private_supplier"
    }));

    return res.json({
      ok: result.ok,
      source: "live",
      city,
      cityId,
      currency,
      count: hotels.length,
      message: hotels.length ? "Verified live hotel rates returned." : `No verified live hotel rates were returned for ${resolvedCity}, ${country}. Try a nearby major city.`,
      hotels,
      quoteRequired: hotels.length === 0,
      quoteDestination: {
        country,
        city: resolvedCity,
        requestedCity: city,
        currency
      }
    });
  } catch (err) {
    res.status(500).json({
      ok: false,
      message: "Live hotel search failed.",
      error: err.message
    });
  }
});

// MSH WEBBEDS HOTEL DETAILS TEST START
function buildWebbedsHotelDetailsXml(hotelId) {
  return webbedsCustomerXml(`<request command="gethoteldetails">
    <hotelId>${xmlEscapeValue(hotelId)}</hotelId>
  </request>`);
}

app.get("/api/webbeds/hotel-details", async (req, res) => {
  try {
    const hotelId = clean(req.query.hotelId || req.query.hotelid || req.query.id || "");

    if (!hotelId) {
      return res.status(400).json({
        ok: false,
        message: "hotelId is required.",
        example: "/api/webbeds/hotel-details?hotelId=313455"
      });
    }

    const xml = buildWebbedsHotelDetailsXml(hotelId);
    const result = await webbedsPostXml(xml);

    recordActivity("webbeds_hotel_details", { hotelId }, {
      ok: result.ok,
      status: result.status,
      preview: result.text.slice(0, 500)
    });

    res.status(result.ok ? 200 : 502).json({
      ok: result.ok,
      supplier: "configured_private_supplier",
      hotelId,
      status: result.status,
      responsePreview: result.text.slice(0, 12000)
    });
  } catch (err) {
    recordActivity("webbeds_hotel_details_error", {}, { error: err.message });

    res.status(500).json({
      ok: false,
      message: "WebBeds hotel details request failed.",
      error: err.message
    });
  }
});

// MSH WEBBEDS HOTEL ID BATCH SEARCH START
function buildWebbedsHotelIdSearchXml(query) {
  const fromDate = xmlEscapeValue(query.fromDate || query.checkIn || query.checkin || webbedsDateISO(14));
  const toDate = xmlEscapeValue(query.toDate || query.checkOut || query.checkout || webbedsDateISO(15));

  const currencyId = positiveIntegerOrBlank(query.currencyId || query.currency_id) || webbedsCurrencyIdFromCode(query.currency);
  const nationalityId = positiveIntegerOrBlank(query.nationalityId || query.nationality_id) || webbedsCountryIdFromCode(query.nationality || "GB");
  const residenceId = positiveIntegerOrBlank(query.residenceId || query.residence_id) || webbedsCountryIdFromCode(query.residence || "GB");

  const hotelIds = clean(query.hotelIds || query.hotelids || query.ids || "")
    .split(",")
    .map((x) => clean(x))
    .filter((x) => /^[0-9]+$/.test(x))
    .slice(0, 50);

  if (!hotelIds.length) {
    return { ok: false, message: "hotelIds is required. Example: hotelIds=31354,31064,1073078" };
  }

  const fieldValues = hotelIds.map((id) => `<fieldValue>${xmlEscapeValue(id)}</fieldValue>`).join("");

  return {
    ok: true,
    xml: webbedsCustomerXml(`<request command="searchhotels">
    <bookingDetails>
      <fromDate>${fromDate}</fromDate>
      <toDate>${toDate}</toDate>
      <currency>${currencyId}</currency>
      <rooms no="1">
        <room runno="0">
          <adultsCode>2</adultsCode>
          <children no="0"></children>
          <rateBasis>-1</rateBasis>
          <passengerNationality>${nationalityId}</passengerNationality>
          <passengerCountryOfResidence>${residenceId}</passengerCountryOfResidence>
        </room>
      </rooms>
    </bookingDetails>
    <return>
      <filters xmlns:a="http://us.dotwconnect.com/xsd/atomicCondition" xmlns:c="http://us.dotwconnect.com/xsd/complexCondition">
        <c:condition>
          <a:condition>
            <fieldName>hotelId</fieldName>
            <fieldTest>in</fieldTest>
            <fieldValues>${fieldValues}</fieldValues>
          </a:condition>
        </c:condition>
      </filters>
    </return>
  </request>`)
  };
}

app.get("/api/webbeds/search-by-hotel-ids", async (req, res) => {
  try {
    const built = buildWebbedsHotelIdSearchXml(req.query);
    if (!built.ok) return res.status(400).json(built);

    const result = await webbedsPostXml(built.xml);
    const hotels = parseWebbedsHotels(result.text, clean(req.query.currency || "USD").toUpperCase());

    res.status(result.ok ? 200 : 502).json({
      ok: result.ok,
      supplier: "configured_private_supplier",
      source: "live_hotel_id_batch",
      status: result.status,
      count: hotels.length,
      message: hotels.length ? "Verified live hotel rates returned." : `No verified live hotel rates were returned for ${resolvedCity}, ${country}. Try a nearby major city.`,
      hotels,
      responsePreview: result.text.slice(0, 15000)
    });
  } catch (err) {
    res.status(500).json({
      ok: false,
      message: "WebBeds hotel ID batch search failed.",
      error: err.message
    });
  }
});
// MSH WEBBEDS HOTEL ID BATCH SEARCH END

// MSH WEBBEDS HOTEL DETAILS TEST END

// MSH CUSTOMER LIVE HOTEL SEARCH VIA WEBBEDS END

// MSH WEBBEDS CITY MAP CACHE END


// MSH WEBBEDS CITY MAP CACHE START
function parseWebbedsCityMap(xml) {
  const map = {};
  const cities = [];
  const cityBlocks = String(xml || "").match(/<city[\s\S]*?<\/city>/gi) || [];

  for (const block of cityBlocks) {
    const name = extractXmlTag(block, "name");
    const code = extractXmlTag(block, "code");

    if (!name || !code) continue;

    const key = clean(name).toUpperCase();
    map[key] = code;

    cities.push({
      name,
      key,
      code
    });
  }

  cities.sort((a, b) => a.name.localeCompare(b.name));

  return {
    generated_at: nowISO(),
    count: cities.length,
    map,
    cities
  };
}

function webbedsCityMapFile() {
  return path.join(DATA_DIR, "webbeds-city-map.json");
}

function loadWebbedsCityMap() {
  try {
    const file = webbedsCityMapFile();
    if (!fs.existsSync(file)) return null;
    return JSON.parse(fs.readFileSync(file, "utf8"));
  } catch {
    return null;
  }
}

function saveWebbedsCityMap(data) {
  fs.writeFileSync(webbedsCityMapFile(), JSON.stringify(data, null, 2), "utf8");
}

function findWebbedsCityCodeFromCache(city) {
  const cityMap = loadWebbedsCityMap();
  if (!cityMap || !cityMap.map) return "";

  const key = clean(city).toUpperCase();
  if (cityMap.map[key]) return cityMap.map[key];

  const partial = (cityMap.cities || []).find((item) => {
    const itemKey = clean(item.key || item.name).toUpperCase();
    return itemKey === key || itemKey.startsWith(key + " -") || itemKey.includes(key);
  });

  return partial ? clean(partial.code) : "";
}

app.get("/api/webbeds/build-city-map", async (req, res) => {
  try {
    const xml = buildWebbedsInternalCodeXml("getservingcities");
    const result = await webbedsPostXml(xml);

    if (!result.ok) {
      return res.status(502).json({
        ok: false,
        message: "Could not download WebBeds serving cities.",
        status: result.status,
        responsePreview: result.text.slice(0, 2000)
      });
    }

    const parsed = parseWebbedsCityMap(result.text);
    saveWebbedsCityMap(parsed);

    recordActivity("webbeds_build_city_map", {}, {
      ok: true,
      cities: parsed.count
    });

    res.json({
      ok: true,
      file: "backend/data/webbeds-city-map.json",
      count: parsed.count,
      generated_at: parsed.generated_at,
      examples: parsed.cities.slice(0, 120)
    });
  } catch (err) {
    recordActivity("webbeds_build_city_map_error", {}, { error: err.message });

    res.status(500).json({
      ok: false,
      message: "WebBeds city map build failed.",
      error: err.message
    });
  }
});

app.get("/api/webbeds/city-code", (req, res) => {
  const city = clean(req.query.city || req.query.q || "");
  const cityMap = loadWebbedsCityMap();

  if (!cityMap) {
    return res.status(404).json({
      ok: false,
      message: "WebBeds city map has not been built yet. Run /api/webbeds/build-city-map first."
    });
  }

  const code = findWebbedsCityCodeFromCache(city);

  res.json({
    ok: Boolean(code),
    city,
    code,
    message: code ? "City code found." : "City is not mapped yet."
  });
});

// MSH CUSTOMER LIVE HOTEL SEARCH VIA WEBBEDS START
app.get("/api/live-webbeds-hotels", async (req, res) => {
  try {
    const city = clean(req.query.city || req.query.destination || "DUBAI");
    const currency = clean(req.query.currency || "USD").toUpperCase();
    const nationality = clean(req.query.nationality || "GB");
    const residence = clean(req.query.residence || "GB");

    const cityId =
      positiveIntegerOrBlank(req.query.cityId || req.query.city_id) ||
      findWebbedsCityCodeFromCache(city) ||
      webbedsCityIdFromName(city);

    if (!cityId) {
      return res.status(400).json({
        ok: false,
        source: "live",
        message: "Live hotel rates are not available for this city yet.",
        city
      });
    }

    const built = buildWebbedsSearchXml({
      ...req.query,
      cityId,
      currencyId: webbedsCurrencyIdFromCode(currency),
      nationalityId: webbedsCountryIdFromCode(nationality),
      residenceId: webbedsCountryIdFromCode(residence)
    });

    if (!built.ok) return res.status(400).json(built);

    const result = await webbedsPostXml(built.xml);
    const hotels = parseWebbedsHotels(result.text, currency).map((hotel) => ({
      ...hotel,
      city,
      country: city.toUpperCase() === "DUBAI" || city.toUpperCase() === "ABU DHABI"
        ? "United Arab Emirates"
        : hotel.country,
      source: "live",
      supplier: "configured_private_supplier"
    }));

    return res.json({
      ok: result.ok,
      source: "live",
      city,
      cityId,
      currency,
      count: hotels.length,
      message: hotels.length ? "Verified live hotel rates returned." : `No verified live hotel rates were returned for ${resolvedCity}, ${country}. Try a nearby major city.`,
      hotels,
      quoteRequired: hotels.length === 0,
      quoteDestination: {
        country,
        city: resolvedCity,
        requestedCity: city,
        currency
      }
    });
  } catch (err) {
    res.status(500).json({
      ok: false,
      message: "Live hotel search failed.",
      error: err.message
    });
  }
});

// MSH WEBBEDS HOTEL DETAILS TEST START
function buildWebbedsHotelDetailsXml(hotelId) {
  return webbedsCustomerXml(`<request command="gethoteldetails">
    <hotelId>${xmlEscapeValue(hotelId)}</hotelId>
  </request>`);
}

app.get("/api/webbeds/hotel-details", async (req, res) => {
  try {
    const hotelId = clean(req.query.hotelId || req.query.hotelid || req.query.id || "");

    if (!hotelId) {
      return res.status(400).json({
        ok: false,
        message: "hotelId is required.",
        example: "/api/webbeds/hotel-details?hotelId=313455"
      });
    }

    const xml = buildWebbedsHotelDetailsXml(hotelId);
    const result = await webbedsPostXml(xml);

    recordActivity("webbeds_hotel_details", { hotelId }, {
      ok: result.ok,
      status: result.status,
      preview: result.text.slice(0, 500)
    });

    res.status(result.ok ? 200 : 502).json({
      ok: result.ok,
      supplier: "configured_private_supplier",
      hotelId,
      status: result.status,
      responsePreview: result.text.slice(0, 12000)
    });
  } catch (err) {
    recordActivity("webbeds_hotel_details_error", {}, { error: err.message });

    res.status(500).json({
      ok: false,
      message: "WebBeds hotel details request failed.",
      error: err.message
    });
  }
});

// MSH WEBBEDS HOTEL ID BATCH SEARCH START
function buildWebbedsHotelIdSearchXml(query) {
  const fromDate = xmlEscapeValue(query.fromDate || query.checkIn || query.checkin || webbedsDateISO(14));
  const toDate = xmlEscapeValue(query.toDate || query.checkOut || query.checkout || webbedsDateISO(15));

  const currencyId = positiveIntegerOrBlank(query.currencyId || query.currency_id) || webbedsCurrencyIdFromCode(query.currency);
  const nationalityId = positiveIntegerOrBlank(query.nationalityId || query.nationality_id) || webbedsCountryIdFromCode(query.nationality || "GB");
  const residenceId = positiveIntegerOrBlank(query.residenceId || query.residence_id) || webbedsCountryIdFromCode(query.residence || "GB");

  const hotelIds = clean(query.hotelIds || query.hotelids || query.ids || "")
    .split(",")
    .map((x) => clean(x))
    .filter((x) => /^[0-9]+$/.test(x))
    .slice(0, 50);

  if (!hotelIds.length) {
    return { ok: false, message: "hotelIds is required. Example: hotelIds=31354,31064,1073078" };
  }

  const fieldValues = hotelIds.map((id) => `<fieldValue>${xmlEscapeValue(id)}</fieldValue>`).join("");

  return {
    ok: true,
    xml: webbedsCustomerXml(`<request command="searchhotels">
    <bookingDetails>
      <fromDate>${fromDate}</fromDate>
      <toDate>${toDate}</toDate>
      <currency>${currencyId}</currency>
      <rooms no="1">
        <room runno="0">
          <adultsCode>2</adultsCode>
          <children no="0"></children>
          <rateBasis>-1</rateBasis>
          <passengerNationality>${nationalityId}</passengerNationality>
          <passengerCountryOfResidence>${residenceId}</passengerCountryOfResidence>
        </room>
      </rooms>
    </bookingDetails>
    <return>
      <filters xmlns:a="http://us.dotwconnect.com/xsd/atomicCondition" xmlns:c="http://us.dotwconnect.com/xsd/complexCondition">
        <c:condition>
          <a:condition>
            <fieldName>hotelId</fieldName>
            <fieldTest>in</fieldTest>
            <fieldValues>${fieldValues}</fieldValues>
          </a:condition>
        </c:condition>
      </filters>
    </return>
  </request>`)
  };
}

app.get("/api/webbeds/search-by-hotel-ids", async (req, res) => {
  try {
    const built = buildWebbedsHotelIdSearchXml(req.query);
    if (!built.ok) return res.status(400).json(built);

    const result = await webbedsPostXml(built.xml);
    const hotels = parseWebbedsHotels(result.text, clean(req.query.currency || "USD").toUpperCase());

    res.status(result.ok ? 200 : 502).json({
      ok: result.ok,
      supplier: "configured_private_supplier",
      source: "live_hotel_id_batch",
      status: result.status,
      count: hotels.length,
      message: hotels.length ? "Verified live hotel rates returned." : `No verified live hotel rates were returned for ${resolvedCity}, ${country}. Try a nearby major city.`,
      hotels,
      responsePreview: result.text.slice(0, 15000)
    });
  } catch (err) {
    res.status(500).json({
      ok: false,
      message: "WebBeds hotel ID batch search failed.",
      error: err.message
    });
  }
});
// MSH WEBBEDS HOTEL ID BATCH SEARCH END

// MSH WEBBEDS HOTEL DETAILS TEST END

// MSH CUSTOMER LIVE HOTEL SEARCH VIA WEBBEDS END

// MSH WEBBEDS CITY MAP CACHE END

// MSH WEBBEDS JSON SEARCH NORMALIZER END

// MSH WEBBEDS DOTW XML CONNECTOR END

// MSH REAL MULTI SUPPLIER ORCHESTRATOR START
function mergeUniqueHotelsByKey(hotels) {
  const seen = new Set();
  const merged = [];

  for (const hotel of hotels || []) {
    const name = clean(hotel.hotel_name || hotel.name || "");
    const city = clean(hotel.city || "");
    const country = clean(hotel.country || "");
    const supplierKey = clean(hotel.rate_source_id || hotel.hotel_id || hotel.hotelId || name);

    const key = `${name.toLowerCase()}|${city.toLowerCase()}|${country.toLowerCase()}|${supplierKey.toLowerCase()}`;

    if (seen.has(key)) continue;
    seen.add(key);
    merged.push(hotel);
  }

  return merged;
}

function chunkArray(items, size) {
  const out = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

function getCachedWebbedsHotelIdsForCity(city, maxCount = 500) {
  const wanted = clean(city).toLowerCase();
  const cache = loadWebbedsStaticHotels();
  return Object.values(cache)
    .filter((hotel) => clean(hotel.city).toLowerCase() === wanted)
    .filter((hotel) => clean(hotel.hotelId))
    .sort((a, b) => {
      const aImg = Array.isArray(a.images) && a.images.length ? 1 : 0;
      const bImg = Array.isArray(b.images) && b.images.length ? 1 : 0;
      return bImg - aImg;
    })
    .map((hotel) => clean(hotel.hotelId))
    .slice(0, maxCount);
}

function buildWebbedsHotelIdBatchSearchXml({ hotelIds, fromDate, toDate, currencyId, nationalityId, residenceId }) {
  const ids = Array.isArray(hotelIds) ? hotelIds.filter(Boolean).slice(0, 50) : [];
  return webbedsCustomerXml(`
  <request command="searchhotels">
    <bookingDetails>
      <fromDate>${xmlEscapeValue(fromDate || new Date().toISOString().slice(0, 10))}</fromDate>
      <toDate>${xmlEscapeValue(toDate || new Date(Date.now() + 86400000).toISOString().slice(0, 10))}</toDate>
      <currency>${xmlEscapeValue(currencyId || 520)}</currency>
      <rooms no="1">
        <room runno="0">
          <adultsCode>1</adultsCode>
          <children no="0"></children>
          <rateBasis>-1</rateBasis>
          <passengerNationality>${xmlEscapeValue(nationalityId || 88)}</passengerNationality>
          <passengerCountryOfResidence>${xmlEscapeValue(residenceId || 88)}</passengerCountryOfResidence>
        </room>
      </rooms>
    </bookingDetails>
    <return>
      <filters xmlns:a="http://us.dotwconnect.com/xsd/atomicCondition" xmlns:c="http://us.dotwconnect.com/xsd/complexCondition">
        <c:condition>
          <a:condition>
            <fieldName>hotelId</fieldName>
            <fieldTest>in</fieldTest>
            <fieldValues>
              ${ids.map((id) => `<fieldValue>${xmlEscapeValue(id)}</fieldValue>`).join("")}
            </fieldValues>
          </a:condition>
        </c:condition>
      </filters>
    </return>
  </request>`);
}

function adaptiveArrayChunks(items, size) {
  const out = [];
  const list = Array.isArray(items) ? items : [];
  for (let i = 0; i < list.length; i += size) out.push(list.slice(i, i + size));
  return out;
}

function adaptiveNormalizeHotelId(value) {
  return String(value || "").replace(/^WEBBEDS-/i, "").replace(/[^\d]/g, "").trim();
}

function adaptiveSupplierHotelKey(hotel) {
  const supplier = clean(hotel.supplier_code || hotel.supplierCode || hotel.supplier_private?.supplier_code || hotel.source || "supplier").toUpperCase();
  const id = clean(hotel.supplier_hotel_id || hotel.hotelId || hotel.hotel_id || hotel.id || hotel.hotelCode);
  const name = clean(hotel.name || hotel.hotel_name || hotel.hotelName).toLowerCase();
  const city = clean(hotel.city).toLowerCase();
  return id ? `${supplier}:${id}` : `${supplier}:${name}:${city}`;
}

function adaptiveNormalizeSupplierHotel(hotel, supplierLabel, source) {
  const price = number(hotel.price || hotel.total || hotel.convertedPrice || 0);
  const imageList = Array.isArray(hotel.images)
    ? hotel.images.filter((x) => clean(x) && /^https?:\/\//i.test(clean(x)))
    : [];

  return {
    ...hotel,
    source: source || hotel.source || "supplier_inventory",
    supplierLabel: supplierLabel || hotel.supplierLabel || "Supplier inventory",
    supplier_code: hotel.supplier_code || hotel.supplier_private?.supplier_code || "",
    name: clean(hotel.name || hotel.hotel_name || hotel.hotelName),
    hotel_name: clean(hotel.hotel_name || hotel.name || hotel.hotelName),
    image: clean(hotel.image) || imageList[0] || "",
    images: imageList.length ? imageList : hotel.images || [],
    price,
    convertedPrice: number(hotel.convertedPrice || price),
    total: number(hotel.total || price),
    availableToBook: hotel.availableToBook !== false && price > 0
  };
}

async function adaptiveExistingInventoryAdapter(req) {
  const query = new URLSearchParams(req.query).toString();
  const localUrl = `http://127.0.0.1:${PORT}/search?${query}`;

  const result = await fetch(localUrl, { cache: "no-store" })
    .then((r) => r.json())
    .catch(() => ({ hotels: [] }));

  const hotels = Array.isArray(result.hotels) ? result.hotels : [];

  return {
    supplier: "existing",
    method: "text_country_city_inventory",
    count: hotels.length,
    hotels: hotels.map((hotel) =>
      adaptiveNormalizeSupplierHotel(
        {
          ...hotel,
          supplier_code: hotel.supplier_code || "EXISTING"
        },
        "Existing supplier inventory",
        "existing_supplier_inventory"
      )
    )
  };
}

function adaptiveCachedWebbedsIdsForCity(city, maxCount = 500) {
  const wanted = clean(city).toLowerCase();
  const cache = loadWebbedsStaticHotels();

  return Object.values(cache)
    .filter((hotel) => clean(hotel.city).toLowerCase() === wanted)
    .filter((hotel) => clean(hotel.hotelId))
    .sort((a, b) => {
      const aImg = Array.isArray(a.images) && a.images.length ? 1 : 0;
      const bImg = Array.isArray(b.images) && b.images.length ? 1 : 0;
      return bImg - aImg;
    })
    .map((hotel) => clean(hotel.hotelId))
    .slice(0, maxCount);
}

function adaptiveBuildWebbedsHotelIdBatchXml({ hotelIds, fromDate, toDate, currencyId, nationalityId, residenceId }) {
  const ids = Array.isArray(hotelIds) ? hotelIds.filter(Boolean).slice(0, 50) : [];

  return webbedsCustomerXml(`
  <request command="searchhotels">
    <bookingDetails>
      <fromDate>${xmlEscapeValue(fromDate || new Date().toISOString().slice(0, 10))}</fromDate>
      <toDate>${xmlEscapeValue(toDate || new Date(Date.now() + 86400000).toISOString().slice(0, 10))}</toDate>
      <currency>${xmlEscapeValue(currencyId || 416)}</currency>
      <rooms no="1">
        <room runno="0">
          <adultsCode>1</adultsCode>
          <children no="0"></children>
          <rateBasis>-1</rateBasis>
          <passengerNationality>${xmlEscapeValue(nationalityId || 88)}</passengerNationality>
          <passengerCountryOfResidence>${xmlEscapeValue(residenceId || 88)}</passengerCountryOfResidence>
        </room>
      </rooms>
    </bookingDetails>
    <return>
      <filters xmlns:a="http://us.dotwconnect.com/xsd/atomicCondition" xmlns:c="http://us.dotwconnect.com/xsd/complexCondition">
        <c:condition>
          <a:condition>
            <fieldName>hotelId</fieldName>
            <fieldTest>in</fieldTest>
            <fieldValues>
              ${ids.map((id) => `<fieldValue>${xmlEscapeValue(id)}</fieldValue>`).join("")}
            </fieldValues>
          </a:condition>
        </c:condition>
      </filters>
    </return>
  </request>`);
}

async function adaptiveWebbedsAdapter(req) {
  const city = clean(req.query.city || "");
  const country = clean(req.query.country || "");
  const currency = clean(req.query.currency || "GBP").toUpperCase();
  const requestedLimit = Math.max(30, Math.min(500, Number(req.query.limit || 180)));
  const currencyId = webbedsCurrencyIdFromCode(currency);
  const nationalityId = webbedsCountryIdFromCode(req.query.nationality || "GB");
  const residenceId = webbedsCountryIdFromCode(req.query.residence || "GB");

  let hotels = [];
  let method = "webbeds_hotel_id_batches";

  const cachedIds = adaptiveCachedWebbedsIdsForCity(city, requestedLimit * 4);
  const batches = adaptiveArrayChunks(cachedIds, 50).slice(0, 12);

  if (batches.length) {
    const results = await Promise.allSettled(
      batches.map(async (hotelIds) => {
        const xml = adaptiveBuildWebbedsHotelIdBatchXml({
          hotelIds,
          fromDate: req.query.fromDate || req.query.checkIn || req.query.checkin,
          toDate: req.query.toDate || req.query.checkOut || req.query.checkout,
          currencyId,
          nationalityId,
          residenceId
        });

        const result = await webbedsPostXml(xml);
        return parseWebbedsHotels(result.text, currency);
      })
    );

    for (const r of results) {
      if (r.status === "fulfilled" && Array.isArray(r.value)) hotels.push(...r.value);
    }
  }

  if (!hotels.length) {
    method = "webbeds_city_search_fallback";
    const cityId = findWebbedsCityCodeFromCache(city) || webbedsCityIdFromName(city);

    if (cityId && typeof buildWebbedsSearchXml === "function") {
      const built = buildWebbedsSearchXml({
        ...req.query,
        cityId,
        currencyId,
        nationalityId,
        residenceId
      });

      if (built.ok) {
        const result = await webbedsPostXml(built.xml);
        hotels = parseWebbedsHotels(result.text, currency);
      }
    }
  }

  hotels = hotels.map((hotel) => {
    const rawId = adaptiveNormalizeHotelId(hotel.supplier_hotel_id || hotel.hotel_id || hotel.hotelId);
    const enriched = enrichWebbedsHotelWithStaticContent({
      ...hotel,
      supplier_code: "WEBBEDS",
      supplier_hotel_id: rawId,
      source: "webbeds_live_supplier",
      supplierLabel: "WebBeds live rate",
      country: country || hotel.country,
      city: city || hotel.city,
      supplier_private: {
        ...(hotel.supplier_private || {}),
        supplier_code: "WEBBEDS",
        supplier_hotel_id: rawId
      }
    });

    return adaptiveNormalizeSupplierHotel(enriched, "WebBeds live rate", "webbeds_live_supplier");
  });

  return {
    supplier: "webbeds",
    method,
    count: hotels.length,
    hotels
  };
}

function hotelbedsConfig() {
  const apiKey = clean(
    process.env.HOTELBEDS_API_KEY ||
    process.env.HOTELBEDS_APIKEY ||
    process.env.HOTELBEDS_KEY ||
    process.env.HOTELBEDS_API ||
    process.env.HOTELBEDS_CLIENT_KEY ||
    process.env.HOTELBEDS_CLIENT_ID ||
    process.env.HB_API_KEY ||
    process.env.HB_APIKEY ||
    process.env.HB_KEY ||
    ""
  );

  const secret = clean(
    process.env.HOTELBEDS_SECRET ||
    process.env.HOTELBEDS_SECRET_KEY ||
    process.env.HOTELBEDS_SECRETKEY ||
    process.env.HOTELBEDS_API_SECRET ||
    process.env.HOTELBEDS_APISECRET ||
    process.env.HOTELBEDS_CLIENT_SECRET ||
    process.env.HB_SECRET ||
    process.env.HB_SECRET_KEY ||
    ""
  );

  const baseUrl = clean(
    process.env.HOTELBEDS_BASE_URL ||
    process.env.HOTELBEDS_BASEURL ||
    process.env.HOTELBEDS_BASE ||
    process.env.HOTELBEDS_ENDPOINT ||
    process.env.HOTELBEDS_API_BASE ||
    process.env.HOTELBEDS_API_BASE_URL ||
    process.env.HB_BASE_URL ||
    "https://api.hotelbeds.com"
  ).replace(/\/+$/, "");

  const contentBaseUrl = clean(
    process.env.HOTELBEDS_CONTENT_BASE_URL ||
    process.env.HOTELBEDS_CONTENT_BASE ||
    process.env.HOTELBEDS_CONTENT_ENDPOINT ||
    process.env.HOTELBEDS_CONTENT ||
    baseUrl
  ).replace(/\/+$/, "");

  return { apiKey, secret, baseUrl, contentBaseUrl };
}

function hotelbedsDestinationCode(city, country) {
  const c = clean(city).toLowerCase();
  const k = `${clean(country).toLowerCase()}|${c}`;

  const map = {
    "united kingdom|london": "LON",
    "gb|london": "LON",
    "uk|london": "LON",
    "united arab emirates|dubai": "DXB",
    "uae|dubai": "DXB",
    "france|paris": "PAR",
    "spain|madrid": "MAD",
    "spain|barcelona": "BCN",
    "united states|new york": "NYC",
    "usa|new york": "NYC",
    "united states of america|new york": "NYC",
    "italy|rome": "ROM",
    "netherlands|amsterdam": "AMS",
    "germany|berlin": "BER"
  };

  return clean(
    map[k] ||
    map[`|${c}`] ||
    ""
  );
}

function reqDestinationCodeFromText(value) {
  const v = clean(value).toUpperCase();
  if (/^[A-Z0-9]{3,6}$/.test(v)) return v;
  return "";
}

function hotelbedsSignature(apiKey, secret) {
  const timestamp = Math.floor(Date.now() / 1000);
  return crypto
    .createHash("sha256")
    .update(apiKey + secret + timestamp)
    .digest("hex");
}

function hotelbedsAvailabilityBody(req, destinationCode) {
  const checkInDefault = new Date(Date.now() + 86400000).toISOString().slice(0, 10);
  const checkOutDefault = new Date(Date.now() + 172800000).toISOString().slice(0, 10);

  const checkIn = clean(req.query.checkIn || req.query.checkin || req.query.fromDate) || checkInDefault;
  const checkOut = clean(req.query.checkOut || req.query.checkout || req.query.toDate) || checkOutDefault;

  const adults = Math.max(1, Number(req.query.adults || req.query.guests || 2));
  const rooms = Math.max(1, Number(req.query.rooms || 1));
  const currency = clean(req.query.currency || "GBP").toUpperCase();

  return {
    stay: {
      checkIn,
      checkOut
    },
    occupancies: [
      {
        rooms,
        adults,
        children: 0
      }
    ],
    destination: {
      code: destinationCode
    },
    filter: {
      maxHotels: Math.max(25, Math.min(200, Number(req.query.limit || 120)))
    },
    currency
  };
}

function parseHotelbedsAvailability(data, req) {
  const hotels = data?.hotels?.hotels || [];
  const currency = clean(data?.hotels?.currency || req.query.currency || "GBP").toUpperCase();
  const city = clean(req.query.city || "");
  const country = clean(req.query.country || "");

  return hotels.map((hotel) => {
    const minRate = number(hotel.minRate || hotel.maxRate || 0);
    if (minRate <= 0) return null;

    const rooms = Array.isArray(hotel.rooms)
      ? hotel.rooms.flatMap((room) => {
          const rates = Array.isArray(room.rates) ? room.rates : [];
          return rates.map((rate, index) => {
            const amount = number(rate.net || rate.sellingRate || rate.rate || minRate);
            if (amount <= 0) return null;

            return {
              roomCode: clean(room.code || `HB-ROOM-${index + 1}`),
              roomName: clean(room.name || "Available room"),
              board: clean(rate.boardName || rate.boardCode || "Room option"),
              price: amount,
              convertedPrice: amount,
              displayCurrency: clean(rate.currency || currency).toUpperCase(),
              cancellation: rate.cancellationPolicies ? "Cancellation policy available before booking." : "Cancellation details are confirmed before booking.",
              taxes: "Taxes and fees are confirmed before booking.",
              rate_source_id: clean(rate.rateKey || `HOTELBEDS-${hotel.code}-${index + 1}`),
              rate_source_timestamp: nowISO(),
              source_health: "verified",
              supplier_private: {
                supplier_code: "HOTELBEDS",
                supplier_hotel_id: clean(hotel.code),
                supplier_rate_key: clean(rate.rateKey || "")
              }
            };
          }).filter(Boolean);
        })
      : [];

    const bestRoom = rooms.sort((a, b) => number(a.price) - number(b.price))[0];

    return {
      hotelId: `HOTELBEDS-${clean(hotel.code)}`,
      hotel_id: `HOTELBEDS-${clean(hotel.code)}`,
      supplier_hotel_id: clean(hotel.code),
      supplier_code: "HOTELBEDS",
      name: clean(hotel.name || `Hotelbeds property ${hotel.code}`),
      hotel_name: clean(hotel.name || `Hotelbeds property ${hotel.code}`),
      country,
      city,
      address: clean(hotel.zoneName || ""),
      stars: clean(hotel.categoryName || hotel.categoryCode || ""),
      image: "",
      images: [],
      facilities: [],
      availableToBook: true,
      price: bestRoom ? bestRoom.price : minRate,
      convertedPrice: bestRoom ? bestRoom.convertedPrice : minRate,
      total: bestRoom ? bestRoom.price : minRate,
      currency: bestRoom ? bestRoom.displayCurrency : currency,
      rooms: rooms.slice(0, 8),
      rate_source_id: bestRoom ? bestRoom.rate_source_id : `HOTELBEDS-${hotel.code}`,
      rate_source_timestamp: nowISO(),
      source_health: "verified",
      source: "hotelbeds_live_supplier",
      supplierLabel: "Hotelbeds live rate",
      supplier_private: {
        supplier_code: "HOTELBEDS",
        supplier_hotel_id: clean(hotel.code)
      }
    };
  }).filter(Boolean);
}

async function adaptiveHotelbedsAdapter(req) {
  const cfg = hotelbedsConfig();

  if (MSH_HOTELBEDS_QUOTA_GUARD.blockedUntil && Date.now() < MSH_HOTELBEDS_QUOTA_GUARD.blockedUntil) {
    if (/quota/i.test(safeHotelbedsError) || response.status === 403 || response.status === 429) {
      MSH_HOTELBEDS_QUOTA_GUARD.blockedUntil = Date.now() + 15 * 60 * 1000;
      MSH_HOTELBEDS_QUOTA_GUARD.lastError = clean(safeHotelbedsError).slice(0, 300);
    }

    return {
      supplier: "hotelbeds",
      method: "hotelbeds_live_availability",
      status: "quota_guard_active",
      safeError: MSH_HOTELBEDS_QUOTA_GUARD.lastError || "Hotelbeds quota guard is active.",
      count: 0,
      hotels: []
    };
  }

  if (!cfg.apiKey || !cfg.secret) {
    return {
      supplier: "hotelbeds",
      method: "hotelbeds_live_availability",
      status: "missing_env_credentials",
      count: 0,
      hotels: []
    };
  }

  const city = clean(req.query.city || "");
  const country = clean(req.query.country || "");
  const destinationCode = clean(
    req.query.destinationCode ||
    req.query.destination_code ||
    hotelbedsDestinationCode(city, country)
  ).toUpperCase();

  if (!destinationCode) {
    return {
      supplier: "hotelbeds",
      method: "hotelbeds_live_availability",
      status: "destination_code_not_mapped",
      count: 0,
      hotels: []
    };
  }

  const body = hotelbedsAvailabilityBody(req, destinationCode);
  const url = `${cfg.baseUrl}/hotel-api/1.0/hotels`;

  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Api-key": cfg.apiKey,
      "X-Signature": hotelbedsSignature(cfg.apiKey, cfg.secret),
      "Accept": "application/json",
      "Content-Type": "application/json"
    },
    body: JSON.stringify(body)
  });

  const text = await response.text();

  const hotelbedsDebugHotelCount = (() => {
    try {
      const parsed = JSON.parse(text);
      return Array.isArray(parsed?.hotels?.hotels) ? parsed.hotels.hotels.length : 0;
    } catch {
      return 0;
    }
  })();

  console.log("HOTELBEDS_DEBUG_SAFE", {
    status: response.status,
    ok: response.ok,
    destinationCode,
    hotelCount: hotelbedsDebugHotelCount,
    hasAuditData: String(text || "").includes("auditData"),
    hasError: String(text || "").toLowerCase().includes("error")
  });

  let data = {};
  try {
    data = JSON.parse(text);
  } catch {
    data = {};
  }

  if (!response.ok) {
    const safeHotelbedsError =
      data?.error?.message ||
      data?.error?.code ||
      data?.message ||
      data?.fault?.faultstring ||
      data?.fault?.detail?.errorcode ||
      "Hotelbeds rejected the request.";

    return {
      supplier: "hotelbeds",
      method: "hotelbeds_live_availability",
      status: `hotelbeds_http_${response.status}`,
      httpStatus: response.status,
      safeError: clean(safeHotelbedsError).slice(0, 300),
      destinationCode,
      count: 0,
      hotels: []
    };
  }

  const hotels = parseHotelbedsAvailability(data, req);

  return {
    supplier: "hotelbeds",
    method: `hotelbeds_live_availability_${destinationCode}`,
    status: hotels.length ? "active_live_rates_returned" : "active_but_no_live_rates_returned",
    destinationCode,
    count: hotels.length,
    hotels
  };
}
async function adaptiveHyperGuestAdapter(req) {
  return {
    supplier: "hyperguest",
    method: "hyperguest_property_or_location_adapter_ready",
    status: "pending_credentials_or_activation",
    count: 0,
    hotels: []
  };
}

async function adaptiveSiteMinderAdapter(req) {
  return {
    supplier: "siteminder",
    method: "siteminder_property_connection_adapter_ready",
    status: "pending_credentials_or_activation",
    count: 0,
    hotels: []
  };
}


// MSH PRODUCTION SUPPLIER GUARD START
const MSH_HOTELBEDS_QUOTA_GUARD = { blockedUntil: 0, lastError: "" };

function mshNorm(value) {
  return String(value || "").trim().toLowerCase().replace(/[^a-z0-9]+/g, " ").replace(/\s+/g, " ").trim();
}

function mshCustomerSafeHotelName(nameValue) {
  const name = clean(nameValue || "");
  if (!name) return "";
  if (/^webbeds\s+property\s+\d+$/i.test(name)) return "";
  if (/^hotelbeds\s+property\s+\d+$/i.test(name)) return "";
  if (/^ratehawk\s+property\s+\d+$/i.test(name)) return "";
  if (/^property\s+\d+$/i.test(name)) return "";
  if (/^hotel\s+\d+$/i.test(name)) return "";
  if (/^live\s+supplier\s+property/i.test(name)) return "";
  if (/^selected\s+hotel$/i.test(name)) return "";
  return name;
}

function mshCountryMatches(hotelCountry, wantedCountry) {
  const h = mshNorm(hotelCountry);
  const w = mshNorm(wantedCountry);
  if (!h || !w) return false;
  if (h === w) return true;
  const uk = ["united kingdom", "great britain", "england", "gb", "uk"];
  const us = ["united states", "united states of america", "usa", "us"];
  return (uk.includes(h) && uk.includes(w)) || (us.includes(h) && us.includes(w));
}

function mshCityMatches(hotelCity, wantedCity) {
  const h = mshNorm(hotelCity);
  const w = mshNorm(wantedCity);
  if (!h || !w) return false;
  return h === w || h.includes(w) || w.includes(h);
}

function mshSupplierCode(hotel) {
  return clean(hotel.supplier_code || hotel.supplierCode || hotel.supplier_private?.supplier_code || hotel.source || hotel.supplierLabel || "").toUpperCase();
}

function mshBadDestinationName(hotel, wantedCity) {
  const name = mshNorm(hotel.name || hotel.hotel_name || "");
  const w = mshNorm(wantedCity);
  if (!name || !w) return false;
  const known = [
    "london", "wembley", "shepherds bush", "st pauls", "cambridge", "piccadilly", "kensington", "hammersmith",
    "new york", "brooklyn", "manhattan", "greenwich village",
    "los angeles", "anaheim", "venice beach", "hollywood", "beverly",
    "dubai", "abu dhabi", "paris", "rome", "madrid", "barcelona"
  ];
  for (const item of known) {
    const n = mshNorm(item);
    if (n !== w && name.includes(n)) return true;
  }
  return false;
}

function mshVerifiedSupplierHotel(hotel, wantedCountry, wantedCity) {
  if (!hotel) return null;
  const name = mshCustomerSafeHotelName(hotel.name || hotel.hotel_name || hotel.hotelName);
  if (!name) return null;
  const price = number(hotel.price || hotel.convertedPrice || hotel.total || hotel.rooms?.[0]?.price || hotel.rooms?.[0]?.convertedPrice || 0);
  if (price <= 0) return null;
  if (hotel.availableToBook === false) return null;
  const hotelCountry = clean(hotel.country || hotel.location?.country || "");
  const hotelCity = clean(hotel.city || hotel.destination || hotel.location?.city || "");
  if (!mshCountryMatches(hotelCountry, wantedCountry)) return null;
  if (!mshCityMatches(hotelCity, wantedCity)) return null;
  if (mshBadDestinationName(hotel, wantedCity)) return null;
  const code = mshSupplierCode(hotel);
  const source = mshNorm(hotel.source || hotel.supplierLabel || code);
  if (!(source.includes("webbeds") || source.includes("hotelbeds") || source.includes("ratehawk") || source.includes("worldota") || source.includes("hyperguest"))) return null;
  return {
    ...hotel,
    name,
    hotel_name: name,
    price,
    convertedPrice: number(hotel.convertedPrice || price),
    total: number(hotel.total || price),
    country: clean(wantedCountry),
    city: clean(wantedCity),
    destination: clean(wantedCity),
    availableToBook: true,
    source_health: "verified"
  };
}

function mshRatehawkRegionId(country, city) {
  const key = `${mshNorm(country)}|${mshNorm(city)}`;
  const map = {
    "united kingdom|london": 2114,
    "united states|new york": 2621,
    "united states|los angeles": 2414,
    "united arab emirates|dubai": 2734,
    "france|paris": 2734,
    "brazil|sao paulo": 5572,
    "brazil|rio de janeiro": 2959,
    "argentina|buenos aires": 3422,
    "tanzania|zanzibar": 11069,
    "tanzania|arusha": 11286
  };
  return Number(map[key] || 0);
}

function mshParseRatehawkHotels(data, req) {
  const country = clean(req.query.country || "");
  const city = clean(req.query.city || "");
  const currency = clean(req.query.currency || data?.currency || "GBP").toUpperCase();
  const list = Array.isArray(data?.hotels) ? data.hotels : Array.isArray(data?.data?.hotels) ? data.data.hotels : [];
  return list.map((item, index) => {
    const rates = Array.isArray(item.rates) ? item.rates : Array.isArray(item.room_groups?.[0]?.rates) ? item.room_groups[0].rates : [];
    const firstRate = rates[0] || {};
    const payment = firstRate.payment_options?.payment_types?.[0] || {};
    const amount = number(payment.amount || firstRate.daily_prices?.[0] || firstRate.price || item.price || 0);
    const name = clean(item.name || item.hotel_name || item.id || "");
    if (amount <= 0 || !name) return null;
    const id = clean(item.id || item.hotel_id || `ratehawk-${index}`);
    return {
      hotelId: `RATEHAWK-${id}`,
      hotel_id: `RATEHAWK-${id}`,
      id: `RATEHAWK-${id}`,
      supplier_hotel_id: id,
      supplier_code: "RATEHAWK",
      name,
      hotel_name: name,
      country,
      city,
      price: amount,
      convertedPrice: amount,
      total: amount,
      currency,
      displayCurrency: currency,
      image: Array.isArray(item.images) ? clean(item.images[0]) : "",
      images: Array.isArray(item.images) ? item.images.filter(Boolean) : [],
      availableToBook: true,
      rooms: [{
        roomCode: clean(firstRate.room_data_trans?.main_name || firstRate.room_name || "STANDARD"),
        roomName: clean(firstRate.room_data_trans?.main_name || firstRate.room_name || "Available room"),
        board: clean(firstRate.meal || "Room option"),
        price: amount,
        convertedPrice: amount,
        displayCurrency: currency,
        rate_source_id: clean(firstRate.book_hash || id),
        rate_source_timestamp: nowISO(),
        source_health: "verified",
        supplier_private: { supplier_code: "RATEHAWK", supplier_hotel_id: id, book_hash: clean(firstRate.book_hash || "") }
      }],
      source: "ratehawk_live_supplier",
      supplierLabel: "RateHawk live rate",
      source_health: "verified",
      supplier_private: { supplier_code: "RATEHAWK", supplier_hotel_id: id }
    };
  }).filter(Boolean);
}

async function adaptiveRatehawkAdapter(req) {
  const cfg = ratehawkConfig();
  if (!cfg.ready) {
    return { supplier: "ratehawk", method: "ratehawk_region_search", status: "missing_or_disabled_credentials", count: 0, hotels: [] };
  }
  const country = clean(req.query.country || "");
  const city = clean(req.query.city || "");
  const regionId = Number(req.query.ratehawkRegionId || req.query.region_id || mshRatehawkRegionId(country, city));
  if (!regionId) {
    return { supplier: "ratehawk", method: "ratehawk_region_search", status: "region_not_mapped", count: 0, hotels: [] };
  }
  const checkin = clean(req.query.checkIn || req.query.checkin || tomorrowISOForRatehawk(14));
  const checkout = clean(req.query.checkOut || req.query.checkout || tomorrowISOForRatehawk(15));
  const payload = {
    checkin,
    checkout,
    residency: clean(req.query.residency || "gb").toLowerCase(),
    language: clean(req.query.language || "en"),
    guests: [{ adults: Math.max(1, Number(req.query.guests || 2)), children: [] }],
    region_id: regionId,
    currency: clean(req.query.currency || "GBP").toUpperCase()
  };
  const result = await ratehawkPost("/api/b2b/v3/search/serp/region/", payload);
  if (!result.ok) {
    return { supplier: "ratehawk", method: "ratehawk_region_search", status: `ratehawk_http_${result.status}`, count: 0, hotels: [] };
  }
  const hotels = mshParseRatehawkHotels(result.data, req);
  return { supplier: "ratehawk", method: `ratehawk_region_${regionId}`, status: hotels.length ? "active_live_rates_returned" : "active_but_no_live_rates_returned", count: hotels.length, hotels };
}
// MSH PRODUCTION SUPPLIER GUARD END

function adaptiveEnabledSupplierAdapters() {
  return [
    adaptiveWebbedsAdapter,
    adaptiveRatehawkAdapter,
    adaptiveHotelbedsAdapter
  ];
}
async function adaptiveSupplierSearch(req) {
  const adapters = adaptiveEnabledSupplierAdapters();

  const results = await Promise.allSettled(adapters.map((adapter) => adapter(req)));

  return results.map((r, index) =>
    r.status === "fulfilled"
      ? r.value
      : {
          supplier: adapters[index]?.name || "unknown",
          method: "adapter_failed",
          status: "failed",
          count: 0,
          hotels: []
        }
  );
}
function normalizeWebbedsImageUrl(url) {
  const value = String(url || "").trim();
  if (!value) return "";
  if (value.startsWith("//")) return `https:${value}`;
  return value.replace(/&amp;/g, "&");
}
function isAllowedSupplierImageUrl(url) {
  const u = clean(url);
  return /^https:\/\/static-images\.webbeds\.com\//i.test(u) ||
         /^https:\/\/us\.dotwconnect\.com\/poze_hotel\//i.test(u) ||
         /^https:\/\/photos\.hotelbeds\.com\//i.test(u);
}

function supplierImageProxyUrl(req, url) {
  const cleanUrl = normalizeWebbedsImageUrl ? normalizeWebbedsImageUrl(url) : clean(url);
  if (!isAllowedSupplierImageUrl(cleanUrl)) return cleanUrl;
  const host = `${req.protocol}://${req.get("host")}`;
  return `${host}/api/supplier-image?url=${encodeURIComponent(cleanUrl)}`;
}

app.get("/api/supplier-image", async (req, res) => {
  const url = normalizeWebbedsImageUrl(req.query.url || "");

  try {
    if (!isAllowedSupplierImageUrl(url)) {
      return res.status(400).send("Image source not allowed.");
    }

    const headerAttempts = [
      {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/125 Safari/537.36",
        "Accept": "image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8",
        "Referer": "https://www.dotwconnect.com/",
        "Origin": "https://www.dotwconnect.com"
      },
      {
        "User-Agent": "Mozilla/5.0",
        "Accept": "*/*",
        "Referer": "https://us.dotwconnect.com/"
      },
      {
        "User-Agent": "MySpaceHotel/1.0",
        "Accept": "image/*,*/*;q=0.8"
      }
    ];

    for (const headers of headerAttempts) {
      try {
        const upstream = await fetch(url, {
          method: "GET",
          redirect: "follow",
          headers
        });

        const contentType = upstream.headers.get("content-type") || "";

        if (upstream.ok && /^image\//i.test(contentType)) {
          const buffer = Buffer.from(await upstream.arrayBuffer());
          res.setHeader("Content-Type", contentType || "image/jpeg");
          res.setHeader("Cache-Control", "public, max-age=86400");
          res.setHeader("X-MySpace-Image-Source", "supplier-proxy");
          return res.send(buffer);
        }
      } catch {
        // Try the next header set.
      }
    }

    // Last resort: let the browser try the exact supplier URL directly.
    // This is still a real supplier image URL, not a placeholder.
    res.setHeader("Cache-Control", "no-store");
    return res.redirect(302, url);
  } catch {
    return res.status(502).send("Image proxy failed.");
  }
});
function normalizeSupplierImageUrl(url) {
  let value = String(url || "").trim();

  if (!value) return "";

  value = value
    .replace(/&amp;/g, "&")
    .replace(/^<!\[CDATA\[/i, "")
    .replace(/\]\]>$/i, "")
    .trim();

  if (value.startsWith("//")) value = `https:${value}`;

  return /^https?:\/\//i.test(value) ? value : "";
}

function isWebbedsImageUrl(url) {
  const value = normalizeSupplierImageUrl(url);
  return /^https:\/\/static-images\.webbeds\.com\//i.test(value) ||
         /^https:\/\/us\.dotwconnect\.com\/poze_hotel\//i.test(value);
}

function isHotelbedsImageUrl(url) {
  const value = normalizeSupplierImageUrl(url);
  return /^https:\/\/photos\.hotelbeds\.com\//i.test(value);
}
function bestSupplierImageForCustomer(req, hotel) {
  const supplierCode = clean(hotel.supplier_code || hotel.supplier_private?.supplier_code || "").toUpperCase();

  const rawImages = Array.from(new Set([
    hotel.image,
    hotel.image_url,
    hotel.photo,
    hotel.thumbnail,
    ...(Array.isArray(hotel.images) ? hotel.images : [])
  ].map((x) => normalizeSupplierImageUrl(x)).filter(Boolean)));

  if (supplierCode === "HOTELBEDS") {
    const directImages = rawImages.filter((url) => isHotelbedsImageUrl(url) || /^https?:\/\//i.test(url));
    return {
      image: directImages[0] || "",
      images: directImages
    };
  }

  if (supplierCode === "WEBBEDS") {
    const directImages = rawImages.filter((url) => isWebbedsImageUrl(url));

    return {
      image: directImages[0] || "",
      images: directImages
    };
  }

  return {
    image: rawImages[0] || "",
    images: rawImages
  };
}
app.get("/api/multi-supplier-hotels", async (req, res) => {
  const country = String(req.query.country || "").trim();
  const city = String(req.query.city || "").trim();
  const currency = String(req.query.currency || "GBP").trim().toUpperCase();
  const guests = Math.max(1, Number(req.query.guests || 2));
  const rooms = Math.max(1, Number(req.query.rooms || 1));
  try {
    const country = clean(req.query.country || "");
    const resolvedCity = clean(req.query.city || req.query.destination || "");
    const currency = clean(req.query.currency || "GBP").toUpperCase();
    const requestedLimit = Math.max(30, Math.min(160, Number(req.query.limit || 80)));
    const supplierResults = await adaptiveSupplierSearch(req);

    const allHotels = [];
    const suppliers = {};
    const methods = {};
    const supplierStatus = {};

    for (const result of supplierResults) {
      suppliers[result.supplier] = result.count || 0;
      methods[result.supplier] = result.method || "";
      supplierStatus[result.supplier] = result.status || "unknown";
      if (result.safeError) supplierStatus[`${result.supplier}_error`] = result.safeError;
      if (result.destinationCode) supplierStatus[`${result.supplier}_destination`] = result.destinationCode;
      if (result.safeError) supplierStatus[`${result.supplier}_error`] = result.safeError;
      if (result.destinationCode) supplierStatus[`${result.supplier}_destination`] = result.destinationCode;
      allHotels.push(...(Array.isArray(result.hotels) ? result.hotels : []));
    }

    const byKey = new Map();

    for (const hotel of allHotels) {
      const normalizedRaw = adaptiveNormalizeSupplierHotel(hotel, hotel.supplierLabel, hotel.source);
      const normalized = mshVerifiedSupplierHotel(normalizedRaw, country, resolvedCity);
      if (!normalized) continue;

      const key = adaptiveSupplierHotelKey(normalized);
      const existing = byKey.get(key);

      if (!existing) {
        byKey.set(key, normalized);
      } else {
        const existingScore =
          (clean(existing.image) ? 50 : 0) +
          (number(existing.price) > 0 ? 25 : 0) +
          (mshSupplierCode(existing).includes("HOTELBEDS") ? 10 : 0) +
          (mshSupplierCode(existing).includes("RATEHAWK") ? 8 : 0) +
          (mshSupplierCode(existing).includes("WEBBEDS") ? 6 : 0);

        const newScore =
          (clean(normalized.image) ? 50 : 0) +
          (number(normalized.price) > 0 ? 25 : 0) +
          (mshSupplierCode(normalized).includes("HOTELBEDS") ? 10 : 0) +
          (mshSupplierCode(normalized).includes("RATEHAWK") ? 8 : 0) +
          (mshSupplierCode(normalized).includes("WEBBEDS") ? 6 : 0);

        if (newScore > existingScore || number(normalized.price) < number(existing.price)) {
          byKey.set(key, { ...existing, ...normalized });
        }
      }
    }

    let hotels = Array.from(byKey.values());

    hotels.sort((a, b) => {
      const aImage = clean(a.image) ? 1 : 0;
      const bImage = clean(b.image) ? 1 : 0;
      if (aImage !== bImage) return bImage - aImage;

      const aPrice = number(a.price || a.total || 0);
      const bPrice = number(b.price || b.total || 0);
      if (aPrice > 0 && bPrice > 0) return aPrice - bPrice;

      return clean(a.name || a.hotel_name).localeCompare(clean(b.name || b.hotel_name));
    });

    hotels = hotels.slice(0, requestedLimit);

    hotels = hotels.map((hotel) => {
      const picked = bestSupplierImageForCustomer(req, hotel);
      const withBestImage = {
        ...hotel,
        image: picked.image || hotel.image || "",
        images: picked.images.length ? picked.images : (Array.isArray(hotel.images) ? hotel.images.filter(Boolean) : [])
      };
      return withBestImage;
    });

    const finalSuppliers = { hotelbeds: 0, webbeds: 0, ratehawk: 0, hyperguest: 0 };
    for (const hotel of hotels) {
      const code = mshSupplierCode(hotel);
      if (code.includes("HOTELBEDS")) finalSuppliers.hotelbeds += 1;
      else if (code.includes("RATEHAWK") || code.includes("WORLDOTA")) finalSuppliers.ratehawk += 1;
      else if (code.includes("WEBBEDS")) finalSuppliers.webbeds += 1;
      else if (code.includes("HYPERGUEST")) finalSuppliers.hyperguest += 1;
    }

    res.json({
      ok: true,
      source: "multi_supplier",
      model: "adaptive_supplier_adapter_layer",
      methods,
      suppliers: finalSuppliers,
      rawSupplierCounts: suppliers,
      supplierStatus,
      count: hotels.length,
      message: hotels.length ? "Verified live hotel rates returned." : `No verified live hotel rates were returned for ${resolvedCity}, ${country}. Try a nearby major city.`,
      hotels,
      quoteRequired: hotels.length === 0,
      quoteDestination: {
        country,
        city: resolvedCity,
        requestedCity: city,
        currency
      }
    });
  } catch (err) {
    res.status(500).json({
      ok: false,
      message: "Adaptive multi-supplier hotel search failed.",
      error: err.message
    });
  }
});
// MSH REAL MULTI SUPPLIER ORCHESTRATOR END


// MSH WEBBEDS STATIC CONTENT SYNC START
const WEBBEDS_STATIC_CONTENT_FILE = path.join(DATA_DIR, "webbeds-static-hotels.json");

function loadWebbedsStaticHotels() {
  try {
    if (!fs.existsSync(WEBBEDS_STATIC_CONTENT_FILE)) return {};
    return JSON.parse(fs.readFileSync(WEBBEDS_STATIC_CONTENT_FILE, "utf8"));
  } catch {
    return {};
  }
}

function saveWebbedsStaticHotels(map) {
  fs.writeFileSync(WEBBEDS_STATIC_CONTENT_FILE, JSON.stringify(map || {}, null, 2), "utf8");
}

function decodeXml(value) {
  return String(value || "")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'");
}
function xmlTagValue(block, tag) {
  const match = String(block || "").match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`, "i"));
  return match ? decodeXml(String(match[1] || "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim()) : "";
}

function xmlAttrValue(block, attr) {
  const match = String(block || "").match(new RegExp(`${attr}=["']([^"']+)["']`, "i"));
  return match ? decodeXml(match[1]) : "";
}

function extractImageUrls(block) {
  const urls = [];
  const xml = String(block || "");

  const patterns = [
    /<url[^>]*>\s*(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?\s*<\/url>/gi,
    /<thumb[^>]*>\s*(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?\s*<\/thumb>/gi,
    /https?:\/\/[^\s<>"']+\.(?:jpg|jpeg|png|webp)(?:\?[^\s<>"']*)?/gi
  ];

  for (const re of patterns) {
    let m;
    while ((m = re.exec(xml)) !== null) {
      const raw = m[1] || m[0] || "";
      const url = decodeXml(String(raw).replace("<![CDATA[", "").replace("]]>", "").trim());
      if (url && /^https?:\/\//i.test(url) && !urls.includes(url)) urls.push(url);
    }
  }

  return urls;
}

function splitWebbedsHotelBlocks(xmlText) {
  const xml = String(xmlText || "");
  const starts = [];
  const startRe = /<hotel\b[^>]*\bhotelid=["'][^"']+["'][^>]*>/gi;
  let m;

  while ((m = startRe.exec(xml)) !== null) {
    starts.push(m.index);
  }

  const blocks = [];
  for (let i = 0; i < starts.length; i += 1) {
    const start = starts[i];
    const end = i + 1 < starts.length ? starts[i + 1] : xml.indexOf("</hotels>", start);
    if (end > start) blocks.push(xml.slice(start, end));
  }

  return blocks;
}

function parseWebbedsStaticHotels(xmlText) {
  const out = {};
  const hotelBlocks = splitWebbedsHotelBlocks(xmlText);

  for (const block of hotelBlocks) {
    const hotelId = xmlAttrValue(block, "hotelid") || xmlAttrValue(block, "hotelId") || xmlTagValue(block, "hotelId");
    if (!hotelId) continue;

    const images = extractImageUrls(block);
    const fullAddressBlock = (block.match(/<fullAddress[\s\S]*?<\/fullAddress>/i) || [""])[0];
    const geoPointBlock = (block.match(/<geoPoint[\s\S]*?<\/geoPoint>/i) || [""])[0];

    out[String(hotelId)] = {
      supplier_code: "WEBBEDS",
      hotelId: String(hotelId),
      hotelName: xmlTagValue(block, "hotelName"),
      address: xmlTagValue(block, "address") || xmlTagValue(fullAddressBlock, "hotelStreetAddress"),
      city: xmlTagValue(block, "cityName") || xmlAttrValue(block, "cityname") || xmlTagValue(fullAddressBlock, "hotelCity"),
      country: xmlTagValue(block, "countryName") || xmlTagValue(fullAddressBlock, "hotelCountry"),
      rating: xmlTagValue(block, "rating"),
      description: xmlTagValue(block, "description1") || xmlTagValue(block, "description2"),
      phone: xmlTagValue(block, "hotelPhone"),
      checkIn: xmlTagValue(block, "hotelCheckIn"),
      checkOut: xmlTagValue(block, "hotelCheckOut"),
      lat: xmlTagValue(block, "lat") || xmlAttrValue(geoPointBlock, "lat"),
      lng: xmlTagValue(block, "lng") || xmlAttrValue(geoPointBlock, "lng"),
      images,
      image: images[0] || "",
      lastUpdated: xmlTagValue(block, "lastUpdated") || new Date().toISOString()
    };
  }

  return out;
}
function buildWebbedsStaticCityXml({ cityId, currencyId = 520 }) {
  return webbedsCustomerXml(`
  <request command="searchhotels">
    <bookingDetails>
      <fromDate>${new Date().toISOString().slice(0, 10)}</fromDate>
      <toDate>${new Date(Date.now() + 86400000).toISOString().slice(0, 10)}</toDate>
      <currency>${currencyId}</currency>
      <rooms no="1">
        <room runno="0">
          <adultsCode>1</adultsCode>
          <children no="0"></children>
          <rateBasis>-1</rateBasis>
        </room>
      </rooms>
    </bookingDetails>
    <return>
      <getRooms>true</getRooms>
      <filters xmlns:a="http://us.dotwconnect.com/xsd/atomicCondition" xmlns:c="http://us.dotwconnect.com/xsd/complexCondition">
        <city>${xmlEscapeValue(cityId)}</city>
        <noPrice>true</noPrice>
      </filters>
      <fields>
        <field>hotelName</field>
        <field>fullAddress</field>
        <field>address</field>
        <field>description1</field>
        <field>description2</field>
        <field>rating</field>
        <field>hotelImages</field>
        <field>images</field>
        <field>geoPoint</field>
        <field>cityName</field>
        <field>cityCode</field>
        <field>countryName</field>
        <field>countryCode</field>
        <field>hotelPhone</field>
        <field>hotelCheckIn</field>
        <field>hotelCheckOut</field>
        <field>lastUpdated</field>
        <field>priority</field>
        <field>hotelAmenities</field>
        <roomField>name</roomField>
        <roomField>roomInfo</roomField>
        <roomField>roomDescription</roomField>
        <roomField>roomImages</roomField>
      </fields>
    </return>
  </request>`);
}


app.get("/api/webbeds/static-city-sync-debug", async (req, res) => {
  try {
    const city = clean(req.query.city || "London");
    const currency = clean(req.query.currency || "GBP").toUpperCase();
    const cityId = findWebbedsCityCodeFromCache(city) || webbedsCityIdFromName(city);

    if (!cityId) {
      return res.status(404).json({ ok: false, message: "WebBeds city code not found.", city });
    }

    const currencyId = webbedsCurrencyIdFromCode(currency);
    const xml = buildWebbedsStaticCityXml({ cityId, currencyId });
    const result = await webbedsPostXml(xml);
    const raw = String(result.text || "");

    fs.writeFileSync(path.join(DATA_DIR, "webbeds-static-debug.xml"), raw, "utf8");

    res.json({
      ok: true,
      city,
      cityId,
      length: raw.length,
      hotelCount: (raw.match(/<hotel\b/gi) || []).length,
      imagesTagCount: (raw.match(/<images\b/gi) || []).length,
      hotelImagesTagCount: (raw.match(/<hotelImages\b/gi) || []).length,
      imageTagCount: (raw.match(/<image\b/gi) || []).length,
      urlTagCount: (raw.match(/<url\b/gi) || []).length,
      thumbTagCount: (raw.match(/<thumb\b/gi) || []).length,
      jpgCount: (raw.match(/\.jpg/gi) || []).length,
      preview: raw.slice(0, 4000)
    });
  } catch (err) {
    res.status(500).json({
      ok: false,
      message: "WebBeds static debug failed.",
      error: err.message
    });
  }
});

app.get("/api/webbeds/static-city-sync", async (req, res) => {
  try {
    const city = clean(req.query.city || "London");
    const currency = clean(req.query.currency || "GBP").toUpperCase();
    const cityId = findWebbedsCityCodeFromCache(city) || webbedsCityIdFromName(city);

    if (!cityId) {
      return res.status(404).json({ ok: false, message: "WebBeds city code not found.", city });
    }

    const currencyId = webbedsCurrencyIdFromCode(currency);
    const xml = buildWebbedsStaticCityXml({ cityId, currencyId });
    const result = await webbedsPostXml(xml);
    const parsed = parseWebbedsStaticHotels(result.text);

    const existing = loadWebbedsStaticHotels();
    const merged = { ...existing, ...parsed };
    saveWebbedsStaticHotels(merged);

    res.json({
      ok: true,
      source: "webbeds_static_content",
      city,
      cityId,
      addedOrUpdated: Object.keys(parsed).length,
      totalCached: Object.keys(merged).length,
      sample: Object.values(parsed).slice(0, 5)
    });
  } catch (err) {
    res.status(500).json({
      ok: false,
      message: "WebBeds static city sync failed.",
      error: err.message
    });
  }
});

function normalizeWebbedsHotelId(value) {
  return String(value || "")
    .replace(/^WEBBEDS-/i, "")
    .replace(/[^\d]/g, "")
    .trim();
}

function enrichWebbedsHotelWithStaticContent(hotel) {
  const cache = loadWebbedsStaticHotels();

  const possibleIds = [
    hotel.supplier_hotel_id,
    hotel.supplierHotelId,
    hotel.hotel_id,
    hotel.hotelId,
    hotel.id,
    hotel.hotelCode
  ]
    .map(normalizeWebbedsHotelId)
    .filter(Boolean);

  let info = null;
  let matchedId = "";

  for (const id of possibleIds) {
    if (cache[id]) {
      info = cache[id];
      matchedId = id;
      break;
    }
  }

  if (!info) return hotel;

  const realName = clean(info.hotelName);
  const imageList = Array.isArray(info.images)
    ? info.images.filter((url) => clean(url) && /^https?:\/\//i.test(clean(url)))
    : [];

  const realImage = clean(info.image) || imageList[0] || clean(hotel.image);

  return {
    ...hotel,
    hotelId: hotel.hotelId || `WEBBEDS-${matchedId}`,
    hotel_id: hotel.hotel_id || `WEBBEDS-${matchedId}`,
    supplier_hotel_id: matchedId || hotel.supplier_hotel_id,
    supplier_code: "WEBBEDS",
    source: "webbeds_live_supplier",
    supplierLabel: "WebBeds live rate",
    name: realName || hotel.name || hotel.hotel_name || `WebBeds property ${matchedId}`,
    hotel_name: realName || hotel.hotel_name || hotel.name || `WebBeds property ${matchedId}`,
    address: clean(info.address) || hotel.address || "",
    city: clean(info.city) || hotel.city || "",
    country: clean(info.country) || hotel.country || "",
    stars: clean(info.rating) || hotel.stars || "",
    rating: clean(info.rating) || hotel.rating || "",
    description: clean(info.description) || hotel.description || "",
    phone: clean(info.phone) || hotel.phone || "",
    checkIn: clean(info.checkIn) || hotel.checkIn || "",
    checkOut: clean(info.checkOut) || hotel.checkOut || "",
    lat: clean(info.lat) || hotel.lat || "",
    lng: clean(info.lng) || hotel.lng || "",
    image: realImage,
    images: imageList.length ? imageList : hotel.images || []
  };
}
// MSH WEBBEDS STATIC CONTENT SYNC END

function publicSearchCityAlias(value) {
  const raw = String(value || "").trim();
  const s = raw.toLowerCase();

  if (!s) return "";

  if (
    s === "lon" ||
    s === "london" ||
    s.includes("london") ||
    s.includes("greater london") ||
    s.includes("canary wharf") ||
    s.includes("westminster") ||
    s.includes("kensington") ||
    s.includes("paddington") ||
    s.includes("heathrow") ||
    s.includes("gatwick")
  ) return "London";

  if (s === "nyc" || s.includes("new york")) return "New York";
  if (s === "atl" || s.includes("atlanta")) return "Atlanta";
  if (s === "man" || s.includes("manchester")) return "Manchester";
  if (s === "bham" || s.includes("birmingham")) return "Birmingham";
  if (s === "par" || s.includes("paris")) return "Paris";
  if (s === "dxb" || s.includes("dubai")) return "Dubai";

  return raw.split(",")[0].trim().replace(/\b\w/g, (m) => m.toUpperCase());
}

function firstPublicImage(hotel) {
  const items = [
    hotel && hotel.image,
    hotel && hotel.image_url,
    hotel && hotel.thumbnail,
    hotel && hotel.photo,
    ...(Array.isArray(hotel && hotel.images) ? hotel.images : []),
    ...(Array.isArray(hotel && hotel.hotelImages) ? hotel.hotelImages : []),
    ...(Array.isArray(hotel && hotel.propertyImages) ? hotel.propertyImages : []),
    ...(Array.isArray(hotel && hotel.webbedsImages) ? hotel.webbedsImages : []),
  ];

  for (const item of items) {
    if (typeof item === "string" && /^https?:\/\//i.test(item)) return item.replace(/^http:\/\//i, "https://");
    if (item && typeof item === "object") {
      const url = item.url || item.imageUrl || item.image_url || item.src || item.href || item.large || item.medium || item.original;
      if (typeof url === "string" && /^https?:\/\//i.test(url)) return url.replace(/^http:\/\//i, "https://");
    }
  }

  return "";
}

function publicHotelName(hotel) {
  return String(hotel.name || hotel.hotel_name || hotel.hotelName || hotel.propertyName || hotel.title || "Hotel").trim();
}

function publicHotelCity(hotel) {
  return String(hotel.city || hotel.destination || hotel.location?.city || hotel.area || "").trim();
}

function publicHotelCountry(hotel) {
  return String(hotel.country || hotel.location?.country || "").trim();
}

function publicHotelPrice(hotel) {
  const room = Array.isArray(hotel.rooms) && hotel.rooms.length ? hotel.rooms[0] : {};
  const n = Number(
    hotel.price ||
    hotel.rate ||
    hotel.amount ||
    hotel.total ||
    hotel.convertedPrice ||
    room.price ||
    room.convertedPrice ||
    0
  );
  return Number.isFinite(n) && n > 0 ? n : 0;
}

function loadPublicHotelFiles() {
  const files = [
    path.join(__dirname, "data", "webbeds-static-hotels.json"),
    path.join(__dirname, "data", "live_hotels.json")
  ];

  const all = [];

  for (const file of files) {
    try {
      if (!fs.existsSync(file)) continue;
      const parsed = JSON.parse(fs.readFileSync(file, "utf8"));
      const list = Array.isArray(parsed) ? parsed : Array.isArray(parsed.hotels) ? parsed.hotels : Array.isArray(parsed.data) ? parsed.data : [];
      all.push(...list);
    } catch {}
  }

  return all;
}

app.get("/api/public-hotel-search", (req, res) => {
  try {
    const country = String(req.query.country || "").trim();
    const city = publicSearchCityAlias(req.query.city || "");
    const limit = Math.min(500, Math.max(50, Number(req.query.limit || 300)));

    if (!country || !city) {
      return res.json({ ok: true, count: 0, city, country, hotels: [] });
    }

    const countryLower = country.toLowerCase();
    const cityLower = city.toLowerCase();

    const hotels = loadPublicHotelFiles();

    const matched = hotels
      .filter((hotel) => {
        const hc = publicHotelCountry(hotel).toLowerCase();
        const hcity = publicHotelCity(hotel).toLowerCase();
        const hname = publicHotelName(hotel).toLowerCase();

        const countryOk = !hc || hc.includes(countryLower) || countryLower.includes(hc);
        const cityOk =
          hcity.includes(cityLower) ||
          cityLower.includes(hcity) ||
          hname.includes(cityLower);

        return countryOk && cityOk;
      })
      .slice(0, limit)
      .map((hotel, index) => {
        const image = firstPublicImage(hotel);
        const price = publicHotelPrice(hotel);

        return {
          ...hotel,
          id: hotel.id || hotel.hotelId || hotel.hotel_id || hotel.code || `PUBLIC-${index}`,
          hotelId: hotel.hotelId || hotel.hotel_id || hotel.id || hotel.code || `PUBLIC-${index}`,
          hotel_id: hotel.hotel_id || hotel.hotelId || hotel.id || hotel.code || `PUBLIC-${index}`,
          name: publicHotelName(hotel),
          city,
          country,
          image,
          images: Array.from(new Set([image, ...(Array.isArray(hotel.images) ? hotel.images : [])].filter(Boolean))),
          price,
          currency: hotel.currency || hotel.displayCurrency || "GBP",
          rooms: Array.isArray(hotel.rooms) && hotel.rooms.length ? hotel.rooms : [{
            roomCode: "STANDARD",
            roomName: "Available room",
            price,
            convertedPrice: price,
            displayCurrency: hotel.currency || hotel.displayCurrency || "GBP"
          }],
          supplier: hotel.supplier || hotel.source || "MySpace Hotel"
        };
      });

    return res.json({
      ok: true,
      source: "public_fast_real_supplier_files",
      country,
      city,
      count: matched.length,
      hotels: matched
    });
  } catch (err) {
    return res.status(500).json({ ok: false, message: "Public hotel search failed." });
  }
});

app.get("/api/customer-live-hotels", async (req, res) => {
  try {
    const query = {
      ...req.query,
      country: req.query.country || "United Kingdom",
      city: normalisePublicSearchCity(req.query.city || "London"),
      limit: req.query.limit || "500"
    };

    req.query = query;

    const mockReq = { query };
    let payload = null;

    const mockRes = {
      status(code) {
        this.statusCode = code;
        return this;
      },
      json(data) {
        payload = data;
        return data;
      }
    };

    const handlers = app._router && app._router.stack
      ? app._router.stack
          .filter((layer) => layer.route && layer.route.path === "/api/multi-supplier-hotels")
          .map((layer) => layer.route.stack[0].handle)
      : [];

    if (!handlers.length) {
      return res.status(500).json({ ok: false, message: "Live hotel route unavailable." });
    }

    await handlers[0](mockReq, mockRes);

    const rawHotels = Array.isArray(payload && payload.hotels)
      ? payload.hotels
      : Array.isArray(payload && payload.results)
      ? payload.results
      : Array.isArray(payload && payload.data)
      ? payload.data
      : [];

    const cleanHotels = rawHotels
      .map((hotel, index) => {
        const room = Array.isArray(hotel.rooms) && hotel.rooms.length ? hotel.rooms[0] : {};
        const price = Number(
          hotel.price ||
          hotel.convertedPrice ||
          hotel.displayPrice ||
          hotel.amount ||
          hotel.total ||
          hotel.totalPrice ||
          hotel.net ||
          hotel.sellingRate ||
          hotel.rate ||
          room.price ||
          room.convertedPrice ||
          room.displayPrice ||
          room.amount ||
          room.total ||
          room.net ||
          room.sellingRate ||
          room.rate ||
          0
        );

        return {
          ...hotel,
          id: hotel.id || hotel.hotelId || hotel.hotel_id || hotel.code || `LIVE-${index}`,
          hotelId: hotel.hotelId || hotel.hotel_id || hotel.id || hotel.code || `LIVE-${index}`,
          hotel_id: hotel.hotel_id || hotel.hotelId || hotel.id || hotel.code || `LIVE-${index}`,
          name: hotel.name || hotel.hotel_name || hotel.hotelName || hotel.propertyName || "Hotel",
          city: hotel.city || query.city,
          country: hotel.country || query.country,
          price,
          currency: hotel.currency || hotel.displayCurrency || room.displayCurrency || query.currency || "GBP",
          rooms: Array.isArray(hotel.rooms) && hotel.rooms.length ? hotel.rooms : [{
            roomCode: hotel.roomCode || "STANDARD",
            roomName: hotel.roomName || "Available room",
            price,
            convertedPrice: price,
            displayCurrency: hotel.currency || hotel.displayCurrency || query.currency || "GBP"
          }]
        };
      })
      .filter((hotel) => Number(hotel.price) > 0)
      .slice(0, 500);

    return res.json({
      ok: true,
      source: "customer_live_priced_only",
      count: cleanHotels.length,
      hotels: cleanhotels,
      quoteRequired: hotels.length === 0,
      quoteDestination: {
        country,
        city: resolvedCity,
        requestedCity: city,
        currency
      }
    });
  } catch (err) {
    return res.status(500).json({
      ok: false,
      message: "Customer live hotel search failed."
    });
  }
});

function MSH_SAFE_LOCAL_LIVE_SEARCH(country, city, area, currency, limit) {
  const wantedCountry = lower(country);
  const wantedCity = lower(city);
  const wantedArea = lower(area);
  const max = Math.max(1, Math.min(Number(limit || 1000), 1000));

  const rows = readHotels()
    .filter((h) => !isBlockedCountry(h.country))
    .filter((h) => !wantedCountry || lower(h.country) === wantedCountry)
    .filter((h) => {
      const hCity = lower(h.city || h.destination || h.area);
      const haystack = lower([
        h.name,
        h.hotel_name,
        h.hotelName,
        h.city,
        h.destination,
        h.area,
        h.zone,
        h.district,
        h.address,
        h.description
      ].join(" "));

      if (!wantedCity) return true;
      if (hCity === wantedCity) return true;
      if (hCity.includes(wantedCity)) return true;
      if (wantedCity.includes(hCity) && hCity.length > 2) return true;
      if (haystack.includes(wantedCity)) return true;
      if (wantedArea && haystack.includes(wantedArea)) return true;

      return false;
    })
    .map((h) => normalizeHotel(h, currency))
    .filter((h) => h.availableToBook && number(h.price) > 0)
    .filter((h) => h.name && h.country && h.city)
    .sort((a, b) => {
      const aText = lower([a.name, a.area, a.address, a.city].join(" "));
      const bText = lower([b.name, b.area, b.address, b.city].join(" "));
      const aArea = wantedArea && aText.includes(wantedArea) ? 1 : 0;
      const bArea = wantedArea && bText.includes(wantedArea) ? 1 : 0;
      if (bArea !== aArea) return bArea - aArea;
      return number(a.price) - number(b.price);
    })
    .slice(0, max);

  return rows;
}
/* MSH GLOBAL SEARCH FIX 2026-06-10 START */
app.get("/api/customer-global-hotels", async (req, res) => {
  try {
    const country = clean(req.query.country || "");
    const city = clean(req.query.city || "");
    const currency = clean(req.query.currency || "GBP").toUpperCase();
    const limit = Math.max(12, Math.min(Number(req.query.limit || 1000), 1000));

    if (!country || !city) {
      return res.status(400).json({
        ok: false,
        message: "Please select a country and city."
      });
    }

    const norm = (v) => String(v || "")
      .toLowerCase()
      .replace(/&/g, " and ")
      .replace(/[^a-z0-9\s]/g, " ")
      .replace(/\s+/g, " ")
      .trim();

    const title = (v) => String(v || "")
      .trim()
      .replace(/\s+/g, " ")
      .replace(/\b\w/g, (m) => m.toUpperCase());

    const cityAliases = {
      "lon": "London",
      "ldn": "London",
      "london": "London",
      "canary wharf": "London",
      "westminster": "London",
      "paddington": "London",
      "heathrow": "London",
      "gatwick": "London",
      "dxb": "Dubai",
      "dubai": "Dubai",
      "abu dhabi": "Abu Dhabi",
      "auh": "Abu Dhabi",
      "nyc": "New York",
      "new york": "New York",
      "manhattan": "New York",
      "brooklyn": "New York",
      "lax": "Los Angeles",
      "los angeles": "Los Angeles",
      "par": "Paris",
      "paris": "Paris",
      "lagos": "Lagos",
      "abuja": "Abuja",
      "accra": "Accra",
      "nairobi": "Nairobi",
      "cape town": "Cape Town",
      "johannesburg": "Johannesburg",
      "bangkok": "Bangkok",
      "phuket": "Phuket",
      "singapore": "Singapore",
      "tokyo": "Tokyo",
      "sydney": "Sydney",
      "melbourne": "Melbourne",
      "toronto": "Toronto",
      "rome": "Rome",
      "milan": "Milan",
      "barcelona": "Barcelona",
      "madrid": "Madrid",
      "istanbul": "Istanbul",
      "doha": "Doha",
      "riyadh": "Riyadh",
      "jeddah": "Jeddah"
    };

    const requestedCityNorm = norm(city);
    const resolvedCity = cityAliases[requestedCityNorm] || title(city.split(",").pop() || city);
    const cityCandidates = Array.from(new Set([
      resolvedCity,
      city,
      city.split(",").pop(),
      requestedCityNorm
    ].map((x) => clean(x)).filter(Boolean)));

    const countryNorm = norm(country);
    const wantedCityNorms = cityCandidates.map(norm).filter(Boolean);

    function getHotelText(h) {
      return norm([
        h.name,
        h.hotel_name,
        h.hotelName,
        h.propertyName,
        h.country,
        h.city,
        h.destination,
        h.area,
        h.zone,
        h.district,
        h.address,
        h.description
      ].join(" "));
    }

    function getHotelCountry(h) {
      return clean(h.country || h.location?.country || h.countryName || h.destinationCountry || "");
    }

    function getHotelCity(h) {
      return clean(h.city || h.destination || h.location?.city || h.area || h.zone || "");
    }

    function getHotelImage(h) {
      const candidates = [
        h.image,
        h.image_url,
        h.direct_image_url,
        h.main_image,
        h.photo,
        h.thumbnail,
        ...(Array.isArray(h.images) ? h.images : []),
        ...(Array.isArray(h.photos) ? h.photos : [])
      ];

      for (const item of candidates) {
        if (!item) continue;
        if (typeof item === "string" && /^https?:\/\//i.test(item)) return item;
        if (typeof item === "object") {
          const url = item.url || item.image_url || item.imageUrl || item.src || item.path || item.large || item.original;
          if (typeof url === "string" && /^https?:\/\//i.test(url)) return url;
        }
      }
      return "";
    }

    function getHotelPrice(h) {
      const room = Array.isArray(h.rooms) && h.rooms.length ? h.rooms[0] : {};
      const rates = Array.isArray(h.rates) ? h.rates : [];
      const firstRate = rates.find((r) => number(r.nightly_rate || r.amount || r.price || r.net || r.sellingRate) > 0) || {};
      return number(
        h.price || h.convertedPrice || h.displayPrice || h.amount || h.total || h.totalPrice ||
        h.net || h.sellingRate || h.rate || h.nightly_rate ||
        room.price || room.convertedPrice || room.displayPrice || room.amount || room.total || room.net || room.sellingRate || room.rate ||
        firstRate.nightly_rate || firstRate.amount || firstRate.price || firstRate.net || firstRate.sellingRate
      );
    }

    function supplierName(h) {
      const raw = String(h.supplierLabel || h.supplier || h.source || h.provider || h.supplierCode || h.supplier_code || h.inventory_source || "Verified").toUpperCase();
      if (raw.includes("WEBBEDS")) return "Verified";
      if (raw.includes("HOTELBEDS")) return "Verified";
      if (raw.includes("RATEHAWK")) return "Verified";
      return "Verified";
    }

    function normaliseForCustomer(h, index, sourceLabel) {
      const price = getHotelPrice(h);
      const hotelCity = getHotelCity(h) || resolvedCity;
      const hotelCountry = getHotelCountry(h) || country;
      const image = getHotelImage(h);
      const name = clean(h.name || h.hotel_name || h.hotelName || h.propertyName || "");

      const room = Array.isArray(h.rooms) && h.rooms.length ? h.rooms[0] : {};
      const displayCurrency = clean(
        h.currency || h.displayCurrency || room.displayCurrency || room.currency || currency
      ).toUpperCase();

      return {
        ...h,
        id: h.id || h.hotelId || h.hotel_id || h.code || `MSH-GLOBAL-${index}`,
        hotelId: h.hotelId || h.hotel_id || h.id || h.code || `MSH-GLOBAL-${index}`,
        hotel_id: h.hotel_id || h.hotelId || h.id || h.code || `MSH-GLOBAL-${index}`,
        name,
        hotel_name: name,
        country: hotelCountry,
        city: hotelCity,
        area: clean(h.area || h.zone || h.district || ""),
        address: clean(h.address || ""),
        image,
        images: Array.from(new Set([image, ...(Array.isArray(h.images) ? h.images : [])].filter(Boolean))),
        price,
        convertedPrice: price,
        currency: displayCurrency,
        displayCurrency,
        supplierLabel: supplierName(h),
        supplierCode: supplierName(h),
        source: sourceLabel || h.source || "global_inventory",
        availableToBook: price > 0,
        rooms: Array.isArray(h.rooms) && h.rooms.length ? h.rooms : [{
          roomCode: h.roomCode || "STANDARD",
          roomName: h.roomName || "Available room",
          board: h.board || "Room only",
          price,
          convertedPrice: price,
          displayCurrency,
          cancellation: "Cancellation information is shown before you complete your booking.",
          taxes: "Applicable taxes and fees are shown before you complete your booking.",
          rate_source_id: h.rate_source_id || `MSH-${Date.now()}-${index}`,
          rate_source_timestamp: h.rate_source_timestamp || nowISO(),
          source_health: "verified"
        }]
      };
    }

    const allRows = [];
    const attempts = [];

    async function tryRoute(path, queryObj, label) {
      try {
        const url = new URL(`http://127.0.0.1${path}`);
        Object.entries(queryObj).forEach(([k, v]) => {
          if (v !== undefined && v !== null && String(v).trim()) url.searchParams.set(k, String(v));
        });

        const layer = app._router && app._router.stack
          ? app._router.stack.find((x) => x.route && x.route.path === path)
          : null;

        if (!layer || !layer.route || !layer.route.stack || !layer.route.stack[0]) {
          attempts.push({ source: label, count: 0, status: "route_not_available" });
          return;
        }

        let payload = null;
        const mockReq = { query: Object.fromEntries(url.searchParams.entries()), headers: req.headers };
        const mockRes = {
          statusCode: 200,
          status(code) { this.statusCode = code; return this; },
          json(data) { payload = data; return data; }
        };

        await layer.route.stack[0].handle(mockReq, mockRes);

        const rows = Array.isArray(payload?.hotels) ? payload.hotels
          : Array.isArray(payload?.results) ? payload.results
          : Array.isArray(payload?.data) ? payload.data
          : [];

        rows.forEach((h) => allRows.push({ ...h, _msh_source_label: label }));
        attempts.push({ source: label, count: rows.length, status: mockRes.statusCode });
      } catch (err) {
        attempts.push({ source: label, count: 0, status: "failed" });
      }
    }

    for (const candidate of cityCandidates) {
      await tryRoute("/api/multi-supplier-hotels", {
        ...req.query,
        country,
        city: candidate,
        currency,
        limit
      }, "multi_supplier");

      await tryRoute("/api/live-webbeds-hotels", {
        ...req.query,
        country,
        city: candidate,
        currency,
        limit
      }, "webbeds_live");
    }

    const localRows = readHotels()
      .filter((h) => !isBlockedCountry(h.country))
      .filter((h) => {
        const hCountry = norm(getHotelCountry(h));
        const text = getHotelText(h);

        if (hCountry && hCountry !== countryNorm) return false;
        if (!wantedCityNorms.length) return true;

        return wantedCityNorms.some((c) => {
          if (!c) return false;
          const hCity = norm(getHotelCity(h));
          return hCity === c || hCity.includes(c) || c.includes(hCity) || text.includes(c);
        });
      });

    localRows.forEach((h) => allRows.push({ ...h, _msh_source_label: "local_inventory" }));
    attempts.push({ source: "local_inventory", count: localRows.length, status: "ok" });

    if (allRows.length < 12) {
      const widerCountryRows = readHotels()
        .filter((h) => !isBlockedCountry(h.country))
        .filter((h) => norm(getHotelCountry(h)) === countryNorm)
        .slice(0, limit);

      widerCountryRows.forEach((h) => allRows.push({ ...h, _msh_source_label: "wider_country_inventory" }));
      attempts.push({ source: "wider_country_inventory", count: widerCountryRows.length, status: "ok" });
    }

    const seen = new Set();
    const hotels = allRows
      .map((h, index) => normaliseForCustomer(h, index, h._msh_source_label))
      .filter((h) => h.name && h.price > 0)
      .filter((h) => {
        const key = norm([h.hotelId, h.name, h.city, h.price].join("|"));
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      })
      .sort((a, b) => {
        const aCity = wantedCityNorms.some((c) => norm(a.city).includes(c) || getHotelText(a).includes(c)) ? 1 : 0;
        const bCity = wantedCityNorms.some((c) => norm(b.city).includes(c) || getHotelText(b).includes(c)) ? 1 : 0;
        if (bCity !== aCity) return bCity - aCity;
        return number(a.price) - number(b.price);
      })
      .slice(0, limit);

    const suppliers = {};
    hotels.forEach((h) => {
      const s = h.supplierLabel || "Verified";
      suppliers[s] = (suppliers[s] || 0) + 1;
    });

    recordActivity("customer_global_search_fixed", {
      country,
      city,
      resolvedCity,
      currency
    }, {
      count: hotels.length,
      attempts
    });

    return res.json({
      ok: true,
      source: "myspace_global_search_fixed",
      country,
      city: resolvedCity,
      requestedCity: city,
      currency,
      count: hotels.length,
      suppliers,
      attempts,
      message: hotels.length ? "Live priced hotels loaded." : "Live availability is being checked for this destination. A MySpace Hotel advisor can confirm suitable hotel options.",
      hotels,
      quoteRequired: hotels.length === 0,
      quoteDestination: {
        country,
        city: resolvedCity,
        requestedCity: city,
        currency
      }
    });
  } catch (err) {
    return res.status(500).json({
      ok: false,
      message: "Customer global hotel search failed.",
      error: err.message
    });
  }
});
/* MSH GLOBAL SEARCH FIX 2026-06-10 END */

app.get("/api/customer-global-hotels", async (req, res) => {
  try {
    const country = String(req.query.country || "United Kingdom").trim();
    const requestedCity = String(req.query.city || "London").trim();
    const currency = String(req.query.currency || "GBP").toUpperCase();
    const limit = Math.max(1, Math.min(Number(req.query.limit || 1000), 1000));

    const fixed = MSH_PARENT_CITY_FIX(country, requestedCity);
    const supplierCity = fixed.supplierCity || requestedCity;
    const area = fixed.area || "";

    const cityCandidates = Array.from(new Set([
      supplierCity,
      requestedCity,
      requestedCity.includes(",") ? requestedCity.split(",").pop().trim() : ""
    ].filter(Boolean)));

    let allDirectHotels = [];
    const supplierAttempts = [];

    for (const cityCandidate of cityCandidates) {
      try {
        const payload = await MSH_CALL_MULTI_SUPPLIER(app, {
          ...req.query,
          country,
          city: cityCandidate,
          currency,
          limit: String(limit)
        });

        const rows = Array.isArray(payload?.hotels) ? payload.hotels : [];
        allDirectHotels.push(...rows);

        supplierAttempts.push({
          city: cityCandidate,
          count: Number(payload?.count || rows.length || 0),
          suppliers: payload?.suppliers || {},
          supplierStatus: payload?.supplierStatus || {}
        });
      } catch {
        supplierAttempts.push({
          city: cityCandidate,
          count: 0,
          error: "supplier_search_failed"
        });
      }
    }

    let localHotels = [];
    for (const cityCandidate of cityCandidates) {
      localHotels.push(...MSH_SAFE_LOCAL_LIVE_SEARCH(country, cityCandidate, area, currency, limit));
    }

    const rawHotels = [...allDirectHotels, ...localHotels];

    const hotels = MSH_CLEAN_CUSTOMER_HOTELS(rawHotels, {
      country,
      city: supplierCity,
      area,
      currency
    }).slice(0, limit);

    const suppliers = hotels.reduce((acc, hotel) => {
      const internalSupplier = hotel.supplierLabel || hotel.supplierCode || hotel._supplier_name || "Inventory";
      acc[internalSupplier] = (acc[internalSupplier] || 0) + 1;
      return acc;
    }, {});

    const customerHotels = hotels.map((hotel) => {
      const cleanHotel = { ...hotel };
      cleanHotel.customerBadge = "Verified live rate";

      cleanHotel.internalSupplierSettlement = {
        supplierLabel: cleanHotel.supplierLabel || cleanHotel.supplierCode || cleanHotel._supplier_name || "",
        supplierCode: cleanHotel.supplierCode || cleanHotel._supplier_code || "",
        rateSourceId: cleanHotel.rate_source_id || cleanHotel.rooms?.[0]?.rate_source_id || "",
        rateSourceTimestamp: cleanHotel.rate_source_timestamp || cleanHotel.rooms?.[0]?.rate_source_timestamp || ""
      };

      delete cleanHotel.supplierName;
      delete cleanHotel.supplierDisplay;

      return cleanHotel;
    });

    return res.json({
      ok: true,
      source: "customer_global_live_plus_local_inventory",
      searched: {
        country,
        requestedCity,
        supplierCity,
        area,
        cityCandidates
      },
      customerMessage: `${customerHotels.length} verified live-rate hotels loaded.`,
      internalSupplierSettlement: suppliers,
      supplierAttempts,
      suppliers,
      totalBeforeCustomerClean: rawHotels.length,
      liveSupplierHotels: allDirectHotels.length,
      fallbackInventoryHotels: localHotels.length,
      count: customerHotels.length,
      hotels: customerhotels,
      quoteRequired: hotels.length === 0,
      quoteDestination: {
        country,
        city: resolvedCity,
        requestedCity: city,
        currency
      }
    });
  } catch (err) {
    return res.status(500).json({
      ok: false,
      message: "Customer global hotel search failed."
    });
  }
});
app.get("/api/internal/location-coverage", (req, res) => {
  try {
    const hotels = MSH_LIVE_HOTELS();
    const byCountry = new Map();

    for (const hotel of hotels) {
      const country = MSH_FIELD(hotel, ["country", "location.country"]) || "Unknown";
      const city = MSH_FIELD(hotel, ["city", "destination", "location.city", "area"]) || "Unknown";
      const area = MSH_FIELD(hotel, ["area", "zone", "district", "address"]) || "";
      const supplier = MSH_SUPPLIER(hotel);

      const cKey = country;
      if (!byCountry.has(cKey)) {
        byCountry.set(cKey, { country, hotels: 0, cities: new Map(), suppliers: {} });
      }

      const row = byCountry.get(cKey);
      row.hotels += 1;
      row.suppliers[supplier] = (row.suppliers[supplier] || 0) + 1;

      const cityKey = city;
      if (!row.cities.has(cityKey)) {
        row.cities.set(cityKey, { city, hotels: 0, areas: new Set(), suppliers: {} });
      }

      const cityRow = row.cities.get(cityKey);
      cityRow.hotels += 1;
      cityRow.suppliers[supplier] = (cityRow.suppliers[supplier] || 0) + 1;
      if (area) cityRow.areas.add(area);
    }

    const countries = Array.from(byCountry.values())
      .map((countryRow) => ({
        country: countryRow.country,
        hotels: countryRow.hotels,
        cityCount: countryRow.cities.size,
        suppliers: countryRow.suppliers,
        topCities: Array.from(countryRow.cities.values())
          .sort((a, b) => b.hotels - a.hotels)
          .slice(0, 25)
          .map((cityRow) => ({
            city: cityRow.city,
            hotels: cityRow.hotels,
            localAreaCount: cityRow.areas.size,
            sampleAreas: Array.from(cityRow.areas).slice(0, 10),
            suppliers: cityRow.suppliers
          }))
      }))
      .sort((a, b) => b.hotels - a.hotels);

    res.json({
      ok: true,
      source: "live_hotels_inventory",
      totalHotels: hotels.length,
      countryCount: countries.length,
      cityCount: countries.reduce((sum, c) => sum + c.cityCount, 0),
      countries
    });
  } catch {
    res.status(500).json({ ok: false, message: "Coverage report failed." });
  }
});

function MSH_SUGGEST_NORM(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function MSH_SUGGEST_SCORE(input, target) {
  const a = MSH_SUGGEST_NORM(input);
  const b = MSH_SUGGEST_NORM(target);
  if (!a || !b) return 0;
  if (a === b) return 1000;
  if (b.startsWith(a)) return 850;
  if (b.includes(a)) return 700;
  if (a.includes(b)) return 650;

  const aw = a.split(" ").filter(Boolean);
  const bw = b.split(" ").filter(Boolean);
  let score = 0;
  for (const word of aw) {
    if (bw.includes(word)) score += 120;
    else if (b.includes(word)) score += 70;
  }
  return score;
}

function MSH_SUPPLIER_LOCATION_INDEX() {
  const rows = [];

  try {
    const destinations = buildDestinations();
    for (const countryRow of destinations || []) {
      for (const city of countryRow.cities || []) {
        rows.push({
          country: countryRow.country,
          city,
          area: "",
          supplierCity: city,
          label: `${city}, ${countryRow.country}`,
          source: "MySpace destination index"
        });
      }
    }
  } catch {}

  try {
    for (const h of readHotels()) {
      const country = clean(h.country || h.location?.country || "");
      const city = clean(h.city || h.destination || h.location?.city || "");
      const area = clean(h.area || h.zone || h.district || "");
      if (!country || !city) continue;

      rows.push({
        country,
        city,
        area,
        supplierCity: city,
        label: area ? `${area}, ${city}, ${country}` : `${city}, ${country}`,
        source: "live inventory"
      });
    }
  } catch {}

  const manualAreas = [
    ["United Kingdom", "London", "Central London"],
    ["United Kingdom", "London", "Canary Wharf"],
    ["United Kingdom", "London", "Westminster"],
    ["United Kingdom", "London", "Paddington"],
    ["United Kingdom", "London", "Kensington"],
    ["United Kingdom", "London", "Chelsea"],
    ["United Kingdom", "London", "Mayfair"],
    ["United Kingdom", "London", "Soho"],
    ["United Kingdom", "London", "Shoreditch"],
    ["United Kingdom", "London", "Docklands"],
    ["United Kingdom", "London", "Heathrow"],
    ["United Arab Emirates", "Abu Dhabi", "Yas Island"],
    ["United Arab Emirates", "Abu Dhabi", "Saadiyat Island"],
    ["United Arab Emirates", "Abu Dhabi", "Corniche"],
    ["United Arab Emirates", "Dubai", "Dubai Marina"],
    ["United Arab Emirates", "Dubai", "JBR"],
    ["United Arab Emirates", "Dubai", "Palm Jumeirah"],
    ["United Arab Emirates", "Dubai", "Downtown Dubai"],
    ["Nigeria", "Lagos", "Victoria Island"],
    ["Nigeria", "Lagos", "Ikoyi"],
    ["Nigeria", "Lagos", "Lekki"],
    ["Nigeria", "Abuja", "Wuse"],
    ["Nigeria", "Abuja", "Maitama"],
    ["Nigeria", "Abuja", "Asokoro"],
    ["United States", "New York", "Manhattan"],
    ["United States", "New York", "Brooklyn"],
    ["United States", "New York", "Queens"],
    ["United States", "Los Angeles", "Hollywood"],
    ["United States", "Los Angeles", "Beverly Hills"],
    ["United States", "Miami", "South Beach"],
    ["France", "Paris", "Central Paris"],
    ["Turkey", "Istanbul", "Taksim"],
    ["Turkey", "Istanbul", "Sultanahmet"],
    ["Bahrain", "Manama", "Al Juffair"],
    ["Bahrain", "Manama", "Juffair"]
  ];

  for (const [country, city, area] of manualAreas) {
    rows.push({
      country,
      city,
      area,
      supplierCity: city,
      label: `${area}, ${city}, ${country}`,
      source: "area alias"
    });
  }

  const seen = new Set();
  return rows.filter((row) => {
    const key = MSH_SUGGEST_NORM(`${row.country}|${row.city}|${row.area}|${row.supplierCity}`);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

app.get("/api/location-suggestions", (req, res) => {
  try {
    const country = clean(req.query.country || "");
    const q = clean(req.query.q || req.query.city || "");
    const limit = Math.max(1, Math.min(Number(req.query.limit || 12), 25));

    if (!q || q.length < 2) {
      return res.json({ ok: true, count: 0, suggestions: [] });
    }

    const countryNorm = MSH_SUGGEST_NORM(country);
    const index = MSH_SUPPLIER_LOCATION_INDEX();

    const suggestions = index
      .filter((row) => !countryNorm || MSH_SUGGEST_NORM(row.country) === countryNorm)
      .map((row) => {
        const score = Math.max(
          MSH_SUGGEST_SCORE(q, row.label),
          MSH_SUGGEST_SCORE(q, row.city),
          MSH_SUGGEST_SCORE(q, row.area),
          MSH_SUGGEST_SCORE(q, row.supplierCity)
        );

        return {
          ...row,
          score,
          customerText: row.area ? `${row.area}, ${row.city}` : row.city,
          supplierSearchCity: row.supplierCity || row.city,
          display: row.area ? `${row.area}, ${row.city}, ${row.country}` : `${row.city}, ${row.country}`
        };
      })
      .filter((row) => row.score > 0)
      .sort((a, b) => b.score - a.score || a.display.localeCompare(b.display))
      .slice(0, limit)
      .map(({ score, ...row }) => row);

    res.json({
      ok: true,
      query: q,
      country,
      count: suggestions.length,
      suggestions
    });
  } catch {
    res.status(500).json({ ok: false, message: "Location suggestions failed." });
  }
});


app.get("/api/adaptive-multi-supplier-hotels", async (req, res) => {
  req.url = "/api/multi-supplier-hotels" + (req.url.includes("?") ? req.url.slice(req.url.indexOf("?")) : "");
  app._router.handle(req, res);
});


// MYSPACE INTELLIGENT LIVE HOTEL ROUTE START
function mshNormDestinationText(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function mshLooksLikeSupplierPlaceholderName(name) {
  const n = mshNormDestinationText(name);
  if (!n) return true;
  if (/^webbeds property [0-9]+$/.test(n)) return true;
  if (/^hotelbeds property [0-9]+$/.test(n)) return true;
  if (/^ratehawk property [0-9]+$/.test(n)) return true;
  if (/^property [0-9]+$/.test(n)) return true;
  if (/^hotel [0-9]+$/.test(n)) return true;
  return false;
}

function mshCountryAliases(value) {
  const n = mshNormDestinationText(value);
  if (n === "united kingdom") return ["united kingdom", "uk", "great britain", "england"];
  if (n === "united states") return ["united states", "usa", "us", "united states of america"];
  if (n === "united arab emirates") return ["united arab emirates", "uae", "emirates"];
  return [n];
}

function mshSameCountry(a, b) {
  const aa = mshCountryAliases(a);
  const bb = mshCountryAliases(b);
  return aa.some((x) => bb.includes(x));
}

function mshSameCity(a, b) {
  const x = mshNormDestinationText(a);
  const y = mshNormDestinationText(b);
  if (!x || !y) return false;
  return x === y || x.includes(y) || y.includes(x);
}

function mshSafeCustomerHotel(hotel, requestedCountry, requestedCity, requestedCurrency) {
  if (!hotel || typeof hotel !== "object") return null;

  const name = String(hotel.name || hotel.hotel_name || "").trim();
  if (mshLooksLikeSupplierPlaceholderName(name)) return null;

  const price = Number(
    hotel.price ||
    hotel.convertedPrice ||
    hotel.displayPrice ||
    hotel.amount ||
    hotel.rooms?.[0]?.convertedPrice ||
    hotel.rooms?.[0]?.price ||
    0
  );

  if (!Number.isFinite(price) || price <= 0) return null;

  const hotelCountry = hotel.country || hotel.location?.country || requestedCountry;
  const hotelCity = hotel.city || hotel.destination || hotel.location?.city || requestedCity;

  if (!mshSameCountry(hotelCountry, requestedCountry)) return null;
  if (!mshSameCity(hotelCity, requestedCity)) return null;

  const currency = String(hotel.displayCurrency || hotel.currency || requestedCurrency || "GBP").toUpperCase();

  return {
    ...hotel,
    name,
    hotel_name: name,
    country: requestedCountry,
    city: requestedCity,
    destination: requestedCity,
    price,
    convertedPrice: price,
    displayPrice: price,
    currency,
    displayCurrency: currency,
    availableToBook: true,
    verified_live_rate: true
  };
}

const MSH_NEARBY_DESTINATION_FALLBACKS = {
  "austria|graz": ["Vienna", "Salzburg", "Innsbruck"],
  "brazil|andradas": ["Sao Paulo", "Rio de Janeiro"],
  "brazil|abraao": ["Rio de Janeiro", "Sao Paulo"],
  "argentina|buenos aires": ["Buenos Aires"],
  "tanzania|arusha": ["Arusha", "Zanzibar"],
  "tanzania|zanzibar": ["Zanzibar", "Arusha"]
};

async function mshFetchExistingLiveRoute(req, country, city, currency, guests, rooms) {
  const base = `${req.protocol}://${req.get("host")}`;
  const params = new URLSearchParams({
    country,
    city,
    currency,
    guests: String(guests || 2),
    rooms: String(rooms || 1)
  });

  const url = `${base}/api/multi-supplier-hotels?${params.toString()}`;
  const response = await fetch(url, { method: "GET" });
  return await response.json();
}

app.get("/api/intelligent-hotels", async (req, res) => {
  const requestedCountry = String(req.query.country || "").trim();
  const requestedCity = String(req.query.city || "").trim();
  const currency = String(req.query.currency || "GBP").trim().toUpperCase();
  const guests = Math.max(1, Number(req.query.guests || 2));
  const rooms = Math.max(1, Number(req.query.rooms || 1));

  if (!requestedCountry || !requestedCity) {
    return res.json({
      ok: false,
      count: 0,
      hotels: [],
      message: "Please choose a valid country and city before searching."
    });
  }

  try {
    const primary = await mshFetchExistingLiveRoute(req, requestedCountry, requestedCity, currency, guests, rooms);
    let hotels = Array.isArray(primary.hotels) ? primary.hotels : [];

    hotels = hotels
      .map((hotel) => mshSafeCustomerHotel(hotel, requestedCountry, requestedCity, currency))
      .filter(Boolean);

    if (hotels.length) {
      return res.json({
        ok: true,
        count: hotels.length,
        hotels,
        suppliers: primary.suppliers || {},
        message: "Verified live hotel rates returned."
      });
    }

    const key = `${mshNormDestinationText(requestedCountry)}|${mshNormDestinationText(requestedCity)}`;
    const fallbackCities = MSH_NEARBY_DESTINATION_FALLBACKS[key] || [];

    const fallbackResults = [];

    for (const fallbackCity of fallbackCities) {
      if (mshNormDestinationText(fallbackCity) === mshNormDestinationText(requestedCity)) continue;

      try {
        const fallback = await mshFetchExistingLiveRoute(req, requestedCountry, fallbackCity, currency, guests, rooms);
        const safeFallbackHotels = (Array.isArray(fallback.hotels) ? fallback.hotels : [])
          .map((hotel) => mshSafeCustomerHotel(hotel, requestedCountry, fallbackCity, currency))
          .filter(Boolean)
          .slice(0, 12);

        fallbackResults.push(...safeFallbackHotels);
      } catch {}
    }

    if (fallbackResults.length) {
      return res.json({
        ok: true,
        count: fallbackResults.length,
        hotels: fallbackResults,
        fallback: true,
        requestedDestination: { country: requestedCountry, city: requestedCity },
        shownDestination: { country: requestedCountry, city: fallbackResults[0].city },
        message: `No verified live rates were available for ${requestedCity}, ${requestedCountry}. Showing nearby verified live hotels instead.`
      });
    }

    return res.json({
      ok: true,
      count: 0,
      hotels: [],
      message: `No verified live hotel rates were returned for ${requestedCity}, ${requestedCountry}. Try a nearby major city.`
    });
  } catch (error) {
    return res.json({
      ok: false,
      count: 0,
      hotels: [],
      message: "Intelligent live hotel search failed.",
      error: error.message
    });
  }
});
// MYSPACE INTELLIGENT LIVE HOTEL ROUTE END

app.listen(PORT, "0.0.0.0", () => {
  const destinations = buildDestinations();

  console.log("====================================");
  console.log("MYSPACE HOTEL SERVICE READY");
  console.log("PORT:", PORT);
  console.log("HOTELS:", readHotels().length);
  console.log("COUNTRIES:", destinations.length);
  console.log("CITIES:", destinations.reduce((sum, x) => sum + x.cities.length, 0));
  console.log("SUPPLIER TRACKING: READY");
  console.log("SUPPLIER AUDIT FILE:", SUPPLIER_AUDIT_FILE);
  console.log("STRIPE:", process.env.STRIPE_SECRET_KEY || process.env.STRIPE_PAYMENT_LINK ? "READY" : "NOT CONFIGURED");
  console.log("MAIL:", process.env.RESEND_API_KEY || (process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS) ? "READY" : "NOT CONFIGURED");
  console.log("MAIL TO:", mailTo());
  console.log("BOOKING SERVICE: READY");
  console.log("PARTNERSHIP ENQUIRIES: READY");
  console.log("CUSTOMER SUPPORT: READY");
  console.log("====================================");
});































































































