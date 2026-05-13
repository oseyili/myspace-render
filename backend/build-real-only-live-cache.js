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
  outJson: path.join(DATA, "REAL_ONLY_live_rates_with_geo_images.json"),
  outGz: path.join(DATA, "REAL_ONLY_live_rates_with_geo_images.json.gz"),
  audit: path.join(DATA, "REAL_ONLY_live_rates_audit.json"),
  supplierConfig: path.join(ROOT, "supplier-config.js")
};

function readJson(file, fallback) {
  try {
    if (!fs.existsSync(file)) return fallback;
    return JSON.parse(fs.readFileSync(file, "utf8"));
  } catch {
    return fallback;
  }
}

function text(v) {
  return String(v || "").trim();
}

function norm(v) {
  return text(v)
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\bthe\b|\bhotel\b|\bhotels\b|\bapartment\b|\bapartments\b|\bsuite\b|\bsuites\b|\binn\b|\bresort\b|\bguesthouse\b|\bguest house\b/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function cleanId(v) {
  return text(v).replace(/^catalog-/i, "");
}

function goodImage(v) {
  const x = text(v);
  return /^https?:\/\//i.test(x) && !/placeholder|fake|example|dummy|sample/i.test(x);
}

function positiveMoney(v) {
  const n = Number(v);
  return Number.isFinite(n) && n > 0;
}

function liveRateOk(r) {
  return Boolean(
    r &&
    r.live_rate_ready === true &&
    text(r.rate_key) &&
    positiveMoney(r.selling_rate || r.customer_total || r.amount || r.net)
  );
}

function rateHotelId(r) {
  return cleanId(r.hotel_code || r.hotel_id || r.hotelCode || r.code || r.supplier_hotel_id);
}

function nameDestKey(name, dest) {
  return `${norm(name)}|${text(dest).toUpperCase()}`;
}

function validGeo(country, city) {
  const c = text(country).toLowerCase();
  const y = text(city).toLowerCase();
  return c && y && c !== "unknown" && y !== "unknown" && c !== "null" && y !== "null";
}

function writeSupplierConfig() {
  const body = `module.exports = {
  suppliers: [
    {
      id: "hotelbeds",
      name: "Hotelbeds",
      enabled: true,
      type: "live",
      priority: 1,
      realOnly: true,
      requireLiveRateKey: true,
      requireRealImage: true,
      env: {
        apiKey: "HOTELBEDS_API_KEY",
        secret: "HOTELBEDS_SECRET",
        baseUrl: "HOTELBEDS_BASE_URL"
      }
    }
  ],

  rules: {
    noPlaceholders: true,
    noFakeRates: true,
    noFakeImages: true,
    noInactiveSupplierPlaceholders: true,
    onlyShowRealLivePayableRates: true,
    requireFreshDestinationRateOnCustomerSearch: true,
    requireRateKeyBeforePayment: true,
    requirePositivePayableAmount: true,
    requireSupplierConfirmationBeforePaidStatus: true
  }
};
`;
  fs.writeFileSync(FILES.supplierConfig, body, "utf8");
}

function main() {
  fs.mkdirSync(DATA, { recursive: true });

  writeSupplierConfig();

  const packed = readJson(FILES.packedRates, []);
  const rates = Array.isArray(packed?.[4]) ? packed[4] : [];

  const supplierFeed = readJson(FILES.supplierFeed, []);
  const imageA = readJson(FILES.imageA, []);
  const imageB = readJson(FILES.imageB, []);

  const byId = new Map();
  const byName = new Map();
  const byNameDest = new Map();

  for (const h of supplierFeed) {
    const id = cleanId(h.supplier_hotel_id || h.hotel_code || h.hotel_id);
    const hotelName = text(h.name || h.hotel_name);
    const country = text(h.country);
    const city = text(h.city);
    const image = text(h.image || h.image_url || h.direct_image_url);

    if (!hotelName || !validGeo(country, city) || !goodImage(image)) continue;

    const row = {
      hotel_id: id,
      hotel_name: hotelName,
      country,
      city,
      address: text(h.address),
      image_url: image,
      direct_image_url: image,
      geo_source: "supplier_feed"
    };

    if (id) byId.set(id, row);
    if (norm(hotelName) && !byName.has(norm(hotelName))) byName.set(norm(hotelName), row);
  }

  for (const h of [...imageA, ...imageB]) {
    const id = cleanId(h.hotel_code || h.supplier_hotel_id || h.hotel_id);
    const hotelName = text(h.hotel_name || h.name);
    const image = text(h.image_url || h.image || h.direct_image_url);
    const dest = text(h.destination_code).toUpperCase();

    if (!hotelName || !goodImage(image)) continue;

    const row = {
      hotel_id: id,
      hotel_name: hotelName,
      country: "",
      city: "",
      address: "",
      image_url: image,
      direct_image_url: image,
      destination_code: dest,
      geo_source: "image_backup"
    };

    if (id && !byId.has(id)) byId.set(id, row);
    if (hotelName && dest && !byNameDest.has(nameDestKey(hotelName, dest))) {
      byNameDest.set(nameDestKey(hotelName, dest), row);
    }
  }

  const realOnly = [];
  const seen = new Set();

  const stats = {
    total_rate_rows: rates.length,
    rejected_not_live_payable: 0,
    rejected_no_real_image_or_geo: 0,
    matched_by_id: 0,
    matched_by_name_destination: 0,
    matched_by_name: 0,
    kept_real_only_rows: 0
  };

  for (const r of rates) {
    if (!liveRateOk(r)) {
      stats.rejected_not_live_payable++;
      continue;
    }

    const id = rateHotelId(r);
    const hotelName = text(r.hotel_name);
    const dest = text(r.destination_code).toUpperCase();

    let h = null;
    let method = "";

    if (id && byId.has(id)) {
      h = byId.get(id);
      method = "id";
    }

    if (!h && hotelName && dest && byNameDest.has(nameDestKey(hotelName, dest))) {
      h = byNameDest.get(nameDestKey(hotelName, dest));
      method = "name_destination";
    }

    if (!h && hotelName && byName.has(norm(hotelName))) {
      h = byName.get(norm(hotelName));
      method = "name";
    }

    if (!h || !goodImage(h.image_url)) {
      stats.rejected_no_real_image_or_geo++;
      continue;
    }

    let country = text(h.country || r.country || r.destination_country);
    let city = text(h.city || r.city || r.destination_city);

    if (!validGeo(country, city)) {
      stats.rejected_no_real_image_or_geo++;
      continue;
    }

    const price = Number(r.selling_rate || r.customer_total || r.amount || r.net);
    const supplierPrice = Number(r.net || r.supplier_total || r.supplier_amount || price);

    const dedupeKey = [
      id || h.hotel_id || hotelName,
      r.rate_key,
      r.checkin,
      r.checkout,
      r.guests,
      r.rooms
    ].join("|");

    if (seen.has(dedupeKey)) continue;
    seen.add(dedupeKey);

    if (method === "id") stats.matched_by_id++;
    if (method === "name_destination") stats.matched_by_name_destination++;
    if (method === "name") stats.matched_by_name++;

    realOnly.push({
      hotel_id: id || h.hotel_id,
      hotel_code: id || h.hotel_id,
      hotel_name: hotelName || h.hotel_name,
      country,
      city,
      destination_country: country,
      destination_city: city,
      destination_code: dest,
      address: h.address || "",
      image_url: h.image_url,
      direct_image_url: h.image_url,

      live_rate_ready: true,
      real_image_verified: true,
      real_live_rate_verified: true,
      no_placeholder: true,

      rate_key: text(r.rate_key),
      rate_type: text(r.rate_type),
      rate_class: text(r.rate_class),
      payment_type: text(r.payment_type),
      room_code: text(r.room_code),
      room_name: text(r.room_name || "Selected room"),
      board_code: text(r.board_code),
      board_name: text(r.board_name || "Room only"),

      net: supplierPrice,
      supplier_total: supplierPrice,
      selling_rate: price,
      customer_total: price,
      amount: price,
      currency: text(r.currency || "EUR"),

      cancellation_policies: r.cancellation_policies || [],
      checkin: text(r.checkin),
      checkout: text(r.checkout),
      guests: Number(r.guests || 1),
      rooms: Number(r.rooms || 1),

      source_supplier: "hotelbeds",
      geo_join_method: method,
      created_at: text(r.created_at || new Date().toISOString())
    });
  }

  stats.kept_real_only_rows = realOnly.length;

  const countries = {};
  for (const r of realOnly) {
    if (!countries[r.country]) countries[r.country] = {};
    if (!countries[r.country][r.city]) countries[r.country][r.city] = 0;
    countries[r.country][r.city]++;
  }

  const summary = Object.entries(countries).map(([country, cities]) => {
    const cityRows = Object.entries(cities).map(([city, live_rates]) => ({ city, live_rates }));
    cityRows.sort((a, b) => b.live_rates - a.live_rates);
    return {
      country,
      cities: cityRows.length,
      live_rates: cityRows.reduce((a, x) => a + x.live_rates, 0),
      top_cities: cityRows.slice(0, 25)
    };
  }).sort((a, b) => b.live_rates - a.live_rates);

  const audit = {
    generated_at: new Date().toISOString(),
    rule: "REAL ONLY: no fake rates, no fake images, no placeholder suppliers, no customer-facing unavailable fake prices.",
    stats,
    countries: summary.length,
    cities: summary.reduce((a, x) => a + x.cities, 0),
    top_countries: summary
  };

  fs.writeFileSync(FILES.outJson, JSON.stringify(realOnly));
  fs.writeFileSync(FILES.outGz, zlib.gzipSync(JSON.stringify(realOnly), { level: 9 }));
  fs.writeFileSync(FILES.audit, JSON.stringify(audit, null, 2));

  const gzMb = fs.statSync(FILES.outGz).size / 1024 / 1024;

  console.log("");
  console.log("MYSPACE HOTEL REAL-ONLY LIVE RATE CACHE COMPLETE");
  console.log("================================================");
  console.log("Input live-rate rows:", stats.total_rate_rows.toLocaleString());
  console.log("Kept real live-rate + real-image rows:", stats.kept_real_only_rows.toLocaleString());
  console.log("Rejected not live/payable:", stats.rejected_not_live_payable.toLocaleString());
  console.log("Rejected missing real geo/image:", stats.rejected_no_real_image_or_geo.toLocaleString());
  console.log("Countries:", audit.countries);
  console.log("Cities:", audit.cities);
  console.log("GZ MB:", gzMb.toFixed(2));
  console.log("JSON:", FILES.outJson);
  console.log("GZ:", FILES.outGz);
  console.log("Audit:", FILES.audit);
  console.log("");
  console.log("TOP COUNTRIES");
  console.log("================================================");

  for (const [i, x] of summary.slice(0, 30).entries()) {
    console.log(
      String(i + 1).padStart(2, "0"),
      "|",
      x.country.padEnd(28, " "),
      "| cities:",
      String(x.cities).padStart(5, " "),
      "| live rates:",
      x.live_rates.toLocaleString()
    );
  }
}

main();
