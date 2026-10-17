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

async function fetchHotelsByDestination(destinationCode, from = 1, to = 1000) {
  const ts = Math.floor(Date.now() / 1000);
  const sig = crypto.createHash("sha256").update(API_KEY + SECRET + ts).digest("hex");
  const url = BASE_URL + "/hotel-content-api/1.0/hotels?destinationCode=" + destinationCode + "&fields=all&language=ENG&from=" + from + "&to=" + to + "&useSecondaryLanguage=false";
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
  const quotaPath = path.join(outDir, "hotelbeds-quota.json");

  // 1. Load Cache (Merge all chunk files)
  let cache = {};
  const chunksDir = path.join(outDir, "chunks");
  
  if (fs.existsSync(chunksDir)) {
    const chunkFiles = fs.readdirSync(chunksDir).filter(f => f.endsWith(".json"));
    for (const file of chunkFiles) {
      try {
        const chunkData = JSON.parse(fs.readFileSync(path.join(chunksDir, file), "utf8"));
        Object.assign(cache, chunkData);
      } catch (e) {
        console.error("Error reading chunk " + file + ": " + e.message);
      }
    }
  } else if (fs.existsSync(outPath)) {
    // Fallback for the very first run if chunks don't exist yet
    try { cache = JSON.parse(fs.readFileSync(outPath, "utf8")); } catch { cache = {}; }
  }

  // 2. Load Quota (Resets daily)
  let quota = { date: new Date().toISOString().slice(0, 10), calls: 0 };
  if (fs.existsSync(quotaPath)) {
    try { 
      const savedQuota = JSON.parse(fs.readFileSync(quotaPath, "utf8"));
      if (savedQuota.date === quota.date) quota = savedQuota; 
    } catch {}
  }

  const MAX_DAILY_QUOTA = 50;
  let callsLeft = MAX_DAILY_QUOTA - quota.calls;

  console.log("Cache currently has " + Object.keys(cache).length + " hotels");
  console.log("API Calls used today: " + quota.calls + " / " + MAX_DAILY_QUOTA);
  
  if (callsLeft <= 0) {
    console.log("Daily quota reached. Please run again tomorrow.");
    return;
  }

  let callsMadeThisRun = 0;
  let hotelsAdded = 0;

  // 3. Sort Cities: Prioritize 0-count cities, then cities that haven't reached a multiple of 1000
  const sortedCities = [...PRIORITY_CITIES].sort((a, b) => {
    let aCount = 0; let bCount = 0;
    for (const key in cache) {
      if (cache[key].destinationCode === a) aCount++;
      if (cache[key].destinationCode === b) bCount++;
    }
    // 0 count goes first
    if (aCount === 0 && bCount > 0) return -1;
    if (bCount === 0 && aCount > 0) return 1;
    // If both have >0, prioritize the one that needs pagination (not a multiple of 1000)
    const aNeedsPaginate = aCount % 1000 !== 0;
    const bNeedsPaginate = bCount % 1000 !== 0;
    if (aNeedsPaginate && !bNeedsPaginate) return -1;
    if (!aNeedsPaginate && bNeedsPaginate) return 1;
    return 0;
  });

  for (const destinationCode of sortedCities) {
    if (callsLeft <= 0) {
      console.log("\nHit daily quota limit (" + MAX_DAILY_QUOTA + "). Stopping. Run again tomorrow.");
      break;
    }

    let existingCount = 0;
    for (const key in cache) {
      if (cache[key].destinationCode === destinationCode) existingCount++;
    }

    // If existingCount is exactly a multiple of 1000 (e.g., 0, 1000, 2000), we fetch the next batch.
    // If it's NOT a multiple (e.g., 250), it means that city is fully exhausted. Skip it.
    if (existingCount > 0 && existingCount % 1000 !== 0) {
        console.log("\n>>> Skipping " + destinationCode + " (Fully cached: " + existingCount + " hotels)");
        continue;
    }

    const from = existingCount + 1;
    const to = existingCount + 1000;

    console.log("\n>>> Fetching " + destinationCode + " (Range " + from + " to " + to + ")...");
    try {
      const result = await fetchHotelsByDestination(destinationCode, from, to);
      callsMadeThisRun++;
      callsLeft--;
      
      // Save quota state immediately
      quota.calls++;
      fs.writeFileSync(quotaPath, JSON.stringify(quota));

      if (!result.ok) { 
          console.log("  Skipped (status " + result.status + ")"); 
          if (result.status === 403) break;
          continue; 
      }

      console.log("  " + destinationCode + ": " + result.hotels.length + " hotels returned.");
      
      // If 0 returned, it means we reached the end of this city's list
      if (result.hotels.length === 0) {
          console.log("  Finished pagination for " + destinationCode + ".");
      }

      for (const h of result.hotels) {
        if (!h.code) continue;
        const key = String(h.code);
        if (cache[key]) continue;
        cache[key] = extractHotelDetails(h);
        hotelsAdded++;
      }
      
      // Create chunks directory if it doesn't exist
      if (!fs.existsSync(chunksDir)) fs.mkdirSync(chunksDir, { recursive: true });
      
      // Split into chunks of 10,000 hotels (approx 20MB each)
      const allCodes = Object.keys(cache);
      const CHUNK_SIZE = 10000;
      let chunkIndex = 1;

      for (let i = 0; i < allCodes.length; i += CHUNK_SIZE) {
        const chunkCodes = allCodes.slice(i, i + CHUNK_SIZE);
        const chunkData = {};
        for (const code of chunkCodes) chunkData[code] = cache[code];
        
        const chunkPath = path.join(chunksDir, `part-${chunkIndex}.json`);
        fs.writeFileSync(chunkPath, JSON.stringify(chunkData));
        chunkIndex++;
      }
      console.log("  Saved. Total cached: " + allCodes.length + " hotels in " + (chunkIndex - 1) + " chunks.");
      
      await new Promise(r => setTimeout(r, 1000)); 
    } catch (e) {
      console.error("  " + destinationCode + " error: " + e.message);
    }
  }

  console.log("\n===========================================");
  console.log("DONE");
  console.log("API calls made this run: " + callsMadeThisRun);
  console.log("New hotels added this run: " + hotelsAdded);
  console.log("Total hotels in cache: " + Object.keys(cache).length);
  console.log("Total API calls used today: " + quota.calls + " / " + MAX_DAILY_QUOTA);
  console.log("===========================================");
}

main().catch(e => {
  console.error("FATAL:", e.message);
  process.exit(1);
});
