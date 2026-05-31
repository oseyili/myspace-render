require("dotenv").config();

const TOKEN = process.env.HYPERGUEST_AUTH_TOKEN || "";
const BASE_URL = (process.env.HYPERGUEST_SEARCH_URL || "https://search-api.hyperguest.io/2.0/").replace(/\/$/, "");
const PROPERTY_ID = process.env.HYPERGUEST_CERT_PROPERTY_ID || "19912";

const checkIn = new Date(Date.now() + 86400000).toISOString().slice(0, 10);
const checkOut = new Date(Date.now() + 2 * 86400000).toISOString().slice(0, 10);

const headers = {
  Accept: "application/json",
  "Accept-Encoding": "gzip, deflate",
  Authorization: `Bearer ${TOKEN}`
};

const urls = [
  `${BASE_URL}/?hotelIds=${PROPERTY_ID}&checkIn=${checkIn}&checkOut=${checkOut}&adults=1&currency=USD&nationality=GB`,
  `${BASE_URL}/?hotelIds[]=${PROPERTY_ID}&checkIn=${checkIn}&checkOut=${checkOut}&adults=1&currency=USD&nationality=GB`,
  `${BASE_URL}/?hotel_ids=${PROPERTY_ID}&check_in=${checkIn}&check_out=${checkOut}&adults=1&currency=USD&nationality=GB`,
  `${BASE_URL}/?hotels=${PROPERTY_ID}&checkIn=${checkIn}&checkOut=${checkOut}&adults=1&currency=USD&nationality=GB`,
  `${BASE_URL}/?hotelIds=${PROPERTY_ID}&fromDate=${checkIn}&toDate=${checkOut}&adults=1&currency=USD&nationality=GB`,
  `${BASE_URL}/?hotelIds=${PROPERTY_ID}&checkIn=${checkIn}&checkOut=${checkOut}&occupancies[0][adults]=1&currency=USD&nationality=GB`
];

async function run() {
  console.log("Testing HyperGuest search as GET/query parameters...");

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
      console.log("RESPONSE:", text.slice(0, 1000));
    } catch (err) {
      console.log("====================================");
      console.log("ERROR:", err.message);
    }
  }
}

run();
