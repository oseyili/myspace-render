require("dotenv").config();

const TOKEN = process.env.HYPERGUEST_AUTH_TOKEN || "";
const SEARCH_URL = process.env.HYPERGUEST_SEARCH_URL || "https://search-api.hyperguest.io/2.0/";
const PROPERTY_ID = process.env.HYPERGUEST_CERT_PROPERTY_ID || "19912";

const body = {
  hotels: [Number(PROPERTY_ID)],
  checkIn: new Date(Date.now() + 86400000).toISOString().slice(0, 10),
  checkOut: new Date(Date.now() + 2 * 86400000).toISOString().slice(0, 10),
  occupancies: [{ adults: 1, children: [] }],
  currency: "USD",
  nationality: "GB"
};

const variants = [
  ["Authorization", TOKEN],
  ["Authorization", `Token ${TOKEN}`],
  ["Authorization", `Bearer ${TOKEN}`],
  ["X-Auth-Token", TOKEN],
  ["x-auth-token", TOKEN],
  ["X-Authorization", TOKEN],
  ["X-HG-Token", TOKEN],
  ["HG-Token", TOKEN],
  ["token", TOKEN],
  ["Token", TOKEN],
  ["api-key", TOKEN],
  ["apikey", TOKEN],
  ["x-api-key", TOKEN],
  ["X-API-Key", TOKEN]
];

async function run() {
  console.log("Token loaded:", Boolean(TOKEN));
  console.log("Testing HyperGuest header names...");

  for (const [name, value] of variants) {
    const headers = {
      Accept: "application/json",
      "Content-Type": "application/json",
      "Accept-Encoding": "gzip, deflate",
      [name]: value
    };

    try {
      const res = await fetch(SEARCH_URL, {
        method: "POST",
        headers,
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(300000)
      });

      const text = await res.text();

      console.log(`${name} => ${res.status} ${res.ok ? "PASS" : "FAIL"} ${text.slice(0, 120)}`);
    } catch (e) {
      console.log(`${name} => ERROR ${e.message}`);
    }
  }
}

run();
