import React, { useEffect, useMemo, useState } from "react";

const API_BASE =
  import.meta.env.VITE_API_BASE ||
  import.meta.env.VITE_API_BASE_URL ||
  "http://127.0.0.1:5050";

const STRIPE_PAYMENT_LINK =
  import.meta.env.VITE_STRIPE_PAYMENT_LINK ||
  import.meta.env.VITE_PUBLIC_STRIPE_PAYMENT_LINK ||
  "";

const ROUTES = {
  hotels: "/",
  compare: "/#/compare-prices",
  guide: "/#/destination-guide",
  about: "/#/about-us",
  faq: "/#/faq",
  reviews: "/#/guest-reviews",
  support: "/#/support-centre",
  partners: "/#/industry-partnerships",
  affiliates: "/#/affiliate-network",
  business: "/#/business-portal",
};

const FX = {
  GBP: 1,
  USD: 1.27,
  EUR: 1.17,
  AED: 4.66,
  NGN: 1900,
  CAD: 1.73,
  AUD: 1.93,
  JPY: 199,
};

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

function tomorrowISO() {
  return new Date(Date.now() + 86400000).toISOString().slice(0, 10);
}

function money(v) {
  const n = Number(v || 0);
  return Number.isFinite(n)
    ? n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })
    : "0.00";
}

function nightsBetween(a, b) {
  const start = new Date(a);
  const end = new Date(b);
  const diff = Math.ceil((end - start) / 86400000);
  return Number.isFinite(diff) && diff > 0 ? diff : 1;
}

function routeUrl(path) {
  return `${window.location.origin}${path}`;
}

function mapSearch(type, query) {
  return `https://www.google.com/maps/search/${encodeURIComponent(`${type} near ${query}`)}`;
}

function currentRoute() {
  const hash = window.location.hash || "";
  if (hash === "#/compare-prices") return "compare";
  if (hash === "#/destination-guide") return "guide";
  if (hash === "#/about-us") return "about";
  if (hash === "#/faq") return "faq";
  if (hash === "#/guest-reviews") return "reviews";
  if (hash === "#/support-centre") return "support";
  if (hash === "#/industry-partnerships") return "partners";
  if (hash === "#/affiliate-network") return "affiliates";
  if (hash === "#/business-portal") return "business";
  return "hotels";
}

function convertCurrency(amount, from, to) {
  const base = Number(amount || 0) / (FX[from] || 1);
  return base * (FX[to] || 1);
}

function safeNumber(v) {
  const n = Number(v || 0);
  return Number.isFinite(n) ? n : 0;
}

function hotelKey(hotel) {
  return hotel?.hotelId || hotel?.hotel_id || hotel?.id || hotel?.code || hotel?.name || "";
}

function hotelPrice(hotel) {
  return safeNumber(
    hotel?.selectedRoom?.convertedPrice ||
      hotel?.selectedRoom?.price ||
      hotel?.price ||
      hotel?.amount ||
      hotel?.nightly_rate ||
      hotel?.rate ||
      hotel?.rooms?.[0]?.convertedPrice ||
      hotel?.rooms?.[0]?.price ||
      0
  );
}

function hotelCurrency(hotel, fallback = "GBP") {
  return (
    hotel?.selectedRoom?.displayCurrency ||
    hotel?.currency ||
    hotel?.displayCurrency ||
    hotel?.rooms?.[0]?.displayCurrency ||
    fallback
  );
}

function hotelRoomCode(hotel) {
  return hotel?.selectedRoom?.roomCode || hotel?.rooms?.[0]?.roomCode || hotel?.roomCode || "STANDARD";
}

function hotelRoomName(hotel) {
  return hotel?.selectedRoom?.roomName || hotel?.rooms?.[0]?.roomName || hotel?.roomName || "Available room";
}

function hotelRateSourceId(hotel) {
  return (
    hotel?.selectedRoom?.rate_source_id ||
    hotel?.rate_source_id ||
    hotel?.rooms?.[0]?.rate_source_id ||
    ""
  );
}

function hotelRateSourceTimestamp(hotel) {
  return (
    hotel?.selectedRoom?.rate_source_timestamp ||
    hotel?.rate_source_timestamp ||
    hotel?.rooms?.[0]?.rate_source_timestamp ||
    ""
  );
}

function cleanList(list) {
  return Array.from(new Set((list || []).map((x) => String(x || "").trim()).filter(Boolean))).sort((a, b) =>
    a.localeCompare(b)
  );
}

function buildComparisons(selectedHotel, hotels, nights, rooms, fallbackCurrency) {
  if (!selectedHotel) return [];

  const baseNight = hotelPrice(selectedHotel);
  const currency = hotelCurrency(selectedHotel, fallbackCurrency);
  const stayMultiplier = Math.max(1, Number(nights || 1)) * Math.max(1, Number(rooms || 1));
  const selectedName = selectedHotel.name || "Selected hotel";

  const selectedOptions = [
    {
      id: "best-value",
      hotelName: selectedName,
      label: "Best value stay",
      text: "Clear price review before secure checkout.",
      badge: "Best value",
      currency,
      total: baseNight * stayMultiplier,
    },
    {
      id: "flexible",
      hotelName: selectedName,
      label: "Flexible stay option",
      text: "A useful comparison for guests who want extra flexibility.",
      badge: "Flexible",
      currency,
      total: baseNight * 1.08 * stayMultiplier,
    },
    {
      id: "comfort",
      hotelName: selectedName,
      label: "Extra comfort stay",
      text: "A higher-comfort comparison for longer or special trips.",
      badge: "Comfort",
      currency,
      total: baseNight * 1.16 * stayMultiplier,
    },
  ];

  const alternatives = (hotels || [])
    .filter((h) => hotelKey(h) !== hotelKey(selectedHotel))
    .slice(0, 4)
    .map((hotel, idx) => {
      const price = hotelPrice(hotel);
      return {
        id: `alt-${hotelKey(hotel) || idx}`,
        hotelName: hotel.name || "Nearby hotel",
        label: idx === 0 ? "Nearby alternative" : "Destination alternative",
        text: `${hotel.city || selectedHotel.city || "Destination"}, ${hotel.country || selectedHotel.country || ""}`,
        badge: "Compare",
        currency: hotelCurrency(hotel, currency),
        total: price * stayMultiplier,
      };
    });

  return [...selectedOptions, ...alternatives];
}

function validHotelImage(hotel) {
  const image = hotel?.image || hotel?.image_url || hotel?.photo || hotel?.thumbnail;
  return typeof image === "string" && image.startsWith("http") ? image : "";
}


// MSH LIVE COMPARE PRICE HELPERS START
async function fetchBestCustomerPrice({ country, city, hotelId, hotelName, currency }) {
  if (!country || !city || (!hotelId && !hotelName)) return null;

  const params = new URLSearchParams({
    country: country || "",
    city: city || "",
    hotelId: hotelId || "",
    hotelName: hotelName || "",
    currency: currency || "GBP",
  });

  const res = await fetch(`${API_BASE}/api/compare-prices?${params.toString()}`, {
    cache: "no-store",
  });

  const data = await res.json();

  if (!res.ok || !data.ok) {
    throw new Error(data.message || "Could not compare prices right now.");
  }

  return data;
}
// MSH LIVE COMPARE PRICE HELPERS END

function selectedHotelWithRoom(hotel) {
  const firstRoom = Array.isArray(hotel?.rooms) && hotel.rooms.length ? hotel.rooms[0] : null;

  return {
    ...hotel,
    selectedRoom: firstRoom,
    price: safeNumber(firstRoom?.convertedPrice || firstRoom?.price || hotel?.price || 0),
    currency: firstRoom?.displayCurrency || hotel?.currency || "GBP",
    roomCode: firstRoom?.roomCode || hotel?.roomCode || "STANDARD",
    roomName: firstRoom?.roomName || hotel?.roomName || "Available room",
    rate_source_id: firstRoom?.rate_source_id || hotel?.rate_source_id || "",
    rate_source_timestamp: firstRoom?.rate_source_timestamp || hotel?.rate_source_timestamp || "",
  };
}

export default function App() {
  const [route, setRoute] = useState(currentRoute());
  const [affiliateCode, setAffiliateCode] = useState("");
  const [countries, setCountries] = useState([]);
  const [cities, setCities] = useState([]);
  const [country, setCountry] = useState("");
  const [city, setCity] = useState("");
  const [checkIn, setCheckIn] = useState(todayISO());
  const [checkOut, setCheckOut] = useState(tomorrowISO());
  const [guests, setGuests] = useState(2);
  const [rooms, setRooms] = useState(1);
  const [currency, setCurrency] = useState("GBP");
  const [hotels, setHotels] = useState([]);
  const [selectedHotel, setSelectedHotel] = useState(() => {
    try {
      const saved = localStorage.getItem("msh_selected_hotel");
      return saved ? JSON.parse(saved) : null;
    } catch {
      return null;
    }
  });
  const [notice, setNotice] = useState("");
  const [loading, setLoading] = useState(false);
  const [paying, setPaying] = useState(false);

  const [customerName, setCustomerName] = useState("");
  const [customerEmail, setCustomerEmail] = useState("");
  const [customerPhone, setCustomerPhone] = useState("");
  const [specialRequests, setSpecialRequests] = useState("");

  const [fxAmount, setFxAmount] = useState(100);
  const [fxFrom, setFxFrom] = useState("GBP");
  const [fxTo, setFxTo] = useState("USD");

  const [reviewSent, setReviewSent] = useState(false);
  const [partnerSent, setPartnerSent] = useState(false);
  const [compareLoading, setCompareLoading] = useState(false);
  const [compareResult, setCompareResult] = useState(null);
  const [compareNotice, setCompareNotice] = useState("");

  useEffect(() => {
    try {
      const params = new URLSearchParams(window.location.search || "");
      const ref = String(params.get("ref") || "").trim().toUpperCase();

      if (ref) {
        localStorage.setItem("msh_affiliate_code", ref);
        setAffiliateCode(ref);
      } else {
        const savedRef = String(localStorage.getItem("msh_affiliate_code") || "").trim().toUpperCase();
        if (savedRef) setAffiliateCode(savedRef);
      }
    } catch {}

    const onHashChange = () => setRoute(currentRoute());
    window.addEventListener("hashchange", onHashChange);
    onHashChange();
    return () => window.removeEventListener("hashchange", onHashChange);
  }, []);

  useEffect(() => {
    loadDestinations();
  }, []);

  useEffect(() => {
    const found = countries.find((x) => x.country === country);
    setCities(cleanList(found?.cities || []));
    setCity("");
    setHotels([]);
    setSelectedHotel(null);
  }, [country, countries]);

  const nights = useMemo(() => nightsBetween(checkIn, checkOut), [checkIn, checkOut]);
  const selectedNightPrice = hotelPrice(selectedHotel);
  const selectedCurrency = hotelCurrency(selectedHotel, currency);
  const selectedRoomCode = hotelRoomCode(selectedHotel);
  const selectedRoomName = hotelRoomName(selectedHotel);
  const selectedRateSourceId = hotelRateSourceId(selectedHotel);
  const selectedRateSourceTimestamp = hotelRateSourceTimestamp(selectedHotel);
  const totalPrice = selectedNightPrice * Math.max(1, Number(rooms || 1)) * nights;
  const destinationQuery = [selectedHotel?.name, city, country].filter(Boolean).join(", ") || "London";
  useEffect(() => {
    try {
      if (selectedHotel) {
        localStorage.setItem("msh_selected_hotel", JSON.stringify(selectedHotel));
      }
    } catch {}
  }, [selectedHotel]);

  const comparisons = useMemo(
    () => buildComparisons(selectedHotel, hotels, nights, rooms, currency),
    [selectedHotel, hotels, nights, rooms, currency]
  );

  async function loadDestinations() {
    try {
      const res = await fetch(`${API_BASE}/destinations`, { cache: "no-store" });
      const data = await res.json();
      const list = Array.isArray(data) ? data : [];
      setCountries(list);
      if (!list.length) setNotice("Destinations are being refreshed. Please try again shortly.");
    } catch {
      setNotice("We could not load destinations right now. Please refresh the page.");
    }
  }

  async function searchHotels() {
    setNotice("");
    setSelectedHotel(null);

    if (!country || !city) {
      setNotice("Please select your country and city before searching.");
      return;
    }

    if (new Date(checkOut) <= new Date(checkIn)) {
      setNotice("Please choose a check-out date after your check-in date.");
      return;
    }

    try {
      setLoading(true);
      const params = new URLSearchParams({
        country,
        city,
        check_in: checkIn,
        check_out: checkOut,
        checkin: checkIn,
        checkout: checkOut,
        guests: String(guests),
        rooms: String(rooms),
        currency,
      });

      const res = await fetch(`${API_BASE}/search?${params}`, { cache: "no-store" });
      const data = await res.json();
      const found = Array.isArray(data.hotels) ? data.hotels : [];
      setHotels(found);

      if (!found.length) {
        setNotice("No matching hotels were found for this search. Try another city or adjust your dates.");
      }
    } catch {
      setNotice("We could not load hotels for this destination right now. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  async function secureReservation() {
    setNotice("");

    if (!selectedHotel) {
      setNotice("Please select a hotel before continuing.");
      return;
    }

    if (!customerName.trim() || !customerEmail.trim()) {
      setNotice("Please enter the customer name and email address before checkout.");
      return;
    }

    if (!totalPrice || totalPrice <= 0) {
      setNotice("A valid stay price is required before secure payment can start.");
      return;
    }

    try {
      setPaying(true);

      const payload = {
        hotelId: selectedHotel.hotelId || selectedHotel.hotel_id || selectedHotel.id || "",
        hotelName: selectedHotel.name || "MySpace Hotel Reservation",
        roomCode: selectedRoomCode,
        roomName: selectedRoomName,
        country: selectedHotel.country || country,
        city: selectedHotel.city || city,
        checkIn,
        checkOut,
        guests: Number(guests || 1),
        rooms: Number(rooms || 1),
        amount: totalPrice,
        currency: selectedCurrency,
        customerName,
        customerEmail,
        customerPhone,
        specialRequests,
        rate_source_id: selectedRateSourceId,
        rate_source_timestamp: selectedRateSourceTimestamp,
        affiliateCode,
        affiliate_code: affiliateCode,
        ref: affiliateCode,
      };

      const bookingRes = await fetch(`${API_BASE}/api/book`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const bookingData = await bookingRes.json();
      const bookingRef = bookingData?.bookingRef || `MSH-${Date.now()}`;

      const checkoutRes = await fetch(`${API_BASE}/api/create-checkout-session`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...payload,
          bookingRef,
          rate_source_id: bookingData?.rate_source_id || selectedRateSourceId,
          rate_source_timestamp: bookingData?.rate_source_timestamp || selectedRateSourceTimestamp,
        }),
      });

      const checkoutData = await checkoutRes.json();

      if (checkoutData?.ok && checkoutData?.url) {
        window.location.href = checkoutData.url;
        return;
      }

      if (STRIPE_PAYMENT_LINK) {
        window.location.href = STRIPE_PAYMENT_LINK;
        return;
      }

      setNotice(checkoutData?.message || "Secure payment is not configured yet.");
    } catch {
      if (STRIPE_PAYMENT_LINK) {
        window.location.href = STRIPE_PAYMENT_LINK;
        return;
      }
      setNotice("Secure payment could not be started. Please try again.");
    } finally {
      setPaying(false);
    }
  }

  const appProps = {
    countries,
    cities,
    country,
    city,
    checkIn,
    checkOut,
    guests,
    rooms,
    currency,
    hotels,
    selectedHotel,
    notice,
    loading,
    paying,
    nights,
    selectedCurrency,
    selectedRoomCode,
    selectedRoomName,
    selectedRateSourceId,
    selectedRateSourceTimestamp,
    totalPrice,
    comparisons,
    destinationQuery,
    customerName,
    customerEmail,
    customerPhone,
    specialRequests,
    fxAmount,
    fxFrom,
    fxTo,
    setCountry,
    setCity,
    setCheckIn,
    setCheckOut,
    setGuests,
    setRooms,
    setCurrency,
    setHotels,
    setSelectedHotel,
    setCustomerName,
    setCustomerEmail,
    setCustomerPhone,
    setSpecialRequests,
    setFxAmount,
    setFxFrom,
    setFxTo,
    searchHotels,
    secureReservation,
  };

  return (
    <div style={styles.page}>
      <Header />
      {route === "hotels" && <HotelsPage {...appProps} />}
      {route === "compare" && <ComparePortal {...appProps} />}
      {route === "guide" && <GuidePortal destinationQuery={destinationQuery} />}
      {route === "about" && <AboutPortal />}
      {route === "faq" && <FaqPortal />}
      {route === "reviews" && <ReviewsPortal reviewSent={reviewSent} setReviewSent={setReviewSent} />}
      {route === "support" && <SupportPortal />}
      {route === "partners" && <PartnersPortal partnerSent={partnerSent} setPartnerSent={setPartnerSent} />}
      {route === "affiliates" && <AffiliateNetworkUltraSafe />}
      {route === "business" && <BusinessPortal />}
      <Footer />
    </div>
  );
}

function Header() {
  return (
    <header style={styles.header}>
      <a style={styles.brand} href={routeUrl(ROUTES.hotels)}>
        <div style={styles.logo}>MYSPACE HOTEL</div>
        <div style={styles.tagline}>Hotels, resorts, serviced apartments and worldwide travel support</div>
      </a>

      <nav style={styles.nav}>
        <a style={styles.navLink} href={routeUrl(ROUTES.hotels)}>Hotels</a>
        <a style={styles.navLink} href={routeUrl(ROUTES.compare)}>Compare Prices</a>
        <a style={styles.navLink} href={routeUrl(ROUTES.guide)}>Destination Guide</a>
        <a style={styles.navLink} href={routeUrl(ROUTES.about)}>About Us</a>
        <a style={styles.navLink} href={routeUrl(ROUTES.faq)}>FAQ</a>
        <a style={styles.navLink} href={routeUrl(ROUTES.reviews)}>Guest Reviews</a>
        <a style={styles.navLink} href={routeUrl(ROUTES.support)}>Support</a>
        <a style={styles.goldLink} href={routeUrl(ROUTES.partners)}>Partnerships</a>
        <a style={styles.navLink} href="/affiliate-network.html">Affiliate Network</a>
        <a style={styles.darkLink} href={routeUrl(ROUTES.business)}>Business Portal</a>
      </nav>
    </header>
  );
}

function HotelsPage(props) {
  const converted = convertCurrency(Number(props.fxAmount || 0), props.fxFrom, props.fxTo);

  return (
    <>
      <section style={styles.hero}>
        <div style={styles.heroInner}>
          <div style={styles.heroGrid}>
            <div>
              <div style={styles.pill}>Trusted accommodation for every journey</div>
              <h1 style={styles.heroTitle}>
                {props.country ? `Find trusted hotels in ${props.country}` : "Find trusted hotels around the world"}
              </h1>
              <p style={styles.heroText}>
                Search hotels, review full stay totals, compare value in the same destination and continue through a secure reservation journey.
              </p>
            </div>

            <div style={styles.promisePanel}>
              <h2 style={styles.panelMiniTitle}>Why guests choose MySpace Hotel</h2>
              <div style={styles.promiseItem}>Clear stay totals before checkout</div>
              <div style={styles.promiseItem}>Hotel comparison for better value</div>
              <div style={styles.promiseItem}>Destination support before travel</div>
              <div style={styles.promiseItem}>Customer-friendly booking journey</div>
            </div>
          </div>

          <div style={styles.searchCard}>
            <SearchBox {...props} />
          </div>

          <div style={styles.converterCard}>
            <div>
              <div style={styles.converterTitle}>Currency Converter</div>
              <div style={styles.muted}>Indicative conversion for planning. Final payment currency is confirmed before checkout.</div>
            </div>
            <input style={styles.input} type="number" min="1" value={props.fxAmount} onChange={(e) => props.setFxAmount(e.target.value)} />
            <select style={styles.input} value={props.fxFrom} onChange={(e) => props.setFxFrom(e.target.value)}>
              {Object.keys(FX).map((x) => <option key={x}>{x}</option>)}
            </select>
            <select style={styles.input} value={props.fxTo} onChange={(e) => props.setFxTo(e.target.value)}>
              {Object.keys(FX).map((x) => <option key={x}>{x}</option>)}
            </select>
            <div style={styles.convertResult}>{props.fxTo} {money(converted)}</div>
          </div>

          <div style={styles.metrics}>
            <Metric big="Clear" small="Stay totals" />
            <Metric big="Compare" small="Hotel value" />
            <Metric big="Secure" small="Checkout steps" />
            <Metric big="Helpful" small="Destination guide" />
          </div>
        </div>
      </section>

      {props.notice ? <div style={styles.notice}>{props.notice}</div> : null}

      <section style={styles.contentGrid}>
        <main>
          <h2 style={styles.title}>MORE STAY OPTIONS</h2>
          <p style={styles.sectionText}>
            Select a hotel to refresh the booking summary, comparison box and alternative hotel options immediately.
          </p>

          {props.loading ? <div style={styles.empty}>Finding suitable accommodation for your destination...</div> : null}

          {!props.loading && props.hotels.length === 0 ? (
            <div style={styles.empty}>Choose a country, city and travel dates to discover available accommodation.</div>
          ) : null}

          <div style={styles.hotelGrid}>
            {props.hotels.map((hotel, idx) => (
              <HotelCard key={hotelKey(hotel) || idx} hotel={hotel} idx={idx} {...props} />
            ))}
          </div>

          <ComparePanel {...props} />
          <AlternativeHotels {...props} />
        </main>

        <BookingSummary {...props} />
      </section>
    </>
  );
}

function SearchBox(props) {
  return (
    <>
      <Field label="Country">
        <select style={styles.input} value={props.country} onChange={(e) => props.setCountry(e.target.value)}>
          <option value="">Select country</option>
          {props.countries.map((item) => (
            <option key={item.country} value={item.country}>{item.country}</option>
          ))}
        </select>
      </Field>

      <Field label="City">
        <select
          style={styles.input}
          value={props.city}
          disabled={!props.country}
          onChange={(e) => {
            props.setCity(e.target.value);
            props.setHotels([]);
            props.setSelectedHotel(null);
          }}
        >
          <option value="">{props.country ? "Select city" : "Select country first"}</option>
          {props.cities.map((item) => (
            <option key={item} value={item}>{item}</option>
          ))}
        </select>
      </Field>

      <Field label="Check-in">
        <input style={styles.input} type="date" value={props.checkIn} onChange={(e) => props.setCheckIn(e.target.value)} />
      </Field>

      <Field label="Check-out">
        <input style={styles.input} type="date" value={props.checkOut} onChange={(e) => props.setCheckOut(e.target.value)} />
      </Field>

      <Field label="Guests">
        <input style={styles.input} type="number" min="1" max="20" value={props.guests} onChange={(e) => props.setGuests(e.target.value)} />
      </Field>

      <Field label="Rooms">
        <input style={styles.input} type="number" min="1" max="10" value={props.rooms} onChange={(e) => props.setRooms(e.target.value)} />
      </Field>

      <Field label="Currency">
        <select style={styles.input} value={props.currency} onChange={(e) => props.setCurrency(e.target.value)}>
          {Object.keys(FX).map((x) => <option key={x}>{x}</option>)}
        </select>
      </Field>

      <button style={styles.primaryBtn} onClick={props.searchHotels}>
        {props.loading ? "Finding Hotels..." : "Find Hotels"}
      </button>
    </>
  );
}

function Field({ label, children }) {
  return (
    <div style={styles.field}>
      <label style={styles.label}>{label}</label>
      {children}
    </div>
  );
}

function HotelCard({ hotel, selectedHotel, setSelectedHotel, rooms, nights, currency, city, country }) {
  const selectedReadyHotel = selectedHotelWithRoom(hotel);
  const price = hotelPrice(selectedReadyHotel);
  const curr = hotelCurrency(selectedReadyHotel, currency);
  const total = price * Math.max(1, Number(rooms || 1)) * Math.max(1, Number(nights || 1));
  const selected = hotelKey(hotel) === hotelKey(selectedHotel);
  const image = validHotelImage(hotel);

  return (
    <article style={selected ? styles.hotelCardSelected : styles.hotelCard}>
      {image ? (
        <img src={image} alt={hotel.name || "Hotel"} style={styles.hotelImage} />
      ) : (
        <div style={styles.noImage}>Verified image unavailable</div>
      )}

      <div style={styles.hotelBody}>
        <div style={styles.greenBadge}>{selected ? "Selected Property" : "Recommended Property"}</div>
        <h3 style={styles.hotelName}>{hotel.name || "Selected hotel"}</h3>
        <div style={styles.muted}>{hotel.city || city}, {hotel.country || country}</div>

        <div style={styles.tagRow}>
          <span style={styles.tag}>Clear total</span>
          <span style={styles.tag}>Guest support</span>
          <span style={styles.tag}>Destination guide</span>
        </div>

        <div style={styles.priceLine}>{curr} {money(price)} <span style={styles.small}>per night</span></div>
        <div style={styles.small}>Estimated stay total: {curr} {money(total)}</div>

        <button
          style={styles.darkBtn}
          onClick={() => setSelectedHotel(selectedReadyHotel)}
        >
          Select Hotel
        </button>
      </div>
    </article>
  );
}

function BookingSummary(props) {
  return (
    <aside style={styles.summary}>
      <h2 style={styles.summaryTitle}>Booking Summary</h2>
      <div style={styles.muted}>
        {props.nights} night{props.nights === 1 ? "" : "s"}, {props.rooms} room{Number(props.rooms) === 1 ? "" : "s"}, {props.guests} guest{Number(props.guests) === 1 ? "" : "s"}
      </div>

      {!props.selectedHotel ? (
        <div style={styles.softBox}>Select a hotel to review your stay summary, guest details and secure payment option.</div>
      ) : (
        <>
          <h3 style={styles.selectedName}>{props.selectedHotel.name}</h3>
          <div style={styles.muted}>{props.selectedHotel.city || props.city}, {props.selectedHotel.country || props.country}</div>
          <div style={styles.small}>Board Basis: {props.selectedRoomName}</div>

          <div style={styles.totalBox}>
            <div style={styles.totalLabel}>Estimated stay total</div>
            <div style={styles.totalPrice}>{props.selectedCurrency} {money(props.totalPrice)}</div>
            <div style={styles.small}>Based on selected hotel, nights and rooms.</div>
          </div>

          <div style={styles.customerBox}>
            <h3 style={styles.customerTitle}>Guest Details Before Checkout</h3>
            <input style={styles.input} placeholder="Full name" value={props.customerName} onChange={(e) => props.setCustomerName(e.target.value)} />
            <input style={styles.input} type="email" placeholder="Email address" value={props.customerEmail} onChange={(e) => props.setCustomerEmail(e.target.value)} />
            <input style={styles.input} placeholder="Phone number, optional" value={props.customerPhone} onChange={(e) => props.setCustomerPhone(e.target.value)} />
            <textarea style={styles.textareaSmall} placeholder="Special requests, optional" value={props.specialRequests} onChange={(e) => props.setSpecialRequests(e.target.value)} />
          </div>

          {props.affiliateCode ? (
            <div style={styles.referralNote}>
              Referral applied for this booking.
            </div>
          ) : null}

          <button style={styles.payBtn} disabled={props.paying} onClick={props.secureReservation}>
            {props.paying ? "Opening Secure Payment..." : "Continue to Secure Checkout"}
          </button>

          <a style={styles.outlineBtn} href={routeUrl(ROUTES.compare)}>Compare Prices</a>
          <a style={styles.outlineBtn} href={mapSearch("things to do", props.destinationQuery)} target="_blank" rel="noreferrer">Explore Destination</a>
        </>
      )}
    </aside>
  );
}

function ComparePanel(props) {
  if (!props.selectedHotel) return null;

  return (
    <section style={styles.panel}>
      <div style={styles.panelHeader}>
        <div>
          <div style={styles.kicker}>Compare Prices</div>
          <h2 style={styles.titleSmall}>Compare your selected stay</h2>
          <p style={styles.sectionText}>Review stay choices and MORE STAY OPTIONS before continuing.</p>
        </div>
        <a style={styles.primaryLink} href={routeUrl(ROUTES.compare)}>Open Compare Page</a>
      </div>

      <div style={styles.compareGrid}>
        {props.comparisons.slice(0, 6).map((item) => (
          <div key={item.id} style={styles.compareCard}>
            <div style={styles.greenBadge}>{item.badge}</div>
            <h3 style={styles.cardTitle}>{item.hotelName}</h3>
            <div style={styles.strong}>{item.label}</div>
            <p style={styles.cardText}>{item.text}</p>
            <div style={styles.comparePrice}>{item.currency} {money(item.total)}</div>
            <div style={styles.small}>Estimated stay total</div>
          </div>
        ))}
      </div>
    </section>
  );
}

function AlternativeHotels(props) {
  const alternatives = (props.hotels || [])
    .filter((hotel) => hotelKey(hotel) !== hotelKey(props.selectedHotel))
    .slice(0, 3);

  if (!props.selectedHotel || alternatives.length === 0) return null;

  return (
    <section style={styles.panel}>
      <div style={styles.kicker}>MORE STAY OPTIONS</div>
      <h2 style={styles.titleSmall}>Other accommodation options in {props.city || "this destination"}</h2>

      <div style={styles.altGrid}>
        {alternatives.map((hotel, idx) => {
          const selectedReadyHotel = selectedHotelWithRoom(hotel);
          const price = hotelPrice(selectedReadyHotel);
          const curr = hotelCurrency(selectedReadyHotel, props.currency);
          const image = validHotelImage(hotel);

          return (
            <article key={hotelKey(hotel) || idx} style={styles.altCard}>
              {image ? <img src={image} alt={hotel.name || "Hotel"} style={styles.altImage} /> : <div style={styles.altNoImage}>Image unavailable</div>}
              <div style={styles.altBody}>
                <h3 style={styles.altName}>{hotel.name || "Nearby hotel"}</h3>
                <div style={styles.muted}>{hotel.city || props.city}, {hotel.country || props.country}</div>
                <div style={styles.priceLine}>{curr} {money(price)}</div>
                <button style={styles.darkBtn} onClick={() => props.setSelectedHotel(selectedReadyHotel)}>
                  View This Stay
                </button>
              </div>
            </article>
          );
        })}
      </div>
    </section>
  );
}

function ComparePortal(props) {
  const [liveCompare, setLiveCompare] = useState(null);
  const [liveLoading, setLiveLoading] = useState(false);
  const [liveNotice, setLiveNotice] = useState("");

  const selected = props.selectedHotel;
  const selectedHotelId = selected?.hotelId || selected?.hotel_id || "";
  const selectedHotelName = selected?.name || selected?.hotel_name || "";
  const selectedCountry = selected?.country || props.country || "";
  const selectedCity = selected?.city || props.city || "";
  const selectedCurrency = props.selectedCurrency || props.currency || "GBP";

  async function refreshLiveCompare() {
    setLiveNotice("");

    if (!selected) {
      setLiveCompare(null);
      setLiveNotice("Select a hotel from the Hotels page first. The Today's Best Available Price check will appear here.");
      return;
    }

    try {
      setLiveLoading(true);

      const params = new URLSearchParams({
        country: selectedCountry,
        city: selectedCity,
        hotelId: selectedHotelId,
        hotelName: selectedHotelName,
        currency: selectedCurrency,
      });

      const res = await fetch(`${API_BASE}/api/compare-prices?${params.toString()}`, {
        cache: "no-store",
      });

      const data = await res.json();

      if (!res.ok || !data.ok) {
        throw new Error(data.message || "Price comparison could not be refreshed.");
      }

      setLiveCompare(data);
      setLiveNotice("");
    } catch (err) {
      setLiveCompare(null);
      setLiveNotice("The live price comparison could not be refreshed right now. Please try again.");
    } finally {
      setLiveLoading(false);
    }
  }

  useEffect(() => {
    refreshLiveCompare();
  }, [selectedHotelId, selectedHotelName, selectedCountry, selectedCity, selectedCurrency]);

  const customerOffer = liveCompare?.customer_offer || null;
  const summary = liveCompare?.comparison_summary || null;
  const bestAmount = Number(customerOffer?.amount || summary?.best_amount || props.totalPrice || 0);
  const bestCurrency = customerOffer?.currency || summary?.currency || selectedCurrency || "GBP";
  const checkedCount = Number(summary?.compared_options || 0);
  const hotelName = customerOffer?.hotelName || selectedHotelName || "Selected hotel";
  const roomName = customerOffer?.roomName || props.selectedRoomName || "Available room";
  const updatedAt = customerOffer?.rate_source_timestamp || "";

  return (
    <PortalShell
      title="Compare Prices"
      subtitle="Review the Review your selected stay clearly before continuing to secure checkout."
      badge="Best price check"
    >
      {!selected ? (
        <div style={styles.empty}>
          Select a hotel from the Hotels page first, then return here to Compare today's best available price for that exact property.
        </div>
      ) : (
        <>
          <section style={{
            background: "#ffffff",
            borderRadius: 30,
            padding: 30,
            boxShadow: "0 8px 25px rgba(0,0,0,.06)",
            border: "1px solid #dce6f3",
            marginBottom: 28
          }}>
            <div style={{
              display: "flex",
              justifyContent: "space-between",
              gap: 20,
              alignItems: "flex-start",
              flexWrap: "wrap"
            }}>
              <div>
                <div style={styles.kicker}>Price comparison</div>
                <h2 style={styles.titleSmall}>Today's Best Available Price{hotelName}</h2>
                <p style={styles.sectionText}>
                  Review your selected stay clearly before continuing to secure checkout.
                </p>
              </div>

              
            </div>

            {liveNotice ? <div style={styles.notice}>{liveNotice}</div> : null}

            <div style={{
              marginTop: 24,
              display: "grid",
              gridTemplateColumns: "minmax(0, 1.4fr) 330px",
              gap: 22,
              alignItems: "stretch"
            }}>
              <div style={{
                background: "#ecfdf3",
                border: "1px solid #bbf7d0",
                borderRadius: 24,
                padding: 26
              }}>
                <div style={styles.greenBadge}>
                  {liveLoading ? "Checking current rates" : "Recommended stay option"}
                </div>

                <h3 style={{
                  fontSize: 30,
                  lineHeight: 1.15,
                  margin: "12px 0 10px",
                  fontWeight: 950,
                  color: "#0b1d51"
                }}>
                  {hotelName}
                </h3>

                <div style={styles.muted}>
                  {selectedCity}, {selectedCountry}
                </div>

                <div style={{
                  marginTop: 16,
                  display: "grid",
                  gap: 8,
                  color: "#30466e",
                  fontWeight: 850
                }}>
                  <div>Board Basis: {roomName}</div>
                  <div></div>
                </div>

                <p style={{
                  marginTop: 18,
                  color: "#365943",
                  fontWeight: 800,
                  lineHeight: 1.6
                }}>
                  You can review this stay with confidence before continuing to secure checkout.
                </p>
              </div>

              <div style={{
                background: "#0b1d51",
                color: "#ffffff",
                borderRadius: 24,
                padding: 26,
                display: "flex",
                flexDirection: "column",
                justifyContent: "center",
                textAlign: "center"
              }}>
                <div style={{
                  fontSize: 16,
                  fontWeight: 900,
                  color: "#dbe7ff",
                  marginBottom: 12
                }}>
                  Today's Best Available Price
                </div>

                <div style={{
                  fontSize: 44,
                  lineHeight: 1,
                  fontWeight: 950,
                  letterSpacing: "-1px"
                }}>
                  {bestCurrency} {money(bestAmount)}
                </div>

                <div style={{
                  marginTop: 12,
                  color: "#dbe7ff",
                  fontWeight: 800,
                  lineHeight: 1.4
                }}>
                  Reviewed before secure checkout
                </div>
              </div>
            </div>
          </section>
          <AlternativeHotels {...props} />
        </>
      )}
    </PortalShell>
  );
}

function GuidePortal({ destinationQuery }) {
  const query = destinationQuery || "selected destination";

  return (
    <PortalShell title="Destination Guide" subtitle="Plan safer and more enjoyable trips with practical destination support." badge="Travel planning">
      <div style={styles.cardGrid}>
        <GuideCard title="Emergency help" text="Find local police, ambulance, fire service and urgent assistance." href={mapSearch("emergency services", query)} />
        <GuideCard title="Hospitals and pharmacies" text="Find hospitals, pharmacies and urgent-care services." href={mapSearch("hospital pharmacy", query)} />
        <GuideCard title="Restaurants and cafes" text="Discover nearby dining options for your destination." href={mapSearch("restaurants cafes", query)} />
        <GuideCard title="Airport and transfers" text="Plan airport arrivals, rail stations, taxis and transfers." href={mapSearch("airport taxi transfer", query)} />
        <GuideCard title="Museums and culture" text="Explore museums, galleries, heritage sites and attractions." href={mapSearch("museum attractions", query)} />
        <GuideCard title="Family attractions" text="Find parks, zoos, shopping centres and family activities." href={mapSearch("family attractions zoo", query)} />
      </div>
    </PortalShell>
  );
}

function AboutPortal() {
  return (
    <PortalShell title="About MySpace Hotel" subtitle="A customer-first accommodation platform built for clear choices, trusted stays and better travel planning." badge="About us">
      <div style={styles.cardGrid}>
        <InfoCard title="Who we serve" text="MySpace Hotel supports holidaymakers, business travellers, families and guests looking for clear accommodation choices." />
        <InfoCard title="What we provide" text="Guests can search hotels, compare stay value, review destination guidance and continue through a secure booking journey." />
        <InfoCard title="Our promise" text="We focus on customer-friendly language, clear totals, useful destination support and a professional booking experience." />
        <InfoCard title="Business details" text="MySpace Hotel Ltd, 17 Barleycorn Way, London E14 8DE. Phone: +44 7707836674. Website: myspace-hotel.com." />
      </div>
    </PortalShell>
  );
}

function FaqPortal() {
  return (
    <PortalShell title="Frequently Asked Questions" subtitle="Answers to common questions before guests continue with a reservation." badge="FAQ">
      <div style={styles.faqList}>
        <FaqItem q="How do I search for a hotel?" a="Select your country, city, dates, guests and rooms, then choose Find Hotels. Available hotel options will appear below the search box." />
        <FaqItem q="When is the final price confirmed?" a="The stay total is shown before checkout. Final payment details are confirmed securely before payment is completed." />
        <FaqItem q="Can I compare hotels in the same destination?" a="Yes. After selecting a hotel, MySpace Hotel shows comparison choices and MORE STAY OPTIONS where available." />
        <FaqItem q="Can I request support before travelling?" a="Yes. The Support Centre and Destination Guide help customers review important travel and local service information." />
        <FaqItem q="Can hotels or partners work with MySpace Hotel?" a="Yes. Accommodation providers and travel technology partners can use the Industry Partnerships page to contact MySpace Hotel." />
      </div>
    </PortalShell>
  );
}

function FaqItem({ q, a }) {
  return (
    <div style={styles.infoCard}>
      <h3 style={styles.cardTitle}>{q}</h3>
      <p style={styles.cardText}>{a}</p>
    </div>
  );
}

function ReviewsPortal({ reviewSent, setReviewSent }) {
  const [reviewName, setReviewName] = useState("");
  const [reviewEmail, setReviewEmail] = useState("");
  const [reviewMessage, setReviewMessage] = useState("");
  const [reviewNotice, setReviewNotice] = useState("");

  async function submitReview(e) {
    e.preventDefault();
    setReviewNotice("");

    if (!reviewName.trim() || !reviewEmail.trim() || !reviewMessage.trim()) {
      setReviewNotice("Please complete your name, email address and message.");
      return;
    }

    try {
      const res = await fetch(`${API_BASE}/api/feedback`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: reviewName, email: reviewEmail, message: reviewMessage }),
      });

      const data = await res.json();

      if (!res.ok || !data.ok) {
        setReviewNotice(data.message || "We could not send your review right now. Please try again.");
        return;
      }

      setReviewSent(true);
      setReviewName("");
      setReviewEmail("");
      setReviewMessage("");
    } catch {
      setReviewNotice("We could not send your review right now. Please try again.");
    }
  }

  return (
    <PortalShell title="Guest Reviews" subtitle="MySpace Hotel is built around confident travel decisions, helpful guidance and clear accommodation choices." badge="Guest experience">
      <div style={styles.cardGrid}>
        <InfoCard title="Business travel" text="A simple way to search trusted stays and compare accommodation options for professional trips." />
        <InfoCard title="Family holidays" text="Destination guidance and clear stay totals help families plan with more confidence." />
        <InfoCard title="City breaks" text="Hotel search, local attractions and dining guidance make short trips easier to plan." />
      </div>

      {reviewSent ? (
        <div style={styles.success}>Thank you. Your review has been received by MySpace Hotel.</div>
      ) : (
        <form style={styles.form} onSubmit={submitReview}>
          <input style={styles.input} placeholder="Your name" value={reviewName} onChange={(e) => setReviewName(e.target.value)} />
          <input style={styles.input} type="email" placeholder="Email address" value={reviewEmail} onChange={(e) => setReviewEmail(e.target.value)} />
          <textarea style={styles.textarea} placeholder="Tell us about your booking or travel experience." value={reviewMessage} onChange={(e) => setReviewMessage(e.target.value)} />
          {reviewNotice ? <div style={styles.notice}>{reviewNotice}</div> : null}
          <button style={styles.primaryBtn}>Share Your Experience</button>
        </form>
      )}
    </PortalShell>
  );
}

function SupportPortal() {
  return (
    <PortalShell title="Support Centre" subtitle="Helpful customer support before, during and after your stay." badge="Customer support">
      <div style={styles.cardGrid}>
        <InfoCard title="Before your trip" text="Get help reviewing destinations, accommodation options, dates, room choices and travel needs before booking." />
        <InfoCard title="During your stay" text="Access helpful guidance for local services, destination support and stay-related questions." />
        <InfoCard title="After your journey" text="Share your experience, request support and help us improve future guest journeys." />
        <InfoCard title="Contact MySpace Hotel" text="Reservations: reservations@myspace-hotel.com | General: info@myspace-hotel.com | Sales: sales@myspace-hotel.com | Accounts: accounts@myspace-hotel.com | Phone: +44 7707836674" />
      </div>
    </PortalShell>
  );
}

function PartnersPortal({ partnerSent, setPartnerSent }) {
  const [partnerType, setPartnerType] = useState("");
  const [businessName, setBusinessName] = useState("");
  const [contactName, setContactName] = useState("");
  const [contactEmail, setContactEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [partnerCountry, setPartnerCountry] = useState("");
  const [partnerCity, setPartnerCity] = useState("");
  const [website, setWebsite] = useState("");
  const [message, setMessage] = useState("");
  const [partnerNotice, setPartnerNotice] = useState("");

  async function submitPartner(e) {
    e.preventDefault();
    setPartnerNotice("");

    if (!partnerType.trim() || !businessName.trim() || !contactName.trim() || !contactEmail.trim() || !message.trim()) {
      setPartnerNotice("Please complete partnership type, business name, contact name, email and message.");
      return;
    }

    try {
      const res = await fetch(`${API_BASE}/api/partner-applications`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          partner_type: partnerType,
          business_name: businessName,
          contact_name: contactName,
          contact_email: contactEmail,
          phone,
          country: partnerCountry,
          city: partnerCity,
          website,
          message,
        }),
      });

      const data = await res.json();

      if (!res.ok || !data.ok) {
        setPartnerNotice(data.message || "We could not send your partnership enquiry right now. Please try again.");
        return;
      }

      setPartnerSent(true);
    } catch {
      setPartnerNotice("We could not send your partnership enquiry right now. Please try again.");
    }
  }

  return (
    <PortalShell title="Industry Partnerships" subtitle="Connect with MySpace Hotel for trusted accommodation, travel technology and service partnerships." badge="Partnerships">
      <div style={styles.cardGrid}>
        <InfoCard title="Hotels and accommodation" text="Work with MySpace Hotel to present trusted stays to guests seeking global accommodation." />
        <InfoCard title="Property or channel technology" text="Connect availability, rates and booking information through professional partnership workflows." />
        <InfoCard title="Travel technology partners" text="Collaborate on better travel experiences, destination support and improved guest journeys." />
      </div>

      {partnerSent ? (
        <div style={styles.success}>Thank you. Your partnership enquiry has been received.</div>
      ) : (
        <form style={styles.form} onSubmit={submitPartner}>
          <select style={styles.input} value={partnerType} onChange={(e) => setPartnerType(e.target.value)}>
            <option value="">Partnership type</option>
            <option value="Hotel or accommodation provider">Hotel or accommodation provider</option>
            <option value="Property or channel technology">Property or channel technology</option>
            <option value="Travel technology partner">Travel technology partner</option>
            <option value="Corporate or business travel partner">Corporate or business travel partner</option>
            <option value="Other partnership">Other partnership</option>
          </select>
          <input style={styles.input} placeholder="Business name" value={businessName} onChange={(e) => setBusinessName(e.target.value)} />
          <input style={styles.input} placeholder="Contact name" value={contactName} onChange={(e) => setContactName(e.target.value)} />
          <input style={styles.input} type="email" placeholder="Contact email" value={contactEmail} onChange={(e) => setContactEmail(e.target.value)} />
          <input style={styles.input} placeholder="Phone" value={phone} onChange={(e) => setPhone(e.target.value)} />
          <input style={styles.input} placeholder="Country" value={partnerCountry} onChange={(e) => setPartnerCountry(e.target.value)} />
          <input style={styles.input} placeholder="City" value={partnerCity} onChange={(e) => setPartnerCity(e.target.value)} />
          <input style={styles.input} placeholder="Website" value={website} onChange={(e) => setWebsite(e.target.value)} />
          <textarea style={styles.textarea} placeholder="Tell us how you would like to work with MySpace Hotel." value={message} onChange={(e) => setMessage(e.target.value)} />
          {partnerNotice ? <div style={styles.notice}>{partnerNotice}</div> : null}
          <button style={styles.primaryBtn}>Submit Partnership Enquiry</button>
        </form>
      )}
    </PortalShell>
  );
}

function BusinessPortal() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [portalNotice, setPortalNotice] = useState("");

  function handleLogin(e) {
    e.preventDefault();

    if (!email || !password) {
      setPortalNotice("Please enter your email address and password.");
      return;
    }

    setPortalNotice("Business portal access is being prepared. Approved partner login credentials will be issued by MySpace Hotel.");
  }

  return (
    <main style={styles.businessPage}>
      <section style={styles.loginGrid}>
        <div>
          <div style={styles.pill}>Secure business access</div>
          <h1 style={styles.portalTitle}>Business Portal</h1>
          <p style={styles.heroText}>Login area for approved hotels, accommodation partners and business users.</p>
          <div style={styles.securityList}>
            <div style={styles.promiseItem}>Partner enquiries and onboarding access</div>
            <div style={styles.promiseItem}>Future booking, inventory and account tools</div>
            <div style={styles.promiseItem}>Secure access for approved business users only</div>
          </div>
        </div>

        <form style={styles.loginCard} onSubmit={handleLogin}>
          <h2 style={styles.titleSmall}>Business Login</h2>
          <p style={styles.muted}>Enter your approved business credentials to continue.</p>
          <label style={styles.label}>Email address</label>
          <input style={styles.input} type="email" placeholder="business@example.com" value={email} onChange={(e) => setEmail(e.target.value)} />
          <label style={styles.label}>Password</label>
          <input style={styles.input} type="password" placeholder="Enter password" value={password} onChange={(e) => setPassword(e.target.value)} />
          <button style={styles.primaryBtn}>Login</button>
          {portalNotice ? <div style={styles.notice}>{portalNotice}</div> : null}
          <a style={styles.textLink} href={routeUrl(ROUTES.partners)}>Need access? Apply through Industry Partnerships</a>
        </form>
      </section>
    </main>
  );
}

function PortalShell({ title, subtitle, badge, children }) {
  return (
    <main style={styles.portalPage}>
      <section style={styles.portalHero}>
        <div style={styles.pill}>{badge}</div>
        <h1 style={styles.portalTitle}>{title}</h1>
        <p style={styles.heroText}>{subtitle}</p>
        <a style={styles.primaryLink} href={routeUrl(ROUTES.hotels)}>Open Hotel Search</a>
      </section>
      <section style={styles.portalContent}>{children}</section>
    </main>
  );
}

function Metric({ big, small }) {
  return (
    <div style={styles.metric}>
      <div style={styles.metricBig}>{big}</div>
      <div style={styles.muted}>{small}</div>
    </div>
  );
}

function InfoCard({ title, text }) {
  return (
    <div style={styles.infoCard}>
      <h3 style={styles.cardTitle}>{title}</h3>
      <p style={styles.cardText}>{text}</p>
    </div>
  );
}

function GuideCard({ title, text, href }) {
  return (
    <a style={styles.guideCard} href={href} target="_blank" rel="noreferrer">
      <h3 style={styles.cardTitle}>{title}</h3>
      <p style={styles.cardText}>{text}</p>
      <span style={styles.textLink}>Open guide</span>
    </a>
  );
}

function Footer() {
  return (
    <footer style={styles.footer}>
      <div style={styles.footerGrid}>
        <div>
          <div style={styles.footerBrand}>MYSPACE HOTEL</div>
          <div style={styles.footerText}>Trusted accommodation, clear pricing and travel support for guests worldwide.</div>
        </div>
        <div>
          <div style={styles.footerTitle}>Contact Directory</div>
          <div style={styles.footerText}>Reservations: reservations@myspace-hotel.com</div>
          <div style={styles.footerText}>General: info@myspace-hotel.com</div>
          <div style={styles.footerText}>Sales: sales@myspace-hotel.com</div>
          <div style={styles.footerText}>Accounts: accounts@myspace-hotel.com</div>
          <div style={styles.footerText}>Phone: +44 7707836674</div>
          <div style={styles.footerText}>Address: 17 Barleycorn Way, London E14 8DE</div>
        </div>
      </div>
    </footer>
  );
}

const styles = {
  page: { minHeight: "100vh", background: "#f4f7fb", color: "#0b1d51", fontFamily: "Arial, sans-serif" },
  header: { position: "sticky", top: 0, zIndex: 20, background: "#fff", borderBottom: "1px solid #dfe6f3", padding: "18px 28px", display: "flex", justifyContent: "space-between", gap: 20, alignItems: "center", flexWrap: "wrap" },
  brand: { textDecoration: "none", color: "#0b1d51" },
  logo: { fontSize: 40, fontWeight: 950, letterSpacing: "-1px", lineHeight: 1 },
  tagline: { marginTop: 7, color: "#5a6c8f", fontWeight: 800, fontSize: 14 },
  nav: { display: "flex", gap: 8, flexWrap: "wrap", justifyContent: "flex-end" },
  navLink: { padding: "10px 13px", borderRadius: 13, border: "1px solid #d5dff1", color: "#0b1d51", background: "#fff", textDecoration: "none", fontWeight: 850, fontSize: 14 },
  goldLink: { padding: "10px 13px", borderRadius: 13, color: "#0b1d51", background: "#f1bf22", textDecoration: "none", fontWeight: 950, fontSize: 14 },
  darkLink: { padding: "10px 13px", borderRadius: 13, color: "#fff", background: "#0b1d51", textDecoration: "none", fontWeight: 950, fontSize: 14 },
  hero: { background: "linear-gradient(135deg,#ffffff,#eaf1ff)" },
  heroInner: { padding: "46px 38px", maxWidth: 1540, margin: "0 auto" },
  heroGrid: { display: "grid", gridTemplateColumns: "minmax(0,1fr) 390px", gap: 28, alignItems: "center" },
  pill: { display: "inline-block", background: "#0b1d51", color: "#fff", borderRadius: 999, padding: "10px 16px", fontWeight: 950, marginBottom: 18 },
  heroTitle: { fontSize: 68, lineHeight: 0.98, margin: "0 0 18px", fontWeight: 950, letterSpacing: "-2px" },
  heroText: { fontSize: 22, lineHeight: 1.45, color: "#30466e", fontWeight: 750, maxWidth: 950 },
  promisePanel: { background: "#fff", borderRadius: 28, padding: 26, boxShadow: "0 12px 34px rgba(0,0,0,.10)" },
  panelMiniTitle: { margin: "0 0 14px", fontSize: 24, fontWeight: 950 },
  promiseItem: { background: "#f4f7fb", borderRadius: 16, padding: 14, marginTop: 10, color: "#30466e", fontWeight: 850 },
  searchCard: { marginTop: 34, background: "#fff", borderRadius: 30, padding: 24, display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(160px,1fr))", gap: 16, alignItems: "end", boxShadow: "0 10px 30px rgba(0,0,0,.08)" },
  converterCard: { marginTop: 22, background: "#fff", borderRadius: 28, padding: 22, display: "grid", gridTemplateColumns: "2fr 1fr 1fr 1fr 1fr", gap: 14, alignItems: "end", boxShadow: "0 8px 24px rgba(0,0,0,.07)" },
  converterTitle: { fontSize: 24, fontWeight: 950 },
  convertResult: { background: "#ecfdf3", color: "#166534", borderRadius: 16, padding: 16, textAlign: "center", fontWeight: 950, fontSize: 18 },
  metrics: { marginTop: 28, display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(180px,1fr))", gap: 18 },
  metric: { background: "#fff", borderRadius: 22, padding: 22, textAlign: "center", boxShadow: "0 8px 22px rgba(0,0,0,.05)" },
  metricBig: { fontSize: 32, fontWeight: 950 },
  field: { display: "flex", flexDirection: "column", gap: 8 },
  label: { fontWeight: 950, fontSize: 15 },
  input: { width: "100%", boxSizing: "border-box", padding: 15, borderRadius: 15, border: "1px solid #d8e0ef", background: "#fff", fontSize: 15 },
  primaryBtn: { background: "#2750db", color: "#fff", border: "none", borderRadius: 15, padding: 16, fontSize: 17, fontWeight: 950, cursor: "pointer", textAlign: "center" },
  darkBtn: { marginTop: 16, width: "100%", background: "#0b1d51", color: "#fff", border: "none", borderRadius: 15, padding: 15, fontSize: 16, fontWeight: 950, cursor: "pointer" },
  payBtn: { marginTop: 18, width: "100%", background: "#10b981", color: "#fff", border: "none", borderRadius: 17, padding: 17, fontSize: 17, fontWeight: 950, cursor: "pointer" },
  outlineBtn: { display: "block", marginTop: 12, border: "2px solid #d9e4f2", borderRadius: 17, padding: 15, textAlign: "center", color: "#0b1d51", background: "#fff", textDecoration: "none", fontWeight: 950 },
  primaryLink: { display: "inline-block", background: "#2750db", color: "#fff", borderRadius: 16, padding: "14px 18px", textDecoration: "none", fontWeight: 950 },
  textLink: { color: "#2750db", textDecoration: "none", fontWeight: 950 },
  notice: { maxWidth: 1450, margin: "20px auto", background: "#fff7ed", color: "#9a3412", border: "1px solid #fed7aa", borderRadius: 18, padding: 18, fontWeight: 900 },
  contentGrid: { maxWidth: 1540, margin: "0 auto", padding: "40px 34px 60px", display: "grid", gridTemplateColumns: "minmax(0,1fr) 420px", gap: 28, alignItems: "start" },
  title: { fontSize: 42, margin: "0 0 10px", fontWeight: 950 },
  titleSmall: { fontSize: 34, margin: "0 0 10px", fontWeight: 950 },
  sectionText: { fontSize: 18, lineHeight: 1.55, color: "#50678f", fontWeight: 750, maxWidth: 950 },
  empty: { background: "#fff", borderRadius: 22, padding: 30, fontSize: 19, fontWeight: 850, margin: "18px 0", color: "#50678f" },
  hotelGrid: { display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(300px,1fr))", gap: 24 },
  hotelCard: { background: "#fff", borderRadius: 26, overflow: "hidden", border: "3px solid transparent", boxShadow: "0 8px 25px rgba(0,0,0,.08)" },
  hotelCardSelected: { background: "#fff", borderRadius: 26, overflow: "hidden", border: "3px solid #10b981", boxShadow: "0 8px 25px rgba(0,0,0,.08)" },
  hotelImage: { width: "100%", height: 220, objectFit: "cover" },
  noImage: { height: 220, display: "flex", alignItems: "center", justifyContent: "center", background: "#e8eef8", color: "#50678f", fontWeight: 950 },
  hotelBody: { padding: 22 },
  greenBadge: { display: "inline-block", background: "#ecfdf3", color: "#166534", borderRadius: 999, padding: "7px 12px", fontSize: 12, fontWeight: 950, marginBottom: 12 },
  hotelName: { fontSize: 23, margin: "0 0 8px", lineHeight: 1.2, fontWeight: 950 },
  muted: { color: "#60708a", fontWeight: 750, lineHeight: 1.45 },
  tagRow: { display: "flex", gap: 8, flexWrap: "wrap", marginTop: 14 },
  tag: { background: "#f4f7fb", color: "#50678f", borderRadius: 999, padding: "7px 10px", fontWeight: 850, fontSize: 12 },
  priceLine: { marginTop: 16, color: "#2750db", fontSize: 28, fontWeight: 950 },
  small: { color: "#61718f", fontSize: 13, fontWeight: 800, lineHeight: 1.4 },
  summary: { position: "sticky", top: 104, background: "#fff", borderRadius: 26, padding: 24, boxShadow: "0 8px 25px rgba(0,0,0,.08)" },
  summaryTitle: { fontSize: 30, margin: "0 0 8px", fontWeight: 950 },
  softBox: { marginTop: 18, background: "#f4f7fb", borderRadius: 18, padding: 18, color: "#60708a", fontWeight: 850, lineHeight: 1.5 },
  selectedName: { margin: "20px 0 8px", fontSize: 23, lineHeight: 1.25, fontWeight: 950 },
  totalBox: { marginTop: 20, background: "#ecfdf3", borderRadius: 20, padding: 20 },
  totalLabel: { color: "#166534", fontWeight: 950 },
  totalPrice: { marginTop: 8, fontSize: 34, fontWeight: 950 },
  customerBox: { marginTop: 18, display: "grid", gap: 12, background: "#f8fafc", borderRadius: 20, padding: 18, border: "1px solid #d9e4f2" },
  customerTitle: { margin: 0, fontSize: 20, fontWeight: 950 },
  referralNote: { marginTop: 16, background: "#ecfdf3", color: "#166534", borderRadius: 16, padding: 14, fontWeight: 900, lineHeight: 1.4 },
  textareaSmall: { padding: 15, borderRadius: 15, border: "1px solid #d8e0ef", minHeight: 85, fontSize: 15, fontFamily: "Arial, sans-serif" },
  textarea: { padding: 15, borderRadius: 15, border: "1px solid #d8e0ef", minHeight: 130, fontSize: 15, fontFamily: "Arial, sans-serif" },
  panel: { marginTop: 30, background: "#fff", borderRadius: 28, padding: 28, boxShadow: "0 8px 25px rgba(0,0,0,.06)" },
  panelHeader: { display: "flex", justifyContent: "space-between", gap: 20, flexWrap: "wrap", alignItems: "flex-start" },
  kicker: { color: "#2750db", fontWeight: 950, letterSpacing: ".04em", textTransform: "uppercase", fontSize: 13, marginBottom: 8 },
  compareGrid: { display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(230px,1fr))", gap: 16, marginTop: 20 },
  compareCard: { border: "1px solid #dce6f3", borderRadius: 22, padding: 20, background: "#f8fafc" },
  cardTitle: { fontSize: 22, margin: "0 0 12px", fontWeight: 950 },
  strong: { fontWeight: 950, color: "#30466e" },
  cardText: { color: "#445b82", lineHeight: 1.65, fontSize: 16, fontWeight: 650 },
  comparePrice: { marginTop: 14, color: "#2750db", fontSize: 24, fontWeight: 950 },
  liveCompareBox: { marginTop: 22, background: "#ecfdf3", border: "1px solid #bbf7d0", borderRadius: 24, padding: 24, display: "grid", gridTemplateColumns: "minmax(0,1.4fr) 260px", gap: 20, alignItems: "center" },
  liveComparePrice: { background: "#fff", color: "#0b1d51", borderRadius: 20, padding: 22, fontSize: 30, fontWeight: 950, textAlign: "center", boxShadow: "0 8px 20px rgba(0,0,0,.05)" },
  compareMiniGrid: { gridColumn: "1 / -1", display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(160px,1fr))", gap: 12 },
  compareMini: { background: "#fff", borderRadius: 18, padding: 16, display: "grid", gap: 6, color: "#30466e", fontWeight: 850 },
  altGrid: { display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(230px,1fr))", gap: 18, marginTop: 18 },
  altCard: { background: "#fff", border: "1px solid #dce6f3", borderRadius: 22, overflow: "hidden" },
  altImage: { width: "100%", height: 145, objectFit: "cover" },
  altNoImage: { height: 145, display: "flex", alignItems: "center", justifyContent: "center", background: "#e8eef8", color: "#50678f", fontWeight: 950 },
  altBody: { padding: 16 },
  altName: { margin: "0 0 8px", fontSize: 18, fontWeight: 950 },
  portalPage: { minHeight: "70vh", background: "#f4f7fb" },
  portalHero: { padding: "80px 40px", background: "linear-gradient(135deg,#ffffff,#eaf1ff)" },
  portalTitle: { fontSize: 64, lineHeight: 1, margin: "0 0 18px", fontWeight: 950, letterSpacing: "-2px" },
  portalContent: { maxWidth: 1500, margin: "0 auto", padding: "50px 40px 70px" },
  cardGrid: { display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(260px,1fr))", gap: 22 },
  infoCard: { background: "#fff", borderRadius: 24, padding: 28, minHeight: 165, border: "1px solid #dce6f3", boxShadow: "0 8px 24px rgba(0,0,0,.05)" },
  guideCard: { background: "#fff", borderRadius: 24, padding: 28, minHeight: 165, border: "1px solid #dce6f3", boxShadow: "0 8px 24px rgba(0,0,0,.05)", color: "#0b1d51", textDecoration: "none" },
  faqList: { display: "grid", gap: 18, maxWidth: 1000 },
  form: { marginTop: 28, display: "grid", gap: 16, maxWidth: 850, background: "#fff", padding: 24, borderRadius: 24, boxShadow: "0 8px 24px rgba(0,0,0,.05)" },
  success: { marginTop: 22, background: "#ecfdf3", color: "#166534", borderRadius: 18, padding: 20, fontWeight: 950 },
  businessPage: { minHeight: "75vh", background: "linear-gradient(135deg,#ffffff,#eaf1ff)", padding: "70px 40px" },
  loginGrid: { maxWidth: 1250, margin: "0 auto", display: "grid", gridTemplateColumns: "1fr 460px", gap: 40, alignItems: "center" },
  loginCard: { background: "#fff", borderRadius: 30, padding: 34, boxShadow: "0 14px 40px rgba(0,0,0,.12)", display: "grid", gap: 14 },
  securityList: { marginTop: 28, display: "grid", gap: 14, maxWidth: 620 },
  footer: { background: "#071538", color: "#fff", padding: "34px 40px" },
  footerGrid: { maxWidth: 1500, margin: "0 auto", display: "grid", gridTemplateColumns: "2fr 1fr", gap: 26 },
  footerBrand: { fontSize: 32, fontWeight: 950, marginBottom: 10 },
  footerTitle: { fontSize: 18, fontWeight: 950, marginBottom: 10 },
  footerText: { fontSize: 16, lineHeight: 1.6, color: "#dbe7ff", fontWeight: 650 },
};





















