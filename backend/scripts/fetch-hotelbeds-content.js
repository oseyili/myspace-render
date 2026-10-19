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
  const chunksDir = path.join(outDir, "chunks");

  // 1. Load Cache (Merge all chunk files)
  let cache = {};
  
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
    try { cache = JSON.parse(fs.readFileSync(outPath, "utf8")); } catch { cache = {}; }
  }

  // 2. Load Quota
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

  // 3. EXCLUSIVE LONDON LOOP
  const destinationCode = "LON";
  
  // Find current London count to determine where to start
  let existingLondonCount = 0;
  for (const key in cache) {
    if (cache[key].destinationCode === destinationCode) existingLondonCount++;
  }
  
  let from = existingLondonCount + 1;
  let to = existingLondonCount + 1000;

  console.log(`Starting fetch for London. Current count: ${existingLondonCount}`);

  while (callsLeft > 0) {
    console.log("\n>>> Fetching " + destinationCode + " (Range " + from + " to " + to + ")...");
    try {
      const result = await fetchHotelsByDestination(destinationCode, from, to);
      callsMadeThisRun++;
      callsLeft--;
      
      // Save quota state
      quota.calls++;
      fs.writeFileSync(quotaPath, JSON.stringify(quota));

      if (!result.ok) { 
          console.log("  Skipped (status " + result.status + ")"); 
          if (result.status === 403) break;
          continue; 
      }

      console.log("  " + destinationCode + ": " + result.hotels.length + " hotels returned.");
      
      // If 0 returned, we have reached the end of London!
      if (result.hotels.length === 0) {
          console.log("  Finished pagination for London. All available hotels fetched.");
          break;
      }

      // Add new hotels to cache (DO NOT OVERWRITE EXISTING)
      for (const h of result.hotels) {
        if (!h.code) continue;
        const key = String(h.code);
        if (cache[key]) continue; // Skip if we already have it
        cache[key] = extractHotelDetails(h);
        hotelsAdded++;
      }
      
      // Save to chunks
      if (!fs.existsSync(chunksDir)) fs.mkdirSync(chunksDir, { recursive: true });
      const allCodes = Object.keys(cache);
      const CHUNK_SIZE = 10000;
      let chunkIndex = 1;

      // Clear old chunks so we don't have duplicates
      const oldChunks = fs.readdirSync(chunksDir);
      for (const old of oldChunks) fs.unlinkSync(path.join(chunksDir, old));

      for (let i = 0; i < allCodes.length; i += CHUNK_SIZE) {
        const chunkCodes = allCodes.slice(i, i + CHUNK_SIZE);
        const chunkData = {};
        for (const code of chunkCodes) chunkData[code] = cache[code];
        
        const chunkPath = path.join(chunksDir, `part-${chunkIndex}.json`);
        fs.writeFileSync(chunkPath, JSON.stringify(chunkData));
        chunkIndex++;
      }
      console.log("  Saved. Total cached: " + allCodes.length + " hotels in " + (chunkIndex - 1) + " chunks.");

      // Advance pagination for the next loop iteration
      from += result.hotels.length;
      to += result.hotels.length;

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
