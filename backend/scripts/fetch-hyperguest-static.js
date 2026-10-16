// ============================================================
// HyperGuest Static Data Fetcher
// Downloads the full HyperGuest hotel directory and saves it
// locally. Run once, refresh weekly.
// ============================================================
require("dotenv").config({ path: require("path").join(__dirname, "..", ".env") });
const fs = require("fs");
const path = require("path");

const TOKEN = String(process.env.HYPERGUEST_AUTH_TOKEN || "").trim();
const URL = String(process.env.HYPERGUEST_STATIC_URL || "https://hg-static.hyperguest.com/hotels.json");

if (!TOKEN) {
  console.error("Missing HYPERGUEST_AUTH_TOKEN in .env");
  process.exit(1);
}

async function main() {
  const outDir = path.join(__dirname, "..", "data");
  if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });

  const outPath = path.join(outDir, "hyperguest-static-cache.json");

  console.log("Downloading HyperGuest static data...");
  console.log("URL:", URL);

  const res = await fetch(URL, {
    headers: {
      "Authorization": "Bearer " + TOKEN,
      "Accept-Encoding": "gzip, deflate"
    }
  });

  if (!res.ok) {
    console.error("Failed:", res.status);
    const text = await res.text();
    console.error("Body:", text.slice(0, 500));
    process.exit(1);
  }

  const data = await res.json();
  const hotels = Array.isArray(data) ? data : (data.hotels || []);

  console.log("Downloaded hotels:", hotels.length);

  // Build indexes:
  // 1. By hotel_id
  // 2. By city name (lowercased)
  // 3. By country|city
  const byId = {};
  const byCity = {};
  const byCountryCity = {};

  for (const h of hotels) {
    if (!h.hotel_id) continue;
    byId[h.hotel_id] = h;

    const city = String(h.city || "").trim().toLowerCase();
    const country = String(h.country || "").trim().toLowerCase();
    if (city) {
      if (!byCity[city]) byCity[city] = [];
      byCity[city].push(h.hotel_id);
    }
    if (country && city) {
      const key = country + "|" + city;
      if (!byCountryCity[key]) byCountryCity[key] = [];
      byCountryCity[key].push(h.hotel_id);
    }
  }

  const output = {
    fetched: new Date().toISOString(),
    total: hotels.length,
    hotels: byId,
    byCity: byCity,
    byCountryCity: byCountryCity
  };

  fs.writeFileSync(outPath, JSON.stringify(output));
  console.log("Saved to:", outPath);
  console.log("File size:", (fs.statSync(outPath).size / 1024 / 1024).toFixed(2), "MB");
  console.log("");
  console.log("=== HyperGuest Hotel Directory Summary ===");
  console.log("Total hotels:", Object.keys(byId).length);
  console.log("Unique cities:", Object.keys(byCity).length);
  console.log("Unique country|city combinations:", Object.keys(byCountryCity).length);
  console.log("");
  console.log("Sample UK cities:");
  ["london", "birmingham", "manchester", "edinburgh", "glasgow"].forEach(c => {
    const count = (byCity[c] || []).length;
    console.log("  " + c + ": " + count + " hotels");
  });
}

main().catch(e => {
  console.error("FATAL:", e.message);
  process.exit(1);
});
