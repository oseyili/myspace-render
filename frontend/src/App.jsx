cd C:\frontend\hotel-booking-app\frontend

@'
import React, { useEffect, useMemo, useState } from "react";

const API =
  import.meta.env.VITE_API_BASE ||
  import.meta.env.VITE_API_BASE_URL ||
  "https://myspace-hotel-backend.onrender.com";

const CURRENCIES = ["GBP", "USD", "EUR", "NGN", "AED", "CAD", "AUD", "ZAR", "CHF", "JPY", "INR"];

const FX_FALLBACK = {
  GBP: 1,
  USD: 1.27,
  EUR: 1.17,
  NGN: 1900,
  AED: 4.66,
  CAD: 1.72,
  AUD: 1.92,
  ZAR: 23.2,
  CHF: 1.11,
  JPY: 197,
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

function fallbackConvert(amount, from, to) {
  if (!amount || from === to) return Number(amount || 0);
  if (!FX_FALLBACK[from] || !FX_FALLBACK[to]) return Number(amount || 0);
  return (Number(amount) / FX_FALLBACK[from]) * FX_FALLBACK[to];
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
  const [paying, setPaying] = useState(false);

  const [displayCurrency, setDisplayCurrency] = useState("GBP");
  const [convertedTotal, setConvertedTotal] = useState(0);
  const [convertedRate, setConvertedRate] = useState(0);

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
  const [loginError, setLoginError] = useState("");

  const selectedCountry = useMemo(
    () => destinations.find((x) => x.country === country),
    [destinations, country]
  );

  const nights = nightsBetween(checkin, checkout);
  const selectedRate = selectedHotel?.first_rate || null;
  const baseCurrency = selectedRate?.currency || "GBP";
  const baseRate = Number(selectedRate?.amount || 0);
  const stayTotal = baseRate * Number(rooms || 1) * nights;

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

  async function convertMoney() {
    const amount = stayTotal || 0;

    if (!amount) {
      setConvertedTotal(0);
      setConvertedRate(0);
      return;
    }

    try {
      const q = new URLSearchParams({
        amount: String(amount),
        from: baseCurrency,
        to: displayCurrency,
        from_currency: baseCurrency,
        to_currency: displayCurrency
      });

      const r = await fetch(`${API}/api/currency/convert?${q.toString()}`, { cache: "no-store" });
      const j = await r.json();

      if (j.ok && Number(j.converted)) {
        setConvertedTotal(Number(j.converted));
        setConvertedRate(Number(j.rate || 0));
        return;
      }
    } catch {}

    const converted = fallbackConvert(amount, baseCurrency, displayCurrency);
    setConvertedTotal(converted);
    setConvertedRate(amount ? converted / amount : 0);
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

      const r = await fetch(`${API}/api/hotels/search?${q.toString()}`, { cache: "no-store" });
      const j = await r.json();

      setHotels(j.hotels || []);
      setView("results");
    } catch {
      alert("Hotels could not be loaded. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  async function reserveAndPay() {
    if (!selectedHotel) {
      alert("Choose a hotel first.");
      return;
    }

    if (!reservation.customer_name || !reservation.customer_email || !reservation.customer_phone) {
      alert("Enter customer name, email and phone number before continuing.");
      return;
    }

    setPaying(true);

    try {
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

      const r = await fetch(`${API}/reservation-request`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body)
      });

      const j = await r.json();

      if (j.payment_url) {
        window.location.href = j.payment_url;
        return;
      }

      alert(
        `${j.message || "Reservation request received."}\n\nReference: ${
          j.reservation_code || j.booking_reference || "Created"
        }`
      );
    } catch {
      alert("Payment/reservation could not be started. Please try again.");
    } finally {
      setPaying(false);
    }
  }

  async function loginPartner() {
    setLoginError("");

    if (!partnerToken.trim()) {
      setLoginError("Enter your partner token.");
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
    } catch {
      setLoginError("Partner login failed. Check your partner ID and token.");
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
    if (!partnerJwt) return;
    await fetch(`${API}/api/sync/run`, {
      method: "POST",
      headers: { Authorization: `Bearer ${partnerJwt}` }
    });
    await loadSync();
    await loadPartnerDashboard();
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
    convertMoney();
  }, [stayTotal, baseCurrency, displayCurrency]);

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
          <PartnerStrip setView={setView} />
          <CustomerFooter setView={setView} />
        </>
      )}

      {view === "results" && (
        <main style={styles.main}>
          <button style={styles.backBtn} onClick={() => setView("home")}>← Back to search</button>

          <div style={styles.resultsLayout}>
            <section>
              <h2 style={styles.sectionTitle}>Stays in {city}, {country}</h2>
              <p style={styles.muted}>Choose a verified stay and review your full stay total before continuing.</p>

              <div style={styles.hotelGrid}>
                {hotels.map((h) => {
                  const rate = h.first_rate;
                  return (
                    <div key={h.hotel_id} style={{ ...styles.hotelCard, borderColor: selectedHotel?.hotel_id === h.hotel_id ? "#1857df" : "#e5e7eb" }}>
                      {h.image_url ? <img src={h.image_url} style={styles.hotelImg} /> : <div style={styles.imageFallback}>MYSPACE HOTEL</div>}

                      <div style={styles.hotelBody}>
                        <div style={styles.badgeRow}>
                          <span style={styles.badge}>Verified stay</span>
                          <span style={styles.greenBadge}>{rate ? "Current price available" : "Confirm price"}</span>
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
                  <p style={styles.muted}>{city}, {country}</p>

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
                    <small>
                      {baseCurrency !== displayCurrency
                        ? `Estimated conversion rate: 1 ${baseCurrency} = ${money(convertedRate)} ${displayCurrency}`
                        : "Same currency"}
                    </small>
                  </div>

                  <input style={styles.input} placeholder="Full name" value={reservation.customer_name} onChange={(e) => setReservation({ ...reservation, customer_name: e.target.value })} />
                  <input style={styles.input} placeholder="Email address" value={reservation.customer_email} onChange={(e) => setReservation({ ...reservation, customer_email: e.target.value })} />
                  <input style={styles.input} placeholder="Phone number" value={reservation.customer_phone} onChange={(e) => setReservation({ ...reservation, customer_phone: e.target.value })} />
                  <textarea style={styles.textarea} placeholder="Special request" value={reservation.note} onChange={(e) => setReservation({ ...reservation, note: e.target.value })} />

                  <button style={styles.payBtn} onClick={reserveAndPay}>
                    {paying ? "Starting secure payment..." : selectedRate ? "Reserve / Pay securely" : "Request price confirmation"}
                  </button>

                  <p style={styles.safeNote}>You will review the booking before any payment is completed.</p>
                </>
              ) : (
                <div style={styles.notice}>Select a stay to continue.</div>
              )}
            </aside>
          </div>
        </main>
      )}

      {view === "partnerLogin" && (
        <PartnerLoginPage
          setView={setView}
          partnerId={partnerId}
          setPartnerId={setPartnerId}
          partnerToken={partnerToken}
          setPartnerToken={setPartnerToken}
          loginPartner={loginPartner}
          loginError={loginError}
          partnerJwt={partnerJwt}
          partnerDashboard={partnerDashboard}
          syncStatus={syncStatus}
          runSync={runSync}
          loadSync={loadSync}
        />
      )}
    </div>
  );
}

function Header({ setView }) {
  return (
    <header style={styles.header}>
      <button style={styles.logoWrap} onClick={() => setView("home")}>
        <div style={styles.logoIcon}>✦</div>
        <div>
          <div style={styles.logo}>MYSPACE HOTEL</div>
          <div style={styles.tagline}>Stay with clarity</div>
        </div>
      </button>

      <nav style={styles.topNav}>
        <button onClick={() => setView("home")} style={styles.topLink}>Stays</button>
        <button onClick={() => setView("home")} style={styles.topLink}>Destinations</button>
        <button onClick={() => setView("home")} style={styles.topLink}>Offers</button>
        <button onClick={() => setView("home")} style={styles.topLink}>Help</button>
        <button onClick={() => setView("partnerLogin")} style={styles.loginBtn}>Hotel / Partner Login</button>
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
        <p style={styles.heroText}>Search 100,000+ hotels and apartments worldwide.</p>

        <div style={styles.heroPoints}>
          <span>Best price guidance</span>
          <span>Free cancellation options</span>
          <span>24/7 support</span>
        </div>

        <div style={styles.searchBar}>
          <div style={styles.searchCell}>
            <label>Country</label>
            <select value={country} onChange={(e) => { setCountry(e.target.value); setCity(""); }}>
              <option value="">Select country</option>
              {destinations.map((c) => <option key={c.country} value={c.country}>{c.country}</option>)}
            </select>
          </div>

          <div style={styles.searchCell}>
            <label>Destination</label>
            <select value={city} onChange={(e) => setCity(e.target.value)}>
              <option value="">Select city</option>
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
            <label>Guests & Rooms</label>
            <div style={styles.inlineSmall}>
              <input type="number" min="1" value={guests} onChange={(e) => setGuests(e.target.value)} />
              <input type="number" min="1" value={rooms} onChange={(e) => setRooms(e.target.value)} />
            </div>
          </div>

          <button style={styles.searchBtn} onClick={searchHotels}>{loading ? "Searching..." : "Search hotels"}</button>
        </div>
      </div>
    </section>
  );
}

function TrustBar() {
  return (
    <section style={styles.trustBar}>
      <div><strong>Free cancellation</strong><span>On selected rooms</span></div>
      <div><strong>Pay later options</strong><span>Book now, pay later where available</span></div>
      <div><strong>Secure booking</strong><span>Your details are handled safely</span></div>
    </section>
  );
}

function PopularDestinations({ choosePopular }) {
  const items = [
    ["United Arab Emirates", "Dubai", "Dubai", "https://images.unsplash.com/photo-1512453979798-5ea266f8880c?auto=format&fit=crop&w=900&q=80", "From £89"],
    ["United Kingdom", "London", "London", "https://images.unsplash.com/photo-1513635269975-59663e0ac1ad?auto=format&fit=crop&w=900&q=80", "From £75"],
    ["France", "Paris", "Paris", "https://images.unsplash.com/photo-1502602898657-3e91760cbb34?auto=format&fit=crop&w=900&q=80", "From £78"],
    ["United States", "New York", "New York", "https://images.unsplash.com/photo-1485871981521-5b1fd3805eee?auto=format&fit=crop&w=900&q=80", "From £95"],
    ["Indonesia", "Bali", "Bali", "https://images.unsplash.com/photo-1537996194471-e657df975ab4?auto=format&fit=crop&w=900&q=80", "From £68"]
  ];

  return (
    <section style={styles.main}>
      <div style={styles.sectionHeader}>
        <h2 style={styles.sectionTitle}>Popular destinations</h2>
      </div>

      <div style={styles.destinationGrid}>
        {items.map(([country, city, title, img, price]) => (
          <button key={`${country}-${city}`} style={{ ...styles.destCard, backgroundImage: `linear-gradient(180deg, rgba(0,0,0,.05), rgba(0,0,0,.58)), url(${img})` }} onClick={() => choosePopular(country, city)}>
            <div><strong>{title}</strong><span>{country}</span></div>
            <em>{price}</em>
          </button>
        ))}
      </div>
    </section>
  );
}

function PartnerStrip({ setView }) {
  return (
    <section style={styles.partnerStrip}>
      <div>
        <strong>Are you a hotel or partner?</strong>
        <span>Access your dashboard, onboarding and PMS tools after secure login.</span>
      </div>
      <button onClick={() => setView("partnerLogin")}>Partner Login</button>
      <button onClick={() => setView("partnerLogin")}>Hotel Extranet</button>
      <button onClick={() => setView("partnerLogin")}>PMS Sync Status</button>
      <button onClick={() => setView("partnerLogin")}>Hotel Onboarding</button>
    </section>
  );
}

function PartnerLoginPage({ setView, partnerId, setPartnerId, partnerToken, setPartnerToken, loginPartner, loginError, partnerJwt, partnerDashboard, syncStatus, runSync, loadSync }) {
  const loggedIn = Boolean(partnerJwt);

  return (
    <main style={styles.partnerPage}>
      <button style={styles.backBtn} onClick={() => setView("home")}>← Back to customer homepage</button>

      <h1 style={styles.partnerTitle}>Hotel & Partner Login</h1>
      <p style={styles.muted}>Secure access for hotels, PMS providers, channel managers and distribution partners.</p>

      {!loggedIn && (
        <section style={styles.loginPanel}>
          <h2>Secure Partner Access</h2>
          <input style={styles.input} value={partnerId} onChange={(e) => setPartnerId(e.target.value)} placeholder="Partner ID" />
          <input style={styles.input} type="password" value={partnerToken} onChange={(e) => setPartnerToken(e.target.value)} placeholder="Partner token" />
          {loginError && <div style={styles.error}>{loginError}</div>}
          <button style={styles.primary} onClick={loginPartner}>Login securely</button>
        </section>
      )}

      {loggedIn && (
        <section style={styles.partnerGrid}>
          <div style={styles.partnerCard}><h2>Partner Dashboard</h2><MetricGrid data={partnerDashboard || {}} /></div>
          <div style={styles.partnerCard}>
            <h2>PMS Sync Control</h2>
            <MetricGrid data={{
              Partners: syncStatus?.partners?.length || 0,
              Inventory: syncStatus?.inventory_syncs || 0,
              Rates: syncStatus?.rate_syncs || 0,
              Reservations: syncStatus?.reservation_syncs || 0,
              Failures: syncStatus?.failures || 0
            }} />
            <button style={styles.primary} onClick={runSync}>Run sync now</button>
            <button style={styles.secondary} onClick={() => loadSync()}>Refresh</button>
          </div>
        </section>
      )}
    </main>
  );
}

function MetricGrid({ data }) {
  return (
    <div style={styles.metricGrid}>
      {Object.entries(data).slice(0, 12).map(([k, v]) => (
        <div key={k} style={styles.metricBox}>
          <span>{k}</span>
          <strong>{typeof v === "object" ? JSON.stringify(v).slice(0, 30) : String(v ?? "-")}</strong>
        </div>
      ))}
    </div>
  );
}

function CustomerFooter({ setView }) {
  return (
    <footer style={styles.footer}>
      <span>© 2026 MySpace Hotel. All rights reserved.</span>
      <div>
        <button>About Us</button>
        <button>Contact</button>
        <button>Privacy Policy</button>
        <button>Terms & Conditions</button>
        <button onClick={() => setView("partnerLogin")}>Partners</button>
      </div>
    </footer>
  );
}

const styles = {
  page: { minHeight: "100vh", background: "#ffffff", color: "#07142f", fontFamily: "Inter, Arial, sans-serif" },
  header: { height: 88, background: "#fff", display: "flex", alignItems: "center", justifyContent: "space-between", padding: "0 52px", boxShadow: "0 2px 18px rgba(15,23,42,.08)", position: "sticky", top: 0, zIndex: 10 },
  logoWrap: { display: "flex", alignItems: "center", gap: 12, border: 0, background: "transparent", cursor: "pointer", textAlign: "left" },
  logoIcon: { width: 44, height: 44, borderRadius: 14, display: "grid", placeItems: "center", background: "#fff3c4", color: "#b77900", fontSize: 24, fontWeight: 900 },
  logo: { fontSize: 28, fontWeight: 900, letterSpacing: 1 },
  tagline: { fontSize: 13, color: "#64748b", fontWeight: 700 },
  topNav: { display: "flex", alignItems: "center", gap: 26 },
  topLink: { border: 0, background: "transparent", fontWeight: 900, fontSize: 16, cursor: "pointer", color: "#0f172a" },
  loginBtn: { border: "1px solid #cbd5e1", background: "#fff", color: "#1747b8", borderRadius: 14, padding: "13px 20px", fontWeight: 900, cursor: "pointer" },
  hero: { minHeight: 500, backgroundImage: "linear-gradient(90deg, rgba(255,255,255,.98), rgba(255,255,255,.75), rgba(255,255,255,.2)), url('https://images.unsplash.com/photo-1507525428034-b723cf961d3e?auto=format&fit=crop&w=2000&q=80')", backgroundSize: "cover", backgroundPosition: "center" },
  heroContent: { maxWidth: 1420, margin: "0 auto", padding: "70px 52px 40px" },
  heroTitle: { fontSize: 58, lineHeight: 1.02, margin: 0, letterSpacing: -2, color: "#07142f" },
  heroText: { fontSize: 22, color: "#334155", marginTop: 14, fontWeight: 700 },
  heroPoints: { display: "flex", flexWrap: "wrap", gap: 28, marginTop: 28, color: "#0f3f99", fontWeight: 900 },
  searchBar: { marginTop: 34, background: "#fff", borderRadius: 24, display: "grid", gridTemplateColumns: "1.15fr 1.15fr .9fr .9fr .9fr 1fr", boxShadow: "0 26px 60px rgba(15,23,42,.18)", overflow: "hidden" },
  searchCell: { padding: 18, borderRight: "1px solid #e2e8f0", display: "flex", flexDirection: "column", gap: 8 },
  inlineSmall: { display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 },
  searchBtn: { border: 0, background: "#1857df", color: "#fff", fontSize: 16, fontWeight: 900, cursor: "pointer" },
  trustBar: { maxWidth: 1320, margin: "-22px auto 24px", background: "#fff", borderRadius: 20, padding: 22, display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 20, boxShadow: "0 15px 45px rgba(15,23,42,.08)", position: "relative", zIndex: 2 },
  main: { maxWidth: 1420, margin: "0 auto", padding: "28px 52px" },
  sectionHeader: { display: "flex", justifyContent: "space-between", alignItems: "center" },
  sectionTitle: { fontSize: 30, margin: "0 0 18px" },
  destinationGrid: { display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: 16 },
  destCard: { height: 220, border: 0, borderRadius: 18, backgroundSize: "cover", backgroundPosition: "center", color: "#fff", textAlign: "left", padding: 22, display: "flex", justifyContent: "space-between", alignItems: "flex-end", cursor: "pointer", boxShadow: "0 14px 35px rgba(15,23,42,.18)" },
  partnerStrip: { maxWidth: 1320, margin: "30px auto 48px", background: "#f8fbff", borderRadius: 20, padding: 18, display: "grid", gridTemplateColumns: "1.5fr repeat(4, 1fr)", gap: 12, boxShadow: "0 15px 45px rgba(15,23,42,.08)" },
  resultsLayout: { display: "grid", gridTemplateColumns: "1fr 390px", gap: 24 },
  hotelGrid: { display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(295px, 1fr))", gap: 18 },
  hotelCard: { background: "#fff", border: "2px solid #e5e7eb", borderRadius: 22, overflow: "hidden", boxShadow: "0 16px 40px rgba(15,23,42,.08)" },
  hotelImg: { width: "100%", height: 190, objectFit: "cover" },
  imageFallback: { height: 190, display: "grid", placeItems: "center", background: "#dbeafe", color: "#1747b8", fontWeight: 900 },
  hotelBody: { padding: 18 },
  badgeRow: { display: "flex", justifyContent: "space-between", gap: 8 },
  badge: { background: "#dbeafe", color: "#1747b8", borderRadius: 999, padding: "7px 10px", fontWeight: 900, fontSize: 12 },
  greenBadge: { background: "#dcfce7", color: "#166534", borderRadius: 999, padding: "7px 10px", fontWeight: 900, fontSize: 12 },
  hotelName: { fontSize: 22 },
  hotelMeta: { color: "#64748b", fontWeight: 700 },
  priceBox: { background: "#f8fafc", borderRadius: 14, padding: 14, display: "flex", flexDirection: "column", gap: 4, marginBottom: 12 },
  selectBtn: { width: "100%", border: 0, borderRadius: 14, background: "#f6c744", padding: 14, fontWeight: 900, cursor: "pointer" },
  reservePanel: { position: "sticky", top: 110, alignSelf: "start", background: "#fff", borderRadius: 24, padding: 24, boxShadow: "0 18px 50px rgba(15,23,42,.12)" },
  totalBox: { background: "#dcfce7", borderRadius: 18, padding: 18, display: "flex", flexDirection: "column", gap: 6, margin: "18px 0" },
  converterBox: { background: "#eff6ff", borderRadius: 18, padding: 16, display: "flex", flexDirection: "column", gap: 6, marginBottom: 14 },
  input: { width: "100%", padding: 13, borderRadius: 13, border: "1px solid #cbd5e1", marginBottom: 12, fontWeight: 700 },
  textarea: { width: "100%", minHeight: 88, padding: 13, borderRadius: 13, border: "1px solid #cbd5e1", marginBottom: 12 },
  primary: { width: "100%", border: 0, background: "#1857df", color: "#fff", padding: 14, borderRadius: 14, fontWeight: 900, cursor: "pointer", marginBottom: 10 },
  secondary: { width: "100%", border: "1px solid #cbd5e1", background: "#fff", color: "#1747b8", padding: 14, borderRadius: 14, fontWeight: 900, cursor: "pointer" },
  payBtn: { width: "100%", border: 0, background: "#10b981", color: "#052e1c", padding: 15, borderRadius: 14, fontWeight: 950, cursor: "pointer", marginBottom: 10 },
  safeNote: { fontSize: 13, color: "#64748b", fontWeight: 700 },
  backBtn: { border: 0, background: "#e0ecff", color: "#1747b8", padding: "12px 16px", borderRadius: 14, fontWeight: 900, cursor: "pointer", marginBottom: 18 },
  muted: { color: "#64748b", fontWeight: 700 },
  notice: { background: "#f8fafc", borderRadius: 14, padding: 14 },
  partnerPage: { maxWidth: 1320, margin: "0 auto", padding: 52 },
  partnerTitle: { fontSize: 48, marginBottom: 8 },
  loginPanel: { background: "#fff", maxWidth: 560, borderRadius: 24, padding: 28, marginTop: 26, boxShadow: "0 18px 50px rgba(15,23,42,.12)" },
  error: { background: "#fee2e2", color: "#991b1b", borderRadius: 12, padding: 12, marginBottom: 12, fontWeight: 900 },
  partnerGrid: { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(330px, 1fr))", gap: 18, marginTop: 26 },
  partnerCard: { background: "#fff", borderRadius: 24, padding: 22, boxShadow: "0 15px 45px rgba(15,23,42,.08)" },
  metricGrid: { display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 10 },
  metricBox: { background: "#f1f5f9", borderRadius: 14, padding: 14, display: "flex", flexDirection: "column", gap: 6 },
  footer: { borderTop: "1px solid #e2e8f0", padding: "26px 52px", display: "flex", justifyContent: "space-between", alignItems: "center" }
};
'@ | Set-Content .\src\App.jsx -Encoding UTF8

npm run build