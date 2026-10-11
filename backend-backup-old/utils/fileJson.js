const fs = require("fs");
const path = require("path");
const { env } = require("../config/env");
function ensureDir() { if (!fs.existsSync(env.DATA_DIR)) fs.mkdirSync(env.DATA_DIR, { recursive: true }); }
function readJson(name, fallback = []) { try { ensureDir(); const file = path.join(env.DATA_DIR, name); if (!fs.existsSync(file)) return fallback; return JSON.parse(fs.readFileSync(file, "utf8")); } catch { return fallback; } }
function writeJson(name, value) { ensureDir(); fs.writeFileSync(path.join(env.DATA_DIR, name), JSON.stringify(value, null, 2), "utf8"); }
module.exports = { readJson, writeJson };
