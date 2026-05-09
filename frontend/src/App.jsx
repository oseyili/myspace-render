import React, { useEffect, useMemo, useState } from "react";

const API_BASE = import.meta.env.VITE_API_BASE || import.meta.env.VITE_API_BASE_URL || "http://127.0.0.1:5050";

const INFO = {
  guide: {
    title: "Premium Travel Guide",
    text: "Search real destinations, choose available hotels, review verified property photos, check room details, and continue only when the selected stay is ready for reservation or secure payment."
  },
  faq: {
    title: "Frequently Asked Questions",
    text: "You can search by country, city, area, keyword, travel dates, guests, and rooms. Hotel photos are not replaced with fake images. If a photo is unavailable, the app clearly says so."
  },
  terms: {
    title: "Booking Terms",
    text: "Prices and room availability can change until payment is completed. Always review hotel name, dates, room, board, currency, total amount, customer details, and cancellation notes before payment."
  },
  contact: {
    title: "Customer Support",
    text: "For reservation help, use the reserve form with your name, email, phone number, hotel, dates, and special request. The system sends the reservation request by email when mail settings are active."
  }
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

function PropertyImage({ hotel }) {
  const [failed, setFailed] = useState(false);

  if (!hotel?.image_url || failed) {
    return (
      <div style={styles.realImageMissing}>
        <div style={styles.imageBadge}>MYSPACE HOTEL</div>
        <div style={styles.imageMissingTitle}>Property image unavailable</div>
        <div style={styles.imageMissingText}>We only show verified property photos.</div>
      </div>
    );
  }

  return (
    <img
      loading="lazy"
      decoding="async"
      src={hotel.image_url}
      alt={hotel.hotel_name}
      style={styles.hotelImage}
      onError={() => setFailed(true)}
    />
  );
}

export default function App() {
  const [infoKey, setInfoKey] = useState("");
  const [catalog, setCatalog] = useState([]);
  const [country, setCountry] = useState("");
  const [city, setCity] = useState("");
  const [area, setArea] = useState("");
  const [keyword, setKeyword] = useState("");
  const [checkin, setCheckin] = useState(todayISO());
  const [checkout, setCheckout] = useState(tomorrowISO());
  const [guests, setGuests] = useState(2);
  const [rooms, setRooms] = useState(1);
  const [hotels, setHotels] = useState([]);
  const [selectedHotel, setSelectedHotel] = useState(null);
  const [customerName, setCustomerName] = useState("");
  const [customerEmail, setCustomerEmail] = useState("");
  const [customerPhone, setCustomerPhone] = useState("");
  const [note, setNote] = useState("");
  const [targetCurrency, setTargetCurrency] = useState("USD");
  const [convertedTotal, setConvertedTotal] = useState("");
  const [loadingCatalog, setLoadingCatalog] = useState(true);
  const [loading, setLoading] = useState(false);
  const [requesting, setRequesting] = useState(false);
  const [message, setMessage] = useState("");

  const selectedCountry = useMemo(() => catalog.find((x) => x.country === country) || null, [catalog, country]);
  const cities = selectedCountry?.cities || [];

  useEffect(() => {
    async function loadCatalog() {
      setLoadingCatalog(true);
      try {
        const res = await fetch(`${API_BASE}/api/real-catalog/destinations`);
        const data = await res.json();
        const countries = Array.isArray(data.countries) ? data.countries : [];
        setCatalog(countries);

        const firstCountry = countries.find((c) => c.cities?.some((x) => Number(x.live_hotels || 0) > 0)) || countries[0];
        const firstCity = firstCountry?.cities?.find((x) => Number(x.live_hotels || 0) > 0) || firstCountry?.cities?.[0];

        setCountry(firstCountry?.country || "");
        setCity(firstCity?.city || "");
      } catch {
        setMessage("We could not load destinations. Please try again shortly.");
      } finally {
        setLoadingCatalog(false);
      }
    }

    loadCatalog();
  }, []);

  function changeCountry(nextCountry) {
    const found = catalog.find((x) => x.country === nextCountry);
    const availableCity = found?.cities?.find((x) => Number(x.live_hotels || 0) > 0);
    const firstCity = availableCity || found?.cities?.[0];

    setCountry(nextCountry);
    setCity(firstCity?.city || "");
    setHotels([]);
    setSelectedHotel(null);
    setConvertedTotal("");
    setMessage("");
  }

  async function runSearch(nextCountry = country, nextCity = city) {
    if (!nextCountry || !nextCity) return setMessage("Choose a country and city first.");

    setLoading(true);
    setSelectedHotel(null);
    setConvertedTotal("");
    setMessage("");

    try {
      const params = new URLSearchParams();
      params.set("country", nextCountry);
      params.set("city", nextCity);
      params.set("checkin", checkin);
      params.set("checkout", checkout);
      params.set("guests", String(guests));
      params.set("rooms", String(rooms));
      params.set("limit", "120");
      if (area.trim()) params.set("area", area.trim());
      if (keyword.trim()) params.set("keyword", keyword.trim());

      const res = await fetch(`${API_BASE}/api/hotels/search?${params.toString()}`);
      const data = await res.json();
      const list = Array.isArray(data.hotels) ? data.hotels : [];

      setHotels(list);
      if (list.length > 0) {
        setSelectedHotel(list[0]);
        setMessage(`${list.length} available hotels found in ${nextCity}.`);
      } else {
        setMessage(`No available hotels found in ${nextCity}. Try another destination or date.`);
      }
    } catch {
      setHotels([]);
      setMessage("We could not load available hotels. Please try again shortly.");
    } finally {
      setLoading(false);
    }
  }

  function buildPayload(hotel, payNow) {
    const rate = hotel.first_rate || {};
    const amount = payNow ? Number(rate.amount || 0) * Number(rooms || 1) : 0;

    return {
      hotel_id: hotel.hotel_id,
      hotel_name: hotel.hotel_name,
      destination: `${hotel.city}, ${hotel.country}`,
      checkin,
      checkout,
      guests: Number(guests),
      rooms: Number(rooms),
      customer_name: customerName.trim(),
      customer_email: customerEmail.trim(),
      customer_phone: customerPhone.trim(),
      note: note.trim(),
      rate_key: rate.rate_key || "",
      amount,
      currency: rate.currency || "",
      room_name: rate.room_name || "",
      board_name: rate.board_name || "",
      payment_type: rate.payment_type || "",
      cancellation_policies: rate.cancellation_policies || [],
    };
  }

  async function reserveHotel(hotel = selectedHotel) {
    if (!hotel) return setMessage("Select an available hotel first.");
    if (!customerName.trim() || !customerEmail.trim()) return setMessage("Enter your name and email before reserving.");

    setSelectedHotel(hotel);
    setRequesting(true);
    setMessage("Sending reservation request...");

    try {
      const res = await fetch(`${API_BASE}/reservation-request`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(buildPayload(hotel, false)),
      });

      const data = await res.json();
      if (!res.ok || !data.ok) return setMessage(data.message || "Reservation request could not be sent.");

      setMessage(
        data.email_sent
          ? `Reservation request sent. Code: ${data.reservation_code}.`
          : `Reservation created. Code: ${data.reservation_code}. Email sending is not active on the backend.`
      );
    } catch {
      setMessage("Reservation request could not be completed.");
    } finally {
      setRequesting(false);
    }
  }

  async function requestBooking(hotel = selectedHotel) {
    if (!hotel) return setMessage("Select an available hotel first.");
    if (!hotel.live_rate_ready) return setMessage("This hotel is not available for online payment right now.");
    if (!customerName.trim() || !customerEmail.trim()) return setMessage("Enter your name and email before payment.");

    setSelectedHotel(hotel);
    setRequesting(true);
    setMessage("Preparing secure checkout...");

    try {
      const res = await fetch(`${API_BASE}/reservation-request`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(buildPayload(hotel, true)),
      });

      const data = await res.json();
      if (!res.ok || !data.ok) return setMessage(data.message || "Could not prepare secure checkout.");

      if (data.payment_url) {
        window.location.href = data.payment_url;
        return;
      }

      setMessage(`Reservation created: ${data.reservation_code}.`);
    } catch {
      setMessage("Secure checkout is unavailable. Please try again shortly.");
    } finally {
      setRequesting(false);
    }
  }

  async function convertTotal() {
    if (!selectedHotel?.first_rate?.amount) return setConvertedTotal("Select a hotel first.");

    try {
      const total = Number(selectedHotel.first_rate.amount || 0) * Number(rooms || 1);
      const params = new URLSearchParams();
      params.set("amount", String(total));
      params.set("from", selectedHotel.first_rate.currency || "GBP");
      params.set("to", targetCurrency);

      const res = await fetch(`${API_BASE}/api/currency/convert?${params.toString()}`);
      const data = await res.json();

      if (!data.ok) return setConvertedTotal("Conversion unavailable.");
      setConvertedTotal(`${targetCurrency} ${Number(data.converted).toLocaleString()}`);
    } catch {
      setConvertedTotal("Conversion unavailable.");
    }
  }

  const selectedRate = selectedHotel?.first_rate || {};
  const selectedTotal = Number(selectedRate.amount || 0) * Number(rooms || 1);

  return (
    <div style={styles.page}>
      {infoKey && (
        <div style={styles.modalBackdrop} onClick={() => setInfoKey("")}>
          <div style={styles.modal} onClick={(e) => e.stopPropagation()}>
            <div style={styles.brandSmall}>MYSPACE HOTEL</div>
            <h1 style={styles.infoTitle}>{INFO[infoKey].title}</h1>
            <p style={styles.infoBody}>{INFO[infoKey].text}</p>
            <button style={styles.goldSmall} onClick={() => setInfoKey("")}>Back to hotel search</button>
          </div>
        </div>
      )}

      <section style={styles.hero}>
        <div>
          <div style={styles.brand}>MYSPACE HOTEL</div>
          <h1 style={styles.heroTitle}>Find available hotels and pay securely.</h1>
          <p style={styles.heroText}>Search real destinations, review available rooms, reserve your stay, and continue through secure payment.</p>
        </div>

        <div style={styles.buttonRow}>
          <button style={styles.whiteButton} onClick={() => setInfoKey("guide")}>Guide</button>
          <button style={styles.whiteButton} onClick={() => setInfoKey("faq")}>FAQ</button>
          <button style={styles.whiteButton} onClick={() => setInfoKey("terms")}>Terms</button>
          <button style={styles.whiteButton} onClick={() => setInfoKey("contact")}>Contact</button>
        </div>
      </section>

      <section style={styles.mainGrid}>
        <div style={styles.column}>
          <div style={styles.label}>SEARCH</div>
          <div style={styles.searchBox}>
            <p style={styles.muted}>{loadingCatalog ? "Loading destinations..." : "Choose your destination and travel dates."}</p>

            <label style={styles.formLabel}>Country</label>
            <select style={styles.input} value={country} onChange={(e) => changeCountry(e.target.value)}>
              {catalog.map((c) => <option key={c.country} value={c.country}>{c.country}</option>)}
            </select>

            <label style={styles.formLabel}>City</label>
            <select style={styles.input} value={city} onChange={(e) => setCity(e.target.value)}>
              {cities.map((c) => <option key={c.city} value={c.city}>{c.city}</option>)}
            </select>

            <label style={styles.formLabel}>Area</label>
            <input style={styles.input} value={area} onChange={(e) => setArea(e.target.value)} placeholder="Neighbourhood or area" />

            <label style={styles.formLabel}>Keyword</label>
            <input style={styles.input} value={keyword} onChange={(e) => setKeyword(e.target.value)} placeholder="Hotel name or keyword" />

            <div style={styles.twoInput}>
              <div>
                <label style={styles.formLabel}>Check-in</label>
                <input style={styles.input} type="date" value={checkin} onChange={(e) => setCheckin(e.target.value)} />
              </div>
              <div>
                <label style={styles.formLabel}>Check-out</label>
                <input style={styles.input} type="date" value={checkout} onChange={(e) => setCheckout(e.target.value)} />
              </div>
            </div>

            <div style={styles.twoInput}>
              <div>
                <label style={styles.formLabel}>Guests</label>
                <input style={styles.input} type="number" min="1" value={guests} onChange={(e) => setGuests(Number(e.target.value))} />
              </div>
              <div>
                <label style={styles.formLabel}>Rooms</label>
                <input style={styles.input} type="number" min="1" value={rooms} onChange={(e) => { setRooms(Number(e.target.value)); setConvertedTotal(""); }} />
              </div>
            </div>

            <button style={styles.goldButton} onClick={() => runSearch()} disabled={loading || loadingCatalog}>
              {loading ? "Searching..." : "Search available hotels"}
            </button>

            {message && <div style={styles.notice}>{message}</div>}
          </div>
        </div>

        <div style={styles.column}>
          <div style={styles.label}>AVAILABLE HOTELS</div>
          <div style={styles.scroll}>
            {hotels.map((hotel) => {
              const rate = hotel.first_rate || {};
              const canPay = hotel.live_rate_ready && rate?.rate_key && Number(rate?.amount || 0) > 0;

              return (
                <div key={hotel.hotel_id} style={selectedHotel?.hotel_id === hotel.hotel_id ? styles.hotelCardSelected : styles.hotelCard} onClick={() => { setSelectedHotel(hotel); setConvertedTotal(""); }}>
                  <PropertyImage hotel={hotel} />
                  <div style={styles.hotelBody}>
                    <h2 style={styles.hotelName}>{hotel.hotel_name}</h2>
                    <p style={styles.hotelLocation}>{hotel.area ? `${hotel.area}, ` : ""}{hotel.city}, {hotel.country}</p>
                    <div style={canPay ? styles.rateGood : styles.rateBlocked}>{canPay ? "Available to reserve" : "Currently unavailable online"}</div>
                    <div style={styles.rateBox}>
                      <p><b>Room:</b> {rate.room_name}</p>
                      <p><b>Board:</b> {rate.board_name}</p>
                      <p><b>Price:</b> {rate.currency} {money(rate.amount)}</p>
                    </div>
                    <div style={styles.buttonPair}>
                      <button style={styles.reserveMini} onClick={(e) => { e.stopPropagation(); reserveHotel(hotel); }}>Reserve</button>
                      {canPay && <button style={styles.payMini} onClick={(e) => { e.stopPropagation(); requestBooking(hotel); }}>Pay</button>}
                    </div>
                  </div>
                </div>
              );
            })}

            {!loading && hotels.length === 0 && (
              <div style={styles.emptyBox}>No available hotels loaded for this search. Try another destination or date.</div>
            )}
          </div>
        </div>

        <div style={styles.column}>
          <div style={styles.label}>RESERVE / PAY</div>

          {!selectedHotel ? (
            <div style={styles.emptyBox}>Select an available hotel to reserve or pay.</div>
          ) : (
            <div style={styles.reservePanel}>
              <h2 style={styles.hotelName}>{selectedHotel.hotel_name}</h2>
              <div style={styles.selectedPrice}>{selectedRate.currency} {money(selectedTotal)}</div>

              <div style={styles.mapBox}>
                <iframe
                  title="Hotel map"
                  style={styles.map}
                  loading="lazy"
                  src={
                    selectedHotel.latitude && selectedHotel.longitude
                      ? `https://maps.google.com/maps?q=${selectedHotel.latitude},${selectedHotel.longitude}&z=14&output=embed`
                      : `https://maps.google.com/maps?q=${encodeURIComponent(selectedHotel.hotel_name + " " + selectedHotel.city)}&z=14&output=embed`
                  }
                />
              </div>

              <label style={styles.formLabel}>Currency converter</label>
              <div style={styles.converterRow}>
                <select style={styles.input} value={targetCurrency} onChange={(e) => { setTargetCurrency(e.target.value); setConvertedTotal(""); }}>
                  {["USD", "GBP", "EUR", "NGN", "AED", "CAD", "AUD", "ZAR", "CHF", "JPY"].map((c) => <option key={c} value={c}>{c}</option>)}
                </select>
                <button style={styles.convertButton} onClick={convertTotal}>Convert</button>
              </div>
              <div style={styles.convertBox}>{convertedTotal || "Select a hotel and convert the total room price."}</div>

              <input style={styles.input} value={customerName} onChange={(e) => setCustomerName(e.target.value)} placeholder="Your full name" />
              <input style={styles.input} value={customerEmail} onChange={(e) => setCustomerEmail(e.target.value)} placeholder="Your email" />
              <input style={styles.input} value={customerPhone} onChange={(e) => setCustomerPhone(e.target.value)} placeholder="Phone number" />
              <textarea style={styles.textarea} value={note} onChange={(e) => setNote(e.target.value)} placeholder="Special requests" />

              <div style={styles.buttonPairLarge}>
                <button style={styles.reserveLarge} disabled={requesting} onClick={() => reserveHotel(selectedHotel)}>
                  {requesting ? "Working..." : "Reserve"}
                </button>
                <button style={styles.payLarge} disabled={requesting || !selectedHotel.live_rate_ready} onClick={() => requestBooking(selectedHotel)}>
                  {requesting ? "Preparing..." : "Pay"}
                </button>
              </div>

              <div style={styles.safeNote}>Secure payment is available after your details are confirmed.</div>
            </div>
          )}
        </div>
      </section>
    </div>
  );
}

const styles = {
  page: { minHeight: "100vh", background: "#06101f", color: "white", padding: 18, fontFamily: "Arial, sans-serif", overflow: "hidden" },
  hero: { background: "linear-gradient(135deg,#0f2f69,#1e5cc7)", borderRadius: 24, padding: 24, display: "grid", gridTemplateColumns: "1.2fr .8fr", gap: 20, alignItems: "center", marginBottom: 16 },
  brand: { letterSpacing: 14, fontWeight: 900, color: "#ffd34d", marginBottom: 12 },
  brandSmall: { letterSpacing: 10, fontWeight: 900, marginBottom: 20 },
  heroTitle: { fontSize: 38, lineHeight: 1.1, margin: 0 },
  heroText: { fontSize: 18, lineHeight: 1.5, marginTop: 12 },
  buttonRow: { display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 },
  whiteButton: { background: "white", color: "#07111f", border: 0, borderRadius: 14, padding: "14px 18px", fontWeight: 900, fontSize: 16, cursor: "pointer" },
  mainGrid: { display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 18 },
  column: { height: "73vh", background: "#eaf2fb", color: "#07111f", borderRadius: 24, padding: 18, overflow: "hidden", display: "flex", flexDirection: "column" },
  label: { letterSpacing: 4, color: "#63738e", fontWeight: 900, marginBottom: 12 },
  searchBox: { background: "white", borderRadius: 18, padding: 16, overflow: "auto" },
  muted: { color: "#63738e", fontWeight: 800 },
  formLabel: { display: "block", fontWeight: 900, marginTop: 10, marginBottom: 5 },
  input: { width: "100%", boxSizing: "border-box", padding: "12px 13px", margin: "4px 0", borderRadius: 12, border: "1px solid #c6d5e8", fontSize: 15 },
  textarea: { width: "100%", boxSizing: "border-box", minHeight: 100, padding: "12px 13px", margin: "7px 0", borderRadius: 12, border: "1px solid #c6d5e8", fontSize: 15 },
  twoInput: { display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 },
  goldButton: { width: "100%", background: "#ffd34d", color: "#07111f", border: "2px solid #07111f", borderRadius: 14, padding: "15px 18px", fontSize: 18, fontWeight: 900, cursor: "pointer", marginTop: 14 },
  goldSmall: { background: "#ffd34d", color: "#07111f", border: 0, borderRadius: 14, padding: "15px 22px", fontSize: 18, fontWeight: 900, cursor: "pointer", marginTop: 22 },
  notice: { background: "#fff2be", padding: 13, borderRadius: 14, marginTop: 14, fontWeight: 900 },
  scroll: { overflowY: "auto", paddingRight: 6 },
  hotelCard: { background: "white", borderRadius: 20, marginBottom: 16, overflow: "hidden", cursor: "pointer", border: "2px solid transparent" },
  hotelCardSelected: { background: "white", borderRadius: 20, marginBottom: 16, overflow: "hidden", cursor: "pointer", border: "4px solid #ffd34d" },
  hotelImage: { width: "100%", height: 190, objectFit: "cover", display: "block", background: "#10254a" },
  realImageMissing: { height: 190, background: "linear-gradient(135deg,#10254a,#1d4da8)", color: "white", display: "flex", flexDirection: "column", justifyContent: "center", padding: 22, boxSizing: "border-box" },
  imageBadge: { letterSpacing: 7, fontWeight: 900, fontSize: 11, opacity: 0.8 },
  imageMissingTitle: { fontSize: 22, fontWeight: 900, marginTop: 12 },
  imageMissingText: { fontSize: 14, lineHeight: 1.4, marginTop: 8 },
  hotelBody: { padding: 16 },
  hotelName: { fontSize: 22, margin: "0 0 8px", fontWeight: 900 },
  hotelLocation: { color: "#52627c", margin: 0 },
  rateGood: { background: "#dff7e6", borderRadius: 12, padding: 10, margin: "12px 0", fontWeight: 900, color: "#075b24" },
  rateBlocked: { background: "#ffe1e1", borderRadius: 12, padding: 10, margin: "12px 0", fontWeight: 900, color: "#8a1111" },
  rateBox: { background: "#f6f8fc", borderRadius: 14, padding: 13, margin: "12px 0", fontSize: 14, lineHeight: 1.25 },
  buttonPair: { display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 },
  buttonPairLarge: { display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginTop: 14 },
  reserveMini: { width: "100%", background: "#10254a", color: "white", border: 0, borderRadius: 12, padding: 12, fontWeight: 900, cursor: "pointer" },
  payMini: { width: "100%", background: "#ffd34d", color: "#07111f", border: "2px solid #07111f", borderRadius: 12, padding: 12, fontWeight: 900, cursor: "pointer" },
  reserveLarge: { width: "100%", background: "#10254a", color: "white", border: 0, borderRadius: 14, padding: "15px 18px", fontSize: 18, fontWeight: 900, cursor: "pointer" },
  payLarge: { width: "100%", background: "#ffd34d", color: "#07111f", border: "2px solid #07111f", borderRadius: 14, padding: "15px 18px", fontSize: 18, fontWeight: 900, cursor: "pointer" },
  emptyBox: { background: "white", borderRadius: 18, padding: 22, fontWeight: 900, lineHeight: 1.5 },
  reservePanel: { background: "white", borderRadius: 18, padding: 16, overflow: "auto" },
  selectedPrice: { color: "#0f4db3", fontSize: 26, fontWeight: 900, marginBottom: 14 },
  mapBox: { background: "#f6f8fc", padding: 8, borderRadius: 16, marginBottom: 12 },
  map: { width: "100%", height: 150, border: 0, borderRadius: 12 },
  safeNote: { background: "#dff7e6", borderRadius: 14, padding: 13, marginTop: 14, fontWeight: 900, color: "#075b24" },
  converterRow: { display: "grid", gridTemplateColumns: "1fr 120px", gap: 8 },
  convertButton: { background: "#123a7a", color: "white", border: 0, borderRadius: 12, fontWeight: 900, cursor: "pointer", margin: "4px 0" },
  convertBox: { background: "#eef5ff", borderRadius: 12, padding: 12, fontWeight: 900, margin: "8px 0 12px" },
  modalBackdrop: { position: "fixed", inset: 0, background: "rgba(0,0,0,.62)", zIndex: 50, display: "flex", alignItems: "center", justifyContent: "center", padding: 20 },
  modal: { maxWidth: 760, background: "linear-gradient(135deg,#06101f,#123a7a)", color: "white", borderRadius: 28, padding: 36, boxShadow: "0 20px 80px rgba(0,0,0,.45)" },
  infoTitle: { fontSize: 42, color: "#ffd34d", marginTop: 0 },
  infoBody: { fontSize: 20, lineHeight: 1.7, fontWeight: 800 },
};
