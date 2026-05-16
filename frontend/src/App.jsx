import React, { useEffect, useMemo, useState } from "react";

const API_BASE = import.meta.env.VITE_API_BASE || "https://myspace-hotel-backend.onrender.com";

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

function tomorrowISO() {
  return new Date(Date.now() + 86400000).toISOString().slice(0, 10);
}

function safe(v) {
  return String(v || "").trim();
}

function money(v) {
  const n = Number(v || 0);
  return Number.isFinite(n) ? n.toFixed(2) : "0.00";
}

function roomsSafe(v) {
  const n = Number(v || 1);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : 1;
}

function go(path) {
  window.location.href = path;
}

function isLive(hotel) {
  return Boolean(hotel?.live_rate_ready && hotel?.first_rate?.rate_key && Number(hotel?.first_rate?.amount || 0) > 0);
}

function totalPrice(hotel, rooms) {
  if (!isLive(hotel)) return 0;
  return Number((Number(hotel.first_rate.amount || 0) * roomsSafe(rooms)).toFixed(2));
}

function PropertyImage({ hotel }) {
  const [failed, setFailed] = useState(false);
  const url = safe(hotel?.direct_image_url || hotel?.image_url);

  useEffect(() => setFailed(false), [url, hotel?.hotel_id]);

  if (!url || failed) {
    return (
      <div className="imageMissing">
        <div className="imageBadge">MYSPACE HOTEL</div>
        <div className="imageMissingTitle">Verified image unavailable</div>
        <div className="imageMissingText">No fake hotel photo is displayed.</div>
      </div>
    );
  }

  return (
    <img
      src={url}
      alt={hotel?.hotel_name || "Hotel"}
      className="hotelImage"
      loading="lazy"
      decoding="async"
      referrerPolicy="no-referrer"
      onError={() => setFailed(true)}
    />
  );
}

function InfoPage({ title, children }) {
  return (
    <div className="infoPage">
      <AppStyles />
      <div className="infoCard">
        <div className="brandSmall">MYSPACE HOTEL</div>
        <h1>{title}</h1>
        <div className="infoBody">{children}</div>
        <button className="goldSmall" onClick={() => go("/")}>Back to hotel search</button>
      </div>
    </div>
  );
}

function Guide() {
  return (
    <InfoPage title="Destination guide">
      <p>Choose a destination, compare real stays, check the area map, and continue with confidence.</p>
      <p>For hotels without instant payment, a confirmation request can be sent before payment.</p>
    </InfoPage>
  );
}

function FAQ() {
  return (
    <InfoPage title="Frequently asked questions">
      <p><b>Can I pay online?</b><br />Yes, when a current payable rate is available.</p>
      <p><b>Why do some hotels need confirmation?</b><br />Some hotels need today’s availability and final price confirmed before payment.</p>
      <p><b>Are photos fake?</b><br />No. If a real verified image is not available, no fake hotel image is shown.</p>
    </InfoPage>
  );
}

function Terms() {
  return (
    <InfoPage title="Booking terms">
      <p>Review hotel name, location, dates, guests, rooms, currency, price and room details before continuing.</p>
      <p>Prices and availability can change until booking confirmation is completed.</p>
    </InfoPage>
  );
}

function Contact() {
  return (
    <InfoPage title="Contact">
      <p><b>Email:</b> reservations@myspace-hotel.com</p>
      <p>Include your destination, dates, hotel name, and booking email for faster help.</p>
    </InfoPage>
  );
}

function Confirmed() {
  const code = new URLSearchParams(window.location.search).get("code") || "";
  return (
    <InfoPage title="Reservation update received">
      <p>Your reservation update is being processed securely.</p>
      {code && <p><b>Reservation code:</b> {code}</p>}
    </InfoPage>
  );
}

export default function App() {
  const path = window.location.pathname;
  if (path === "/travel") return <Guide />;
  if (path === "/faq") return <FAQ />;
  if (path === "/terms") return <Terms />;
  if (path === "/support") return <Contact />;
  if (path === "/reservation-confirmed") return <Confirmed />;

  const [countries, setCountries] = useState([]);
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
  const [loadingHotels, setLoadingHotels] = useState(false);
  const [requesting, setRequesting] = useState(false);
  const [message, setMessage] = useState("");

  const selectedCountry = useMemo(() => countries.find((x) => x.country === country) || null, [countries, country]);
  const cities = selectedCountry?.cities || [];

  async function loadCountries() {
    setLoadingCatalog(true);
    setMessage("");

    try {
      const res = await fetch(`${API_BASE}/api/real-catalog/destinations`, { cache: "no-store" });
      const data = await res.json();
      const list = Array.isArray(data.countries) ? data.countries : [];
      setCountries(list);

      const firstCountry =
        list.find((c) => c.cities?.some((x) => Number(x.live_hotels || 0) > 0)) ||
        list[0];

      const firstCity =
        firstCountry?.cities?.find((x) => Number(x.live_hotels || 0) > 0) ||
        firstCountry?.cities?.[0];

      setCountry(firstCountry?.country || "");
      setCity(firstCity?.city || "");

      if (firstCountry?.country && firstCity?.city) {
        await searchHotels(firstCountry.country, firstCity.city);
      }
    } catch {
      setMessage("Could not load destinations. Please refresh.");
    } finally {
      setLoadingCatalog(false);
    }
  }

  async function searchHotels(nextCountry = country, nextCity = city) {
    if (!nextCountry || !nextCity) {
      setMessage("Choose a country and city first.");
      return;
    }

    setLoadingHotels(true);
    setSelectedHotel(null);
    setMessage("");

    try {
      const p = new URLSearchParams();
      p.set("country", nextCountry);
      p.set("city", nextCity);
      p.set("limit", "120");
      if (area) p.set("area", area);
      if (keyword) p.set("keyword", keyword);

      const res = await fetch(`${API_BASE}/api/hotels/search?${p.toString()}`, { cache: "no-store" });
      const data = await res.json();
      const list = Array.isArray(data.hotels) ? data.hotels : [];

      setHotels(list);
      setSelectedHotel(list[0] || null);

      const liveCount = list.filter(isLive).length;
      setMessage(
        list.length
          ? `${list.length} stays found in ${nextCity}. ${liveCount} can continue to instant payment.`
          : "No matching stay found. Try another city or clear filters."
      );
    } catch {
      setHotels([]);
      setMessage("Stay search is temporarily unavailable. Please refresh.");
    } finally {
      setLoadingHotels(false);
    }
  }

  useEffect(() => {
    loadCountries();
  }, []);

  function changeCountry(nextCountry) {
    const found = countries.find((x) => x.country === nextCountry);
    const firstCity =
      found?.cities?.find((x) => Number(x.live_hotels || 0) > 0)?.city ||
      found?.cities?.[0]?.city ||
      "";

    setCountry(nextCountry);
    setCity(firstCity);
    setHotels([]);
    setSelectedHotel(null);
    setMessage("City selected. Press Search stays.");
  }

  function changeCity(nextCity) {
    setCity(nextCity);
    setHotels([]);
    setSelectedHotel(null);
    setMessage("Press Search stays.");
  }

  async function reserveOrPay(hotel = selectedHotel) {
    if (!hotel) {
      setMessage("Select a stay first.");
      return;
    }

    if (!customerName.trim() || !customerEmail.trim()) {
      setMessage("Enter your name and email before continuing.");
      return;
    }

    setRequesting(true);
    setMessage(isLive(hotel) ? "Preparing secure checkout..." : "Sending confirmation request...");

    try {
      const rate = hotel.first_rate || {};
      const payload = {
        hotel_id: hotel.hotel_id,
        hotel_name: hotel.hotel_name,
        destination: `${hotel.city}, ${hotel.country}`,
        checkin,
        checkout,
        guests: Number(guests),
        rooms: roomsSafe(rooms),
        customer_name: customerName.trim(),
        customer_email: customerEmail.trim(),
        customer_phone: customerPhone.trim(),
        note: note.trim(),
        rate_key: rate.rate_key || "",
        amount: rate.amount || "",
        currency: rate.currency || "",
        room_name: rate.room_name || "",
        board_name: rate.board_name || "",
      };

      const res = await fetch(`${API_BASE}/reservation-request`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const data = await res.json();

      if (!res.ok || !data.ok) {
        setMessage(data.message || "Could not continue with this reservation.");
        return;
      }

      if (data.payment_url) {
        window.location.href = data.payment_url;
        return;
      }

      setMessage(`Request received: ${data.reservation_code}. We will confirm availability and price before payment.`);
    } catch {
      setMessage("Reservation service is temporarily unavailable.");
    } finally {
      setRequesting(false);
    }
  }

  const livePay = isLive(selectedHotel);
  const selectedTotal = totalPrice(selectedHotel, rooms);
  const selectedCurrency = selectedHotel?.first_rate?.currency || "";

  return (
    <div className="page">
      <AppStyles />

      <section className="hero">
        <div>
          <div className="brand">MYSPACE HOTEL</div>
          <h1>Book with clarity before you arrive.</h1>
          <p>Choose your destination, compare real stays, review your total and continue securely.</p>
        </div>
        <div className="buttonGrid">
          <button onClick={() => go("/travel")}>Destination Guide</button>
          <button onClick={() => go("/faq")}>FAQ</button>
          <button onClick={() => go("/terms")}>Terms</button>
          <button onClick={() => go("/support")}>Contact</button>
        </div>
      </section>

      <section className="mainGrid">
        <div className="panel">
          <div className="label">SEARCH</div>
          <div className="box scrollBox">
            <p className="muted">
              {loadingCatalog ? "Loading destinations..." : `${countries.length} countries loaded. Cities are separated by country.`}
            </p>

            <label>Country</label>
            <select value={country} onChange={(e) => changeCountry(e.target.value)}>
              <option value="">Choose country</option>
              {countries.map((c) => (
                <option key={c.country} value={c.country}>
                  {c.country} - {c.city_count} cities
                </option>
              ))}
            </select>

            <label>City</label>
            <select value={city} onChange={(e) => changeCity(e.target.value)} disabled={!country}>
              <option value="">Choose city</option>
              {cities.map((c) => (
                <option key={`${country}-${c.city}`} value={c.city}>
                  {c.city} - {Number(c.live_hotels || 0) > 0 ? `${c.live_hotels} instant stays` : `${c.catalog_hotels || 0} stays`}
                </option>
              ))}
            </select>

            <label>Area</label>
            <input value={area} onChange={(e) => setArea(e.target.value)} placeholder="Neighbourhood or area" />

            <label>Keyword</label>
            <input value={keyword} onChange={(e) => setKeyword(e.target.value)} placeholder="Hotel name or landmark" />

            <div className="two">
              <div>
                <label>Check-in</label>
                <input type="date" value={checkin} onChange={(e) => setCheckin(e.target.value)} />
              </div>
              <div>
                <label>Check-out</label>
                <input type="date" value={checkout} onChange={(e) => setCheckout(e.target.value)} />
              </div>
            </div>

            <div className="two">
              <div>
                <label>Guests</label>
                <input type="number" min="1" value={guests} onChange={(e) => setGuests(Number(e.target.value))} />
              </div>
              <div>
                <label>Rooms</label>
                <input type="number" min="1" value={rooms} onChange={(e) => setRooms(roomsSafe(e.target.value))} />
              </div>
            </div>

            <button className="gold" disabled={loadingHotels || loadingCatalog} onClick={() => searchHotels()}>
              {loadingHotels ? "Searching..." : "Search stays"}
            </button>

            {message && <div className="notice">{message}</div>}
          </div>
        </div>

        <div className="panel">
          <div className="label">STAYS</div>
          <div className="results">
            {hotels.map((hotel, index) => {
              const canPay = isLive(hotel);
              return (
                <div key={`${hotel.hotel_id}-${index}`} className={selectedHotel?.hotel_id === hotel.hotel_id ? "card selected" : "card"} onClick={() => setSelectedHotel(hotel)}>
                  <PropertyImage hotel={hotel} />
                  <div className="cardBody">
                    <h2>{hotel.hotel_name}</h2>
                    <p>{hotel.area ? `${hotel.area}, ` : ""}{hotel.city}, {hotel.country}</p>
                    <div className={canPay ? "green" : "amber"}>{canPay ? "Instant secure checkout available" : "Confirmation before payment"}</div>
                    {canPay ? (
                      <div className="rate">
                        <p><b>Room:</b> {hotel.first_rate.room_name || "Selected room"}</p>
                        <p><b>Board:</b> {hotel.first_rate.board_name || "Room only"}</p>
                        <p><b>Total:</b> {hotel.first_rate.currency} {money(totalPrice(hotel, rooms))}</p>
                      </div>
                    ) : (
                      <div className="rate">We will confirm today&apos;s availability and price before payment.</div>
                    )}
                    <button className="darkMini" onClick={(e) => { e.stopPropagation(); setSelectedHotel(hotel); }}>View</button>
                  </div>
                </div>
              );
            })}

            {!loadingHotels && hotels.length === 0 && (
              <div className="empty">Choose a destination, then press Search stays.</div>
            )}
          </div>
        </div>

        <div className="panel">
          <div className="label">RESERVE / PAY</div>
          {!selectedHotel ? (
            <div className="empty">Select a stay to continue.</div>
          ) : (
            <div className="box scrollBox">
              <PropertyImage hotel={selectedHotel} />
              <h2>{selectedHotel.hotel_name}</h2>
              <p className="muted">{selectedHotel.city}, {selectedHotel.country}</p>

              {livePay ? (
                <div className="price">{selectedCurrency} {money(selectedTotal)}</div>
              ) : (
                <div className="amber">Confirmation required before payment.</div>
              )}

              <div className="mapBox">
                <iframe
                  title="Hotel map"
                  src={
                    selectedHotel.latitude && selectedHotel.longitude
                      ? `https://maps.google.com/maps?q=${selectedHotel.latitude},${selectedHotel.longitude}&z=14&output=embed`
                      : `https://maps.google.com/maps?q=${encodeURIComponent(`${selectedHotel.hotel_name} ${selectedHotel.city} ${selectedHotel.country}`)}&z=14&output=embed`
                  }
                />
              </div>

              <input value={customerName} onChange={(e) => setCustomerName(e.target.value)} placeholder="Your full name" />
              <input value={customerEmail} onChange={(e) => setCustomerEmail(e.target.value)} placeholder="Your email" />
              <input value={customerPhone} onChange={(e) => setCustomerPhone(e.target.value)} placeholder="Phone number" />
              <textarea value={note} onChange={(e) => setNote(e.target.value)} placeholder="Special requests" />

              <button className="gold" disabled={requesting} onClick={() => reserveOrPay(selectedHotel)}>
                {requesting ? "Working..." : livePay ? "Pay exact total" : "Request confirmation"}
              </button>

              <div className="safeNote">
                {livePay ? "Secure checkout is available for this stay." : "No payment is taken until the stay is confirmed."}
              </div>
            </div>
          )}
        </div>
      </section>
    </div>
  );
}

function AppStyles() {
  return (
    <style>{`
      * { box-sizing: border-box; }
      body { margin: 0; background: #06101f; font-family: Arial, sans-serif; }
      .page { min-height: 100vh; background: #06101f; color: white; padding: 18px; }
      .hero { background: linear-gradient(135deg,#0f2f69,#1e5cc7); border-radius: 24px; padding: 26px; display: grid; grid-template-columns: 1.35fr .65fr; gap: 22px; align-items: center; margin-bottom: 18px; }
      .brand, .brandSmall { letter-spacing: 12px; font-weight: 900; color: #ffd34d; margin-bottom: 12px; }
      .hero h1 { font-size: 40px; line-height: 1.08; margin: 0; }
      .hero p { font-size: 19px; line-height: 1.45; }
      .buttonGrid { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
      .buttonGrid button, .goldSmall { background: white; color: #07111f; border: 0; border-radius: 14px; padding: 16px; font-size: 17px; font-weight: 900; cursor: pointer; }
      .mainGrid { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 18px; }
      .panel { height: 73vh; background: #eaf2fb; color: #07111f; border-radius: 24px; padding: 18px; display: flex; flex-direction: column; overflow: hidden; }
      .label { letter-spacing: 5px; color: #63738e; font-weight: 900; margin-bottom: 12px; }
      .box, .empty { background: white; border-radius: 18px; padding: 16px; }
      .scrollBox, .results { overflow-y: auto; padding-right: 6px; }
      .muted { color: #63738e; font-weight: 800; line-height: 1.4; }
      label { display: block; font-weight: 900; margin: 12px 0 6px; }
      input, select, textarea { width: 100%; padding: 13px; border: 1px solid #c6d5e8; border-radius: 13px; font-size: 16px; margin-bottom: 6px; }
      textarea { min-height: 96px; resize: vertical; }
      .two { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
      .gold { width: 100%; background: #ffd34d; color: #07111f; border: 2px solid #07111f; border-radius: 14px; padding: 16px; font-size: 18px; font-weight: 900; cursor: pointer; margin-top: 12px; }
      .notice { background: #fff2be; border-radius: 14px; padding: 13px; font-weight: 900; margin-top: 13px; line-height: 1.35; }
      .card { background: white; border: 2px solid transparent; border-radius: 20px; margin-bottom: 16px; overflow: hidden; cursor: pointer; }
      .selected { border: 4px solid #ffd34d; }
      .hotelImage, .imageMissing { width: 100%; height: 190px; object-fit: cover; display: block; }
      .imageMissing { background: linear-gradient(135deg,#10254a,#1d4da8); color: white; padding: 22px; display: flex; flex-direction: column; justify-content: center; }
      .imageBadge { letter-spacing: 7px; font-weight: 900; font-size: 11px; opacity: .85; }
      .imageMissingTitle { font-size: 22px; font-weight: 900; margin-top: 12px; }
      .imageMissingText { font-size: 14px; margin-top: 8px; }
      .cardBody { padding: 15px; }
      h2 { font-size: 22px; margin: 0 0 8px; }
      .green, .amber, .safeNote { border-radius: 13px; padding: 12px; font-weight: 900; margin: 12px 0; line-height: 1.35; }
      .green, .safeNote { background: #dff7e6; color: #075b24; }
      .amber { background: #fff2be; color: #6b4d00; }
      .rate { background: #f6f8fc; border-radius: 14px; padding: 13px; line-height: 1.35; }
      .darkMini { width: 100%; margin-top: 12px; background: #10254a; color: white; border: 0; border-radius: 12px; padding: 12px; font-weight: 900; cursor: pointer; }
      .price { color: #0f4db3; font-size: 30px; font-weight: 900; margin: 12px 0; }
      .mapBox { background: #f6f8fc; padding: 8px; border-radius: 16px; margin: 12px 0; }
      iframe { width: 100%; height: 180px; border: 0; border-radius: 12px; }
      .infoPage { min-height: 100vh; background: linear-gradient(135deg,#06101f,#123a7a); color: white; padding: 32px; }
      .infoCard { max-width: 980px; background: rgba(255,255,255,.12); border: 1px solid rgba(255,255,255,.22); border-radius: 28px; padding: 36px; }
      .infoCard h1 { color: #ffd34d; font-size: 44px; }
      .infoBody { font-size: 20px; line-height: 1.65; }
      @media (max-width: 980px) {
        .hero, .mainGrid { grid-template-columns: 1fr; }
        .panel { height: auto; min-height: 420px; }
      }
    `}</style>
  );
}