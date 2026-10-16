const fs = require("fs");
const p = "supplierFederation.js";
let code = fs.readFileSync(p, "utf8");

// Find the fetchHyperGuestInventory function and wrap its results with a mapping function
const anchor = "const results = Array.isArray(data && data.results) ? data.results : [];";
const newAnchor = `const results = Array.isArray(data && data.results) ? data.results : [];

  // Map HyperGuest shape to Hotelbeds-compatible shape
  const mapped = results.map(h => {
    const info = h.propertyInfo || {};
    const firstRoom = Array.isArray(h.rooms) && h.rooms.length ? h.rooms[0] : null;
    const minRate = firstRoom && firstRoom.rates && firstRoom.rates[0]
      ? (firstRoom.rates[0].net || firstRoom.rates[0].amount || firstRoom.rates[0].price)
      : null;
    return {
      code: h.propertyId,
      hotelId: h.propertyId,
      name: info.name,
      categoryCode: info.starRating ? info.starRating + "EST" : "",
      categoryName: info.starRating ? info.starRating + " STARS" : "",
      destinationCode: params.destinationCode || "",
      destinationName: info.cityName || "",
      zoneName: info.regionName || "",
      latitude: info.latitude,
      longitude: info.longitude,
      address: info.address || "",
      city: info.cityName || "",
      countryCode: info.countryCode || "",
      rooms: firstRoom ? [{
        roomName: firstRoom.roomTypeCode || "Available room",
        boardName: firstRoom.boardName || "",
        net: minRate,
        currency: "GBP",
        price: minRate,
        rate_source_id: "hyperguest-" + h.propertyId
      }] : [],
      minRate: minRate,
      maxRate: minRate,
      currency: "GBP"
    };
  });`;

if (code.indexOf("HyperGuest shape to Hotelbeds") >= 0) {
  console.log("Mapping already applied");
  process.exit(0);
}

if (code.indexOf(anchor) < 0) {
  console.error("Anchor not found");
  process.exit(1);
}

code = code.replace(anchor, newAnchor);

// Also change what we return: results -> mapped
code = code.replace("return results;", "return mapped;");

fs.writeFileSync(p, code);
console.log("SUCCESS: HyperGuest mapping applied");
console.log("New size:", code.length);
