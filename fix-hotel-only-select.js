const fs = require("fs");

const file = "frontend/src/App.jsx";
let s = fs.readFileSync(file, "utf8");

// 1) Add hotel-only filter helper after hotelAddress()
if (!s.includes("function isHotelOnly")) {
  s = s.replace(
`function hotelAddress(hotel) {
  return clean(hotel?.address || hotel?.area || "Destination stay");
}`,
`function hotelAddress(hotel) {
  return clean(hotel?.address || hotel?.area || "Destination stay");
}

function isHotelOnly(hotel) {
  const text = [
    hotel?.property_type,
    hotel?.type,
    hotel?.category,
    hotel?.name,
    hotel?.hotel_name
  ].map(clean).join(" ").toLowerCase();

  if (!text) return true;

  const blockedTypes = [
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
    "private rental"
  ];

  if (blockedTypes.some((x) => text.includes(x))) return false;

  return true;
}`
  );
}

// 2) Force default stay type to hotel
s = s.replace(
  `const [stayType, setStayType] = useState("hotel");`,
  `const [stayType, setStayType] = useState("hotel");`
);

// 3) Filter backend hotel results to hotels only before displaying
s = s.replace(
`const found = Array.isArray(data?.hotels) ? data.hotels : [];

      setHotels(found);`,
`const found = Array.isArray(data?.hotels) ? data.hotels : [];
      const hotelOnly = found.filter(isHotelOnly);

      setHotels(hotelOnly);`
);

// 4) Update empty message count logic to use hotelOnly
s = s.replace(
`if (!found.length) {
        setNotice("No stays were returned for this search. Try another city or different dates.");
      }`,
`if (!hotelOnly.length) {
        setNotice("No hotels were returned for this search. Try another city or different dates.");
      }`
);

// 5) Remove apartment/villa from dropdown and lock customer search to hotels
s = s.replace(
`<option value="hotel">Hotels</option>
            <option value="apartment">Apartments</option>
            <option value="villa">Villas</option>`,
`<option value="hotel">Hotels</option>`
);

// 6) Fix reserve panel payment eligibility: live price + amount is enough
s = s.replace(
`const canPay = selectedHotel && rate.liveAvailable && rate.amount && rate.rateKey;`,
`const canPay = selectedHotel && rate.liveAvailable && rate.amount && stayTotal > 0;`
);

// 7) Fix checkout payment eligibility too
s = s.replace(
`const canPay = selectedHotel && rate.liveAvailable && rate.amount && rate.rateKey && stayTotal > 0;`,
`const canPay = selectedHotel && rate.liveAvailable && rate.amount && stayTotal > 0;`
);

// 8) Fix Stripe blocking message in payWithStripe
s = s.replace(
`if (!rate.liveAvailable || !rate.amount || !rate.rateKey) {
      setCheckoutMessage("This stay needs a live price before secure payment can continue.");
      return;
    }`,
`if (!rate.liveAvailable || !rate.amount) {
      setCheckoutMessage("This hotel needs a live available price before secure payment can continue.");
      return;
    }`
);

// 9) Make customer text say hotels, not stays, in key areas
s = s.replaceAll("Search stays", "Search hotels");
s = s.replaceAll("Available stays", "Available hotels");
s = s.replaceAll("Select stay", "Select hotel");
s = s.replaceAll("Choose a stay", "Choose a hotel");
s = s.replaceAll("No stays were returned", "No hotels were returned");

fs.writeFileSync(file, s, "utf8");

console.log("Fixed hotel-only selection, live-price payment gate, and customer hotel wording.");
