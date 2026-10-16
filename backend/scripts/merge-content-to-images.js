// ============================================================
// Merge Hotelbeds Content Cache images into hotel-images-index.json
// ============================================================
const fs = require("fs");

console.log("Loading content cache...");
const contentCache = JSON.parse(fs.readFileSync("data/hotelbeds-content-cache.json", "utf8"));
console.log("Content cache hotels:", Object.keys(contentCache).length);

console.log("Loading existing image index...");
let imageIndex = {};
try {
  imageIndex = JSON.parse(fs.readFileSync("data/hotel-images-index.json", "utf8"));
} catch (e) {
  console.warn("No existing image index, starting fresh");
}
const before = Object.keys(imageIndex).length;
console.log("Existing image index:", before);

console.log("Merging...");
let added = 0;
let skipped = 0;
for (const code of Object.keys(contentCache)) {
  const h = contentCache[code];
  if (!h || !h.name || !h.image) { skipped++; continue; }
  const key = String(h.name).trim().toLowerCase();
  if (imageIndex[key]) { skipped++; continue; }
  imageIndex[key] = h.image;
  added++;
}

console.log("Saving merged index...");
fs.writeFileSync("data/hotel-images-index.json", JSON.stringify(imageIndex));

const after = Object.keys(imageIndex).length;
console.log("");
console.log("===========================================");
console.log("MERGE COMPLETE");
console.log("Before:", before, "images");
console.log("Added:", added, "new images");
console.log("Skipped (already present):", skipped);
console.log("After:", after, "images");
console.log("New file size:", (fs.statSync("data/hotel-images-index.json").size / 1024 / 1024).toFixed(2), "MB");
console.log("===========================================");
