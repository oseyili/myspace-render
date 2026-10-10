const fs = require("fs");

const backend = "backend/server.js";
let s = fs.readFileSync(backend, "utf8");

const helper = `
function isHotelOnlyNameSafe(h) {
  const text = [
    h.name,
    h.hotel_name,
    h.property_type,
    h.type,
    h.category,
    h.address,
    h.area
  ].map(clean).join(" ").toLowerCase();

  const blocked = [
    "apartment",
    "apartments",
    "villa",
    "villas",
    "residence",
    "residences",
    "hostel",
    "guest house",
    "guesthouse",
    "homestay",
    "studio",
    "private rental"
  ];

  return !blocked.some((x) => text.includes(x));
}
`;

if (!s.includes("function isHotelOnlyNameSafe")) {
  s = s.replace("function customerSearch(country, city, area, keyword, propertyType, limit) {", helper + "\nfunction customerSearch(country, city, area, keyword, propertyType, limit) {");
}

s = s.replace(
`if (propertyType && propertyType !== "all") {
    const p = lower(propertyType);

    hotels = hotels.filter((h) => {
      const t = lower(h.property_type);

      if (p === "hotel") {
        return t.includes("hotel") || t.includes("resort") || (!t.includes("apartment") && !t.includes("villa"));
      }

      if (p === "apartment") {
        return t.includes("apartment") || t.includes("residence");
      }

      if (p === "villa") {
        return t.includes("villa");
      }

      return true;
    });
  }`,
`if (propertyType && propertyType !== "all") {
    const p = lower(propertyType);

    hotels = hotels.filter((h) => {
      const text = [
        h.name,
        h.hotel_name,
        h.property_type,
        h.type,
        h.category,
        h.address,
        h.area
      ].map(clean).join(" ").toLowerCase();

      if (p === "hotel") {
        return isHotelOnlyNameSafe(h);
      }

      if (p === "apartment") {
        return text.includes("apartment") || text.includes("residence") || text.includes("studio");
      }

      if (p === "villa") {
        return text.includes("villa");
      }

      return true;
    });
  }`
);

fs.writeFileSync(backend, s, "utf8");

const frontend = "frontend/src/App.jsx";
let f = fs.readFileSync(frontend, "utf8");

const feHelper = `
function isHotelOnlyNameSafe(hotel) {
  const text = [
    hotel?.name,
    hotel?.hotel_name,
    hotel?.property_type,
    hotel?.type,
    hotel?.category,
    hotel?.address,
    hotel?.area
  ].map(clean).join(" ").toLowerCase();

  const blocked = [
    "apartment",
    "apartments",
    "villa",
    "villas",
    "residence",
    "residences",
    "hostel",
    "guest house",
    "guesthouse",
    "homestay",
    "studio",
    "private rental"
  ];

  return !blocked.some((x) => text.includes(x));
}
`;

if (!f.includes("function isHotelOnlyNameSafe")) {
  f = f.replace("function mapsLink(type, query) {", feHelper + "\nfunction mapsLink(type, query) {");
}

f = f.replace(
`const found = Array.isArray(data?.hotels) ? data.hotels : [];

      setHotels(found);`,
`const found = Array.isArray(data?.hotels) ? data.hotels : [];
      const cleanFound =
        stayType === "hotel"
          ? found.filter(isHotelOnlyNameSafe)
          : found;

      setHotels(cleanFound);`
);

f = f.replace(
`if (!found.length) {
        setNotice("No stays were returned for this search. Try another city or different dates.");
      }`,
`if (!cleanFound.length) {
        setNotice("No matching results were returned for this search. Try another city or different dates.");
      }`
);

fs.writeFileSync(frontend, f, "utf8");

console.log("Fixed mixed hotel/apartment results in backend and frontend.");
