const fs = require("fs");
const path = require("path");
const zlib = require("zlib");

const ROOT = process.cwd();
const DATA = path.join(ROOT, "backend", "data");

const rateFiles = [
  path.join(DATA, "REAL_ONLY_live_rates.json.gz"),
  path.join(DATA, "live-rates-000001.ndjson.gz"),
  path.join(DATA, "live-rates-000002.ndjson.gz"),
  path.join(DATA, "live-rate-cache", "live-rates-000001.ndjson.gz"),
  path.join(DATA, "live-rate-cache", "live-rates-000002.ndjson.gz")
];

const outFile = path.join(DATA, "live-rate-index.json");

function clean(v) {
  return String(v || "").trim();
}

function pick(o, keys) {
  for (const k of keys) {
    const v = o?.[k];
    if (v !== undefined && v !== null && String(v).trim()) return v;
  }
  return "";
}

function rows(payload) {
  if (Array.isArray(payload)) return payload;
  if (Array.isArray(payload.hotels)) return payload.hotels;
  if (Array.isArray(payload.rates)) return payload.rates;
  if (Array.isArray(payload.data)) return payload.data;
  if (Array.isArray(payload.results)) return payload.results;
  return [];
}

function readAnyGz(file) {
  if (!fs.existsSync(file)) return [];

  try {
    const text = zlib.gunzipSync(fs.readFileSync(file)).toString("utf8");

    if (file.toLowerCase().endsWith(".ndjson.gz")) {
      return text
        .split(/\r?\n/)
        .filter(Boolean)
        .map((line) => {
          try {
            return JSON.parse(line);
          } catch {
            return null;
          }
        })
        .filter(Boolean);
    }

    return rows(JSON.parse(text));
  } catch (err) {
    console.log("SKIPPED BROKEN FILE:", file);
    console.log("Reason:", err.message);
    return [];
  }
}

function hotelId(row) {
  return clean(pick(row, [
    "hotel_id",
    "hotelId",
    "id",
    "code",
    "hotelCode",
    "supplier_hotel_id"
  ]));
}

function rateOf(row) {
  const src = row.first_rate || row.rate || row;

  const amount = Number(pick(src, [
    "amount",
    "price",
    "total",
    "net",
    "sellingRate",
    "rate"
  ]));

  if (!(amount > 0)) return null;

  return {
    amount,
    currency: clean(pick(src, ["currency", "currencyCode"])) || "GBP",
    rate_key: clean(pick(src, ["rate_key", "rateKey"]))
  };
}

const index = {};

for (const file of rateFiles) {
  const list = readAnyGz(file);
  console.log("Reading:", file, "rows:", list.length);

  for (const row of list) {
    const id = hotelId(row);
    const rate = rateOf(row);

    if (!id || !rate) continue;

    if (!index[id] || Number(rate.amount) < Number(index[id].amount || 999999999)) {
      index[id] = rate;
    }
  }
}

fs.writeFileSync(outFile, JSON.stringify(index, null, 2));

console.log("DONE");
console.log("Live rate hotels indexed:", Object.keys(index).length);
console.log("Wrote:", outFile);
