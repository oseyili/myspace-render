import React, { useEffect, useMemo, useState } from "react";

const API =
  import.meta.env.VITE_API_BASE ||
  import.meta.env.VITE_API_BASE_URL ||
  "https://myspace-hotel-backend.onrender.com";

const CURRENCIES = ["GBP", "USD", "EUR", "NGN", "AED", "CAD", "AUD", "JPY", "ZAR", "CHF"];

const FX = {
  GBP: 1,
  USD: 1.27,
  EUR: 1.17,
  NGN: 1900,
  AED: 4.66,
  CAD: 1.72,
  AUD: 1.92,
  JPY: 197,
  ZAR: 23.2,
  CHF: 1.11
};

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

function tomorrowISO() {
  return new Date(Date.now() + 86400000).toISOString().slice(0, 10);
}

function money(value) {
  const n = Number(value || 0);
  return Number.isFinite(n) ? n.toFixed(2) : "0.00";
}

function nightsBetween(start, end) {
  const diff = Math.ceil((new Date(end) - new Date(start)) / 86400000);
  return diff > 0 ? diff : 1;
}

function convert(amount, from, to) {
  if (!amount || from === to) return Number(amount || 0);
  if (!FX[from] || !FX[to]) return Number(amount || 0);
  return (Number(amount) / FX[from]) * FX[to];
}

function cleanText(value) {
  return String(value || "").trim();
}

function mapSearch(query) {
  return `https://www.google.com/maps/search/${encodeURIComponent(query)}`;
}

function mapDirections(query) {
  return `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(query)}`;
}

const FALLBACK_DESTINATIONS = [
  { country: "United Kingdom", cities: [{ city: "London" }, { city: "Manchester" }, { city: "Birmingham" }] },
  { country: "France", cities: [{ city: "Paris" }, { city: "Nice" }, { city: "Lyon" }] },
  { country: "Spain", cities: [{ city: "Barcelona" }, { city: "Madrid" }, { city: "Valencia" }] },
  { country: "United Arab Emirates", cities: [{ city: "Dubai" }, { city: "Abu Dhabi" }] },
  { country: "United States", cities: [{ city: "New York" }, { city: "Miami" }, { city: "Los Angeles" }] },
  { country: "Nigeria", cities: [{ city: "Lagos" }, { city: "Abuja" }, { city: "Benin City" }] }
];

function normalizeDestinations(payload) {
  const raw =
    Array.isArray(payload)
      ? payload
      : Array.isArray(payload?.countries)
        ? payload.countries
        : Array.isArray(payload?.destinations)
          ? payload.destinations
          : Array.isArray(payload?.data)
            ? payload.data
            : [];

  const countryMap = new Map();

  for (const row of raw) {
    const countryName = cleanText(
      row?.country ||
      row?.country_name ||
      row?.name ||
      row?.label
    ).replace(/\s*\(\d+\)\s*$/g, "");

    if (!countryName) continue;

    const citiesRaw = Array.isArray(row?.cities)
      ? row.cities
      : Array.isArray(row?.destinations)
        ? row.destinations
        : Array.isArray(row?.locations)
          ? row.locations
          : [];

    const citySet = countryMap.get(countryName) || new Set();

    for (const cityRow of citiesRaw) {
      const cityName = cleanText(
        typeof cityRow === "string"
          ? cityRow
          : cityRow?.city ||
            cityRow?.city_name ||
            cityRow?.name ||
            cityRow?.destination ||
            cityRow?.label
      ).replace(/\s*\(\d+\)\s*$/g, "");

      if (cityName) citySet.add(cityName);
    }

    countryMap.set(countryName, citySet);
  }

  return Array.from(countryMap.entries())
    .filter(([country, cities]) => country && cities.size > 0)
    .map(([country, cities]) => ({
      country,
      cities: Array.from(cities)
        .sort((a, b) => a.localeCompare(b))
        .map((city) => ({ city }))
    }))
    .sort((a, b) => a.country.localeCompare(b.country));
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

  const [hotels, setHotels] = useState([]);
  const [selectedHotel, setSelectedHotel] = useState(null);
  const [guideHotel, setGuideHotel] = useState(null);
  const [loading, setLoading] = useState(false);
  const [paying, setPaying] = useState(false);
  const [displayCurrency, setDisplayCurrency] = useState("GBP");

  const [reservation, setReservation] = useState({
    customer_name: "",
    customer_email: "",
    customer_phone: "",
    note: ""
  });

  const [hotelRegister, setHotelRegister] = useState({
    hotel_name: "",
    legal_business_name: "",
    contact_name: "",
    email: "",
    phone: "",
    country: "",
    city: "",
    address: "",
    website: "",
    rooms_count: "",
    pms_provider: "oracle-ohip",
    notes: ""
  });

  const [onboardingResult, setOnboardingResult] = useState(null);

  const [partnerId, setPartnerId] = useState("oracle-ohip");
  const [partnerToken, setPartnerToken] = useState("");
  const [partnerMessage, setPartnerMessage] = useState("");
  const [partnerJwt, setPartnerJwt] = useState("");

  const selectedCountry = useMemo(
    () => destinations.find((item) => item.country === country),
    [destinations, country]
  );

  const cityOptions = selectedCountry?.cities || [];
  const nights = nightsBetween(checkin, checkout);
  const selectedRate = selectedHotel?.first_rate || null;
  const baseCurrency = selectedRate?.currency || "GBP";
  const stayTotal = Number(selectedRate?.amount || 0) * Number(rooms || 1) * nights;
  const convertedTotal = convert(stayTotal, baseCurrency, displayCurrency);  async function loadDestinations() {
    try {
      const response = await fetch(`${API}/api/real-catalog/destinations`, { cache: "no-store" });
      const data = await response.json();

      const clean = normalizeDestinations(data);
      setDestinations(clean.length ? clean : FALLBACK_DESTINATIONS);
    } catch {
      setDestinations(FALLBACK_DESTINATIONS);
    }
  }

  async function searchHotels(customCountry = country, customCity = city) {
    if (!customCountry || !customCity) {
      alert("Please choose country and destination first.");
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
        guests: String(guests),
        rooms: String(rooms),
        limit: "100"
      });

      const response = await fetch(`${API}/api/hotels/search?${params.toString()}`, { cache: "no-store" });
      const data = await response.json();
      setHotels(data.hotels || []);
      setPage("results");
    } catch {
      alert("Hotels could not be loaded. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  async function reserveAndPay() {
    if (!selectedHotel) return alert("Select a hotel first.");
    if (!reservation.customer_name || !reservation.customer_email || !reservation.customer_phone) {
      return alert("Please enter name, email and phone number.");
    }

    setPaying(true);

    const body = {
      ...reservation,
      hotel_id: selectedHotel.hotel_id,
      hotel_name: selectedHotel.hotel_name || selectedHotel.name,
      destination: `${city}, ${country}`,
      checkin,
      checkout,
      guests: Number(guests),
      rooms: Number(rooms),
      nights,
      rate_key: selectedRate?.rate_key || "",
      amount: stayTotal,
      currency: baseCurrency,
      converted_amount: convertedTotal,
      converted_currency: displayCurrency
    };

    try {
      const response = await fetch(`${API}/api/create-checkout-session`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body)
      });

      const data = await response.json().catch(() => ({}));

      if (data.url && String(data.url).startsWith("http")) {
        window.location.href = data.url;
        return;
      }

      alert(data.error || "Stripe checkout is not active yet. Check backend Stripe configuration on Render.");
    } catch {
      alert("Stripe checkout could not be started. Check backend deployment and Stripe key.");
    } finally {
      setPaying(false);
    }
  }

  async function submitHotelOnboarding() {
    if (!hotelRegister.hotel_name || !hotelRegister.contact_name || !hotelRegister.email || !hotelRegister.country || !hotelRegister.city) {
      alert("Please complete hotel name, contact name, email, country and city.");
      return;
    }

    try {
      const response = await fetch(`${API}/api/extranet/register`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(hotelRegister)
      });

      const data = await response.json();
      setOnboardingResult(data);
      alert(data.message || "Hotel onboarding request submitted.");
    } catch {
      const fallback = {
        ok: true,
        message: "Hotel onboarding request captured. Backend onboarding route needs activation.",
        hotel_name: hotelRegister.hotel_name,
        email: hotelRegister.email
      };
      setOnboardingResult(fallback);
      alert(fallback.message);
    }
  }

  async function loginPartner() {
    setPartnerMessage("");

    if (!partnerToken.trim()) {
      setPartnerMessage("Enter your approved partner token.");
      return;
    }

    try {
      const response = await fetch(`${API}/api/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ partner_id: partnerId, token: partnerToken })
      });

      const data = await response.json();

      if (!data.ok || !data.jwt) throw new Error("login failed");

      setPartnerJwt(data.jwt);
      setPartnerMessage("Partner login successful.");
    } catch {
      setPartnerMessage("Login failed. New hotels must complete the onboarding form first.");
    }
  }

  function choosePopular(nextCountry, nextCity) {
    setCountry(nextCountry);
    setCity(nextCity);
    searchHotels(nextCountry, nextCity);
  }

  function openGuide(hotel = null) {
    setGuideHotel(hotel || selectedHotel);
    setPage("guide");
  }

  useEffect(() => {
    loadDestinations();
  }, []);

  return (
    <div style={styles.page}>
      <Header
        setPage={setPage}
        displayCurrency={displayCurrency}
        setDisplayCurrency={setDisplayCurrency}
      />

      {page === "home" && (
        <>
          <section style={styles.hero}>
            <div style={styles.heroInner}>
              <h1 style={styles.heroTitle}>Find your perfect stay</h1>
              <p style={styles.heroText}>Search verified hotels and apartments worldwide.</p>
              <div style={styles.heroBadges}>
                <span>Secure checkout</span>
                <span>Destination support</span>
                <span>Hotel onboarding</span>
              </div>

              <SearchPanel
                country={country}
                city={city}
                setCountry={setCountry}
                setCity={setCity}
                destinations={destinations}
                cityOptions={cityOptions}
                checkin={checkin}
                checkout={checkout}
                setCheckin={setCheckin}
                setCheckout={setCheckout}
                guests={guests}
                rooms={rooms}
                setGuests={setGuests}
                setRooms={setRooms}
                loading={loading}
                searchHotels={() => searchHotels()}
              />
            </div>
          </section>

          <section style={styles.trustStrip}>
            <div><strong>Real hotel search</strong><span>Country and city names only.</span></div>
            <div><strong>Stripe checkout</strong><span>Reserve / Pay opens secure payment.</span></div>
            <div><strong>Travel guide</strong><span>Maps, directions and local services.</span></div>
          </section>

          <section style={styles.section}>
            <div style={styles.sectionHeader}>
              <h2>Popular destinations</h2>
              <button onClick={() => setPage("guide")}>Open destination guide</button>
            </div>

            <div style={styles.destinationRow}>
              {[
                ["United Arab Emirates", "Dubai", "Dubai", "https://images.unsplash.com/photo-1512453979798-5ea266f8880c?auto=format&fit=crop&w=900&q=80"],
                ["United Kingdom", "London", "London", "https://images.unsplash.com/photo-1513635269975-59663e0ac1ad?auto=format&fit=crop&w=900&q=80"],
                ["France", "Paris", "Paris", "https://images.unsplash.com/photo-1502602898657-3e91760cbb34?auto=format&fit=crop&w=900&q=80"],
                ["United States", "New York", "New York", "https://images.unsplash.com/photo-1485871981521-5b1fd3805eee?auto=format&fit=crop&w=900&q=80"],
                ["Spain", "Barcelona", "Barcelona", "https://images.unsplash.com/photo-1539037116277-4db20889f2d4?auto=format&fit=crop&w=900&q=80"]
              ].map(([nextCountry, nextCity, title, image]) => (
                <button
                  key={`${nextCountry}-${nextCity}`}
                  style={{
                    ...styles.destinationCard,
                    backgroundImage: `linear-gradient(180deg, rgba(3,7,18,.1), rgba(3,7,18,.75)), url(${image})`
                  }}
                  onClick={() => choosePopular(nextCountry, nextCity)}
                >
                  <div>
                    <h3>{title}</h3>
                    <p>{nextCountry}</p>
                  </div>
                  <strong>Explore stays</strong>
                </button>
              ))}
            </div>
          </section>

          <section style={styles.partnerChoice}>
            <div>
              <h2>Hotels and partners</h2>
              <p>New hotels should complete the form first. Approved partners can log in separately.</p>
            </div>
            <button onClick={() => setPage("hotelOnboarding")}>Hotel Onboarding Form</button>
            <button onClick={() => setPage("partner")}>Partner Login</button>
          </section>

          <section style={styles.actionSection}>
            <button onClick={() => setPage("offers")} style={styles.actionCard}><h3>Offers</h3><p>Flexible stays, city breaks, family stays and long-stay support.</p></button>
            <button onClick={() => setPage("guide")} style={styles.actionCard}><h3>Destination Guide</h3><p>Open maps, directions, emergency services and nearby places.</p></button>
            <button onClick={() => setPage("contact")} style={styles.actionCard}><h3>Help</h3><p>Booking support, payment help and travel guidance.</p></button>
          </section>

          <Footer setPage={setPage} />
        </>
      )}

      {page === "results" && (
        <ResultsPage
          setPage={setPage}
          city={city}
          country={country}
          hotels={hotels}
          selectedHotel={selectedHotel}
          setSelectedHotel={setSelectedHotel}
          openGuide={openGuide}
          baseCurrency={baseCurrency}
          stayTotal={stayTotal}
          nights={nights}
          guests={guests}
          rooms={rooms}
          selectedRate={selectedRate}
          displayCurrency={displayCurrency}
          setDisplayCurrency={setDisplayCurrency}
          convertedTotal={convertedTotal}
          reservation={reservation}
          setReservation={setReservation}
          reserveAndPay={reserveAndPay}
          paying={paying}
        />
      )}

      {page === "guide" && <DestinationGuide setPage={setPage} place={[guideHotel?.hotel_name || guideHotel?.name, guideHotel?.address || guideHotel?.area, city, country].filter(Boolean).join(", ") || "your destination"} />}
      {page === "offers" && <OffersPage setPage={setPage} />}
      {page === "faq" && <InfoPage setPage={setPage} title="Frequently Asked Questions" sections={faqSections} />}
      {page === "terms" && <InfoPage setPage={setPage} title="Terms & Conditions" sections={termsSections} />}
      {page === "privacy" && <InfoPage setPage={setPage} title="Privacy Policy" sections={privacySections} />}
      {page === "contact" && <ContactPage setPage={setPage} />}
      {page === "hotelOnboarding" && <HotelOnboardingPage setPage={setPage} hotelRegister={hotelRegister} setHotelRegister={setHotelRegister} submitHotelOnboarding={submitHotelOnboarding} onboardingResult={onboardingResult} />}
      {page === "partner" && <PartnerLoginPage setPage={setPage} partnerId={partnerId} setPartnerId={setPartnerId} partnerToken={partnerToken} setPartnerToken={setPartnerToken} partnerMessage={partnerMessage} partnerJwt={partnerJwt} loginPartner={loginPartner} />}
    </div>
  );
}

function Header({ setPage, displayCurrency, setDisplayCurrency }) {
  return (
    <header style={styles.header}>
      <button style={styles.logoButton} onClick={() => setPage("home")}>
        <div style={styles.logoIcon}>✦</div>
        <div>
          <div style={styles.logo}>MYSPACE HOTEL</div>
          <div style={styles.logoSub}>Stay with clarity</div>
        </div>
      </button>

      <nav style={styles.nav}>
        <button onClick={() => setPage("home")}>Stays</button>
        <button onClick={() => setPage("guide")}>Destinations</button>
        <button onClick={() => setPage("offers")}>Offers</button>
        <button onClick={() => setPage("contact")}>Help</button>
        <select value={displayCurrency} onChange={(e) => setDisplayCurrency(e.target.value)} style={styles.currencySelect}>
          {CURRENCIES.map((currency) => <option key={currency} value={currency}>{currency}</option>)}
        </select>
        <button style={styles.onboardButton} onClick={() => setPage("hotelOnboarding")}>Hotel Onboarding Form</button>
        <button style={styles.loginButton} onClick={() => setPage("partner")}>Partner Login</button>
      </nav>
    </header>
  );
}

function SearchPanel(props) {
  const { country, city, setCountry, setCity, destinations, cityOptions, checkin, checkout, setCheckin, setCheckout, guests, rooms, setGuests, setRooms, loading, searchHotels } = props;

  return (
    <div style={styles.searchPanel}>
      <div style={styles.searchCell}>
        <label>Country</label>
        <select value={country} onChange={(e) => { setCountry(e.target.value); setCity(""); }}>
          <option value="">Select country</option>
          {destinations.map((item) => <option key={item.country} value={item.country}>{item.country}</option>)}
        </select>
      </div>

      <div style={styles.searchCell}>
        <label>Destination</label>
        <select value={city} onChange={(e) => setCity(e.target.value)} disabled={!country}>
          <option value="">{country ? "Select city" : "Choose country first"}</option>
          {cityOptions.map((item) => <option key={item.city} value={item.city}>{item.city}</option>)}
        </select>
      </div>

      <div style={styles.searchCell}>
        <label>Check-in</label>
        <input type="date" value={checkin} onChange={(e) => setCheckin(e.target.value)} />
      </div>

      <div style={styles.searchCell}>
        <label>Check-out</label>
        <input type="date" value={checkout} onChange={(e) => setCheckout(e.target.value)} />
      </div>

      <div style={styles.searchCell}>
        <label>Guests & Rooms</label>
        <div style={styles.twoInputs}>
          <input type="number" min="1" value={guests} onChange={(e) => setGuests(e.target.value)} />
          <input type="number" min="1" value={rooms} onChange={(e) => setRooms(e.target.value)} />
        </div>
      </div>

      <button style={styles.searchButton} onClick={searchHotels}>{loading ? "Searching..." : "Search hotels"}</button>
    </div>
  );
}

function ResultsPage(props) {
  const { setPage, city, country, hotels, selectedHotel, setSelectedHotel, openGuide, baseCurrency, stayTotal, nights, guests, rooms, selectedRate, displayCurrency, setDisplayCurrency, convertedTotal, reservation, setReservation, reserveAndPay, paying } = props;

  return (
    <main style={styles.main}>
      <button style={styles.backButton} onClick={() => setPage("home")}>Back to homepage</button>
      <div style={styles.resultsLayout}>
        <section>
          <h2>Available stays in {city}, {country}</h2>
          <p style={styles.muted}>Select a hotel to continue to secure payment.</p>

          <div style={styles.hotelGrid}>
            {hotels.map((hotel) => (
              <div key={hotel.hotel_id} style={styles.hotelCard}>
                {hotel.image_url ? <img src={hotel.image_url} style={styles.hotelImage} /> : <div style={styles.noImage}>MYSPACE HOTEL</div>}
                <div style={styles.hotelBody}>
                  <div style={styles.badges}><span>Verified stay</span><span>{hotel.first_rate ? "Live price" : "Confirm price"}</span></div>
                  <h3>{hotel.hotel_name || hotel.name}</h3>
                  <p>{hotel.address || hotel.area || city}, {country}</p>
                  <div style={styles.priceBox}>
                    {hotel.first_rate ? <><span>From</span><strong>{hotel.first_rate.currency || "GBP"} {money(hotel.first_rate.amount)}</strong><small>per room / night</small></> : <strong>Price confirmation required</strong>}
                  </div>
                  <div style={styles.hotelActions}>
                    <button onClick={() => setSelectedHotel(hotel)} style={styles.selectButton}>Select Hotel</button>
                    <button onClick={() => openGuide(hotel)} style={styles.guideButton}>Guide / Map</button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </section>

        <aside style={styles.reservePanel}>
          <h2>Reserve / Pay</h2>
          {selectedHotel ? (
            <>
              <h3>{selectedHotel.hotel_name || selectedHotel.name}</h3>
              <p style={styles.muted}>{selectedHotel.address || selectedHotel.area || city}, {country}</p>
              <div style={styles.totalBox}><span>Stay total</span><strong>{baseCurrency} {money(stayTotal)}</strong><small>{nights} night{nights > 1 ? "s" : ""} | {guests} guests | {rooms} room{rooms > 1 ? "s" : ""}</small></div>
              <div style={styles.converterBox}><label>Currency converter</label><select value={displayCurrency} onChange={(e) => setDisplayCurrency(e.target.value)} style={styles.input}>{CURRENCIES.map((currency) => <option key={currency} value={currency}>{currency}</option>)}</select><strong>{displayCurrency} {money(convertedTotal)}</strong></div>
              <input style={styles.input} placeholder="Full name" value={reservation.customer_name} onChange={(e) => setReservation({ ...reservation, customer_name: e.target.value })} />
              <input style={styles.input} placeholder="Email address" value={reservation.customer_email} onChange={(e) => setReservation({ ...reservation, customer_email: e.target.value })} />
              <input style={styles.input} placeholder="Phone number" value={reservation.customer_phone} onChange={(e) => setReservation({ ...reservation, customer_phone: e.target.value })} />
              <textarea style={styles.textarea} placeholder="Special request" value={reservation.note} onChange={(e) => setReservation({ ...reservation, note: e.target.value })} />
              <button style={styles.payButton} onClick={reserveAndPay}>{paying ? "Opening Stripe..." : selectedRate ? "Reserve / Pay Securely" : "Request Price Confirmation"}</button>
            </>
          ) : <div style={styles.notice}>Select a hotel to continue.</div>}
        </aside>
      </div>
    </main>
  );
}

function DestinationGuide({ setPage, place }) {
  const sections = [
    ["Emergency", "Police, hospitals, pharmacies and emergency help near your destination.", [["Police", mapSearch(`police near ${place}`)], ["Hospital", mapSearch(`hospital near ${place}`)], ["Pharmacy", mapSearch(`pharmacy near ${place}`)]]],
    ["Airport", "Airport transfers, taxis and route planning.", [["Airport", mapSearch(`airport near ${place}`)], ["Taxi", mapSearch(`taxi near ${place}`)], ["Directions", mapDirections(place)]]],
    ["Food", "Restaurants, cafes and supermarkets nearby.", [["Restaurants", mapSearch(`restaurants near ${place}`)], ["Cafes", mapSearch(`cafes near ${place}`)], ["Supermarkets", mapSearch(`supermarket near ${place}`)]]],
    ["Attractions", "Museums, sightseeing, zoos, shopping and tours.", [["Things to do", mapSearch(`things to do near ${place}`)], ["Museums", mapSearch(`museums near ${place}`)], ["Tour bus", mapSearch(`tour bus near ${place}`)]]],
    ["Transport", "Train stations, bus stops and car rental.", [["Train", mapSearch(`train station near ${place}`)], ["Bus", mapSearch(`bus station near ${place}`)], ["Car rental", mapSearch(`car rental near ${place}`)]]],
    ["Map", "Open map and directions.", [["Open map", mapSearch(place)], ["Get directions", mapDirections(place)], ["Explore nearby", mapSearch(`restaurants hospitals airport attractions near ${place}`)]]]
  ];

  return (
    <main style={styles.contentPage}>
      <button style={styles.backButton} onClick={() => setPage("home")}>Back to homepage</button>
      <div style={styles.pageHero}><h1>Destination Guide</h1><p>{place}</p></div>
      <div style={styles.guideGrid}>
        {sections.map(([title, text, links]) => (
          <div key={title} style={styles.guideCard}>
            <h2>{title}</h2>
            <p>{text}</p>
            <div style={styles.guideLinks}>{links.map(([label, url]) => <a key={label} href={url} target="_blank" rel="noreferrer">{label}</a>)}</div>
          </div>
        ))}
      </div>
    </main>
  );
}

function OffersPage({ setPage }) {
  return (
    <main style={styles.contentPage}>
      <button style={styles.backButton} onClick={() => setPage("home")}>Back to homepage</button>
      <div style={styles.pageHero}><h1>Offers</h1><p>Choose smarter stay options before booking.</p></div>
      <div style={styles.offerGrid}>
        {[["Flexible Stays", "Find hotels with flexible policies where available.", "home"], ["Family Trips", "Search larger rooms and apartments for family stays.", "home"], ["City Breaks", "Plan short trips with hotels close to transport and attractions.", "guide"], ["Long Stay Help", "Contact us for extended stays, relocation and work trips.", "contact"]].map(([title, text, go]) => (
          <div key={title} style={styles.offerCard}><h2>{title}</h2><p>{text}</p><button onClick={() => setPage(go)}>Open</button></div>
        ))}
      </div>
    </main>
  );
}

function HotelOnboardingPage({ setPage, hotelRegister, setHotelRegister, submitHotelOnboarding, onboardingResult }) {
  return (
    <main style={styles.contentPage}>
      <button style={styles.backButton} onClick={() => setPage("home")}>Back to homepage</button>
      <div style={styles.pageHero}><h1>Hotel Onboarding Form</h1><p>Hotels should complete this form first. Approved hotels will receive partner access after review.</p></div>
      <div style={styles.formGrid}>
        {Object.keys(hotelRegister).map((key) =>
          key === "notes" ? (
            <textarea key={key} style={styles.textarea} placeholder="Notes / PMS requirements" value={hotelRegister[key]} onChange={(e) => setHotelRegister({ ...hotelRegister, [key]: e.target.value })} />
          ) : key === "pms_provider" ? (
            <select key={key} style={styles.input} value={hotelRegister[key]} onChange={(e) => setHotelRegister({ ...hotelRegister, [key]: e.target.value })}>
              <option value="oracle-ohip">Oracle OHIP</option>
              <option value="siteminder">SiteMinder</option>
              <option value="cloudbeds">Cloudbeds</option>
              <option value="mews">Mews</option>
              <option value="other">Other PMS</option>
            </select>
          ) : (
            <input key={key} style={styles.input} placeholder={key.replaceAll("_", " ")} value={hotelRegister[key]} onChange={(e) => setHotelRegister({ ...hotelRegister, [key]: e.target.value })} />
          )
        )}
      </div>
      <button style={styles.primaryButton} onClick={submitHotelOnboarding}>Submit hotel onboarding</button>
      {onboardingResult && <pre style={styles.pre}>{JSON.stringify(onboardingResult, null, 2)}</pre>}
    </main>
  );
}

function PartnerLoginPage({ setPage, partnerId, setPartnerId, partnerToken, setPartnerToken, partnerMessage, partnerJwt, loginPartner }) {
  return (
    <main style={styles.contentPage}>
      <button style={styles.backButton} onClick={() => setPage("home")}>Back to homepage</button>
      <div style={styles.pageHero}><h1>Partner Login</h1><p>Approved partners can log in here. New hotels must apply first.</p><button style={styles.secondaryButton} onClick={() => setPage("hotelOnboarding")}>New hotel? Open onboarding form</button></div>
      <section style={styles.loginPanel}>
        <h2>Approved partner login</h2>
        <input style={styles.input} value={partnerId} onChange={(e) => setPartnerId(e.target.value)} placeholder="Partner ID" />
        <input style={styles.input} value={partnerToken} onChange={(e) => setPartnerToken(e.target.value)} placeholder="Partner token" type="password" />
        {partnerMessage && <div style={styles.messageBox}>{partnerMessage}</div>}
        <button style={styles.primaryButton} onClick={loginPartner}>Login securely</button>
        {partnerJwt && <div style={styles.messageBox}>Logged in. Partner tools enabled.</div>}
      </section>
    </main>
  );
}

function ContactPage({ setPage }) {
  return <InfoPage setPage={setPage} title="Help & Contact" sections={[["Reservations", "Email reservations@myspace-hotel.com for booking help, payment issues and reservation questions.", [["Open guide", "guide"]]], ["Hotels", "Hotels should apply through Hotel Onboarding before requesting login access.", [["Hotel onboarding", "hotelOnboarding"]]], ["Travel help", "Use Destination Guide for directions, hospitals, airports, restaurants and attractions.", [["Destination guide", "guide"]]]]} />;
}

function InfoPage({ setPage, title, sections }) {
  return (
    <main style={styles.contentPage}>
      <button style={styles.backButton} onClick={() => setPage("home")}>Back to homepage</button>
      <div style={styles.pageHero}><h1>{title}</h1></div>
      <div style={styles.infoStack}>
        {sections.map(([heading, text, links = []]) => (
          <div key={heading} style={styles.infoPanel}>
            <h2>{heading}</h2>
            <p>{text}</p>
            <div style={styles.guideLinks}>{links.map(([label, go]) => <button key={label} onClick={() => setPage(go)}>{label}</button>)}</div>
          </div>
        ))}
      </div>
    </main>
  );
}

function Footer({ setPage }) {
  return (
    <footer style={styles.footer}>
      <span>© 2026 MySpace Hotel. All rights reserved.</span>
      <div style={styles.footerLinks}>
        <button onClick={() => setPage("contact")}>Contact</button>
        <button onClick={() => setPage("privacy")}>Privacy</button>
        <button onClick={() => setPage("terms")}>Terms</button>
        <button onClick={() => setPage("hotelOnboarding")}>Hotel Onboarding Form</button>
        <button onClick={() => setPage("partner")}>Partner Login</button>
      </div>
    </footer>
  );
}

const faqSections = [["Booking", "Search, select a hotel, enter guest details and use Reserve / Pay.", [["Search stays", "home"]]], ["Payment", "Stripe checkout opens when backend Stripe is configured.", [["Contact", "contact"]]], ["Cancellation", "Cancellation depends on selected hotel and rate conditions.", [["Terms", "terms"]]]];
const termsSections = [["Reservations", "Reservations depend on hotel availability and selected rate conditions."], ["Payments", "Payments are processed through secure checkout where enabled."], ["Guest details", "Guests must enter accurate information before payment."]];
const privacySections = [["Customer data", "We use booking details to support reservations and customer service."], ["Payments", "Card details are handled by secure payment providers."], ["Partner data", "Hotel partner access is restricted to approved accounts."]];

const styles = {
  page: { minHeight: "100vh", background: "#f6f8fc", color: "#07142f", fontFamily: "Inter, Arial, sans-serif" },
  header: { minHeight: 88, background: "#fff", display: "flex", alignItems: "center", justifyContent: "space-between", padding: "0 52px", boxShadow: "0 2px 18px rgba(15,23,42,.08)", position: "sticky", top: 0, zIndex: 10, gap: 16 },
  logoButton: { display: "flex", alignItems: "center", gap: 12, border: 0, background: "transparent", cursor: "pointer", textAlign: "left" },
  logoIcon: { width: 44, height: 44, borderRadius: 14, display: "grid", placeItems: "center", background: "#fff3c4", color: "#b77900", fontSize: 24, fontWeight: 900 },
  logo: { fontSize: 28, fontWeight: 900, letterSpacing: 1 },
  logoSub: { fontSize: 13, color: "#64748b", fontWeight: 700 },
  nav: { display: "flex", alignItems: "center", gap: 14, flexWrap: "wrap", justifyContent: "flex-end" },
  currencySelect: { border: "1px solid #cbd5e1", borderRadius: 12, padding: "10px 12px", fontWeight: 800 },
  loginButton: { border: "1px solid #b8cdf8", background: "#fff", color: "#1857df", borderRadius: 14, padding: "12px 18px", fontWeight: 900, cursor: "pointer" },
  onboardButton: { border: 0, background: "#f6c744", color: "#07142f", borderRadius: 14, padding: "12px 18px", fontWeight: 900, cursor: "pointer" },
  hero: { minHeight: 500, backgroundImage: "linear-gradient(90deg, rgba(255,255,255,.98), rgba(255,255,255,.74), rgba(255,255,255,.15)), url('https://images.unsplash.com/photo-1507525428034-b723cf961d3e?auto=format&fit=crop&w=2000&q=80')", backgroundSize: "cover", backgroundPosition: "center" },
  heroInner: { maxWidth: 1420, margin: "0 auto", padding: "70px 52px 40px" },
  heroTitle: { fontSize: 58, lineHeight: 1.02, margin: 0, letterSpacing: -2 },
  heroText: { fontSize: 22, color: "#334155", marginTop: 14, fontWeight: 700 },
  heroBadges: { display: "flex", flexWrap: "wrap", gap: 28, marginTop: 24, color: "#1857df", fontWeight: 900 },
  searchPanel: { marginTop: 34, background: "#fff", borderRadius: 24, display: "grid", gridTemplateColumns: "1.15fr 1.15fr .9fr .9fr .9fr 1fr", boxShadow: "0 26px 60px rgba(15,23,42,.18)", overflow: "hidden" },
  searchCell: { padding: 18, borderRight: "1px solid #e2e8f0", display: "flex", flexDirection: "column", gap: 8 },
  twoInputs: { display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 },
  searchButton: { border: 0, background: "#1857df", color: "#fff", fontSize: 16, fontWeight: 900, cursor: "pointer" },
  trustStrip: { maxWidth: 1320, margin: "-22px auto 24px", background: "#fff", borderRadius: 20, padding: 22, display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 20, boxShadow: "0 15px 45px rgba(15,23,42,.08)", position: "relative", zIndex: 2 },
  section: { maxWidth: 1420, margin: "0 auto", padding: "28px 52px" },
  sectionHeader: { display: "flex", alignItems: "center", justifyContent: "space-between" },
  destinationRow: { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 16 },
  destinationCard: { height: 220, border: 0, borderRadius: 18, backgroundSize: "cover", backgroundPosition: "center", color: "#fff", textAlign: "left", padding: 22, display: "flex", flexDirection: "column", justifyContent: "space-between", cursor: "pointer", boxShadow: "0 14px 35px rgba(15,23,42,.18)" },
  partnerChoice: { maxWidth: 1320, margin: "22px auto", background: "#fff", borderRadius: 22, padding: 24, display: "grid", gridTemplateColumns: "1fr 220px 180px", gap: 14, alignItems: "center", boxShadow: "0 15px 45px rgba(15,23,42,.08)" },
  actionSection: { maxWidth: 1320, margin: "30px auto 48px", display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(230px, 1fr))", gap: 16 },
  actionCard: { background: "#fff", border: 0, borderRadius: 20, padding: 22, textAlign: "left", cursor: "pointer", boxShadow: "0 15px 45px rgba(15,23,42,.08)" },
  main: { maxWidth: 1420, margin: "0 auto", padding: "28px 52px" },
  backButton: { border: 0, background: "#e0ecff", color: "#1747b8", padding: "12px 16px", borderRadius: 14, fontWeight: 900, cursor: "pointer", marginBottom: 18 },
  resultsLayout: { display: "grid", gridTemplateColumns: "1fr 390px", gap: 24 },
  muted: { color: "#64748b", fontWeight: 700 },
  hotelGrid: { display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(295px,1fr))", gap: 18 },
  hotelCard: { background: "#fff", borderRadius: 22, overflow: "hidden", boxShadow: "0 16px 40px rgba(15,23,42,.08)" },
  hotelImage: { width: "100%", height: 190, objectFit: "cover" },
  noImage: { height: 190, display: "grid", placeItems: "center", background: "#dbeafe", color: "#1747b8", fontWeight: 900 },
  hotelBody: { padding: 18 },
  badges: { display: "flex", justifyContent: "space-between", gap: 8 },
  priceBox: { background: "#f8fafc", borderRadius: 14, padding: 14, display: "flex", flexDirection: "column", gap: 4, marginBottom: 12 },
  hotelActions: { display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 },
  selectButton: { border: 0, borderRadius: 14, background: "#f6c744", padding: 14, fontWeight: 900, cursor: "pointer" },
  guideButton: { border: "1px solid #cbd5e1", borderRadius: 14, background: "#fff", color: "#1747b8", padding: 14, fontWeight: 900, cursor: "pointer" },
  reservePanel: { position: "sticky", top: 110, alignSelf: "start", background: "#fff", borderRadius: 24, padding: 24, boxShadow: "0 18px 50px rgba(15,23,42,.12)" },
  totalBox: { background: "#dcfce7", borderRadius: 18, padding: 18, display: "flex", flexDirection: "column", gap: 6, margin: "18px 0" },
  converterBox: { background: "#eff6ff", borderRadius: 18, padding: 16, display: "flex", flexDirection: "column", gap: 6, marginBottom: 14 },
  input: { width: "100%", padding: 13, borderRadius: 13, border: "1px solid #cbd5e1", marginBottom: 12, fontWeight: 700 },
  textarea: { width: "100%", minHeight: 88, padding: 13, borderRadius: 13, border: "1px solid #cbd5e1", marginBottom: 12 },
  payButton: { width: "100%", border: 0, background: "#10b981", color: "#052e1c", padding: 15, borderRadius: 14, fontWeight: 950, cursor: "pointer", marginBottom: 10 },
  secondaryButton: { width: "100%", border: "1px solid #cbd5e1", background: "#fff", color: "#1747b8", padding: 14, borderRadius: 14, fontWeight: 900, cursor: "pointer", marginBottom: 10 },
  notice: { background: "#f8fafc", borderRadius: 14, padding: 14 },
  contentPage: { maxWidth: 1320, margin: "0 auto", padding: 52 },
  pageHero: { background: "#fff", borderRadius: 24, padding: 30, marginBottom: 24, boxShadow: "0 15px 45px rgba(15,23,42,.08)" },
  guideGrid: { display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(320px,1fr))", gap: 18 },
  guideCard: { background: "#fff", borderRadius: 22, padding: 22, boxShadow: "0 15px 45px rgba(15,23,42,.08)" },
  guideLinks: { display: "grid", gap: 10, marginTop: 15 },
  offerGrid: { display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(260px,1fr))", gap: 18 },
  offerCard: { background: "#fff", borderRadius: 22, padding: 24, boxShadow: "0 15px 45px rgba(15,23,42,.08)" },
  formGrid: { background: "#fff", borderRadius: 24, padding: 28, display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(280px,1fr))", gap: 12, boxShadow: "0 15px 45px rgba(15,23,42,.08)" },
  infoStack: { display: "grid", gap: 18 },
  infoPanel: { background: "#fff", borderRadius: 22, padding: 24, boxShadow: "0 15px 45px rgba(15,23,42,.08)" },
  loginPanel: { background: "#fff", maxWidth: 560, borderRadius: 24, padding: 28, boxShadow: "0 18px 50px rgba(15,23,42,.12)" },
  messageBox: { background: "#eff6ff", color: "#1747b8", borderRadius: 12, padding: 12, marginBottom: 12, fontWeight: 900 },
  primaryButton: { width: "100%", border: 0, background: "#1857df", color: "#fff", padding: 14, borderRadius: 14, fontWeight: 900, cursor: "pointer", marginBottom: 10 },
  pre: { background: "#0f172a", color: "#dbeafe", padding: 16, borderRadius: 16, overflow: "auto", maxHeight: 360 },
  footer: { background: "#fff", borderTop: "1px solid #e2e8f0", padding: "22px 52px", display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 14 },
  footerLinks: { display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }
};

