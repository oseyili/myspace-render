require("dotenv").config();

const TOKEN = process.env.HYPERGUEST_AUTH_TOKEN || "";
const SEARCH_URL = process.env.HYPERGUEST_SEARCH_URL || "https://search-api.hyperguest.io/2.0/";
const PROPERTY_ID = process.env.HYPERGUEST_CERT_PROPERTY_ID || "19912";

const checkIn = new Date(Date.now() + 86400000).toISOString().slice(0, 10);
const checkOut = new Date(Date.now() + 2 * 86400000).toISOString().slice(0, 10);

const headers = {
  Accept: "application/json",
  "Content-Type": "application/json",
  "Accept-Encoding": "gzip, deflate",
  Authorization: `Bearer ${TOKEN}`
};

const tests = [
  {
    name: "hotelIds-string-array",
    body: { hotelIds: [PROPERTY_ID], checkIn, checkOut, occupancies: [{ adults: 1 }], currency: "USD", nationality: "GB" }
  },
  {
    name: "hotelIds-number-array-search-object",
    body: { search: { hotelIds: [Number(PROPERTY_ID)], checkIn, checkOut, occupancies: [{ adults: 1 }], currency: "USD", nationality: "GB" } }
  },
  {
    name: "hotelIds-string-array-search-object",
    body: { search: { hotelIds: [PROPERTY_ID], checkIn, checkOut, occupancies: [{ adults: 1 }], currency: "USD", nationality: "GB" } }
  },
  {
    name: "hotelIds-with-dates",
    body: { hotelIds: [PROPERTY_ID], fromDate: checkIn, toDate: checkOut, occupancies: [{ adults: 1 }], currency: "USD", nationality: "GB" }
  },
  {
    name: "hotelIds-with-rooms",
    body: { hotelIds: [PROPERTY_ID], checkIn, checkOut, rooms: [{ adults: 1 }], currency: "USD", nationality: "GB" }
  },
  {
    name: "hotelIds-with-occupancy",
    body: { hotelIds: [PROPERTY_ID], checkIn, checkOut, occupancy: [{ adults: 1 }], currency: "USD", nationality: "GB" }
  }
];

async function run() {
  console.log("Testing accepted Bearer auth with different HyperGuest payload structures...");

  for (const t of tests) {
    try {
      const res = await fetch(SEARCH_URL, {
        method: "POST",
        headers,
        body: JSON.stringify(t.body),
        signal: AbortSignal.timeout(20000)
      });

      const text = await res.text();

      console.log("====================================");
      console.log("TEST:", t.name);
      console.log("STATUS:", res.status);
      console.log("OK:", res.ok);
      console.log("RESPONSE:", text.slice(0, 1000));
    } catch (err) {
      console.log("====================================");
      console.log("TEST:", t.name);
      console.log("ERROR:", err.message);
    }
  }
}

run();
