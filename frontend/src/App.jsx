import React, { useEffect, useMemo, useState } from "react";
import ComplianceGate from "./components/ComplianceGate";
import { detectCountryFromIP } from "./utils/geolocationCompliance";

const API_BASE =
  import.meta.env.VITE_API_BASE ||
  import.meta.env.VITE_API_BASE_URL ||
  "http://127.0.0.1:5050";

const COMPANY = {
  email: "reservations@myspace-hotel.com",
  website: "https://myspace-hotel.com"
};

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

function tomorrowISO() {
  return new Date(Date.now() + 86400000).toISOString().slice(0, 10);
}

function clean(v) {
  return String(v || "").trim();
}

function money(v) {
  const n = Number(v || 0);
  return Number.isFinite(n) ? n.toFixed(2) : "0.00";
}

function number(v) {
  const n = Number(v || 0);
  return Number.isFinite(n) ? n : 0;
}

function normalizeKey(v) {
  return clean(v)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

function nightsBetween(a, b) {
  const start = new Date(a);
  const end = new Date(b);
  const diff = Math.ceil((end - start) / 86400000);
  return Number.isFinite(diff) && diff > 0 ? diff : 1;
}

function hotelId(hotel) {
  return clean(
    hotel?.hotelbeds_code ||
      hotel?.hotel_id ||
      hotel?.hotel_code ||
      hotel?.id ||
      hotel?.code
  );
}

function hotelName(hotel) {
  return clean(hotel?.name || hotel?.hotel_name || "Selected stay");
}

function hotelAddress(hotel) {
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
}

function rateShape(liveRate, selectedHotel) {
  const rate =
    liveRate?.rate ||
    liveRate?.first_rate ||
    selectedHotel?.first_rate ||
    selectedHotel?.rate ||
    null;

  return {
    currency:
      clean(rate?.currency) ||
      clean(liveRate?.currency) ||
      clean(selectedHotel?.currency) ||
      "GBP",
    amount:
      number(rate?.amount) ||
      number(liveRate?.amount) ||
      number(selectedHotel?.price) ||
      number(selectedHotel?.total) ||
      0,
    rateKey:
      clean(rate?.rate_key) ||
      clean(rate?.rate_id) ||
      clean(selectedHotel?.rate_key),
    liveAvailable: Boolean(liveRate?.live_available || selectedHotel?.live_rate_ready || rate),
    message:
      clean(liveRate?.customer_message) ||
      "Price shown for your selected dates, guests and rooms."
  };
}


const SANCTIONED_COUNTRY_NAMES = new Set([
  "Afghanistan",
  "Belarus",
  "Burundi",
  "Central African Republic",
  "Chad",
  "Congo Republic",
  "Cuba",
  "Democratic Republic of the Congo",
  "Eritrea",
  "Iraq",
  "Iran",
  "Libya",
  "Myanmar",
  "North Korea",
  "Somalia",
  "South Sudan",
  "Sudan",
  "Syria",
  "Russia",
  "Venezuela",
  "Yemen"
]);

function isSanctionedCountryName(country) {
  return SANCTIONED_COUNTRY_NAMES.has(clean(country));
}


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

function mapsLink(type, query) {
  return `https://www.google.com/maps/search/${encodeURIComponent(type + " near " + query)}`;
}

export default function App() {
  const [page, setPage] = useState("home");
  const [destinations, setDestinations] = useState([]);
  const [country, setCountry] = useState("");
  const [city, setCity] = useState("");
  const [checkin, setCheckin] = useState(todayISO());
  const [checkout, setCheckout] = useState(tomorrowISO());
  const [guests, setGuests] = useState(2);
  const [rooms, setRooms] = useState(1);
  const [stayType, setStayType] = useState("hotel");

  const [hotels, setHotels] = useState([]);
  const [selectedHotel, setSelectedHotel] = useState(null);
  const [liveRate, setLiveRate] = useState(null);
  const [loading, setLoading] = useState(false);
  const [liveLoading, setLiveLoading] = useState(false);
  const [notice, setNotice] = useState("");

  const [guide, setGuide] = useState(null);
  const [guideLoading, setGuideLoading] = useState(false);

  const [ipCountry, setIpCountry] = useState("");
  const [feedbackSent, setFeedbackSent] = useState(false);
  const [partnerSent, setPartnerSent] = useState(false);
  const [loginNotice, setLoginNotice] = useState("");
  const [activeFaq, setActiveFaq] = useState(null);

  const [convertTo, setConvertTo] = useState("USD");
  const [converted, setConverted] = useState(null);
  const [checkoutLoading, setCheckoutLoading] = useState(false);
  const [checkoutMessage, setCheckoutMessage] = useState("");

  const nights = useMemo(() => nightsBetween(checkin, checkout), [checkin, checkout]);

  const rate = useMemo(() => rateShape(liveRate, selectedHotel), [liveRate, selectedHotel]);

  const stayTotal = useMemo(() => {
    return number(rate.amount) * Math.max(1, number(rooms)) * Math.max(1, nights);
  }, [rate.amount, rooms, nights]);

  const cities = useMemo(() => {
    const found = destinations.find((x) => x.country === country);
    return found?.cities || [];
  }, [country, destinations]);

  useEffect(() => {
    loadDestinations();
  }, []);

  useEffect(() => {
    async function runGeo() {
      const geo = await detectCountryFromIP();
      setIpCountry(geo.country || "");
    }

    runGeo();
  }, []);

  useEffect(() => {
    setConverted(null);
  }, [stayTotal, rate.currency, convertTo]);

  async function loadDestinations() {
    setNotice("");

    const urls = [
      "http://127.0.0.1:5050/api/destinations",
      "http://localhost:5050/api/destinations",
      API_BASE + "/api/destinations"
    ];

    for (const url of urls) {
      try {
        const res = await fetch(url, { cache: "no-store" });
        const data = await res.json();
        const raw = Array.isArray(data?.countries) ? data.countries : [];

        const cleaned = raw
          .filter((x) => clean(x.country))
          .filter((x) => !isSanctionedCountryName(x.country))
          .map((x) => {
            const citySource = Array.isArray(x.cities)
              ? x.cities
              : Array.isArray(x.cities_full)
                ? x.cities_full.map((c) => c.city)
                : [];

            const seen = new Map();

            citySource.forEach((c) => {
              const name = clean(c);
              if (!name) return;

              const key = normalizeKey(name);
              if (!seen.has(key)) seen.set(key, name);
            });

            return {
              country: clean(x.country),
              cities: Array.from(seen.values()).sort((a, b) => a.localeCompare(b))
            };
          })
          .filter((x) => x.country && x.cities.length)
          .sort((a, b) => a.country.localeCompare(b.country));

        if (cleaned.length) {
          setDestinations(cleaned);
          setNotice("");
          console.log("Loaded destinations:", cleaned.length, "from", url);
          return;
        }
      } catch (err) {
        console.log("Destination load failed:", url, err);
      }
    }

    setDestinations([]);
    setNotice("Destinations could not be loaded. Please make sure the backend is running on port 5050.");
  }

  async function searchHotels() {
    setNotice("");
    setCheckoutMessage("");

    if (!country || !city) {
      setNotice("Please select a country and city before searching.");
      return;
    }

    if (new Date(checkout) <= new Date(checkin)) {
      setNotice("Check-out must be after check-in.");
      return;
    }

    setLoading(true);
    setHotels([]);
    setSelectedHotel(null);
    setLiveRate(null);

    try {
      const params = new URLSearchParams({
        country,
        city,
        stay_type: stayType,
        limit: "80"
      });

      const res = await fetch(`${API_BASE}/api/hotels/search?${params}`);
      const data = await res.json();
      const found = Array.isArray(data?.hotels) ? data.hotels : [];
      setHotels(found);

      if (!cleanFound.length) {
        setNotice("No matching results were returned for this search. Try another city or different dates.");
      }
    } catch (err) {
      console.log(err);
      setNotice("Search could not be completed. Please try again.");
    }

    setLoading(false);
  }

  async function selectHotel(hotel) {
    setSelectedHotel(hotel);
    setLiveRate(null);
    setLiveLoading(true);
    setCheckoutMessage("");

    try {
      const params = new URLSearchParams({
        hotel_id: hotelId(hotel),
        checkin,
        checkout,
        guests: String(guests),
        rooms: String(rooms)
      });

      const res = await fetch(`${API_BASE}/api/hotels/live-rate?${params}`);
      const data = await res.json();
      setLiveRate(data);
    } catch (err) {
      console.log(err);
      setLiveRate({
        live_available: false,
        customer_message: "Price could not be refreshed. Please try again."
      });
    }

    setLiveLoading(false);
  }

  async function convertCurrency() {
    if (!stayTotal || !rate.currency || !convertTo) return;

    try {
      const params = new URLSearchParams({
        amount: String(stayTotal),
        from: rate.currency,
        to: convertTo
      });

      const res = await fetch(`${API_BASE}/api/currency/convert?${params}`);
      const data = await res.json();

      if (data?.ok) {
        setConverted(data);
      }
    } catch (err) {
      console.log(err);
    }
  }

  async function payWithStripe() {
    setCheckoutMessage("");

    if (!selectedHotel) {
      setCheckoutMessage("Please select a stay before continuing.");
      return;
    }

    if (!rate.liveAvailable || !rate.amount) {
      setCheckoutMessage("This hotel needs a live available price before secure payment can continue.");
      return;
    }

    if (!stayTotal || stayTotal <= 0) {
      setCheckoutMessage("A valid total is required before secure payment can continue.");
      return;
    }

    setCheckoutLoading(true);

    try {
      const res = await fetch(`${API_BASE}/api/create-checkout-session`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          hotel_id: hotelId(selectedHotel),
          hotel_name: hotelName(selectedHotel),
          checkin,
          checkout,
          guests,
          rooms,
          nights,
          amount: stayTotal,
          currency: rate.currency,
          rate_key: rate.rateKey,
          ip_country: ipCountry
        })
      });

      const data = await res.json();

      if (data?.ok && data?.url) {
        window.location.href = data.url;
        return;
      }

      setCheckoutMessage(data?.message || data?.error || "Secure checkout could not be started.");
    } catch (err) {
      console.log(err);
      setCheckoutMessage("Secure checkout could not be started. Please try again.");
    }

    setCheckoutLoading(false);
  }

  async function openGuide(hotel = selectedHotel) {
    if (hotel) setSelectedHotel(hotel);

    setPage("guide");
    setGuideLoading(true);
    setGuide(null);
    window.scrollTo({ top: 0, behavior: "smooth" });

    const destinationCountry = country || hotel?.country || "";
    const destinationCity = city || hotel?.city || "";
    const destinationArea = hotel?.area || "";
    const destinationHotel = hotel ? hotelName(hotel) : "";

    try {
      const params = new URLSearchParams({
        country: destinationCountry,
        city: destinationCity,
        area: destinationArea,
        hotel: destinationHotel
      });

      const res = await fetch(`${API_BASE}/api/guide?${params}`);
      const data = await res.json();
      setGuide(data?.guide || null);
    } catch (err) {
      console.log(err);
      setGuide(null);
    }

    setGuideLoading(false);
  }

  function Header() {
    return (
      <header style={s.header}>
        <div style={s.brand} onClick={() => setPage("home")}>
          <div style={s.logo}>MYSPACE HOTEL</div>
          <div style={s.tagline}>Clear stays. Helpful travel support. Simple booking.</div>
        </div>

        <nav style={s.nav}>
          <button style={s.navBtn} onClick={() => setPage("home")}>Stays</button>
          <button style={s.navBtn} onClick={() => openGuide()}>Guide</button>
          <button style={s.navBtn} onClick={() => setPage("offers")}>Offers</button>
          <button style={s.navBtn} onClick={() => setPage("feedback")}>Feedback</button>
          <button style={s.navBtn} onClick={() => setPage("help")}>Help</button>
          <button style={s.goldBtn} onClick={() => setPage("partners")}>Partner Application</button>
          <button style={s.darkBtn} onClick={() => setPage("login")}>Partner Login</button>
        </nav>
      </header>
    );
  }

  function SearchBox() {
    return (
      <section style={s.searchBox}>
        <Field label="Stay type">
          <select style={s.input} value={stayType} onChange={(e) => setStayType(e.target.value)}>
            <option value="hotel">Hotels</option>
            <option value="apartment">Apartments</option>
            <option value="villa">Villas</option>
          </select>
        </Field>

        <Field label="Country">
          <select
            style={s.input}
            value={country}
            onChange={(e) => {
              setCountry(e.target.value);
              setCity("");
              setHotels([]);
              setSelectedHotel(null);
              setLiveRate(null);
              setNotice("");
            }}
          >
            <option value="">Select country</option>
            {destinations.map((x) => (
              <option key={x.country} value={x.country}>{x.country}</option>
            ))}
          </select>
        </Field>

        <Field label="City">
          <select
            style={s.input}
            value={city}
            disabled={!country}
            onChange={(e) => {
              setCity(e.target.value);
              setHotels([]);
              setSelectedHotel(null);
              setLiveRate(null);
              setNotice("");
            }}
          >
            <option value="">{country ? "Select city" : "Select country first"}</option>
            {cities.map((c) => (
              <option key={c} value={c}>{c}</option>
            ))}
          </select>
        </Field>

        <Field label="Check-in">
          <input style={s.input} type="date" value={checkin} onChange={(e) => setCheckin(e.target.value)} />
        </Field>

        <Field label="Check-out">
          <input style={s.input} type="date" value={checkout} onChange={(e) => setCheckout(e.target.value)} />
        </Field>

        <Field label="Guests">
          <input style={s.input} type="number" min="1" max="20" value={guests} onChange={(e) => setGuests(e.target.value)} />
        </Field>

        <Field label="Rooms">
          <input style={s.input} type="number" min="1" max="10" value={rooms} onChange={(e) => setRooms(e.target.value)} />
        </Field>

        <button style={s.searchBtn} onClick={searchHotels}>
          {loading ? "Searching..." : "Search stays"}
        </button>
      </section>
    );
  }

  function ReservePanel() {
    const canPay = selectedHotel && rate.liveAvailable && rate.amount && stayTotal > 0;

    return (
      <ComplianceGate billingCountry="" ipCountry={ipCountry} cardCountry="">
        <aside style={s.reserve}>
          <div style={s.reserveTitle}>Reserve your stay</div>

          <div style={s.tripSummary}>
            <span>{nights} night{nights === 1 ? "" : "s"}</span>
            <span>{rooms} room{Number(rooms) === 1 ? "" : "s"}</span>
            <span>{guests} guest{Number(guests) === 1 ? "" : "s"}</span>
          </div>

          {!selectedHotel ? (
            <div style={s.reserveEmpty}>Choose a stay to review price and continue.</div>
          ) : (
            <>
              <div style={s.reserveHotel}>{hotelName(selectedHotel)}</div>
              <div style={s.reserveAddress}>
                {hotelAddress(selectedHotel)}
                {selectedHotel.city ? `, ${selectedHotel.city}` : ""}
                {selectedHotel.country ? `, ${selectedHotel.country}` : ""}
              </div>

              <div style={s.tripBox}>
                <div><b>Check-in:</b> {checkin}</div>
                <div><b>Check-out:</b> {checkout}</div>
                <div><b>Price per room/night:</b> {rate.currency} {money(rate.amount)}</div>
                <div><b>Total:</b> {rate.currency} {money(stayTotal)}</div>
              </div>

              <div style={s.priceBox}>
                {liveLoading ? (
                  <b>Refreshing price...</b>
                ) : canPay ? (
                  <>
                    <div style={s.priceLabel}>Total stay price</div>
                    <div style={s.price}>{rate.currency} {money(stayTotal)}</div>
                    <div style={s.priceNote}>
                      {rooms} room{Number(rooms) === 1 ? "" : "s"} × {nights} night{nights === 1 ? "" : "s"}
                    </div>
                  </>
                ) : (
                  <>
                    <div style={s.bad}>Live price required</div>
                    <div style={s.priceNote}>Select a stay with a live available price before payment.</div>
                  </>
                )}
              </div>

              <div style={s.converter}>
                <select style={s.smallInput} value={convertTo} onChange={(e) => setConvertTo(e.target.value)}>
                  <option value="USD">USD</option>
                  <option value="EUR">EUR</option>
                  <option value="GBP">GBP</option>
                  <option value="NGN">NGN</option>
                  <option value="AED">AED</option>
                  <option value="CAD">CAD</option>
                </select>
                <button style={s.convertBtn} onClick={convertCurrency}>Convert</button>
              </div>

              {converted?.converted ? (
                <div style={s.convertedBox}>
                  Approx. {converted.to_currency} {money(converted.converted)}
                </div>
              ) : null}

              <button
                style={{
                  ...s.payBtn,
                  opacity: canPay ? 1 : 0.55,
                  cursor: canPay ? "pointer" : "not-allowed"
                }}
                disabled={!canPay || checkoutLoading}
                onClick={() => setPage("checkout")}
              >
                Continue to secure payment
              </button>

              <button style={s.secondaryWide} onClick={() => openGuide(selectedHotel)}>
                View destination guide
              </button>
            </>
          )}
        </aside>
      </ComplianceGate>
    );
  }

  function HotelCard({ hotel, index }) {
    return (
      <article style={s.hotelCard}>
        {hotel.image_url ? (
          <img
            src={hotel.image_url}
            alt={hotelName(hotel)}
            style={s.hotelImage}
            onError={(e) => {
              e.currentTarget.style.display = "none";
            }}
          />
        ) : (
          <div style={s.noImage}>Stay image unavailable</div>
        )}

        <div style={s.hotelBody}>
          <div style={s.hotelName}>{hotelName(hotel)}</div>
          <div style={s.hotelLocation}>
            {hotelAddress(hotel)}
            {hotel.city ? `, ${hotel.city}` : ""}
            {hotel.country ? `, ${hotel.country}` : ""}
          </div>

          <div style={s.hotelFacts}>
            <span>{clean(hotel.rating) || "Comfort stay"}</span>
            <span>{clean(hotel.property_type) || stayType}</span>
            <span>{hotel.live_rate_ready ? "Live price" : "Check price"}</span>
          </div>

          <div style={s.liveNote}>
            Select this stay to refresh the current price for your dates and rooms.
          </div>

          <div style={s.cardBtns}>
            <button style={s.selectBtn} onClick={() => selectHotel(hotel)}>Select stay</button>
            <button style={s.outlineBtn} onClick={() => openGuide(hotel)}>Local guide</button>
          </div>
        </div>
      </article>
    );
  }

  function HomePage() {
    return (
      <div style={s.root}>
        <Header />

        <section style={s.hero}>
          <div style={s.heroInner}>
            <div style={s.badge}>Hotel booking with destination support</div>
            <h1 style={s.heroTitle}>Find a stay with confidence before you travel.</h1>
            <p style={s.heroText}>
              Search by country and city, choose your dates, review stay options and prepare with useful local guidance.
            </p>
            <SearchBox />
          </div>
        </section>

        <div style={s.trustRow}>
          <Info title="Clear search" text="Choose destination, dates, guests and rooms in one place." />
          <Info title="Useful guide" text="Open local links for hospitals, transport, food and attractions." />
          <Info title="Fair total" text="Total updates by rooms, nights and selected stay price." />
          <Info title="Customer feedback" text="Share what would improve your booking experience." />
        </div>

        {notice && <div style={s.notice}>{notice}</div>}

        <main style={s.main}>
          <section>
            <div style={s.sectionHead}>
              <div>
                <h2 style={s.sectionTitle}>Available stays</h2>
                <p style={s.sectionSub}>Search a destination, select a stay and review the total.</p>
              </div>
              <button style={s.outlineBtn} onClick={() => openGuide()}>Open guide</button>
            </div>

            {loading && <div style={s.loading}>Searching available stays...</div>}

            {!loading && !hotels.length && (
              <div style={s.grid3}>
                <Info title="Start your search" text="Select a country and city above to see available stays." />
                <Info title="Choose confidently" text="Review address, image, rating and stay details before selecting." />
                <Info title="Prepare better" text="Use the guide page to plan transport, food and attractions." />
              </div>
            )}

            <div style={s.hotelGrid}>
              {hotels.map((hotel, index) => (
                <HotelCard key={hotelId(hotel) || `${hotelName(hotel)}-${index}`} hotel={hotel} index={index} />
              ))}
            </div>
          </section>

          <ReservePanel />
        </main>
      </div>
    );
  }

  function GuidePage() {
    const destination = [hotelName(selectedHotel), city || selectedHotel?.city, country || selectedHotel?.country]
      .filter((x) => clean(x) && x !== "Selected stay")
      .join(", ");

    const fallbackQuery = destination || [city, country].filter(Boolean).join(", ") || "near me";

    const links = guide?.links || {
      hospital: mapsLink("hospital", fallbackQuery),
      pharmacy: mapsLink("pharmacy", fallbackQuery),
      police: mapsLink("police station", fallbackQuery),
      airport: mapsLink("airport", fallbackQuery),
      restaurants: mapsLink("restaurants", fallbackQuery),
      taxi: mapsLink("taxi", fallbackQuery),
      train_or_metro: mapsLink("train station", fallbackQuery),
      attractions: mapsLink("things to do", fallbackQuery),
      museums: mapsLink("museums", fallbackQuery),
      tours: mapsLink("tours", fallbackQuery),
      family: mapsLink("family activities", fallbackQuery)
    };

    return (
      <PageShell title="Destination Guide" subtitle="Helpful links for safety, transport, food, attractions and arrival planning.">
        <div style={s.guideHero}>
          <div>
            <h2>{guide?.destination || fallbackQuery}</h2>
            <p>Use these links to prepare before travelling. Always confirm local emergency numbers and opening times directly.</p>
          </div>
          <button style={s.goldBtn} onClick={() => setPage("home")}>Back to stays</button>
        </div>

        {guideLoading && <div style={s.loading}>Loading destination guide...</div>}

        <div style={s.guideGrid}>
          <GuideLink title="Hospital nearby" text="Find hospitals and urgent care nearby." href={links.hospital} />
          <GuideLink title="Pharmacy nearby" text="Find pharmacies close to your stay." href={links.pharmacy} />
          <GuideLink title="Police station" text="Find local police stations and safety points." href={links.police} />
          <GuideLink title="Airport" text="Plan airport arrival and transfer." href={links.airport} />
          <GuideLink title="Restaurants" text="Find places to eat near your stay." href={links.restaurants} />
          <GuideLink title="Taxi options" text="Find taxi and local ride options." href={links.taxi} />
          <GuideLink title="Train or metro" text="Find nearby transport stations." href={links.train_or_metro} />
          <GuideLink title="Attractions" text="Explore landmarks and things to do." href={links.attractions} />
          <GuideLink title="Museums" text="Discover museums and cultural places." href={links.museums} />
          <GuideLink title="Tours" text="Find sightseeing and local tour options." href={links.tours} />
          <GuideLink title="Family activities" text="Find family-friendly activities." href={links.family} />
        </div>
      </PageShell>
    );
  }

  function CheckoutPage() {
    const canPay = selectedHotel && rate.liveAvailable && rate.amount && stayTotal > 0;

    return (
      <PageShell title="Secure Payment" subtitle="Review your stay and continue to secure checkout.">
        <ComplianceGate billingCountry="" ipCountry={ipCountry} cardCountry="">
          {!selectedHotel ? (
            <div style={s.warning}>No stay selected. Please return to stays.</div>
          ) : (
            <div style={s.checkoutGrid}>
              <div style={s.checkoutCard}>
                <h2>{hotelName(selectedHotel)}</h2>
                <p>{hotelAddress(selectedHotel)}</p>
                <p>{selectedHotel.city} {selectedHotel.country}</p>
                <p><b>Dates:</b> {checkin} to {checkout}</p>
                <p><b>Guests:</b> {guests}</p>
                <p><b>Rooms:</b> {rooms}</p>
                <p><b>Nights:</b> {nights}</p>
              </div>

              <div style={s.checkoutCard}>
                <h2>Total to pay</h2>
                <div style={s.price}>{rate.currency} {money(stayTotal)}</div>
                <p>{rate.currency} {money(rate.amount)} × {rooms} room{Number(rooms) === 1 ? "" : "s"} × {nights} night{nights === 1 ? "" : "s"}</p>

                {!canPay && (
                  <div style={s.warning}>
                    A live available price is required before secure payment can continue.
                  </div>
                )}

                <button
                  style={{
                    ...s.payBtn,
                    opacity: canPay ? 1 : 0.55,
                    cursor: canPay ? "pointer" : "not-allowed"
                  }}
                  disabled={!canPay || checkoutLoading}
                  onClick={payWithStripe}
                >
                  {checkoutLoading ? "Starting secure checkout..." : "Pay securely"}
                </button>

                {checkoutMessage && <div style={s.noticeSmall}>{checkoutMessage}</div>}
              </div>
            </div>
          )}
        </ComplianceGate>
      </PageShell>
    );
  }

  function OffersPage() {
    return (
      <PageShell title="Travel Offers" subtitle="Plan the kind of trip that suits your journey.">
        <div style={s.grid3}>
          <Info title="City breaks" text="Find practical stays near transport, restaurants and attractions." />
          <Info title="Business stays" text="Choose convenient stays for meetings, travel routes and airport access." />
          <Info title="Family trips" text="Plan stays with room clarity and useful local guidance." />
          <Info title="Longer visits" text="Explore apartments and villas for flexible trips." />
          <Info title="Weekend stays" text="Search short stays with clear dates and guest details." />
          <Info title="Local experiences" text="Use the guide to discover restaurants, attractions and transport." />
        </div>
      </PageShell>
    );
  }

  function FeedbackPage() {
    return (
      <PageShell title="Customer Feedback" subtitle="Tell us what would make your hotel booking experience better.">
        {feedbackSent ? (
          <div style={s.success}>Thank you. Your feedback has been received.</div>
        ) : (
          <form style={s.form} onSubmit={(e) => { e.preventDefault(); setFeedbackSent(true); }}>
            <input style={s.input} placeholder="Your name" />
            <input type="email" style={s.input} placeholder="Email address" />
            <select style={s.input} defaultValue="">
              <option value="" disabled>What are you booking for?</option>
              <option>Leisure travel</option>
              <option>Business travel</option>
              <option>Family travel</option>
              <option>Long stay</option>
              <option>Other</option>
            </select>
            <select style={s.input} defaultValue="">
              <option value="" disabled>What matters most?</option>
              <option>Best price</option>
              <option>Location</option>
              <option>Clear cancellation policy</option>
              <option>Family facilities</option>
              <option>Destination support</option>
            </select>
            <textarea style={s.textarea} placeholder="What should MySpace Hotel improve or add?" />
            <button style={s.submitBtn}>Send feedback</button>
          </form>
        )}
      </PageShell>
    );
  }

  function HelpPage() {
    const faqs = [
      ["How do I search for a stay?", "Select country, city, dates, guests and rooms, then press Search stays."],
      ["Why can prices change?", "Prices can change due to availability, dates, guests, rooms and booking conditions."],
      ["How do I use the guide?", "Open the guide from the top menu or from a selected stay to view useful local links."],
      ["How do I contact support?", `Email ${COMPANY.email} for booking and reservation support.`]
    ];

    return (
      <PageShell title="Help & Support" subtitle="Booking support, destination help and partner information.">
        <div style={s.grid3}>
          <Info title="Booking help" text="Search by destination, select a stay and review your details before continuing." />
          <Info title="Destination help" text="Use the guide page for hospitals, transport, food and attractions." />
          <Info title="Email support" text={COMPANY.email} />
        </div>

        <div style={s.faqBox}>
          <h2>Frequently asked questions</h2>
          {faqs.map(([q, a], index) => (
            <div key={q} style={s.faqItem}>
              <button style={s.faqQuestion} onClick={() => setActiveFaq(activeFaq === index ? null : index)}>
                {q}
                <span>{activeFaq === index ? "−" : "+"}</span>
              </button>
              {activeFaq === index && <p style={s.faqAnswer}>{a}</p>}
            </div>
          ))}
        </div>
      </PageShell>
    );
  }

  function PartnersPage() {
    return (
      <PageShell title="Partner Application" subtitle="For hotels, apartments, villas and property providers who want to work with MySpace Hotel.">
        {partnerSent ? (
          <div style={s.success}>Application received. MySpace Hotel will review the property details.</div>
        ) : (
          <form style={s.form} onSubmit={(e) => { e.preventDefault(); setPartnerSent(true); }}>
            <input required style={s.input} placeholder="Property name" />
            <input required style={s.input} placeholder="Contact person" />
            <input required type="email" style={s.input} placeholder="Contact email" />
            <input style={s.input} placeholder="Property website" />
            <input required style={s.input} placeholder="Country" />
            <input required style={s.input} placeholder="City" />
            <select required style={s.input} defaultValue="">
              <option value="" disabled>Property type</option>
              <option>Hotel</option>
              <option>Apartment</option>
              <option>Villa</option>
              <option>Resort</option>
              <option>Guest house</option>
            </select>
            <input style={s.input} placeholder="PMS / channel manager, if any" />
            <textarea required style={s.textarea} placeholder="Tell us about the property and how guests currently book." />
            <button style={s.submitBtn}>Submit application</button>
          </form>
        )}
      </PageShell>
    );
  }

  function LoginPage() {
    return (
      <PageShell title="Partner Login" subtitle="Secure access area for approved partners.">
        <form style={s.login} onSubmit={(e) => { e.preventDefault(); setLoginNotice("Partner access will be enabled for approved properties."); }}>
          <input required type="email" style={s.input} placeholder="Email address" />
          <input required type="password" style={s.input} placeholder="Password" />
          <button style={s.submitBtn}>Login</button>
          {loginNotice && <div style={s.noticeSmall}>{loginNotice}</div>}
        </form>
      </PageShell>
    );
  }

  function PageShell({ title, subtitle, children }) {
    return (
      <div style={s.root}>
        <Header />
        <main style={s.pageWrap}>
          <section style={s.pageCard}>
            <h1 style={s.pageTitle}>{title}</h1>
            <p style={s.pageSub}>{subtitle}</p>
            {children}
          </section>
        </main>
      </div>
    );
  }

  if (page === "guide") return <GuidePage />;
  if (page === "offers") return <OffersPage />;
  if (page === "feedback") return <FeedbackPage />;
  if (page === "help") return <HelpPage />;
  if (page === "partners") return <PartnersPage />;
  if (page === "login") return <LoginPage />;
  if (page === "checkout") return <CheckoutPage />;

  return <HomePage />;
}

function Field({ label, children }) {
  return (
    <div>
      <label style={s.label}>{label}</label>
      {children}
    </div>
  );
}

function Info({ title, text }) {
  return (
    <div style={s.infoCard}>
      <h3>{title}</h3>
      <p>{text}</p>
    </div>
  );
}

function GuideLink({ title, text, href }) {
  return (
    <a href={href} target="_blank" rel="noreferrer" style={s.guideLink}>
      <h3>{title}</h3>
      <p>{text}</p>
      <span>Open link →</span>
    </a>
  );
}

const s = {
  root: { minHeight: "100vh", background: "#edf3fb", color: "#081b44", fontFamily: "Inter, Arial, sans-serif" },
  header: { position: "sticky", top: 0, zIndex: 100, background: "#ffffff", borderBottom: "1px solid #d9e4f2", padding: "16px 28px", display: "flex", justifyContent: "space-between", alignItems: "center", gap: 20 },
  brand: { cursor: "pointer", minWidth: 260 },
  logo: { fontSize: 34, fontWeight: 950, letterSpacing: "-1px" },
  tagline: { color: "#61718b", fontWeight: 800 },
  nav: { display: "flex", gap: 10, flexWrap: "wrap", justifyContent: "flex-end" },
  navBtn: { background: "#ffffff", border: "1px solid #d7e1ef", borderRadius: 12, padding: "11px 15px", fontWeight: 900, cursor: "pointer" },
  goldBtn: { background: "#f4c430", border: "none", borderRadius: 12, padding: "12px 18px", fontWeight: 950, cursor: "pointer" },
  darkBtn: { background: "#081b44", color: "#ffffff", border: "none", borderRadius: 12, padding: "12px 18px", fontWeight: 950, cursor: "pointer" },
  hero: { backgroundImage: "linear-gradient(90deg, rgba(255,255,255,0.97), rgba(255,255,255,0.78)), url('https://images.unsplash.com/photo-1507525428034-b723cf961d3e?q=80&w=1800')", backgroundSize: "cover", backgroundPosition: "center" },
  heroInner: { maxWidth: 1500, margin: "0 auto", padding: "42px 30px" },
  badge: { display: "inline-block", background: "#dbeafe", color: "#1d4ed8", borderRadius: 999, padding: "10px 16px", fontWeight: 950, marginBottom: 18 },
  heroTitle: { maxWidth: 920, margin: 0, fontSize: 64, lineHeight: 1.02, fontWeight: 950 },
  heroText: { maxWidth: 920, marginTop: 18, color: "#334967", fontSize: 23, fontWeight: 750 },
  searchBox: { marginTop: 28, background: "#ffffff", borderRadius: 28, padding: 20, display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(170px,1fr))", gap: 14, alignItems: "end", boxShadow: "0 18px 50px rgba(8,27,68,0.12)" },
  label: { display: "block", marginBottom: 8, fontWeight: 950 },
  input: { width: "100%", height: 52, borderRadius: 13, border: "1px solid #cbd7e8", padding: "0 14px", fontSize: 16, boxSizing: "border-box", background: "#ffffff" },
  smallInput: { height: 46, borderRadius: 12, border: "1px solid #cbd7e8", padding: "0 12px", fontSize: 15, background: "#ffffff" },
  textarea: { gridColumn: "1 / -1", width: "100%", minHeight: 160, borderRadius: 13, border: "1px solid #cbd7e8", padding: 14, fontSize: 16, boxSizing: "border-box" },
  searchBtn: { background: "#1d4ed8", color: "#ffffff", border: "none", borderRadius: 15, padding: "16px 20px", minHeight: 52, fontSize: 17, fontWeight: 950, cursor: "pointer" },
  trustRow: { maxWidth: 1500, margin: "22px auto 0", padding: "0 30px", display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(230px,1fr))", gap: 16 },
  main: { maxWidth: 1500, margin: "0 auto", padding: 30, display: "grid", gridTemplateColumns: "1fr 410px", gap: 24, alignItems: "start" },
  sectionHead: { display: "flex", justifyContent: "space-between", gap: 20, alignItems: "center", marginBottom: 22 },
  sectionTitle: { fontSize: 38, margin: 0, fontWeight: 950 },
  sectionSub: { margin: "8px 0 0", color: "#60708a", fontWeight: 800 },
  grid3: { display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(250px,1fr))", gap: 18, marginTop: 22 },
  infoCard: { background: "#ffffff", borderRadius: 24, padding: 24, boxShadow: "0 10px 28px rgba(8,27,68,0.07)", fontWeight: 750 },
  hotelGrid: { display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(340px,1fr))", gap: 22 },
  hotelCard: { background: "#ffffff", borderRadius: 26, overflow: "hidden", boxShadow: "0 14px 36px rgba(8,27,68,0.10)" },
  hotelImage: { width: "100%", height: 235, objectFit: "cover", background: "#dbe4f2" },
  noImage: { height: 235, background: "#dbe4f2", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 950, color: "#405673" },
  hotelBody: { padding: 22 },
  hotelName: { fontSize: 25, fontWeight: 950 },
  hotelLocation: { marginTop: 10, color: "#5d6f89", fontWeight: 800 },
  hotelFacts: { marginTop: 14, display: "flex", flexWrap: "wrap", gap: 8, color: "#415875", fontWeight: 900 },
  liveNote: { marginTop: 16, background: "#eef6ff", borderRadius: 15, padding: 14, color: "#124078", fontWeight: 850 },
  cardBtns: { display: "flex", gap: 12, marginTop: 20 },
  selectBtn: { background: "#f4c430", border: "none", borderRadius: 14, padding: "15px 16px", fontWeight: 950, cursor: "pointer" },
  outlineBtn: { background: "#ffffff", border: "2px solid #d9e3ef", borderRadius: 14, padding: "15px 16px", fontWeight: 950, cursor: "pointer" },
  secondaryWide: { width: "100%", marginTop: 12, background: "#ffffff", border: "2px solid #d9e3ef", borderRadius: 16, padding: 16, fontWeight: 950, cursor: "pointer" },
  reserve: { background: "#ffffff", borderRadius: 28, padding: 24, position: "sticky", top: 100, boxShadow: "0 14px 36px rgba(8,27,68,0.10)" },
  reserveTitle: { fontSize: 36, fontWeight: 950 },
  tripSummary: { display: "flex", flexWrap: "wrap", gap: 8, marginTop: 12, color: "#415875", fontWeight: 900 },
  reserveEmpty: { marginTop: 24, background: "#f4f8fd", borderRadius: 18, padding: 20, color: "#5c6f89", fontWeight: 850 },
  reserveHotel: { marginTop: 22, fontSize: 27, fontWeight: 950 },
  reserveAddress: { marginTop: 10, color: "#60708a", fontWeight: 800 },
  tripBox: { marginTop: 18, display: "grid", gap: 8, background: "#f4f8fd", borderRadius: 18, padding: 18, color: "#415875" },
  priceBox: { marginTop: 22, background: "#ecfdf3", borderRadius: 19, padding: 22 },
  priceLabel: { color: "#25603a", fontWeight: 950 },
  price: { marginTop: 8, fontSize: 40, fontWeight: 950 },
  priceNote: { marginTop: 10, color: "#365943", fontWeight: 750 },
  bad: { color: "#991b1b", fontWeight: 950 },
  payBtn: { width: "100%", marginTop: 22, background: "#10b981", color: "#ffffff", border: "none", borderRadius: 18, padding: 19, fontSize: 19, fontWeight: 950 },
  notice: { maxWidth: 1440, margin: "20px auto 0", background: "#fff7ed", color: "#9a3412", border: "1px solid #fed7aa", borderRadius: 18, padding: 18, fontWeight: 900 },
  noticeSmall: { marginTop: 18, background: "#eff6ff", color: "#1d4ed8", borderRadius: 14, padding: 14, fontWeight: 850 },
  loading: { background: "#ffffff", borderRadius: 22, padding: 26, fontWeight: 950, boxShadow: "0 10px 26px rgba(8,27,68,0.06)", marginTop: 20 },
  pageWrap: { maxWidth: 1380, margin: "0 auto", padding: 30 },
  pageCard: { background: "#ffffff", borderRadius: 30, padding: 36, boxShadow: "0 14px 36px rgba(8,27,68,0.08)" },
  pageTitle: { margin: 0, fontSize: 50, fontWeight: 950 },
  pageSub: { color: "#5a6d87", fontSize: 20, fontWeight: 800, marginTop: 12 },
  guideHero: { marginTop: 24, background: "#081b44", color: "#ffffff", borderRadius: 26, padding: 30, display: "flex", justifyContent: "space-between", gap: 20, alignItems: "center" },
  guideGrid: { display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(250px,1fr))", gap: 18, marginTop: 24 },
  guideLink: { textDecoration: "none", color: "#081b44", background: "#f4f8fd", borderRadius: 22, padding: 24, display: "block", fontWeight: 800, border: "1px solid #dce7f5" },
  form: { marginTop: 28, display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(260px,1fr))", gap: 16 },
  login: { marginTop: 28, maxWidth: 520, display: "grid", gap: 16 },
  submitBtn: { background: "#1d4ed8", color: "#ffffff", border: "none", borderRadius: 15, padding: 18, fontSize: 18, fontWeight: 950, cursor: "pointer" },
  success: { marginTop: 24, background: "#ecfdf3", color: "#166534", borderRadius: 17, padding: 18, fontWeight: 950 },
  warning: { marginTop: 14, background: "#fef2f2", color: "#991b1b", borderRadius: 15, padding: 15, fontWeight: 900 },
  checkoutGrid: { marginTop: 26, display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(320px,1fr))", gap: 22 },
  checkoutCard: { background: "#f4f8fd", borderRadius: 24, padding: 26, fontWeight: 800 },
  converter: { display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginTop: 16 },
  convertBtn: { border: "none", background: "#081b44", color: "#ffffff", borderRadius: 12, fontWeight: 950, cursor: "pointer" },
  convertedBox: { marginTop: 12, background: "#eef6ff", borderRadius: 14, padding: 14, fontWeight: 950, color: "#124078" },
  faqBox: { marginTop: 28, background: "#f8fbff", borderRadius: 24, padding: 24 },
  faqItem: { borderBottom: "1px solid #dbe5f2" },
  faqQuestion: { width: "100%", background: "transparent", border: "none", padding: "18px 0", fontSize: 18, fontWeight: 950, cursor: "pointer", display: "flex", justifyContent: "space-between", color: "#081b44" },
  faqAnswer: { marginTop: 0, color: "#526781", fontWeight: 800 }
};