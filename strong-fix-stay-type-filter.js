const fs = require("fs");

const file = "frontend/src/App.jsx";
let s = fs.readFileSync(file, "utf8");

const helper = `
function matchesSelectedStayType(hotel, stayType) {
  const text = [
    hotel?.name,
    hotel?.hotel_name,
    hotel?.title,
    hotel?.property_type,
    hotel?.type,
    hotel?.category,
    hotel?.address,
    hotel?.area
  ].map(clean).join(" ").toLowerCase();

  const isApartment =
    text.includes("apartment") ||
    text.includes("apartments") ||
    text.includes("flat") ||
    text.includes("studio") ||
    text.includes("residence") ||
    text.includes("serviced apartment");

  const isVilla =
    text.includes("villa") ||
    text.includes("villas");

  const isBadHotel =
    isApartment ||
    isVilla ||
    text.includes("hostel") ||
    text.includes("guest house") ||
    text.includes("guesthouse") ||
    text.includes("homestay") ||
    text.includes("private rental");

  if (stayType === "hotel") return !isBadHotel;
  if (stayType === "apartment") return isApartment;
  if (stayType === "villa") return isVilla;

  return true;
}
`;

if (!s.includes("function matchesSelectedStayType")) {
  s = s.replace("function mapsLink(type, query) {", helper + "\nfunction mapsLink(type, query) {");
}

s = s.replace(
/const found = Array\.isArray\(data\?\.hotels\) \? data\.hotels : \[\];[\s\S]*?setHotels\([^)]+\);/,
`const found = Array.isArray(data?.hotels) ? data.hotels : [];
      const filtered = found.filter((hotel) => matchesSelectedStayType(hotel, stayType));

      setHotels(filtered);`
);

s = s.replace(
/if \(![a-zA-Z]+\.length\) \{[\s\S]*?setNotice\(".*?different dates\."\);[\s\S]*?\}/,
`if (!filtered.length) {
        setNotice("No matching results were returned for this search. Try another city or different dates.");
      }`
);

fs.writeFileSync(file, s, "utf8");
console.log("Frontend fixed: Hotels, Apartments and Villas are now separated by name and type.");
