// Hotelbeds kill switch disabled — Hotelbeds is now an active supplier.
function blockHotelbedsSupplier() {
  return false;
}

function removeHotelbedsFromText(value) {
  return value;
}

function filterHotelbedsHotels(hotels) {
  return Array.isArray(hotels) ? hotels : [];
}

function activeSupplierOnlyHotel(h) {
  return h || null;
}

module.exports = {
  blockHotelbedsSupplier,
  filterHotelbedsHotels,
  activeSupplierOnlyHotel
};