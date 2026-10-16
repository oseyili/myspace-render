const fs = require("fs");
const p = "supplierFederation.js";
let code = fs.readFileSync(p, "utf8");

const oldFn = `function lookupImage(name) {
  if (!name) return null;
  return hotelImagesIndex[String(name).trim().toLowerCase()] || null;
}`;

if (code.indexOf(oldFn) < 0) {
  console.error("Old function not found");
  process.exit(1);
}

const newFn = `function lookupImage(name) {
  if (!name) return null;
  const key = String(name).trim().toLowerCase();
  if (hotelImagesIndex[key]) return hotelImagesIndex[key];

  const STOP = new Set(["the", "a", "an", "and", "of", "by", "at", "in", "on", "for", "with"]);
  const normalize = (s) => String(s || "").toLowerCase().replace(/[^a-z0-9 ]/g, " ").split(/\\s+/).filter(w => w.length > 1 && !STOP.has(w)).join(" ").trim();

  const normKey = normalize(key);
  if (!normKey) return null;

  if (!lookupImage._normIndexBuilt) {
    lookupImage._normIndex = {};
    for (const k of Object.keys(hotelImagesIndex)) {
      const nk = normalize(k);
      if (nk && !lookupImage._normIndex[nk]) lookupImage._normIndex[nk] = hotelImagesIndex[k];
    }
    lookupImage._normIndexBuilt = true;
    console.log("[Images] Built normalized index with " + Object.keys(lookupImage._normIndex).length + " entries");
  }

  if (lookupImage._normIndex[normKey]) return lookupImage._normIndex[normKey];

  const words = normKey.split(/\\s+/).filter(w => w.length > 3);
  if (words.length < 2) return null;

  let best = null;
  let bestScore = 0;
  for (const k of Object.keys(lookupImage._normIndex)) {
    const kw = k.split(/\\s+/);
    let score = 0;
    for (const w of words) { if (kw.includes(w)) score++; }
    if (score >= 2 && score > bestScore) {
      bestScore = score;
      best = lookupImage._normIndex[k];
      if (score === words.length) break;
    }
  }
  return best;
}`;

code = code.replace(oldFn, newFn);
fs.writeFileSync(p, code);
console.log("SUCCESS: fuzzy lookupImage installed");
console.log("New size:", code.length);
