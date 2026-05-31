require("dotenv").config();

const TOKEN = process.env.HYPERGUEST_AUTH_TOKEN || "";
const BOOK_BASE = (process.env.HYPERGUEST_BOOK_URL || "https://book-api.hyperguest.com/2.0/").replace(/\/$/, "");

const headers = {
  Accept: "application/json",
  "Content-Type": "application/json",
  "Accept-Encoding": "gzip, deflate",
  Authorization: `Bearer ${TOKEN}`
};

const paths = [
  "booking/prebook",
  "booking/pre-book",
  "booking/validate",
  "booking/book",
  "bookings/prebook",
  "bookings/validate",
  "bookings/book",
  "reservation/prebook",
  "reservation/book",
  "reservations/prebook",
  "reservations/book",
  "reservation",
  "book",
  "booking",
  "prebook",
  "validate",
  "check",
  "orders/create",
  "bookings/create",
  "reservation/create"
];

async function run() {
  console.log("Testing nested HyperGuest booking routes...");

  for (const p of paths) {
    const url = `${BOOK_BASE}/${p}`;

    try {
      const res = await fetch(url, {
        method: "OPTIONS",
        headers,
        signal: AbortSignal.timeout(10000)
      });

      const text = await res.text();

      console.log(`${p} => OPTIONS ${res.status} ${text.slice(0, 120)}`);
    } catch (err) {
      console.log(`${p} => ERROR ${err.message}`);
    }
  }
}

run();
