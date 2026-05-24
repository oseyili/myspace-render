const fs = require("fs");
const path = require("path");
const zlib = require("zlib");

const file = path.join(process.cwd(), "backend", "data", "live-hotels.ndjson.gz");
const meta = path.join(process.cwd(), "backend", "data", "live-hotels-meta.json");

const text = zlib.gunzipSync(fs.readFileSync(file)).toString("utf8");
const total = text.split(/\r?\n/).filter(Boolean).length;

fs.writeFileSync(
  meta,
  JSON.stringify(
    {
      ok: true,
      generated_at: new Date().toISOString(),
      total_hotels: total,
      storage: "compressed_ndjson_gzip",
      file: "backend/data/live-hotels.ndjson.gz"
    },
    null,
    2
  )
);

console.log("Hotels:", total);
