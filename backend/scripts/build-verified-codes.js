const fs = require("fs");
const images = JSON.parse(fs.readFileSync("D:\\hotel_images_live_backup.json", "utf8"));

// A code is "real" if Hotelbeds assigned at least 3 different hotels to it
const codeCount = {};
for (const item of images) {
  const code = String(item.destination_code || "").trim().toUpperCase();
  if (!/^[A-Z]{3}$/.test(code)) continue;
  if (!codeCount[code]) codeCount[code] = new Set();
  codeCount[code].add(String(item.hotel_name || "").trim().toLowerCase());
}

const verifiedCodes = Object.keys(codeCount).filter((c) => codeCount[c].size >= 3);

fs.writeFileSync("scripts/verified-codes.json", JSON.stringify(verifiedCodes, null, 0));
console.log("Total codes in D: data:", Object.keys(codeCount).length);
console.log("Verified codes (>= 3 hotels):", verifiedCodes.length);
console.log("Saved to scripts/verified-codes.json");
