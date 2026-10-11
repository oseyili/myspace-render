const store = new Map();
function get(key) {
  const row = store.get(key);
  if (!row) return null;
  if (row.expiresAt < Date.now()) { store.delete(key); return null; }
  return row.value;
}
function set(key, value, ttlMs = 120000) { store.set(key, { value, expiresAt: Date.now() + ttlMs }); return value; }
function clear() { store.clear(); }
module.exports = { get, set, clear };
