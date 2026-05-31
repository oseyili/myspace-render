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

async function getWorkingRate() {
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
  const result = json.results?.[0];
  const room = result?.rooms?.[0];
  const ratePlan = room?.ratePlans?.[0];

  return { result, room, ratePlan };
}

function makePayload(result, room, ratePlan) {
  return {
    propertyId: result.propertyId,
    hotelId: result.propertyId,
    checkIn,
    nights: 1,
    guests: "1",
    currency: "USD",
    nationality: "GB",
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
      lastName: "TestOne",
      email: "reservations@myspace-hotel.com",
      phone: "+447707836674",
      nationality: "GB"
    },
    specialRequests: "HyperGuest certification test booking. Please ignore operationally."
  };
}

async function postTest(pathName, url, payload) {
  try {
    const res = await fetch(url, {
      method: "POST",
      headers,
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(300000)
    });

    const text = await res.text();

    const log = {
      pathName,
      url,
      status: res.status,
      ok: res.ok,
      request: payload,
      response: text.slice(0, 10000)
    };

    fs.writeFileSync(
      path.join(LOG_DIR, `${Date.now()}-book-path-${pathName}.json`),
      JSON.stringify(log, null, 2),
      "utf8"
    );

    console.log("====================================");
    console.log("PATH:", pathName);
    console.log("STATUS:", res.status);
    console.log("OK:", res.ok);
    console.log("RESPONSE:", text.slice(0, 1200));
  } catch (err) {
    console.log("====================================");
    console.log("PATH:", pathName);
    console.log("ERROR:", err.message);
  }
}

async function run() {
  console.log("Preparing valid search room/rate...");
  const { result, room, ratePlan } = await getWorkingRate();

  console.log("PROPERTY:", result?.propertyId);
  console.log("ROOM:", room?.roomId, room?.roomTypeCode, room?.roomName);
  console.log("RATE:", ratePlan?.ratePlanId, ratePlan?.ratePlanCode, ratePlan?.ratePlanName);

  const payload = makePayload(result, room, ratePlan);

  const paths = [
    ["base", `${BOOK_BASE}/`],
    ["prebook", `${BOOK_BASE}/prebook`],
    ["pre-book", `${BOOK_BASE}/pre-book`],
    ["booking", `${BOOK_BASE}/booking`],
    ["book", `${BOOK_BASE}/book`],
    ["reservations", `${BOOK_BASE}/reservations`],
    ["orders", `${BOOK_BASE}/orders`],
    ["validate", `${BOOK_BASE}/validate`],
    ["price-check", `${BOOK_BASE}/price-check`]
  ];

  for (const [name, url] of paths) {
    await postTest(name, url, payload);
  }
}

run().catch((err) => {
  console.error(err.message);
});
