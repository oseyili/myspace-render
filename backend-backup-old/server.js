// ============================================================
// MYSPACE HOTEL BACKEND — UNIFIED ENTRY POINT
// Loads the legacy backend (routes, suppliers, search engines)
// and starts the HTTP server. No shim, no bypass.
// ============================================================

const path = require("path");
const fs = require("fs");

try {
  require("dotenv").config({ path: path.join(__dirname, ".env") });
} catch {}

const LEGACY_DIR = path.join(__dirname, "legacy");

function findLegacyEntry() {
  if (!fs.existsSync(LEGACY_DIR)) {
    console.error("[FATAL] legacy/ folder not found next to server.js");
    process.exit(1);
  }

  const candidates = fs
    .readdirSync(LEGACY_DIR)
    .filter((f) => f.endsWith(".js"))
    .map((f) => ({
      name: f,
      full: path.join(LEGACY_DIR, f),
      size: fs.statSync(path.join(LEGACY_DIR, f)).size,
    }))
    .sort((a, b) => b.size - a.size);

  if (!candidates.length) {
    console.error("[FATAL] No .js files inside legacy/");
    process.exit(1);
  }

  return candidates[0];
}

const legacy = findLegacyEntry();
console.log(`[BOOTSTRAP] Loading legacy backend: legacy/${legacy.name} (${legacy.size} bytes)`);

let legacyModule;
try {
  legacyModule = require(legacy.full);
} catch (err) {
  console.error("[FATAL] Failed to load legacy backend:");
  console.error(err && err.stack ? err.stack : err);
  process.exit(1);
}

const app =
  legacyModule && legacyModule.app
    ? legacyModule.app
    : typeof legacyModule === "function"
    ? legacyModule
    : null;

if (!app || typeof app.listen !== "function") {
  console.error("[FATAL] Legacy backend did not export an Express app.");
  console.error("        Expected: module.exports = { app }  OR  module.exports = app");
  process.exit(1);
}

const PORT = process.env.PORT || 5050;

const server = app.listen(PORT, "0.0.0.0", () => {
  let hb = { ready: false };
  let wb = { ready: false };
  try {
    if (typeof global.hotelbedsConfig === "function") hb = global.hotelbedsConfig();
    else if (typeof app.locals?.hotelbedsConfig === "function") hb = app.locals.hotelbedsConfig();
  } catch {}
  try {
    if (typeof global.webbedsConfig === "function") wb = global.webbedsConfig();
    else if (typeof app.locals?.webbedsConfig === "function") wb = app.locals.webbedsConfig();
  } catch {}

  console.log("====================================");
  console.log("MYSPACE HOTEL BACKEND STARTED");
  console.log("Time:", new Date().toISOString());
  console.log("PORT:", PORT);
  console.log("LEGACY ENTRY:", `legacy/${legacy.name}`);
  console.log("HOTELBEDS:", hb && hb.ready ? "READY" : "NOT CONFIGURED");
  console.log("WEBBEDS:", wb && wb.ready ? "READY" : "NOT CONFIGURED");
  console.log("RATEHAWK:", process.env.RATEHAWK_ENABLED === "true" ? "READY" : "NOT CONFIGURED");
  console.log("HYPERGUEST:", (process.env.HYPERGUEST_API_KEY || process.env.HYPERGUEST_TOKEN) ? "READY" : "NOT CONFIGURED");
  console.log("STRIPE:", process.env.STRIPE_SECRET_KEY ? "READY" : "NOT CONFIGURED");
  console.log("MAIL:", (process.env.RESEND_API_KEY || process.env.SMTP_HOST) ? "READY" : "NOT CONFIGURED");
  console.log("====================================");
});

server.on("error", (err) => {
  console.error("[FATAL] Server error:", err && err.stack ? err.stack : err);
  process.exit(1);
});

setTimeout(() => {
  if (!server.listening) {
    console.error("[FATAL] Server did not start listening within 10 seconds.");
    process.exit(1);
  }
}, 10000);