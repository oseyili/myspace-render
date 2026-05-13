const fs = require("fs");
const path = require("path");
const zlib = require("zlib");

const ROOT = __dirname;
const DATA = path.join(ROOT, "data");

const FILES = {
  packedRates: path.join(DATA, "live_rate_cache.json"),
  supplierFeed: path.join(DATA, "hotel_supplier_feed.json"),
  imageA: path.join(DATA, "hotel_images_live_backup.json"),
  imageB: path.join(DATA, "hotel_image_backup_200k.json"),
  destinationMaster: path.join(DATA, "destination_master.json.gz"),
  hotelRegistry: path.join(DATA, "master_hotel_registry.json.gz"),
  realRates: path.join(DATA, "REAL_ONLY_live_rates.json.gz"),
  audit: path.join(DATA, "REAL_ONLY_live_rates_audit.json")
};

function readJson(file, fallback = []) {
  try {
    if (!fs.existsSync(file)) return fallback;
    return JSON.parse(fs.readFileSync(file, "utf8"));
  } catch {
    return fallback;
  }
}

function writeGzipJson(file, obj) {
  fs.writeFileSync(file, zlib.gzipSync(JSON.stringify(obj), { level: 9 }));
}

function s(v) {
  return String(v || "").trim();
}

function norm(v) {
  return s(v).toLowerCase().normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\bhotel\b|\bhotels\b|\bthe\b|\bapartment\b|\bapartments\b|\bsuite\b|\bsuites\b|\binn\b|\bresort\b/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function cleanId(v) {
  return s(v).replace(/^catalog-/i, "");
}

function goodImage(v) {
  const x = s(v);
  return /^https?:\/\//i.test(x) && !/placeholder|fake|dummy|sample|example/i.test(x);
}

function validGeo(country, city) {
  const c = s(country).toLowerCase();
  const y = s(city).toLowerCase();
  return c && y && c !== "unknown" && y !== "unknown" && c !== "null" && y !== "null";
}

function positive(v) {
  const n = Number(v);
  return Number.isFinite(n) && n > 0;
}

function liveRateOk(r) {
  return Boolean(r && r.live_rate_ready === true && s(r.rate_key) && positive(r.selling_rate || r.customer_total || r.amount || r.net));
}

function canonicalHotelId(id, name, city, country) {
  return "MSH-" + Buffer.from(`${cleanId(id)}|${norm(name)}|${norm(city)}|${norm(country)}`)
    .toString("base64")
    .replace(/[^a-zA-Z0-9]/g, "")
    .slice(0, 18);
}

function destinationKey(code) {
  return s(code).toUpperCase();
}

function nameDestKey(name, dest) {
  return `${norm(name)}|${destinationKey(dest)}`;
}

function rateHotelId(r) {
  return cleanId(r.hotel_code || r.hotel_id || r.hotelCode || r.code || r.supplier_hotel_id);
}

function main() {
  fs.mkdirSync(DATA, { recursive: true });

  const packed = readJson(FILES.packedRates, []);
  const liveRates = Array.isArray(packed && packed[4]) ? packed[4] : [];
  const supplierFeed = readJson(FILES.supplierFeed, []);
  const imageA = readJson(FILES.imageA, []);
  const imageB = readJson(FILES.imageB, []);

  const destinationMaster = {};
  const registry = [];
  const realOnlyRates = [];

  const registryById = new Map();
  const registryByName = new Map();
  const registryByNameDest = new Map();

  for (const h of supplierFeed) {
    const supplierId = cleanId(h.supplier_hotel_id || h.hotel_id || h.hotel_code);
    const hotelName = s(h.name || h.hotel_name);
    const country = s(h.country);
    const city = s(h.city);
    const image = s(h.image || h.image_url || h.direct_image_url);

    if (!supplierId || !hotelName || !goodImage(image) || !validGeo(country, city)) continue;

    const row = {
      canonical_hotel_id: canonicalHotelId(supplierId, hotelName, city, country),
      supplier: "hotelbeds",
      supplier_hotel_id: supplierId,
      hotel_name: hotelName,
      normalized_name: norm(hotelName),
      country,
      city,
      image_url: image,
      direct_image_url: image,
      address: s(h.address),
      latitude: null,
      longitude: null
    };

    registry.push(row);
    registryById.set(supplierId, row);
    if (!registryByName.has(norm(hotelName))) registryByName.set(norm(hotelName), row);
  }

  for (const h of [...imageA, ...imageB]) {
    const code = destinationKey(h.destination_code);
    const hotelName = s(h.hotel_name || h.name);
    if (!code || !hotelName) continue;

    const registryMatch = registryByName.get(norm(hotelName));
    if (!registryMatch) continue;

    if (!destinationMaster[code]) {
      destinationMaster[code] = { country: registryMatch.country, city: registryMatch.city };
    }

    registryByNameDest.set(nameDestKey(hotelName, code), registryMatch);
  }

  const seen = new Set();

  const stats = {
    source_live_rate_rows: liveRates.length,
    kept_real_rows: 0,
    rejected_no_geo: 0,
    rejected_not_live: 0,
    rejected_no_image: 0,
    matched_by_id: 0,
    matched_by_name_dest: 0,
    matched_by_name: 0
  };

  for (const r of liveRates) {
    if (!liveRateOk(r)) {
      stats.rejected_not_live++;
      continue;
    }

    const supplierHotelId = rateHotelId(r);
    const hotelName = s(r.hotel_name);
    const destinationCode = destinationKey(r.destination_code);

    let registryRow = null;
    let method = "";

    if (supplierHotelId && registryById.has(supplierHotelId)) {
      registryRow = registryById.get(supplierHotelId);
      method = "id";
    }

    if (!registryRow && hotelName && destinationCode && registryByNameDest.has(nameDestKey(hotelName, destinationCode))) {
      registryRow = registryByNameDest.get(nameDestKey(hotelName, destinationCode));
      method = "name_destination";
    }

    if (!registryRow && hotelName && registryByName.has(norm(hotelName))) {
      registryRow = registryByName.get(norm(hotelName));
      method = "name";
    }

    if (!registryRow) {
      stats.rejected_no_geo++;
      continue;
    }

    if (!goodImage(registryRow.image_url)) {
      stats.rejected_no_image++;
      continue;
    }

    const country = registryRow.country;
    const city = registryRow.city;

    if (!validGeo(country, city)) {
      stats.rejected_no_geo++;
      continue;
    }

    const sellingRate = Number(r.selling_rate || r.customer_total || r.amount || r.net);
    const supplierRate = Number(r.net || r.supplier_total || r.supplier_amount || sellingRate);

    const dedupeKey = [registryRow.canonical_hotel_id, r.rate_key, r.checkin, r.checkout, r.rooms, r.guests].join("|");
    if (seen.has(dedupeKey)) continue;
    seen.add(dedupeKey);

    if (method === "id") stats.matched_by_id++;
    if (method === "name_destination") stats.matched_by_name_dest++;
    if (method === "name") stats.matched_by_name++;

    realOnlyRates.push({
      canonical_hotel_id: registryRow.canonical_hotel_id,
      supplier: "hotelbeds",
      supplier_hotel_id: registryRow.supplier_hotel_id,
      hotel_name: registryRow.hotel_name,
      normalized_name: registryRow.normalized_name,
      country,
      city,
      destination_code: destinationCode,
      image_url: registryRow.image_url,
      direct_image_url: registryRow.direct_image_url,
      address: registryRow.address,
      latitude: registryRow.latitude,
      longitude: registryRow.longitude,
      live_rate_ready: true,
      real_image_verified: true,
      real_live_rate_verified: true,
      rate_key: s(r.rate_key),
      rate_type: s(r.rate_type),
      rate_class: s(r.rate_class),
      room_code: s(r.room_code),
      room_name: s(r.room_name || "Room"),
      board_code: s(r.board_code),
      board_name: s(r.board_name || "Room Only"),
      payment_type: s(r.payment_type),
      selling_rate: sellingRate,
      customer_total: sellingRate,
      amount: sellingRate,
      supplier_total: supplierRate,
      net: supplierRate,
      currency: s(r.currency || "EUR"),
      cancellation_policies: r.cancellation_policies || [],
      checkin: s(r.checkin),
      checkout: s(r.checkout),
      guests: Number(r.guests || 1),
      rooms: Number(r.rooms || 1),
      created_at: s(r.created_at) || new Date().toISOString()
    });
  }

  stats.kept_real_rows = realOnlyRates.length;

  const countryMap = {};
  for (const r of realOnlyRates) {
    if (!countryMap[r.country]) countryMap[r.country] = {};
    if (!countryMap[r.country][r.city]) countryMap[r.country][r.city] = 0;
    countryMap[r.country][r.city]++;
  }

  const countrySummary = Object.entries(countryMap).map(([country, cities]) => {
    const cityRows = Object.entries(cities)
      .map(([city, live_rates]) => ({ city, live_rates }))
      .sort((a, b) => b.live_rates - a.live_rates);

    return {
      country,
      cities: cityRows.length,
      live_rates: cityRows.reduce((a, x) => a + x.live_rates, 0),
      top_cities: cityRows.slice(0, 25)
    };
  }).sort((a, b) => b.live_rates - a.live_rates);

  const audit = {
    generated_at: new Date().toISOString(),
    architecture: "MySpace Hotel normalized real-only live-rate engine",
    suppliers: ["Hotelbeds"],
    future_suppliers: ["Expedia", "Agoda", "Amadeus"],
    stats,
    countries: countrySummary.length,
    cities: countrySummary.reduce((a, x) => a + x.cities, 0),
    top_countries: countrySummary
  };

  writeGzipJson(FILES.destinationMaster, destinationMaster);
  writeGzipJson(FILES.hotelRegistry, registry);
  writeGzipJson(FILES.realRates, realOnlyRates);
  fs.writeFileSync(FILES.audit, JSON.stringify(audit, null, 2));

  console.log("");
  console.log("NORMALIZATION COMPLETE");
  console.log("Canonical hotels:", registry.length.toLocaleString());
  console.log("Destination codes:", Object.keys(destinationMaster).length.toLocaleString());
  console.log("Real live-rate rows:", realOnlyRates.length.toLocaleString());
  console.log("Countries:", audit.countries.toLocaleString());
  console.log("Cities:", audit.cities.toLocaleString());
  console.log("");
  console.log("TOP COUNTRIES");
  for (const [i, x] of countrySummary.slice(0, 30).entries()) {
    console.log(String(i + 1).padStart(2, "0"), "|", x.country.padEnd(28, " "), "| cities:", String(x.cities).padStart(5, " "), "| live rates:", x.live_rates.toLocaleString());
  }
}

main();
