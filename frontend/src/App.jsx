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

function money(v) {
  const n = Number(v || 0);
  return Number.isFinite(n) ? n.toFixed(2) : "0.00";
}

function openMapsSearch(query) {
  window.open(`https://www.google.com/maps/search/${encodeURIComponent(query)}`, "_blank", "noopener,noreferrer");
}

function PropertyImage({ hotel }) {
  const [failed, setFailed] = useState(false);

  if (!hotel?.image_url || failed) {
    return (
      <div style={styles.realImageMissing}>
        <div style={styles.imageBadge}>MYSPACE HOTEL</div>
        <div style={styles.imageMissingTitle}>Verified property image coming soon</div>
        <div style={styles.imageMissingText}>No fake hotel photos are displayed.</div>
      </div>
    );
  }

  return (
    <img
      loading="lazy"
      decoding="async"
      fetchPriority="low"
      src={hotel.image_url}
      alt={hotel.hotel_name}
      style={styles.hotelImage}
      onError={() => setFailed(true)}
    />
  );
}

function InfoPage({ title, subtitle, children }) {
  return (
    <div style={styles.infoPage}>
      <div style={styles.infoCardWide}>
        <div style={styles.brandSmall}>MYSPACE HOTEL</div>
        <h1 style={styles.infoTitle}>{title}</h1>
        {subtitle && <p style={styles.infoSubtitle}>{subtitle}</p>}
        <div style={styles.infoBody}>{children}</div>
        <button style={styles.goldSmall} onClick={() => (window.location.href = "/")}>
          Back to hotel search
        </button>
      </div>
    </div>
  );
}

function TravelGuides() {
  const guideBoxes = [
    {
      title: "Emergency safety",
      text: "Police, ambulance, fire brigade, nearest hospital, pharmacy, embassy support, and local emergency contacts.",
      action: "Find emergency help",
      query: "police ambulance fire hospital emergency near me",
    },
    {
      title: "Nearby food",
      text: "Restaurants, cafés, halal food, family dining, breakfast spots, supermarkets, and late-night food close to your hotel.",
      action: "Find restaurants",
      query: "restaurants near me",
    },
    {
      title: "Airport and transport",
      text: "Local airport, train stations, taxi pickup, bus terminals, car hire, and airport transfer options near your destination.",
      action: "Find airport transport",
      query: "airport train station taxi near me",
    },
    {
      title: "Family attractions",
      text: "Zoos, aquariums, theme parks, parks, children-friendly attractions, and nearby family day-out ideas.",
      action: "Find attractions",
      query: "zoo aquarium family attractions near me",
    },
    {
      title: "Culture and museums",
      text: "Museums, galleries, historical sites, monuments, walking tours, city tours, and local heritage experiences.",
      action: "Find museums",
      query: "museums tours historical places near me",
    },
    {
      title: "Tour bus and visitor help",
      text: "Tour bus companies, visitor information centres, guided tours, local travel desks, and trusted visitor support.",
      action: "Find tour help",
      query: "tour bus visitor information centre near me",
    },
  ];

  return (
    <InfoPage
      title="Premium travel guide"
      subtitle="A customer-first guide for safer, easier, better hotel stays."
    >
      <div style={styles.guideHero}>
        <h2 style={styles.guideHeroTitle}>Travel prepared, not confused.</h2>
        <p>
          MySpace Hotel helps customers think beyond the room: safety, transport, food, attractions,
          hospitals, airports, museums, tour buses, and important local services.
        </p>
      </div>

      <div style={styles.guideGrid}>
        {guideBoxes.map((box) => (
          <div key={box.title} style={styles.guideBox}>
            <h2 style={styles.guideBoxTitle}>{box.title}</h2>
            <p style={styles.guideBoxText}>{box.text}</p>
            <button style={styles.guideButton} onClick={() => openMapsSearch(box.query)}>
              {box.action}
            </button>
          </div>
        ))}
      </div>

      <div style={styles.safetyStrip}>
        <b>Important:</b> Emergency numbers vary by country. Customers should confirm the local police,
        ambulance, and fire number at check-in, with hotel reception, or through official local authority guidance.
      </div>
    </InfoPage>
  );
}

function FAQs() {
  return (
    <InfoPage title="Frequently asked questions" subtitle="Clear answers before customers reserve or pay.">
      <div style={styles.simpleGrid}>
        <div style={styles.simpleBox}><b>Can I pay online?</b><br />Yes, only when a valid live Hotelbeds rate is available.</div>
        <div style={styles.simpleBox}><b>Are images fake?</b><br />No. Missing photos show a trust notice instead of fake images.</div>
        <div style={styles.simpleBox}><b>Why no price?</b><br />Some hotels are catalogue-only or unavailable for the chosen dates.</div>
        <div style={styles.simpleBox}><b>Will I get confirmation?</b><br />Reservation updates are sent to the email provided.</div>
      </div>
    </InfoPage>
  );
}

function Terms() {
  return (
    <InfoPage title="Booking terms" subtitle="Customer trust depends on accurate hotel and rate information.">
      <div style={styles.simpleGrid}>
        <div style={styles.simpleBox}>Review hotel name, room, board, dates, guests, currency, amount, and cancellation details before payment.</div>
        <div style={styles.simpleBox}>Prices and availability can change until the reservation is completed.</div>
        <div style={styles.simpleBox}>Payment is enabled only for hotels with valid live rate keys and payable amounts.</div>
        <div style={styles.simpleBox}>No fake photos, no fake prices, and no misleading availability should be shown.</div>
      </div>
    </InfoPage>
  );
}

function Support() {
  return (
    <InfoPage title="Customer support" subtitle="Reservation support for safer booking decisions.">
      <div style={styles.simpleGrid}>
        <div style={styles.simpleBox}><b>Email</b><br />reservations@myspace-hotel.com</div>
        <div style={styles.simpleBox}><b>Booking help</b><br />Include hotel name, dates, destination, and booking email.</div>
        <div style={styles.simpleBox}><b>Payment help</b><br />Send your reservation code and the payment issue.</div>
        <div style={styles.simpleBox}><b>Special requests</b><br />Add mobility, room, arrival, or family requirements before payment.</div>
      </div>
    </InfoPage>
  );
}

function Confirmed() {
  const params = new URLSearchParams(window.location.search);
  const code = params.get("code") || "Your reservation";
  const [status, setStatus] = useState("Confirming payment update...");

  useEffect(() => {
    if (!code || code === "Your reservation") return;
    fetch(`${API_BASE}/reservation/${code}/mark-paid`, { method: "POST" })
      .then(() => setStatus("Payment received. Reservation update is being processed securely."))
      .catch(() => setStatus("Payment received. Reservation update is being processed securely."));
  }, [code]);

  return (
    <div style={styles.confirmPage}>
      <div style={styles.confirmCard}>
        <div style={styles.brandSmall}>MYSPACE HOTEL</div>
        <h1 style={styles.confirmTitle}>Payment received</h1>
        <p style={styles.confirmText}>{status}</p>
        <div style={styles.codeBox}>
          <b>Reservation code:</b>
          <div style={styles.codeText}>{code}</div>
        </div>
        <button style={styles.goldSmall} onClick={() => (window.location.href = "/")}>
          Back to hotel search
        </button>
      </div>
    </div>
  );
}

export default function App() {
  const pageParams = new URLSearchParams(window.location.search);
  const page = pageParams.get("page");
  const path = window.location.pathname;

  if (page === "travel" || path === "/travel") return <TravelGuides />;
  if (page === "faq" || path === "/faq") return <FAQs />;
  if (page === "terms" || path === "/terms") return <Terms />;
  if (page === "support" || path === "/support") return <Support />;
  if (path === "/reservation-confirmed") return <Confirmed />;

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

  const [targetCurrency, setTargetCurrency] = useState("USD");
  const [convertedTotal, setConvertedTotal] = useState("");

  const selectedCountry = useMemo(() => {
    return catalog.find((x) => x.country === country) || null;
  }, [catalog, country]);

  const cities = useMemo(() => {
    const source = selectedCountry?.cities || [];
    const map = new Map();

    for (const item of source) {
      const rawCity = String(item.city || "").trim();
      if (!rawCity) continue;

      const cleanCity = rawCity
        .replace(/\s+/g, " ")
        .replace(/\s*,\s*/g, ", ")
        .trim();

      const key = cleanCity.toLowerCase();

      if (!map.has(key)) {
        map.set(key, { ...item, city: cleanCity });
      } else {
        const existing = map.get(key);
        map.set(key, {
          ...existing,
          live_hotels: Math.max(Number(existing.live_hotels || 0), Number(item.live_hotels || 0)),
          image_hotels: Math.max(Number(existing.image_hotels || 0), Number(item.image_hotels || 0)),
        });
      }
    }

    return [...map.values()].sort((a, b) => String(a.city).localeCompare(String(b.city)));
  }, [selectedCountry]);

  function clearConverted() {
    setConvertedTotal("0.00");
  }

  function selectHotel(hotel) {
    setSelectedHotel(hotel);
    clearConverted();
  }

  async function runSearch(nextCountry = country, nextCity = city) {
    if (!nextCountry || !nextCity) return;

    setLoading(true);
    setSelectedHotel(null);
    clearConverted();
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

      const list = Array.isArray(data.hotels)
        ? data.hotels.sort((a, b) => {
            const ap = a.live_rate_ready && Number(a?.first_rate?.amount || 0) > 0 ? 1 : 0;
            const bp = b.live_rate_ready && Number(b?.first_rate?.amount || 0) > 0 ? 1 : 0;
            if (ap !== bp) return bp - ap;
            return String(a.hotel_name || "").localeCompare(String(b.hotel_name || ""));
          })
        : [];

      setHotels(list);

      if (list.length > 0) {
        selectHotel(list[0]);
        setMessage(`${list.length} hotels found in ${nextCity}. Live payable hotels are shown first.`);
      } else {
        setMessage(`No hotels found in ${nextCity}. Choose another city or date.`);
      }
    } catch {
      setHotels([]);
      setMessage("Backend unavailable. Restart backend and frontend.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    async function loadCatalog() {
      setLoadingCatalog(true);

      try {
        const res = await fetch(`${API_BASE}/api/real-catalog/destinations`);
        const data = await res.json();
        const countries = Array.isArray(data.countries) ? data.countries : [];
        setCatalog(countries);

        const firstLiveCountry =
          countries.find((c) => c.cities?.some((x) => Number(x.live_hotels || 0) > 0)) ||
          countries[0];

        const firstLiveCity =
          firstLiveCountry?.cities?.find((x) => Number(x.live_hotels || 0) > 0) ||
          firstLiveCountry?.cities?.[0];

        const nextCountry = firstLiveCountry?.country || "";
        const nextCity = firstLiveCity?.city || "";

        setCountry(nextCountry);
        setCity(nextCity);

        if (nextCountry && nextCity) {
          setTimeout(() => runSearch(nextCountry, nextCity), 0);
        }
      } catch {
        setMessage("Could not load country and city catalogue.");
      } finally {
        setLoadingCatalog(false);
      }
    }

    loadCatalog();
  }, []);

  function changeCountry(nextCountry) {
    const found = catalog.find((x) => x.country === nextCountry);
    const liveCity = found?.cities?.find((x) => Number(x.live_hotels || 0) > 0);
    const firstCity = liveCity || found?.cities?.[0];

    setCountry(nextCountry);
    setCity(firstCity?.city || "");
    setHotels([]);
    setSelectedHotel(null);
    clearConverted();
    setMessage("");
  }

  async function convertTotal() {
    if (!selectedHotel?.live_rate_ready || !Number(selectedHotel?.first_rate?.amount || 0)) {
      setConvertedTotal("0.00");
      return;
    }

    try {
      const total = Number(selectedHotel.first_rate.amount || 0) * Number(rooms || 1);
      const params = new URLSearchParams();
      params.set("amount", String(total));
      params.set("from", selectedHotel.first_rate.currency);
      params.set("to", targetCurrency);

      const res = await fetch(`${API_BASE}/api/currency/convert?${params.toString()}`);
      const data = await res.json();

      if (!data.ok) {
        setConvertedTotal("0.00");
        return;
      }

      setConvertedTotal(`${targetCurrency} ${money(data.converted)}`);
    } catch {
      setConvertedTotal("0.00");
    }
  }

  async function requestBooking(hotel = selectedHotel) {
    if (!hotel) return setMessage("Select a live-rate hotel first.");
    if (!hotel.live_rate_ready || !Number(hotel?.first_rate?.amount || 0)) return setMessage("Payment blocked because this hotel has no live rate.");
    if (!customerName.trim() || !customerEmail.trim()) return setMessage("Enter your name and email before payment.");

    selectHotel(hotel);
    setRequesting(true);
    setMessage("Preparing secure Stripe checkout...");

    try {
      const rate = hotel.first_rate;

      const payload = {
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
        rate_key: rate.rate_key,
        amount: Number(rate.amount) * Number(rooms || 1),
        currency: rate.currency,
        room_name: rate.room_name,
        board_name: rate.board_name,
        payment_type: rate.payment_type,
        cancellation_policies: rate.cancellation_policies || [],
      };

      const res = await fetch(`${API_BASE}/reservation-request`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const data = await res.json();

      if (!res.ok || !data.ok) {
        setMessage(data.message || "Could not prepare secure checkout.");
        return;
      }

      if (data.payment_url) {
        window.location.href = data.payment_url;
        return;
      }

      setMessage(`Reservation created: ${data.reservation_code}.`);
    } catch {
      setMessage("Secure booking service unavailable.");
    } finally {
      setRequesting(false);
    }
  }

  function reserveHotel(hotel) {
    selectHotel(hotel);
    setMessage(`Reserved for review: ${hotel.hotel_name}. Enter customer details, then press Pay.`);
  }

  const selectedCanPay =
    selectedHotel?.live_rate_ready &&
    selectedHotel?.first_rate?.rate_key &&
    Number(selectedHotel?.first_rate?.amount || 0) > 0;

  return (
    <div style={styles.page}>
      <section style={styles.hero}>
        <div>
          <div style={styles.brand}>MYSPACE HOTEL</div>
          <h1 style={styles.heroTitle}>Hotelbeds live rates with secure reserve and pay.</h1>
          <p style={styles.heroText}>
            Full supplier catalogue loaded. Payment is only available for hotels with live Hotelbeds rates.
          </p>
        </div>

        <div style={styles.buttonRow}>
          <button style={styles.whiteButton} onClick={() => (window.location.href = "/?page=travel")}>Guide</button>
          <button style={styles.whiteButton} onClick={() => (window.location.href = "/?page=faq")}>FAQ</button>
          <button style={styles.whiteButton} onClick={() => (window.location.href = "/?page=terms")}>Terms</button>
          <button style={styles.whiteButton} onClick={() => (window.location.href = "/?page=support")}>Contact</button>
        </div>
      </section>

      <section style={styles.mainGrid}>
        <div style={styles.column}>
          <div style={styles.label}>SEARCH</div>

          <div style={styles.searchBox}>
            <p style={styles.muted}>
              {loadingCatalog ? "Loading catalogue..." : `${catalog.length} countries loaded. Cities are separated by country.`}
            </p>

            <label style={styles.formLabel}>Country</label>
            <select style={styles.input} value={country} onChange={(e) => changeCountry(e.target.value)}>
              {catalog.map((c) => (
                <option key={c.country} value={c.country}>
                  {c.country}
                </option>
              ))}
            </select>

            <label style={styles.formLabel}>City</label>
            <select style={styles.input} value={city} onChange={(e) => {
              setCity(e.target.value);
              setHotels([]);
              setSelectedHotel(null);
              clearConverted();
            }}>
              {cities.map((c) => (
                <option key={c.city} value={c.city}>
                  {c.city}
                </option>
              ))}
            </select>

            <label style={styles.formLabel}>Area</label>
            <input style={styles.input} value={area} onChange={(e) => setArea(e.target.value)} placeholder="Neighbourhood or area" />

            <label style={styles.formLabel}>Keyword</label>
            <input style={styles.input} value={keyword} onChange={(e) => setKeyword(e.target.value)} placeholder="Hotel name or keyword" />

            <div style={styles.twoInput}>
              <div>
                <label style={styles.formLabel}>Check-in</label>
                <input style={styles.input} type="date" value={checkin} onChange={(e) => {
                  setCheckin(e.target.value);
                  clearConverted();
                }} />
              </div>
              <div>
                <label style={styles.formLabel}>Check-out</label>
                <input style={styles.input} type="date" value={checkout} onChange={(e) => {
                  setCheckout(e.target.value);
                  clearConverted();
                }} />
              </div>
            </div>

            <div style={styles.twoInput}>
              <div>
                <label style={styles.formLabel}>Guests</label>
                <input style={styles.input} type="number" min="1" value={guests} onChange={(e) => {
                  setGuests(Number(e.target.value));
                  clearConverted();
                }} />
              </div>
              <div>
                <label style={styles.formLabel}>Rooms</label>
                <input style={styles.input} type="number" min="1" value={rooms} onChange={(e) => {
                  setRooms(Number(e.target.value));
                  clearConverted();
                }} />
              </div>
            </div>

            <button style={styles.goldButton} onClick={() => runSearch()} disabled={loading || loadingCatalog}>
              {loading ? "Loading live rates..." : "Search Hotelbeds live rates"}
            </button>

            {message && <div style={styles.notice}>{message}</div>}
          </div>
        </div>

        <div style={styles.column}>
          <div style={styles.label}>LIVE HOTELS</div>

          <div style={styles.scroll}>
            {hotels.map((hotel) => {
              const rate = hotel.first_rate || {};
              const canPay = hotel.live_rate_ready && rate.rate_key && Number(rate.amount || 0) > 0;

              return (
                <div
                  key={hotel.hotel_id}
                  style={selectedHotel?.hotel_id === hotel.hotel_id ? styles.hotelCardSelected : styles.hotelCard}
                  onClick={() => selectHotel(hotel)}
                >
                  <PropertyImage hotel={hotel} />

                  <div style={styles.hotelBody}>
                    <h2 style={styles.hotelName}>{hotel.hotel_name}</h2>
                    <p style={styles.hotelLocation}>{hotel.area ? `${hotel.area}, ` : ""}{hotel.city}, {hotel.country}</p>

                    <div style={canPay ? styles.rateGood : styles.rateBlocked}>
                      {canPay ? "Live Hotelbeds payable rate" : "Live price unavailable for selected dates"}
                    </div>

                    {canPay ? (
                      <div style={styles.rateBox}>
                        <p><b>Room:</b> {rate.room_name}</p>
                        <p><b>Board:</b> {rate.board_name}</p>
                        <p><b>Payment:</b> {rate.payment_type}</p>
                        <p><b>Price:</b> {rate.currency} {money(rate.amount)}</p>
                      </div>
                    ) : (
                      <div style={styles.rateBox}>
                        Real-time hotel rate required. No fake price is shown.
                      </div>
                    )}

                    <div style={styles.buttonPair}>
                      <button
                        style={styles.reserveMini}
                        onClick={(e) => {
                          e.stopPropagation();
                          reserveHotel(hotel);
                        }}
                      >
                        Reserve
                      </button>

                      <button
                        style={canPay ? styles.payMini : styles.payDisabled}
                        disabled={!canPay}
                        onClick={(e) => {
                          e.stopPropagation();
                          requestBooking(hotel);
                        }}
                      >
                        {canPay ? "Pay" : "Unavailable"}
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}

            {!loading && hotels.length === 0 && (
              <div style={styles.emptyBox}>
                No live-rate hotels loaded for this city. Select another city, then search again.
              </div>
            )}
          </div>
        </div>

        <div style={styles.column}>
          <div style={styles.label}>RESERVE / PAY</div>

          {!selectedHotel ? (
            <div style={styles.emptyBox}>
              Select a hotel to reserve or pay.
            </div>
          ) : (
            <div style={styles.reservePanel}>
              <h2 style={styles.hotelName}>{selectedHotel.hotel_name}</h2>

              {selectedCanPay ? (
                <div style={styles.selectedPrice}>
                  {selectedHotel.first_rate.currency} {money(Number(selectedHotel.first_rate.amount || 0) * Number(rooms || 1))}
                </div>
              ) : (
                <div style={styles.selectedUnavailable}>
                  Live price unavailable for selected dates.
                </div>
              )}

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

              <div style={styles.currencyBox}>
                <div style={styles.currencyTitle}>Currency converter</div>
                <div style={styles.currencyRow}>
                  <select style={styles.currencySelect} value={targetCurrency} onChange={(e) => {
                    setTargetCurrency(e.target.value);
                    setConvertedTotal("0.00");
                  }}>
                    {["USD", "GBP", "EUR", "NGN", "AED", "CAD", "AUD", "ZAR", "CHF", "JPY"].map((c) => (
                      <option key={c} value={c}>{c}</option>
                    ))}
                  </select>
                  <button style={styles.convertButton} onClick={convertTotal}>
                    Convert
                  </button>
                </div>
                <div style={styles.convertedText}>
                  {convertedTotal || "0.00"}
                </div>
              </div>

              <input style={styles.input} value={customerName} onChange={(e) => setCustomerName(e.target.value)} placeholder="Your full name" />
              <input style={styles.input} value={customerEmail} onChange={(e) => setCustomerEmail(e.target.value)} placeholder="Your email" />
              <input style={styles.input} value={customerPhone} onChange={(e) => setCustomerPhone(e.target.value)} placeholder="Phone number" />
              <textarea style={styles.textarea} value={note} onChange={(e) => setNote(e.target.value)} placeholder="Special requests" />

              <div style={styles.buttonPairLarge}>
                <button style={styles.reserveLarge} disabled={requesting} onClick={() => reserveHotel(selectedHotel)}>
                  Reserve
                </button>

                <button style={selectedCanPay ? styles.payLarge : styles.payDisabledLarge} disabled={!selectedCanPay || requesting} onClick={() => requestBooking(selectedHotel)}>
                  {requesting ? "Preparing Stripe..." : selectedCanPay ? "Pay" : "Unavailable"}
                </button>
              </div>

              <div style={styles.safeNote}>
                Payment is only enabled for valid live Hotelbeds rate keys.
              </div>
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
  payDisabled: { width: "100%", background: "#c8d0dd", color: "#52627c", border: 0, borderRadius: 12, padding: 12, fontWeight: 900, cursor: "not-allowed" },
  reserveLarge: { width: "100%", background: "#10254a", color: "white", border: 0, borderRadius: 14, padding: "15px 18px", fontSize: 18, fontWeight: 900, cursor: "pointer" },
  payLarge: { width: "100%", background: "#ffd34d", color: "#07111f", border: "2px solid #07111f", borderRadius: 14, padding: "15px 18px", fontSize: 18, fontWeight: 900, cursor: "pointer" },
  payDisabledLarge: { width: "100%", background: "#c8d0dd", color: "#52627c", border: 0, borderRadius: 14, padding: "15px 18px", fontSize: 18, fontWeight: 900, cursor: "not-allowed" },
  emptyBox: { background: "white", borderRadius: 18, padding: 22, fontWeight: 900, lineHeight: 1.5 },
  reservePanel: { background: "white", borderRadius: 18, padding: 16, overflow: "auto" },
  selectedPrice: { color: "#0f4db3", fontSize: 26, fontWeight: 900, marginBottom: 14 },
  selectedUnavailable: { background: "#ffe1e1", color: "#8a1111", padding: 13, borderRadius: 14, marginBottom: 14, fontWeight: 900 },
  mapBox: { background: "#f6f8fc", padding: 8, borderRadius: 16, marginBottom: 12 },
  map: { width: "100%", height: 190, border: 0, borderRadius: 12 },
  currencyBox: { background: "#f6f8fc", borderRadius: 16, padding: 14, marginBottom: 12 },
  currencyTitle: { fontWeight: 900, marginBottom: 10 },
  currencyRow: { display: "grid", gridTemplateColumns: "1fr auto", gap: 10 },
  currencySelect: { padding: 12, borderRadius: 12, border: "1px solid #c6d5e8", fontWeight: 900 },
  convertButton: { background: "#123a7a", color: "white", border: 0, borderRadius: 12, padding: "12px 18px", fontWeight: 900, cursor: "pointer" },
  convertedText: { marginTop: 10, fontWeight: 900, color: "#123a7a" },
  safeNote: { background: "#dff7e6", borderRadius: 14, padding: 13, marginTop: 14, fontWeight: 900, color: "#075b24" },
  confirmPage: { minHeight: "100vh", background: "linear-gradient(90deg,#06101f 0%,#123a7a 52%,#06101f 52%)", color: "white", display: "flex", alignItems: "center", padding: 34, fontFamily: "Arial, sans-serif" },
  confirmCard: { maxWidth: 780, background: "rgba(255,255,255,0.12)", border: "1px solid rgba(255,255,255,0.22)", borderRadius: 28, padding: 40 },
  confirmTitle: { fontSize: 48, color: "#ffd34d", margin: "0 0 20px" },
  confirmText: { fontSize: 20, lineHeight: 1.55 },
  codeBox: { background: "rgba(255,255,255,0.14)", borderRadius: 18, padding: 22, margin: "24px 0", fontSize: 18 },
  codeText: { fontSize: 28, marginTop: 10, fontWeight: 900, color: "#ffd34d" },
  infoPage: { minHeight: "100vh", background: "linear-gradient(135deg,#06101f,#123a7a)", color: "white", padding: 34, fontFamily: "Arial, sans-serif" },
  infoCardWide: { maxWidth: 1180, background: "rgba(255,255,255,0.12)", border: "1px solid rgba(255,255,255,0.22)", borderRadius: 28, padding: 40 },
  infoTitle: { fontSize: 46, color: "#ffd34d", marginBottom: 8 },
  infoSubtitle: { fontSize: 22, fontWeight: 800, lineHeight: 1.4 },
  infoBody: { fontSize: 18, lineHeight: 1.6 },
  guideHero: { background: "rgba(255,255,255,.14)", borderRadius: 22, padding: 24, margin: "24px 0" },
  guideHeroTitle: { color: "#ffd34d", fontSize: 32, marginTop: 0 },
  guideGrid: { display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 18 },
  guideBox: { background: "white", color: "#07111f", borderRadius: 22, padding: 22, minHeight: 220, display: "flex", flexDirection: "column", justifyContent: "space-between" },
  guideBoxTitle: { fontSize: 24, margin: 0, color: "#123a7a" },
  guideBoxText: { fontSize: 17, fontWeight: 700, lineHeight: 1.45 },
  guideButton: { background: "#ffd34d", border: 0, borderRadius: 14, padding: 14, fontWeight: 900, cursor: "pointer" },
  safetyStrip: { marginTop: 22, background: "#fff2be", color: "#07111f", borderRadius: 16, padding: 18, fontWeight: 800 },
  simpleGrid: { display: "grid", gridTemplateColumns: "1fr 1fr", gap: 18, marginTop: 24 },
  simpleBox: { background: "white", color: "#07111f", borderRadius: 20, padding: 22, fontSize: 18, lineHeight: 1.5 },
};


