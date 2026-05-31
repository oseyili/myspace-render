require("dotenv").config();

const fs = require("fs");
const path = require("path");

const DATA_DIR = path.join(__dirname, "data");
const LOG_DIR = path.join(DATA_DIR, "hyperguest-certification");

if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
if (!fs.existsSync(LOG_DIR)) fs.mkdirSync(LOG_DIR, { recursive: true });

const TOKEN = process.env.HYPERGUEST_AUTH_TOKEN;
const USER = process.env.HYPERGUEST_USER || "developer";
const PASSWORD = process.env.HYPERGUEST_PASSWORD || "";
const STATIC_URL = process.env.HYPERGUEST_STATIC_URL || "https://hg-static.hyperguest.com/hotels.json";
const SEARCH_URL = process.env.HYPERGUEST_SEARCH_URL || "https://search-api.hyperguest.io/2.0/";
const PROPERTY_ID = process.env.HYPERGUEST_CERT_PROPERTY_ID || "19912";

function saveLog(name, data) {
  fs.writeFileSync(
    path.join(LOG_DIR, `${Date.now()}-${name}.json`),
    JSON.stringify(data, null, 2),
    "utf8"
  );
}

function headers() {
  const h = {
    Accept: "application/json",
    "Content-Type": "application/json",
    "Accept-Encoding": "gzip, deflate"
  };

  if (TOKEN) h.Authorization = `Bearer ${TOKEN}`;

  if (USER && PASSWORD) {
    h.Authorization = `Basic ${Buffer.from(`${USER}:${PASSWORD}`).toString("base64")}`;
    h["x-auth-token"] = TOKEN;
  }

  return h;
}

function safeHeaders(h) {
  const copy = { ...h };
  if (copy.Authorization) copy.Authorization = "REDACTED";
  if (copy["x-auth-token"]) copy["x-auth-token"] = "REDACTED";
  return copy;
}

async function run() {
  console.log("HyperGuest certification check starting...");
  console.log("Token loaded:", Boolean(TOKEN));
  console.log("User loaded:", Boolean(USER));
  console.log("Password loaded:", Boolean(PASSWORD));
  console.log("Property:", PROPERTY_ID);

  const staticResult = await fetch(STATIC_URL, {
    method: "GET",
    headers: headers()
  });

  const staticText = await staticResult.text();
  const propertyFound = staticText.includes(PROPERTY_ID);

  saveLog("static-property-check", {
    step: "static-property-check",
    url: STATIC_URL,
    status: staticResult.status,
    ok: staticResult.ok,
    propertyId: PROPERTY_ID,
    propertyFound,
    requestHeaders: safeHeaders(headers()),
    sample: staticText.slice(0, 2000)
  });

  console.log("Static endpoint status:", staticResult.status);
  console.log("Property 19912 found:", propertyFound);

  const tomorrow = new Date(Date.now() + 86400000).toISOString().slice(0, 10);
  const dayAfter = new Date(Date.now() + 2 * 86400000).toISOString().slice(0, 10);

  const searchPayload = {
    propertyId: Number(PROPERTY_ID),
    hotelIds: [Number(PROPERTY_ID)],
    checkIn: tomorrow,
    checkOut: dayAfter,
    currency: "USD",
    nationality: "GB",
    rooms: [
      {
        adults: 1,
        children: []
      }
    ]
  };

  const searchResult = await fetch(SEARCH_URL, {
    method: "POST",
    headers: headers(),
    body: JSON.stringify(searchPayload),
    signal: AbortSignal.timeout(300000)
  });

  const searchText = await searchResult.text();

  saveLog("search-test-1", {
    step: "search-test-1",
    url: SEARCH_URL,
    status: searchResult.status,
    ok: searchResult.ok,
    requestHeaders: safeHeaders(headers()),
    requestBody: searchPayload,
    responseText: searchText.slice(0, 10000)
  });

  console.log("Search endpoint status:", searchResult.status);
  console.log("Search ok:", searchResult.ok);
  console.log("Logs saved to:", LOG_DIR);

  if (!staticResult.ok || !propertyFound || !searchResult.ok) {
    console.log("RESULT: NEEDS REVIEW");
  } else {
    console.log("RESULT: FIRST CHECK PASSED");
  }
}

run().catch((err) => {
  console.error("HyperGuest check failed:", err.message);
});
