// ============================================================
// Hotelbeds Content API Fetcher
// ============================================================
require("dotenv").config({ path: require("path").join(__dirname, "..", ".env") });
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const API_KEY = String(process.env.HOTELBEDS_API_KEY || "").trim();
const SECRET = String(process.env.HOTELBEDS_SECRET || "").trim();
const BASE_URL = String(process.env.HOTELBEDS_BASE_URL || "").trim().replace(/\/$/, "");

if (!API_KEY || !SECRET || !BASE_URL) {
  console.error("Missing Hotelbeds credentials in .env");
  process.exit(1);
}

function isDestinationCached(destinationCode, cache) {
  // Check if we already have hotels for this destination
  for (const code of Object.keys(cache)) {
    if (cache[code] && cache[code].destinationCode === destinationCode) {
      return true;
    }
  }
  return false;
}

const PRIORITY_CITIES = ["LON","BHX","MAN","EDI","GLA","BRS","NCL","LPL","CWL","BFS","DUB","SOU","NQT","YOR","BTH","OXF","CBG","LBA","NWI","IPW","XRE","CVT","STK","DER","HUL","MME","SUN","CAX","BLK","PRE","CEG","GLO","SWI","SAL","WNE","DOV","HAS","ESB","IOW","ABZ","DND","INV","LDY","NRY","SWS","NWP","WRE","BGR","LLD","ABE","ORK","CORK","BFS","GAL","KIR","WAT","LMK","GWY","JER","GCI","IOM"]

async function fetchHotelsByDestination(destinationCode) {
  const ts = Math.floor(Date.now() / 1000);
  const sig = crypto.createHash("sha256").update(API_KEY + SECRET + ts).digest("hex");
  const url = BASE_URL + "/hotel-content-api/1.0/hotels?destinationCode=" + destinationCode + "&fields=all&language=ENG&from=1&to=1000&useSecondaryLanguage=false";
  const res = await fetch(url, {
    headers: {
      "Api-key": API_KEY,
      "X-Signature": sig,
      "Accept": "application/json"
    }
  });
  if (!res.ok) {
    const text = await res.text();
    console.error("  " + destinationCode + " failed " + res.status + ": " + text.slice(0, 200));
    return { ok: false, hotels: [], status: res.status };
  }
  const data = await res.json();
  return { ok: true, hotels: Array.isArray(data && data.hotels) ? data.hotels : [], status: 200 };
}

function extractHotelDetails(h) {
  const images = (h.images || [])
    .filter(img => img.path)
    .slice(0, 5)
    .map(img => ({ url: img.path, type: img.imageTypeCode || "" }));

  const facilities = (h.facilities || [])
    .slice(0, 30)
    .map(f => f.facilityName)
    .filter(Boolean);

  const rooms = (h.rooms || []).map(r => ({
    code: r.roomCode,
    name: r.roomName,
    minPax: r.minPax,
    maxPax: r.maxPax
  }));

  return {
    code: h.code,
    name: h.name,
    categoryCode: h.categoryCode,
    categoryName: h.categoryName,
    destinationCode: h.destinationCode,
    zoneName: h.zoneName,
    address: (h.address && h.address.content) || h.address,
    postalCode: h.postalCode,
    city: (h.city && h.city.content) || h.city,
    countryCode: h.countryCode,
    latitude: h.coordinates && h.coordinates.latitude,
    longitude: h.coordinates && h.coordinates.longitude,
    email: h.email,
    phone: h.phones && h.phones[0] && h.phones[0].phoneNumber,
    web: h.web,
    description: (h.description && h.description.content) || "",
    images: images,
    facilities: facilities,
    rooms: rooms,
    image: images[0] ? images[0].url : null,
    updatedAt: new Date().toISOString()
  };
}

async function main() {
  const outDir = path.join(__dirname, "..", "data");
  if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });

  const outPath = path.join(outDir, "hotelbeds-content-cache.json");

  let cache = {};
  if (fs.existsSync(outPath)) {
    try { cache = JSON.parse(fs.readFileSync(outPath, "utf8")); } catch { cache = {}; }
  }

  console.log("Cache currently has " + Object.keys(cache).length + " hotels");
  console.log("Fetching Content API for " + PRIORITY_CITIES.length + " priority cities...");
  console.log("Max 45 API calls per run (out of 50 daily quota)");

  const MAX_CALLS = 8;
  let callsMade = 0;
  let hotelsAdded = 0;

  // Sort PRIORITY_CITIES: uncached first, cached last (so we prioritize fresh cities)
    const sortedCities = [...PRIORITY_CITIES].sort((a, b) => {
      const aCached = isDestinationCached(a, cache) ? 1 : 0;
      const bCached = isDestinationCached(b, cache) ? 1 : 0;
      return aCached - bCached;
    });

    for (const destinationCode of sortedCities) {
      if (callsMade >= MAX_CALLS) {
        console.log("\nHit " + MAX_CALLS + " call limit. Stopping. Run again tomorrow.");
        break;
      }

      if (isDestinationCached(destinationCode, cache)) {
        console.log("\n>>> Skipping " + destinationCode + " (already cached)");
        continue;
      }
    console.log("\n>>> [" + (callsMade + 1) + "/" + MAX_CALLS + "] Fetching " + destinationCode + "...");
    try {
      const result = await fetchHotelsByDestination(destinationCode);
      callsMade++;
      if (!result.ok) { console.log("  Skipped (status " + result.status + ")"); continue; }
      console.log("  " + destinationCode + ": " + result.hotels.length + " hotels");
      for (const h of result.hotels) {
        if (!h.code) continue;
        const key = String(h.code);
        if (cache[key]) continue;
        cache[key] = extractHotelDetails(h);
        hotelsAdded++;
      }
      fs.writeFileSync(outPath, JSON.stringify(cache));
      const sizeMB = (fs.statSync(outPath).size / 1024 / 1024).toFixed(2);
      console.log("  Saved. Total cached: " + Object.keys(cache).length + " hotels (" + sizeMB + " MB)");
      await new Promise(r => setTimeout(r, 800));
    } catch (e) {
      console.error("  " + destinationCode + " error: " + e.message);
    }
  }

  console.log("\n===========================================");
  console.log("DONE");
  console.log("API calls made: " + callsMade);
  console.log("New hotels added this run: " + hotelsAdded);
  console.log("Total hotels in cache: " + Object.keys(cache).length);
  console.log("Cache file: " + outPath);
  console.log("Cache size: " + (fs.statSync(outPath).size / 1024 / 1024).toFixed(2) + " MB");
  console.log("===========================================");
}

main().catch(e => {
  console.error("FATAL:", e.message);
  process.exit(1);
});
