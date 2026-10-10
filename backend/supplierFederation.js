const { URLSearchParams } = require("url");

function cleanText(v) {
  return String(v || "").trim();
}

function first(...vals) {
  return vals.find(v => v !== undefined && v !== null && String(v).trim() !== "");
}

function normalizeImage(img) {
  if (!img) return null;
  if (typeof img === "string") return img;
  return first(img.url, img.href, img.link, img.imageUrl, img.fullUrl, img.thumbnail);
}

function normalizeSupplierHotel(raw = {}, supplier = "unknown") {
  const id = first(raw.id, raw.hotelId, raw.hotel_id, raw.code, raw.propertyId, raw.property_id, raw.hid);
  const name = first(raw.name, raw.hotelName, raw.hotel_name, raw.propertyName, raw.title);

  const images = [
    ...(Array.isArray(raw.images) ? raw.images : []),
    ...(Array.isArray(raw.photos) ? raw.photos : []),
    ...(Array.isArray(raw.gallery) ? raw.gallery : []),
    raw.image,
    raw.mainImage,
    raw.thumbnail
  ].map(normalizeImage).filter(Boolean);

  const price = first(
    raw.price,
    raw.minPrice,
    raw.rate,
    raw.total,
    raw.amount,
    raw.rooms?.[0]?.price,
    raw.rooms?.[0]?.rate,
    raw.offers?.[0]?.price?.amount,
    raw.rates?.[0]?.price,
    raw.rates?.[0]?.amount
  );

  return {
    id: cleanText(id || `${supplier}-${Math.random().toString(36).slice(2)}`),
    supplier,
    name: cleanText(name),
    city: cleanText(first(raw.city, raw.cityName, raw.destination, raw.location?.city)),
    country: cleanText(first(raw.country, raw.countryName, raw.location?.country)),
    address: cleanText(first(raw.address, raw.location?.address, raw.addressLine)),
    starRating: first(raw.starRating, raw.stars, raw.rating, raw.category),
    images,
    image: images[0] || null,
    price: price ? Number(String(price).replace(/[^\d.]/g, "")) : null,
    currency: first(raw.currency, raw.priceCurrency, raw.rates?.[0]?.currency, "GBP"),
    live: !!price,
    raw
  };
}

function mergeHotels(hotels = []) {
  const map = new Map();

  for (const h of hotels) {
    if (!h || !h.name) continue;
    const key = `${h.name.toLowerCase()}|${h.city.toLowerCase()}|${h.country.toLowerCase()}`;
    const old = map.get(key);

    if (!old) {
      map.set(key, h);
    } else {
      old.suppliers = [...new Set([...(old.suppliers || [old.supplier]), h.supplier])];
      old.images = [...new Set([...(old.images || []), ...(h.images || [])])];
      old.image = old.image || h.image;
      old.price = old.price && h.price ? Math.min(old.price, h.price) : old.price || h.price;
      old.live = old.live || h.live;
    }
  }

  return [...map.values()].map(h => ({
    ...h,
    suppliers: h.suppliers || [h.supplier],
    sourceCount: (h.suppliers || [h.supplier]).length
  }));
}

async function safeFetchSupplier(name, fn) {
  try {
    const data = await fn();
    return Array.isArray(data) ? data : [];
  } catch (e) {
    console.error(`[${name}] failed:`, e.message);
    return [];
  }
}

async function postJson(url, headers, body) {
  const r = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...headers },
    body: JSON.stringify(body)
  });
  if (!r.ok) throw new Error(`${url} ${r.status}`);
  const data = await r.json();
  return data.hotels || data.results || data.data?.hotels || data.data || [];
}

async function fetchWebBedsInventory(params) {
  if (!process.env.WEBBEDS_API_URL || !process.env.WEBBEDS_API_KEY) return [];
  return postJson(process.env.WEBBEDS_API_URL, {
    Authorization: `Bearer ${process.env.WEBBEDS_API_KEY}`
  }, params);
}

async function fetchRateHawkInventory(params) {
  if (!process.env.RATEHAWK_API_URL || !process.env.RATEHAWK_KEY_ID || !process.env.RATEHAWK_API_KEY) return [];
  const auth = Buffer.from(`${process.env.RATEHAWK_KEY_ID}:${process.env.RATEHAWK_API_KEY}`).toString("base64");
  return postJson(process.env.RATEHAWK_API_URL, {
    Authorization: `Basic ${auth}`
  }, params);
}

async function fetchHyperGuestInventory(params) {
  if (!process.env.HYPERGUEST_API_URL || !process.env.HYPERGUEST_API_KEY) return [];
  return postJson(process.env.HYPERGUEST_API_URL, {
    Authorization: `Bearer ${process.env.HYPERGUEST_API_KEY}`
  }, params);
}

async function federatedHotelSearch(req, res) {
  const body = req.body || {};
  const q = req.query || {};

  const params = {
    destination: q.destination || q.city || body.destination || body.city,
    city: q.city || body.city,
    country: q.country || body.country,
    checkIn: q.checkIn || body.checkIn,
    checkOut: q.checkOut || body.checkOut,
    adults: Number(q.adults || body.adults || 2),
    children: Number(q.children || body.children || 0),
    rooms: Number(q.rooms || body.rooms || 1),
    nationality: q.nationality || body.nationality || "GB"
  };

  const [webbeds, ratehawk, hyperguest] = await Promise.all([
    safeFetchSupplier("WebBeds", () => fetchWebBedsInventory(params)),
    safeFetchSupplier("RateHawk", () => fetchRateHawkInventory(params)),
    safeFetchSupplier("HyperGuest", () => fetchHyperGuestInventory(params))
  ]);

  const hotels = mergeHotels([
    ...webbeds.map(h => normalizeSupplierHotel(h, "WebBeds")),
    ...ratehawk.map(h => normalizeSupplierHotel(h, "RateHawk")),
    ...hyperguest.map(h => normalizeSupplierHotel(h, "HyperGuest"))
  ])
    .filter(h => h.name && h.live && h.price)
    .sort((a, b) => a.price - b.price);

  res.json({
    ok: true,
    live: true,
    total: hotels.length,
    suppliers: {
      WebBeds: webbeds.length,
      RateHawk: ratehawk.length,
      HyperGuest: hyperguest.length
    },
    hotels
  });
}

module.exports = {
  federatedHotelSearch,
  normalizeSupplierHotel,
  mergeHotels
};
