try { require("dotenv").config(); } catch {}
const path = require("path");

const env = {
  PORT: Number(process.env.PORT || 5050),
  NODE_ENV: process.env.NODE_ENV || "development",
  DATA_DIR: process.env.DATA_DIR || path.join(__dirname, "..", "data"),
  INTERNAL_BASE_URL: process.env.INTERNAL_BASE_URL || `http://127.0.0.1:${process.env.PORT || 5050}`,
  REQUEST_TIMEOUT_MS: Number(process.env.REQUEST_TIMEOUT_MS || 9000),
  SEARCH_TIMEOUT_MS: Number(process.env.SEARCH_TIMEOUT_MS || 12000),
  CACHE_TTL_MS: Number(process.env.CACHE_TTL_MS || 120000)
};

module.exports = { env };
