const { suppliers } = require("./supplier-config");

function enabledSuppliers() {
  return suppliers
    .filter((supplier) => supplier.enabled)
    .sort((a, b) => a.priority - b.priority);
}

function supplierStatus() {
  return suppliers.map((supplier) => ({
    id: supplier.id,
    name: supplier.name,
    enabled: supplier.enabled,
    type: supplier.type,
    priority: supplier.priority
  }));
}

function normalizeSupplierRate(input) {
  return {
    supplier_id: input.supplier_id || "",
    hotel_code: input.hotel_code || "",
    hotel_name: input.hotel_name || "",
    country: input.country || "",
    city: input.city || "",
    destination_code: input.destination_code || "",
    latitude: input.latitude || "",
    longitude: input.longitude || "",
    image_url: input.image_url || "",
    room_code: input.room_code || "",
    room_name: input.room_name || "Selected room",
    board_code: input.board_code || "",
    board_name: input.board_name || "Room only",
    rate_key: input.rate_key || "",
    rate_type: input.rate_type || "",
    payment_type: input.payment_type || "",
    net: input.net || input.amount || "",
    selling_rate: input.selling_rate || input.net || input.amount || "",
    currency: input.currency || "GBP",
    cancellation_policies: input.cancellation_policies || "[]",
    checkin: input.checkin || "",
    checkout: input.checkout || "",
    guests: Number(input.guests || 2),
    rooms: Number(input.rooms || 1),
    live_rate_ready: true,
    created_at: new Date().toISOString()
  };
}

function rateKey(rate) {
  return [
    rate.supplier_id,
    rate.hotel_code,
    rate.rate_key,
    rate.checkin,
    rate.checkout,
    rate.guests,
    rate.rooms
  ].join("|");
}

function mergeSupplierRates(existingRates, newRates) {
  const map = new Map();

  for (const rate of existingRates || []) {
    const normalized = normalizeSupplierRate(rate);
    const key = rateKey(normalized);
    if (key) map.set(key, normalized);
  }

  for (const rate of newRates || []) {
    const normalized = normalizeSupplierRate(rate);
    const key = rateKey(normalized);
    if (key) map.set(key, normalized);
  }

  return [...map.values()];
}

module.exports = {
  enabledSuppliers,
  supplierStatus,
  normalizeSupplierRate,
  mergeSupplierRates
};
