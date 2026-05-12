const fs = require("fs");
const path = require("path");
const zlib = require("zlib");

const API_BASE = process.env.API_BASE || "http://127.0.0.1:5050";
const TARGET_TOTAL = Number(process.env.TARGET_TOTAL || 1000000);
const OUT_DIR = path.join(__dirname, "data", "live-rate-cache");
const MANIFEST = path.join(OUT_DIR, "manifest.json");

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function safe(v) {
  return String(v || "").trim();
}

function hasRealImage(hotel) {
  const img = safe(hotel.direct_image_url || hotel.image_url);
  if (!img) return false;
  if (img.includes("placeholder")) return false;
  if (img.includes("fake")) return false;
  return /^https?:\/\//i.test(img);
}

function hasLiveRate(hotel) {
  const r = hotel.first_rate || {};
  return Boolean(
    hotel.live_rate_ready &&
    r.rate_key &&
    Number(r.customer_total || r.amount || r.selling_rate || 0) > 0
  );
}

function todayPlus(days) {
  const d = new Date(Date.now() + days * 86400000);
  return d.toISOString().slice(0, 10);
}

function loadManifest() {
  try {
    return JSON.parse(fs.readFileSync(MANIFEST, "utf8"));
  } catch {
    return {
      total: 0,
      shards: [],
      seen: {},
      started_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    };
  }
}

function saveManifest(m) {
  m.updated_at = new Date().toISOString();
  fs.writeFileSync(MANIFEST, JSON.stringify(m, null, 2));
}

function nextShardName(manifest) {
  const n = String((manifest.shards.length || 0) + 1).padStart(6, "0");
  return `live-rates-${n}.ndjson.gz`;
}

async function fetchJson(url) {
  const res = await fetch(url, { cache: "no-store" });
  return await res.json();
}

async function main() {
  fs.mkdirSync(OUT_DIR, { recursive: true });

  const manifest = loadManifest();

  console.log("MYSPACE HOTEL live-rate/image harvester");
  console.log("Target:", TARGET_TOTAL.toLocaleString());
  console.log("Existing:", manifest.total.toLocaleString());
  console.log("API:", API_BASE);

  const boot = await fetchJson(`${API_BASE}/api/bootstrap`);
  const countries = Array.isArray(boot.countries) ? boot.countries : [];

  if (!countries.length) {
    throw new Error("No countries loaded from /api/bootstrap. Start backend first.");
  }

  while (manifest.total < TARGET_TOTAL) {
    const shardName = nextShardName(manifest);
    const shardPath = path.join(OUT_DIR, shardName);
    const gzip = zlib.createGzip({ level: 9 });
    const out = fs.createWriteStream(shardPath);
    gzip.pipe(out);

    let shardCount = 0;
    const shardMax = 25000;

    for (const countryObj of countries) {
      const country = safe(countryObj.country);
      const cities = Array.isArray(countryObj.cities) ? countryObj.cities : [];

      for (const cityObj of cities) {
        const city = typeof cityObj === "string" ? cityObj : safe(cityObj.city);
        if (!country || !city) continue;

        let cityFailCount = 0; for (let dateOffset = 7; dateOffset <= 365; dateOffset += 7) {
          for (const guests of [1, 2, 3, 4]) {
            for (const rooms of [1, 2]) {
              if (manifest.total >= TARGET_TOTAL || shardCount >= shardMax) break;

              const checkin = todayPlus(dateOffset);
              const checkout = todayPlus(dateOffset + 1);

              const p = new URLSearchParams();
              p.set("country", country);
              p.set("city", city);
              p.set("checkin", checkin);
              p.set("checkout", checkout);
              p.set("guests", String(guests));
              p.set("rooms", String(rooms));

              try {
                const data = await fetchJson(`${API_BASE}/api/hotels/search?${p.toString()}`);
                const hotels = Array.isArray(data.hotels) ? data.hotels : [];

                for (const hotel of hotels) {
                  if (!hasLiveRate(hotel) || !hasRealImage(hotel)) continue;

                  const r = hotel.first_rate || {};
                  const key = [
                    safe(hotel.hotel_id),
                    safe(r.rate_key),
                    checkin,
                    checkout,
                    guests,
                    rooms
                  ].join("|");

                  if (manifest.seen[key]) continue;
                  manifest.seen[key] = 1;

                  const row = {
                    harvested_at: new Date().toISOString(),
                    country,
                    city,
                    checkin,
                    checkout,
                    guests,
                    rooms,
                    hotel_id: hotel.hotel_id,
                    hotel_name: hotel.hotel_name,
                    area: hotel.area || "",
                    latitude: hotel.latitude || "",
                    longitude: hotel.longitude || "",
                    image_url: hotel.direct_image_url || hotel.image_url,
                    live_rate_ready: true,
                    rate: {
                      rate_key: r.rate_key,
                      room_name: r.room_name || "",
                      board_name: r.board_name || "",
                      currency: r.currency || "",
                      customer_total: Number(r.customer_total || r.amount || r.selling_rate || 0),
                      supplier_total: Number(r.supplier_total || r.supplier_amount || r.amount || 0),
                      cancellation_policies: r.cancellation_policies || []
                    }
                  };

                  gzip.write(JSON.stringify(row) + "\n");
                  manifest.total++;
                  shardCount++;

                  if (manifest.total % 100 === 0) {
                    console.log("Harvested:", manifest.total.toLocaleString(), "| latest:", city, country);
                  }

                  if (manifest.total >= TARGET_TOTAL || shardCount >= shardMax) break;
                }
              } catch (err) {
                cityFailCount++; console.log("Skip:", city, country, "-", err.message); if (cityFailCount >= 3) { console.log("City skipped after repeated failures:", city, country); dateOffset = 9999; break; }
              }

              await sleep(250);
            }
          }
        }
      }
    }

    await new Promise((resolve) => gzip.end(resolve));
    await new Promise((resolve) => out.on("close", resolve));

    manifest.shards.push({
      file: shardName,
      rows: shardCount,
      created_at: new Date().toISOString()
    });

    saveManifest(manifest);

    console.log("Shard saved:", shardName, "rows:", shardCount.toLocaleString());

    if (shardCount === 0) {
      console.log("No new live image/rate rows found this pass. Waiting 5 minutes.");
      await sleep(300000);
    }
  }

  saveManifest(manifest);
  console.log("DONE. Total harvested:", manifest.total.toLocaleString());
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

