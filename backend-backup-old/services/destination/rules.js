const { clean, norm } = require('../../utils/text');

function canonicalCountry(value) {
  const n = norm(value);
  if (["uk", "gb", "great britain", "england", "scotland", "wales", "northern ireland"].includes(n)) return "united kingdom";
  return n;
}

function titleCity(value) {
  return clean(value).split(/\s+/).filter(Boolean).map((part) => part.length <= 2 ? part.toUpperCase() : part.charAt(0).toUpperCase() + part.slice(1).toLowerCase()).join(' ');
}

function canonicalCity(value, country = '') {
  const raw = clean(value);
  if (!raw) return '';
  const n = norm(raw);
  const c = canonicalCountry(country);

  if (c === 'united kingdom') {
    if (n.includes('london')) return 'London';
    if (n.includes('manchester')) return 'Manchester';
    if (n.includes('birmingham')) return 'Birmingham';
    if (n.includes('liverpool')) return 'Liverpool';
    if (n.includes('leeds')) return 'Leeds';
    if (n.includes('bristol')) return 'Bristol';
    if (n.includes('edinburgh')) return 'Edinburgh';
    if (n.includes('glasgow')) return 'Glasgow';
    if (n.includes('cardiff')) return 'Cardiff';
    if (n.includes('belfast')) return 'Belfast';
    if (n.includes('newcastle')) return 'Newcastle upon Tyne';
    if (n.includes('sheffield')) return 'Sheffield';
    if (n.includes('nottingham')) return 'Nottingham';
    if (n.includes('leicester')) return 'Leicester';
    if (n.includes('southampton')) return 'Southampton';
    if (n.includes('brighton')) return 'Brighton';
    if (n.includes('oxford')) return 'Oxford';
    if (n.includes('cambridge')) return 'Cambridge';
    if (n.includes('york')) return 'York';
    if (n.includes('bath')) return 'Bath';
    if (n.includes('blackpool')) return 'Blackpool';
    if (n.includes('bournemouth')) return 'Bournemouth';
  }

  if (c === 'canada') {
    if (n.includes('vancouver')) return 'Vancouver';
    if (n.includes('toronto')) return 'Toronto';
    if (n.includes('montreal')) return 'Montreal';
    if (n.includes('calgary')) return 'Calgary';
    if (n.includes('ottawa')) return 'Ottawa';
  }

  if (c === 'united states') {
    if (n.includes('new york')) return 'New York';
    if (n.includes('los angeles')) return 'Los Angeles';
    if (n.includes('las vegas')) return 'Las Vegas';
    if (n.includes('miami')) return 'Miami';
    if (n.includes('orlando')) return 'Orlando';
  }

  if (c === 'united arab emirates') {
    if (n.includes('dubai')) return 'Dubai';
    if (n.includes('abu dhabi')) return 'Abu Dhabi';
  }

  if (c === 'france' && n.includes('paris')) return 'Paris';
  if (c === 'bahamas' && (n.includes('nassau') || n.includes('paradise island'))) return 'Nassau';

  return titleCity(raw.split(',')[0].split(' - ')[0].replace(/\b(city centre|city center|centre|center|downtown|central)\b/ig, '').replace(/\s+/g, ' ').trim());
}

function countryMatches(actual, wanted) {
  const a = canonicalCountry(actual);
  const b = canonicalCountry(wanted);
  if (!a || !b) return false;
  return a === b;
}

function cityMatches(actual, wanted, country = '') {
  const a = norm(canonicalCity(actual, country));
  const b = norm(canonicalCity(wanted, country));
  return Boolean(a && b && a === b);
}

function textContainsCity(hotel, city, country = '') {
  const wanted = norm(canonicalCity(city, country));
  if (!wanted) return true;
  const text = norm([
    hotel.name,
    hotel.hotel_name,
    hotel.address,
    hotel.addressLine,
    hotel.fullAddress,
    hotel.location && hotel.location.address,
    hotel.description,
    hotel.city,
    hotel.cityName,
    hotel.destination
  ].filter(Boolean).join(' '));
  return text.includes(wanted);
}

function hotelMatchesRequestedLocation(hotel, criteria = {}) {
  const wantedCountry = clean(criteria.country || criteria.countryName || '');
  const wantedCity = clean(criteria.city || criteria.destination || '');
  if (!wantedCountry && !wantedCity) return true;

  const actualCountry = clean(hotel.country || hotel.countryName || hotel.location?.country || '');
  if (wantedCountry && actualCountry && !countryMatches(actualCountry, wantedCountry)) return false;

  const actualCity = clean(hotel.city || hotel.cityName || hotel.destination || hotel.location?.city || '');
  if (!wantedCity) return true;
  if (actualCity) return cityMatches(actualCity, wantedCity, wantedCountry || actualCountry);

  // Never invent a city from the search form. If supplier has no city, only pass it when
  // the supplier-provided name/address text clearly contains the requested city.
  return textContainsCity(hotel, wantedCity, wantedCountry || actualCountry);
}

function filterToRequestedLocation(hotels = [], criteria = {}) {
  return (Array.isArray(hotels) ? hotels : []).filter((hotel) => hotelMatchesRequestedLocation(hotel, criteria));
}

module.exports = { canonicalCountry, canonicalCity, countryMatches, cityMatches, filterToRequestedLocation, hotelMatchesRequestedLocation };
