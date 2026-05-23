import React, { useEffect, useMemo, useState } from "react";

const API =
  import.meta.env.VITE_API_BASE ||
  import.meta.env.VITE_API_BASE_URL ||
  "https://myspace-hotel-backend.onrender.com";

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

export default function App() {
  const [view, setView] = useState("home");
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
    [destinations, country]
  );

  const nights = nightsBetween(checkin, checkout);
  const selectedRate = selectedHotel?.first_rate || null;
  const total = selectedRate ? Number(selectedRate.amount || 0) * Number(rooms || 1) * nights : 0;

  async function loadStatus() {
    try {
      const r = await fetch(`${API}/status`, { cache: "no-store" });
      const j = await r.json();
      setStatus(j);
    } catch {}
  }

  async function loadDestinations() {
    try {
      const r = await fetch(`${API}/api/real-catalog/destinations`, {
        cache: "no-store"
      });
      const j = await r.json();
      setDestinations(j.countries || []);
    } catch {}
  }

  async function searchHotels(customCountry = country, customCity = city) {
    if (!customCountry || !customCity) {
      alert("Choose a country and destination first.");
      return;
    }

    setLoading(true);
    setHotels([]);
    setSelectedHotel(null);

    try {
      const q = new URLSearchParams({
        country: customCountry,
        city: customCity,
        checkin,
        checkout,
        guests: String(guests),
        rooms: String(rooms),
        limit: "80"
      });

      const r = await fetch(`${API}/api/hotels/search?${q.toString()}`, {
        cache: "no-store"
      });
      const j = await r.json();

      setHotels(j.hotels || []);
      setView("results");
    } catch {
      setHotels([]);
      alert("Hotels could not be loaded. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  async function sendReservation() {
    if (!selectedHotel) {
      alert("Choose a hotel first.");
      return;
    }

    const body = {
      ...reservation,
      hotel_id: selectedHotel.hotel_id,
      hotel_name: selectedHotel.hotel_name || selectedHotel.name,
      destination: `${city}, ${country}`,
      checkin,
      checkout,
      guests,
      rooms,
      rate_key: selectedRate?.rate_key || "",
      amount: total,
      currency: selectedRate?.currency || "GBP"
    };

    const r = await fetch(`${API}/reservation-request`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body)
    });

    const j = await r.json();
    alert(j.message || "Reservation request sent.");
  }

  async function loginPartner() {
    if (!partnerToken.trim()) {
      alert("Paste your partner token first.");
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
      await loadPartnerDashboard(j.jwt);
      await loadSync(j.jwt);
      alert("Partner connected.");
    } catch {
      alert("Partner login failed.");
    }
  }

  async function loadPartnerDashboard(jwt = partnerJwt) {
    if (!jwt) return;

    const r = await fetch(`${API}/api/admin/dashboard`, {
      headers: { Authorization: `Bearer ${jwt}` }
    });

    const j = await r.json();
    setPartnerDashboard(j);
  }

  async function loadSync(jwt = partnerJwt) {
    if (!jwt) return;

    const r = await fetch(`${API}/api/sync/status`, {
      headers: { Authorization: `Bearer ${jwt}` }
    });

    const j = await r.json();
    setSyncStatus(j);
  }

  async function runSync() {
    if (!partnerJwt) {
      alert("Connect partner first.");
      return;
    }

    await fetch(`${API}/api/sync/run`, {
      method: "POST",
      headers: { Authorization: `Bearer ${partnerJwt}` }
    });

    await loadSync();
    await loadPartnerDashboard();
  }

  async function registerHotel() {
    const r = await fetch(`${API}/api/extranet/register`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(hotelRegister)
    });

    const j = await r.json();
    setHotelOnboarded(j);
  }

  function choosePopular(destinationCountry, destinationCity) {
    setCountry(destinationCountry);
    setCity(destinationCity);
    searchHotels(destinationCountry, destinationCity);
  }

  useEffect(() => {
    loadStatus();
    loadDestinations();
    const t = setInterval(loadStatus, 20000);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    if (selectedCountry && !city) {
      setCity(selectedCountry.cities?.[0]?.city || "");
    }
  }, [selectedCountry, city]);

  return (
    <div style={styles.page}>
      <Header setView={setView} />

      {view === "home" && (
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

          <PopularDestinations choosePopular={choosePopular} />

          <CustomerActions setView={setView} />
        </>
      )}

      {view === "results" && (
        <main style={styles.main}>
          <button style={styles.backBtn} onClick={() => setView("home")}>
            ← Back to search
          </button>

          <div style={styles.resultsLayout}>
            <section style={styles.resultsLeft}>
              <h2 style={styles.sectionTitle}>
                Stays in {city}, {country}
              </h2>

              <p style={styles.muted}>
                Choose a verified stay, review your full total, then continue with confidence.
              </p>

              <div style={styles.hotelGrid}>
                {hotels.map((h) => {
                  const rate = h.first_rate;
                  return (
                    <div
                      key={h.hotel_id}
                      style={{
                        ...styles.hotelCard,
                        borderColor:
                          selectedHotel?.hotel_id === h.hotel_id ? "#1d4ed8" : "#e5e7eb"
                      }}
                    >
                      {h.image_url ? (
                        <img src={h.image_url} style={styles.hotelImg} />
                      ) : (
                        <div style={styles.imageFallback}>MYSPACE HOTEL</div>
                      )}

                      <div style={styles.hotelBody}>
                        <div style={styles.badgeRow}>
                          <span style={styles.badge}>Verified stay</span>
                          <span style={styles.greenBadge}>
                            {rate ? "Current price available" : "Confirm price"}
                          </span>
                        </div>

                        <h3 style={styles.hotelName}>{h.hotel_name || h.name}</h3>
                        <p style={styles.hotelMeta}>
                          {h.address || h.area || city}, {country}
                        </p>

                        <div style={styles.priceBox}>
                          {rate ? (
                            <>
                              <span>From</span>
                              <strong>
                                {rate.currency || "GBP"} {money(rate.amount)}
                              </strong>
                              <small>per room / night</small>
                            </>
                          ) : (
                            <strong>Price confirmation required</strong>
                          )}
                        </div>

                        <button style={styles.selectBtn} onClick={() => setSelectedHotel(h)}>
                          Select this stay
                        </button>
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
                  <p style={styles.muted}>
                    {city}, {country}
                  </p>

                  <div style={styles.totalBox}>
                    <span>Stay total</span>
                    <strong>
                      {selectedRate?.currency || "GBP"} {money(total)}
                    </strong>
                    <small>
                      {nights} night{nights > 1 ? "s" : ""} | {guests} guests | {rooms} room{rooms > 1 ? "s" : ""}
                    </small>
                  </div>

                  <input
                    style={styles.input}
                    placeholder="Full name"
                    value={reservation.customer_name}
                    onChange={(e) =>
                      setReservation({ ...reservation, customer_name: e.target.value })
                    }
                  />

                  <input
                    style={styles.input}
                    placeholder="Email address"
                    value={reservation.customer_email}
                    onChange={(e) =>
                      setReservation({ ...reservation, customer_email: e.target.value })
                    }
                  />

                  <input
                    style={styles.input}
                    placeholder="Phone number"
                    value={reservation.customer_phone}
                    onChange={(e) =>
                      setReservation({ ...reservation, customer_phone: e.target.value })
                    }
                  />

                  <textarea
                    style={styles.textarea}
                    placeholder="Special request"
                    value={reservation.note}
                    onChange={(e) =>
                      setReservation({ ...reservation, note: e.target.value })
                    }
                  />

                  <button style={styles.primary} onClick={sendReservation}>
                    Continue reservation
                  </button>
                </>
              ) : (
                <div style={styles.notice}>Select a stay to continue.</div>
              )}
            </aside>
          </div>
        </main>
      )}

      {view === "enterprise" && (
        <Enterprise
          status={status}
          partnerId={partnerId}
          setPartnerId={setPartnerId}
          partnerToken={partnerToken}
          setPartnerToken={setPartnerToken}
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

      <Footer setView={setView} status={status} />
    </div>
  );
}

function Header({ setView }) {
  return (
    <header style={styles.header}>
      <div style={styles.logoWrap}>
        <div style={styles.logoIcon}>✦</div>
        <div>
          <div style={styles.logo}>MYSPACE HOTEL</div>
          <div style={styles.tagline}>Stay with clarity</div>
        </div>
      </div>

      <nav style={styles.topNav}>
        <button onClick={() => setView("home")} style={styles.topLink}>Stays</button>
        <button onClick={() => setView("home")} style={styles.topLink}>Destinations</button>
        <button onClick={() => setView("home")} style={styles.topLink}>Help</button>
        <button onClick={() => setView("enterprise")} style={styles.loginBtn}>
          Hotel / Partner Login
        </button>
      </nav>
    </header>
  );
}

function Hero(props) {
  const {
    country,
    city,
    setCountry,
    setCity,
    destinations,
    selectedCountry,
    checkin,
    checkout,
    setCheckin,
    setCheckout,
    guests,
    rooms,
    setGuests,
    setRooms,
    searchHotels,
    loading
  } = props;

  return (
    <section style={styles.hero}>
      <div style={styles.heroOverlay}>
        <div style={styles.heroContent}>
          <h1 style={styles.heroTitle}>Find your perfect stay.</h1>
          <p style={styles.heroText}>
            Search verified hotels and apartments, review your full stay total, and book with confidence.
          </p>

          <div style={styles.heroPoints}>
            <span>Best available stays</span>
            <span>Secure reservation flow</span>
            <span>Destination support</span>
          </div>
        </div>

        <div style={styles.memberBox}>
          <strong>Member benefits</strong>
          <span>Clear pricing, helpful travel guidance, and trusted reservation support.</span>
        </div>

        <div style={styles.searchBar}>
          <div style={styles.searchCell}>
            <label>Country</label>
            <select
              value={country}
              onChange={(e) => {
                setCountry(e.target.value);
                setCity("");
              }}
            >
              <option value="">Choose country</option>
              {destinations.map((c) => (
                <option key={c.country} value={c.country}>
                  {c.country}
                </option>
              ))}
            </select>
          </div>

          <div style={styles.searchCell}>
            <label>Destination</label>
            <select value={city} onChange={(e) => setCity(e.target.value)}>
              <option value="">Choose city</option>
              {(selectedCountry?.cities || []).map((c) => (
                <option key={c.city} value={c.city}>
                  {c.city}
                </option>
              ))}
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

          <button style={styles.searchBtn} onClick={searchHotels}>
            {loading ? "Searching..." : "Search hotels"}
          </button>
        </div>
      </div>
    </section>
  );
}

function TrustBar() {
  return (
    <section style={styles.trustBar}>
      <div>
        <strong>Free cancellation options</strong>
        <span>Shown where available</span>
      </div>
      <div>
        <strong>Secure booking</strong>
        <span>Your reservation details are protected</span>
      </div>
      <div>
        <strong>Destination help</strong>
        <span>Useful local support before arrival</span>
      </div>
    </section>
  );
}

function PopularDestinations({ choosePopular }) {
  const items = [
    ["United Kingdom", "London", "London", "https://images.unsplash.com/photo-1513635269975-59663e0ac1ad?auto=format&fit=crop&w=900&q=80"],
    ["France", "Paris", "Paris", "https://images.unsplash.com/photo-1502602898657-3e91760cbb34?auto=format&fit=crop&w=900&q=80"],
    ["United Arab Emirates", "Dubai", "Dubai", "https://images.unsplash.com/photo-1512453979798-5ea266f8880c?auto=format&fit=crop&w=900&q=80"],
    ["United States", "New York", "New York", "https://images.unsplash.com/photo-1485871981521-5b1fd3805eee?auto=format&fit=crop&w=900&q=80"],
    ["Spain", "Barcelona", "Barcelona", "https://images.unsplash.com/photo-1539037116277-4db20889f2d4?auto=format&fit=crop&w=900&q=80"]
  ];

  return (
    <section style={styles.main}>
      <h2 style={styles.sectionTitle}>Popular destinations</h2>

      <div style={styles.destinationGrid}>
        {items.map(([country, city, title, img]) => (
          <button
            key={`${country}-${city}`}
            style={{ ...styles.destCard, backgroundImage: `url(${img})` }}
            onClick={() => choosePopular(country, city)}
          >
            <div>
              <strong>{title}</strong>
              <span>{country}</span>
            </div>
          </button>
        ))}
      </div>
    </section>
  );
}

function CustomerActions({ setView }) {
  return (
    <section style={styles.actionStrip}>
      <button onClick={() => setView("enterprise")}>
        <strong>Hotel Extranet</strong>
        <span>Manage your property</span>
      </button>
      <button onClick={() => setView("enterprise")}>
        <strong>PMS Sync Status</strong>
        <span>Live connection monitoring</span>
      </button>
      <button onClick={() => setView("enterprise")}>
        <strong>Hotel Onboarding</strong>
        <span>Join MySpace Hotel</span>
      </button>
      <button onClick={() => setView("enterprise")}>
        <strong>Partner API</strong>
        <span>Integration tools</span>
      </button>
    </section>
  );
}

function Enterprise(props) {
  const {
    status,
    partnerId,
    setPartnerId,
    partnerToken,
    setPartnerToken,
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

  return (
    <main style={styles.enterprisePage}>
      <button style={styles.backBtn} onClick={() => window.location.reload()}>
        ← Back to customer homepage
      </button>

      <h1 style={styles.enterpriseTitle}>Hotel Extranet & Partner Operations</h1>
      <p style={styles.muted}>
        PMS monitoring, hotel onboarding, partner authentication and enterprise readiness tools.
      </p>

      <div style={styles.enterpriseGrid}>
        <div style={styles.enterpriseCard}>
          <h2>Platform Status</h2>
          <MetricGrid
            data={{
              Hotels: status?.hotels_loaded,
              Countries: status?.countries,
              Cities: status?.cities,
              Inventory: status?.inventory_syncs,
              Rates: status?.rate_syncs,
              Reservations: status?.reservation_syncs,
              Failures: status?.sync_failures || 0
            }}
          />
        </div>

        <div style={styles.enterpriseCard}>
          <h2>Partner Login</h2>
          <input style={styles.input} value={partnerId} onChange={(e) => setPartnerId(e.target.value)} />
          <input
            style={styles.input}
            placeholder="Paste partner token"
            type="password"
            value={partnerToken}
            onChange={(e) => setPartnerToken(e.target.value)}
          />
          <button style={styles.primary} onClick={loginPartner}>Connect partner</button>
        </div>

        <div style={styles.enterpriseCard}>
          <h2>PMS Sync</h2>
          <MetricGrid
            data={{
              Partners: syncStatus?.partners?.length || 0,
              Inventory: syncStatus?.inventory_syncs || 0,
              Rates: syncStatus?.rate_syncs || 0,
              Reservations: syncStatus?.reservation_syncs || 0,
              Failures: syncStatus?.failures || 0
            }}
          />
          <button style={styles.primary} onClick={runSync}>Run sync now</button>
          <button style={styles.secondary} onClick={() => loadSync()}>Refresh</button>
        </div>

        <div style={styles.enterpriseCard}>
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
          <button style={styles.primary} onClick={registerHotel}>Activate hotel</button>
          {hotelOnboarded && <pre style={styles.pre}>{JSON.stringify(hotelOnboarded, null, 2)}</pre>}
        </div>

        <div style={styles.enterpriseCardWide}>
          <h2>Partner Dashboard</h2>
          <pre style={styles.pre}>{JSON.stringify(partnerDashboard || {}, null, 2)}</pre>
        </div>
      </div>
    </main>
  );
}

function MetricGrid({ data }) {
  return (
    <div style={styles.metricGrid}>
      {Object.entries(data).map(([k, v]) => (
        <div key={k} style={styles.metricBox}>
          <span>{k}</span>
          <strong>{v ?? "-"}</strong>
        </div>
      ))}
    </div>
  );
}

function Footer({ setView, status }) {
  return (
    <footer style={styles.footer}>
      <div>
        <strong>MySpace Hotel</strong>
        <span> Book with clarity before you arrive.</span>
      </div>
      <div style={styles.footerLinks}>
        <button onClick={() => setView("enterprise")}>Partners</button>
        <button onClick={() => setView("enterprise")}>Developers</button>
        <button onClick={() => setView("enterprise")}>Status</button>
        <span>{status?.api === "online" || status?.ok ? "System online" : "Checking system"}</span>
      </div>
    </footer>
  );
}

const styles = {
  page: {
    minHeight: "100vh",
    background: "#f6f8fc",
    color: "#07142f",
    fontFamily: "Inter, Arial, sans-serif"
  },
  header: {
    height: 88,
    background: "#fff",
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    padding: "0 44px",
    boxShadow: "0 2px 18px rgba(15, 23, 42, 0.08)",
    position: "sticky",
    top: 0,
    zIndex: 10
  },
  logoWrap: { display: "flex", alignItems: "center", gap: 12 },
  logoIcon: {
    width: 42,
    height: 42,
    borderRadius: 14,
    display: "grid",
    placeItems: "center",
    background: "#fff3c4",
    color: "#b77900",
    fontSize: 24,
    fontWeight: 900
  },
  logo: { fontSize: 26, fontWeight: 900, letterSpacing: 1 },
  tagline: { fontSize: 13, color: "#64748b", fontWeight: 700 },
  topNav: { display: "flex", alignItems: "center", gap: 20 },
  topLink: {
    border: 0,
    background: "transparent",
    fontWeight: 800,
    fontSize: 15,
    cursor: "pointer",
    color: "#0f172a"
  },
  loginBtn: {
    border: "1px solid #cbd5e1",
    background: "#fff",
    color: "#1747b8",
    borderRadius: 14,
    padding: "12px 18px",
    fontWeight: 900,
    cursor: "pointer"
  },
  hero: {
    minHeight: 470,
    backgroundImage:
      "linear-gradient(90deg, rgba(255,255,255,.96), rgba(255,255,255,.72), rgba(255,255,255,.28)), url('https://images.unsplash.com/photo-1507525428034-b723cf961d3e?auto=format&fit=crop&w=2000&q=80')",
    backgroundSize: "cover",
    backgroundPosition: "center",
    position: "relative"
  },
  heroOverlay: { maxWidth: 1420, margin: "0 auto", padding: "68px 42px 40px" },
  heroContent: { maxWidth: 720 },
  heroTitle: { fontSize: 58, lineHeight: 1.02, margin: 0, letterSpacing: -2, color: "#07142f" },
  heroText: { fontSize: 22, color: "#334155", marginTop: 16, fontWeight: 700 },
  heroPoints: { display: "flex", flexWrap: "wrap", gap: 14, marginTop: 28 },
  memberBox: {
    position: "absolute",
    right: 60,
    top: 145,
    width: 310,
    background: "rgba(255,255,255,.92)",
    borderRadius: 22,
    padding: 24,
    display: "flex",
    flexDirection: "column",
    gap: 10,
    boxShadow: "0 20px 45px rgba(15,23,42,.16)"
  },
  searchBar: {
    marginTop: 60,
    background: "#fff",
    borderRadius: 24,
    display: "grid",
    gridTemplateColumns: "1.2fr 1.2fr .9fr .9fr .9fr 1fr",
    gap: 0,
    boxShadow: "0 26px 60px rgba(15,23,42,.18)",
    overflow: "hidden"
  },
  searchCell: {
    padding: 18,
    borderRight: "1px solid #e2e8f0",
    display: "flex",
    flexDirection: "column",
    gap: 8
  },
  inlineSmall: { display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 },
  searchBtn: {
    border: 0,
    background: "#1857df",
    color: "#fff",
    fontSize: 16,
    fontWeight: 900,
    cursor: "pointer"
  },
  trustBar: {
    maxWidth: 1320,
    margin: "24px auto",
    background: "#fff",
    borderRadius: 20,
    padding: 20,
    display: "grid",
    gridTemplateColumns: "repeat(3, 1fr)",
    gap: 20,
    boxShadow: "0 15px 45px rgba(15,23,42,.08)"
  },
  main: { maxWidth: 1420, margin: "0 auto", padding: "28px 42px" },
  sectionTitle: { fontSize: 30, margin: "0 0 16px" },
  destinationGrid: { display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: 16 },
  destCard: {
    height: 220,
    border: 0,
    borderRadius: 18,
    backgroundSize: "cover",
    backgroundPosition: "center",
    color: "#fff",
    textAlign: "left",
    padding: 22,
    display: "flex",
    alignItems: "flex-end",
    cursor: "pointer",
    boxShadow: "0 14px 35px rgba(15,23,42,.18)",
    overflow: "hidden"
  },
  actionStrip: {
    maxWidth: 1320,
    margin: "28px auto 48px",
    background: "#fff",
    borderRadius: 18,
    padding: 16,
    display: "grid",
    gridTemplateColumns: "repeat(4, 1fr)",
    gap: 12,
    boxShadow: "0 15px 45px rgba(15,23,42,.08)"
  },
  resultsLayout: { display: "grid", gridTemplateColumns: "1fr 390px", gap: 24 },
  resultsLeft: { minWidth: 0 },
  hotelGrid: { display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(295px, 1fr))", gap: 18 },
  hotelCard: {
    background: "#fff",
    border: "2px solid #e5e7eb",
    borderRadius: 22,
    overflow: "hidden",
    boxShadow: "0 16px 40px rgba(15,23,42,.08)"
  },
  hotelImg: { width: "100%", height: 190, objectFit: "cover" },
  imageFallback: {
    height: 190,
    display: "grid",
    placeItems: "center",
    background: "#dbeafe",
    color: "#1747b8",
    fontWeight: 900
  },
  hotelBody: { padding: 18 },
  badgeRow: { display: "flex", justifyContent: "space-between", gap: 8 },
  badge: { background: "#dbeafe", color: "#1747b8", borderRadius: 999, padding: "7px 10px", fontWeight: 900, fontSize: 12 },
  greenBadge: { background: "#dcfce7", color: "#166534", borderRadius: 999, padding: "7px 10px", fontWeight: 900, fontSize: 12 },
  hotelName: { fontSize: 22, marginBottom: 8 },
  hotelMeta: { color: "#64748b", fontWeight: 700 },
  priceBox: {
    background: "#f8fafc",
    borderRadius: 14,
    padding: 14,
    display: "flex",
    flexDirection: "column",
    gap: 4,
    marginBottom: 12
  },
  selectBtn: {
    width: "100%",
    border: 0,
    borderRadius: 14,
    background: "#f6c744",
    padding: 14,
    fontWeight: 900,
    cursor: "pointer"
  },
  reservePanel: {
    position: "sticky",
    top: 110,
    alignSelf: "start",
    background: "#fff",
    borderRadius: 24,
    padding: 24,
    boxShadow: "0 18px 50px rgba(15,23,42,.12)"
  },
  totalBox: {
    background: "#dcfce7",
    borderRadius: 18,
    padding: 18,
    display: "flex",
    flexDirection: "column",
    gap: 6,
    margin: "18px 0"
  },
  input: {
    width: "100%",
    padding: 13,
    borderRadius: 13,
    border: "1px solid #cbd5e1",
    marginBottom: 12,
    fontWeight: 700
  },
  textarea: {
    width: "100%",
    minHeight: 88,
    padding: 13,
    borderRadius: 13,
    border: "1px solid #cbd5e1",
    marginBottom: 12
  },
  primary: {
    width: "100%",
    border: 0,
    background: "#1857df",
    color: "#fff",
    padding: 14,
    borderRadius: 14,
    fontWeight: 900,
    cursor: "pointer",
    marginBottom: 10
  },
  secondary: {
    width: "100%",
    border: "1px solid #cbd5e1",
    background: "#fff",
    color: "#1747b8",
    padding: 14,
    borderRadius: 14,
    fontWeight: 900,
    cursor: "pointer"
  },
  backBtn: { border: 0, background: "#e0ecff", color: "#1747b8", padding: "12px 16px", borderRadius: 14, fontWeight: 900, cursor: "pointer", marginBottom: 18 },
  muted: { color: "#64748b", fontWeight: 700 },
  notice: { background: "#f8fafc", borderRadius: 14, padding: 14 },
  enterprisePage: { maxWidth: 1400, margin: "0 auto", padding: 42 },
  enterpriseTitle: { fontSize: 46, margin: 0 },
  enterpriseGrid: { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(330px, 1fr))", gap: 18, marginTop: 24 },
  enterpriseCard: { background: "#fff", borderRadius: 24, padding: 22, boxShadow: "0 15px 45px rgba(15,23,42,.08)" },
  enterpriseCardWide: { background: "#fff", borderRadius: 24, padding: 22, gridColumn: "1 / -1", boxShadow: "0 15px 45px rgba(15,23,42,.08)" },
  metricGrid: { display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 10 },
  metricBox: { background: "#f1f5f9", borderRadius: 14, padding: 14, display: "flex", flexDirection: "column", gap: 6 },
  pre: { background: "#0f172a", color: "#dbeafe", padding: 16, borderRadius: 16, overflow: "auto", maxHeight: 360 },
  footer: {
    background: "#fff",
    borderTop: "1px solid #e2e8f0",
    padding: "22px 42px",
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center"
  },
  footerLinks: { display: "flex", gap: 14, alignItems: "center" }
};
