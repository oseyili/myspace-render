require("dotenv").config();

const fs = require("fs");
const path = require("path");

const TOKEN = process.env.HYPERGUEST_AUTH_TOKEN || "";
const BOOK_BASE = (process.env.HYPERGUEST_BOOK_URL || "https://book-api.hyperguest.com/2.0/").replace(/\/$/, "");
const SEARCH_BASE = (process.env.HYPERGUEST_SEARCH_URL || "https://search-api.hyperguest.io/2.0/").replace(/\/$/, "");
const PROPERTY_ID = process.env.HYPERGUEST_CERT_PROPERTY_ID || "19912";
const LOG_DIR = path.join(__dirname, "data", "hyperguest-certification");

if (!fs.existsSync(LOG_DIR)) fs.mkdirSync(LOG_DIR, { recursive: true });

const checkIn = new Date(Date.now() + 86400000).toISOString().slice(0, 10);

const headers = {
  Accept: "application/json",
  "Content-Type": "application/json",
  "Accept-Encoding": "gzip, deflate",
  Authorization: `Bearer ${TOKEN}`
};

async function search() {
  const url =
    `${SEARCH_BASE}/?hotelIds=${PROPERTY_ID}` +
    `&checkIn=${checkIn}` +
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

function payload(result, room, ratePlan) {
  return {
    search: {
      hotelIds: [Number(PROPERTY_ID)],
      checkIn,
      nights: 1,
      guests: "1",
      currency: "USD",
      nationality: "GB"
    },
    rooms: [
      {
        roomId: room.roomId,
        roomTypeCode: room.roomTypeCode,
        roomName: room.roomName,
        ratePlanId: ratePlan.ratePlanId,
        ratePlanCode: ratePlan.ratePlanCode,
        ratePlanName: ratePlan.ratePlanName,
        board: ratePlan.board
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
}

async function run() {
  const { result, room, ratePlan } = await search();

  console.log("SEARCH RATE READY");
  console.log("PROPERTY:", result.propertyId);
  console.log("ROOM:", room.roomId, room.roomTypeCode, room.roomName);
  console.log("RATE:", ratePlan.ratePlanId, ratePlan.ratePlanCode, ratePlan.ratePlanName);

  const body = payload(result, room, ratePlan);
  const url = `${BOOK_BASE}/booking/pre-book`;

  const res = await fetch(url, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(300000)
  });

  const text = await res.text();

  fs.writeFileSync(
    path.join(LOG_DIR, "pre-book-test-1-wrapped.json"),
    JSON.stringify(
      {
        step: "pre-book-test-1-wrapped",
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

  console.log("PREBOOK STATUS:", res.status);
  console.log("PREBOOK OK:", res.ok);
  console.log("PREBOOK RESPONSE:", text.slice(0, 3000));
}

run().catch((err) => console.error(err.message));
