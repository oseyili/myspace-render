// ============================================================
// MYSPACE HOTEL BACKEND - UNIFIED ENTRY POINT
// Loads the legacy backend (routes, suppliers, search engines)
// and starts the HTTP server.
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

// --- REGISTER FEDERATED SEARCH ROUTE ---
try {
  const federation = require("./supplierFederation");
  if (federation && typeof federation.federatedHotelSearch === "function") {
    app.post("/api/federated-search", federation.federatedHotelSearch);
    app.get("/api/federated-search", federation.federatedHotelSearch);
    console.log("[ROUTE] Registered /api/federated-search");
  } else {
    console.error("[ROUTE ERROR] federatedHotelSearch function not found.");
  }
} catch (e) {
  console.error("[ROUTE ERROR] Could not register federated search:", e.message);
}
// ----------------------------------------

const PORT = process.env.PORT || 5050;

function envBool(v) {
  return String(v || "").toLowerCase() === "true";
}

function computeBanner() {
  // Hotelbeds
  const hbApiKey = String(process.env.HOTELBEDS_API_KEY || "").trim();
  const hbSecret = String(process.env.HOTELBEDS_SECRET || "").trim();
  const hbBaseUrl = String(process.env.HOTELBEDS_BASE_URL || "").trim();
  const hbReady = Boolean(hbApiKey && hbSecret && hbBaseUrl && hbBaseUrl !== "https://");

  // WebBeds
  const wbEnabled = String(process.env.WEBBEDS_ENABLED || "true").toLowerCase() === "true";
  const wbBaseUrl = String(process.env.WEBBEDS_BASE_URL || "").trim();
  const wbUsername = String(process.env.WEBBEDS_USERNAME || process.env.WEBBEDS_USER || "").trim();
  const wbPassword = String(process.env.WEBBEDS_PASSWORD || process.env.WEBBEDS_PASS || "").trim();
  const wbCompanyId = String(process.env.WEBBEDS_COMPANY_ID || process.env.WEBBEDS_COMPANY_CODE || "").trim();
  const wbReady = Boolean(wbEnabled && wbBaseUrl && wbUsername && wbPassword && wbCompanyId);

  // RateHawk
  const rhEnabled = envBool(process.env.RATEHAWK_ENABLED) || Boolean(
    (process.env.RATEHAWK_KEY_ID || process.env.RATEHAWK_API_KEY) &&
    (process.env.RATEHAWK_KEY_TOKEN || process.env.RATEHAWK_API_TOKEN)
  );
  const rhBaseUrl = String(process.env.RATEHAWK_BASE_URL || "").trim();
  const rhKeyId = String(process.env.RATEHAWK_KEY_ID || "").trim();
  const rhKeyToken = String(process.env.RATEHAWK_KEY_TOKEN || process.env.RATEHAWK_API_TOKEN || "").trim();
  const rhReady = Boolean(rhEnabled && rhBaseUrl && rhKeyId && rhKeyToken);

  // HyperGuest
  const hgUrl = String(process.env.HYPERGUEST_SEARCH_URL || process.env.HYPERGUEST_AVAILABILITY_URL || "").trim();
  const hgToken = String(process.env.HYPERGUEST_API_KEY || process.env.HYPERGUEST_TOKEN || process.env.HYPERGUEST_AUTH_TOKEN || "").trim();
  const hgReady = Boolean(hgUrl && hgToken && !hgUrl.includes("${") && !hgToken.includes("${"));

  return {
    hotelbeds: { ready: hbReady, apiKeyLen: hbApiKey.length, secretLen: hbSecret.length, baseUrl: hbBaseUrl },
    webbeds: { ready: wbReady, username: wbUsername, companyId: wbCompanyId, baseUrl: wbBaseUrl },
    ratehawk: { ready: rhReady, keyId: rhKeyId, hasToken: Boolean(rhKeyToken), baseUrl: rhBaseUrl },
    hyperguest: { ready: hgReady, hasUrl: Boolean(hgUrl), hasToken: Boolean(hgToken) }
  };
}

const server = app.listen(PORT, "0.0.0.0", () => {
  const b = computeBanner();

  console.log("====================================");
  console.log("MYSPACE HOTEL BACKEND STARTED");
  console.log("Time:", new Date().toISOString());
  console.log("PORT:", PORT);
  console.log("LEGACY ENTRY:", `legacy/${legacy.name}`);

  console.log("HOTELBEDS:", b.hotelbeds.ready ? "READY" : "NOT CONFIGURED");
  if (!b.hotelbeds.ready) {
    console.log(`  -> apiKeyLen=${b.hotelbeds.apiKeyLen} secretLen=${b.hotelbeds.secretLen} baseUrl="${b.hotelbeds.baseUrl}"`);
  }

  console.log("WEBBEDS:", b.webbeds.ready ? "READY" : "NOT CONFIGURED");
  if (!b.webbeds.ready) {
    console.log(`  -> username="${b.webbeds.username}" companyId="${b.webbeds.companyId}" baseUrl="${b.webbeds.baseUrl}"`);
  }

  console.log("RATEHAWK:", b.ratehawk.ready ? "READY" : "NOT CONFIGURED");
  if (!b.ratehawk.ready) {
    console.log(`  -> keyId="${b.ratehawk.keyId}" hasToken=${b.ratehawk.hasToken} baseUrl="${b.ratehawk.baseUrl}"`);
  }

  console.log("HYPERGUEST:", b.hyperguest.ready ? "READY" : "NOT CONFIGURED");
  if (!b.hyperguest.ready) {
    console.log(`  -> hasUrl=${b.hyperguest.hasUrl} hasToken=${b.hyperguest.hasToken}`);
  }

  console.log("STRIPE:", process.env.STRIPE_SECRET_KEY ? "READY" : "NOT CONFIGURED");
  console.log("MAIL:", process.env.RESEND_API_KEY || process.env.SMTP_HOST ? "READY" : "NOT CONFIGURED");
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