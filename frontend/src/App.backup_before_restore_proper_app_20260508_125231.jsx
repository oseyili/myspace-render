import React, { useEffect, useMemo, useState } from "react";

const API_BASE = "http://127.0.0.1:5050";

function safe(v) { return String(v || "").trim(); }
function cityLabel(city) { return safe(city) || "your destination"; }

function imageProxy(hotel) {
  const raw = safe(hotel.image_url || hotel.image);
  const upper = raw.toUpperCase();
  if (!raw.startsWith("http")) return "";
  if (upper.includes("PLACEHOLDER") || upper.includes("UNSPLASH") || upper.includes("PEXELS") || upper.includes("PIXABAY")) return "";
  return `${API_BASE}/image-proxy?url=${encodeURIComponent(raw)}`;
}

function HotelImage({ hotel }) {
  const [failed, setFailed] = useState(false);
  const img = imageProxy(hotel);
  if (!img || failed) {
    return <div style={styles.imagePending}><b>Trusted image pending</b><span>No fake hotel images shown.</span></div>;
  }
  return <img src={img} alt={hotel.hotel_name || "Hotel"} style={styles.hotelImage} loading="lazy" onError={() => setFailed(true)} />;
}

export default function App() {
  const today = new Date().toISOString().slice(0, 10);
  const tomorrow = new Date(Date.now() + 86400000).toISOString().slice(0, 10);

  const [destinations, setDestinations] = useState([]);
  const [country, setCountry] = useState("");
  const [city, setCity] = useState("");
  const [area, setArea] = useState("");
  const [keyword, setKeyword] = useState("");
  const [checkin, setCheckin] = useState(today);
  const [checkout, setCheckout] = useState(tomorrow);
  const [guests, setGuests] = useState(2);
  const [rooms, setRooms] = useState(1);
  const [hotels, setHotels] = useState([]);
  const [selectedHotel, setSelectedHotel] = useState(null);
  const [targetCurrency, setTargetCurrency] = useState("USD");
  const [convertedPrice, setConvertedPrice] = useState(null);
  const [customerName, setCustomerName] = useState("");
  const [customerEmail, setCustomerEmail] = useState("");
  const [customerPhone, setCustomerPhone] = useState("");
  const [note, setNote] = useState("");
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);
  const [checkingLivePrice, setCheckingLivePrice] = useState(false);

  useEffect(() => {
    fetch(`${API_BASE}/api/real-catalog/destinations`)
      .then((r) => r.json())
      .then((data) => {
        const list = Array.isArray(data.countries) ? data.countries : [];
        setDestinations(list);
        const preferred = list.find((x) => x.country === "Nigeria") || list.find((x) => x.country === "United Kingdom") || list[0];
        if (preferred) {
          setCountry(preferred.country);
          setCity(preferred.cities?.[0]?.city || "");
        }
      })
      .catch(() => setMessage("Destinations are temporarily unavailable."));
  }, []);

  const cityOptions = useMemo(() => destinations.find((x) => x.country === country)?.cities || [], [destinations, country]);

  async function searchHotels() {
    setLoading(true);
    setSelectedHotel(null);
    setConvertedPrice(null);
    setMessage("");
    try {
      const params = new URLSearchParams({ country, city, area, keyword, limit: "120" });
      const data = await fetch(`${API_BASE}/api/real-catalog/search?${params}`).then((r) => r.json());
      const list = Array.isArray(data.hotels) ? data.hotels : [];
      setHotels(list);
      setMessage(list.length ? `${list.length} live-rate stays found in ${cityLabel(city)}.` : "No real inventory found. Add supplier inventory; fake hotels are blocked.");
    } catch {
      setMessage("Search is temporarily unavailable.");
    } finally {
      setLoading(false);
    }
  }

  async function checkLivePriceForHotel(hotel) {
    setSelectedHotel(hotel);
    setConvertedPrice(null);
    setCheckingLivePrice(true);
    setMessage("Refreshing live rate for selected stay...");
    try {
      const params = new URLSearchParams({
        hotel_id: hotel.hotel_id || hotel.id || "",
        hotel_name: hotel.hotel_name || hotel.name || "",
        destination_code: city,
        amount: String(hotel.price || hotel.first_rate?.display_amount || ""),
        checkin,
        checkout,
        guests: String(guests),
        rooms: String(rooms)
      });
      const data = await fetch(`${API_BASE}/api/hotels/selected-live-price-v2?${params}`).then((r) => r.json());
      const updated = {
        ...hotel,
        live_payment_ready: Boolean(data.live_payment_ready),
        price_status: data.price_status || hotel.price_status,
        first_rate: data.first_rate || hotel.first_rate,
        price: data.amount || hotel.price,
        currency: data.currency || hotel.currency
      };
      setSelectedHotel(updated);
      setHotels((current) => current.map((x) => String(x.hotel_id || x.id) === String(hotel.hotel_id || hotel.id) ? updated : x));
      setMessage("Live rate refreshed. Currency converter is ready.");
    } catch {
      setMessage("Live rate check failed. You can still send a reservation request.");
    } finally {
      setCheckingLivePrice(false);
    }
  }

  async function convertSelectedPrice() {
    if (!selectedHotel) return setMessage("Choose a stay first.");
    const amount = selectedHotel.price || selectedHotel.first_rate?.display_amount;
    const from = selectedHotel.currency || selectedHotel.first_rate?.display_currency;
    if (!amount || !from) return setMessage("No selected hotel price is available to convert.");
    try {
      const params = new URLSearchParams({ amount: String(amount), from, to: targetCurrency });
      const data = await fetch(`${API_BASE}/api/currency/convert?${params}`).then((r) => r.json());
      if (!data.ok) return setMessage(data.message || "Currency conversion failed.");
      setConvertedPrice(data);
      setMessage(`${data.from} ${data.amount} converts to approximately ${data.to} ${data.converted}.`);
    } catch {
      setMessage("Currency converter is temporarily unavailable.");
    }
  }

  async function sendRequest() {
    if (!selectedHotel) return setMessage("Please choose a stay first.");
    if (!customerName.trim()) return setMessage("Please enter your full name.");
    if (!customerEmail.trim()) return setMessage("Please enter your email address.");
    const payload = {
      hotel_id: selectedHotel.hotel_id || selectedHotel.id,
      hotel_name: selectedHotel.hotel_name || selectedHotel.name,
      destination: `${cityLabel(city)}, ${country}`,
      checkin,
      checkout,
      guests,
      rooms,
      customer_name: customerName.trim(),
      customer_email: customerEmail.trim(),
      customer_phone: customerPhone.trim(),
      note: note.trim(),
      amount: selectedHotel.price || selectedHotel.first_rate?.display_amount || "",
      currency: selectedHotel.currency || selectedHotel.first_rate?.display_currency || ""
    };
    try {
      const data = await fetch(`${API_BASE}/reservation-request`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      }).then((r) => r.json());
      setMessage(data.message || "Your request has been received.");
    } catch {
      setMessage("We could not send your request. Please try again.");
    }
  }

  return (
    <div style={styles.page}>
      <section style={styles.left}>
        <div style={styles.brand}>MYSPACE HOTEL</div>
        <h1 style={styles.hero}>Professional hotel search with live-rate clarity.</h1>
        <p style={styles.sub}>Search real inventory, review local pricing, refresh live rates, convert currency, and continue with confidence.</p>

        <div style={styles.leftGrid}>
          <div style={styles.infoBox}><b>01 Real inventory only</b><span>No fake hotels, no generic placeholders, no misleading property images.</span></div>
          <div style={styles.infoBox}><b>02 Live-rate refresh</b><span>Selected stays show refreshed rate status before the customer continues.</span></div>
          <div style={styles.infoBox}><b>03 Local currency first</b><span>Prices stay in the destination currency unless payment currency is clearly labelled.</span></div>
          <div style={styles.infoBox}><b>04 Currency converter</b><span>Customers can estimate GBP, USD, EUR, NGN, AED, TRY, and CZK totals.</span></div>
          <div style={styles.infoBox}><b>05 Safer booking flow</b><span>Reservation requests capture guest details before payment confirmation.</span></div>
          <div style={styles.infoBox}><b>06 Hotel confidence checks</b><span>Area, room, board basis, image status, and live-rate status are visible.</span></div>
        </div>

        <div style={styles.destinationPanel}>
          <h2>{cityLabel(city)}, {country || "Worldwide"}</h2>
          <div style={styles.momentGrid}>
            <span>Hotels</span><span>Live rates</span><span>Local currency</span><span>Support</span>
          </div>
        </div>
      </section>

      <section style={styles.right}>
        <div style={styles.searchBox}>
          <h2 style={styles.heading}>Search available stays</h2>

          <select style={styles.input} value={country} onChange={(e) => {
            const next = e.target.value;
            const item = destinations.find((x) => x.country === next);
            setCountry(next);
            setCity(item?.cities?.[0]?.city || "");
          }}>
            {destinations.map((item) => <option key={item.country} value={item.country}>{item.country}</option>)}
          </select>

          <select style={styles.input} value={city} onChange={(e) => setCity(e.target.value)}>
            {cityOptions.map((item) => <option key={item.city} value={item.city}>{item.city}</option>)}
          </select>

          <input style={styles.input} value={area} onChange={(e) => setArea(e.target.value)} placeholder="Preferred area or neighbourhood" />
          <input style={styles.input} value={keyword} onChange={(e) => setKeyword(e.target.value)} placeholder="Hotel name, beach, business, family, luxury..." />

          <div style={styles.dateGrid}>
            <label>Check-in<input style={styles.input} type="date" value={checkin} onChange={(e) => setCheckin(e.target.value)} /></label>
            <label>Check-out<input style={styles.input} type="date" value={checkout} onChange={(e) => setCheckout(e.target.value)} /></label>
          </div>

          <div style={styles.choiceRow}><b>Guests</b>{[1,2,3,4,5,6].map((n) => <button key={n} style={guests === n ? styles.choiceActive : styles.choice} onClick={() => setGuests(n)}>{n}</button>)}</div>
          <div style={styles.choiceRow}><b>Rooms</b>{[1,2,3,4].map((n) => <button key={n} style={rooms === n ? styles.choiceActive : styles.choice} onClick={() => setRooms(n)}>{n}</button>)}</div>

          <button style={styles.goldButton} onClick={searchHotels} disabled={loading}>{loading ? "Searching..." : "Search hotels and live rates"}</button>
          {message && <div style={styles.notice}>{message}</div>}
        </div>

        <div style={styles.twoCol}>
          <div>
            <div style={styles.label}>HOTELS AND LIVE RATES</div>
            <h2>{hotels.length} stays in {cityLabel(city)}</h2>
            <div style={styles.results}>
              {hotels.map((hotel) => (
                <div key={hotel.hotel_id || hotel.id} style={selectedHotel?.hotel_id === hotel.hotel_id ? styles.cardSelected : styles.card} onClick={() => checkLivePriceForHotel(hotel)}>
                  <HotelImage hotel={hotel} />
                  <h3 style={styles.hotelName}>{hotel.hotel_name || hotel.name}</h3>
                  <p>{hotel.area || hotel.address || hotel.city}</p>
                  <div style={styles.priceLine}>{hotel.currency} {hotel.price}</div>
                  <div style={hotel.live_payment_ready ? styles.rateGood : styles.safeNote}>{hotel.price_status}</div>
                </div>
              ))}
            </div>
          </div>

          <aside style={styles.reserve}>
            <div style={styles.label}>SELECTED STAY</div>
            <h2>Review and continue</h2>
            <div style={styles.selectedBox}>{selectedHotel ? selectedHotel.hotel_name || selectedHotel.name : "Choose a hotel"}</div>

            {selectedHotel && (
              <div style={styles.livePanel}>
                <b>{checkingLivePrice ? "Refreshing live rate..." : "Live-rate summary"}</b>
                <p>{selectedHotel.currency} {selectedHotel.price || selectedHotel.first_rate?.display_amount}</p>
                <small>{selectedHotel.price_status}</small>
              </div>
            )}

            <div style={styles.converterBox}>
              <h3>Currency converter</h3>
              <select style={styles.input} value={targetCurrency} onChange={(e) => setTargetCurrency(e.target.value)}>
                {["GBP", "USD", "EUR", "NGN", "AED", "TRY", "CZK"].map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
              <button style={styles.darkButton} onClick={convertSelectedPrice}>Convert selected price</button>
              {convertedPrice && <div style={styles.converted}>{convertedPrice.from} {convertedPrice.amount} ≈ <b>{convertedPrice.to} {convertedPrice.converted}</b><br /><small>{convertedPrice.note}</small></div>}
            </div>

            <input style={styles.input} value={customerName} onChange={(e) => setCustomerName(e.target.value)} placeholder="Full name" />
            <input style={styles.input} value={customerEmail} onChange={(e) => setCustomerEmail(e.target.value)} placeholder="Email address" />
            <input style={styles.input} value={customerPhone} onChange={(e) => setCustomerPhone(e.target.value)} placeholder="Phone number" />
            <textarea style={styles.textarea} value={note} onChange={(e) => setNote(e.target.value)} placeholder="Special requests, arrival time, room needs, or questions" />
            <button style={styles.goldButton} onClick={sendRequest}>Send reservation request</button>
          </aside>
        </div>
      </section>
    </div>
  );
}

const styles = {
  page: { minHeight: "100vh", background: "#06101f", display: "grid", gridTemplateColumns: "1.02fr 1.08fr", gap: 26, padding: 24, fontFamily: "Arial, sans-serif", color: "#07111f" },
  left: { color: "white", borderRadius: 28, padding: 34, background: "linear-gradient(145deg, rgba(7,22,54,.98), rgba(20,84,190,.92))" },
  brand: { letterSpacing: 14, fontWeight: 900, marginBottom: 24 },
  hero: { fontSize: 46, lineHeight: 1.08, margin: 0 },
  sub: { fontSize: 18, lineHeight: 1.45, marginTop: 18 },
  leftGrid: { display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14, marginTop: 24 },
  infoBox: { background: "rgba(255,255,255,.12)", border: "1px solid rgba(255,255,255,.24)", borderRadius: 18, padding: 18, minHeight: 118, display: "flex", flexDirection: "column", gap: 10, fontSize: 16, lineHeight: 1.35 },
  destinationPanel: { background: "rgba(0,0,0,.25)", border: "1px solid rgba(255,255,255,.28)", borderRadius: 22, padding: 20, marginTop: 22, fontSize: 17 },
  momentGrid: { display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginTop: 12 },
  right: { background: "#eaf2fb", borderRadius: 28, padding: 28, maxHeight: "94vh", overflow: "auto" },
  searchBox: { background: "white", borderRadius: 20, padding: 20, marginBottom: 20 },
  heading: { fontSize: 32, margin: 0 },
  input: { width: "100%", boxSizing: "border-box", padding: "14px 16px", margin: "7px 0", borderRadius: 14, border: "1px solid #c6d5e8", fontSize: 16 },
  textarea: { width: "100%", boxSizing: "border-box", minHeight: 120, padding: "14px 16px", margin: "7px 0", borderRadius: 14, border: "1px solid #c6d5e8", fontSize: 16 },
  dateGrid: { display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 },
  choiceRow: { display: "flex", alignItems: "center", gap: 9, margin: "11px 0", fontSize: 16 },
  choice: { background: "white", border: "1px solid #c6d5e8", borderRadius: 10, padding: "10px 13px", cursor: "pointer" },
  choiceActive: { background: "#ffd34d", border: "1px solid #ffd34d", borderRadius: 10, padding: "10px 13px", cursor: "pointer", fontWeight: 900 },
  goldButton: { width: "100%", background: "#ffd34d", color: "#07111f", border: "2px solid #07111f", borderRadius: 16, padding: "16px 18px", fontSize: 19, fontWeight: 900, cursor: "pointer", marginTop: 16 },
  darkButton: { width: "100%", background: "#07111f", color: "white", border: 0, borderRadius: 14, padding: "14px 18px", fontSize: 16, fontWeight: 900, cursor: "pointer" },
  notice: { background: "#fff2be", padding: 14, borderRadius: 14, margin: "16px 0", fontWeight: 900 },
  twoCol: { display: "grid", gridTemplateColumns: "1.08fr .92fr", gap: 22, marginTop: 22 },
  label: { letterSpacing: 8, color: "#63738e", fontWeight: 900, margin: "14px 0" },
  results: { maxHeight: 740, overflow: "auto", paddingRight: 8 },
  card: { background: "white", borderRadius: 20, padding: 16, marginBottom: 16, border: "2px solid transparent", cursor: "pointer" },
  cardSelected: { background: "white", borderRadius: 20, padding: 16, marginBottom: 16, border: "4px solid #ffd34d", cursor: "pointer" },
  hotelImage: { width: "100%", height: 230, objectFit: "cover", borderRadius: 12 },
  imagePending: { height: 230, borderRadius: 12, background: "linear-gradient(135deg,#10254a,#1d4da8)", color: "white", display: "flex", flexDirection: "column", justifyContent: "center", gap: 8, padding: 22, boxSizing: "border-box" },
  hotelName: { fontSize: 25, marginBottom: 8 },
  priceLine: { fontSize: 24, fontWeight: 900, margin: "10px 0" },
  reserve: { position: "sticky", top: 0, alignSelf: "start" },
  selectedBox: { background: "#f3f7ff", borderRadius: 18, padding: 18, margin: "12px 0", fontWeight: 900, fontSize: 17 },
  livePanel: { background: "#e7f0ff", borderRadius: 18, padding: 16, margin: "12px 0", fontSize: 17 },
  safeNote: { background: "#fff0c2", borderRadius: 14, padding: 13, marginTop: 12, fontWeight: 800 },
  rateGood: { background: "#dff7e6", borderRadius: 14, padding: 12, margin: "12px 0", fontWeight: 900, color: "#075b24" },
  converterBox: { background: "#fff8d8", borderRadius: 18, padding: 16, margin: "16px 0", border: "2px solid #ffd34d" },
  converted: { marginTop: 12, fontSize: 18, lineHeight: 1.45 }
};
