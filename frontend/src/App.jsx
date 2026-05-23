import React, { useEffect, useMemo, useState } from "react";

const API =
  import.meta.env.VITE_API_BASE ||
  import.meta.env.VITE_API_BASE_URL ||
  "https://myspace-hotel-backend.onrender.com";

const CURRENCIES = ["GBP", "USD", "EUR", "NGN", "AED", "CAD", "AUD", "JPY", "ZAR", "CHF", "INR"];

const FALLBACK_FX = {
  GBP: 1,
  USD: 1.27,
  EUR: 1.17,
  NGN: 1900,
  AED: 4.66,
  CAD: 1.72,
  AUD: 1.92,
  JPY: 197,
  ZAR: 23.2,
  CHF: 1.11,
  INR: 106
};

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

function tomorrowISO() {
  return new Date(Date.now() + 86400000).toISOString().slice(0, 10);
}

function money(v) {
  const n = Number(v || 0);
  return Number.isFinite(n) ? n.toFixed(2) : "0.00";
}

function nightsBetween(a, b) {
  const start = new Date(a);
  const end = new Date(b);
  const diff = Math.ceil((end - start) / 86400000);
  return diff > 0 ? diff : 1;
}

function safe(v) {
  return String(v || "").trim();
}

function fallbackConvert(amount, from, to) {
  if (!amount || from === to) return Number(amount || 0);
  if (!FALLBACK_FX[from] || !FALLBACK_FX[to]) return Number(amount || 0);
  return (Number(amount) / FALLBACK_FX[from]) * FALLBACK_FX[to];
}

function mapsSearchUrl(query) {
  return `https://www.google.com/maps/search/${encodeURIComponent(query)}`;
}

function mapsDirectionsUrl(query) {
  return `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(query)}`;
}

export default function App() {
  const [page, setPage] = useState("home");
  const [status, setStatus] = useState(null);

  const [destinations, setDestinations] = useState([]);
  const [country, setCountry] = useState("");
  const [city, setCity] = useState("");
  const [checkin, setCheckin] = useState(todayISO());
  const [checkout, setCheckout] = useState(tomorrowISO());
  const [guests, setGuests] = useState(2);
  const [rooms, setRooms] = useState(1);

  const [hotels, setHotels] = useState([]);
  const [selectedHotel, setSelectedHotel] = useState(null);
  const [loading, setLoading] = useState(false);
  const [paying, setPaying] = useState(false);

  const [displayCurrency, setDisplayCurrency] = useState("GBP");
  const [convertedTotal, setConvertedTotal] = useState(0);
  const [conversionNote, setConversionNote] = useState("");

  const [guideHotel, setGuideHotel] = useState(null);
  const [reservation, setReservation] = useState({
    customer_name: "",
    customer_email: "",
    customer_phone: "",
    note: ""
  });

  const [partnerId, setPartnerId] = useState("oracle-ohip");
  const [partnerToken, setPartnerToken] = useState("");
  const [partnerJwt, setPartnerJwt] = useState("");
  const [partnerDashboard, setPartnerDashboard] = useState(null);
  const [syncStatus, setSyncStatus] = useState(null);
  const [partnerMessage, setPartnerMessage] = useState("");

  const [hotelRegister, setHotelRegister] = useState({
    hotel_name: "",
    contact_name: "",
    email: "",
    phone: "",
    country: "",
    city: "",
    pms_provider: "oracle-ohip"
  });
  const [hotelOnboarded, setHotelOnboarded] = useState(null);

  const selectedCountry = useMemo(
    () => destinations.find((x) => x.country === country),
    [country, destinations]
  );

  const nights = nightsBetween(checkin, checkout);
  const selectedRate = selectedHotel?.first_rate || null;
  const baseCurrency = selectedRate?.currency || "GBP";
  const nightly = Number(selectedRate?.amount || 0);
  const stayTotal = nightly * Number(rooms || 1) * nights;

  const guideDestination = [
    safe(guideHotel?.hotel_name || guideHotel?.name),
    safe(guideHotel?.address || guideHotel?.area),
    safe(city),
    safe(country)
  ].filter(Boolean).join(", ");

  async function loadStatus() {
    try {
      const r = await fetch(`${API}/status`, { cache: "no-store" });
      const j = await r.json();
      setStatus(j);
    } catch {}
  }

  async function loadDestinations() {
    try {
      const r = await fetch(`${API}/api/real-catalog/destinations`, { cache: "no-store" });
      const j = await r.json();
      setDestinations(j.countries || []);
    } catch {}
  }

  async function searchHotels(customCountry = country, customCity = city) {
    if (!customCountry || !customCity) {
      alert("Please choose a country and city.");
      return;
    }

    setLoading(true);
    setHotels([]);
    setSelectedHotel(null);
    setGuideHotel(null);

    try {
      const q = new URLSearchParams({
        country: customCountry,
        city: customCity,
        checkin,
        checkout,
        guests: String(guests),
        rooms: String(rooms),
        limit: "100"
      });

      const r = await fetch(`${API}/api/hotels/search?${q.toString()}`, { cache: "no-store" });
      const j = await r.json();

      setHotels(j.hotels || []);
      setPage("results");
    } catch {
      alert("Hotel search failed. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  async function convertCurrency() {
    if (!stayTotal) {
      setConvertedTotal(0);
      setConversionNote("");
      return;
    }

    try {
      const q = new URLSearchParams({
        amount: String(stayTotal),
        from: baseCurrency,
        to: displayCurrency,
        from_currency: baseCurrency,
        to_currency: displayCurrency
      });

      const r = await fetch(`${API}/api/currency/convert?${q.toString()}`, { cache: "no-store" });
      const j = await r.json();

      if (j.ok && Number(j.converted)) {
        setConvertedTotal(Number(j.converted));
        setConversionNote(j.source ? `Conversion source: ${j.source}` : "Estimated live conversion.");
        return;
      }
    } catch {}

    const converted = fallbackConvert(stayTotal, baseCurrency, displayCurrency);
    setConvertedTotal(converted);
    setConversionNote("Estimated conversion shown for guidance. Final payment currency may depend on the hotel or payment provider.");
  }

  async function reserveAndPay() {
    if (!selectedHotel) {
      alert("Select a hotel first.");
      return;
    }

    if (!reservation.customer_name || !reservation.customer_email || !reservation.customer_phone) {
      alert("Please enter your name, email and phone number.");
      return;
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
      const stripeRoutes = [
        "/api/create-checkout-session",
        "/create-checkout-session",
        "/api/stripe/create-checkout-session",
        "/api/payments/create-checkout-session"
      ];

      for (const route of stripeRoutes) {
        try {
          const stripe = await fetch(`${API}${route}`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(body)
          });

          const stripeJson = await stripe.json().catch(() => ({}));

          if (stripeJson?.url && String(stripeJson.url).startsWith("http")) {
            window.location.href = stripeJson.url;
            return;
          }
        } catch {}
      }

      const r = await fetch(`${API}/reservation-request`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body)
      });

      const j = await r.json();

      alert(
        `${j.message || "Reservation request received. We will confirm the stay before payment."}\n\nReference: ${
          j.reservation_code || j.booking_reference || "Created"
        }`
      );
    } catch {
      alert("Payment or reservation could not be started. Please try again.");
    } finally {
      setPaying(false);
    }
  }

  async function loginPartner() {
    setPartnerMessage("");

    if (!partnerToken.trim()) {
      setPartnerMessage("Enter your partner token.");
      return;
    }

    try {
      const r = await fetch(`${API}/api/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ partner_id: partnerId, token: partnerToken })
      });

      const j = await r.json();

      if (!j.ok || !j.jwt) throw new Error("Login failed");

      setPartnerJwt(j.jwt);
      setPartnerMessage("Partner connected successfully.");
      await loadPartnerDashboard(j.jwt);
      await loadSync(j.jwt);
    } catch {
      setPartnerMessage("Partner login failed. Check partner ID and token.");
    }
  }

  async function loadPartnerDashboard(jwt = partnerJwt) {
    if (!jwt) return;
    const r = await fetch(`${API}/api/admin/dashboard`, {
      headers: { Authorization: `Bearer ${jwt}` },
      cache: "no-store"
    });
    const j = await r.json();
    setPartnerDashboard(j);
  }

  async function loadSync(jwt = partnerJwt) {
    if (!jwt) return;
    const r = await fetch(`${API}/api/sync/status`, {
      headers: { Authorization: `Bearer ${jwt}` },
      cache: "no-store"
    });
    const j = await r.json();
    setSyncStatus(j);
  }

  async function runSync() {
    if (!partnerJwt) return;
    await fetch(`${API}/api/sync/run`, {
      method: "POST",
      headers: { Authorization: `Bearer ${partnerJwt}` }
    });
    await loadSync();
    await loadPartnerDashboard();
  }

  async function registerHotel() {
    try {
      const r = await fetch(`${API}/api/extranet/register`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(hotelRegister)
      });

      const j = await r.json();
      setHotelOnboarded(j);
    } catch {
      setHotelOnboarded({ ok: false, message: "Hotel onboarding request could not be completed." });
    }
  }

  function openGuideForHotel(hotel) {
    setGuideHotel(hotel || selectedHotel);
    setPage("guide");
  }

  function choosePopular(destinationCountry, destinationCity) {
    setCountry(destinationCountry);
    setCity(destinationCity);
    searchHotels(destinationCountry, destinationCity);
  }

  useEffect(() => {
    loadStatus();
    loadDestinations();
    const t = setInterval(loadStatus, 30000);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    if (selectedCountry && !city) {
      setCity(selectedCountry.cities?.[0]?.city || "");
    }
  }, [selectedCountry, city]);

  useEffect(() => {
    convertCurrency();
  }, [stayTotal, baseCurrency, displayCurrency]);

  return (
    <div style={styles.page}>
      <Header setPage={setPage} />

      {page === "home" && (
        <>
          <Hero
            country={country}
            city={city}
            setCountry={setCountry}
            setCity={setCity}
            destinations={destinations}
            selectedCountry={selectedCountry}
            checkin={checkin}
            checkout={checkout}
            setCheckin={setCheckin}
            setCheckout={setCheckout}
            guests={guests}
            rooms={rooms}
            setGuests={setGuests}
            setRooms={setRooms}
            searchHotels={() => searchHotels()}
            loading={loading}
          />

          <TrustBar />

          <section style={styles.homeSection}>
            <div style={styles.sectionTop}>
              <div>
                <h2 style={styles.sectionTitle}>Popular destinations</h2>
                <p style={styles.muted}>Start with trusted destinations and search the live hotel catalogue.</p>
              </div>
            </div>

            <div style={styles.destinationGrid}>
              {[
                ["United Kingdom", "London", "London", "https://images.unsplash.com/photo-1513635269975-59663e0ac1ad?auto=format&fit=crop&w=900&q=80"],
                ["France", "Paris", "Paris", "https://images.unsplash.com/photo-1502602898657-3e91760cbb34?auto=format&fit=crop&w=900&q=80"],
                ["United Arab Emirates", "Dubai", "Dubai", "https://images.unsplash.com/photo-1512453979798-5ea266f8880c?auto=format&fit=crop&w=900&q=80"],
                ["United States", "New York", "New York", "https://images.unsplash.com/photo-1485871981521-5b1fd3805eee?auto=format&fit=crop&w=900&q=80"],
                ["Spain", "Barcelona", "Barcelona", "https://images.unsplash.com/photo-1539037116277-4db20889f2d4?auto=format&fit=crop&w=900&q=80"]
              ].map(([c, ct, title, image]) => (
                <button
                  key={`${c}-${ct}`}
                  style={{ ...styles.destCard, backgroundImage: `linear-gradient(180deg, rgba(0,0,0,.04), rgba(0,0,0,.62)), url(${image})` }}
                  onClick={() => choosePopular(c, ct)}
                >
                  <strong>{title}</strong>
                  <span>{c}</span>
                </button>
              ))}
            </div>
          </section>

          <section style={styles.homeSection}>
            <h2 style={styles.sectionTitle}>Plan your stay with confidence</h2>
            <div style={styles.featureGrid}>
              <button style={styles.featureCard} onClick={() => setPage("guide")}>
                <h3>Destination Guide</h3>
                <p>Open maps, directions, hospitals, airports, police, restaurants, attractions, tour buses and local travel support.</p>
              </button>
              <button style={styles.featureCard} onClick={() => setPage("faq")}>
                <h3>FAQ</h3>
                <p>Clear answers for bookings, payments, cancellations, refunds, arrival support and reservation changes.</p>
              </button>
              <button style={styles.featureCard} onClick={() => setPage("contact")}>
                <h3>Contact Support</h3>
                <p>Reach reservation support for booking issues, arrival questions, hotel help and partner enquiries.</p>
              </button>
              <button style={styles.featureCard} onClick={() => setPage("partner")}>
                <h3>Hotel / Partner Access</h3>
                <p>Secure login for hotel extranet, PMS sync, onboarding, mappings and partner operations.</p>
              </button>
            </div>
          </section>

          <Footer setPage={setPage} status={status} />
        </>
      )}

      {page === "results" && (
        <main style={styles.main}>
          <button style={styles.backBtn} onClick={() => setPage("home")}>← Back to search</button>

          <div style={styles.resultsLayout}>
            <section>
              <h2 style={styles.sectionTitle}>Available stays in {city}, {country}</h2>
              <p style={styles.muted}>Choose a verified stay, review the total and continue securely.</p>

              <div style={styles.hotelGrid}>
                {hotels.map((h) => {
                  const rate = h.first_rate;
                  return (
                    <div key={h.hotel_id} style={{ ...styles.hotelCard, borderColor: selectedHotel?.hotel_id === h.hotel_id ? "#1857df" : "#e5e7eb" }}>
                      {h.image_url ? <img src={h.image_url} style={styles.hotelImg} /> : <div style={styles.imageFallback}>MYSPACE HOTEL</div>}

                      <div style={styles.hotelBody}>
                        <div style={styles.badgeRow}>
                          <span style={styles.badge}>Verified stay</span>
                          <span style={styles.greenBadge}>{rate ? "Current price" : "Confirm price"}</span>
                        </div>

                        <h3 style={styles.hotelName}>{h.hotel_name || h.name}</h3>
                        <p style={styles.hotelMeta}>{h.address || h.area || city}, {country}</p>

                        <div style={styles.priceBox}>
                          {rate ? (
                            <>
                              <span>From</span>
                              <strong>{rate.currency || "GBP"} {money(rate.amount)}</strong>
                              <small>per room / night</small>
                            </>
                          ) : (
                            <strong>Price confirmation required</strong>
                          )}
                        </div>

                        <div style={styles.cardButtons}>
                          <button style={styles.selectBtn} onClick={() => setSelectedHotel(h)}>Select Hotel</button>
                          <button style={styles.lightBtn} onClick={() => openGuideForHotel(h)}>Guide / Map</button>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </section>

            <aside style={styles.reservePanel}>
              <h2>Reserve / Pay</h2>

              {selectedHotel ? (
                <>
                  <h3>{selectedHotel.hotel_name || selectedHotel.name}</h3>
                  <p style={styles.muted}>{selectedHotel.address || selectedHotel.area || city}, {country}</p>

                  <div style={styles.totalBox}>
                    <span>Stay total</span>
                    <strong>{baseCurrency} {money(stayTotal)}</strong>
                    <small>{nights} night{nights > 1 ? "s" : ""} | {guests} guests | {rooms} room{rooms > 1 ? "s" : ""}</small>
                  </div>

                  <div style={styles.converterBox}>
                    <label>Currency converter</label>
                    <select style={styles.input} value={displayCurrency} onChange={(e) => setDisplayCurrency(e.target.value)}>
                      {CURRENCIES.map((c) => <option key={c} value={c}>{c}</option>)}
                    </select>
                    <strong>{displayCurrency} {money(convertedTotal)}</strong>
                    <small>{conversionNote}</small>
                  </div>

                  <input style={styles.input} placeholder="Full name" value={reservation.customer_name} onChange={(e) => setReservation({ ...reservation, customer_name: e.target.value })} />
                  <input style={styles.input} placeholder="Email address" value={reservation.customer_email} onChange={(e) => setReservation({ ...reservation, customer_email: e.target.value })} />
                  <input style={styles.input} placeholder="Phone number" value={reservation.customer_phone} onChange={(e) => setReservation({ ...reservation, customer_phone: e.target.value })} />
                  <textarea style={styles.textarea} placeholder="Special request" value={reservation.note} onChange={(e) => setReservation({ ...reservation, note: e.target.value })} />

                  <button style={styles.payBtn} onClick={reserveAndPay}>
                    {paying ? "Starting secure checkout..." : selectedRate ? "Reserve / Pay Securely" : "Request price confirmation"}
                  </button>

                  <button style={styles.secondaryFull} onClick={() => openGuideForHotel(selectedHotel)}>Open destination guide</button>
                </>
              ) : (
                <div style={styles.notice}>Select a hotel to continue.</div>
              )}
            </aside>
          </div>
        </main>
      )}

      {page === "guide" && (
        <DestinationGuide
          setPage={setPage}
          destination={guideDestination || [city, country].filter(Boolean).join(", ")}
          country={country}
          city={city}
          hotel={guideHotel || selectedHotel}
        />
      )}

      {page === "faq" && <FAQPage setPage={setPage} />}
      {page === "terms" && <TermsPage setPage={setPage} />}
      {page === "privacy" && <PrivacyPage setPage={setPage} />}
      {page === "contact" && <ContactPage setPage={setPage} />}
      {page === "developers" && <DevelopersPage setPage={setPage} />}
      {page === "api" && <APIPage setPage={setPage} />}
      {page === "publicStatus" && <PublicStatusPage setPage={setPage} status={status} />}
      {page === "partner" && (
        <PartnerPage
          setPage={setPage}
          partnerId={partnerId}
          setPartnerId={setPartnerId}
          partnerToken={partnerToken}
          setPartnerToken={setPartnerToken}
          partnerMessage={partnerMessage}
          partnerJwt={partnerJwt}
          loginPartner={loginPartner}
          partnerDashboard={partnerDashboard}
          syncStatus={syncStatus}
          runSync={runSync}
          loadSync={loadSync}
          hotelRegister={hotelRegister}
          setHotelRegister={setHotelRegister}
          registerHotel={registerHotel}
          hotelOnboarded={hotelOnboarded}
        />
      )}
    </div>
  );
}

function Header({ setPage }) {
  return (
    <header style={styles.header}>
      <button style={styles.logoWrap} onClick={() => setPage("home")}>
        <div style={styles.logoIcon}>✦</div>
        <div>
          <div style={styles.logo}>MYSPACE HOTEL</div>
          <div style={styles.tagline}>Stay with clarity</div>
        </div>
      </button>

      <nav style={styles.topNav}>
        <button onClick={() => setPage("home")} style={styles.topLink}>Stays</button>
        <button onClick={() => setPage("guide")} style={styles.topLink}>Destination Guide</button>
        <button onClick={() => setPage("faq")} style={styles.topLink}>FAQ</button>
        <button onClick={() => setPage("contact")} style={styles.topLink}>Contact</button>
        <button onClick={() => setPage("partner")} style={styles.loginBtn}>Hotel / Partner Login</button>
      </nav>
    </header>
  );
}

function Hero(props) {
  const { country, city, setCountry, setCity, destinations, selectedCountry, checkin, checkout, setCheckin, setCheckout, guests, rooms, setGuests, setRooms, searchHotels, loading } = props;

  return (
    <section style={styles.hero}>
      <div style={styles.heroContent}>
        <h1 style={styles.heroTitle}>Find your perfect stay</h1>
        <p style={styles.heroText}>Search verified hotels and apartments worldwide with clear reservation support.</p>

        <div style={styles.searchBar}>
          <div style={styles.searchCell}>
            <label>Country</label>
            <select value={country} onChange={(e) => { setCountry(e.target.value); setCity(""); }}>
              <option value="">Choose country</option>
              {destinations.map((c) => <option key={c.country} value={c.country}>{c.country}</option>)}
            </select>
          </div>

          <div style={styles.searchCell}>
            <label>Destination</label>
            <select value={city} onChange={(e) => setCity(e.target.value)}>
              <option value="">Choose city</option>
              {(selectedCountry?.cities || []).map((c) => <option key={c.city} value={c.city}>{c.city}</option>)}
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
            <label>Guests / Rooms</label>
            <div style={styles.inlineSmall}>
              <input type="number" min="1" value={guests} onChange={(e) => setGuests(e.target.value)} />
              <input type="number" min="1" value={rooms} onChange={(e) => setRooms(e.target.value)} />
            </div>
          </div>

          <button style={styles.searchBtn} onClick={searchHotels}>{loading ? "Searching..." : "Search Hotels"}</button>
        </div>
      </div>
    </section>
  );
}

function TrustBar() {
  return (
    <section style={styles.trustBar}>
      <div><strong>Verified stays</strong><span>Real hotels and apartments.</span></div>
      <div><strong>Secure reservation</strong><span>Clear stay details before payment.</span></div>
      <div><strong>Destination support</strong><span>Maps, safety, dining and travel links.</span></div>
    </section>
  );
}

function DestinationGuide({ setPage, destination, country, city, hotel }) {
  const place = destination || [city, country].filter(Boolean).join(", ") || "your destination";

  const guideSections = [
    {
      title: "Emergency numbers",
      text: "Use local emergency numbers for urgent help. In many destinations, 112 connects to emergency services. In the UK, 999 is also used.",
      links: [
        ["Police near me", mapsSearchUrl(`police station near ${place}`)],
        ["Hospital near me", mapsSearchUrl(`hospital near ${place}`)],
        ["Pharmacy near me", mapsSearchUrl(`pharmacy near ${place}`)]
      ]
    },
    {
      title: "Airport and transfers",
      text: "Find the nearest airport, taxi options, train connections and travel routes before arrival.",
      links: [
        ["Airport near destination", mapsSearchUrl(`airport near ${place}`)],
        ["Taxi near destination", mapsSearchUrl(`taxi near ${place}`)],
        ["Directions to stay", mapsDirectionsUrl(place)]
      ]
    },
    {
      title: "Restaurants and local food",
      text: "Explore nearby restaurants, cafes, late-night food, family dining and local favourites.",
      links: [
        ["Restaurants nearby", mapsSearchUrl(`restaurants near ${place}`)],
        ["Cafes nearby", mapsSearchUrl(`cafes near ${place}`)],
        ["Supermarkets nearby", mapsSearchUrl(`supermarket near ${place}`)]
      ]
    },
    {
      title: "Attractions and tours",
      text: "Find museums, tourist attractions, zoos, sightseeing buses, shopping areas and family activities.",
      links: [
        ["Things to do", mapsSearchUrl(`things to do near ${place}`)],
        ["Museums nearby", mapsSearchUrl(`museum near ${place}`)],
        ["Tour bus nearby", mapsSearchUrl(`tour bus near ${place}`)]
      ]
    },
    {
      title: "Transport and navigation",
      text: "Check train stations, metro routes, bus stops, car hire and walking directions.",
      links: [
        ["Train station nearby", mapsSearchUrl(`train station near ${place}`)],
        ["Bus station nearby", mapsSearchUrl(`bus station near ${place}`)],
        ["Car rental nearby", mapsSearchUrl(`car rental near ${place}`)]
      ]
    },
    {
      title: "Stay location",
      text: "Open the property area in Google Maps and check route options before travelling.",
      links: [
        ["Open map", mapsSearchUrl(place)],
        ["Get directions", mapsDirectionsUrl(place)],
        ["Satellite map", `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(place)}&basemap=satellite`]
      ]
    }
  ];

  return (
    <main style={styles.contentPage}>
      <button style={styles.backBtn} onClick={() => setPage("home")}>← Back</button>

      <div style={styles.pageHero}>
        <h1>Destination Guide</h1>
        <p>{place}</p>
        {hotel && <strong>{hotel.hotel_name || hotel.name}</strong>}
      </div>

      <div style={styles.guideGrid}>
        {guideSections.map((s) => (
          <div key={s.title} style={styles.guideCard}>
            <h2>{s.title}</h2>
            <p>{s.text}</p>
            <div style={styles.linkGrid}>
              {s.links.map(([label, url]) => (
                <a key={label} href={url} target="_blank" rel="noreferrer" style={styles.mapLink}>{label}</a>
              ))}
            </div>
          </div>
        ))}
      </div>

      <div style={styles.largeMapBox}>
        <h2>Map and directions</h2>
        <p>Use these links to open a live map, plan directions, find local transport and check the surrounding area.</p>
        <div style={styles.mapActions}>
          <a href={mapsSearchUrl(place)} target="_blank" rel="noreferrer" style={styles.primaryLink}>Open Google Map</a>
          <a href={mapsDirectionsUrl(place)} target="_blank" rel="noreferrer" style={styles.primaryLink}>Get Directions</a>
          <a href={mapsSearchUrl(`restaurants hospitals airport attractions near ${place}`)} target="_blank" rel="noreferrer" style={styles.primaryLink}>Explore Nearby</a>
        </div>
      </div>
    </main>
  );
}

function FAQPage({ setPage }) {
  return (
    <InfoPage
      setPage={setPage}
      title="Frequently Asked Questions"
      sections={[
        ["How booking works", "Search a destination, choose a stay, review the rate and submit your reservation details. Where secure checkout is available, the Reserve / Pay button will open payment. If the hotel requires confirmation, we collect your request and confirm availability before payment."],
        ["Payment", "MySpace Hotel uses a secure payment flow where available. You should always review your hotel, dates, room count, guest count and total before completing payment."],
        ["Cancellation", "Cancellation rules depend on the hotel and selected rate. Flexible rates may allow cancellation, while non-refundable rates may not."],
        ["Support", "For booking help, use the Contact page or email reservations@myspace-hotel.com."]
      ]}
    />
  );
}

function TermsPage({ setPage }) {
  return (
    <InfoPage
      setPage={setPage}
      title="Terms & Conditions"
      sections={[
        ["Reservations", "All reservations depend on hotel availability, rate conditions and final confirmation. Some prices may require confirmation before payment."],
        ["Guest responsibility", "Guests must provide accurate names, dates, contact details and arrival information."],
        ["Hotel policies", "Check-in times, deposits, cancellation rules, city taxes and identification requirements vary by destination and property."],
        ["Payments", "Payment processing is handled through secure payment providers where enabled. MySpace Hotel does not ask customers to share card details through chat."]
      ]}
    />
  );
}

function PrivacyPage({ setPage }) {
  return (
    <InfoPage
      setPage={setPage}
      title="Privacy Policy"
      sections={[
        ["Customer data", "We use customer details to support reservation requests, booking confirmation, customer service and travel assistance."],
        ["Payment security", "Payment details are handled through secure payment processors. We do not display or request sensitive card data in the public app."],
        ["Hotel partners", "Partner access is protected behind authentication and used for hotel onboarding, PMS connectivity and operational support."],
        ["Support", "For privacy questions, contact reservations@myspace-hotel.com."]
      ]}
    />
  );
}

function ContactPage({ setPage }) {
  return (
    <InfoPage
      setPage={setPage}
      title="Contact MySpace Hotel"
      sections={[
        ["Reservations", "Email: reservations@myspace-hotel.com. Use this for booking assistance, reservation changes and arrival support."],
        ["Customers", "We can help with destination guidance, hotel questions, payment support and booking requests."],
        ["Hotels and partners", "Hotels, PMS providers and channel managers can use Hotel / Partner Login for onboarding and connectivity tools."],
        ["Emergency travel help", "For urgent safety matters, contact local emergency services first, then contact MySpace Hotel support for reservation assistance."]
      ]}
    />
  );
}

function DevelopersPage({ setPage }) {
  return (
    <InfoPage
      setPage={setPage}
      title="Developers"
      sections={[
        ["Partner API", "MySpace Hotel supports partner authentication, hotel inventory, PMS sync monitoring, mappings and webhook ingestion."],
        ["Use cases", "PMS integrations, channel manager connectivity, hotel onboarding, reservation dispatch, rate sync and inventory sync."],
        ["Access", "Developer and partner tools are available after secure partner login."],
        ["Security", "Use signed webhooks, token authentication, audit logs and approved partner credentials."]
      ]}
    />
  );
}

function APIPage({ setPage }) {
  return (
    <InfoPage
      setPage={setPage}
      title="API"
      sections={[
        ["Authentication", "Partner systems authenticate with partner ID and token to receive a secure session."],
        ["Hotel search", "Customer hotel search uses country and city selection from the live destination catalogue."],
        ["PMS sync", "Authenticated partners can view sync status, run sync actions and monitor PMS connectivity."],
        ["Webhooks", "Webhook endpoints support reservation, inventory and rate events for connected PMS and channel managers."]
      ]}
    />
  );
}

function PublicStatusPage({ setPage, status }) {
  return (
    <main style={styles.contentPage}>
      <button style={styles.backBtn} onClick={() => setPage("home")}>← Back</button>
      <div style={styles.pageHero}>
        <h1>System Status</h1>
        <p>Current customer booking platform status.</p>
      </div>
      <div style={styles.statusGrid}>
        <Metric label="API" value={status?.api || status?.status || "checking"} />
        <Metric label="Hotels" value={status?.hotels_loaded || status?.hotels || "-"} />
        <Metric label="Countries" value={status?.countries || "-"} />
        <Metric label="Cities" value={status?.cities || "-"} />
      </div>
    </main>
  );
}

function PartnerPage(props) {
  const {
    setPage,
    partnerId,
    setPartnerId,
    partnerToken,
    setPartnerToken,
    partnerMessage,
    partnerJwt,
    loginPartner,
    partnerDashboard,
    syncStatus,
    runSync,
    loadSync,
    hotelRegister,
    setHotelRegister,
    registerHotel,
    hotelOnboarded
  } = props;

  const loggedIn = Boolean(partnerJwt);

  return (
    <main style={styles.contentPage}>
      <button style={styles.backBtn} onClick={() => setPage("home")}>← Back</button>

      <div style={styles.pageHero}>
        <h1>Hotel & Partner Access</h1>
        <p>Secure access for hotel extranet, PMS sync, onboarding and partner operations.</p>
      </div>

      {!loggedIn && (
        <div style={styles.loginCard}>
          <h2>Secure login</h2>
          <p>Enterprise tools are hidden from customers and only appear after authenticated login.</p>
          <input style={styles.input} value={partnerId} onChange={(e) => setPartnerId(e.target.value)} placeholder="Partner ID" />
          <input style={styles.input} value={partnerToken} onChange={(e) => setPartnerToken(e.target.value)} placeholder="Partner token" type="password" />
          {partnerMessage && <div style={styles.messageBox}>{partnerMessage}</div>}
          <button style={styles.primaryButton} onClick={loginPartner}>Login securely</button>
        </div>
      )}

      {loggedIn && (
        <>
          <div style={styles.partnerGrid}>
            <div style={styles.partnerCard}>
              <h2>Partner Dashboard</h2>
              <MetricGrid data={{
                Hotels: partnerDashboard?.hotels_loaded,
                Reservations: partnerDashboard?.reservations,
                Webhooks: partnerDashboard?.webhook_events,
                Mappings: partnerDashboard?.mappings,
                Inventory: partnerDashboard?.inventory_syncs,
                Rates: partnerDashboard?.rate_syncs,
                Failures: partnerDashboard?.sync_failures || 0
              }} />
            </div>

            <div style={styles.partnerCard}>
              <h2>PMS Sync Status</h2>
              <MetricGrid data={{
                Partners: syncStatus?.partners?.length || 0,
                Inventory: syncStatus?.inventory_syncs || 0,
                Rates: syncStatus?.rate_syncs || 0,
                Reservations: syncStatus?.reservation_syncs || 0,
                Failures: syncStatus?.failures || 0
              }} />
              <button style={styles.primaryButton} onClick={runSync}>Run sync now</button>
              <button style={styles.secondaryFull} onClick={() => loadSync()}>Refresh sync</button>
            </div>

            <div style={styles.partnerCard}>
              <h2>Hotel Onboarding</h2>
              {Object.keys(hotelRegister).map((k) => (
                <input
                  key={k}
                  style={styles.input}
                  placeholder={k}
                  value={hotelRegister[k]}
                  onChange={(e) => setHotelRegister({ ...hotelRegister, [k]: e.target.value })}
                />
              ))}
              <button style={styles.primaryButton} onClick={registerHotel}>Activate hotel</button>
            </div>

            <div style={styles.partnerCard}>
              <h2>Onboarding Result</h2>
              <pre style={styles.pre}>{JSON.stringify(hotelOnboarded || {}, null, 2)}</pre>
            </div>
          </div>
        </>
      )}
    </main>
  );
}

function InfoPage({ title, sections, setPage }) {
  return (
    <main style={styles.contentPage}>
      <button style={styles.backBtn} onClick={() => setPage("home")}>← Back</button>
      <div style={styles.pageHero}>
        <h1>{title}</h1>
      </div>

      <div style={styles.infoStack}>
        {sections.map(([heading, text]) => (
          <div key={heading} style={styles.infoPanel}>
            <h2>{heading}</h2>
            <p>{text}</p>
          </div>
        ))}
      </div>
    </main>
  );
}

function Metric({ label, value }) {
  return (
    <div style={styles.metricBox}>
      <span>{label}</span>
      <strong>{value ?? "-"}</strong>
    </div>
  );
}

function MetricGrid({ data }) {
  return (
    <div style={styles.metricGrid}>
      {Object.entries(data).map(([k, v]) => <Metric key={k} label={k} value={v} />)}
    </div>
  );
}

function Footer({ setPage, status }) {
  return (
    <footer style={styles.footer}>
      <div>
        <strong>MySpace Hotel</strong>
        <span> Book with clarity before you arrive.</span>
      </div>
      <div style={styles.footerLinks}>
        <button onClick={() => setPage("contact")}>Contact</button>
        <button onClick={() => setPage("privacy")}>Privacy</button>
        <button onClick={() => setPage("terms")}>Terms</button>
        <button onClick={() => setPage("developers")}>Developers</button>
        <button onClick={() => setPage("api")}>API</button>
        <button onClick={() => setPage("publicStatus")}>Status</button>
        <span>{status?.api === "online" || status?.ok ? "Online" : "Checking"}</span>
      </div>
    </footer>
  );
}

const styles = {
  page: { minHeight: "100vh", background: "#f6f8fc", color: "#07142f", fontFamily: "Inter, Arial, sans-serif" },
  header: { minHeight: 88, background: "#fff", display: "flex", alignItems: "center", justifyContent: "space-between", padding: "0 44px", boxShadow: "0 2px 18px rgba(15,23,42,.08)", position: "sticky", top: 0, zIndex: 10, gap: 20 },
  logoWrap: { display: "flex", alignItems: "center", gap: 12, border: 0, background: "transparent", cursor: "pointer", textAlign: "left" },
  logoIcon: { width: 42, height: 42, borderRadius: 14, display: "grid", placeItems: "center", background: "#fff3c4", color: "#b77900", fontSize: 24, fontWeight: 900 },
  logo: { fontSize: 26, fontWeight: 900, letterSpacing: 1 },
  tagline: { fontSize: 13, color: "#64748b", fontWeight: 700 },
  topNav: { display: "flex", alignItems: "center", gap: 16, flexWrap: "wrap", justifyContent: "flex-end" },
  topLink: { border: 0, background: "transparent", fontWeight: 800, fontSize: 15, cursor: "pointer", color: "#0f172a" },
  loginBtn: { border: "1px solid #cbd5e1", background: "#fff", color: "#1747b8", borderRadius: 14, padding: "12px 18px", fontWeight: 900, cursor: "pointer" },
  hero: { minHeight: 520, backgroundImage: "linear-gradient(90deg, rgba(255,255,255,.98), rgba(255,255,255,.75), rgba(255,255,255,.2)), url('https://images.unsplash.com/photo-1507525428034-b723cf961d3e?auto=format&fit=crop&w=2000&q=80')", backgroundSize: "cover", backgroundPosition: "center" },
  heroContent: { maxWidth: 1420, margin: "0 auto", padding: "70px 52px 40px" },
  heroTitle: { fontSize: 58, lineHeight: 1.02, margin: 0, letterSpacing: -2, color: "#07142f" },
  heroText: { fontSize: 22, color: "#334155", marginTop: 14, fontWeight: 700 },
  searchBar: { marginTop: 34, background: "#fff", borderRadius: 24, display: "grid", gridTemplateColumns: "1.1fr 1.1fr .9fr .9fr .9fr 1fr", boxShadow: "0 26px 60px rgba(15,23,42,.18)", overflow: "hidden" },
  searchCell: { padding: 18, borderRight: "1px solid #e2e8f0", display: "flex", flexDirection: "column", gap: 8 },
  inlineSmall: { display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 },
  searchBtn: { border: 0, background: "#1857df", color: "#fff", fontSize: 16, fontWeight: 900, cursor: "pointer" },
  trustBar: { maxWidth: 1320, margin: "-22px auto 24px", background: "#fff", borderRadius: 20, padding: 22, display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 20, boxShadow: "0 15px 45px rgba(15,23,42,.08)", position: "relative", zIndex: 2 },
  homeSection: { maxWidth: 1420, margin: "0 auto", padding: "28px 52px" },
  sectionTop: { display: "flex", justifyContent: "space-between", alignItems: "center" },
  sectionTitle: { fontSize: 30, margin: "0 0 18px" },
  muted: { color: "#64748b", fontWeight: 700 },
  destinationGrid: { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 16 },
  destCard: { height: 220, border: 0, borderRadius: 18, backgroundSize: "cover", backgroundPosition: "center", color: "#fff", textAlign: "left", padding: 22, display: "flex", flexDirection: "column", justifyContent: "flex-end", cursor: "pointer", boxShadow: "0 14px 35px rgba(15,23,42,.18)", fontSize: 18 },
  featureGrid: { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(250px, 1fr))", gap: 18 },
  featureCard: { background: "#fff", border: 0, borderRadius: 22, padding: 24, textAlign: "left", cursor: "pointer", boxShadow: "0 16px 40px rgba(15,23,42,.08)" },
  main: { maxWidth: 1420, margin: "0 auto", padding: "28px 42px" },
  backBtn: { border: 0, background: "#e0ecff", color: "#1747b8", padding: "12px 16px", borderRadius: 14, fontWeight: 900, cursor: "pointer", marginBottom: 18 },
  resultsLayout: { display: "grid", gridTemplateColumns: "1fr 390px", gap: 24 },
  hotelGrid: { display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(295px, 1fr))", gap: 18 },
  hotelCard: { background: "#fff", border: "2px solid #e5e7eb", borderRadius: 22, overflow: "hidden", boxShadow: "0 16px 40px rgba(15,23,42,.08)" },
  hotelImg: { width: "100%", height: 190, objectFit: "cover" },
  imageFallback: { height: 190, display: "grid", placeItems: "center", background: "#dbeafe", color: "#1747b8", fontWeight: 900 },
  hotelBody: { padding: 18 },
  badgeRow: { display: "flex", justifyContent: "space-between", gap: 8 },
  badge: { background: "#dbeafe", color: "#1747b8", borderRadius: 999, padding: "7px 10px", fontWeight: 900, fontSize: 12 },
  greenBadge: { background: "#dcfce7", color: "#166534", borderRadius: 999, padding: "7px 10px", fontWeight: 900, fontSize: 12 },
  hotelName: { fontSize: 22, marginBottom: 8 },
  hotelMeta: { color: "#64748b", fontWeight: 700 },
  priceBox: { background: "#f8fafc", borderRadius: 14, padding: 14, display: "flex", flexDirection: "column", gap: 4, marginBottom: 12 },
  cardButtons: { display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 },
  selectBtn: { width: "100%", border: 0, borderRadius: 14, background: "#f6c744", padding: 14, fontWeight: 900, cursor: "pointer" },
  lightBtn: { width: "100%", border: "1px solid #cbd5e1", borderRadius: 14, background: "#fff", color: "#1747b8", padding: 14, fontWeight: 900, cursor: "pointer" },
  reservePanel: { position: "sticky", top: 110, alignSelf: "start", background: "#fff", borderRadius: 24, padding: 24, boxShadow: "0 18px 50px rgba(15,23,42,.12)" },
  totalBox: { background: "#dcfce7", borderRadius: 18, padding: 18, display: "flex", flexDirection: "column", gap: 6, margin: "18px 0" },
  converterBox: { background: "#eff6ff", borderRadius: 18, padding: 16, display: "flex", flexDirection: "column", gap: 6, marginBottom: 14 },
  input: { width: "100%", padding: 13, borderRadius: 13, border: "1px solid #cbd5e1", marginBottom: 12, fontWeight: 700 },
  textarea: { width: "100%", minHeight: 88, padding: 13, borderRadius: 13, border: "1px solid #cbd5e1", marginBottom: 12 },
  payBtn: { width: "100%", border: 0, background: "#10b981", color: "#052e1c", padding: 15, borderRadius: 14, fontWeight: 950, cursor: "pointer", marginBottom: 10 },
  secondaryFull: { width: "100%", border: "1px solid #cbd5e1", background: "#fff", color: "#1747b8", padding: 14, borderRadius: 14, fontWeight: 900, cursor: "pointer", marginBottom: 10 },
  notice: { background: "#f8fafc", borderRadius: 14, padding: 14 },
  contentPage: { maxWidth: 1320, margin: "0 auto", padding: 42 },
  pageHero: { background: "#fff", borderRadius: 24, padding: 30, marginBottom: 24, boxShadow: "0 15px 45px rgba(15,23,42,.08)" },
  guideGrid: { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))", gap: 18 },
  guideCard: { background: "#fff", borderRadius: 22, padding: 22, boxShadow: "0 15px 45px rgba(15,23,42,.08)" },
  linkGrid: { display: "grid", gap: 10, marginTop: 15 },
  mapLink: { background: "#e0ecff", color: "#1747b8", padding: "12px 14px", borderRadius: 12, fontWeight: 900, textDecoration: "none" },
  largeMapBox: { marginTop: 24, background: "#fff", borderRadius: 24, padding: 28, boxShadow: "0 15px 45px rgba(15,23,42,.08)" },
  mapActions: { display: "flex", gap: 12, flexWrap: "wrap" },
  primaryLink: { background: "#1857df", color: "#fff", padding: "13px 16px", borderRadius: 13, textDecoration: "none", fontWeight: 900 },
  infoStack: { display: "grid", gap: 18 },
  infoPanel: { background: "#fff", borderRadius: 22, padding: 24, boxShadow: "0 15px 45px rgba(15,23,42,.08)" },
  statusGrid: { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 16 },
  loginCard: { background: "#fff", maxWidth: 560, borderRadius: 24, padding: 28, boxShadow: "0 18px 50px rgba(15,23,42,.12)" },
  messageBox: { background: "#eff6ff", color: "#1747b8", borderRadius: 12, padding: 12, marginBottom: 12, fontWeight: 900 },
  primaryButton: { width: "100%", border: 0, background: "#1857df", color: "#fff", padding: 14, borderRadius: 14, fontWeight: 900, cursor: "pointer", marginBottom: 10 },
  partnerGrid: { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(330px, 1fr))", gap: 18 },
  partnerCard: { background: "#fff", borderRadius: 24, padding: 22, boxShadow: "0 15px 45px rgba(15,23,42,.08)" },
  metricGrid: { display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 10 },
  metricBox: { background: "#f1f5f9", borderRadius: 14, padding: 14, display: "flex", flexDirection: "column", gap: 6 },
  pre: { background: "#0f172a", color: "#dbeafe", padding: 16, borderRadius: 16, overflow: "auto", maxHeight: 360 },
  footer: { background: "#fff", borderTop: "1px solid #e2e8f0", padding: "22px 42px", display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 14 },
  footerLinks: { display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }
};
