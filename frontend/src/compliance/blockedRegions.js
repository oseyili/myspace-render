// COMPLETE REPLACEMENT — frontend/src/compliance/blockedRegions.js

export const BLOCKED_REGIONS = [
  {
    code: "AF",
    name: "Afghanistan",
  },
  {
    code: "BY",
    name: "Belarus",
  },
  {
    code: "BI",
    name: "Burundi",
  },
  {
    code: "CF",
    name: "Central African Republic",
  },
  {
    code: "TD",
    name: "Chad",
  },
  {
    code: "CG",
    name: "Congo Republic",
  },
  {
    code: "CU",
    name: "Cuba",
  },
  {
    code: "CD",
    name: "Democratic Republic of the Congo",
  },
  {
    code: "ER",
    name: "Eritrea",
  },
  {
    code: "IQ",
    name: "Iraq",
  },
  {
    code: "IR",
    name: "Iran",
  },
  {
    code: "LY",
    name: "Libya",
  },
  {
    code: "MM",
    name: "Myanmar",
  },
  {
    code: "KP",
    name: "North Korea",
  },
  {
    code: "SO",
    name: "Somalia",
  },
  {
    code: "SS",
    name: "South Sudan",
  },
  {
    code: "SD",
    name: "Sudan",
  },
  {
    code: "SY",
    name: "Syria",
  },
  {
    code: "RU",
    name: "Russia",
  },
  {
    code: "VE",
    name: "Venezuela",
  },
  {
    code: "YE",
    name: "Yemen",
  },

  // Wise mentioned regions
  {
    code: "UA-43",
    name: "Crimea",
  },
  {
    code: "UA-14",
    name: "Donetsk People's Republic",
  },
  {
    code: "UA-09",
    name: "Lugansk People's Republic",
  },
];

export function isBlockedCountry(code = "") {
  const clean = String(code || "").trim().toUpperCase();

  return BLOCKED_REGIONS.some(
    (region) => region.code.toUpperCase() === clean
  );
}

export function getBlockedRegion(code = "") {
  const clean = String(code || "").trim().toUpperCase();

  return (
    BLOCKED_REGIONS.find(
      (region) => region.code.toUpperCase() === clean
    ) || null
  );
}

export function getAllBlockedRegionCodes() {
  return BLOCKED_REGIONS.map((x) => x.code);
}

export function getAllBlockedRegions() {
  return BLOCKED_REGIONS;
}

export function complianceMessage(regionName = "your region") {
  return (
    `We’re unable to process bookings or payments from ${regionName} ` +
    `due to international financial compliance restrictions.`
  );
}