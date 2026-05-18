function clean(v) {
  return String(v || "").trim();
}

function isSet(name) {
  return Boolean(clean(process.env[name]));
}

async function checkExpediaRapid(payload) {
  if (!isSet("EXPEDIA_RAPID_KEY") || !isSet("EXPEDIA_RAPID_SECRET")) {
    return { supplier: "Expedia Rapid", ok: false, configured: false, message: "Expedia Rapid is not configured." };
  }

  return {
    supplier: "Expedia Rapid",
    ok: false,
    configured: true,
    message: "Expedia Rapid credentials detected. Property-ID mapping is required before live checkout can be enabled."
  };
}

async function checkRateHawk(payload) {
  if (!isSet("RATEHAWK_KEY_ID") || !isSet("RATEHAWK_API_KEY")) {
    return { supplier: "RateHawk / Emerging Travel", ok: false, configured: false, message: "RateHawk is not configured." };
  }

  return {
    supplier: "RateHawk / Emerging Travel",
    ok: false,
    configured: true,
    message: "RateHawk credentials detected. Hotel mapping and live-rate endpoint wiring are required."
  };
}

async function checkTravelgate(payload) {
  if (!isSet("TRAVELGATE_API_KEY")) {
    return { supplier: "Travelgate", ok: false, configured: false, message: "Travelgate is not configured." };
  }

  return {
    supplier: "Travelgate",
    ok: false,
    configured: true,
    message: "Travelgate key detected. Hotel-X query mapping is required."
  };
}

async function checkWebBeds(payload) {
  if (!isSet("WEBBEDS_API_KEY")) {
    return { supplier: "WebBeds", ok: false, configured: false, message: "WebBeds is not configured." };
  }

  return {
    supplier: "WebBeds",
    ok: false,
    configured: true,
    message: "WebBeds key detected. Contract endpoint and hotel mapping are required."
  };
}

async function checkFallbackSuppliers(payload) {
  const attempts = [];

  for (const fn of [checkExpediaRapid, checkRateHawk, checkTravelgate, checkWebBeds]) {
    const result = await fn(payload);
    attempts.push(result);

    if (result.ok && result.first_rate && result.first_rate.rate_key) {
      return {
        ok: true,
        supplier: result.supplier,
        attempts,
        ...result
      };
    }
  }

  return {
    ok: false,
    supplier: null,
    attempts,
    message: "No fallback supplier returned a live bookable rate."
  };
}

module.exports = {
  checkFallbackSuppliers
};
