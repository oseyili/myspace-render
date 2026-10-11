function clean(v) { return String(v || "").trim(); }
function norm(v) { return clean(v).toLowerCase().replace(/&/g, " and ").replace(/[^a-z0-9]+/g, " ").replace(/\s+/g, " ").trim(); }
function title(v) { return clean(v).toLowerCase().split(/\s+/).filter(Boolean).map((p) => p.length <= 2 ? p.toUpperCase() : p[0].toUpperCase() + p.slice(1)).join(" "); }
function number(v) { const n = Number(String(v || "").replace(/[^0-9.-]/g, "")); return Number.isFinite(n) ? n : 0; }
function money(v) { return Number(number(v).toFixed(2)); }
function nowISO() { return new Date().toISOString(); }
module.exports = { clean, norm, title, number, money, nowISO };
