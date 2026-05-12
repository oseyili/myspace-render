const fs = require("fs");
const zlib = require("zlib");
const path = require("path");

const source = path.join(__dirname, "live_rate_cache.json");
const target = path.join(__dirname, "live_rate_cache.json.gz");

if (!fs.existsSync(source)) {
  console.error("ERROR: live_rate_cache.json not found");
  process.exit(1);
}

if (fs.existsSync(target)) {
  fs.unlinkSync(target);
}

console.log("Compressing live_rate_cache.json...");
console.log("Source MB:", (fs.statSync(source).size / 1024 / 1024).toFixed(2));

const input = fs.createReadStream(source);
const output = fs.createWriteStream(target);
const gzip = zlib.createGzip({ level: 9 });

input
  .pipe(gzip)
  .pipe(output)
  .on("finish", () => {
    console.log("Compression complete.");
    console.log("GZ MB:", (fs.statSync(target).size / 1024 / 1024).toFixed(2));
  })
  .on("error", (err) => {
    console.error("Compression failed:", err.message);
    process.exit(1);
  });
