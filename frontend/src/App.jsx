import React, { useEffect, useMemo, useState } from "react";

const API_BASE =
  import.meta.env.VITE_API_BASE ||
  import.meta.env.VITE_API_BASE_URL ||
  "https://myspace-hotel-backend.onrender.com";

function safeText(v) { return String(v || "").trim(); }
function money(v) { const n = Number(v || 0); return Number.isFinite(n) ? n.toFixed(2) : "0.00"; }
function todayISO() { return new Date().toISOString().slice(0, 10); }
function tomorrowISO() { return new Date(Date.now() + 86400000).toISOString().slice(0, 10); }
function roomCount(v) { const n = Number(v || 1); return Number.isFinite(n) && n > 0 ? Math.floor(n) : 1; }
function nightsBetween(a, b) { const d = Math.ceil((new Date(b) - new Date(a)) / 86400000); return Number.isFinite(d) && d > 0 ? d : 1; }

function normalizeCity(c) {
  return {
    city: safeText(typeof c === "string" ? c : c?.city),
    live_hotels: Number(c?.live_hotels || 0),
    destination_code: safeText(c?.destination_code || ""),
  };
}

function normalizeCountries(raw) {
  return (Array.isArray(raw) ? raw : [])
    .map((c) => ({
      country: safeText(c?.country),
      cities: (Array.isArray(c?.cities) ? c.cities : []).map(normalizeCity).filter((x) => x.city && x.live_hotels > 0),
    }))
    .filter((c) => c.country && c.cities.length)
    .sort((a, b) => {
      const ah = a.cities.reduce((s, x) => s + x.live_hotels, 0);
      const bh = b.cities.reduce((s, x) => s + x.live_hotels, 0);
      return bh - ah || a.country.localeCompare(b.country);
    });
}

function baseCustomerRate(rate) { return Number(rate?.customer_total || rate?.amount || 0); }
function baseSupplierRate(rate) { return Number(rate?.supplier_total || rate?.amount || 0); }
function finalCustomerTotal(rate, rooms) { return Number((baseCustomerRate(rate) * roomCount(rooms)).toFixed(2)); }
function finalSupplierTotal(rate, rooms) { return Number((baseSupplierRate(rate) * roomCount(rooms)).toFixed(2)); }

function fastImageUrl(url) {
  const raw = safeText(url);
  if (!raw) return "";
  return raw.replace("http://127.0.0.1:5050", API_BASE).replace("https://127.0.0.1:5050", API_BASE);
}

function go(path) { window.location.href = path; }

function normalizeHotel(h, countryFallback = "", cityFallback = "") {
  const rate = h?.first_rate || null;
  return {
    ...h,
    hotel_id: safeText(h?.hotel_id || h?.hotel_code || h?.id),
    hotel_name: safeText(h?.hotel_name || h?.name || "Selected hotel"),
    country: safeText(h?.country || countryFallback),
    city: safeText(h?.city || cityFallback),
    area: safeText(h?.area || ""),
    address: safeText(h?.address || ""),
    image_url: safeText(h?.image_url || h?.direct_image_url || ""),
    latitude: safeText(h?.latitude || ""),
    longitude: safeText(h?.longitude || ""),
    first_rate: rate,
    live_rate_ready: Boolean(h?.live_rate_ready && rate?.rate_key && baseCustomerRate(rate) > 0),
  };
}

function PropertyImage({ hotel, large = false }) {
  const [failed, setFailed] = useState(false);
  useEffect(() => setFailed(false), [hotel?.hotel_id, hotel?.image_url]);

  const url = fastImageUrl(hotel?.image_url || hotel?.direct_image_url);

  if (!url || failed) {
    return (
      <div className={large ? "imageMissing imageLarge" : "imageMissing"}>
        <div className="imageBadge">MYSPACE HOTEL</div>
        <div className="imageMissingTitle">Verified image unavailable</div>
        <div className="imageMissingText">No fake hotel photo is displayed.</div>
      </div>
    );
  }

  return <img src={url} alt={hotel?.hotel_name || "Hotel"} className={large ? "hotelImage imageLarge" : "hotelImage"} loading={large ? "eager" : "lazy"} onError={() => setFailed(true)} />;
}

function PriceBreakdown({ rate, checkin, checkout, rooms, guests, compact = false }) {
  const nights = nightsBetween(checkin, checkout);
  const count = roomCount(rooms);
  const base = baseCustomerRate(rate);
  const total = finalCustomerTotal(rate, count);
  const currency = rate?.currency || "GBP";

  return (
    <div className={compact ? "priceBox compactPrice" : "priceBox"}>
      <div className="priceLine"><span>Stay length</span><b>{nights} night{nights === 1 ? "" : "s"}</b></div>
      <div className="priceLine"><span>Guests</span><b>{guests}</b></div>
      <div className="priceLine"><span>Rooms</span><b>{count}</b></div>
      <div className="priceLine"><span>Rate per room</span><b>{currency} {money(base)}</b></div>
      <div className="totalLine"><span>Total to pay</span><b>{currency} {money(total)}</b></div>
    </div>
  );
}

function MainPortal() {
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
  const [loadingCatalog, setLoadingCatalog] = useState(true);
  const [loading, setLoading] = useState(false);
  const [requesting, setRequesting] = useState(false);
  const [message, setMessage] = useState("");

  const countries = useMemo(() => catalog, [catalog]);
  const selectedCountry = useMemo(() => countries.find((x) => x.country === country) || null, [countries, country]);
  const cities = useMemo(() => selectedCountry?.cities || [], [selectedCountry]);

  async function loadCatalog() {
    setLoadingCatalog(true);
    try {
      const res = await fetch(`${API_BASE}/api/real-catalog/destinations`, { cache: "no-store" });
      const data = await res.json().catch(() => ({}));
      const normalized = normalizeCountries(data.countries || []);
      setCatalog(normalized);

      const firstCountry = normalized.find((c) => c.country.toLowerCase() === "united kingdom") || normalized[0] || null;
      const firstCity = firstCountry?.cities?.find((c) => c.city.toLowerCase() === "london")?.city || firstCountry?.cities?.[0]?.city || "";

      setCountry(firstCountry?.country || "");
      setCity(firstCity);
      setMessage(firstCountry && firstCity ? "Available live-rate destinations are ready." : "No live-rate destinations are available right now.");
    } catch {
      setMessage("No live-rate destinations are available right now.");
    } finally {
      setLoadingCatalog(false);
    }
  }

  useEffect(() => { loadCatalog(); }, []);

  function changeCountry(v) {
    const found = countries.find((x) => x.country === v);
    const firstCity = found?.cities?.[0]?.city || "";
    setCountry(v);
    setCity(firstCity);
    setHotels([]);
    setSelectedHotel(null);
    setMessage(v && firstCity ? "City selected. Press Search stays to continue." : "No live-rate city found for this country.");
  }

  function changeCity(v) {
    setCity(v);
    setHotels([]);
    setSelectedHotel(null);
    setMessage(v ? "Press Search stays to continue." : "Choose a city first.");
  }

  async function runSearch(nextCountry = country, nextCity = city) {
    const searchCountry = safeText(nextCountry);
    const searchCity = safeText(nextCity);

    if (!searchCountry || !searchCity) {
      setMessage("Choose an available live-rate destination first.");
      return;
    }

    setLoading(true);
    setHotels([]);
    setSelectedHotel(null);
    setMessage("");

    try {
      const p = new URLSearchParams();
      p.set("country", searchCountry);
      p.set("city", searchCity);
      if (safeText(area)) p.set("area", area);
      if (safeText(keyword)) p.set("keyword", keyword);

      const res = await fetch(`${API_BASE}/api/hotels/search?${p.toString()}`, { cache: "no-store" });
      const data = await res.json().catch(() => ({}));
      const list = Array.isArray(data.hotels) ? data.hotels.map((h) => normalizeHotel(h, searchCountry, searchCity)).filter((h) => h.live_rate_ready) : [];

      setHotels(list);
      setSelectedHotel(list[0] || null);
      setMessage(list.length ? `${list.length} live-rate stays available in ${searchCity}.` : "No live-rate stay found for this city/filter.");
    } catch {
      setMessage("Live-rate stays are unavailable right now.");
    } finally {
      setLoading(false);
    }
  }

  async function requestBooking(hotel = selectedHotel) {
    if (!hotel) return setMessage("Select a live-rate hotel first.");
    if (!customerName.trim() || !customerEmail.trim()) return setMessage("Enter your name and email before payment.");

    const rate = hotel.first_rate || {};
    const customerTotal = finalCustomerTotal(rate, rooms);
    const supplierTotal = finalSupplierTotal(rate, rooms);

    setRequesting(true);
    setMessage("Preparing secure checkout...");

    try {
      const res = await fetch(`${API_BASE}/reservation-request`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          hotel_id: hotel.hotel_id,
          hotel_name: hotel.hotel_name,
          destination: `${hotel.city}, ${hotel.country}`,
          checkin,
          checkout,
          guests: Number(guests),
          rooms: roomCount(rooms),
          customer_name: customerName.trim(),
          customer_email: customerEmail.trim(),
          customer_phone: customerPhone.trim(),
          note: note.trim(),
          rate_key: rate.rate_key,
          amount: supplierTotal,
          supplier_total: supplierTotal,
          displayed_customer_total: customerTotal,
          currency: rate.currency,
          room_name: rate.room_name,
          board_name: rate.board_name,
          cancellation_policies: rate.cancellation_policies || [],
        }),
      });

      const data = await res.json();
      if (!res.ok || !data.ok) return setMessage(data.message || "Could not prepare secure checkout.");
      if (data.payment_url) window.location.href = data.payment_url;
    } catch {
      setMessage("Secure booking service unavailable.");
    } finally {
      setRequesting(false);
    }
  }

  const selectedCanPay = selectedHotel?.live_rate_ready && selectedHotel?.first_rate?.rate_key;

  return (
    <div className="page">
      <AppStyles />

      <section className="hero">
        <div>
          <div className="brand">MYSPACE HOTEL</div>
          <h1 className="heroTitle">Book with clarity before you arrive.</h1>
          <p className="heroText">Choose your destination, review the stay, check your total and explore the area with confidence.</p>
        </div>
        <div className="buttonRow">
          <button className="whiteButton" onClick={() => runSearch()}>Load stays</button>
          <button className="whiteButton" onClick={() => go("/?page=faq")}>FAQ</button>
          <button className="whiteButton" onClick={() => go("/?page=terms")}>Terms</button>
          <button className="whiteButton" onClick={() => go("/?page=support")}>Contact</button>
        </div>
      </section>

      <section className="mainGrid">
        <div className="column">
          <div className="labelTop">SEARCH</div>
          <div className="searchBox">
            <p className="muted">{loadingCatalog ? "Loading destinations..." : "Available live-rate destinations are ready."}</p>

            <label className="formLabel">Country</label>
            <select className="input" value={country} onChange={(e) => changeCountry(e.target.value)}>
              <option value="">Choose country</option>
              {countries.map((c) => <option key={c.country} value={c.country}>{c.country}</option>)}
            </select>

            <label className="formLabel">City</label>
            <select className="input" value={city} onChange={(e) => changeCity(e.target.value)} disabled={!country}>
              <option value="">Choose city</option>
              {cities.map((c) => <option key={`${country}-${c.city}`} value={c.city}>{c.city} ({c.live_hotels})</option>)}
            </select>

            <label className="formLabel">Area</label>
            <input className="input" value={area} onChange={(e) => setArea(e.target.value)} placeholder="Neighbourhood or area" />

            <label className="formLabel">Keyword</label>
            <input className="input" value={keyword} onChange={(e) => setKeyword(e.target.value)} placeholder="Hotel name or landmark" />

            <div className="twoInput">
              <div><label className="formLabel">Check-in</label><input className="input" type="date" value={checkin} onChange={(e) => setCheckin(e.target.value)} /></div>
              <div><label className="formLabel">Check-out</label><input className="input" type="date" value={checkout} onChange={(e) => setCheckout(e.target.value)} /></div>
            </div>

            <div className="twoInput">
              <div><label className="formLabel">Guests</label><input className="input" type="number" min="1" value={guests} onChange={(e) => setGuests(Number(e.target.value))} /></div>
              <div><label className="formLabel">Rooms</label><input className="input" type="number" min="1" value={rooms} onChange={(e) => setRooms(roomCount(e.target.value))} /></div>
            </div>

            <button className="goldButton" onClick={() => runSearch()} disabled={loading || loadingCatalog || !country || !city}>
              {loading ? "Loading..." : "Search stays"}
            </button>

            {message && <div className="notice">{message}</div>}
          </div>
        </div>

        <div className="column">
          <div className="labelTop">STAYS</div>
          <div className="scroll">
            {hotels.map((hotel) => {
              const rate = hotel.first_rate || {};
              return (
                <div key={hotel.hotel_id} className={selectedHotel?.hotel_id === hotel.hotel_id ? "hotelCardSelected" : "hotelCard"} onClick={() => setSelectedHotel(hotel)}>
                  <PropertyImage hotel={hotel} />
                  <div className="hotelBody">
                    <h2 className="hotelName">{hotel.hotel_name}</h2>
                    <p className="hotelLocation">{hotel.area ? `${hotel.area}, ` : ""}{hotel.city}, {hotel.country}</p>
                    <div className="rateGood">Ready to reserve</div>
                    <div className="rateBox">
                      <p><b>Room:</b> {rate.room_name || "Selected room"}</p>
                      <p><b>Board:</b> {rate.board_name || "Room only"}</p>
                      <p><b>Final price:</b> {rate.currency} {money(finalCustomerTotal(rate, rooms))}</p>
                      <PriceBreakdown rate={rate} checkin={checkin} checkout={checkout} rooms={rooms} guests={guests} compact />
                    </div>
                    <div className="buttonPair">
                      <button className="reserveMini" onClick={(e) => { e.stopPropagation(); setSelectedHotel(hotel); }}>View</button>
                      <button className="payMini" onClick={(e) => { e.stopPropagation(); requestBooking(hotel); }}>Pay</button>
                    </div>
                  </div>
                </div>
              );
            })}
            {!loading && hotels.length === 0 && <div className="emptyBox">Choose an available destination, then press Search stays.</div>}
          </div>
        </div>

        <div className="column">
          <div className="labelTop">RESERVE / PAY</div>
          {!selectedHotel ? (
            <div className="emptyBox">Select a stay to continue.</div>
          ) : (
            <div className="reservePanel">
              <PropertyImage hotel={selectedHotel} large />
              <h2 className="hotelName">{selectedHotel.hotel_name}</h2>
              <p className="hotelLocation">{selectedHotel.city}, {selectedHotel.country}</p>
              <div className="selectedPrice">{selectedHotel.first_rate.currency} {money(finalCustomerTotal(selectedHotel.first_rate, rooms))}</div>
              <PriceBreakdown rate={selectedHotel.first_rate} checkin={checkin} checkout={checkout} rooms={rooms} guests={guests} />

              <div className="mapBox">
                <iframe title="Hotel map" className="map" loading="lazy" src={selectedHotel.latitude && selectedHotel.longitude ? `https://maps.google.com/maps?q=${selectedHotel.latitude},${selectedHotel.longitude}&z=14&output=embed` : `https://maps.google.com/maps?q=${encodeURIComponent(selectedHotel.hotel_name + " " + selectedHotel.city)}&z=14&output=embed`} />
              </div>

              <input className="input" value={customerName} onChange={(e) => setCustomerName(e.target.value)} placeholder="Your full name" />
              <input className="input" value={customerEmail} onChange={(e) => setCustomerEmail(e.target.value)} placeholder="Your email" />
              <input className="input" value={customerPhone} onChange={(e) => setCustomerPhone(e.target.value)} placeholder="Phone number" />
              <textarea className="textarea" value={note} onChange={(e) => setNote(e.target.value)} placeholder="Special requests" />

              <div className="buttonPairLarge">
                <button className="reserveLarge" disabled={requesting} onClick={() => setMessage(`Saved for review: ${selectedHotel.hotel_name}.`)}>Save</button>
                <button className={selectedCanPay ? "payLarge" : "payDisabledLarge"} disabled={!selectedCanPay || requesting} onClick={() => requestBooking(selectedHotel)}>
                  {requesting ? "Preparing..." : "Pay exact total"}
                </button>
              </div>
            </div>
          )}
        </div>
      </section>
    </div>
  );
}

function SimplePage({ title }) {
  return (
    <div className="infoPage"><AppStyles /><div className="infoCard"><div className="brandSmall">MYSPACE HOTEL</div><h1 className="infoTitle">{title}</h1><button className="goldSmall" onClick={() => go("/")}>Back to hotel search</button></div></div>
  );
}

function Confirmed() {
  return <SimplePage title="Payment received" />;
}

function AppStyles() {
  return (
    <style>{`
      * { box-sizing: border-box; }
      body { margin: 0; background: #06101f; }
      button, select, input, textarea { font-family: inherit; }
      .page { min-height: 100vh; background: #06101f; color: white; padding: 18px; font-family: Arial, sans-serif; }
      .hero { background: linear-gradient(135deg,#0f2f69,#1e5cc7); border-radius: 24px; padding: 24px; display: grid; grid-template-columns: 1.2fr .8fr; gap: 20px; align-items: center; margin-bottom: 16px; }
      .brand { letter-spacing: 14px; font-weight: 900; color: #ffd34d; margin-bottom: 12px; }
      .brandSmall { letter-spacing: 10px; font-weight: 900; margin-bottom: 20px; }
      .heroTitle { font-size: 38px; line-height: 1.1; margin: 0; }
      .heroText { font-size: 18px; line-height: 1.5; margin-top: 12px; }
      .buttonRow { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
      .whiteButton { background: white; color: #07111f; border: 0; border-radius: 14px; padding: 14px 18px; font-weight: 900; font-size: 16px; cursor: pointer; }
      .mainGrid { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 18px; }
      .column { height: 73vh; background: #eaf2fb; color: #07111f; border-radius: 24px; padding: 18px; overflow: hidden; display: flex; flex-direction: column; }
      .labelTop { letter-spacing: 4px; color: #63738e; font-weight: 900; margin-bottom: 12px; }
      .searchBox, .reservePanel, .emptyBox { background: white; border-radius: 18px; padding: 16px; }
      .searchBox, .reservePanel { overflow: auto; }
      .muted { color: #63738e; font-weight: 800; }
      .formLabel { display: block; font-weight: 900; margin-top: 10px; margin-bottom: 5px; }
      .input, .textarea { width: 100%; padding: 12px 13px; margin: 4px 0; border-radius: 12px; border: 1px solid #c6d5e8; font-size: 15px; background: white; color: #07111f; }
      .textarea { min-height: 82px; resize: vertical; }
      .twoInput { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
      .goldButton, .goldSmall { background: #ffd34d; color: #07111f; border: 2px solid #07111f; border-radius: 14px; padding: 15px 18px; font-size: 18px; font-weight: 900; cursor: pointer; }
      .goldButton { width: 100%; margin-top: 14px; }
      .notice { background: #fff2be; padding: 13px; border-radius: 14px; margin-top: 14px; font-weight: 900; color: #07111f; }
      .scroll { overflow-y: auto; padding-right: 6px; }
      .hotelCard, .hotelCardSelected { background: white; border-radius: 20px; margin-bottom: 16px; overflow: hidden; cursor: pointer; }
      .hotelCard { border: 2px solid transparent; }
      .hotelCardSelected { border: 4px solid #ffd34d; }
      .hotelImage { width: 100%; height: 180px; object-fit: cover; display: block; background: #10254a; }
      .imageLarge { height: 190px; border-radius: 16px; margin-bottom: 12px; }
      .imageMissing { height: 180px; background: linear-gradient(135deg,#10254a,#1d4da8); color: white; display: flex; flex-direction: column; justify-content: center; padding: 18px; }
      .imageBadge { letter-spacing: 7px; font-weight: 900; font-size: 11px; opacity: .8; }
      .imageMissingTitle { font-size: 22px; font-weight: 900; margin-top: 12px; }
      .imageMissingText { font-size: 14px; line-height: 1.4; margin-top: 8px; }
      .hotelBody { padding: 14px; }
      .hotelName { font-size: 21px; margin: 0 0 8px; font-weight: 900; }
      .hotelLocation { color: #52627c; margin: 0; }
      .rateGood { background: #dff7e6; border-radius: 12px; padding: 9px; margin: 10px 0; font-weight: 900; color: #075b24; }
      .rateBox, .priceBox { background: #f6f8fc; border-radius: 14px; padding: 13px; margin: 12px 0; font-size: 14px; }
      .compactPrice { background: white; border-radius: 12px; padding: 10px; margin-top: 10px; }
      .priceLine { display: flex; justify-content: space-between; gap: 10px; padding: 5px 0; border-bottom: 1px solid #d9e3f2; font-size: 14px; }
      .totalLine { display: flex; justify-content: space-between; gap: 10px; padding: 9px 0; font-size: 17px; font-weight: 900; color: #0f4db3; }
      .buttonPair, .buttonPairLarge { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
      .reserveMini, .reserveLarge { background: #10254a; color: white; border: 0; font-weight: 900; cursor: pointer; }
      .reserveMini, .payMini { width: 100%; border-radius: 12px; padding: 12px; margin-top: 10px; font-weight: 900; }
      .payMini, .payLarge { background: #ffd34d; color: #07111f; border: 2px solid #07111f; font-weight: 900; cursor: pointer; }
      .reserveLarge, .payLarge, .payDisabledLarge { width: 100%; border-radius: 14px; padding: 15px 18px; font-size: 18px; }
      .payDisabledLarge { background: #c8d0dd; color: #52627c; border: 0; cursor: not-allowed; font-weight: 900; }
      .selectedPrice { color: #0f4db3; font-size: 26px; font-weight: 900; margin-bottom: 14px; }
      .mapBox { background: #f6f8fc; padding: 8px; border-radius: 16px; margin-bottom: 12px; }
      .map { width: 100%; height: 170px; border: 0; border-radius: 12px; }
      .infoPage { min-height: 100vh; background: linear-gradient(135deg,#06101f,#123a7a); color: white; padding: 34px; font-family: Arial, sans-serif; }
      .infoCard { max-width: 1180px; background: rgba(255,255,255,0.12); border-radius: 28px; padding: 40px; }
      .infoTitle { font-size: 46px; color: #ffd34d; }
      @media (max-width: 980px) { .hero, .mainGrid { grid-template-columns: 1fr; } .column { height: auto; } }
      @media (max-width: 560px) { .buttonRow, .twoInput, .buttonPair, .buttonPairLarge { grid-template-columns: 1fr; } .heroTitle { font-size: 28px; } }
    `}</style>
  );
}

export default function App() {
  const page = new URLSearchParams(window.location.search).get("page");
  if (page === "faq") return <SimplePage title="Frequently asked questions" />;
  if (page === "terms") return <SimplePage title="Booking terms" />;
  if (page === "support") return <SimplePage title="Customer support" />;
  if (window.location.pathname === "/reservation-confirmed") return <Confirmed />;
  return <MainPortal />;
}