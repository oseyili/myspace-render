require("dotenv").config();

const TOKEN = process.env.HYPERGUEST_AUTH_TOKEN || "";
const BASE_URL = (process.env.HYPERGUEST_SEARCH_URL || "https://search-api.hyperguest.io/2.0/").replace(/\/$/, "");
const PROPERTY_ID = process.env.HYPERGUEST_CERT_PROPERTY_ID || "19912";
const checkIn = new Date(Date.now() + 86400000).toISOString().slice(0, 10);

const headers = {
  Accept: "application/json",
  "Accept-Encoding": "gzip, deflate",
  Authorization: `Bearer ${TOKEN}`
};

const urls = [
  `${BASE_URL}/?hotelIds=${PROPERTY_ID}&checkIn=${checkIn}&nights=1&guests=1&currency=USD&nationality=GB`,
  `${BASE_URL}/?hotelIds=${PROPERTY_ID}&checkIn=${checkIn}&nights=1&guests=1_0&currency=USD&nationality=GB`,
  `${BASE_URL}/?hotelIds=${PROPERTY_ID}&checkIn=${checkIn}&nights=1&guests=1-0&currency=USD&nationality=GB`,
  `${BASE_URL}/?hotelIds=${PROPERTY_ID}&checkIn=${checkIn}&nights=1&guests=1,0&currency=USD&nationality=GB`,
  `${BASE_URL}/?hotelIds=${PROPERTY_ID}&checkIn=${checkIn}&nights=1&guests=${encodeURIComponent(JSON.stringify([{ adults: 1, children: [] }]))}&currency=USD&nationality=GB`,
  `${BASE_URL}/?hotelIds=${PROPERTY_ID}&checkIn=${checkIn}&nights=1&guests=${encodeURIComponent(JSON.stringify([{ adults: 1 }]))}&currency=USD&nationality=GB`
];

async function run() {
  console.log("Testing HyperGuest guests parameter format...");

  for (const url of urls) {
    try {
      const res = await fetch(url, {
        method: "GET",
        headers,
        signal: AbortSignal.timeout(30000)
      });

      const text = await res.text();

      console.log("====================================");
      console.log("URL:", url.replace(PROPERTY_ID, "PROPERTY_ID"));
      console.log("STATUS:", res.status);
      console.log("OK:", res.ok);
      console.log("RESPONSE:", text.slice(0, 1500));
    } catch (err) {
      console.log("====================================");
      console.log("ERROR:", err.message);
    }
  }
}

run();
