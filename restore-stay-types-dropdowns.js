const fs = require("fs");

const file = "frontend/src/App.jsx";
let s = fs.readFileSync(file, "utf8");

// Restore stay type options
s = s.replace(
`<option value="hotel">Hotels</option>`,
`<option value="hotel">Hotels</option>
            <option value="apartment">Apartments</option>
            <option value="villa">Villas</option>`
);

// Prevent duplicate options if script runs twice
s = s.replace(
`<option value="hotel">Hotels</option>
            <option value="apartment">Apartments</option>
            <option value="villa">Villas</option>
            <option value="apartment">Apartments</option>
            <option value="villa">Villas</option>`,
`<option value="hotel">Hotels</option>
            <option value="apartment">Apartments</option>
            <option value="villa">Villas</option>`
);

// Restore result list so dropdown/search does not depend on hotel-only filter
s = s.replace(
`const hotelOnly = found.filter(isHotelOnly);

      setHotels(hotelOnly);`,
`setHotels(found);`
);

s = s.replace(
`if (!hotelOnly.length) {
        setNotice("No hotels were returned for this search. Try another city or different dates.");
      }`,
`if (!found.length) {
        setNotice("No stays were returned for this search. Try another city or different dates.");
      }`
);

// Restore customer labels
s = s.replaceAll("Search hotels", "Search stays");
s = s.replaceAll("Available hotels", "Available stays");
s = s.replaceAll("Select hotel", "Select stay");
s = s.replaceAll("Choose a hotel", "Choose a stay");

// Keep hotel-only restriction ONLY when user chooses Hotels
s = s.replace(
`stay_type: stayType,`,
`stay_type: stayType,`
);

// Ensure Select button works
s = s.replace(
`onClick={() => selectHotel(hotel)}`,
`onClick={() => selectHotel(hotel)}`
);

fs.writeFileSync(file, s, "utf8");
console.log("Restored stay type dropdown, country/city behaviour, and selection flow.");
