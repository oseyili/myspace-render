import React, { useEffect, useMemo, useRef, useState } from "react";

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

function tomorrowISO() {
  return new Date(Date.now() + 86400000).toISOString().slice(0, 10);
}

function clean(value) {
  return String(value || "").trim();
}

function money(value) {
  const n = Number(value || 0);
  if (!Number.isFinite(n) || n <= 0) return "";
  return n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function nightsBetween(checkIn, checkOut) {
  const start = new Date(checkIn);
  const end = new Date(checkOut);
  const days = Math.ceil((end - start) / 86400000);
  return Number.isFinite(days) && days > 0 ? days : 1;
}

function normal(value) {
  return clean(value)
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function canonicalCountry(value) {
  const n = normal(value);
  if (["uk", "gb", "great britain", "england", "scotland", "wales", "northern ireland"].includes(n)) return "united kingdom";
  return n;
}

function titleCity(value) {
  return clean(value)
    .split(/\s+/)
    .filter(Boolean)
    .map((part) => part.length <= 2 ? part.toUpperCase() : part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
    .join(" ");
}

function canonicalCity(value, country = "") {
  const raw = clean(value);
  if (!raw) return "";
  const n = normal(raw);
  const c = canonicalCountry(country);

  if (c === "united kingdom") {
    if (n.includes("london")) return "London";
    if (n.includes("liverpool")) return "Liverpool";
    if (n.includes("manchester")) return "Manchester";
    if (n.includes("birmingham") || n === "west midlands") return "Birmingham";
    if (n.includes("edinburgh")) return "Edinburgh";
    if (n.includes("glasgow")) return "Glasgow";
    if (n.includes("leeds")) return "Leeds";
    if (n.includes("bristol")) return "Bristol";
    if (n.includes("cambridge")) return "Cambridge";
    if (n.includes("oxford")) return "Oxford";
    if (n.includes("york")) return "York";
    if (n.includes("bath")) return "Bath";
    if (n.includes("belfast")) return "Belfast";
    if (n.includes("cardiff")) return "Cardiff";
  }

  if (c === "canada") {
    if (["coquitlam", "burnaby", "richmond", "surrey", "north vancouver", "west vancouver", "new westminster", "delta", "langley", "abbotsford"].includes(n) || n.includes("vancouver")) return "Vancouver";
    if (["mississauga", "brampton", "markham", "scarborough", "north york", "etobicoke", "vaughan"].includes(n) || n.includes("toronto")) return "Toronto";
    if (n.includes("montreal") || n.includes("montrÃ©al")) return "Montreal";
    if (n.includes("calgary")) return "Calgary";
    if (n.includes("ottawa")) return "Ottawa";
  }

  if (c === "bahamas" && (n.includes("nassau") || n.includes("paradise island"))) return "Nassau";
  if (c === "united states") {
    if (n.includes("new york") || ["manhattan", "brooklyn", "queens"].includes(n)) return "New York";
    if (n.includes("los angeles") || ["hollywood", "santa monica", "beverly hills"].includes(n)) return "Los Angeles";
    if (n.includes("las vegas")) return "Las Vegas";
    if (n.includes("miami")) return "Miami";
    if (n.includes("orlando")) return "Orlando";
  }
  if (c === "united arab emirates") {
    if (n.includes("dubai")) return "Dubai";
    if (n.includes("abu dhabi")) return "Abu Dhabi";
  }

  return titleCity(raw.split(" - ")[0].split(",")[0].replace(/\b(city centre|city center|centre|center|downtown|central)\b/ig, "").replace(/\s+/g, " ").trim());
}

function sameCanonicalCity(actual, wanted, country = "") {
  const a = normal(canonicalCity(actual, country));
  const b = normal(canonicalCity(wanted, country));
  return Boolean(a && b && a === b);
}

function countryMatches(actual, wanted) {
  const a = canonicalCountry(actual);
  const b = canonicalCountry(wanted);
  if (!a || !b) return false;
  if (a === b) return true;
  const uk = ["united kingdom", "uk", "gb", "great britain", "england", "scotland", "wales", "northern ireland"];
  return uk.includes(a) && uk.includes(b);
}

function safeNumber(value) {
  const n = Number(String(value || "").replace(/[^0-9.-]/g, ""));
  return Number.isFinite(n) && n > 0 ? n : 0;
}

function firstRoom(hotel) {
  return Array.isArray(hotel?.rooms) && hotel.rooms.length ? hotel.rooms[0] : null;
}

function hotelKey(hotel) {
  return clean(
    hotel?.universalHotelId ||
      hotel?.hotelId ||
      hotel?.hotel_id ||
      hotel?.id ||
      hotel?.code ||
      hotel?.supplier_hotel_id ||
      hotel?.hotel_code ||
      `${hotel?.name || hotel?.hotel_name || hotel?.hotelName || "hotel"}-${hotel?.city || ""}-${hotel?.country || ""}`
  );
}

function hotelName(hotel) {
  const n = clean(hotel?.name || hotel?.hotel_name || hotel?.hotelName || hotel?.property_name || "");
if (/^Verified WebBeds hotel/i.test(n)) return "Live hotel option";
if (/^WebBeds hotel ID/i.test(n)) return "Live hotel option";
if (/^Hotel\s+\d+$/i.test(n)) return "Live hotel option";
return n || "Live hotel option";
}

function rawHotelCity(hotel) {
  return clean(hotel?.city || hotel?.cityName || hotel?.destination || hotel?.location?.city || hotel?.address?.city || hotel?.address_city || "");
}

function rawHotelCountry(hotel) {
  return clean(hotel?.country || hotel?.countryName || hotel?.location?.country || hotel?.address?.country || hotel?.country_name || "");
}

function hotelCity(hotel) {
  const raw = rawHotelCity(hotel);
  return raw ? canonicalCity(raw, rawHotelCountry(hotel)) : "";
}

function hotelCountry(hotel) {
  return rawHotelCountry(hotel);
}

function hotelDisplayCity(hotel) {
  return hotelCity(hotel) || "Location verified before checkout";
}

function hotelDisplayCountry(hotel, fallback = "") {
  return hotelCountry(hotel) || fallback || "";
}

function hotelPrice(hotel) {
  const room = firstRoom(hotel);
  return safeNumber(
    hotel?.price ||
      hotel?.convertedPrice ||
      hotel?.displayPrice ||
      hotel?.amount ||
      hotel?.rate ||
      hotel?.nightly_rate ||
      room?.convertedPrice ||
      room?.price ||
      room?.amount ||
      room?.nightly_rate
  );
}

function hotelCurrency(hotel, fallback) {
  const room = firstRoom(hotel);
  return clean(
    hotel?.currency ||
      hotel?.displayCurrency ||
      room?.displayCurrency ||
      room?.currency ||
      fallback ||
      "GBP"
  ).toUpperCase();
}

function hotelRoomName(hotel) {
  const room = firstRoom(hotel);
  return clean(room?.roomName || room?.room_name || hotel?.roomName || "Room option");
}

function hotelBoard(hotel) {
  const room = firstRoom(hotel);
  return clean(room?.board || room?.boardName || room?.board_name || hotel?.board || "Room details before checkout");
}

function hotelCancellation(hotel) {
  const room = firstRoom(hotel);
  return clean(room?.cancellation || room?.cancellationPolicy || hotel?.cancellation || "");
}

function hotelStars(hotel) {
  const raw = clean(hotel?.stars || hotel?.rating || hotel?.category || hotel?.starRating);
  const n = safeNumber(raw);
  if (n > 0 && n <= 5) return Math.round(n);
  const match = raw.match(/[1-5]/);
  return match ? Number(match[0]) : 0;
}

function reviewScore(hotel) {
  const n = safeNumber(hotel?.reviewScore || hotel?.guestRating || hotel?.score || hotel?.rating_score);
  if (n > 0 && n <= 10) return n.toFixed(1);
  if (n > 10 && n <= 100) return (n / 10).toFixed(1);
  return "";
}

function hotelFacilities(hotel) {
  const raw = Array.isArray(hotel?.facilities)
    ? hotel.facilities
    : Array.isArray(hotel?.amenities)
      ? hotel.amenities
      : [];
  return raw.map((item) => clean(item?.name || item)).filter(Boolean).slice(0, 4);
}

function makeHotelbedsImageUrl(value) {
  const raw = clean(value);
  if (!raw) return "";
  if (raw.startsWith("http")) return raw;
  if (raw.startsWith("//")) return `https:${raw}`;
  if (raw.includes("giata/")) return `https://photos.hotelbeds.com/${raw.replace(/^\/+/, "")}`;
  if (raw.match(/\.(jpg|jpeg|png|webp)$/i)) return `https://photos.hotelbeds.com/giata/original/${raw.replace(/^\/+/, "")}`;
  return "";
}

function hotelImage(hotel) {
  const candidates = [];

  const push = (value) => {
    if (!value) return;
    if (typeof value === "string") {
      candidates.push(value);
      candidates.push(makeHotelbedsImageUrl(value));
      return;
    }
    if (typeof value === "object") {
      [
        value.url,
        value.image_url,
        value.uri,
        value.path,
        value.href,
        value.original,
        value.large,
        value.medium,
        value.thumbnail,
        value.name
      ].forEach(push);
    }
  };

  push(hotel?.image);
  push(hotel?.image_url);
  push(hotel?.main_image);
  push(hotel?.direct_image_url);
  push(hotel?.photo);
  push(hotel?.thumbnail);

  if (Array.isArray(hotel?.images)) hotel.images.forEach(push);
  if (Array.isArray(hotel?.photos)) hotel.photos.forEach(push);
  if (Array.isArray(hotel?.media)) hotel.media.forEach(push);

  for (let url of candidates) {
    url = clean(url);
    if (!url) continue;
    if (url.startsWith("//")) url = `https:${url}`;
    if (url.startsWith("http://")) url = url.replace("http://", "https://");
    if (url.startsWith("https://")) return url;
  }

  return "";
}

function isHotelOnly(hotel) {
  const text = normal([
    hotel?.name,
    hotel?.hotel_name,
    hotel?.hotelName,
    hotel?.property_name,
    hotel?.propertyType,
    hotel?.property_type,
    hotel?.type,
    hotel?.category,
    hotel?.categoryName,
    hotel?.accommodationType,
    hotel?.description
  ].filter(Boolean).join(" "));

  if (!text) return false;
  if (/(test|demo|placeholder|sample|fake|dummy|example)/.test(text)) return false;

  const blocked = [
    "apartment", "apartments", "flat", "serviced apartment", "service apartment",
    "aparthotel", "apart hotel", "studio", "residence", "residences", "villa",
    "villas", "holiday home", "vacation rental", "condo", "penthouse", "loft",
    "private room", "shared room", "entire home", "entire place", "hostel",
    "camp", "caravan", "farm stay", "cottage", "guest house", "guesthouse",
    "bed and breakfast", " b b ", "rental", "for rent", "for sale"
  ];

  if (blocked.some((word) => text.includes(word))) return false;

  const allowed = [
    "hotel", "inn", "motel", "premier inn", "holiday inn", "travelodge", "marriott",
    "hilton", "hyatt", "radisson", "novotel", "ibis", "mercure", "sheraton",
    "doubletree", "crowne plaza", "intercontinental", "fairmont", "ritz", "waldorf",
    "sofitel", "westin", "melia", "hampton by hilton", "park plaza", "apex", "thistle", "oyo", "dorsett"
  ];

  return allowed.some((word) => text.includes(word));
}

function hotelTextForLocation(hotel) {
  return normal([
    hotel?.name,
    hotel?.hotel_name,
    hotel?.hotelName,
    hotel?.address,
    hotel?.addressLine,
    hotel?.address_line,
    hotel?.fullAddress,
    hotel?.location?.address,
    hotel?.description,
    rawHotelCity(hotel)
  ].filter(Boolean).join(" "));
}

function sameLocation(hotel, country, city) {
  const hotelCountryValue = hotelCountry(hotel);
  if (hotelCountryValue && !countryMatches(hotelCountryValue, country)) return false;

  const wantedCity = canonicalCity(city, country);
  if (!wantedCity) return true;

  const actualCity = rawHotelCity(hotel);
  if (actualCity) return sameCanonicalCity(actualCity, wantedCity, country);

  // No real city from supplier: do NOT invent the selected city.
  // Only allow it if the supplier text itself clearly names the requested city.
  return hotelTextForLocation(hotel).includes(normal(wantedCity));
}

function customerReadyHotels(list, country, city) {
  const seen = new Set();
  const output = [];

  for (const hotel of Array.isArray(list) ? list : []) {
    const key = hotelKey(hotel).toLowerCase();
    if (!key || seen.has(key)) continue;
    if (!hotelName(hotel)) continue;
    if (!isHotelOnly(hotel)) continue;
    if (!sameLocation(hotel, country, city)) continue;

    seen.add(key);
    output.push(hotel);
  }

  output.sort((a, b) => {
    const aPrice = hotelPrice(a);
    const bPrice = hotelPrice(b);
    const aImage = hotelImage(a) ? 1 : 0;
    const bImage = hotelImage(b) ? 1 : 0;
    const aStars = hotelStars(a);
    const bStars = hotelStars(b);

    if (aPrice > 0 && bPrice <= 0) return -1;
    if (bPrice > 0 && aPrice <= 0) return 1;
    if (bImage !== aImage) return bImage - aImage;
    if (bStars !== aStars) return bStars - aStars;
    return hotelName(a).localeCompare(hotelName(b));
  });

  return output;
}

function mergeHotels(current, incoming, country, city) {
  return customerReadyHotels([...(current || []), ...(incoming || [])], country, city);
}

async function fetchJson(url, timeoutMs = 15000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(url, { cache: "no-store", signal: controller.signal, mode: "cors" });
    const data = await response.json().catch(() => ({}));
    return { ok: response.ok, data };
  } finally {
    clearTimeout(timer);
  }
}

const CUSTOMER_CITY_LISTS = {
  "united kingdom": ["London", "Manchester", "Birmingham", "Liverpool", "Leeds", "Bristol", "Edinburgh", "Glasgow", "Cardiff", "Belfast", "Newcastle upon Tyne", "Sheffield", "Nottingham", "Leicester", "Southampton", "Brighton", "Oxford", "Cambridge", "York", "Bath", "Blackpool", "Bournemouth"],
  "canada": ["Toronto", "Vancouver", "Montreal", "Calgary", "Ottawa", "Quebec City", "Edmonton", "Winnipeg", "Halifax", "Victoria"],
  "united states": ["New York", "Los Angeles", "Las Vegas", "Miami", "Orlando", "Chicago", "San Francisco", "Washington", "Boston", "Seattle"],
  "united arab emirates": ["Dubai", "Abu Dhabi"],
  "france": ["Paris", "Nice", "Lyon", "Marseille"],
  "nigeria": ["Lagos", "Abuja"],
  "bahamas": ["Nassau"]
};

function customerCityList(country, sourceCities = []) {
  const key = canonicalCountry(country);
  const curated = CUSTOMER_CITY_LISTS[key];
  if (curated && curated.length) return curated;

  const seen = new Set();
  return (sourceCities || [])
    .map((item) => canonicalCity(item.city || item.name || item.label || item, country))
    .filter((city) => {
      const n = normal(city);
      if (!n || seen.has(n)) return false;
      seen.add(n);
      return true;
    })
    .sort((a, b) => a.localeCompare(b));
}

const FX = ["GBP", "USD", "EUR", "AED", "NGN", "CAD", "AUD", "JPY"];
const PAGE_SIZE = 97;
const DESTINATION_CACHE_KEY = "msh_destinations_v11_major_cities_only";
const SEARCH_CACHE_PREFIX = "msh_hotels_platform_v2_strict_location_no_mixed_v21_";

function clearOldHotelCaches() {
  try {
    Object.keys(localStorage)
      .filter((key) => key.startsWith("msh_hotels_") || key.startsWith("msh_destinations_v8") || key.startsWith("msh_destinations_v10"))
      .forEach((key) => localStorage.removeItem(key));
  } catch {}
}

function cacheKey(country, city, checkIn, checkOut, guests, rooms, currency) {
  return `${SEARCH_CACHE_PREFIX}${normal(country)}_${normal(city)}_${checkIn}_${checkOut}_${guests}_${rooms}_${currency}`;
}

function readCache(key) {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed?.createdAt || Date.now() - parsed.createdAt > 10 * 60 * 1000) return null;
    return parsed.value;
  } catch {
    return null;
  }
}

function writeCache(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify({ createdAt: Date.now(), value }));
  } catch {}
}

function SearchSkeleton() {
  return (
    <div style={styles.skeletonGrid}>
      {Array.from({ length: 6 }).map((_, index) => (
        <div key={index} style={styles.skeletonCard}>
          <div style={styles.skeletonImage} />
          <div style={styles.skeletonLineBig} />
          <div style={styles.skeletonLine} />
          <div style={styles.skeletonLineShort} />
        </div>
      ))}
    </div>
  );
}

function Stars({ count }) {
  if (!count) return null;
  return <span style={styles.stars}>{"â˜…".repeat(Math.min(5, count))}</span>;
}

function HotelImage({ hotel }) {
  const [failed, setFailed] = useState(false);
  const image = hotelImage(hotel);

  if (!image || failed) {
    return (
      <div style={styles.imageFallback}>
        Hotel image unavailable from supplier
      </div>
    );
  }

  return (
    <img
      src={image}
      alt={hotelName(hotel)}
      style={styles.hotelImage}
      loading="lazy"
      referrerPolicy="no-referrer"
      onError={() => setFailed(true)}
    />
  );
}

export default function HotelSearchPage({ apiBase }) {
  const API_BASE = clean(apiBase || "http://localhost:5050").replace(/\/$/, "");
  const API_BASES = Array.from(new Set([
    API_BASE,
    "http://localhost:5050",
    "http://127.0.0.1:5050"
  ].map((item) => clean(item).replace(/\/$/, "")).filter(Boolean)));

  const [countries, setCountries] = useState([]);
  const [country, setCountry] = useState("");
  const [city, setCity] = useState("");
  const [checkIn, setCheckIn] = useState(todayISO());
  const [checkOut, setCheckOut] = useState(tomorrowISO());
  const [guests, setGuests] = useState(2);
  const [rooms, setRooms] = useState(1);
  const [currency, setCurrency] = useState("GBP");
  const [hotels, setHotels] = useState([]);
  const [selectedHotel, setSelectedHotel] = useState(null);
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [message, setMessage] = useState("");
  const [offset, setOffset] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [sortMode, setSortMode] = useState("recommended");
  const [quickFilter, setQuickFilter] = useState("all");
  const [starFilter, setStarFilter] = useState("all");
  const [customerName, setCustomerName] = useState("");
  const [customerEmail, setCustomerEmail] = useState("");
  const [customerPhone, setCustomerPhone] = useState("");
  const [specialRequests, setSpecialRequests] = useState("");
  const [checkoutMessage, setCheckoutMessage] = useState("");
  const [checkingRates, setCheckingRates] = useState({});
  const resultBoxRef = useRef(null);

  const cities = useMemo(() => {
    const found = countries.find((item) => clean(item.country) === country);
    return customerCityList(country, found?.cities || []);
  }, [countries, country]);

  const nights = useMemo(() => nightsBetween(checkIn, checkOut), [checkIn, checkOut]);
  const selectedPrice = hotelPrice(selectedHotel);
  const selectedCurrency = hotelCurrency(selectedHotel, currency);
  const stayTotal = selectedPrice * Math.max(1, Number(rooms || 1)) * nights;

  const visibleHotels = useMemo(() => {
    let list = customerReadyHotels(hotels, country, city);

    if (quickFilter === "priced") list = list.filter((hotel) => hotelPrice(hotel) > 0);
    if (quickFilter === "images") list = list.filter((hotel) => hotelImage(hotel));
    if (quickFilter === "freeCancellation") {
      list = list.filter((hotel) => normal(hotelCancellation(hotel)).includes("free"));
    }

    if (starFilter !== "all") {
      const minStars = Number(starFilter);
      list = list.filter((hotel) => hotelStars(hotel) >= minStars);
    }

    if (sortMode === "priceLow") {
      list.sort((a, b) => (hotelPrice(a) || Number.MAX_SAFE_INTEGER) - (hotelPrice(b) || Number.MAX_SAFE_INTEGER));
    } else if (sortMode === "rating") {
      list.sort((a, b) => hotelStars(b) - hotelStars(a));
    } else if (sortMode === "name") {
      list.sort((a, b) => hotelName(a).localeCompare(hotelName(b)));
    }

    return list;
  }, [hotels, quickFilter, starFilter, sortMode, country, city]);

  useEffect(() => {
    clearOldHotelCaches();
    loadDestinations();
  }, []);

  async function loadDestinations() {
    setMessage("");

    const cached = readCache(DESTINATION_CACHE_KEY);
    if (Array.isArray(cached) && cached.length) setCountries(cached);

    const paths = ["/api/global-countries", "/api/public-countries", "/api/countries", "/api/destinations", "/destinations"];

    for (const base of API_BASES) {
      for (const path of paths) {
        try {
          const { ok, data } = await fetchJson(`${base}${path}`, 4500);
          const list = Array.isArray(data?.countries) ? data.countries : Array.isArray(data) ? data : [];
          if (ok && list.length) {
            const cleaned = list.map((row) => ({
              ...row,
              country: clean(row.country),
              cities: customerCityList(row.country, row.cities || [])
            })).filter((row) => row.country && row.cities.length);
            setCountries(cleaned);
            writeCache(DESTINATION_CACHE_KEY, cleaned);
            return;
          }
        } catch {}
      }
    }

    if (!cached?.length) setMessage("Please refresh the page to load destinations.");
  }

  function buildParams(nextOffset, nextLimit = PAGE_SIZE) {
    return new URLSearchParams({
      country,
      city,
      destinationCountry: country,
      destinationCity: city,
      strictCity: "true",
      checkIn,
      checkOut,
      check_in: checkIn,
      check_out: checkOut,
      checkin: checkIn,
      checkout: checkOut,
      guests: String(guests),
      rooms: String(rooms),
      currency,
      propertyType: "hotels",
      property_type: "hotels",
      accommodationMode: "hotel_only",
      supplierScope: "webbeds_ratehawk_hyperguest_hotelbeds",
      limit: String(nextLimit),
      offset: String(nextOffset),
      _: String(Date.now())
    });
  }

  async function fetchHotelPage(nextOffset, nextLimit = PAGE_SIZE) {
    const params = buildParams(nextOffset, nextLimit);
    const paths = ["/api/platform/v2/search"];

    for (const base of API_BASES) {
      for (const path of paths) {
        try {
          const { ok, data } = await fetchJson(`${base}${path}?${params.toString()}`, 15000);
          const supplierHotels = Array.isArray(data?.allHotels) ? data.allHotels : [];
          const standardHotels = Array.isArray(data?.hotels) ? data.hotels : [];
          const list = supplierHotels.length ? supplierHotels : standardHotels;
          const ready = customerReadyHotels(list, country, city);

          if (ok && ready.length) {
            return { data, list: ready };
          }

          if (ok && list.length && !ready.length) {
            return {
              data: {
                ...data,
                customerMessage: `Live suppliers returned hotels, but none matched ${city}. Please choose another city or date.`
              },
              list: []
            };
          }
        } catch {}
      }
    }

    return { data: {}, list: [] };
  }

  async function refreshHotelPrice(hotel) {
    return hotel;
  }

  async function checkLiveRate(hotel) {
    if (!hotel) return;
    const key = hotelKey(hotel);
    setCheckoutMessage("");
    setCheckingRates((current) => ({ ...current, [key]: true }));
    setSelectedHotel(hotel);

    try {
      const refreshed = await refreshHotelPrice(hotel);
      setSelectedHotel(refreshed);
      setHotels((current) => mergeHotels([refreshed], current, country, city));
      if (hotelPrice(refreshed) <= 0) {
        setCheckoutMessage("Today's price is not available for this hotel right now. Please choose another hotel or try again shortly.");
      }
    } finally {
      setCheckingRates((current) => ({ ...current, [key]: false }));
    }
  }

  async function searchHotels() {
    setMessage("");
    setCheckoutMessage("");
    setSelectedHotel(null);
    setHotels([]);
    setOffset(0);
    setHasMore(false);
    clearOldHotelCaches();

    if (!country || !city) {
      setMessage("Please choose your destination before searching.");
      return;
    }

    if (new Date(checkOut) <= new Date(checkIn)) {
      setMessage("Please choose a check-out date after your check-in date.");
      return;
    }

    const key = cacheKey(country, city, checkIn, checkOut, guests, rooms, currency);
    localStorage.removeItem(key);

    setLoading(true);

    try {
      const params = new URLSearchParams({
  city,
  country,
  currency,
  guests: String(guests || 2),
  rooms: String(rooms || 1),
  checkIn,
  checkOut
});

const response = await fetch(`${apiBase}/api/platform/v2/search?${params.toString()}&supplierScope=webbeds_ratehawk_hyperguest_hotelbeds&limit=1000`);
const data = await response.json();
const result = { data, list: Array.isArray(data.hotels) ? data.hotels : Array.isArray(data.allHotels) ? data.allHotels : [] };
const list = result.list;

      if (list.length) {
        setHotels(list);
        writeCache(key, list);
        setOffset(list.length);
        setHasMore(Boolean(result.data?.hasMore) || (Number(result.data?.totalAvailable || 0) > list.length));
        setTimeout(() => resultBoxRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }), 80);
      } else {
        setMessage(result.data?.customerMessage || "We could not find available hotels for this destination right now. Please try another city or date.");
      }
    } catch {
      setMessage("We could not find available hotels for this destination right now. Please try another city or date.");
    } finally {
      setLoading(false);
    }
  }

  async function loadMoreHotels() {
    if (loadingMore || !hasMore || !country || !city) return;

    setLoadingMore(true);
    setMessage("");

    try {
      const result = await fetchHotelPage(offset, PAGE_SIZE);
      const list = result.list;

      if (list.length) {
        setHotels((current) => {
          const merged = mergeHotels(current, list, country, city);
          writeCache(cacheKey(country, city, checkIn, checkOut, guests, rooms, currency), merged);
          return merged;
        });
        setOffset((current) => current + list.length);
        setHasMore(Boolean(result.data?.hasMore) || (Number(result.data?.totalAvailable || 0) > offset + list.length));
      } else {
        setHasMore(false);
      }
    } catch {
      setHasMore(false);
    } finally {
      setLoadingMore(false);
    }
  }

  function onResultsScroll(event) {
    const box = event.currentTarget;
    if (box.scrollTop + box.clientHeight >= box.scrollHeight - 260) loadMoreHotels();
  }

  async function selectHotel(hotel) {
    setCheckoutMessage("");
    setSelectedHotel(hotel);
  }

  async function continueToCheckout() {
    setCheckoutMessage("");

    if (!selectedHotel) {
      setCheckoutMessage("Please choose a hotel first.");
      return;
    }

    const finalHotel = selectedHotel;
    const finalPrice = hotelPrice(finalHotel);

    if (finalPrice <= 0) {
      setCheckoutMessage("Today's price is still being checked. Please choose another hotel or try again shortly.");
      return;
    }

    if (!clean(customerName) || !clean(customerEmail)) {
      setCheckoutMessage("Please enter your name and email address before checkout.");
      return;
    }

    try {
      const room = firstRoom(finalHotel);
      const finalCurrency = hotelCurrency(finalHotel, currency);
      const payload = {
        hotelId: finalHotel.hotelId || finalHotel.hotel_id || finalHotel.id || "",
        hotelName: hotelName(finalHotel),
        roomCode: room?.roomCode || "STANDARD",
        roomName: hotelRoomName(finalHotel),
        country: hotelDisplayCountry(finalHotel, country),
        city: hotelCity(finalHotel),
        checkIn,
        checkOut,
        guests: Number(guests || 1),
        rooms: Number(rooms || 1),
        amount: finalPrice * Math.max(1, Number(rooms || 1)) * nights,
        currency: finalCurrency,
        customerName,
        customerEmail,
        customerPhone,
        specialRequests,
        rate_source_id: room?.rate_source_id || finalHotel.rate_source_id || "",
        rate_source_timestamp: room?.rate_source_timestamp || finalHotel.rate_source_timestamp || "",
      };

      const booking = await fetch(`${API_BASE}/api/book`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });

      const bookingData = await booking.json().catch(() => ({}));

      const checkout = await fetch(`${API_BASE}/api/create-checkout-session`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...payload, bookingRef: bookingData?.bookingRef || `MSH-${Date.now()}` })
      });

      const checkoutData = await checkout.json().catch(() => ({}));
      if (checkoutData?.ok && checkoutData?.url) {
        window.location.href = checkoutData.url;
        return;
      }

      setCheckoutMessage(checkoutData?.message || "Secure checkout is not available right now. Please try again shortly.");
    } catch {
      setCheckoutMessage("Secure checkout is not available right now. Please try again shortly.");
    }
  }

  const selectedImage = hotelImage(selectedHotel);
  const selectedStars = hotelStars(selectedHotel);
  const selectedFacilities = hotelFacilities(selectedHotel);
  const pricedCount = hotels.filter((hotel) => hotelPrice(hotel) > 0).length;

  return (
    <main style={styles.pageShell}>
      <section style={styles.topPanel}>
        <div>
          <div style={styles.smallPill}>Hotels and worldwide travel support</div>
          <h1 style={styles.heroTitle}>{country && city ? `Hotels in ${city}` : "Find your hotel"}</h1>
          <p style={styles.heroText}>Choose your destination, compare hotels and continue with a clear stay summary.</p>
        </div>
        <div style={styles.promiseRow}>
          <span>Clear totals</span>
          <span>Guest support</span>
          <span>Secure checkout</span>
        </div>
      </section>

      <section style={styles.searchPanel}>
        <label style={styles.field}>Country
          <select style={styles.input} value={country} onChange={(event) => {
            setCountry(event.target.value);
            setCity("");
            setHotels([]);
            setSelectedHotel(null);
            setMessage("");
            clearOldHotelCaches();
          }}>
            <option value="">Select country</option>
            {countries.map((item) => (
              <option key={item.country} value={item.country}>{item.country}</option>
            ))}
          </select>
        </label>

        <label style={styles.field}>City
          <select style={styles.input} value={city} disabled={!country} onChange={(event) => {
            setCity(event.target.value);
            setHotels([]);
            setSelectedHotel(null);
            setMessage("");
            clearOldHotelCaches();
          }}>
            <option value="">{country ? "Select city" : "Select country first"}</option>
            {cities.map((item) => <option key={item} value={item}>{item}</option>)}
          </select>
        </label>

        <label style={styles.field}>Check-in
          <input style={styles.input} type="date" value={checkIn} onChange={(event) => setCheckIn(event.target.value)} />
        </label>

        <label style={styles.field}>Check-out
          <input style={styles.input} type="date" value={checkOut} onChange={(event) => setCheckOut(event.target.value)} />
        </label>

        <label style={styles.field}>Guests
          <input style={styles.input} type="number" min="1" max="20" value={guests} onChange={(event) => setGuests(Number(event.target.value))} />
        </label>

        <label style={styles.field}>Rooms
          <input style={styles.input} type="number" min="1" max="10" value={rooms} onChange={(event) => setRooms(Number(event.target.value))} />
        </label>

        <label style={styles.field}>Currency
          <select style={styles.input} value={currency} onChange={(event) => setCurrency(event.target.value)}>
            {FX.map((item) => <option key={item} value={item}>{item}</option>)}
          </select>
        </label>

        <button style={styles.searchButton} onClick={searchHotels} disabled={loading}>
          {loading ? "Finding hotels..." : "Search hotels"}
        </button>
      </section>

      {hotels.length > 0 ? (
        <section style={styles.controls}>
          <div style={styles.resultCount}>
            {visibleHotels.length ? `${visibleHotels.length} live priced hotels` : ""}
          </div>
          <label style={styles.controlLabel}>Show
            <select style={styles.controlInput} value={quickFilter} onChange={(event) => setQuickFilter(event.target.value)}>
              <option value="all">All hotels</option>
              <option value="priced">Today's prices</option>
              <option value="images">With images</option>
              <option value="freeCancellation">Free cancellation</option>
            </select>
          </label>
          <label style={styles.controlLabel}>Stars
            <select style={styles.controlInput} value={starFilter} onChange={(event) => setStarFilter(event.target.value)}>
              <option value="all">Any rating</option>
              <option value="5">5 stars</option>
              <option value="4">4 stars and above</option>
              <option value="3">3 stars and above</option>
            </select>
          </label>
          <label style={styles.controlLabel}>Sort
            <select style={styles.controlInput} value={sortMode} onChange={(event) => setSortMode(event.target.value)}>
              <option value="recommended">Recommended</option>
              <option value="priceLow">Lowest price first</option>
              <option value="rating">Highest rating</option>
              <option value="name">Hotel name</option>
            </select>
          </label>
        </section>
      ) : null}

      {message ? <div style={styles.message}>{message}</div> : null}

      <section ref={resultBoxRef} style={styles.contentGrid}>
        <div>
          <div style={styles.resultHeader}>
            <h2 style={styles.sectionTitle}>Available hotels</h2>
            {hasMore ? <button style={styles.inlineMoreButton} onClick={loadMoreHotels} disabled={loadingMore}>{loadingMore ? "Loading..." : "More hotels"}</button> : null}
          </div>

          {loading && hotels.length === 0 ? <SearchSkeleton /> : null}

          {!loading && hotels.length === 0 ? (
            <div style={styles.emptyBox}>Choose your destination and dates to view available hotels.</div>
          ) : null}

          {visibleHotels.length > 0 ? (
            <div style={styles.resultsBox} onScroll={onResultsScroll}>
              {visibleHotels.map((hotel) => {
                const price = hotelPrice(hotel);
                const ccy = hotelCurrency(hotel, currency);
                const total = price * Math.max(1, Number(rooms || 1)) * nights;
                const selected = hotelKey(selectedHotel) === hotelKey(hotel);
                const stars = hotelStars(hotel);
                const score = reviewScore(hotel);
                const facilities = hotelFacilities(hotel);
                const cancellation = hotelCancellation(hotel);
                const checking = Boolean(checkingRates[hotelKey(hotel)]);

                return (
                  <article key={hotelKey(hotel)} style={selected ? styles.hotelCardSelected : styles.hotelCard}>
                    <HotelImage hotel={hotel} />

                    <div style={styles.hotelInfo}>
                      <div style={styles.cardTopLine}>
                        <div style={styles.badge}>{selected ? "Selected" : "Hotel"}</div>
                        <Stars count={stars} />
                      </div>

                      <h3 style={styles.hotelTitle}>{hotelName(hotel)}</h3>
                      <div style={styles.muted}>{hotelDisplayCity(hotel)}, {hotelDisplayCountry(hotel, country)}</div>

                      <div style={styles.tagRow}>
                        <span>Clear total</span>
                        {score ? <span>Guest score {score}</span> : <span>{hotelBoard(hotel)}</span>}
                      </div>

                      {facilities.length ? (
                        <div style={styles.facilityRow}>
                          {facilities.map((item) => <span key={item}>{item}</span>)}
                        </div>
                      ) : null}

                      {cancellation ? <div style={styles.policyText}>{cancellation}</div> : null}

                      {price > 0 ? (
                        <>
                          <div style={styles.priceLine}>{ccy} {money(price)}</div>
                          <div style={styles.smallText}>Live stay total: {ccy} {money(total)}</div>
                        </>
                      ) : (
                        <div style={styles.pricePending}>Check today's price</div>
                      )}

                      <button style={styles.selectButton} onClick={() => price > 0 ? selectHotel(hotel) : checkLiveRate(hotel)} disabled={checking}>
                        {checking ? "Checking price..." : price > 0 ? "Select hotel" : "Check today's price"}
                      </button>
                    </div>
                  </article>
                );
              })}

              {hasMore ? (
                <button style={styles.loadMoreButton} onClick={loadMoreHotels} disabled={loadingMore}>
                  {loadingMore ? "Finding more hotels..." : "Show more hotels"}
                </button>
              ) : null}
            </div>
          ) : null}
        </div>

        <aside style={styles.summaryBox}>
          <h2 style={styles.summaryTitle}>Booking Summary</h2>

          {!selectedHotel ? (
            <div style={styles.softBox}>Select a hotel to review your stay and continue to checkout.</div>
          ) : (
            <>
              {selectedImage ? <img src={selectedImage} alt={hotelName(selectedHotel)} style={styles.summaryImage} loading="lazy" referrerPolicy="no-referrer" /> : null}

              <div>
                <div style={styles.cardTopLine}>
                  <h3 style={styles.selectedName}>{hotelName(selectedHotel)}</h3>
                  <Stars count={selectedStars} />
                </div>
                <div style={styles.muted}>{hotelDisplayCity(selectedHotel)}, {hotelDisplayCountry(selectedHotel, country)}</div>
                <div style={styles.smallText}>{nights} night{nights === 1 ? "" : "s"}, {rooms} room{Number(rooms) === 1 ? "" : "s"}, {guests} guest{Number(guests) === 1 ? "" : "s"}</div>
              </div>

              {selectedFacilities.length ? (
                <div style={styles.facilityRow}>
                  {selectedFacilities.map((item) => <span key={item}>{item}</span>)}
                </div>
              ) : null}

              <div style={styles.totalBox}>
                <div>Estimated stay total</div>
                <strong>{stayTotal > 0 ? `${selectedCurrency} ${money(stayTotal)}` : "Checking today's price..."}</strong>
                <span>Price is confirmed before secure checkout.</span>
              </div>

              <input style={styles.input} placeholder="Full name" value={customerName} onChange={(event) => setCustomerName(event.target.value)} />
              <input style={styles.input} type="email" placeholder="Email address" value={customerEmail} onChange={(event) => setCustomerEmail(event.target.value)} />
              <input style={styles.input} placeholder="Phone number, optional" value={customerPhone} onChange={(event) => setCustomerPhone(event.target.value)} />
              <textarea style={styles.textarea} placeholder="Special requests, optional" value={specialRequests} onChange={(event) => setSpecialRequests(event.target.value)} />

              {checkoutMessage ? <div style={styles.message}>{checkoutMessage}</div> : null}

              <button style={styles.selectButton} onClick={() => checkLiveRate(selectedHotel)} disabled={Boolean(checkingRates[hotelKey(selectedHotel)])}>
                {Boolean(checkingRates[hotelKey(selectedHotel)]) ? "Checking latest price..." : "Check latest price"}
              </button>

              <button style={styles.checkoutButton} onClick={continueToCheckout}>
                Continue to secure checkout
              </button>
            </>
          )}
        </aside>
      </section>
    </main>
  );
}

const styles = {
  pageShell: { background: "#f4f7fb", minHeight: "100vh", padding: "14px 22px 40px", color: "#0b1d51" },
  topPanel: { display: "grid", gridTemplateColumns: "minmax(0, 1fr) auto", gap: 18, background: "#ffffff", borderRadius: 26, padding: "20px 24px", boxShadow: "0 14px 36px rgba(11,29,81,.08)", marginBottom: 16, overflow: "hidden", alignItems: "center" },
  smallPill: { display: "inline-block", background: "#eaf7f1", color: "#08764f", borderRadius: 999, padding: "7px 13px", fontWeight: 900, marginBottom: 10 },
  heroTitle: { fontSize: "clamp(32px, 4vw, 56px)", lineHeight: .95, margin: "0 0 10px", fontWeight: 1000, letterSpacing: "-.04em" },
  heroText: { fontSize: 17, color: "#536580", maxWidth: 760, margin: 0, lineHeight: 1.45, fontWeight: 700 },
  promiseRow: { display: "flex", flexWrap: "wrap", gap: 10, justifyContent: "flex-end" },
  searchPanel: { background: "#ffffff", borderRadius: 26, padding: 20, display: "grid", gridTemplateColumns: "repeat(4, minmax(160px, 1fr))", gap: 12, alignItems: "end", boxShadow: "0 14px 36px rgba(11,29,81,.08)", marginBottom: 16 },
  field: { display: "grid", gap: 7, fontWeight: 950, color: "#0b1d51" },
  input: { width: "100%", boxSizing: "border-box", border: "1px solid #d8e2f0", borderRadius: 15, padding: "13px 15px", fontSize: 16, background: "#ffffff", color: "#0f172a", marginTop: 6 },
  searchButton: { border: 0, borderRadius: 15, background: "#3057d5", color: "#ffffff", padding: "15px 18px", fontWeight: 1000, fontSize: 16, cursor: "pointer", minHeight: 52 },
  controls: { display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, background: "#ffffff", borderRadius: 20, padding: 14, marginBottom: 16, boxShadow: "0 10px 24px rgba(11,29,81,.06)", flexWrap: "wrap" },
  resultCount: { fontWeight: 1000, color: "#0b1d51" },
  controlLabel: { display: "flex", alignItems: "center", gap: 9, fontWeight: 900 },
  controlInput: { border: "1px solid #d8e2f0", borderRadius: 12, padding: "10px 12px", background: "#ffffff", fontWeight: 800 },
  message: { background: "#fff7ed", border: "1px solid #fed7aa", color: "#9a3412", padding: 15, borderRadius: 18, fontWeight: 900, margin: "14px 0" },
  contentGrid: { display: "grid", gridTemplateColumns: "minmax(0, 1fr) 330px", gap: 20, alignItems: "start" },
  resultHeader: { display: "flex", justifyContent: "space-between", gap: 12, alignItems: "center" },
  sectionTitle: { fontSize: 34, margin: "12px 0 14px", letterSpacing: "-.03em" },
  inlineMoreButton: { border: "1px solid #d8e2f0", borderRadius: 14, background: "#ffffff", color: "#0b1d51", padding: "12px 15px", fontWeight: 1000, cursor: "pointer" },
  emptyBox: { background: "#ffffff", borderRadius: 22, padding: 26, fontWeight: 900, color: "#536580" },
  resultsBox: { maxHeight: "76vh", overflowY: "auto", paddingRight: 8, display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(270px, 1fr))", gap: 16, scrollBehavior: "smooth" },
  hotelCard: { background: "#ffffff", borderRadius: 22, overflow: "hidden", border: "1px solid #e2e8f0", boxShadow: "0 14px 34px rgba(11,29,81,.08)" },
  hotelCardSelected: { background: "#ffffff", borderRadius: 22, overflow: "hidden", border: "3px solid #0b1d51", boxShadow: "0 14px 34px rgba(11,29,81,.12)" },
  hotelImage: { width: "100%", height: 172, objectFit: "cover", display: "block", background: "#eef3fa" },
  imageFallback: { height: 172, display: "grid", placeItems: "center", background: "#eef3fa", color: "#64748b", fontWeight: 900, textAlign: "center", padding: 14 },
  hotelInfo: { padding: 16, display: "grid", gap: 9 },
  cardTopLine: { display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 },
  badge: { justifySelf: "start", background: "#eaf7f1", color: "#08764f", borderRadius: 999, padding: "7px 12px", fontWeight: 1000, fontSize: 13 },
  stars: { color: "#f5b301", fontWeight: 1000, letterSpacing: 1 },
  hotelTitle: { fontSize: 22, lineHeight: 1.08, margin: 0, fontWeight: 1000 },
  muted: { color: "#536580", fontWeight: 800 },
  tagRow: { display: "flex", flexWrap: "wrap", gap: 7 },
  facilityRow: { display: "flex", flexWrap: "wrap", gap: 7 },
  policyText: { color: "#536580", fontWeight: 800, fontSize: 13 },
  priceLine: { color: "#3057d5", fontSize: 28, fontWeight: 1000, marginTop: 3 },
  pricePending: { color: "#0b1d51", fontSize: 16, fontWeight: 950, background: "#f1f5f9", padding: 11, borderRadius: 14 },
  smallText: { color: "#536580", fontWeight: 850 },
  selectButton: { background: "#0b1d51", color: "#ffffff", border: 0, borderRadius: 15, padding: "13px 16px", fontWeight: 1000, fontSize: 16, cursor: "pointer", marginTop: 7 },
  loadMoreButton: { gridColumn: "1 / -1", border: 0, borderRadius: 18, background: "#ffffff", color: "#0b1d51", padding: 17, fontWeight: 1000, fontSize: 16, cursor: "pointer", boxShadow: "0 10px 24px rgba(11,29,81,.08)" },
  summaryBox: { position: "sticky", top: 14, background: "#ffffff", borderRadius: 26, padding: 20, boxShadow: "0 14px 36px rgba(11,29,81,.10)", display: "grid", gap: 13 },
  summaryImage: { width: "100%", height: 145, objectFit: "cover", borderRadius: 18, background: "#eef3fa" },
  summaryTitle: { margin: 0, fontSize: 27, fontWeight: 1000 },
  softBox: { background: "#f1f5f9", borderRadius: 18, padding: 17, color: "#536580", fontWeight: 900, lineHeight: 1.5 },
  selectedName: { fontSize: 20, margin: 0, lineHeight: 1.12 },
  totalBox: { background: "#eaf7f1", borderRadius: 18, padding: 17, display: "grid", gap: 6, fontWeight: 900 },
  textarea: { width: "100%", minHeight: 82, boxSizing: "border-box", border: "1px solid #d8e2f0", borderRadius: 15, padding: 14, fontSize: 16, resize: "vertical", marginTop: 6 },
  checkoutButton: { background: "#10b981", color: "#ffffff", border: 0, borderRadius: 15, padding: "15px 18px", fontWeight: 1000, fontSize: 16, cursor: "pointer" },
  skeletonGrid: { display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(270px, 1fr))", gap: 16 },
  skeletonCard: { background: "#ffffff", borderRadius: 22, padding: 16, display: "grid", gap: 12, boxShadow: "0 14px 34px rgba(11,29,81,.08)" },
  skeletonImage: { height: 160, borderRadius: 18, background: "#e8eef7" },
  skeletonLineBig: { height: 24, width: "80%", borderRadius: 999, background: "#e8eef7" },
  skeletonLine: { height: 16, width: "65%", borderRadius: 999, background: "#e8eef7" },
  skeletonLineShort: { height: 16, width: "45%", borderRadius: 999, background: "#e8eef7" },
};








