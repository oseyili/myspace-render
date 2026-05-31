require("dotenv").config();

const TOKEN = process.env.HYPERGUEST_AUTH_TOKEN || "";
const BOOK_BASE = (process.env.HYPERGUEST_BOOK_URL || "https://book-api.hyperguest.com/2.0/").replace(/\/$/, "");
const SEARCH_BASE = (process.env.HYPERGUEST_SEARCH_URL || "https://search-api.hyperguest.io/2.0/").replace(/\/$/, "");
const PROPERTY_ID = process.env.HYPERGUEST_CERT_PROPERTY_ID || "19912";

const checkIn = new Date(Date.now() + 86400000).toISOString().slice(0, 10);

const headers = {
  Accept: "application/json",
  "Content-Type": "application/json",
  "Accept-Encoding": "gzip, deflate",
  Authorization: `Bearer ${TOKEN}`
};

async function getRate() {
  const url = `${SEARCH_BASE}/?hotelIds=${PROPERTY_ID}&checkIn=${checkIn}&nights=1&guests=1&currency=USD&nationality=GB`;
  const res = await fetch(url, { headers, signal: AbortSignal.timeout(30000) });
  const json = await res.json();
  const result = json.results[0];
  const room = result.rooms[0];
  const ratePlan = room.ratePlans[0];
  return { result, room, ratePlan };
}

function payload(result, room, ratePlan) {
  return {
    hotelId: result.propertyId,
    propertyId: result.propertyId,
    checkIn,
    nights: 1,
    guests: "1",
    currency: "USD",
    nationality: "GB",
    roomId: room.roomId,
    roomTypeCode: room.roomTypeCode,
    ratePlanId: ratePlan.ratePlanId,
    ratePlanCode: ratePlan.ratePlanCode,
    leadGuest: {
      firstName: "Certification",
      lastName: "Test",
      email: "reservations@myspace-hotel.com",
      phone: "+447707836674"
    }
  };
}

async function test(name, url, body) {
  try {
    const res = await fetch(url, {
      method: "POST",
      headers,
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(20000)
    });

    const text = await res.text();

    console.log("====================================");
    console.log("PATH:", name);
    console.log("STATUS:", res.status);
    console.log("OK:", res.ok);
    console.log("RESPONSE:", text.slice(0, 700));
  } catch (err) {
    console.log("====================================");
    console.log("PATH:", name);
    console.log("ERROR:", err.message);
  }
}

async function run() {
  const { result, room, ratePlan } = await getRate();

  console.log("ROOM:", room.roomId, room.roomTypeCode);
  console.log("RATE:", ratePlan.ratePlanId, ratePlan.ratePlanCode);

  const body = payload(result, room, ratePlan);

  const paths = [
    ["pre-bookings", `${BOOK_BASE}/pre-bookings`],
    ["prebooking", `${BOOK_BASE}/prebooking`],
    ["pre-booking", `${BOOK_BASE}/pre-booking`],
    ["prebook", `${BOOK_BASE}/prebook`],
    ["pre-book", `${BOOK_BASE}/pre-book`],
    ["validate", `${BOOK_BASE}/validate`],
    ["rate-check", `${BOOK_BASE}/rate-check`],
    ["price-check", `${BOOK_BASE}/price-check`],
    ["bookings", `${BOOK_BASE}/bookings`],
    ["booking", `${BOOK_BASE}/booking`],
    ["reservations", `${BOOK_BASE}/reservations`],
    ["orders", `${BOOK_BASE}/orders`],
    ["carts", `${BOOK_BASE}/carts`]
  ];

  for (const [name, url] of paths) {
    await test(name, url, body);
  }
}

run();
