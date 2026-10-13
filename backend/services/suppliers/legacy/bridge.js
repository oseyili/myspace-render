const { env } = require("../../../config/env");
const { fetchJson, queryString } = require("../../../utils/httpClient");

async function callLegacy(pathname, query, timeoutMs = env.SEARCH_TIMEOUT_MS) {
  const qs = queryString(query);
  const url = `${env.INTERNAL_BASE_URL}${pathname}${qs ? `?${qs}` : ""}`;
  return fetchJson(url, { headers: { Accept: "application/json", "X-MySpace-Internal": "platform-v2" } }, timeoutMs);
}

module.exports = { callLegacy };
