const fs = require("fs");
const path = require("path");

const backend = path.join(__dirname, "backend");
const frontendPublic = path.join(__dirname, "frontend", "public");

const { loadRealOnly } = require(path.join(backend, "real-only-live-index.js"));
const live = loadRealOnly();

const payload = {
  ok: true,
  source: "static_real_only_live_destinations",
  countries: live.countries || []
};

fs.writeFileSync(
  path.join(frontendPublic, "live-destinations.json"),
  JSON.stringify(payload)
);

console.log("Exported live destinations:", payload.countries.length);
