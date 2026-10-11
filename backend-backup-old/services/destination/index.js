const { clean, title } = require("../../utils/text");
function resolveCriteria(query = {}) {
  return {
    ...query,
    country: title(clean(query.country || query.countryName || "")),
    city: title(clean(query.city || query.destination || "")),
    currency: clean(query.currency || "GBP").toUpperCase(),
    checkIn: clean(query.checkIn || query.checkin || query.check_in || ""),
    checkOut: clean(query.checkOut || query.checkout || query.check_out || ""),
    guests: clean(query.guests || "2"),
    rooms: clean(query.rooms || "1"),
    propertyType: "hotel",
    accommodationMode: "hotel_only"
  };
}
module.exports = { resolveCriteria };
