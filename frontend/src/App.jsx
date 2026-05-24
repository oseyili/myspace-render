import React, { useEffect, useMemo, useState } from "react";

const API = import.meta.env.VITE_API_BASE || "https://myspace-hotel-backend.onrender.com";

const CURRENCIES = ["GBP", "USD", "EUR", "NGN", "AED", "CAD", "AUD"];

const FX = {
  GBP: 1,
  USD: 1.27,
  EUR: 1.17,
  NGN: 1900,
  AED: 4.66,
  CAD: 1.72,
  AUD: 1.92
};

const FALLBACK_DESTINATIONS = [
  { country: "United Kingdom", cities: ["London", "Manchester", "Birmingham", "Liverpool"] },
  { country: "France", cities: ["Paris", "Nice", "Lyon", "Marseille"] },
  { country: "Spain", cities: ["Barcelona", "Madrid", "Valencia", "Seville"] },
  { country: "United States", cities: ["New York", "Miami", "Los Angeles", "Las Vegas"] },
  { country: "United Arab Emirates", cities: ["Dubai", "Abu Dhabi"] },
  { country: "Nigeria", cities: ["Lagos", "Abuja", "Benin City"] }
];

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

function addDays(days) {
  return new Date(Date.now() + days * 86400000).toISOString().slice(0, 10);
}

function money(value) {
  const n = Number(value || 0);
  return Number.isFinite(n) ? n.toFixed(2) : "0.00";
}

function nightsBetween(start, end) {
  const diff = Math.ceil((new Date(end) - new Date(start)) / 86400000);
  return diff > 0 ? diff : 1;
}

function convertCurrency(amount, from, to) {
  if (!FX[from] || !FX[to]) return Number(amount || 0);
  return (Number(amount || 0) / FX[from]) * FX[to];
}

function cleanName(value) {
  return String(value || "")
    .replace(/\(\d+\)/g, "")
    .replace(/[^\w\s,.'-]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeDestinations(data) {
  const rows = Array.isArray(data?.countries) ? data.countries : Array.isArray(data) ? data : [];
  const map = new Map();

  rows.forEach((item) => {
    const country = cleanName(item.country || item.name || item.country_name);
    if (!country) return;

    const citySet = map.get(country) || new Set();
    const rawCities = Array.isArray(item.cities) ? item.cities : [];

    rawCities.forEach((cityItem) => {
      const city = cleanName(
        typeof cityItem === "string"
          ? cityItem
          : cityItem.city || cityItem.name || cityItem.city_name || cityItem.label
      );
      if (city) citySet.add(city);
    });

    if (citySet.size > 0) map.set(country, citySet);
  });

  return Array.from(map.entries())
    .map(([country, cities]) => ({
      country,
      cities: Array.from(cities).sort((a, b) => a.localeCompare(b))
    }))
    .sort((a, b) => a.country.localeCompare(b.country));
}

function mapSearch(place) {
  return "https://www.google.com/maps/search/" + encodeURIComponent(place);
}

function mapDirections(place) {
  return "https://www.google.com/maps/dir/?api=1&destination=" + encodeURIComponent(place);
}

export default function App() {
  const [page, setPage] = useState("home");
  const [destinations, setDestinations] = useState(FALLBACK_DESTINATIONS);
  const [country, setCountry] = useState("United Kingdom");
  const [city, setCity] = useState("London");
  const [checkin, setCheckin] = useState(todayISO());
  const [checkout, setCheckout] = useState(addDays(1));
  const [guests, setGuests] = useState("2");
  const [rooms, setRooms] = useState("1");
  const [currency, setCurrency] = useState("GBP");
  const [displayCurrency, setDisplayCurrency] = useState("GBP");
  const [loading, setLoading] = useState(false);
  const [hotels, setHotels] = useState([]);
  const [selectedHotel, setSelectedHotel] = useState(null);

  const cities = useMemo(() => {
    return destinations.find((x) => x.country === country)?.cities || [];
  }, [country, destinations]);

  const nights = nightsBetween(checkin, checkout);

  useEffect(() => {
    async function loadDestinations() {
      try {
        const response = await fetch(API + "/api/real-catalog/destinations", { cache: "no-store" });
        const data = await response.json();
        const clean = normalizeDestinations(data);
        if (clean.length > 0) setDestinations(clean);
      } catch {
        setDestinations(FALLBACK_DESTINATIONS);
      }
    }

    loadDestinations();
  }, []);

  function hotelNightly(hotel) {
    const rate = hotel?.first_rate || {};
    return Number(rate.amount || rate.net || hotel?.price || 0);
  }

  function hotelCurrency(hotel) {
    return hotel?.first_rate?.currency || currency || "GBP";
  }

  function hotelTotal(hotel) {
    return hotelNightly(hotel) * Number(rooms || 1) * nights;
  }

  async function searchHotels(customCountry = country, customCity = city) {
    if (!customCountry || !customCity) {
      alert("Please choose country and city.");
      return;
    }

    setLoading(true);
    setHotels([]);
    setSelectedHotel(null);

    try {
      const params = new URLSearchParams({
        country: customCountry,
        city: customCity,
        checkin,
        checkout,
        guests,
        rooms,
        limit: "80"
      });

      const response = await fetch(API + "/api/hotels/search?" + params.toString(), { cache: "no-store" });
      const data = await response.json();
      setHotels(data.hotels || []);
      setPage("results");
    } catch {
      alert("Hotel search failed. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  async function payNow(hotel) {
    const total = hotelTotal(hotel);
    const sourceCurrency = hotelCurrency(hotel);

    if (!total || total <= 0) {
      alert("This hotel does not have a valid payable total yet.");
      return;
    }

    try {
      const response = await fetch(API + "/api/create-checkout-session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          hotel_id: hotel.hotel_id || hotel.id,
          hotel_name: hotel.hotel_name || hotel.name,
          amount: total,
          currency: sourceCurrency,
          checkin,
          checkout,
          guests,
          rooms,
          nights,
          rate_key: hotel.first_rate?.rate_key || ""
        })
      });

      const data = await response.json();

      if (data.url) {
        window.location.href = data.url;
        return;
      }

      alert(data.error || "Stripe checkout is not active yet.");
    } catch {
      alert("Payment could not start. Check Stripe backend route.");
    }
  }

  const guidePlace = [
    selectedHotel?.hotel_name || selectedHotel?.name,
    selectedHotel?.address || selectedHotel?.area,
    city,
    country
  ].filter(Boolean).join(", ");

  return (
    <div style={styles.page}>
      <header style={styles.header}>
        <button style={styles.brandButton} onClick={() => setPage("home")}>
          <div style={styles.logo}>M</div>
          <div>
            <div style={styles.brand}>MYSPACE HOTEL</div>
            <div style={styles.tag}>Stay with clarity</div>
          </div>
        </button>

        <nav style={styles.nav}>
          <button onClick={() => setPage("home")}>Stays</button>
          <button onClick={() => setPage("destinations")}>Destinations</button>
          <button onClick={() => setPage("offers")}>Offers</button>
          <button onClick={() => setPage("guide")}>Guide</button>
          <button onClick={() => setPage("help")}>Help</button>
          <select value={displayCurrency} onChange={(e) => setDisplayCurrency(e.target.value)}>
            {CURRENCIES.map((item) => (
              <option key={item}>{item}</option>
            ))}
          </select>
          <button style={styles.goldButton} onClick={() => setPage("partnerForm")}>Partner Application Form</button>
          <button style={styles.outlineButton} onClick={() => setPage("partnerLogin")}>Partner Login</button>
        </nav>
      </header>

      {page === "home" && (
        <>
          <section style={styles.hero}>
            <div style={styles.heroShade}>
              <p style={styles.kicker}>Trusted stays. Clear prices. Global support.</p>
              <h1>Find your perfect stay</h1>
              <p style={styles.subText}>
                Search hotels, apartments, villas and verified accommodation worldwide with clean destination selection,
                supplier-backed rates and secure checkout.
              </p>

              <div style={styles.badges}>
                <span>113 countries</span>
                <span>Live hotel catalogue</span>
                <span>Secure payment</span>
                <span>Partner ready</span>
              </div>

              <div style={styles.searchBox}>
                <Field label="Stay type">
                  <select>
                    <option>Hotels only</option>
                    <option>Hotels and apartments</option>
                    <option>Villas and homes</option>
                  </select>
                </Field>

                <Field label="Country">
                  <select value={country} onChange={(e) => { setCountry(e.target.value); setCity(""); }}>
                    <option value="">Select country</option>
                    {destinations.map((item) => (
                      <option key={item.country} value={item.country}>{item.country}</option>
                    ))}
                  </select>
                </Field>

                <Field label="City">
                  <select value={city} onChange={(e) => setCity(e.target.value)}>
                    <option value="">Select city</option>
                    {cities.map((name) => (
                      <option key={name} value={name}>{name}</option>
                    ))}
                  </select>
                </Field>

                <Field label="Check-in">
                  <input type="date" value={checkin} onChange={(e) => setCheckin(e.target.value)} />
                </Field>

                <Field label="Check-out">
                  <input type="date" value={checkout} onChange={(e) => setCheckout(e.target.value)} />
                </Field>

                <Field label="Guests">
                  <select value={guests} onChange={(e) => setGuests(e.target.value)}>
                    <option>1</option>
                    <option>2</option>
                    <option>3</option>
                    <option>4</option>
                    <option>5</option>
                  </select>
                </Field>

                <Field label="Rooms">
                  <select value={rooms} onChange={(e) => setRooms(e.target.value)}>
                    <option>1</option>
                    <option>2</option>
                    <option>3</option>
                    <option>4</option>
                  </select>
                </Field>

                <button style={styles.searchButton} onClick={() => searchHotels()}>
                  {loading ? "Searching..." : "Search stays"}
                </button>
              </div>
            </div>
          </section>

          <section style={styles.featureStrip}>
            <Info title="Clean search" text="Country and city dropdowns show names only and stay aligned." />
            <Info title="Full stay total" text="Totals multiply nightly price by selected rooms and nights." />
            <Info title="Currency converter" text="Convert the full stay total before opening secure payment." />
          </section>

          <section style={styles.section}>
            <h2>Popular destinations</h2>
            <div style={styles.destGrid}>
              {[
                ["London", "United Kingdom", "https://images.unsplash.com/photo-1513635269975-59663e0ac1ad?q=80&w=1200"],
                ["Paris", "France", "https://images.unsplash.com/photo-1502602898657-3e91760cbb34?q=80&w=1200"],
                ["Dubai", "United Arab Emirates", "https://images.unsplash.com/photo-1512453979798-5ea266f8880c?q=80&w=1200"],
                ["New York", "United States", "https://images.unsplash.com/photo-1485871981521-5b1fd3805eee?q=80&w=1200"]
              ].map(([nextCity, nextCountry, image]) => (
                <button
                  key={nextCity}
                  style={{
                    ...styles.destinationCard,
                    backgroundImage: "linear-gradient(180deg,rgba(0,0,0,.05),rgba(0,0,0,.65)),url(" + image + ")"
                  }}
                  onClick={() => {
                    setCountry(nextCountry);
                    setCity(nextCity);
                    searchHotels(nextCountry, nextCity);
                  }}
                >
                  <strong>{nextCity}</strong>
                  <span>{nextCountry}</span>
                </button>
              ))}
            </div>
          </section>

          <section style={styles.helpStrip}>
            <h2>Need help? We are here for you.</h2>
            <p>For reservations, hotel onboarding and travel support, email reservations@myspace-hotel.com.</p>
            <div style={styles.helpGrid}>
              <Info title="Reservations email" text="reservations@myspace-hotel.com for booking support and payment help." />
              <Info title="Travel guide" text="Maps, airports, hospitals, restaurants and attractions." />
              <Info title="Hotel partners" text="Hotels should use the application form before partner login." />
            </div>
          </section>
        </>
      )}

      {page === "results" && (
        <main style={styles.main}>
          <button style={styles.backButton} onClick={() => setPage("home")}>Back to search</button>
          <h1>Available stays in {city}, {country}</h1>

          <div style={styles.resultsGrid}>
            {hotels.map((hotel) => {
              const nightly = hotelNightly(hotel);
              const sourceCurrency = hotelCurrency(hotel);
              const total = hotelTotal(hotel);
              const converted = convertCurrency(total, sourceCurrency, displayCurrency);

              return (
                <article key={hotel.hotel_id || hotel.id || hotel.name} style={styles.hotelCard}>
                  {hotel.image_url ? <img src={hotel.image_url} alt="" style={styles.hotelImage} /> : <div style={styles.noImage}>MYSPACE HOTEL</div>}
                  <div style={styles.hotelBody}>
                    <h2>{hotel.hotel_name || hotel.name}</h2>
                    <p>{hotel.address || hotel.area || city}</p>

                    <div style={styles.priceBox}>
                      <div>Nightly: {sourceCurrency} {money(nightly)}</div>
                      <div>Rooms: {rooms}</div>
                      <div>Nights: {nights}</div>
                      <strong>Total: {sourceCurrency} {money(total)}</strong>
                    </div>

                    <div style={styles.converterBox}>
                      <label>Currency converter</label>
                      <select value={displayCurrency} onChange={(e) => setDisplayCurrency(e.target.value)}>
                        {CURRENCIES.map((item) => (
                          <option key={item}>{item}</option>
                        ))}
                      </select>
                      <strong>{displayCurrency} {money(converted)}</strong>
                    </div>

                    <div style={styles.actions}>
                      <button onClick={() => setSelectedHotel(hotel)}>Select</button>
                      <button onClick={() => { setSelectedHotel(hotel); setPage("guide"); }}>Full guide</button>
                      <button onClick={() => payNow(hotel)}>Pay full total</button>
                    </div>
                  </div>
                </article>
              );
            })}
          </div>
        </main>
      )}

      {page === "guide" && <GuidePage setPage={setPage} place={guidePlace || city || "your destination"} />}
      {page === "destinations" && <DestinationsPage setPage={setPage} destinations={destinations} />}
      {page === "offers" && <OffersPage setPage={setPage} />}
      {page === "help" && <HelpPage setPage={setPage} />}
      {page === "partnerForm" && <PartnerForm setPage={setPage} />}
      {page === "partnerLogin" && <PartnerLogin setPage={setPage} />}
    </div>
  );
}

function Field({ label, children }) {
  return <label style={styles.field}><span>{label}</span>{children}</label>;
}

function Info({ title, text }) {
  return <div style={styles.infoBox}><h3>{title}</h3><p>{text}</p></div>;
}

function GuidePage({ setPage, place }) {
  const cards = [
    ["Map and directions", "Open the destination map and get turn-by-turn directions.", [["Open map", mapSearch(place)], ["Get directions", mapDirections(place)]]],
    ["Emergency services", "Find police, hospitals, pharmacies and urgent help nearby.", [["Police", mapSearch("police near " + place)], ["Hospital", mapSearch("hospital near " + place)], ["Pharmacy", mapSearch("pharmacy near " + place)]]],
    ["Airport and transfer", "Find nearest airport, taxi service, train and bus stations.", [["Airport", mapSearch("airport near " + place)], ["Taxi", mapSearch("taxi near " + place)], ["Train station", mapSearch("train station near " + place)]]],
    ["Food and shopping", "Find restaurants, cafes, supermarkets and shopping centres.", [["Restaurants", mapSearch("restaurants near " + place)], ["Cafes", mapSearch("cafes near " + place)], ["Shopping", mapSearch("shopping near " + place)]]],
    ["Tourism", "Find museums, tours, zoos, attractions and family activities.", [["Things to do", mapSearch("things to do near " + place)], ["Museums", mapSearch("museums near " + place)], ["Tour bus", mapSearch("tour bus near " + place)]]],
    ["Local support", "Plan safer movement before arrival with nearby services.", [["Explore nearby", mapSearch("restaurants hospitals airport attractions near " + place)]]]
  ];

  return (
    <main style={styles.main}>
      <button style={styles.backButton} onClick={() => setPage("home")}>Back</button>
      <section style={styles.panel}>
        <h1>Full Destination Guide</h1>
        <p>{place}</p>
      </section>
      <div style={styles.guideGrid}>
        {cards.map(([title, text, links]) => (
          <section key={title} style={styles.guideCard}>
            <h2>{title}</h2>
            <p>{text}</p>
            <div style={styles.linkGrid}>
              {links.map(([label, url]) => (
                <a key={label} href={url} target="_blank" rel="noreferrer">{label}</a>
              ))}
            </div>
          </section>
        ))}
      </div>
    </main>
  );
}

function DestinationsPage({ setPage, destinations }) {
  return (
    <main style={styles.main}>
      <button style={styles.backButton} onClick={() => setPage("home")}>Back</button>
      <section style={styles.panel}>
        <h1>Destinations</h1>
        <p>
          Choose a country and city on the main search page. Destination pages help customers plan accommodation,
          airport transfers, local transport, nearby food, attractions and emergency services before booking.
        </p>
      </section>

      <div style={styles.guideGrid}>
        <Info title="Search by country" text="Use the country dropdown to keep cities matched to the selected country." />
        <Info title="Plan your arrival" text="Use the guide page to open maps, airport routes and nearby transport." />
        <Info title="Travel safely" text="Check hospitals, police, pharmacies and local support links before arrival." />
        <Info title="Explore nearby" text="Find restaurants, shopping, museums, tours and family attractions." />
      </div>

      <div style={styles.destinationList}>
        {destinations.slice(0, 60).map((item) => (
          <section key={item.country} style={styles.infoBox}>
            <h2>{item.country}</h2>
            <p>{item.cities.slice(0, 12).join(", ")}</p>
          </section>
        ))}
      </div>
    </main>
  );
}

function OffersPage({ setPage }) {
  return (
    <main style={styles.main}>
      <button style={styles.backButton} onClick={() => setPage("home")}>Back</button>
      <section style={styles.panel}>
        <h1>Offers</h1>
        <p>Find flexible stays, business trips, family options and long-stay support.</p>
      </section>
      <div style={styles.guideGrid}>
        <Info title="Flexible stays" text="Choose properties with flexible booking terms where available." />
        <Info title="Family travel" text="Find larger rooms, apartments and connected options for family trips." />
        <Info title="Business travel" text="Support for work stays, city access and repeat corporate bookings." />
        <Info title="Long stays" text="Request help with extended bookings, relocation and monthly stays." />
      </div>
    </main>
  );
}

function HelpPage({ setPage }) {
  return (
    <main style={styles.main}>
      <button style={styles.backButton} onClick={() => setPage("home")}>Back</button>
      <section style={styles.panel}>
        <h1>Help and Support</h1>
        <p>Email reservations@myspace-hotel.com for booking support, payment questions, travel guidance and partner onboarding.</p>
      </section>
      <div style={styles.guideGrid}>
        <Info title="Reservations" text="Use reservations@myspace-hotel.com for reservation help and payment issues." />
        <Info title="Travel support" text="Use the guide page for maps, hospitals, transport, food and attractions." />
        <Info title="Hotels" text="Hotels should complete the partner application form before requesting login access." />
      </div>
    </main>
  );
}

function PartnerForm({ setPage }) {
  return (
    <main style={styles.main}>
      <button style={styles.backButton} onClick={() => setPage("home")}>Back</button>
      <section style={styles.panel}>
        <h1>Partner Application Form</h1>
        <p>Hotels should complete this form first. Approved properties receive login access after review.</p>
        <div style={styles.formGrid}>
          {["Hotel name", "Legal business name", "Contact name", "Email", "Phone", "Country", "City", "Address", "Website", "Number of rooms"].map((label) => (
            <input key={label} placeholder={label} />
          ))}
          <select>
            <option>Oracle OHIP</option>
            <option>SiteMinder</option>
            <option>Cloudbeds</option>
            <option>Mews</option>
            <option>Other PMS</option>
          </select>
          <textarea placeholder="Tell us about your hotel, rates, rooms and integration needs" />
        </div>
        <button style={styles.searchButton} onClick={() => alert("Application captured. Backend storage can be connected next.")}>Submit application</button>
      </section>
    </main>
  );
}

function PartnerLogin({ setPage }) {
  return (
    <main style={styles.main}>
      <button style={styles.backButton} onClick={() => setPage("home")}>Back</button>
      <section style={styles.panel}>
        <h1>Partner Login</h1>
        <p>Approved hotels and PMS partners can log in here. New hotels must complete the application form first.</p>
        <div style={styles.formGrid}>
          <input placeholder="Partner ID or email" />
          <input placeholder="Password or token" type="password" />
        </div>
        <button style={styles.searchButton}>Login</button>
      </section>
    </main>
  );
}

const styles = {
  page: { minHeight: "100vh", background: "#f5f8fd", color: "#07142f", fontFamily: "Arial, sans-serif" },
  header: { minHeight: 100, background: "#fff", display: "flex", alignItems: "center", justifyContent: "space-between", padding: "0 52px", boxShadow: "0 2px 18px rgba(15,23,42,.08)", gap: 16 },
  brandButton: { display: "flex", alignItems: "center", gap: 14, border: 0, background: "transparent", cursor: "pointer", textAlign: "left" },
  logo: { width: 54, height: 54, borderRadius: 14, background: "#fff2bf", display: "grid", placeItems: "center", color: "#b47b00", fontWeight: 900 },
  brand: { fontSize: 30, fontWeight: 950, letterSpacing: 2 },
  tag: { fontWeight: 700, color: "#64748b" },
  nav: { display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" },
  goldButton: { background: "#f6c744", border: 0, borderRadius: 12, padding: "13px 18px", fontWeight: 900 },
  outlineButton: { background: "#fff", border: "1px solid #b8cdf8", color: "#1857df", borderRadius: 12, padding: "13px 18px", fontWeight: 900 },
  hero: { minHeight: 520, backgroundImage: "url('https://images.unsplash.com/photo-1507525428034-b723cf961d3e?q=80&w=2200')", backgroundSize: "cover", backgroundPosition: "center" },
  heroShade: { padding: "48px 64px 34px", minHeight: 520, background: "linear-gradient(90deg,rgba(255,255,255,.98),rgba(255,255,255,.75),rgba(255,255,255,.10))" },
  kicker: { color: "#0b63e5", fontWeight: 900, fontSize: 18 },
  subText: { fontSize: 23, fontWeight: 700, color: "#334155", maxWidth: 850, lineHeight: 1.3 },
  badges: { display: "flex", gap: 22, flexWrap: "wrap", color: "#0b63e5", fontWeight: 900, margin: "24px 0 30px" },
  searchBox: { background: "#fff", borderRadius: 22, padding: 26, display: "grid", gridTemplateColumns: "1.1fr 1.3fr 1.4fr 1fr 1fr .8fr .8fr 1fr", gap: 16, boxShadow: "0 20px 45px rgba(15,23,42,.13)" },
  field: { display: "flex", flexDirection: "column", gap: 8, fontWeight: 850 },
  searchButton: { border: 0, borderRadius: 12, background: "#2563eb", color: "#fff", padding: "14px 24px", fontWeight: 950, cursor: "pointer" },
  featureStrip: { margin: "-28px 64px 34px", background: "#fff", borderRadius: 24, display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 20, padding: 30, boxShadow: "0 20px 45px rgba(15,23,42,.10)", position: "relative" },
  infoBox: { background: "#fff", borderRadius: 22, padding: 24, boxShadow: "0 14px 36px rgba(15,23,42,.08)" },
  section: { padding: "20px 64px 50px" },
  destGrid: { display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 22 },
  destinationCard: { height: 210, border: 0, borderRadius: 18, backgroundSize: "cover", color: "#fff", display: "flex", flexDirection: "column", justifyContent: "flex-end", alignItems: "flex-start", padding: 22, fontSize: 20, cursor: "pointer" },
  helpStrip: { textAlign: "center", padding: "0 60px 38px" },
  helpGrid: { display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 20, maxWidth: 1000, margin: "22px auto" },
  main: { padding: 48, maxWidth: 1350, margin: "0 auto" },
  backButton: { border: 0, borderRadius: 12, background: "#dbeafe", color: "#1747b8", padding: "12px 16px", fontWeight: 900, marginBottom: 18 },
  panel: { background: "#fff", borderRadius: 24, padding: 34, boxShadow: "0 18px 50px rgba(15,23,42,.10)", marginBottom: 22 },
  resultsGrid: { display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(320px,1fr))", gap: 22 },
  hotelCard: { background: "#fff", borderRadius: 22, overflow: "hidden", boxShadow: "0 15px 35px rgba(15,23,42,.10)" },
  hotelImage: { width: "100%", height: 210, objectFit: "cover" },
  noImage: { height: 210, display: "grid", placeItems: "center", background: "#dbeafe", fontWeight: 900 },
  hotelBody: { padding: 18 },
  priceBox: { background: "#f8fafc", borderRadius: 14, padding: 14, display: "grid", gap: 6, marginTop: 14 },
  converterBox: { background: "#eff6ff", borderRadius: 14, padding: 14, display: "grid", gap: 8, marginTop: 12 },
  actions: { display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 10, paddingTop: 18 },
  guideGrid: { display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(280px,1fr))", gap: 20 },
  guideCard: { background: "#fff", borderRadius: 22, padding: 24, boxShadow: "0 14px 36px rgba(15,23,42,.08)" },
  linkGrid: { display: "grid", gap: 10, marginTop: 16 },
  destinationList: { display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(280px,1fr))", gap: 18, marginTop: 22 },
  formGrid: { display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(260px,1fr))", gap: 14, margin: "22px 0" }
};
