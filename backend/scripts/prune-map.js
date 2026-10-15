const fs = require("fs");

const map = JSON.parse(fs.readFileSync("data/hotelbeds-city-to-code.json", "utf8"));
const verifiedCodes = new Set(JSON.parse(fs.readFileSync("scripts/verified-codes.json", "utf8")));

// Codes we trust even if not in D: data (verified major cities)
const trustedManual = new Set([
  "LON", "PAR", "NYC", "DXB", "AUH", "BER", "MAD", "BCN", "ROM", "MIL", "VCE",
  "AMS", "BRU", "ZRH", "GVA", "VIE", "LIS", "OPO", "ATH", "IST", "AYT",
  "RUH", "JED", "DOH", "CAI", "RAK", "CPT", "JNB", "LOS", "ABV", "NBO",
  "YYZ", "YTO", "YVR", "YMQ", "MEX", "CUN", "GRU", "SAO", "RIO", "EZE",
  "BUE", "SCL", "LIM", "BOG", "BOM", "DEL", "BKK", "HKT", "SIN", "KUL",
  "CGK", "DPS", "HKG", "PEK", "BJS", "SHA", "TYO", "OSA", "SEL", "SYD",
  "MEL", "AKL", "DUB", "EDI", "GLA", "MAN", "BHX", "LPL", "BRS", "NCL",
  "CWL", "BFS", "ORK", "CDG", "ORY", "LYS", "NCE", "MRS", "TLS", "BOD",
  "MUC", "FRA", "HAM", "DUS", "STR", "CGN", "VIE", "SZG", "INN", "PRG",
  "WAW", "BUD", "OTP", "SOF", "ZAG", "LJU", "BEG", "SKP", "TIA", "ATH"
]);

const before = Object.keys(map).length;
const pruned = {};

for (const key of Object.keys(map)) {
  const code = map[key];
  if (verifiedCodes.has(code) || trustedManual.has(code)) {
    pruned[key] = code;
  }
}

const removed = before - Object.keys(pruned).length;

// Backup original
fs.copyFileSync("data/hotelbeds-city-to-code.json", "data/hotelbeds-city-to-code.full-backup.json");

// Write pruned map
fs.writeFileSync("data/hotelbeds-city-to-code.json", JSON.stringify(pruned, null, 0));

console.log("Total before pruning:", before);
console.log("Total after pruning:", Object.keys(pruned).length);
console.log("Removed (unverified codes):", removed);

// Count UK cities remaining
const ukCount = Object.keys(pruned).filter((k) => k.startsWith("united kingdom|")).length;
console.log("UK cities remaining:", ukCount);
