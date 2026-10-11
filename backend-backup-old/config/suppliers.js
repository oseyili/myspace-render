function hasAny(...names) {
  return names.some((name) => Boolean(String(process.env[name] || "").trim()));
}

function isEnabled(name, defaultValue = "true") {
  return String(process.env[name] || defaultValue).toLowerCase() !== "false";
}

function supplierStatus() {
  return {
    webbeds: {
      code: "WEBBEDS",
      name: "WebBeds",
      priority: 1,
      enabled: isEnabled("WEBBEDS_ENABLED", "true"),
      configured:
        hasAny("WEBBEDS_USERNAME") &&
        hasAny("WEBBEDS_PASSWORD") &&
        hasAny("WEBBEDS_COMPANY_ID", "WEBBEDS_COMPANY_CODE")
    },

    hyperguest: {
      code: "HYPERGUEST",
      name: "HyperGuest",
      priority: 2,
      enabled: isEnabled("HYPERGUEST_ENABLED", "true"),
      configured:
        hasAny("HYPERGUEST_API_KEY", "HYPERGUEST_TOKEN") &&
        hasAny("HYPERGUEST_SEARCH_URL", "HYPERGUEST_AVAILABILITY_URL", "HYPERGUEST_BASE_URL")
    },

    ratehawk: {
      code: "RATEHAWK",
      name: "RateHawk",
      priority: 3,
      enabled: isEnabled("RATEHAWK_ENABLED", "true"),
      configured:
        hasAny("RATEHAWK_KEY_ID") &&
        hasAny("RATEHAWK_KEY_TOKEN")
    }
};
}

module.exports = { supplierStatus };