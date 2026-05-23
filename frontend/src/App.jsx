cd C:\frontend\hotel-booking-app\frontend

@'
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

export default function App() {
  const [page, setPage] = useState("customer");
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
  const [loadingHotels, setLoadingHotels] = useState(false);
  const [reservation, setReservation] = useState({
    customer_name: "",
    customer_email: "",
    customer_phone: "",
    note: ""
  });

  const [partnerToken, setPartnerToken] = useState("");
  const [partnerId, setPartnerId] = useState("oracle-ohip");
  const [partnerJwt, setPartnerJwt] = useState("");
  const [partnerDashboard, setPartnerDashboard] = useState(null);
  const [syncStatus, setSyncStatus] = useState(null);
  const [mappings, setMappings] = useState([]);
  const [mappingForm, setMappingForm] = useState({
    partner_name: "oracle-ohip",
    mapping_type: "hotel",
    external_hotel_id: "",
    myspace_hotel_id: "",
    external_room_code: "",
    myspace_room_id: "",
    external_rate_code: "",
    myspace_rate_id: "",
    status: "active",
    notes: ""
  });

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

  const countryObj = useMemo(
    () => destinations.find((x) => x.country === country),
    [destinations, country]
  );

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

  async function searchHotels() {
    if (!country || !city) return;

    setLoadingHotels(true);
    setSelectedHotel(null);

    try {
      const q = new URLSearchParams({
        country,
        city,
        checkin,
        checkout,
        guests: String(guests),
        rooms: String(rooms),
        limit: "80"
      });

      const r = await fetch(`${API}/api/hotels/search?${q.toString()}`);
      const j = await r.json();

      setHotels(j.hotels || []);
    } catch {
      setHotels([]);
    } finally {
      setLoadingHotels(false);
    }
  }

  async function sendReservation() {
    if (!selectedHotel) return alert("Choose a hotel first.");

    const rate = selectedHotel.first_rate || {};

    const body = {
      ...reservation,
      hotel_id: selectedHotel.hotel_id,
      hotel_name: selectedHotel.hotel_name || selectedHotel.name,
      destination: `${city}, ${country}`,
      checkin,
      checkout,
      guests,
      rooms,
      rate_key: rate.rate_key || "",
      amount: rate.amount || 0,
      currency: rate.currency || "GBP"
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
    try {
      const r = await fetch(`${API}/api/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ partner_id: partnerId, token: partnerToken })
      });

      const j = await r.json();

      if (!j.ok) throw new Error("Login failed");

      setPartnerJwt(j.jwt);
      await loadPartnerDashboard(j.jwt);
      await loadSync(j.jwt);
      await loadMappings(j.jwt);
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
    if (!partnerJwt) return alert("Login first.");

    await fetch(`${API}/api/sync/run`, {
      method: "POST",
      headers: { Authorization: `Bearer ${partnerJwt}` }
    });

    await loadSync();
    await loadPartnerDashboard();
  }

  async function loadMappings(jwt = partnerJwt) {
    if (!jwt) return;

    const r = await fetch(`${API}/api/mappings`, {
      headers: { Authorization: `Bearer ${jwt}` }
    });

    const j = await r.json();
    setMappings(j.mappings || []);
  }

  async function saveMapping() {
    if (!partnerJwt) return alert("Login first.");

    await fetch(`${API}/api/mappings`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${partnerJwt}`
      },
      body: JSON.stringify(mappingForm)
    });

    await loadMappings();
    alert("Mapping saved.");
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

  useEffect(() => {
    loadStatus();
    loadDestinations();
    const t = setInterval(loadStatus, 20000);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    if (countryObj && !city) {
      setCity(countryObj.cities?.[0]?.city || "");
    }
  }, [countryObj]);

  return (
    <div style={styles.page}>
      <header style={styles.header}>
        <div>
          <div style={styles.brand}>MYSPACE HOTEL</div>
          <h1 style={styles.h1}>Booking + Enterprise PMS Platform</h1>
          <p style={styles.sub}>
            Customer booking, hotel extranet, PMS mapping, partner API, sync monitoring and onboarding automation.
          </p>
        </div>

        <div style={styles.live}>
          {status?.api === "online" || status?.ok ? "LIVE" : "CHECKING"}
        </div>
      </header>

      <nav style={styles.nav}>
        {[
          ["customer", "Customer Booking"],
          ["dashboard", "Partner Dashboard"],
          ["sync", "PMS Sync"],
          ["mapping", "PMS Mapping"],
          ["onboarding", "Hotel Onboarding"],
          ["analytics", "Enterprise Status"]
        ].map(([id, label]) => (
          <button
            key={id}
            onClick={() => setPage(id)}
            style={{
              ...styles.navBtn,
              background: page === id ? "#f6c744" : "#10233f",
              color: page === id ? "#08101f" : "#fff"
            }}
          >
            {label}
          </button>
        ))}
      </nav>

      {page === "customer" && (
        <section style={styles.grid2}>
          <div style={styles.card}>
            <h2>Find a Stay</h2>

            <label>Country</label>
            <select
              style={styles.input}
              value={country}
              onChange={(e) => {
                setCountry(e.target.value);
                setCity("");
              }}
            >
              <option value="">Choose country</option>
              {destinations.map((c) => (
                <option key={c.country} value={c.country}>
                  {c.country} — {c.city_count} cities
                </option>
              ))}
            </select>

            <label>City</label>
            <select
              style={styles.input}
              value={city}
              onChange={(e) => setCity(e.target.value)}
            >
              <option value="">Choose city</option>
              {(countryObj?.cities || []).map((c) => (
                <option key={c.city} value={c.city}>
                  {c.city} — {c.catalog_hotels || 0} hotels
                </option>
              ))}
            </select>

            <div style={styles.inline}>
              <div>
                <label>Check-in</label>
                <input style={styles.input} type="date" value={checkin} onChange={(e) => setCheckin(e.target.value)} />
              </div>
              <div>
                <label>Check-out</label>
                <input style={styles.input} type="date" value={checkout} onChange={(e) => setCheckout(e.target.value)} />
              </div>
            </div>

            <div style={styles.inline}>
              <div>
                <label>Guests</label>
                <input style={styles.input} type="number" value={guests} onChange={(e) => setGuests(e.target.value)} />
              </div>
              <div>
                <label>Rooms</label>
                <input style={styles.input} type="number" value={rooms} onChange={(e) => setRooms(e.target.value)} />
              </div>
            </div>

            <button style={styles.primary} onClick={searchHotels}>
              {loadingHotels ? "Loading..." : "Search Hotels"}
            </button>
          </div>

          <div style={styles.card}>
            <h2>Reservation Request</h2>

            <input style={styles.input} placeholder="Customer name" value={reservation.customer_name} onChange={(e) => setReservation({ ...reservation, customer_name: e.target.value })} />
            <input style={styles.input} placeholder="Customer email" value={reservation.customer_email} onChange={(e) => setReservation({ ...reservation, customer_email: e.target.value })} />
            <input style={styles.input} placeholder="Customer phone" value={reservation.customer_phone} onChange={(e) => setReservation({ ...reservation, customer_phone: e.target.value })} />
            <textarea style={styles.textarea} placeholder="Special request" value={reservation.note} onChange={(e) => setReservation({ ...reservation, note: e.target.value })} />

            <div style={styles.notice}>
              Selected: {selectedHotel ? selectedHotel.hotel_name || selectedHotel.name : "No hotel selected"}
            </div>

            <button style={styles.primary} onClick={sendReservation}>
              Send Reservation Request
            </button>
          </div>

          <div style={styles.cardWide}>
            <h2>Available Hotels</h2>

            <div style={styles.hotelGrid}>
              {hotels.map((h) => {
                const rate = h.first_rate;
                return (
                  <div key={h.hotel_id} style={styles.hotelCard}>
                    {h.image_url && <img src={h.image_url} style={styles.hotelImg} />}
                    <h3>{h.hotel_name || h.name}</h3>
                    <p>{h.address || h.area || city}, {country}</p>
                    <p>{h.rating || "Verified stay"}</p>
                    <strong>
                      {rate ? `${rate.currency || "GBP"} ${money(rate.amount)}` : "Price confirmation required"}
                    </strong>
                    <button style={styles.smallBtn} onClick={() => setSelectedHotel(h)}>
                      Select Hotel
                    </button>
                  </div>
                );
              })}
            </div>
          </div>
        </section>
      )}

      {page === "dashboard" && (
        <section style={styles.grid2}>
          <PartnerLogin partnerId={partnerId} setPartnerId={setPartnerId} partnerToken={partnerToken} setPartnerToken={setPartnerToken} loginPartner={loginPartner} />

          <MetricsCard title="Partner Metrics" data={partnerDashboard} />

          <div style={styles.cardWide}>
            <button style={styles.primary} onClick={() => loadPartnerDashboard()}>
              Refresh Partner Dashboard
            </button>
          </div>
        </section>
      )}

      {page === "sync" && (
        <section style={styles.grid2}>
          <PartnerLogin partnerId={partnerId} setPartnerId={setPartnerId} partnerToken={partnerToken} setPartnerToken={setPartnerToken} loginPartner={loginPartner} />

          <div style={styles.card}>
            <h2>PMS Sync Control</h2>
            <button style={styles.primary} onClick={runSync}>Run Sync Now</button>
            <button style={styles.secondary} onClick={() => loadSync()}>Refresh Sync Status</button>
          </div>

          <div style={styles.cardWide}>
            <h2>Live PMS Sync</h2>
            <div style={styles.metricRow}>
              <Metric label="Partners" value={syncStatus?.partners?.length || 0} />
              <Metric label="Inventory" value={syncStatus?.inventory_syncs || 0} />
              <Metric label="Rates" value={syncStatus?.rate_syncs || 0} />
              <Metric label="Reservations" value={syncStatus?.reservation_syncs || 0} />
              <Metric label="Failures" value={syncStatus?.failures || 0} />
            </div>
          </div>
        </section>
      )}

      {page === "mapping" && (
        <section style={styles.grid2}>
          <PartnerLogin partnerId={partnerId} setPartnerId={setPartnerId} partnerToken={partnerToken} setPartnerToken={setPartnerToken} loginPartner={loginPartner} />

          <div style={styles.card}>
            <h2>Create PMS Mapping</h2>

            {Object.keys(mappingForm).map((k) => (
              <input
                key={k}
                style={styles.input}
                placeholder={k}
                value={mappingForm[k]}
                onChange={(e) => setMappingForm({ ...mappingForm, [k]: e.target.value })}
              />
            ))}

            <button style={styles.primary} onClick={saveMapping}>
              Save Mapping
            </button>
          </div>

          <div style={styles.cardWide}>
            <h2>Saved Mappings</h2>
            <Table rows={mappings.slice(0, 20)} />
          </div>
        </section>
      )}

      {page === "onboarding" && (
        <section style={styles.grid2}>
          <div style={styles.card}>
            <h2>Hotel Registration</h2>

            {Object.keys(hotelRegister).map((k) => (
              <input
                key={k}
                style={styles.input}
                placeholder={k}
                value={hotelRegister[k]}
                onChange={(e) => setHotelRegister({ ...hotelRegister, [k]: e.target.value })}
              />
            ))}

            <button style={styles.primary} onClick={registerHotel}>
              Activate Hotel
            </button>
          </div>

          <div style={styles.card}>
            <h2>Onboarding Result</h2>
            {hotelOnboarded ? <pre style={styles.pre}>{JSON.stringify(hotelOnboarded, null, 2)}</pre> : <p>No hotel activated yet.</p>}
          </div>
        </section>
      )}

      {page === "analytics" && (
        <section style={styles.grid2}>
          <MetricsCard title="Live Enterprise Backend" data={status} />
          <div style={styles.card}>
            <h2>Production Targets</h2>
            <ul>
              <li>Hotel extranet</li>
              <li>PMS credential vault</li>
              <li>Signed webhooks</li>
              <li>Redis queues</li>
              <li>PostgreSQL migration</li>
              <li>OTA reconciliation</li>
              <li>Payout ledger</li>
              <li>Enterprise analytics</li>
            </ul>
          </div>
        </section>
      )}
    </div>
  );
}

function PartnerLogin({ partnerId, setPartnerId, partnerToken, setPartnerToken, loginPartner }) {
  return (
    <div style={styles.card}>
      <h2>Partner Login</h2>
      <input style={styles.input} placeholder="Partner ID" value={partnerId} onChange={(e) => setPartnerId(e.target.value)} />
      <input style={styles.input} placeholder="Partner token" value={partnerToken} onChange={(e) => setPartnerToken(e.target.value)} />
      <button style={styles.primary} onClick={loginPartner}>Connect Partner</button>
    </div>
  );
}

function Metric({ label, value }) {
  return (
    <div style={styles.metricBox}>
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function MetricsCard({ title, data }) {
  return (
    <div style={styles.card}>
      <h2>{title}</h2>
      {data ? (
        Object.entries(data).slice(0, 18).map(([k, v]) => (
          <div key={k} style={styles.metric}>
            <span>{k}</span>
            <strong>{typeof v === "object" ? JSON.stringify(v).slice(0, 50) : String(v)}</strong>
          </div>
        ))
      ) : (
        <p>No data loaded yet.</p>
      )}
    </div>
  );
}

function Table({ rows }) {
  if (!rows.length) return <p>No rows yet.</p>;
  const keys = Object.keys(rows[0]).slice(0, 8);
  return (
    <div style={{ overflowX: "auto" }}>
      <table style={styles.table}>
        <thead>
          <tr>{keys.map((k) => <th key={k}>{k}</th>)}</tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i}>{keys.map((k) => <td key={k}>{String(r[k] || "").slice(0, 70)}</td>)}</tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

const styles = {
  page: { minHeight: "100vh", background: "#07111f", color: "white", fontFamily: "Arial", padding: 24 },
  header: { display: "flex", justifyContent: "space-between", gap: 20, alignItems: "center", marginBottom: 22 },
  brand: { color: "#f6c744", letterSpacing: 8, fontWeight: 900 },
  h1: { fontSize: 42, margin: "8px 0" },
  sub: { color: "#b7c4d8", maxWidth: 900 },
  live: { background: "#10b981", color: "#04111f", padding: "12px 18px", borderRadius: 14, fontWeight: 900 },
  nav: { display: "flex", flexWrap: "wrap", gap: 10, marginBottom: 22 },
  navBtn: { border: 0, borderRadius: 14, padding: "12px 16px", fontWeight: 900, cursor: "pointer" },
  grid2: { display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(360px,1fr))", gap: 18 },
  card: { background: "#0f1b2d", border: "1px solid #1c3152", borderRadius: 22, padding: 20 },
  cardWide: { background: "#0f1b2d", border: "1px solid #1c3152", borderRadius: 22, padding: 20, gridColumn: "1 / -1" },
  input: { width: "100%", padding: 13, borderRadius: 12, border: "1px solid #2d4568", background: "#081321", color: "white", marginBottom: 12 },
  textarea: { width: "100%", padding: 13, minHeight: 90, borderRadius: 12, border: "1px solid #2d4568", background: "#081321", color: "white", marginBottom: 12 },
  inline: { display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 },
  primary: { width: "100%", background: "#2563eb", color: "white", border: 0, padding: 14, borderRadius: 12, fontWeight: 900, cursor: "pointer", marginBottom: 10 },
  secondary: { width: "100%", background: "#10233f", color: "white", border: "1px solid #2d4568", padding: 14, borderRadius: 12, fontWeight: 900, cursor: "pointer" },
  notice: { background: "#081321", borderRadius: 12, padding: 12, marginBottom: 12 },
  hotelGrid: { display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(260px,1fr))", gap: 16 },
  hotelCard: { background: "#081321", borderRadius: 18, padding: 14 },
  hotelImg: { width: "100%", height: 150, objectFit: "cover", borderRadius: 14 },
  smallBtn: { marginTop: 12, width: "100%", background: "#f6c744", border: 0, padding: 12, borderRadius: 12, fontWeight: 900 },
  metric: { display: "flex", justifyContent: "space-between", gap: 12, background: "#081321", borderRadius: 12, padding: 12, marginBottom: 8 },
  metricRow: { display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(180px,1fr))", gap: 12 },
  metricBox: { background: "#081321", borderRadius: 14, padding: 18, display: "flex", flexDirection: "column", gap: 8 },
  pre: { background: "#081321", padding: 14, borderRadius: 12, overflowX: "auto" },
  table: { width: "100%", borderCollapse: "collapse", color: "white" }
};
'@ | Set-Content .\src\App.jsx -Encoding UTF8

npm run build