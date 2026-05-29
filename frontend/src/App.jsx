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
  guide: "/#/destination-guide",
  offers: "/#/special-offers",
  reviews: "/#/guest-reviews",
  support: "/#/support-centre",
  partners: "/#/industry-partnerships",
  business: "/#/business-portal",
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
    ? n.toLocaleString(undefined, {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      })
    : "0.00";
}

function nightsBetween(a, b) {
  const start = new Date(a);
  const end = new Date(b);
  const diff = Math.ceil((end - start) / 86400000);
  return Number.isFinite(diff) && diff > 0 ? diff : 1;
}

function mapSearch(type, query) {
  return `https://www.google.com/maps/search/${encodeURIComponent(`${type} near ${query}`)}`;
}

function routeUrl(path) {
  return `${window.location.origin}${path}`;
}

function currentRoute() {
  const hash = window.location.hash || "";
  if (hash === "#/destination-guide") return "guide";
  if (hash === "#/special-offers") return "offers";
  if (hash === "#/guest-reviews") return "reviews";
  if (hash === "#/support-centre") return "support";
  if (hash === "#/industry-partnerships") return "partners";
  if (hash === "#/business-portal") return "business";
  return "hotels";
}

export default function App() {
  const [countries, setCountries] = useState([]);
  const [cities, setCities] = useState([]);
  const [country, setCountry] = useState("");
  const [city, setCity] = useState("");
  const [checkIn, setCheckIn] = useState(todayISO());
  const [checkOut, setCheckOut] = useState(tomorrowISO());
  const [guests, setGuests] = useState(2);
  const [rooms, setRooms] = useState(1);
  const [currency, setCurrency] = useState("GBP");
  const [loading, setLoading] = useState(false);
  const [paying, setPaying] = useState(false);
  const [hotels, setHotels] = useState([]);
  const [selectedHotel, setSelectedHotel] = useState(null);
  const [notice, setNotice] = useState("");
  const [partnerSent, setPartnerSent] = useState(false);
  const [reviewSent, setReviewSent] = useState(false);

  const route = currentRoute();
  const nights = useMemo(() => nightsBetween(checkIn, checkOut), [checkIn, checkOut]);

  useEffect(() => {
    loadDestinations();
  }, []);

  async function loadDestinations() {
    try {
      const res = await fetch(`${API_BASE}/destinations`, { cache: "no-store" });
      const data = await res.json();
      const list = Array.isArray(data) ? data : [];
      setCountries(list);

      if (!list.length) {
        setNotice("Destinations are being refreshed. Please try again shortly.");
      }
    } catch (err) {
      console.error(err);
      setNotice("We could not load destinations right now. Please refresh the page.");
    }
  }

  useEffect(() => {
    const found = countries.find((c) => c.country === country);
    setCities(found?.cities || []);
    setCity("");
    setHotels([]);
    setSelectedHotel(null);
  }, [country, countries]);

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
    } catch (err) {
      console.error(err);
      setNotice("We could not load hotels for this destination right now. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  function hotelPrice(hotel) {
    return (
      hotel?.price ||
      hotel?.amount ||
      hotel?.nightly_rate ||
      hotel?.rooms?.[0]?.convertedPrice ||
      hotel?.rooms?.[0]?.price ||
      0
    );
  }

  function hotelCurrency(hotel) {
    return (
      hotel?.currency ||
      hotel?.displayCurrency ||
      hotel?.rooms?.[0]?.displayCurrency ||
      currency
    );
  }

  async function secureReservation() {
    setNotice("");

    if (!selectedHotel) {
      setNotice("Please select a hotel before continuing to secure payment.");
      return;
    }

    const amount =
      Number(hotelPrice(selectedHotel) || 0) *
      Math.max(1, Number(rooms || 1)) *
      nights;

    if (!amount || amount <= 0) {
      setNotice("A valid stay price is required before secure payment can start.");
      return;
    }

    try {
      setPaying(true);

      const payload = {
        hotelId: selectedHotel.hotelId || selectedHotel.hotel_id || selectedHotel.id || "",
        hotelName: selectedHotel.name || "MySpace Hotel Reservation",
        country: selectedHotel.country || country,
        city: selectedHotel.city || city,
        checkIn,
        checkOut,
        guests: Number(guests || 1),
        rooms: Number(rooms || 1),
        amount,
        currency: hotelCurrency(selectedHotel),
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
        body: JSON.stringify({ ...payload, bookingRef }),
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
    } catch (err) {
      console.error(err);

      if (STRIPE_PAYMENT_LINK) {
        window.location.href = STRIPE_PAYMENT_LINK;
        return;
      }

      setNotice("Secure payment could not be started. Please try again.");
    } finally {
      setPaying(false);
    }
  }

  const destinationQuery =
    [selectedHotel?.name, city, country].filter(Boolean).join(", ") || "London";

  const selectedPrice = hotelPrice(selectedHotel);
  const selectedCurrency = hotelCurrency(selectedHotel);
  const totalPrice =
    Number(selectedPrice || 0) * Math.max(1, Number(rooms || 1)) * nights;

  return (
    <div style={styles.page}>
      <Header />

      {route === "hotels" && (
        <HotelsPage
          countries={countries}
          cities={cities}
          country={country}
          city={city}
          checkIn={checkIn}
          checkOut={checkOut}
          guests={guests}
          rooms={rooms}
          currency={currency}
          loading={loading}
          paying={paying}
          hotels={hotels}
          selectedHotel={selectedHotel}
          notice={notice}
          nights={nights}
          selectedCurrency={selectedCurrency}
          totalPrice={totalPrice}
          setCountry={setCountry}
          setCity={setCity}
          setCheckIn={setCheckIn}
          setCheckOut={setCheckOut}
          setGuests={setGuests}
          setRooms={setRooms}
          setCurrency={setCurrency}
          setHotels={setHotels}
          setSelectedHotel={setSelectedHotel}
          searchHotels={searchHotels}
          secureReservation={secureReservation}
          hotelPrice={hotelPrice}
          hotelCurrency={hotelCurrency}
          destinationQuery={destinationQuery}
        />
      )}

      {route === "guide" && <GuidePortal />}
      {route === "offers" && <OffersPortal />}
      {route === "reviews" && (
        <ReviewsPortal reviewSent={reviewSent} setReviewSent={setReviewSent} />
      )}
      {route === "support" && <SupportPortal />}
      {route === "partners" && (
        <PartnersPortal partnerSent={partnerSent} setPartnerSent={setPartnerSent} />
      )}
      {route === "business" && <BusinessPortal />}

      <Footer />
    </div>
  );
}

function Header() {
  return (
    <header style={styles.header}>
      <a style={styles.brandButton} href={routeUrl("/")} target="_blank" rel="noopener noreferrer">
        <div style={styles.logo}>MYSPACE HOTEL</div>
        <div style={styles.tagline}>
          Hotels, Resorts, Serviced Apartments, Worldwide Travel
        </div>
      </a>

      <nav style={styles.nav}>
        <a style={styles.navLink} href={routeUrl(ROUTES.hotels)} target="_blank" rel="noopener noreferrer">
          Hotels
        </a>
        <a style={styles.navLink} href={routeUrl(ROUTES.guide)} target="_blank" rel="noopener noreferrer">
          Destination Guide
        </a>
        <a style={styles.navLink} href={routeUrl(ROUTES.offers)} target="_blank" rel="noopener noreferrer">
          Special Offers
        </a>
        <a style={styles.navLink} href={routeUrl(ROUTES.reviews)} target="_blank" rel="noopener noreferrer">
          Guest Reviews
        </a>
        <a style={styles.navLink} href={routeUrl(ROUTES.support)} target="_blank" rel="noopener noreferrer">
          Support Centre
        </a>
        <a style={styles.partnerLink} href={routeUrl(ROUTES.partners)} target="_blank" rel="noopener noreferrer">
          Industry Partnerships
        </a>
        <a style={styles.loginLink} href={routeUrl(ROUTES.business)} target="_blank" rel="noopener noreferrer">
          Business Portal
        </a>
      </nav>
    </header>
  );
}

function HotelsPage(props) {
  const heroText = props.country
    ? `Exceptional hotels in ${props.country}`
    : "Exceptional hotels around the world";

  return (
    <>
      <section style={styles.hero}>
        <div style={styles.overlay}>
          <div style={styles.heroContent}>
            <div>
              <div style={styles.heroBadge}>Trusted accommodation for every journey</div>
              <h1 style={styles.heroTitle}>{heroText}</h1>
              <p style={styles.heroSubtitle}>
                Search trusted hotels, resorts and serviced accommodation with clear pricing,
                secure reservation steps and helpful destination support for business trips,
                family holidays and luxury escapes.
              </p>
            </div>

            <div style={styles.promisePanel}>
              <div style={styles.promiseTitle}>Why book with MySpace Hotel?</div>
              <div style={styles.promiseItem}>Clear pricing before you continue</div>
              <div style={styles.promiseItem}>Secure payment step</div>
              <div style={styles.promiseItem}>Destination guidance for safer planning</div>
              <div style={styles.promiseItem}>Support before, during and after your stay</div>
            </div>
          </div>

          <div style={styles.searchCard}>
            <SearchBox {...props} />
          </div>

          <div style={styles.statsRow}>
            <InfoMetric big="Secure" small="Reservations" />
            <InfoMetric big="Trusted" small="Accommodation" />
            <InfoMetric big="Worldwide" small="Destinations" />
            <InfoMetric big="Dedicated" small="Travel Support" />
          </div>
        </div>
      </section>

      {props.notice ? <div style={styles.notice}>{props.notice}</div> : null}

      <section style={styles.resultsWrap}>
        <main style={styles.resultsMain}>
          <h2 style={styles.resultsTitle}>Recommended Hotels</h2>
          <p style={styles.sectionText}>
            Compare accommodation choices, review destination details and select the stay that suits your journey.
          </p>

          {props.loading && (
            <div style={styles.loading}>Finding suitable accommodation for your destination...</div>
          )}

          {!props.loading && props.hotels.length === 0 && (
            <div style={styles.empty}>
              Choose a destination and travel dates to discover available accommodation.
            </div>
          )}

          <div style={styles.hotelGrid}>
            {props.hotels.map((hotel, idx) => {
              const displayPrice = props.hotelPrice(hotel);
              const displayCurrency = props.hotelCurrency(hotel);
              const selected =
                props.selectedHotel &&
                (props.selectedHotel.hotelId ||
                  props.selectedHotel.hotel_id ||
                  props.selectedHotel.id ||
                  props.selectedHotel.name) ===
                  (hotel.hotelId || hotel.hotel_id || hotel.id || hotel.name);

              return (
                <article
                  key={hotel.hotelId || hotel.hotel_id || idx}
                  style={selected ? styles.hotelCardSelected : styles.hotelCard}
                >
                  <img
                    src={
                      hotel.image ||
                      "https://images.unsplash.com/photo-1566073771259-6a8506099945?q=80&w=1200&auto=format&fit=crop"
                    }
                    alt={hotel.name || "Hotel"}
                    style={styles.hotelImage}
                  />

                  <div style={styles.hotelBody}>
                    <div style={styles.badge}>
                      {selected ? "Selected Property" : "Recommended Property"}
                    </div>
                    <div style={styles.hotelName}>{hotel.name || "Selected hotel"}</div>
                    <div style={styles.hotelCity}>
                      {hotel.city}, {hotel.country}
                    </div>

                    <div style={styles.hotelMetaRow}>
                      <span style={styles.hotelMeta}>Comfort stay</span>
                      <span style={styles.hotelMeta}>Clear details</span>
                      <span style={styles.hotelMeta}>Guest support</span>
                    </div>

                    <div style={styles.hotelPrice}>
                      {displayCurrency} {money(displayPrice)}
                    </div>
                    <div style={styles.priceNote}>
                      Displayed price is shown for review before continuing. Final booking details are confirmed before payment.
                    </div>

                    <button
                      style={styles.bookBtn}
                      onClick={() =>
                        props.setSelectedHotel({
                          ...hotel,
                          price: displayPrice,
                          currency: displayCurrency,
                        })
                      }
                    >
                      Select Hotel
                    </button>
                  </div>
                </article>
              );
            })}
          </div>
        </main>

        <aside style={styles.summaryPanel}>
          <div style={styles.summaryTitle}>Booking Summary</div>
          <div style={styles.summaryMeta}>
            {props.nights} night{props.nights === 1 ? "" : "s"}, {props.rooms} room
            {Number(props.rooms) === 1 ? "" : "s"}, {props.guests} guest
            {Number(props.guests) === 1 ? "" : "s"}
          </div>

          {!props.selectedHotel ? (
            <div style={styles.summaryEmpty}>
              Select a hotel to review your stay summary, estimated total and secure payment option.
            </div>
          ) : (
            <>
              <div style={styles.selectedHotel}>{props.selectedHotel.name}</div>
              <div style={styles.selectedAddress}>
                {props.selectedHotel.city}, {props.selectedHotel.country}
              </div>

              <div style={styles.priceBox}>
                <div style={styles.priceLabel}>Estimated stay total</div>
                <div style={styles.summaryPrice}>
                  {props.selectedCurrency} {money(props.totalPrice)}
                </div>
                <div style={styles.priceSmall}>
                  Based on {props.nights} night{props.nights === 1 ? "" : "s"} and{" "}
                  {props.rooms} room{Number(props.rooms) === 1 ? "" : "s"}.
                </div>
              </div>

              <button style={styles.payBtn} onClick={props.secureReservation} disabled={props.paying}>
                {props.paying ? "Opening Secure Payment..." : "Secure Your Reservation"}
              </button>

              <a
                style={styles.secondaryLink}
                href={mapSearch("things to do", props.destinationQuery)}
                target="_blank"
                rel="noreferrer"
              >
                Explore This Destination
              </a>
            </>
          )}
        </aside>
      </section>
    </>
  );
}

function SearchBox(props) {
  return (
    <>
      <div style={styles.inputBlock}>
        <label style={styles.label}>Country</label>
        <select value={props.country} onChange={(e) => props.setCountry(e.target.value)} style={styles.select}>
          <option value="">Select country</option>
          {props.countries.map((c) => (
            <option key={c.country} value={c.country}>
              {c.country}
            </option>
          ))}
        </select>
      </div>

      <div style={styles.inputBlock}>
        <label style={styles.label}>City</label>
        <select
          value={props.city}
          onChange={(e) => {
            props.setCity(e.target.value);
            props.setHotels([]);
            props.setSelectedHotel(null);
          }}
          style={styles.select}
          disabled={!props.country}
        >
          <option value="">{props.country ? "Select city" : "Select country first"}</option>
          {props.cities.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
      </div>

      <InputBlock label="Check-in" type="date" value={props.checkIn} onChange={props.setCheckIn} />
      <InputBlock label="Check-out" type="date" value={props.checkOut} onChange={props.setCheckOut} />
      <InputBlock label="Guests" type="number" value={props.guests} onChange={props.setGuests} min="1" max="20" />
      <InputBlock label="Rooms" type="number" value={props.rooms} onChange={props.setRooms} min="1" max="10" />

      <div style={styles.inputBlock}>
        <label style={styles.label}>Currency</label>
        <select value={props.currency} onChange={(e) => props.setCurrency(e.target.value)} style={styles.select}>
          <option>GBP</option>
          <option>USD</option>
          <option>EUR</option>
          <option>AED</option>
          <option>NGN</option>
          <option>CAD</option>
          <option>AUD</option>
          <option>JPY</option>
        </select>
      </div>

      <button onClick={props.searchHotels} style={styles.searchBtn}>
        {props.loading ? "Finding Hotels..." : "Find Hotels"}
      </button>
    </>
  );
}

function InputBlock({ label, type, value, onChange, min, max }) {
  return (
    <div style={styles.inputBlock}>
      <label style={styles.label}>{label}</label>
      <input
        type={type}
        min={min}
        max={max}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        style={styles.input}
      />
    </div>
  );
}

function GuidePortal() {
  return (
    <PortalShell
      title="Destination Guide"
      subtitle="Plan safer and more enjoyable trips with practical destination support."
      badge="Travel planning"
    >
      <div style={styles.boxGrid}>
        <GuideCard title="Hospitals and urgent care" text="Find nearby hospitals, pharmacies and urgent-care services before you travel." href={mapSearch("hospital", "selected destination")} />
        <GuideCard title="Restaurants and cafÃ©s" text="Discover restaurants, cafÃ©s and local dining options around your chosen destination." href={mapSearch("restaurants", "selected destination")} />
        <GuideCard title="Airport and transfers" text="Plan airport arrival, railway stations, taxis and local transfers." href={mapSearch("airport", "selected destination")} />
        <GuideCard title="Museums and culture" text="Explore museums, galleries, heritage sites and local attractions." href={mapSearch("museum", "selected destination")} />
        <GuideCard title="Family attractions" text="Find parks, zoos, beaches, shopping centres and family-friendly activities." href={mapSearch("family attractions", "selected destination")} />
        <GuideCard title="Local transport" text="Review nearby transport options including buses, trains and taxi services." href={mapSearch("transport", "selected destination")} />
      </div>
    </PortalShell>
  );
}

function OffersPortal() {
  return (
    <PortalShell title="Special Offers" subtitle="Explore travel value across selected destinations and accommodation types." badge="Selected travel value">
      <div style={styles.boxGrid}>
        <OfferCard text="Early booking savings on selected hotels and travel periods." />
        <OfferCard text="Family-friendly stay options for popular destinations." />
        <OfferCard text="Long-stay accommodation for business and extended travel." />
        <OfferCard text="Seasonal travel offers across selected worldwide destinations." />
      </div>
    </PortalShell>
  );
}

function ReviewsPortal({ reviewSent, setReviewSent }) {
  return (
    <PortalShell title="Guest Reviews" subtitle="MySpace Hotel is built around confident travel decisions, helpful guidance and clear accommodation choices." badge="Guest experience">
      <div style={styles.boxGrid}>
        <ReviewCard title="Business travel" text="A simple way to search trusted stays and compare accommodation options for professional trips." />
        <ReviewCard title="Family holidays" text="Destination guidance and practical travel links help families plan with more confidence." />
        <ReviewCard title="City breaks" text="Clear hotel search, local attractions and dining guidance make short trips easier to plan." />
      </div>

      {reviewSent ? (
        <div style={styles.success}>Thank you. Your review has been received.</div>
      ) : (
        <form
          style={styles.form}
          onSubmit={(e) => {
            e.preventDefault();
            setReviewSent(true);
          }}
        >
          <input style={styles.input} placeholder="Your name" />
          <input style={styles.input} placeholder="Email address" type="email" />
          <textarea style={styles.textarea} placeholder="Tell us about your booking or travel experience." />
          <button style={styles.formBtn}>Share Your Experience</button>
        </form>
      )}
    </PortalShell>
  );
}

function SupportPortal() {
  return (
    <PortalShell title="Support Centre" subtitle="Helpful customer support before, during and after your stay." badge="Customer support">
      <div style={styles.boxGrid}>
        <InfoCard title="Before your trip" text="Get help reviewing destinations, accommodation options, dates, room choices and travel needs before booking." />
        <InfoCard title="During your stay" text="Access helpful guidance for local services, destination support and stay-related questions." />
        <InfoCard title="After your journey" text="Share your experience, request support and help us improve future guest journeys." />
        <InfoCard title="Contact MySpace Hotel" text="Email reservations@myspace-hotel.com for customer support and booking assistance." />
      </div>
    </PortalShell>
  );
}

function PartnersPortal({ partnerSent, setPartnerSent }) {
  return (
    <PortalShell title="Industry Partnerships" subtitle="MySpace Hotel welcomes partnership enquiries from accommodation and travel technology partners." badge="Partnerships">
      <div style={styles.partnerGrid}>
        <InfoCard title="Hotels and accommodation" text="Work with MySpace Hotel to present trusted stays to guests seeking global accommodation." />
        <InfoCard title="PMS and channel managers" text="Connect property availability, rates and booking information through professional partnership workflows." />
        <InfoCard title="Travel technology partners" text="Collaborate on better travel experiences, destination support and improved guest journeys." />
      </div>

      {partnerSent ? (
        <div style={styles.partnerSuccess}>Thank you. Your partnership enquiry has been received.</div>
      ) : (
        <form
          style={styles.partnerForm}
          onSubmit={(e) => {
            e.preventDefault();
            setPartnerSent(true);
          }}
        >
          <input style={styles.input} placeholder="Business or property name" required />
          <input style={styles.input} placeholder="Contact name" required />
          <input style={styles.input} placeholder="Email address" type="email" required />
          <input style={styles.input} placeholder="Country" required />
          <input style={styles.input} placeholder="City" required />
          <select style={styles.select} defaultValue="">
            <option value="" disabled>Partnership type</option>
            <option>Hotel or accommodation provider</option>
            <option>PMS provider</option>
            <option>Channel manager</option>
            <option>Travel technology partner</option>
            <option>Other hospitality partner</option>
          </select>
          <textarea style={styles.textarea} placeholder="Tell us how you would like to work with MySpace Hotel." required />
          <button style={styles.formBtn}>Submit Partnership Enquiry</button>
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
      <section style={styles.loginWrap}>
        <div style={styles.loginIntro}>
          <div style={styles.heroBadge}>Secure business access</div>
          <h1 style={styles.portalTitle}>Business Portal</h1>
          <p style={styles.portalSubtitle}>
            Login area for approved hotels, accommodation partners, channel managers and business users.
          </p>

          <div style={styles.securityList}>
            <div style={styles.securityItem}>Partner enquiries and onboarding access</div>
            <div style={styles.securityItem}>Future booking, inventory and account tools</div>
            <div style={styles.securityItem}>Secure access for approved business users only</div>
          </div>
        </div>

        <form style={styles.loginCard} onSubmit={handleLogin}>
          <h2 style={styles.loginTitle}>Business Login</h2>
          <p style={styles.loginText}>
            Enter your approved business credentials to continue.
          </p>

          <label style={styles.label}>Email address</label>
          <input
            style={styles.input}
            type="email"
            placeholder="business@example.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />

          <label style={styles.label}>Password</label>
          <input
            style={styles.input}
            type="password"
            placeholder="Enter password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />

          <button style={styles.loginSubmit} type="submit">
            Login
          </button>

          {portalNotice ? <div style={styles.loginNotice}>{portalNotice}</div> : null}

          <a style={styles.loginHelp} href={routeUrl(ROUTES.partners)} target="_blank" rel="noopener noreferrer">
            Need access? Apply through Industry Partnerships
          </a>
        </form>
      </section>
    </main>
  );
}

function PortalShell({ title, subtitle, badge, children }) {
  return (
    <main style={styles.portalPage}>
      <section style={styles.portalHero}>
        <div style={styles.heroBadge}>{badge}</div>
        <h1 style={styles.portalTitle}>{title}</h1>
        <p style={styles.portalSubtitle}>{subtitle}</p>
        <a style={styles.portalButton} href={routeUrl(ROUTES.hotels)} target="_blank" rel="noopener noreferrer">
          Open Hotel Search
        </a>
      </section>

      <section style={styles.portalContent}>{children}</section>
    </main>
  );
}

function InfoMetric({ big, small }) {
  return (
    <div style={styles.statCard}>
      <div style={styles.statNumber}>{big}</div>
      <div style={styles.statLabel}>{small}</div>
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
      <span style={styles.guideAction}>Open guide</span>
    </a>
  );
}

function OfferCard({ text }) {
  return <div style={styles.offerCard}>{text}</div>;
}

function ReviewCard({ title, text }) {
  return (
    <div style={styles.reviewCard}>
      <h3 style={styles.cardTitle}>{title}</h3>
      <p style={styles.cardText}>{text}</p>
    </div>
  );
}

function Footer() {
  return (
    <footer style={styles.footer}>
      <div style={styles.footerGrid}>
        <div>
          <div style={styles.footerBrand}>MYSPACE HOTEL</div>
          <div style={styles.footerText}>
            Trusted accommodation, clear pricing and travel support for guests worldwide.
          </div>
        </div>

        <div>
          <div style={styles.footerTitle}>Customer Support</div>
          <div style={styles.footerText}>reservations@myspace-hotel.com</div>
        </div>
      </div>
    </footer>
  );
}

const styles = {
  page: {
    background: "#f4f7fb",
    minHeight: "100vh",
    fontFamily: "Arial, sans-serif",
    color: "#0b1d51",
  },
  header: {
    background: "#ffffff",
    padding: "22px 34px",
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    borderBottom: "1px solid #dfe6f3",
    position: "sticky",
    top: 0,
    zIndex: 100,
    gap: 24,
  },
  brandButton: {
    border: "none",
    background: "transparent",
    textAlign: "left",
    cursor: "pointer",
    color: "#0b1d51",
    textDecoration: "none",
    display: "block",
  },
  logo: {
    fontSize: 46,
    fontWeight: 900,
    lineHeight: 1,
    letterSpacing: "-1px",
  },
  tagline: {
    marginTop: 8,
    fontSize: 16,
    color: "#5a6c8f",
    fontWeight: 700,
  },
  nav: {
    display: "flex",
    gap: 10,
    alignItems: "center",
    flexWrap: "wrap",
    justifyContent: "flex-end",
  },
  navLink: {
    border: "1px solid #d5dff1",
    background: "#ffffff",
    padding: "12px 16px",
    borderRadius: 14,
    fontWeight: 800,
    cursor: "pointer",
    fontSize: 15,
    color: "#0b1d51",
    textDecoration: "none",
    display: "inline-block",
  },
  partnerLink: {
    background: "#f1bf22",
    border: "none",
    padding: "12px 16px",
    borderRadius: 14,
    fontWeight: 900,
    cursor: "pointer",
    fontSize: 15,
    color: "#0b1d51",
    textDecoration: "none",
    display: "inline-block",
  },
  loginLink: {
    background: "#0b1d51",
    color: "#fff",
    border: "none",
    padding: "12px 16px",
    borderRadius: 14,
    fontWeight: 900,
    cursor: "pointer",
    fontSize: 15,
    textDecoration: "none",
    display: "inline-block",
  },
  hero: {
    backgroundImage:
      "url('https://images.unsplash.com/photo-1507525428034-b723cf961d3e?q=80&w=2200&auto=format&fit=crop')",
    backgroundSize: "cover",
    backgroundPosition: "center",
  },
  overlay: {
    background: "linear-gradient(90deg, rgba(255,255,255,0.92), rgba(255,255,255,0.78))",
    padding: "46px 40px",
  },
  heroContent: {
    display: "grid",
    gridTemplateColumns: "minmax(0, 1fr) 390px",
    gap: 28,
    alignItems: "center",
  },
  heroBadge: {
    display: "inline-block",
    background: "#0b1d51",
    color: "#fff",
    borderRadius: 999,
    padding: "10px 16px",
    fontWeight: 900,
    marginBottom: 18,
  },
  heroTitle: {
    fontSize: 76,
    fontWeight: 900,
    lineHeight: 0.98,
    maxWidth: 1050,
    margin: "0 0 20px",
    letterSpacing: "-2px",
  },
  heroSubtitle: {
    fontSize: 23,
    maxWidth: 930,
    lineHeight: 1.45,
    fontWeight: 700,
    color: "#30466e",
  },
  promisePanel: {
    background: "#ffffff",
    borderRadius: 28,
    padding: 26,
    boxShadow: "0 12px 34px rgba(0,0,0,0.10)",
  },
  promiseTitle: {
    fontSize: 24,
    fontWeight: 900,
    marginBottom: 14,
  },
  promiseItem: {
    background: "#f4f7fb",
    borderRadius: 16,
    padding: 14,
    marginTop: 10,
    fontWeight: 800,
    color: "#30466e",
  },
  searchCard: {
    background: "#ffffff",
    borderRadius: 32,
    padding: 24,
    marginTop: 34,
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))",
    gap: 16,
    alignItems: "end",
    boxShadow: "0 10px 30px rgba(0,0,0,0.08)",
  },
  inputBlock: {
    display: "flex",
    flexDirection: "column",
    gap: 8,
  },
  label: {
    fontWeight: 900,
    fontSize: 16,
  },
  input: {
    padding: "16px",
    borderRadius: 16,
    border: "1px solid #d8e0ef",
    fontSize: 16,
    background: "#fff",
    width: "100%",
    boxSizing: "border-box",
  },
  select: {
    padding: "16px",
    borderRadius: 16,
    border: "1px solid #d8e0ef",
    fontSize: 16,
    background: "#fff",
    width: "100%",
    boxSizing: "border-box",
  },
  searchBtn: {
    background: "#2750db",
    color: "#fff",
    border: "none",
    borderRadius: 16,
    padding: "16px",
    fontSize: 18,
    fontWeight: 900,
    cursor: "pointer",
  },
  statsRow: {
    marginTop: 28,
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(190px, 1fr))",
    gap: 18,
  },
  statCard: {
    background: "#fff",
    borderRadius: 24,
    padding: 24,
    textAlign: "center",
    boxShadow: "0 8px 22px rgba(0,0,0,0.05)",
  },
  statNumber: {
    fontSize: 34,
    fontWeight: 900,
  },
  statLabel: {
    marginTop: 8,
    fontSize: 18,
    fontWeight: 700,
    color: "#5f7090",
  },
  notice: {
    maxWidth: 1450,
    margin: "20px auto",
    background: "#fff7ed",
    color: "#9a3412",
    border: "1px solid #fed7aa",
    borderRadius: 18,
    padding: 18,
    fontWeight: 900,
  },
  resultsWrap: {
    display: "grid",
    gridTemplateColumns: "minmax(0, 1fr) 390px",
    gap: 28,
    maxWidth: 1500,
    margin: "0 auto",
    padding: "40px 34px 60px",
    alignItems: "start",
  },
  resultsMain: {
    minWidth: 0,
  },
  resultsTitle: {
    fontSize: 42,
    fontWeight: 900,
    margin: "0 0 10px",
  },
  sectionText: {
    fontSize: 18,
    lineHeight: 1.55,
    color: "#50678f",
    fontWeight: 700,
    maxWidth: 920,
  },
  loading: {
    background: "#fff",
    borderRadius: 22,
    padding: 30,
    fontSize: 20,
    fontWeight: 800,
    marginBottom: 22,
  },
  empty: {
    background: "#fff",
    borderRadius: 22,
    padding: 34,
    fontSize: 20,
    fontWeight: 700,
    marginBottom: 22,
  },
  hotelGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(310px, 1fr))",
    gap: 24,
  },
  hotelCard: {
    background: "#fff",
    borderRadius: 26,
    overflow: "hidden",
    boxShadow: "0 8px 25px rgba(0,0,0,0.08)",
    border: "3px solid transparent",
  },
  hotelCardSelected: {
    background: "#fff",
    borderRadius: 26,
    overflow: "hidden",
    boxShadow: "0 8px 25px rgba(0,0,0,0.08)",
    border: "3px solid #10b981",
  },
  hotelImage: {
    width: "100%",
    height: 235,
    objectFit: "cover",
  },
  hotelBody: {
    padding: 22,
  },
  badge: {
    display: "inline-block",
    background: "#ecfdf3",
    color: "#166534",
    borderRadius: 999,
    padding: "7px 12px",
    fontWeight: 950,
    fontSize: 13,
    marginBottom: 14,
  },
  hotelName: {
    fontSize: 24,
    fontWeight: 900,
    lineHeight: 1.2,
  },
  hotelCity: {
    marginTop: 9,
    color: "#61718f",
    fontWeight: 700,
    fontSize: 16,
  },
  hotelMetaRow: {
    display: "flex",
    flexWrap: "wrap",
    gap: 8,
    marginTop: 14,
  },
  hotelMeta: {
    background: "#f4f7fb",
    borderRadius: 999,
    padding: "7px 10px",
    fontWeight: 800,
    fontSize: 12,
    color: "#50678f",
  },
  hotelPrice: {
    marginTop: 16,
    fontSize: 30,
    fontWeight: 900,
    color: "#2750db",
  },
  priceNote: {
    marginTop: 8,
    color: "#61718f",
    fontWeight: 700,
    fontSize: 13,
    lineHeight: 1.45,
  },
  bookBtn: {
    marginTop: 18,
    width: "100%",
    background: "#0b1d51",
    color: "#fff",
    border: "none",
    borderRadius: 16,
    padding: "15px",
    fontWeight: 900,
    fontSize: 17,
    cursor: "pointer",
  },
  summaryPanel: {
    position: "sticky",
    top: 112,
    background: "#fff",
    borderRadius: 26,
    padding: 24,
    boxShadow: "0 8px 25px rgba(0,0,0,0.08)",
  },
  summaryTitle: {
    fontSize: 30,
    fontWeight: 900,
  },
  summaryMeta: {
    marginTop: 8,
    color: "#60708a",
    fontWeight: 800,
  },
  summaryEmpty: {
    marginTop: 20,
    background: "#f4f7fb",
    borderRadius: 18,
    padding: 20,
    fontWeight: 800,
    color: "#60708a",
    lineHeight: 1.5,
  },
  selectedHotel: {
    marginTop: 20,
    fontSize: 23,
    fontWeight: 900,
    lineHeight: 1.25,
  },
  selectedAddress: {
    marginTop: 10,
    color: "#60708a",
    fontWeight: 800,
  },
  priceBox: {
    marginTop: 22,
    background: "#ecfdf3",
    borderRadius: 20,
    padding: 22,
  },
  priceLabel: {
    color: "#166534",
    fontWeight: 900,
  },
  summaryPrice: {
    marginTop: 8,
    fontSize: 34,
    fontWeight: 900,
  },
  priceSmall: {
    marginTop: 8,
    color: "#365943",
    fontWeight: 800,
    lineHeight: 1.4,
  },
  payBtn: {
    marginTop: 20,
    width: "100%",
    background: "#10b981",
    color: "#fff",
    border: "none",
    borderRadius: 18,
    padding: 18,
    fontSize: 18,
    fontWeight: 900,
    cursor: "pointer",
  },
  secondaryLink: {
    display: "block",
    marginTop: 12,
    width: "100%",
    background: "#fff",
    color: "#0b1d51",
    border: "2px solid #d9e4f2",
    borderRadius: 18,
    padding: 16,
    fontSize: 16,
    fontWeight: 900,
    textAlign: "center",
    textDecoration: "none",
    boxSizing: "border-box",
  },
  portalPage: {
    minHeight: "70vh",
    background: "#f4f7fb",
  },
  portalHero: {
    backgroundImage:
      "url('https://images.unsplash.com/photo-1507525428034-b723cf961d3e?q=80&w=2200&auto=format&fit=crop')",
    backgroundSize: "cover",
    backgroundPosition: "center",
    padding: "90px 40px",
    boxShadow: "inset 0 0 0 2000px rgba(255,255,255,0.78)",
  },
  portalTitle: {
    fontSize: 74,
    fontWeight: 900,
    lineHeight: 1,
    margin: "0 0 18px",
    maxWidth: 1100,
  },
  portalSubtitle: {
    fontSize: 24,
    lineHeight: 1.5,
    color: "#30466e",
    fontWeight: 800,
    maxWidth: 950,
  },
  portalButton: {
    display: "inline-block",
    marginTop: 28,
    background: "#0b1d51",
    color: "#fff",
    borderRadius: 18,
    padding: "16px 24px",
    fontSize: 18,
    fontWeight: 900,
    textDecoration: "none",
  },
  portalContent: {
    maxWidth: 1500,
    margin: "0 auto",
    padding: "50px 40px 70px",
  },
  businessPage: {
    minHeight: "75vh",
    background:
      "linear-gradient(90deg, rgba(255,255,255,0.94), rgba(244,247,251,0.94)), url('https://images.unsplash.com/photo-1507525428034-b723cf961d3e?q=80&w=2200&auto=format&fit=crop')",
    backgroundSize: "cover",
    backgroundPosition: "center",
    padding: "70px 40px",
  },
  loginWrap: {
    maxWidth: 1250,
    margin: "0 auto",
    display: "grid",
    gridTemplateColumns: "1fr 460px",
    gap: 40,
    alignItems: "center",
  },
  loginIntro: {
    padding: 20,
  },
  securityList: {
    marginTop: 28,
    display: "grid",
    gap: 14,
    maxWidth: 620,
  },
  securityItem: {
    background: "#ffffff",
    borderRadius: 18,
    padding: 18,
    fontWeight: 900,
    color: "#30466e",
    boxShadow: "0 8px 24px rgba(0,0,0,0.06)",
  },
  loginCard: {
    background: "#ffffff",
    borderRadius: 30,
    padding: 34,
    boxShadow: "0 14px 40px rgba(0,0,0,0.12)",
    display: "grid",
    gap: 14,
  },
  loginTitle: {
    fontSize: 34,
    fontWeight: 900,
    margin: 0,
  },
  loginText: {
    color: "#50678f",
    fontWeight: 700,
    lineHeight: 1.5,
    marginTop: 0,
  },
  loginSubmit: {
    marginTop: 8,
    background: "#0b1d51",
    color: "#fff",
    border: "none",
    borderRadius: 18,
    padding: 18,
    fontSize: 18,
    fontWeight: 900,
    cursor: "pointer",
  },
  loginNotice: {
    background: "#fff7ed",
    color: "#9a3412",
    border: "1px solid #fed7aa",
    borderRadius: 16,
    padding: 14,
    fontWeight: 850,
    lineHeight: 1.5,
  },
  loginHelp: {
    color: "#2750db",
    fontWeight: 900,
    textDecoration: "none",
    marginTop: 6,
  },
  boxGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))",
    gap: 22,
  },
  infoCard: {
    background: "#fff",
    borderRadius: 24,
    padding: 28,
    minHeight: 190,
    boxShadow: "0 8px 24px rgba(0,0,0,0.05)",
  },
  guideCard: {
    background: "#fff",
    borderRadius: 24,
    padding: 28,
    minHeight: 190,
    textDecoration: "none",
    color: "#0b1d51",
    boxShadow: "0 8px 24px rgba(0,0,0,0.05)",
  },
  guideAction: {
    display: "inline-block",
    marginTop: 12,
    color: "#2750db",
    fontWeight: 900,
  },
  offerCard: {
    background: "#0b1d51",
    color: "#fff",
    borderRadius: 24,
    padding: 34,
    fontSize: 22,
    fontWeight: 800,
    lineHeight: 1.4,
  },
  reviewCard: {
    background: "#fff",
    borderRadius: 24,
    padding: 28,
    minHeight: 160,
    border: "1px solid #dce6f3",
  },
  cardTitle: {
    fontSize: 24,
    margin: "0 0 14px",
    fontWeight: 900,
  },
  cardText: {
    color: "#445b82",
    lineHeight: 1.7,
    fontSize: 16,
    fontWeight: 650,
  },
  form: {
    marginTop: 28,
    display: "grid",
    gap: 16,
    maxWidth: 820,
    background: "#fff",
    padding: 24,
    borderRadius: 24,
    boxShadow: "0 8px 24px rgba(0,0,0,0.05)",
  },
  textarea: {
    padding: 16,
    borderRadius: 16,
    border: "1px solid #d8e0ef",
    minHeight: 140,
    fontSize: 16,
    fontFamily: "Arial, sans-serif",
  },
  formBtn: {
    background: "#2750db",
    color: "#fff",
    border: "none",
    borderRadius: 16,
    padding: "16px",
    fontSize: 18,
    fontWeight: 900,
    cursor: "pointer",
  },
  success: {
    marginTop: 22,
    background: "#ecfdf3",
    color: "#166534",
    borderRadius: 18,
    padding: 20,
    fontWeight: 900,
  },
  partnerGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))",
    gap: 22,
    marginTop: 28,
    color: "#0b1d51",
  },
  partnerForm: {
    marginTop: 28,
    display: "grid",
    gap: 16,
    maxWidth: 900,
    background: "#fff",
    padding: 24,
    borderRadius: 24,
  },
  partnerSuccess: {
    marginTop: 26,
    background: "#ecfdf3",
    color: "#166534",
    borderRadius: 18,
    padding: 20,
    fontWeight: 900,
    maxWidth: 900,
  },
  footer: {
    background: "#071538",
    color: "#fff",
    padding: "34px 40px",
  },
  footerGrid: {
    maxWidth: 1500,
    margin: "0 auto",
    display: "grid",
    gridTemplateColumns: "2fr 1fr",
    gap: 26,
    alignItems: "start",
  },
  footerBrand: {
    fontSize: 32,
    fontWeight: 900,
    marginBottom: 10,
  },
  footerTitle: {
    fontSize: 18,
    fontWeight: 900,
    marginBottom: 10,
  },
  footerText: {
    fontSize: 16,
    lineHeight: 1.6,
    color: "#dbe7ff",
    fontWeight: 650,
  },
};
