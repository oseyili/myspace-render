const fs = require("fs");
const p = "supplierFederation.js";
let code = fs.readFileSync(p, "utf8");
if (code.indexOf("HB-RAW-RESP") >= 0) { console.log("Already added."); process.exit(0); }
const anchor = "const hotels = Array.isArray(data?.hotels?.hotels) ? data.hotels.hotels : [];";
const idx = code.indexOf(anchor);
if (idx < 0) { console.error("Anchor not found"); process.exit(1); }
const logLine = 'console.log("[HB-RAW-RESP] HTTP OK. Body keys:", Object.keys(data || {}).join(", "));\n      console.log("[HB-RAW-RESP] hotels field:", JSON.stringify(data?.hotels).slice(0, 500));\n      ';
const result = code.slice(0, idx) + logLine + code.slice(idx);
fs.writeFileSync(p, result);
console.log("SUCCESS: response logger added");
console.log("New size:", result.length);
