async function resolveHotelbedsDestination(params) {
  const city = String(params.city || "").trim().toLowerCase();
  const country = String(params.country || "").trim().toLowerCase();
  if (!city) return null;

  const cacheKey = country + "|" + city;
  if (hotelbedsDestinationCache.has(cacheKey)) {
    return hotelbedsDestinationCache.get(cacheKey);
  }

  const localCode = hotelbedsCityCodeMap[cacheKey];
  if (localCode && /^[A-Z]{3,4}$/.test(localCode.trim())) {
    hotelbedsDestinationCache.set(cacheKey, localCode);
    console.log("[Hotelbeds] Resolved " + city + ", " + country + " -> " + localCode + " (local cache)");
    return localCode;
  }

  const baseUrl = String(process.env.HOTELBEDS_BASE_URL || "").trim().replace(/\/$/, "");
  const apiKey = String(process.env.HOTELBEDS_API_KEY || "").trim();
  const secret = String(process.env.HOTELBEDS_SECRET || "").trim();
  if (!baseUrl || !apiKey || !secret) {
    console.warn("[Hotelbeds] Missing credentials for API fallback");
    return null;
  }

  try {
    const ts = Math.floor(Date.now() / 1000);
    const sig = require("crypto").createHash("sha256").update(apiKey + secret + ts).digest("hex");
    const url = baseUrl + "/hotel-content-api/1.0/locations/destinations?fields=code,name,countryCode&language=ENG&from=1&to=1000&useSecondaryLanguage=false";
    const res = await fetch(url, { headers: { "Api-key": apiKey, "X-Signature": sig, "Accept": "application/json" } });
    if (!res.ok) {
      console.warn("[Hotelbeds] API fallback failed: " + res.status);
      return null;
    }
    const data = await res.json();
    const destinations = Array.isArray(data.destinations) ? data.destinations : [];
    const getName = (d) => {
      if (!d) return "";
      if (typeof d.name === "string") return d.name;
      if (d.name && typeof d.name === "object" && d.name.content) return d.name.content;
      return "";
    };
    const match = destinations.find((d) => getName(d).toLowerCase() === city && /^[A-Z]{3,4}$/.test(String(d.code || "").trim()));
    if (match && match.code) {
      hotelbedsDestinationCache.set(cacheKey, match.code);
      console.log("[Hotelbeds] Resolved " + city + ", " + country + " -> " + match.code + " (API)");
      return match.code;
    }
    console.warn("[Hotelbeds] No destination found for " + city + ", " + country);
    return null;
  } catch (e) {
    console.error("[Hotelbeds] Lookup error: " + e.message);
    return null;
  }
}
