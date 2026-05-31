require("dotenv").config();

const fs = require("fs");
const path = require("path");

const TOKEN = process.env.HYPERGUEST_AUTH_TOKEN || "";
const BASE_URL = (process.env.HYPERGUEST_SEARCH_URL || "https://search-api.hyperguest.io/2.0/").replace(/\/$/, "");
const PROPERTY_ID = process.env.HYPERGUEST_CERT_PROPERTY_ID || "19912";

const DATA_DIR = path.join(__dirname, "data");
const LOG_DIR = path.join(DATA_DIR, "hyperguest-certification");

if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
if (!fs.existsSync(LOG_DIR)) fs.mkdirSync(LOG_DIR, { recursive: true });

const checkIn = new Date(Date.now() + 86400000).toISOString().slice(0, 10);

const url =
  `${BASE_URL}/?hotelIds=${PROPERTY_ID}` +
  `&checkIn=${checkIn}` +
  `&nights=1` +
  `&guests=1` +
  `&currency=USD` +
  `&nationality=GB`;

async function run() {
  const res = await fetch(url, {
    method: "GET",
    headers: {
      Accept: "application/json",
      "Accept-Encoding": "gzip, deflate",
      Authorization: `Bearer ${TOKEN}`
    },
    signal: AbortSignal.timeout(300000)
  });

  const text = await res.text();

  const file = path.join(LOG_DIR, "working-search-response-test-1.json");

  let parsed = null;
  try {
    parsed = JSON.parse(text);
  } catch {
    parsed = { raw: text };
  }

  fs.writeFileSync(
    file,
    JSON.stringify(
      {
        ok: res.ok,
        status: res.status,
        request: {
          method: "GET",
          url: url.replace(PROPERTY_ID, "PROPERTY_ID"),
          headers: {
            Accept: "application/json",
            "Accept-Encoding": "gzip, deflate",
            Authorization: "REDACTED"
          }
        },
        response: parsed
      },
      null,
      2
    ),
    "utf8"
  );

  console.log("STATUS:", res.status);
  console.log("OK:", res.ok);
  console.log("SAVED:", file);

  const preview = text.slice(0, 3000);
  console.log("PREVIEW:");
  console.log(preview);
}

run().catch((err) => {
  console.error(err.message);
});
