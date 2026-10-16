const fs = require("fs");
const p = "backend/server.js";
let code = fs.readFileSync(p, "utf8");

// Find our current try block
const marker = "// --- REGISTER FEDERATED SEARCH ROUTE ---";
const idx = code.indexOf(marker);
if (idx < 0) {
  console.error("Marker not found");
  process.exit(1);
}

// Find the end of the try/catch block
const endMarker = "// ---";
const endIdx = code.indexOf(endMarker, idx + marker.length);
if (endIdx < 0) {
  console.error("End marker not found");
  process.exit(1);
}

const newBlock = `// --- REGISTER FEDERATED SEARCH ROUTE ---
console.log(">>> FEDERATION: Entering registration block");
try {
  console.log(">>> FEDERATION: About to require ./supplierFederation");
  const federation = require("./supplierFederation");
  console.log(">>> FEDERATION: Required OK. Keys:", Object.keys(federation || {}).join(", "));
  console.log(">>> FEDERATION: federatedHotelSearch type:", typeof federation.federatedHotelSearch);
  if (federation && typeof federation.federatedHotelSearch === "function") {
    console.log(">>> FEDERATION: Registering POST /api/federated-search");
    app.post("/api/federated-search", federation.federatedHotelSearch);
    console.log(">>> FEDERATION: Registering GET /api/federated-search");
    app.get("/api/federated-search", federation.federatedHotelSearch);
    console.log("[ROUTE] Registered /api/federated-search");
  } else {
    console.error("[ROUTE ERROR] federatedHotelSearch function not found.");
    console.error("[ROUTE ERROR] federation is:", typeof federation);
    console.error("[ROUTE ERROR] federation.federatedHotelSearch is:", typeof (federation || {}).federatedHotelSearch);
  }
} catch (e) {
  console.error("============================================");
  console.error("[ROUTE ERROR] FEDERATED SEARCH FAILED");
  console.error("[ROUTE ERROR] Message:", e.message);
  console.error("[ROUTE ERROR] Name:", e.name);
  console.error("[ROUTE ERROR] Stack:", e.stack);
  console.error("============================================");
}
`;

code = code.slice(0, idx) + newBlock + code.slice(endIdx);
fs.writeFileSync(p, code);
console.log("SUCCESS: verbose federation logging added");
console.log("New size:", fs.statSync(p).size);
