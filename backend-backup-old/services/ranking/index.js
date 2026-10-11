const { norm } = require("../../utils/text");
const { priceOf } = require("../../models/universalHotel");
function dedupeAndRank(hotels) {
  const seen = new Map();
  for (const h of Array.isArray(hotels) ? hotels : []) {
    if (!h || !h.name) continue;
    const key = h.universalHotelId || norm(`${h.name}|${h.city}|${h.country}`);
    const existing = seen.get(key);
    if (!existing) { seen.set(key, h); continue; }
    const ep = priceOf(existing), hp = priceOf(h);
    if ((hp > 0 && ep <= 0) || (hp > 0 && ep > 0 && hp < ep)) {
      seen.set(key, { ...existing, ...h, supplierAlternatives: [existing, ...(existing.supplierAlternatives || [])].slice(0, 5) });
    } else {
      existing.supplierAlternatives = [h, ...(existing.supplierAlternatives || [])].slice(0, 5);
    }
  }
  return Array.from(seen.values()).sort((a, b) => {
    const ap = priceOf(a), bp = priceOf(b);
    if (ap > 0 && bp <= 0) return -1;
    if (bp > 0 && ap <= 0) return 1;
    if (ap > 0 && bp > 0 && ap !== bp) return ap - bp;
    return String(a.name).localeCompare(String(b.name));
  });
}
module.exports = { dedupeAndRank };
