const fs = require("fs");
const path = require("path");
const zlib = require("zlib");

const dataDir = path.join(__dirname, "backend", "data");
const source = path.join(dataDir, "live_rate_cache.json");
const renderJson = path.join(dataDir, "live_rate_cache_render.json");
const renderGz = path.join(dataDir, "live_rate_cache_render.json.gz");

if (!fs.existsSync(source)) {
  console.error("Missing backend/data/live_rate_cache.json");
  process.exit(1);
}

console.log("Reading master live-rate cache...");
const raw = JSON.parse(fs.readFileSync(source, "utf8"));
const rows = raw.live_rates || raw.hotels || [];

console.log("Master live rates:", rows.length);

const picked = rows.slice(0, 45000);

const payload = {
  generated_at: new Date().toISOString(),
  total_live_rates: picked.length,
  live_rates: picked
};

fs.writeFileSync(renderJson, JSON.stringify(payload), "utf8");

if (fs.existsSync(renderGz)) fs.unlinkSync(renderGz);

const input = fs.createReadStream(renderJson);
const output = fs.createWriteStream(renderGz);
const gzip = zlib.createGzip({ level: 9 });

input.pipe(gzip).pipe(output).on("finish", () => {
  console.log("Render cache ready.");
  console.log("Render JSON MB:", (fs.statSync(renderJson).size / 1024 / 1024).toFixed(2));
  console.log("Render GZ MB:", (fs.statSync(renderGz).size / 1024 / 1024).toFixed(2));
});
