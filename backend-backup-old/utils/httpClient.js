const { env } = require("../config/env");

async function fetchJson(url, options = {}, timeoutMs = env.REQUEST_TIMEOUT_MS) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, { ...options, signal: controller.signal });
    const text = await response.text();
    let data = {};
    try { data = text ? JSON.parse(text) : {}; } catch { data = { raw: text }; }
    return { ok: response.ok, status: response.status, data };
  } finally {
    clearTimeout(timer);
  }
}

function queryString(params = {}) {
  const qs = new URLSearchParams();
  for (const [key, value] of Object.entries(params || {})) {
    if (value === undefined || value === null || value === "") continue;
    qs.set(key, String(value));
  }
  return qs.toString();
}

module.exports = { fetchJson, queryString };
