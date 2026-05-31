require("dotenv").config();

const TOKEN = process.env.HYPERGUEST_AUTH_TOKEN || "";
const SEARCH_URL = process.env.HYPERGUEST_SEARCH_URL || "https://search-api.hyperguest.io/2.0/";
const PROPERTY_ID = Number(process.env.HYPERGUEST_CERT_PROPERTY_ID || "19912");

const checkIn = new Date(Date.now() + 86400000).toISOString().slice(0, 10);
const checkOut = new Date(Date.now() + 2 * 86400000).toISOString().slice(0, 10);

const headers = {
  Accept: "application/json",
  "Content-Type": "application/json",
  "Accept-Encoding": "gzip, deflate",
  Authorization: `Bearer ${TOKEN}`
};

const payloads = [
  {
    name: "hotelIds",
    body: {
      hotelIds: [PROPERTY_ID],
      checkIn,
      checkOut,
      currency: "USD",
      nationality: "GB",
      rooms: [{ adults: 1, children: [] }]
    }
  },
  {
    name: "hotels",
    body: {
      hotels: [PROPERTY_ID],
      checkIn,
      checkOut,
      currency: "USD",
      nationality: "GB",
      rooms: [{ adults: 1, children: [] }]
    }
  },
  {
    name: "hotel_ids",
    body: {
      hotel_ids: [PROPERTY_ID],
      check_in: checkIn,
      check_out: checkOut,
      currency: "USD",
      nationality: "GB",
      rooms: [{ adults: 1, children: [] }]
    }
  },
  {
    name: "hotelList",
    body: {
      hotelList: [PROPERTY_ID],
      checkIn,
      checkOut,
      currency: "USD",
      nationality: "GB",
      rooms: [{ adults: 1, children: [] }]
    }
  },
  {
    name: "hotel_list",
    body: {
      hotel_list: [PROPERTY_ID],
      check_in: checkIn,
      check_out: checkOut,
      currency: "USD",
      nationality: "GB",
      rooms: [{ adults: 1, children: [] }]
    }
  },
  {
    name: "hotelCodes",
    body: {
      hotelCodes: [PROPERTY_ID],
      checkIn,
      checkOut,
      currency: "USD",
      nationality: "GB",
      rooms: [{ adults: 1, children: [] }]
    }
  },
  {
    name: "hotel_codes",
    body: {
      hotel_codes: [PROPERTY_ID],
      check_in: checkIn,
      check_out: checkOut,
      currency: "USD",
      nationality: "GB",
      rooms: [{ adults: 1, children: [] }]
    }
  },
  {
    name: "propertyIds",
    body: {
      propertyIds: [PROPERTY_ID],
      checkIn,
      checkOut,
      currency: "USD",
      nationality: "GB",
      rooms: [{ adults: 1, children: [] }]
    }
  },
  {
    name: "properties",
    body: {
      properties: [PROPERTY_ID],
      checkIn,
      checkOut,
      currency: "USD",
      nationality: "GB",
      rooms: [{ adults: 1, children: [] }]
    }
  }
];

async function run() {
  console.log("Testing HyperGuest payload names using confirmed Bearer auth...");

  for (const p of payloads) {
    try {
      const res = await fetch(SEARCH_URL, {
        method: "POST",
        headers,
        body: JSON.stringify(p.body),
        signal: AbortSignal.timeout(300000)
      });

      const text = await res.text();

      console.log("====================================");
      console.log("PAYLOAD:", p.name);
      console.log("STATUS:", res.status);
      console.log("OK:", res.ok);
      console.log("RESPONSE:", text.slice(0, 700));
    } catch (err) {
      console.log("====================================");
      console.log("PAYLOAD:", p.name);
      console.log("ERROR:", err.message);
    }
  }
}

run();
