function imageForHotel(hotel) { return hotel.image || (Array.isArray(hotel.images) ? hotel.images[0] : "") || ""; }
module.exports = { imageForHotel };
