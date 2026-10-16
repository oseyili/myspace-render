const fs = require("fs");
const p = "supplierFederation.js";
let code = fs.readFileSync(p, "utf8");

// 1. Add image index loader after the initial requires
if (code.indexOf("hotelImagesIndex") < 0) {
  const anchor = 'const { URLSearchParams } = require("url");';
  const idx = code.indexOf(anchor);
  if (idx < 0) {
    console.error("Anchor for image loader not found");
    process.exit(1);
  }
  const loaderBlock = anchor + `

// ============================================================
// HOTEL IMAGE INDEX - loaded once at startup
// ============================================================
const path = require("path");
let hotelImagesIndex = {};
try {
  const imgPath = path.join(__dirname, "data", "hotel-images-index.json");
  if (fs.existsSync(imgPath)) {
    hotelImagesIndex = JSON.parse(fs.readFileSync(imgPath, "utf8"));
    console.log("[Images] Loaded " + Object.keys(hotelImagesIndex).length + " hotel images");
  } else {
    console.warn("[Images] File not found: " + imgPath);
  }
} catch (e) {
  console.warn("[Images] Could not load image index:", e.message);
}

function lookupImage(name) {
  if (!name) return null;
  return hotelImagesIndex[String(name).trim().toLowerCase()] || null;
}
`;
  code = code.slice(0, idx) + loaderBlock + code.slice(idx + anchor.length);
  console.log("Added image index loader + lookupImage function");
}

fs.writeFileSync(p, code);
console.log("Step 1 done. New size:", code.length);
