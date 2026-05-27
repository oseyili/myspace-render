// COMPLETE REPLACEMENT — frontend/src/utils/geolocationCompliance.js

import { isBlockedCountry } from "../compliance/blockedRegions";

export async function detectCountryFromIP() {
  try {
    const res = await fetch("https://ipapi.co/json/");
    const data = await res.json();

    return {
      country: data?.country || "",
      blocked: isBlockedCountry(data?.country || ""),
    };
  } catch (err) {
    console.error("Compliance IP detection failed:", err);

    return {
      country: "",
      blocked: false,
    };
  }
}