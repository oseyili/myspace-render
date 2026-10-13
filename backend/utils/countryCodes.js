// UNIVERSAL COUNTRY MAP (Dynamic lookup for all 250+ countries)
const { countries } = require('countries-list');

// Pre-compute a lookup map for performance (Country Name -> ISO 3166-1 Alpha-2 Code)
const COUNTRY_MAP = {};

// Populate the map dynamically
Object.keys(countries).forEach(code => {
    const name = countries[code].name.toLowerCase();
    COUNTRY_MAP[name] = code;
    // Add common aliases
    if (name === 'united states') COUNTRY_MAP['usa'] = code;
    if (name === 'united kingdom') COUNTRY_MAP['uk'] = code;
    if (name === 'united arab emirates') COUNTRY_MAP['uae'] = code;
});

function getCountryCode(countryName) {
    if (!countryName) return "";
    const key = countryName.toLowerCase().trim();
    return COUNTRY_MAP[key] || key.toUpperCase(); // Return code, or fallback to uppercase string
}

module.exports = { getCountryCode };