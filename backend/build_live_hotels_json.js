const fs = require("fs");
const path = require("path");
const zlib = require("zlib");

const DATA_DIR = path.join(__dirname, "data");
const MASTER_REGISTRY_FILE = path.join(DATA_DIR, "master_hotel_registry.json.gz");
const LIVE_CACHE_DIR = path.join(DATA_DIR, "live-rate-cache");
const OUT_FILE = path.join(DATA_DIR, "live_hotels.json");

function clean(v) {
  return String(v || "").trim();
}

function money(v) {
  const n = Number(String(v || "").replace(/[^0-9.-]/g, ""));
  return Number.isFinite(n) ? Number(n.toFixed(2)) : 0;
}

function readJsonGz(file) {
  return JSON.parse(zlib.gunzipSync(fs.readFileSync(file)).toString("utf8"));
}

function readNdjsonGz(file) {
  return zlib.gunzipSync(fs.readFileSync(file))
    .toString("utf8")
    .split(/\r?\n/)
    .filter(Boolean)
    .map((x) => JSON.parse(x));
}

const hotels = new Map();

if (fs.existsSync(MASTER_REGISTRY_FILE)) {
  const rows = readJsonGz(MASTER_REGISTRY_FILE);

  for (const r of rows) {
    const hotel_id = clean(r.canonical_hotel_id || r.supplier_hotel_id || r.hotel_id || r.hotel_code);
    const name = clean(r.hotel_name || r.name);

    if (!hotel_id || !name) continue;

    hotels.set(hotel_id, {
      hotel_id,
      name,
      city: clean(r.city),
      country: clean(r.country),
      rating: clean(r.rating || r.category_name),
      address: clean(r.address),
      area: clean(r.area || r.zone || r.district),
      latitude: clean(r.latitude),
      longitude: clean(r.longitude),
      image_url: clean(r.direct_image_url || r.image_url),
      rooms: [],
      rates: []
    });
  }
}

if (fs.existsSync(LIVE_CACHE_DIR)) {
  const files = fs.readdirSync(LIVE_CACHE_DIR)
    .filter((f) => f.startsWith("live-rates-smart-") && f.endsWith(".ndjson.gz"))
    .sort();

  for (const file of files) {
    const rows = readNdjsonGz(path.join(LIVE_CACHE_DIR, file));

    for (const r of rows) {
      const hotel_id = clean(r.hotel_id || r.hotel_code || r.supplier_hotel_id || r.code);
      const name = clean(r.hotel_name || r.hotelName || r.name);
      const rate_key = clean(r.rate_key || r.rateKey || r.key || r.id);
      const amount = money(r.selling_rate || r.sellingRate || r.customer_total || r.amount || r.net || r.price);
      const currency = clean(r.currency || r.currency_code || "GBP").toUpperCase();

      if (!hotel_id || !name) continue;

      if (!hotels.has(hotel_id)) {
        hotels.set(hotel_id, {
          hotel_id,
          name,
          city: clean(r.city || r.destination_city || r.destination),
          country: clean(r.country || r.destination_country),
          rating: clean(r.rating || r.category_name),
          address: clean(r.address),
          area: clean(r.area || r.zone_name),
          latitude: clean(r.latitude || r.lat),
          longitude: clean(r.longitude || r.lng),
          image_url: clean(r.direct_image_url || r.image_url),
          rooms: [],
          rates: []
        });
      }

      const hotel = hotels.get(hotel_id);

      const room_id = clean(r.room_code || r.room_id || r.roomName || r.room_name || "ROOM");
      const room_name = clean(r.room_name || r.roomName || r.room || "Selected room");

      if (!hotel.rooms.some((x) => x.room_id === room_id)) {
        hotel.rooms.push({
          room_id,
          room_name,
          max_guests: 2
        });
      }

      if (rate_key && amount > 0 && !hotel.rates.some((x) => x.rate_id === rate_key)) {
        hotel.rates.push({
          rate_id: rate_key,
          rate_name: clean(r.board_name || r.boardName || r.board || "Room only"),
          currency,
          nightly_rate: amount
        });
      }
    }
  }
}

const finalHotels = [...hotels.values()]
  .filter((h) => h.hotel_id && h.name)
  .map((h) => ({
    ...h,
    rooms: h.rooms.length ? h.rooms.slice(0, 20) : [{ room_id: "ROOM", room_name: "Selected room", max_guests: 2 }],
    rates: h.rates.length ? h.rates.slice(0, 30) : [{ rate_id: "CONFIRM", rate_name: "Confirmation required", currency: "GBP", nightly_rate: 0 }]
  }));

fs.writeFileSync(OUT_FILE, JSON.stringify(finalHotels, null, 2), "utf8");

console.log("DONE");
console.log("Saved:", OUT_FILE);
console.log("Hotels loaded:", finalHotels.length);
console.log("With live rates:", finalHotels.filter((h) => h.rates.some((r) => Number(r.nightly_rate) > 0)).length);
