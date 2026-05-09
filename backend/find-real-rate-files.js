const fs = require("fs");
const path = require("path");

const roots = ["C:\\frontend\\hotel-booking-app", "D:\\"];

function walk(dir, out = []) {
  try {
    for (const item of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, item.name);
      if (item.isDirectory()) walk(full, out);
      if (item.isFile() && /\.(json|csv)$/i.test(item.name)) out.push(full);
    }
  } catch {}
  return out;
}

function scanNode(node, stats, depth = 0) {
  if (!node || depth > 8) return;

  if (Array.isArray(node)) {
    stats.maxArray = Math.max(stats.maxArray, node.length);
    for (let i = 0; i < Math.min(node.length, 1000); i++) {
      scanNode(node[i], stats, depth + 1);
    }
    return;
  }

  if (typeof node === "object") {
    const keys = Object.keys(node);
    for (const k of keys) stats.keys.add(k);

    const hasRate =
      node.rateKey || node.rate_key ||
      node.sellingRate || node.selling_rate ||
      node.net || node.amount || node.price ||
      node.currency;

    const hasHotel =
      node.hotelCode || node.hotel_code ||
      node.hotelId || node.hotel_id ||
      node.hotelName || node.hotel_name ||
      node.name;

    if (hasRate && hasHotel) stats.rateLike++;

    for (const value of Object.values(node)) {
      scanNode(value, stats, depth + 1);
    }
  }
}

const allFiles = roots.flatMap((r) => walk(r));
const candidates = [];

for (const file of allFiles) {
  try {
    const s = fs.statSync(file);
    if (s.size < 1024 * 1024) continue;

    const base = path.basename(file).toLowerCase();
    if (!/(rate|rates|availability|avail|hotelbeds|booking|price|prices|supplier|feed|hotel)/.test(base)) continue;

    if (file.toLowerCase().endsWith(".csv")) {
      const raw = fs.readFileSync(file, "utf8");
      const lines = raw.split(/\r?\n/).length;
      candidates.push({
        file,
        sizeMB: +(s.size / 1024 / 1024).toFixed(2),
        type: "csv",
        rows: lines,
        maxArray: 0,
        rateLike: lines,
        keys: "CSV"
      });
      continue;
    }

    const raw = fs.readFileSync(file, "utf8");
    const json = JSON.parse(raw);

    const stats = {
      maxArray: 0,
      rateLike: 0,
      keys: new Set()
    };

    scanNode(json, stats);

    if (stats.maxArray > 1000 || stats.rateLike > 1000) {
      candidates.push({
        file,
        sizeMB: +(s.size / 1024 / 1024).toFixed(2),
        type: "json",
        rows: 0,
        maxArray: stats.maxArray,
        rateLike: stats.rateLike,
        keys: [...stats.keys].slice(0, 60).join(", ")
      });
    }
  } catch {}
}

candidates
  .sort((a, b) => b.rateLike - a.rateLike || b.maxArray - a.maxArray || b.sizeMB - a.sizeMB)
  .forEach((x) => {
    console.log("\nFILE:", x.file);
    console.log("SIZE MB:", x.sizeMB);
    console.log("TYPE:", x.type);
    console.log("MAX ARRAY:", x.maxArray);
    console.log("RATE-LIKE RECORDS:", x.rateLike);
    console.log("KEYS:", x.keys);
  });

console.log("\nTOTAL CANDIDATE FILES:", candidates.length);
