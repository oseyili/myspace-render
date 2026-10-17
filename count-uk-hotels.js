const fs = require("fs");
const path = require("path");

const cachePath = path.join(__dirname, "backend", "data", "hotelbeds-content-cache.json");

const ukCities = {
  LON: "London", BHX: "Birmingham", MAN: "Manchester", EDI: "Edinburgh", 
  GLA: "Glasgow", BRS: "Bristol", NCL: "Newcastle", LPL: "Liverpool", 
  CWL: "Cardiff", BFS: "Belfast", SOU: "Southampton", NQT: "Nottingham", 
  YOR: "York", BTH: "Bath", OXF: "Oxford", CBG: "Cambridge", LBA: "Leeds", 
  NWI: "Norwich", IPW: "Ipswich", XRE: "Reading", CVT: "Coventry", STK: "Stoke-on-Trent", 
  DER: "Derby", HUL: "Hull", MME: "Teesside", SUN: "Sunderland", CAX: "Carlisle", 
  BLK: "Blackpool", PRE: "Preston", CEG: "Chester", GLO: "Gloucester", SWI: "Swindon", 
  SAL: "Salisbury", WNE: "Winchester", DOV: "Dover", HAS: "Hastings", ESB: "Eastbourne", 
  IOW: "Isle of Wight", ABZ: "Aberdeen", DND: "Dundee", INV: "Inverness", LDY: "Londonderry", 
  NRY: "Newry", SWS: "Swansea", NWP: "Newport", WRE: "Wrexham", BGR: "Bangor", 
  LLD: "Llandudno", ABE: "Aberystwyth", KIR: "Kirkwall", WAT: "Waterford", LMK: "Limerick"
};

try {
  if (!fs.existsSync(cachePath)) {
    console.error("Cache file not found at:", cachePath);
    process.exit(1);
  }

  const rawData = fs.readFileSync(cachePath, "utf8");
  const cache = JSON.parse(rawData);
  
  const counts = {};
  let totalUkHotels = 0;

  Object.values(cache).forEach(hotel => {
    const destCode = hotel.destinationCode;
    if (ukCities[destCode]) {
      counts[destCode] = (counts[destCode] || 0) + 1;
      totalUkHotels++;
    }
  });

  const tableData = Object.keys(ukCities)
    .map(code => ({
      Code: code,
      City: ukCities[code],
      Hotels: counts[code] || 0
    }))
    .sort((a, b) => b.Hotels - a.Hotels);

  console.log(`\nUK HOTEL CACHE SUMMARY (Total: ${totalUkHotels} hotels)\n`);
  console.table(tableData);

} catch (err) {
  console.error("Error reading cache:", err.message);
}
