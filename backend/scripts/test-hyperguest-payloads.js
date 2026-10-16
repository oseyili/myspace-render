require("dotenv").config();
const TOKEN = String(process.env.HYPERGUEST_AUTH_TOKEN || "").trim();
const IDS = [17913, 17914, 17915];

async function test(name, body) {
  try {
    const res = await fetch("https://search-api.hyperguest.io/2.0/", {
      method: "POST",
      headers: {
        "Authorization": "Bearer " + TOKEN,
        "Content-Type": "application/json",
        "Accept-Encoding": "gzip, deflate"
      },
      body: JSON.stringify(body)
    });
    const text = await res.text();
    console.log("---", name, "---");
    console.log("STATUS:", res.status);
    console.log("BODY:", text.slice(0, 400));
    console.log("");
  } catch (e) {
    console.error(name, "ERR:", e.message);
  }
}

(async () => {
  await test("Test 1 - hotelIds top level", {
    hotelIds: IDS,
    checkIn: "2026-10-22", checkOut: "2026-10-23",
    guests: [{ adults: 2, children: 0 }], currency: "GBP"
  });
  await test("Test 2 - hotels array", {
    hotels: IDS,
    checkIn: "2026-10-22", checkOut: "2026-10-23",
    guests: [{ adults: 2, children: 0 }], currency: "GBP"
  });
  await test("Test 3 - criteria wrapper", {
    criteria: {
      hotelIds: IDS, checkIn: "2026-10-22", checkOut: "2026-10-23",
      guests: [{ adults: 2, children: 0 }], currency: "GBP"
    }
  });
  await test("Test 4 - stay wrapper", {
    stay: {
      checkIn: "2026-10-22", checkOut: "2026-10-23",
      guests: [{ adults: 2, children: 0 }]
    },
    hotels: IDS, currency: "GBP"
  });
  await test("Test 5 - criteria flat", {
    criteria: {
      hotelIds: IDS, checkIn: "2026-10-22", checkOut: "2026-10-23",
      adults: 2, children: 0, currency: "GBP"
    }
  });
  await test("Test 6 - minimal", {
    hotelIds: IDS
  });
  await test("Test 7 - hotel_list", {
    hotel_list: IDS, check_in: "2026-10-22", check_out: "2026-10-23",
    adults: 2, children: 0, currency: "GBP"
  });
  await test("Test 8 - properties array", {
    properties: IDS, checkIn: "2026-10-22", checkOut: "2026-10-23",
    guests: [{ adults: 2, children: 0 }], currency: "GBP"
  });
  await test("Test 9 - propertyIds", {
    propertyIds: IDS, checkIn: "2026-10-22", checkOut: "2026-10-23",
    guests: [{ adults: 2, children: 0 }], currency: "GBP"
  });
  await test("Test 10 - hotelCodes", {
    hotelCodes: IDS, checkIn: "2026-10-22", checkOut: "2026-10-23",
    guests: [{ adults: 2, children: 0 }], currency: "GBP"
  });
})();
