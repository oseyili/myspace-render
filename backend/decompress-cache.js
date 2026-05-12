const fs = require("fs");
const path = require("path");
const zlib = require("zlib");

const DATA_DIR = path.join(__dirname, "data");
const JSON_FILE = path.join(DATA_DIR, "live_rate_cache.json");
const GZ_FILE = path.join(DATA_DIR, "live_rate_cache.json.gz");

if (!fs.existsSync(GZ_FILE)) {
  console.log("No compressed live rate cache found. Starting without decompression.");
  process.exit(0);
}

console.log("Preparing compressed live rate cache for backend...");
console.log("Source:", GZ_FILE);

const input = fs.createReadStream(GZ_FILE);
const output = fs.createWriteStream(JSON_FILE);
const gunzip = zlib.createGunzip();

input
  .pipe(gunzip)
  .pipe(output)
  .on("finish", () => {
    console.log("Live rate cache restored.");
    console.log("JSON MB:", (fs.statSync(JSON_FILE).size / 1024 / 1024).toFixed(2));
  })
  .on("error", (err) => {
    console.error("Live rate cache restore failed:", err.message);
    process.exit(1);
  });
