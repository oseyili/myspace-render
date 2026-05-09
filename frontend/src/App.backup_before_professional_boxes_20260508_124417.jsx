import React, { useEffect, useMemo, useState } from "react";

const API_BASE = "http://127.0.0.1:5050";

function safe(v) {
  return String(v || "").trim();
}

function cityLabel(city) {
  return safe(city) || "your destination";
}

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
    return (
      <div style={styles.imagePending}>
        <b>Trusted image pending</b>
        <span>We avoid misleading hotel photos.</span>
      </div>
    );
  }

  return <img src={img} alt={hotel.hotel_name || hotel.name || "Hotel"} style={styles.hotelImage} loading="lazy" onError={() => setFailed(true)} />;
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
  const [customerName, setCustomerName] = useState("");
  const [customerEmail, setCustomerEmail] = useState("");
  const [customerPhone, setCustomerPhone] = useState("");
  const [note, setNote] = useState("");
  const [targetCurrency, setTargetCurrency] = useState("USD");
  const [convertedPrice, setConvertedPrice] = useState(null);
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);
  const [checkingLivePrice, setCheckingLivePrice] = useState(false);

  useEffect(() => {
    async function load() {
      try {
        const data = await fetch(`${API_BASE}/api/real-catalog/destinations`).then((r) => r.json());
        const list = Array.isArray(data.countries) ? data.countries : [];
        setDestinations(list);
        const preferred = list.find((x) => x.country === "Nigeria") || list.find((x) => x.country === "United Kingdom") || list[0];
        if (preferred) {
          setCountry(preferred.country);
          setCity(preferred.cities?.[0]?.city || "");
        }
      } catch {
        setMessage("Destinations are temporarily unavailable.");
      }
    }
    load();
  }, []);

  const cityOptions = useMemo(() => destinations.find((x) => x.country === country)?.cities || [], [destinations, country]);

  async function searchHotels() {
    setLoading(true);
    setSelectedHotel(null);
    setConvertedPrice(null);
    setMessage("");

    try {
      const params = new URLSearchParams({ country, city, area, keyword, limit: "120" });
      const data = await fetch(`${API_BASE}/api/real-catalog/search?${params.toString()}`).then((r) => r.json());
      const list = Array.isArray(data.hotels) ? data.hotels : [];
      setHotels(list);
      setMessage(list.length ? `${list.length} stays found in ${cityLabel(city)}.` : "No stays found. Try a nearby city, area, or keyword.");
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
    setMessage("Checking latest live room price...");

    try {
      const params = new URLSearchParams({
        hotel_id: hotel.hotel_id || hotel.id || "",
        hotel_name: hotel.hotel_name || hotel.name || "",
        destination_code: city,
        checkin,
        checkout,
        guests: String(guests),
        rooms: String(rooms),
      });

      const data = await fetch(`${API_BASE}/api/hotels/selected-live-price-v2?${params.toString()}`).then((r) => r.json());

      const updated = {
        ...hotel,
        live_payment_ready: Boolean(data.live_payment_ready),
        price_status: data.price_status || hotel.price_status || "",
        first_rate: data.first_rate || hotel.first_rate || null,
        price: data.amount || hotel.price || "",
        currency: data.currency || hotel.currency || "",
      };

      setSelectedHotel(updated);
      setHotels((current) => current.map((x) => String(x.hotel_id || x.id) === String(hotel.hotel_id || hotel.id) ? updated : x));
      setMessage(updated.live_payment_ready ? "Live price is ready. Currency converter is available below." : "Latest price will be confirmed before payment.");
    } catch {
      setMessage("Live price check failed. You can still send a reservation request.");
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
      const data = await fetch(`${API_BASE}/api/currency/convert?${params.toString()}`).then((r) => r.json());
      if (!data.ok) return setMessage(data.message || "Currency conversion failed.");
      setConvertedPrice(data);
      setMessage(`Currency converter updated: ${data.from} ${data.amount} ≈ ${data.to} ${data.converted}`);
    } catch {
      setMessage("Currency converter is temporarily unavailable.");
    }
  }

  async function sendRequest() {
    if (!selectedHotel) return setMessage("Please choose a stay first.");
    if (!customerName.trim()) return setMessage("Please enter your full name.");
    if (!customerEmail.trim()) return setMessage("Please enter your email address.");

    try {
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
      };

      const data = await fetch(`${API_BASE}/reservation-request`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
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
        <h1 style={styles.hero}>Find memorable stays worldwide with confidence.</h1>
        <p style={styles.sub}>Compare real properties, check local pricing, convert currencies, and continue with a clearer reservation request.</p>

        <div style={styles.destinationPanel}>
          <h2>{cityLabel(city)}, {country || "Worldwide"}</h2>
          <p>Plan where to stay, what to enjoy, where to eat, how to move safely, and how to access help if needed.</p>
          <div style={styles.momentGrid}>
            <span>Real stays</span>
            <span>Local currency</span>
            <span>Currency converter</span>
            <span>Reservation support</span>
          </div>
        </div>
      </section>

      <section style={styles.right}>
        <div style={styles.searchBox}>
          <h2 style={styles.heading}>Search destinations</h2>

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

          <button style={styles.goldButton} onClick={searchHotels} disabled={loading}>{loading ? "Searching stays..." : "Search available stays"}</button>
          {message && <div style={styles.notice}>{message}</div>}
        </div>

        <div style={styles.twoCol}>
          <div>
            <div style={styles.label}>AVAILABLE STAYS</div>
            <h2>{hotels.length} stays in {cityLabel(city)}</h2>
            <div style={styles.results}>
              {hotels.map((hotel) => (
                <div key={hotel.hotel_id || hotel.id} style={selectedHotel?.hotel_id === hotel.hotel_id ? styles.cardSelected : styles.card} onClick={() => checkLivePriceForHotel(hotel)}>
                  <HotelImage hotel={hotel} />
                  <h3 style={styles.hotelName}>{hotel.hotel_name || hotel.name}</h3>
                  <p>{hotel.area || hotel.address || hotel.city}</p>
                  <div style={styles.rateGood}>{hotel.currency || ""} {hotel.price || ""}</div>
                </div>
              ))}
            </div>
          </div>

          <aside style={styles.reserve}>
            <div style={styles.label}>RESERVATION REQUEST</div>
            <h2>Review and continue</h2>
            <div style={styles.selectedBox}>{selectedHotel ? (selectedHotel.hotel_name || selectedHotel.name) : "Choose a stay"}</div>

            {selectedHotel && (
              <div style={styles.safeNote}>
                {checkingLivePrice ? "Checking latest live room price..." : `Selected total: ${selectedHotel.currency || ""} ${selectedHotel.price || selectedHotel.first_rate?.display_amount || ""}`.trim()}
              </div>
            )}

            <div style={styles.converterBox}>
              <h3>Currency converter</h3>
              <select style={styles.input} value={targetCurrency} onChange={(e) => setTargetCurrency(e.target.value)}>
                {["GBP", "USD", "EUR", "NGN", "AED", "TRY", "CZK"].map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
              <button style={styles.darkButton} onClick={convertSelectedPrice}>Convert selected price</button>
              {convertedPrice && (
                <div style={styles.converted}>
                  {convertedPrice.from} {convertedPrice.amount} ≈ <b>{convertedPrice.to} {convertedPrice.converted}</b>
                  <br /><small>{convertedPrice.note}</small>
                </div>
              )}
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
  page: { minHeight: "100vh", background: "#06101f", display: "grid", gridTemplateColumns: "1.05fr 1fr", gap: 28, padding: 28, fontFamily: "Arial, sans-serif", color: "#07111f" },
  left: { color: "white", borderRadius: 28, padding: 44, background: "linear-gradient(145deg, rgba(10,36,92,.96), rgba(25,86,190,.92))" },
  brand: { letterSpacing: 18, fontWeight: 900, marginBottom: 40 },
  hero: { fontSize: 54, lineHeight: 1.12, margin: 0 },
  sub: { fontSize: 20, lineHeight: 1.55, marginTop: 26 },
  destinationPanel: { background: "rgba(0,0,0,.25)", border: "1px solid rgba(255,255,255,.28)", borderRadius: 22, padding: 24, marginTop: 38, fontSize: 18, lineHeight: 1.6 },
  momentGrid: { display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginTop: 18 },
  right: { background: "#eaf2fb", borderRadius: 28, padding: 36, maxHeight: "92vh", overflow: "auto" },
  searchBox: { background: "white", borderRadius: 20, padding: 22, marginBottom: 22 },
  heading: { fontSize: 34, margin: 0 },
  input: { width: "100%", boxSizing: "border-box", padding: "15px 17px", margin: "8px 0", borderRadius: 14, border: "1px solid #c6d5e8", fontSize: 17 },
  textarea: { width: "100%", boxSizing: "border-box", minHeight: 130, padding: "15px 17px", margin: "8px 0", borderRadius: 14, border: "1px solid #c6d5e8", fontSize: 17 },
  dateGrid: { display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 },
  choiceRow: { display: "flex", alignItems: "center", gap: 10, margin: "13px 0", fontSize: 17 },
  choice: { background: "white", border: "1px solid #c6d5e8", borderRadius: 10, padding: "11px 15px", cursor: "pointer", fontSize: 16 },
  choiceActive: { background: "#ffd34d", border: "1px solid #ffd34d", borderRadius: 10, padding: "11px 15px", cursor: "pointer", fontSize: 16, fontWeight: 900 },
  goldButton: { width: "100%", background: "#ffd34d", color: "#07111f", border: "2px solid #07111f", borderRadius: 16, padding: "17px 20px", fontSize: 21, fontWeight: 900, cursor: "pointer", marginTop: 20 },
  darkButton: { width: "100%", background: "#07111f", color: "white", border: 0, borderRadius: 14, padding: "14px 18px", fontSize: 17, fontWeight: 900, cursor: "pointer" },
  notice: { background: "#fff2be", padding: 16, borderRadius: 14, margin: "18px 0", fontWeight: 900 },
  twoCol: { display: "grid", gridTemplateColumns: "1.1fr 0.9fr", gap: 24, marginTop: 26 },
  label: { letterSpacing: 10, color: "#63738e", fontWeight: 900, margin: "18px 0" },
  results: { maxHeight: 760, overflow: "auto", paddingRight: 8 },
  card: { background: "white", borderRadius: 20, padding: 18, marginBottom: 18, border: "2px solid transparent", cursor: "pointer" },
  cardSelected: { background: "white", borderRadius: 20, padding: 18, marginBottom: 18, border: "4px solid #ffd34d", cursor: "pointer" },
  hotelImage: { width: "100%", height: 260, objectFit: "cover", borderRadius: 12 },
  imagePending: { height: 260, borderRadius: 12, background: "linear-gradient(135deg,#10254a,#1d4da8)", color: "white", display: "flex", flexDirection: "column", justifyContent: "center", gap: 8, padding: 24, boxSizing: "border-box" },
  hotelName: { fontSize: 27, marginBottom: 8 },
  reserve: { position: "sticky", top: 0, alignSelf: "start" },
  selectedBox: { background: "#f3f7ff", borderRadius: 18, padding: 20, margin: "14px 0", fontWeight: 900, fontSize: 18 },
  safeNote: { background: "#dff7e6", borderRadius: 14, padding: 15, marginTop: 14, fontWeight: 800 },
  rateGood: { background: "#dff7e6", borderRadius: 14, padding: 12, margin: "12px 0", fontWeight: 900, color: "#075b24" },
  converterBox: { background: "#fff8d8", borderRadius: 18, padding: 16, margin: "16px 0", border: "2px solid #ffd34d" },
  converted: { marginTop: 12, fontSize: 18, lineHeight: 1.45 },
};
