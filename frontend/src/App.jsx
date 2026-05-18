import React, { useEffect, useMemo, useState } from "react";

const API_BASE =
  import.meta.env.VITE_API_BASE ||
  import.meta.env.VITE_API_BASE_URL ||
  "http://127.0.0.1:5050";

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

function tomorrowISO() {
  return new Date(Date.now() + 86400000).toISOString().slice(0, 10);
}

function clean(v) {
  return String(v || "").trim();
}

function money(v) {
  const n = Number(v || 0);
  return Number.isFinite(n)
    ? n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })
    : "0.00";
}

function safeNumber(v, fallback = 1) {
  const n = Number(v || fallback);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : fallback;
}

function nightsBetween(checkin, checkout) {
  const a = new Date(checkin).getTime();
  const b = new Date(checkout).getTime();
  const d = Math.ceil((b - a) / 86400000);
  return Number.isFinite(d) && d > 0 ? d : 1;
}

function isLive(hotel) {
  return Boolean(hotel?.live_rate_ready && hotel?.first_rate?.rate_key && Number(hotel?.first_rate?.amount || 0) > 0);
}

function rateAmount(hotel) {
  return Number(hotel?.first_rate?.amount || 0);
}

function totalAmount(hotel, rooms) {
  return Number((rateAmount(hotel) * safeNumber(rooms, 1)).toFixed(2));
}

function stayTypeLabel(hotel) {
  const t = clean(hotel?.property_type).toLowerCase();
  if (t.includes("apartment") || t.includes("residence")) return "Apartment / residence";
  if (t.includes("villa")) return "Villa";
  if (t.includes("resort")) return "Resort";
  if (t.includes("guest")) return "Guest house";
  return "Hotel";
}

function go(path) {
  window.location.href = path;
}

function PropertyImage({ hotel, large = false }) {
  const [failed, setFailed] = useState(false);
  const url = clean(hotel?.direct_image_url || hotel?.image_url);

  useEffect(() => setFailed(false), [url, hotel?.hotel_id]);

  if (!url || failed) {
    return (
      <div className={large ? "imageFallback imageLarge" : "imageFallback"}>
        <div className="imageBrand">MYSPACE HOTEL</div>
        <div className="imageFallbackTitle">Verified image unavailable</div>
        <div className="imageFallbackText">No fake property photo is displayed.</div>
      </div>
    );
  }

  return (
    <img
      src={url}
      alt={hotel?.hotel_name || "Property"}
      className={large ? "propertyImage imageLarge" : "propertyImage"}
      loading={large ? "eager" : "lazy"}
      decoding="async"
      referrerPolicy="no-referrer"
      onError={() => setFailed(true)}
    />
  );
}

function InfoPage({ title, subtitle, children }) {
  return (
    <div className="infoPage">
      <AppStyles />
      <div className="infoCard">
        <div className="brandSmall">MYSPACE HOTEL</div>
        <h1>{title}</h1>
        <p>{subtitle}</p>
        {children}
        <button className="goldButton" onClick={() => go("/")}>Back to search</button>
      </div>
    </div>
  );
}

function DestinationGuidePage() {
  const params = new URLSearchParams(window.location.search);
  const country = params.get("country") || "";
  const city = params.get("city") || "";
  const area = params.get("area") || "";
  const [guide, setGuide] = useState(null);

  useEffect(() => {
    const p = new URLSearchParams();
    if (country) p.set("country", country);
    if (city) p.set("city", city);
    if (area) p.set("area", area);

    fetch(`${API_BASE}/api/guide?${p.toString()}`, { cache: "no-store" })
      .then((r) => r.json())
      .then((d) => setGuide(d.guide || null))
      .catch(() => setGuide(null));
  }, [country, city, area]);

  const emergency = guide?.emergency || {};

  function openMap(q) {
    window.open(`https://www.google.com/maps/search/${encodeURIComponent(q)}`, "_blank", "noopener,noreferrer");
  }

  return (
    <InfoPage
      title="Destination guide"
      subtitle={`Useful local information for ${guide?.destination || [city, country].filter(Boolean).join(", ") || "your stay"}.`}
    >
      <div className="guideGrid">
        <div className="guideCard redGuide">
          <h2>Emergency help</h2>
          <p><b>Emergency:</b> {emergency.emergency || "112"}</p>
          <p><b>Police:</b> {emergency.police || "112"}</p>
          <p><b>Ambulance:</b> {emergency.ambulance || "112"}</p>
          <p><b>Fire:</b> {emergency.fire || "112"}</p>
        </div>

        <div className="guideCard">
          <h2>Medical support</h2>
          <p>Find the closest hospital, urgent care centre and pharmacy near your stay.</p>
          <button onClick={() => openMap(`hospital near ${guide?.destination || city}`)}>Hospitals</button>
          <button onClick={() => openMap(`pharmacy near ${guide?.destination || city}`)}>Pharmacies</button>
        </div>

        <div className="guideCard">
          <h2>Arrival and airport</h2>
          <p>Check airport transfer time, terminal details and trusted transport before arrival.</p>
          <button onClick={() => openMap(`airport near ${guide?.destination || city}`)}>Airport</button>
        </div>

        <div className="guideCard">
          <h2>Restaurants nearby</h2>
          <p>Review nearby restaurants, opening hours and walking distance before going out.</p>
          <button onClick={() => openMap(`restaurants near ${guide?.destination || city}`)}>Restaurants</button>
        </div>

        <div className="guideCard">
          <h2>Transport</h2>
          <p>Use trusted taxis, public transport, rail stations or hotel-arranged transfers.</p>
          <button onClick={() => openMap(`taxi near ${guide?.destination || city}`)}>Taxi</button>
          <button onClick={() => openMap(`train station near ${guide?.destination || city}`)}>Train / metro</button>
        </div>

        <div className="guideCard">
          <h2>Things to do</h2>
          <p>Explore museums, parks, tours, family attractions and cultural places near your stay.</p>
          <button onClick={() => openMap(`things to do near ${guide?.destination || city}`)}>Attractions</button>
        </div>
      </div>
    </InfoPage>
  );
}

function FAQPage() {
  return (
    <InfoPage title="Frequently asked questions" subtitle="Clear answers before you choose or reserve a stay.">
      <div className="simpleGrid">
        <div className="simpleBox"><b>Can I search hotels and apartments?</b><br />Yes. Use the stay type selector to view hotels separately from apartments, residences and other accommodation.</div>
        <div className="simpleBox"><b>Why do some stays need confirmation?</b><br />Some properties need the latest price and availability confirmed before payment.</div>
        <div className="simpleBox"><b>Does the total update for multiple rooms?</b><br />Yes. The total multiplies the room rate by the number of rooms selected.</div>
        <div className="simpleBox"><b>Are photos fake?</b><br />No. If a verified image is unavailable, a trust notice is shown instead.</div>
      </div>
    </InfoPage>
  );
}

function TermsPage() {
  return (
    <InfoPage title="Booking terms" subtitle="Important information before continuing.">
      <div className="simpleGrid">
        <div className="simpleBox">Review property name, dates, guests, rooms, stay type and total before continuing.</div>
        <div className="simpleBox">Prices and availability may change until the stay is confirmed.</div>
        <div className="simpleBox">Payment is enabled only when a current payable rate is available.</div>
        <div className="simpleBox">For confirmation-required stays, no payment is taken until price and availability are confirmed.</div>
      </div>
    </InfoPage>
  );
}

function ContactPage() {
  return (
    <InfoPage title="Customer support" subtitle="Reservation support for safer booking decisions.">
      <div className="simpleGrid">
        <div className="simpleBox"><b>Email</b><br />reservations@myspace-hotel.com</div>
        <div className="simpleBox"><b>Booking help</b><br />Include destination, dates, property name and booking email.</div>
        <div className="simpleBox"><b>Arrival support</b><br />Include reservation code, guest name and arrival time.</div>
        <div className="simpleBox"><b>Special requests</b><br />Add accessibility, family, room or arrival requests before continuing.</div>
      </div>
    </InfoPage>
  );
}

function ConfirmedPage() {
  const code = new URLSearchParams(window.location.search).get("code") || "";
  return (
    <InfoPage title="Reservation update received" subtitle="Your reservation update is being processed securely.">
      <div className="simpleBox">{code ? `Reservation code: ${code}` : "Thank you. Your reservation update has been received."}</div>
    </InfoPage>
  );
}

export default function App() {
  const path = window.location.pathname;
  const page = new URLSearchParams(window.location.search).get("page");

  if (path === "/travel" || page === "travel") return <DestinationGuidePage />;
  if (path === "/faq" || page === "faq") return <FAQPage />;
  if (path === "/terms" || page === "terms") return <TermsPage />;
  if (path === "/support" || page === "support") return <ContactPage />;
  if (path === "/reservation-confirmed") return <ConfirmedPage />;

  const [catalog, setCatalog] = useState([]);
  const [country, setCountry] = useState("");
  const [city, setCity] = useState("");
  const [stayType, setStayType] = useState("hotel");
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
  const [converted, setConverted] = useState("");
  const [loadingCatalog, setLoadingCatalog] = useState(true);
  const [loadingHotels, setLoadingHotels] = useState(false);
  const [checkingPrice, setCheckingPrice] = useState(false);
  const [requesting, setRequesting] = useState(false);
  const [message, setMessage] = useState("");

  const selectedCountry = useMemo(() => catalog.find((c) => c.country === country) || null, [catalog, country]);
  const cities = selectedCountry?.cities || [];
  const nights = nightsBetween(checkin, checkout);
  const selectedLive = isLive(selectedHotel);
  const selectedTotal = totalAmount(selectedHotel, rooms);
  const selectedCurrency = selectedHotel?.first_rate?.currency || "";

  async function loadCatalog() {
    setLoadingCatalog(true);
    try {
      const res = await fetch(`${API_BASE}/api/real-catalog/destinations`, { cache: "no-store" });
      const data = await res.json();
      const list = Array.isArray(data.countries) ? data.countries : [];
      setCatalog(list);

      const firstCountry = list.find((c) => c.country === "United Kingdom") || list[0];
      const firstCity = firstCountry?.cities?.find((c) => clean(c.city).toLowerCase() === "london") || firstCountry?.cities?.[0];

      setCountry(firstCountry?.country || "");
      setCity(firstCity?.city || "");

      if (firstCountry?.country && firstCity?.city) {
        await searchHotels(firstCountry.country, firstCity.city, "hotel");
      }
    } catch {
      setMessage("Destinations could not be loaded. Please refresh.");
    } finally {
      setLoadingCatalog(false);
    }
  }

  async function searchHotels(nextCountry = country, nextCity = city, nextStayType = stayType) {
    if (!nextCountry || !nextCity) {
      setMessage("Choose a country and destination first.");
      return;
    }

    setLoadingHotels(true);
    setConverted("");
    setSelectedHotel(null);
    setMessage("");

    try {
      const p = new URLSearchParams();
      p.set("country", nextCountry);
      p.set("city", nextCity);
      p.set("property_type", nextStayType === "all" ? "all" : nextStayType);
      p.set("limit", "160");
      if (clean(area)) p.set("area", clean(area));
      if (clean(keyword)) p.set("keyword", clean(keyword));

      const res = await fetch(`${API_BASE}/api/hotels/search?${p.toString()}`, { cache: "no-store" });
      const data = await res.json();
      const list = Array.isArray(data.hotels) ? data.hotels : [];

      setHotels(list);
      setSelectedHotel(list[0] || null);

      const payable = list.filter(isLive).length;
      setMessage(
        list.length
          ? `${list.length} ${nextStayType === "apartment" ? "apartment and residence" : nextStayType === "hotel" ? "hotel" : "stay"} options found in ${nextCity}. ${payable} currently have instant checkout.`
          : "No matching stay found. Try another destination or clear filters."
      );
    } catch {
      setHotels([]);
      setMessage("Search is temporarily unavailable. Please refresh.");
    } finally {
      setLoadingHotels(false);
    }
  }

  useEffect(() => {
    loadCatalog();
  }, []);

  function changeCountry(nextCountry) {
    const found = catalog.find((c) => c.country === nextCountry);
    const firstCity = found?.cities?.[0]?.city || "";
    setCountry(nextCountry);
    setCity(firstCity);
    setHotels([]);
    setSelectedHotel(null);
    setMessage("Destination selected. Press Search stays.");
  }

  function changeCity(nextCity) {
    setCity(nextCity);
    setHotels([]);
    setSelectedHotel(null);
    setMessage("Press Search stays.");
  }

  function changeStayType(nextType) {
    setStayType(nextType);
    setHotels([]);
    setSelectedHotel(null);
    setMessage("Stay type selected. Press Search stays.");
  }

  async function checkLivePrice(hotel = selectedHotel) {
    if (!hotel) return;

    setCheckingPrice(true);
    setConverted("");
    setMessage("Checking the latest price for this stay...");

    try {
      const p = new URLSearchParams();
      p.set("hotel_id", hotel.hotel_id || "");
      p.set("hotel_name", hotel.hotel_name || "");
      p.set("country", hotel.country || country);
      p.set("city", hotel.city || city);
      p.set("checkin", checkin);
      p.set("checkout", checkout);
      p.set("guests", String(guests));
      p.set("rooms", String(rooms));

      const res = await fetch(`${API_BASE}/api/hotels/live-check?${p.toString()}`, { cache: "no-store" });
      const data = await res.json();

      if (data.ok && data.payment_ready && data.first_rate) {
        const updated = {
          ...hotel,
          live_rate_ready: true,
          first_rate: data.first_rate,
          rooms: data.rooms || hotel.rooms || [],
          room_count: Array.isArray(data.rooms) ? data.rooms.length : hotel.room_count || 1,
        };
        setSelectedHotel(updated);
        setHotels((list) => list.map((h) => (h.hotel_id === hotel.hotel_id ? updated : h)));
        setMessage("Current price is available for this stay.");
      } else {
        setMessage("Latest price will be confirmed before payment.");
      }
    } catch {
      setMessage("Price check is temporarily unavailable.");
    } finally {
      setCheckingPrice(false);
    }
  }

  async function convertCurrency() {
    if (!selectedLive || !selectedCurrency || !selectedTotal) {
      setConverted("Select a stay with a current price first.");
      return;
    }

    try {
      const p = new URLSearchParams();
      p.set("amount", String(selectedTotal));
      p.set("from_currency", selectedCurrency);
      p.set("to_currency", targetCurrency);

      const res = await fetch(`${API_BASE}/api/currency/convert?${p.toString()}`, { cache: "no-store" });
      const data = await res.json();

      if (data.ok) {
        setConverted(`${targetCurrency} ${money(data.converted)}`);
      } else {
        setConverted("Conversion unavailable");
      }
    } catch {
      setConverted("Conversion unavailable");
    }
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
    setMessage(selectedLive ? "Preparing your reservation..." : "Sending confirmation request...");

    try {
      const rate = hotel.first_rate || {};
      const payload = {
        hotel_id: hotel.hotel_id,
        hotel_name: hotel.hotel_name,
        destination: `${hotel.city}, ${hotel.country}`,
        checkin,
        checkout,
        guests: safeNumber(guests, 1),
        rooms: safeNumber(rooms, 1),
        customer_name: customerName.trim(),
        customer_email: customerEmail.trim(),
        customer_phone: customerPhone.trim(),
        note: note.trim(),
        rate_key: rate.rate_key || "",
        amount: selectedLive ? selectedTotal : "",
        currency: rate.currency || "",
        room_name: rate.room_name || "",
        board_name: rate.board_name || "",
        price_display: selectedLive ? `${rate.currency} ${money(selectedTotal)}` : "Confirmation required",
      };

      const res = await fetch(`${API_BASE}/reservation-request`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const data = await res.json();

      if (!res.ok || !data.ok) {
        setMessage(data.message || "Reservation could not be created.");
        return;
      }

      if (data.payment_url) {
        window.location.href = data.payment_url;
        return;
      }

      setMessage(
        selectedLive
          ? `Reservation prepared: ${data.reservation_code}.`
          : `Request received: ${data.reservation_code}. We will confirm availability and price before payment.`
      );
    } catch {
      setMessage("Reservation service is temporarily unavailable.");
    } finally {
      setRequesting(false);
    }
  }

  return (
    <div className="page">
      <AppStyles />

      <section className="hero">
        <div>
          <div className="brand">MYSPACE HOTEL</div>
          <h1>Book with clarity before you arrive.</h1>
          <p>Choose hotels or apartments, review your full stay total, and continue with confidence.</p>
        </div>

        <div className="heroButtons">
          <button onClick={() => go(`/?page=travel&country=${encodeURIComponent(country)}&city=${encodeURIComponent(city)}&area=${encodeURIComponent(area)}`)}>Destination Guide</button>
          <button onClick={() => go("/?page=faq")}>FAQ</button>
          <button onClick={() => go("/?page=terms")}>Terms</button>
          <button onClick={() => go("/?page=support")}>Contact</button>
        </div>
      </section>

      <section className="mainGrid">
        <div className="column">
          <div className="label">SEARCH</div>

          <div className="box scrollBox">
            <div className="statusBox">
              {loadingCatalog ? "Loading destinations..." : "Choose your destination and stay type."}
            </div>

            <label>Country</label>
            <select value={country} onChange={(e) => changeCountry(e.target.value)}>
              <option value="">Choose country</option>
              {catalog.map((c) => (
                <option key={c.country} value={c.country}>{c.country}</option>
              ))}
            </select>

            <label>Destination</label>
            <select value={city} onChange={(e) => changeCity(e.target.value)} disabled={!country}>
              <option value="">Choose destination</option>
              {cities.map((c) => (
                <option key={`${country}-${c.city}`} value={c.city}>{c.city}</option>
              ))}
            </select>

            <label>Stay type</label>
            <select value={stayType} onChange={(e) => changeStayType(e.target.value)}>
              <option value="hotel">Hotels only</option>
              <option value="apartment">Apartments and residences only</option>
              <option value="all">All stay types</option>
            </select>

            <label>Area</label>
            <input value={area} onChange={(e) => setArea(e.target.value)} placeholder="Neighbourhood or area" />

            <label>Keyword</label>
            <input value={keyword} onChange={(e) => setKeyword(e.target.value)} placeholder="Property name or landmark" />

            <div className="two">
              <div>
                <label>Check-in</label>
                <input type="date" value={checkin} onChange={(e) => { setCheckin(e.target.value); setConverted(""); }} />
              </div>
              <div>
                <label>Check-out</label>
                <input type="date" value={checkout} onChange={(e) => { setCheckout(e.target.value); setConverted(""); }} />
              </div>
            </div>

            <div className="two">
              <div>
                <label>Guests</label>
                <input type="number" min="1" value={guests} onChange={(e) => setGuests(safeNumber(e.target.value, 1))} />
              </div>
              <div>
                <label>Rooms</label>
                <input type="number" min="1" value={rooms} onChange={(e) => { setRooms(safeNumber(e.target.value, 1)); setConverted(""); }} />
              </div>
            </div>

            <button className="goldButton" disabled={loadingHotels || loadingCatalog} onClick={() => searchHotels()}>
              {loadingHotels ? "Searching..." : "Search stays"}
            </button>

            {message && <div className="notice">{message}</div>}
          </div>
        </div>

        <div className="column">
          <div className="label">STAYS</div>

          <div className="results">
            {hotels.map((hotel, index) => {
              const live = isLive(hotel);
              const total = totalAmount(hotel, rooms);

              return (
                <div
                  key={`${hotel.hotel_id || hotel.hotel_name}-${index}`}
                  className={selectedHotel?.hotel_id === hotel.hotel_id ? "hotelCard selectedCard" : "hotelCard"}
                  onClick={() => { setSelectedHotel(hotel); setConverted(""); }}
                >
                  <PropertyImage hotel={hotel} />

                  <div className="hotelBody">
                    <div className="topLine">
                      <span className="typeBadge">{stayTypeLabel(hotel)}</span>
                      <span className={live ? "liveBadge" : "confirmBadge"}>
                        {live ? "Current price available" : "Check latest price"}
                      </span>
                    </div>

                    <h2>{hotel.hotel_name}</h2>
                    <p className="location">{hotel.area ? `${hotel.area}, ` : ""}{hotel.city}, {hotel.country}</p>

                    {live ? (
                      <div className="pricePanel">
                        <div className="priceRow"><span>Rate per room</span><b>{hotel.first_rate.currency} {money(rateAmount(hotel))}</b></div>
                        <div className="priceRow"><span>Rooms selected</span><b>{safeNumber(rooms, 1)}</b></div>
                        <div className="priceRow total"><span>Total</span><b>{hotel.first_rate.currency} {money(total)}</b></div>
                      </div>
                    ) : (
                      <div className="confirmPanel">We will confirm today&apos;s availability and final price before payment.</div>
                    )}

                    <button className="darkButton" onClick={(e) => { e.stopPropagation(); setSelectedHotel(hotel); setConverted(""); }}>
                      View stay
                    </button>
                  </div>
                </div>
              );
            })}

            {!loadingHotels && hotels.length === 0 && (
              <div className="emptyBox">Choose your destination and press Search stays.</div>
            )}
          </div>
        </div>

        <div className="column">
          <div className="label">RESERVE / PAY</div>

          {!selectedHotel ? (
            <div className="emptyBox">Select a stay to continue.</div>
          ) : (
            <div className="box scrollBox">
              <PropertyImage hotel={selectedHotel} large />

              <div className="topLine">
                <span className="typeBadge">{stayTypeLabel(selectedHotel)}</span>
                <span className={selectedLive ? "liveBadge" : "confirmBadge"}>
                  {selectedLive ? "Current price available" : "Confirmation required"}
                </span>
              </div>

              <h2>{selectedHotel.hotel_name}</h2>
              <p className="location">{selectedHotel.area ? `${selectedHotel.area}, ` : ""}{selectedHotel.city}, {selectedHotel.country}</p>

              <div className="totalBox">
                <div className="totalSmall">Stay total</div>
                <div className="totalBig">
                  {selectedLive ? `${selectedCurrency} ${money(selectedTotal)}` : "Price to be confirmed"}
                </div>
                <div className="totalNote">
                  {nights} night{nights === 1 ? "" : "s"} | {safeNumber(guests, 1)} guest{safeNumber(guests, 1) === 1 ? "" : "s"} | {safeNumber(rooms, 1)} room{safeNumber(rooms, 1) === 1 ? "" : "s"}
                </div>
              </div>

              {!selectedLive && (
                <button className="darkButton" disabled={checkingPrice} onClick={() => checkLivePrice(selectedHotel)}>
                  {checkingPrice ? "Checking..." : "Check latest price"}
                </button>
              )}

              {selectedLive && (
                <>
                  <div className="pricePanel">
                    <div className="priceRow"><span>Rate per room</span><b>{selectedCurrency} {money(rateAmount(selectedHotel))}</b></div>
                    <div className="priceRow"><span>Rooms selected</span><b>{safeNumber(rooms, 1)}</b></div>
                    <div className="priceRow total"><span>Total to pay</span><b>{selectedCurrency} {money(selectedTotal)}</b></div>
                  </div>

                  <div className="currencyBox">
                    <b>Currency converter</b>
                    <div className="currencyRow">
                      <select value={targetCurrency} onChange={(e) => { setTargetCurrency(e.target.value); setConverted(""); }}>
                        {["USD", "GBP", "EUR", "NGN", "AED", "CAD", "AUD", "ZAR", "CHF", "JPY", "KES", "GHS", "INR", "SGD"].map((c) => (
                          <option key={c} value={c}>{c}</option>
                        ))}
                      </select>
                      <button onClick={convertCurrency}>Convert</button>
                    </div>
                    <div className="convertedText">{converted || "Convert your total to another currency."}</div>
                  </div>
                </>
              )}

              <div className="mapBox">
                <iframe
                  title="Property map"
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

              <button className="goldButton" disabled={requesting} onClick={() => reserveOrPay(selectedHotel)}>
                {requesting ? "Working..." : selectedLive ? "Continue securely" : "Request confirmation"}
              </button>

              <button className="guideButton" onClick={() => go(`/?page=travel&country=${encodeURIComponent(selectedHotel.country)}&city=${encodeURIComponent(selectedHotel.city)}&area=${encodeURIComponent(selectedHotel.area || area)}`)}>
                Open destination guide
              </button>

              <div className="safeBox">
                {selectedLive
                  ? "Your total reflects the selected number of rooms."
                  : "No payment is taken until availability and price are confirmed."}
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
      body { margin: 0; background: #04101f; font-family: Arial, sans-serif; }
      button, input, select, textarea { font-family: inherit; }
      .page { min-height: 100vh; background: #04101f; color: white; padding: 18px; }
      .hero { background: linear-gradient(135deg,#10306f,#1f5dca); border-radius: 24px; padding: 28px; display: grid; grid-template-columns: 1.15fr .85fr; gap: 20px; margin-bottom: 18px; align-items: center; }
      .brand, .brandSmall { letter-spacing: 12px; font-weight: 900; color: #ffd34d; margin-bottom: 12px; }
      .hero h1 { font-size: 40px; line-height: 1.08; margin: 0; }
      .hero p { font-size: 20px; line-height: 1.45; margin: 14px 0 0; }
      .heroButtons { display: grid; grid-template-columns: 1fr 1fr; gap: 14px; }
      .heroButtons button { background: white; color: #06101f; border: 0; border-radius: 14px; padding: 18px 16px; font-weight: 900; font-size: 16px; cursor: pointer; }
      .mainGrid { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 18px; }
      .column { background: #eaf1fb; color: #06101f; border-radius: 24px; padding: 18px; height: 73vh; display: flex; flex-direction: column; overflow: hidden; }
      .label { letter-spacing: 5px; font-weight: 900; color: #687892; margin-bottom: 12px; }
      .box, .emptyBox { background: white; border-radius: 18px; padding: 16px; }
      .scrollBox, .results { overflow-y: auto; padding-right: 6px; }
      .statusBox, .notice { background: #fff1b8; border-radius: 14px; padding: 13px; margin-bottom: 14px; font-weight: 800; line-height: 1.4; }
      label { display: block; margin-top: 10px; margin-bottom: 5px; font-weight: 900; }
      input, select, textarea { width: 100%; padding: 13px 14px; border-radius: 12px; border: 1px solid #cbd6e7; font-size: 16px; margin-bottom: 10px; background: white; color: #06101f; }
      textarea { min-height: 92px; resize: vertical; }
      .two { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
      .goldButton { width: 100%; background: #ffd34d; color: #06101f; border: 2px solid #06101f; border-radius: 14px; padding: 15px 16px; font-weight: 900; font-size: 18px; cursor: pointer; margin-top: 12px; }
      .guideButton { width: 100%; background: #112a5f; color: white; border: 0; border-radius: 14px; padding: 15px 16px; font-weight: 900; font-size: 16px; cursor: pointer; margin-top: 10px; }
      .hotelCard { background: white; border-radius: 20px; overflow: hidden; margin-bottom: 18px; cursor: pointer; border: 2px solid transparent; }
      .selectedCard { border: 4px solid #ffd34d; }
      .propertyImage, .imageFallback { width: 100%; height: 200px; object-fit: cover; display: block; background: #10254a; }
      .imageLarge { height: 210px; border-radius: 16px; margin-bottom: 12px; }
      .imageFallback { background: linear-gradient(135deg,#10254a,#1d4da8); color: white; padding: 24px; display: flex; flex-direction: column; justify-content: center; }
      .imageBrand { letter-spacing: 7px; font-weight: 900; font-size: 11px; }
      .imageFallbackTitle { font-size: 22px; font-weight: 900; margin-top: 12px; }
      .imageFallbackText { margin-top: 10px; line-height: 1.4; }
      .hotelBody { padding: 16px; }
      .topLine { display: flex; justify-content: space-between; gap: 10px; align-items: center; margin-bottom: 12px; }
      .typeBadge, .liveBadge, .confirmBadge { border-radius: 999px; padding: 8px 11px; font-size: 12px; font-weight: 900; }
      .typeBadge { background: #dce8ff; color: #0f3e8f; }
      .liveBadge { background: #dff7e6; color: #075b24; }
      .confirmBadge { background: #fff1b8; color: #6b4d00; }
      h2 { margin: 0; font-size: 22px; font-weight: 900; }
      .location { margin-top: 8px; color: #62728c; font-weight: 700; line-height: 1.35; }
      .pricePanel, .confirmPanel, .currencyBox { background: #f5f8fd; border-radius: 14px; padding: 14px; margin-top: 14px; line-height: 1.6; }
      .confirmPanel { background: #fff1b8; color: #6b4d00; font-weight: 800; }
      .priceRow { display: flex; justify-content: space-between; gap: 12px; border-bottom: 1px solid #dbe5f2; padding: 7px 0; }
      .priceRow.total { border-bottom: 0; color: #0f4db3; font-size: 18px; font-weight: 900; }
      .darkButton { width: 100%; margin-top: 14px; background: #112a5f; color: white; border: 0; border-radius: 14px; padding: 14px 15px; font-weight: 900; font-size: 16px; cursor: pointer; }
      .totalBox { background: #dff7e6; color: #0a5d27; border-radius: 16px; padding: 16px; margin: 14px 0; }
      .totalSmall { font-weight: 900; }
      .totalBig { font-size: 30px; font-weight: 900; margin-top: 8px; }
      .totalNote { margin-top: 8px; font-weight: 800; line-height: 1.35; }
      .currencyRow { display: grid; grid-template-columns: 1fr auto; gap: 10px; margin-top: 10px; }
      .currencyRow button { background: #112a5f; color: white; border: 0; border-radius: 12px; padding: 0 18px; font-weight: 900; cursor: pointer; }
      .convertedText { color: #0f4db3; font-weight: 900; margin-top: 8px; }
      .mapBox { background: #f5f8fd; border-radius: 16px; padding: 8px; margin: 14px 0; }
      iframe { width: 100%; height: 190px; border: 0; border-radius: 12px; }
      .safeBox { background: #dff7e6; border-radius: 14px; padding: 14px; margin-top: 14px; font-weight: 800; color: #0a5d27; line-height: 1.5; }
      .infoPage { min-height: 100vh; background: linear-gradient(135deg,#06101f,#123b7b); padding: 28px; color: white; }
      .infoCard { max-width: 1180px; margin: 0 auto; background: rgba(255,255,255,0.12); border: 1px solid rgba(255,255,255,0.22); border-radius: 24px; padding: 34px; }
      .infoCard h1 { font-size: 46px; margin: 0 0 12px; color: #ffd34d; }
      .infoCard p { font-size: 20px; line-height: 1.5; font-weight: 800; margin-bottom: 24px; }
      .guideGrid, .simpleGrid { display: grid; grid-template-columns: 1fr 1fr; gap: 18px; }
      .guideCard, .simpleBox { background: white; color: #06101f; border-radius: 18px; padding: 20px; font-size: 17px; line-height: 1.55; }
      .guideCard h2 { color: #123b7b; margin-bottom: 10px; }
      .redGuide h2 { color: #9d1111; }
      .guideCard button { background: #112a5f; color: white; border: 0; border-radius: 12px; padding: 12px 14px; font-weight: 900; margin: 6px 8px 0 0; cursor: pointer; }
      @media (max-width: 980px) {
        .hero, .mainGrid, .guideGrid, .simpleGrid { grid-template-columns: 1fr; }
        .column { height: auto; min-height: 420px; }
      }
    `}</style>
  );
}

