require("dotenv").config();

const fs = require("fs");
const path = require("path");

const TOKEN = process.env.HYPERGUEST_AUTH_TOKEN || "";
const BOOK_BASE = (process.env.HYPERGUEST_BOOK_URL || "https://book-api.hyperguest.com/2.0/").replace(/\/$/, "");
const SEARCH_BASE = (process.env.HYPERGUEST_SEARCH_URL || "https://search-api.hyperguest.io/2.0/").replace(/\/$/, "");
const PROPERTY_ID = Number(process.env.HYPERGUEST_CERT_PROPERTY_ID || "19912");
const LOG_DIR = path.join(__dirname, "data", "hyperguest-certification");

if (!fs.existsSync(LOG_DIR)) fs.mkdirSync(LOG_DIR, { recursive: true });

const from = new Date(Date.now() + 86400000).toISOString().slice(0, 10);
const to = new Date(Date.now() + 2 * 86400000).toISOString().slice(0, 10);

const headers = {
  Accept: "application/json",
  "Content-Type": "application/json",
  "Accept-Encoding": "gzip, deflate",
  Authorization: `Bearer ${TOKEN}`
};

async function search() {
  const url =
    `${SEARCH_BASE}/?hotelIds=${PROPERTY_ID}` +
    `&checkIn=${from}` +
    `&nights=1` +
    `&guests=1` +
    `&currency=USD` +
    `&nationality=GB`;

  const res = await fetch(url, {
    method: "GET",
    headers,
    signal: AbortSignal.timeout(300000)
  });

  const json = await res.json();
  const result = json.results[0];
  const room = result.rooms[0];
  const ratePlan = room.ratePlans[0];

  return { result, room, ratePlan };
}

function priceObj(ratePlan) {
  const sell = ratePlan?.prices?.sell;
  const bar = ratePlan?.prices?.bar;
  const net = ratePlan?.prices?.net;
  const p = sell || bar || net || { price: 0, currency: "USD", searchCurrency: 0 };

  return {
    price: p.price,
    currency: p.currency || "USD"
  };
}

function makePayload(result, room, ratePlan, variant) {
  const p = priceObj(ratePlan);

  const base = {
    search: {
      propertyId: PROPERTY_ID,
      dates: { from, to },
      pax: [{ adults: 1, children: [] }],
      nationality: "GB",
      currency: "USD"
    },
    rooms: [
      {
        roomId: room.roomId,
        roomTypeCode: room.roomTypeCode,
        ratePlanId: ratePlan.ratePlanId,
        ratePlanCode: ratePlan.ratePlanCode
      }
    ],
    leadGuest: {
      firstName: "Certification",
      lastName: "PreBook",
      email: "reservations@myspace-hotel.com",
      phone: "+447707836674",
      nationality: "GB"
    },
    specialRequests: "HyperGuest certification pre-book test."
  };

  if (variant === "object-price-currency") {
    base.rooms[0].expectedPrice = { price: p.price, currency: p.currency };
  }

  if (variant === "object-amount-currency") {
    base.rooms[0].expectedPrice = { amount: p.price, currency: p.currency };
  }

  if (variant === "search-currency-number") {
    base.rooms[0].expectedPrice = p.price;
    base.rooms[0].expectedCurrency = p.currency;
  }

  if (variant === "full-price-object") {
    base.rooms[0].expectedPrice = {
      price: p.price,
      searchCurrency: p.price,
      currency: p.currency
    };
  }

  return base;
}

async function run() {
  const { result, room, ratePlan } = await search();

  console.log("SEARCH RATE READY");
  console.log("PROPERTY:", result.propertyId);
  console.log("ROOM:", room.roomId, room.roomTypeCode, room.roomName);
  console.log("RATE:", ratePlan.ratePlanId, ratePlan.ratePlanCode, ratePlan.ratePlanName);
  console.log("PRICE OBJECT:", JSON.stringify(priceObj(ratePlan)));

  const variants = [
    "object-price-currency",
    "object-amount-currency",
    "search-currency-number",
    "full-price-object"
  ];

  for (const variant of variants) {
    const body = makePayload(result, room, ratePlan, variant);
    const url = `${BOOK_BASE}/booking/pre-book`;

    const res = await fetch(url, {
      method: "POST",
      headers,
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(300000)
    });

    const text = await res.text();

    fs.writeFileSync(
      path.join(LOG_DIR, `pre-book-price-variant-${variant}.json`),
      JSON.stringify(
        {
          step: `pre-book-price-variant-${variant}`,
          url,
          status: res.status,
          ok: res.ok,
          request: body,
          response: text
        },
        null,
        2
      ),
      "utf8"
    );

    console.log("====================================");
    console.log("VARIANT:", variant);
    console.log("PREBOOK STATUS:", res.status);
    console.log("PREBOOK OK:", res.ok);
    console.log("PREBOOK RESPONSE:", text.slice(0, 2000));
  }
}

run().catch((err) => console.error(err.message));
