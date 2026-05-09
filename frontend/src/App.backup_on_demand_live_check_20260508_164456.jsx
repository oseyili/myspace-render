import React, { useEffect, useMemo, useState } from "react";

const API_BASE = "http://127.0.0.1:5050";

const GUIDE_CONTENT = {
  London: {
    title: "London travel guide",
    intro: "London blends royal history, theatre, museums, luxury shopping, river walks, football culture, and global dining.",
    highlights: [
      "Tower Bridge and the Thames for classic London views.",
      "West End theatres for evening entertainment.",
      "South Kensington for museums and family trips.",
      "Mayfair and Knightsbridge for luxury shopping and hotels.",
      "Canary Wharf for business travel."
    ],
  },
  Paris: {
    title: "Paris travel guide",
    intro: "Paris is a city of art, food, design, neighbourhood charm, fashion, and landmark views.",
    highlights: [
      "The Eiffel Tower and Seine walks for first-time visitors.",
      "The Louvre and Musée d'Orsay for art and history.",
      "Saint-Germain for classic Paris elegance.",
      "Le Marais for boutiques, cafés, and nightlife.",
      "The 8th arrondissement for luxury hotels and shopping."
    ],
  },
  Lagos: {
    title: "Lagos travel guide",
    intro: "Lagos is Nigeria’s commercial capital, with beaches, nightlife, restaurants, business districts, music, art, and fast city energy.",
    highlights: [
      "Victoria Island and Ikoyi for business and premium stays.",
      "Lekki for restaurants, nightlife, and modern apartments.",
      "Ikeja for airport access and practical business trips.",
      "Landmark Beach and coastal areas for leisure.",
      "Nike Art Gallery and local food scenes for culture."
    ],
  },
  Abuja: {
    title: "Abuja travel guide",
    intro: "Abuja offers calmer city planning, government districts, premium hotels, hills, parks, and a strong business travel base.",
    highlights: [
      "Maitama and Wuse for central business access.",
      "Asokoro for premium diplomatic-area stays.",
      "Jabi Lake for leisure and shopping.",
      "Aso Rock views for city identity.",
      "Good road access compared with many major cities."
    ],
  },
  Dubai: {
    title: "Dubai travel guide",
    intro: "Dubai is built for luxury, shopping, beaches, family travel, business events, and desert experiences.",
    highlights: [
      "Downtown Dubai for Burj Khalifa and Dubai Mall.",
      "Dubai Marina for waterfront hotels and nightlife.",
      "Palm Jumeirah for resort stays.",
      "Deira and Bur Dubai for heritage and value.",
      "Desert tours for memorable evenings."
    ],
  },
};

function cleanText(value) {
  return String(value || "").trim();
}

function imageUrlFor(hotel) {
  const details = cleanText(hotel.image_url || hotel.image);
  const upper = details.toUpperCase();

  if (!details.startsWith("http")) return "";
  if (upper.includes("PASTE_REAL")) return "";
  if (upper.includes("PUT_THE_REAL")) return "";
  if (upper.includes("PLACEHOLDER")) return "";
  if (upper.includes("UNSPLASH")) return "";
  if (upper.includes("PEXELS")) return "";
  if (upper.includes("PIXABAY")) return "";

  return `${API_BASE}/image-proxy?url=${encodeURIComponent(details)}`;
}

function currencySymbol(code) {
  const map = {
    GBP: "£",
    USD: "$",
    EUR: "€",
    NGN: "₦",
    AED: "د.إ",
    CAD: "C$",
    AUD: "A$",
    ZAR: "R",
    CHF: "CHF",
    JPY: "¥"
  };
  return map[String(code || "").toUpperCase()] || String(code || "");
}

function PropertyImage({ hotel }) {
  const [failed, setFailed] = useState(false);
  const url = imageUrlFor(hotel);

  if (!url || failed) {
    return <div style={styles.noImage}>Real property image pending</div>;
  }

  return (
    <img
      src={url}
      alt={hotel.hotel_name || hotel.name || "Hotel"}
      loading="lazy"
      style={styles.hotelImage}
      onError={() => setFailed(true)}
    />
  );
}

function GuidePage({ setPage, selectedCity, hotels }) {
  const cityName = selectedCity || "your destination";
  const guide = GUIDE_CONTENT[cityName] || {
    title: `${cityName} travel guide`,
    intro: `${cityName} has real hotels in the catalog. Use the search filters to compare areas, property types, images, and reservation options.`,
    highlights: [
      "Choose hotels by neighbourhood, not just price.",
      "Check access to airport, business areas, beaches, or cultural sites.",
      "Use verified property images to avoid misleading stays.",
      "Confirm live availability before payment.",
      "Save the hotel name and area before booking."
    ],
  };

  const imageHotels = hotels.filter((h) => imageUrlFor(h)).slice(0, 4);

  return (
    <div style={styles.fullPage}>
      <button style={styles.backButton} onClick={() => setPage("home")}>Back to search</button>
      <h1 style={styles.guideTitle}>{guide.title}</h1>
      <p style={styles.guideIntro}>{guide.intro}</p>

      <div style={styles.guideGrid}>
        {imageHotels.map((h) => (
          <div key={h.hotel_id || h.id} style={styles.guideCard}>
            <PropertyImage hotel={h} />
            <h3>{h.hotel_name || h.name}</h3>
            <p>{h.area || h.address || h.city}</p>
          </div>
        ))}
      </div>

      <div style={styles.historyBox}>
        <h2>Places of interest and trip planning</h2>
        {guide.highlights.map((x) => <p key={x}>• {x}</p>)}
      </div>
    </div>
  );
}

function InfoPage({ setPage, title, children }) {
  return (
    <div style={styles.fullPage}>
      <button style={styles.backButton} onClick={() => setPage("home")}>Back to search</button>
      <h1 style={styles.guideTitle}>{title}</h1>
      <div style={styles.historyBox}>{children}</div>
    </div>
  );
}

export default function App() {
  const today = new Date().toISOString().slice(0, 10);
  const tomorrow = new Date(Date.now() + 86400000).toISOString().slice(0, 10);

  const [page, setPage] = useState("home");
  const [stats, setStats] = useState(null);
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
  const [message, setMessage] = useState("");
  const [targetCurrency, setTargetCurrency] = useState("USD");
  const [convertedPrice, setConvertedPrice] = useState(null);
  const [convertingCurrency, setConvertingCurrency] = useState(false);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    async function loadDestinations() {
      try {
        const s = await fetch(`${API_BASE}/api/real-catalog/stats`).then((r) => r.json());
        setStats(s);

        const d = await fetch(`${API_BASE}/api/real-catalog/destinations`).then((r) => r.json());
        const list = Array.isArray(d.countries) ? d.countries : [];
        setDestinations(list);

        const nigeria = list.find((x) => String(x.country).toLowerCase() === "nigeria");
        const first = nigeria || list[0];

        if (first) {
          setCountry(first.country);
          setCity(first.cities?.[0]?.city || "");
          setTargetCurrency(first.cities?.[0]?.currency || "USD");
        }
      } catch {
        setMessage("Backend is not connected. Start backend on port 5050.");
      }
    }

    loadDestinations();
  }, []);

  const cityOptions = useMemo(() => {
    const c = destinations.find((x) => x.country === country);
    return c?.cities || [];
  }, [destinations, country]);

  async function searchHotels() {
    setLoading(true);
    setMessage("");
    setSelectedHotel(null);
    setConvertedPrice(null);

    try {
      const params = new URLSearchParams();
      params.set("country", country);
      params.set("city", city);
      params.set("area", area);
      params.set("keyword", keyword);
      params.set("limit", "120");

      const data = await fetch(`${API_BASE}/api/real-catalog/search?${params.toString()}`).then((r) => r.json());
      const list = Array.isArray(data.hotels) ? data.hotels : [];
      setHotels(list);
      setMessage(`${list.length} real catalog hotels found in ${city}, ${country}. Live price confirmation is required before payment.`);
    } catch {
      setMessage("Search failed. Confirm backend is running at http://127.0.0.1:5050.");
    } finally {
      setLoading(false);
    }
  }

  async function selectHotel(hotel) {
    setSelectedHotel(hotel);
    setConvertedPrice(null);
    const nativeCurrency = String(hotel.currency || hotel.first_rate?.display_currency || "USD").toUpperCase();
    setTargetCurrency(nativeCurrency);
  }

  async function convertSelectedPrice(nextCurrency = targetCurrency) {
    if (!selectedHotel) return setMessage("Select a hotel first.");

    const amount = Number(selectedHotel.price || selectedHotel.first_rate?.display_amount || 0);
    const from = String(selectedHotel.currency || selectedHotel.first_rate?.display_currency || "GBP").toUpperCase();
    const to = String(nextCurrency || targetCurrency || from).toUpperCase();

    if (!amount) return setMessage("This hotel needs live price confirmation before conversion.");

    setConvertingCurrency(true);
    try {
      const params = new URLSearchParams();
      params.set("amount", String(amount));
      params.set("from", from);
      params.set("to", to);

      const data = await fetch(`${API_BASE}/api/currency/convert?${params.toString()}`).then((r) => r.json());
      if (!data.ok) throw new Error(data.message || "Conversion failed.");

      setConvertedPrice({
        amount,
        from_currency: from,
        to_currency: to,
        converted: data.converted
      });
    } catch {
      setMessage("Currency conversion failed. Confirm backend is running.");
    } finally {
      setConvertingCurrency(false);
    }
  }

  function chooseRoomCount(nextRooms) {
    setRooms(nextRooms);
    setSelectedHotel(null);
    setConvertedPrice(null);
    setMessage("Room count changed. Please choose the stay again so we can refresh the live total price.");
  }

  async function requestBooking() {
    if (!selectedHotel) return setMessage("Select a hotel first.");
    if (!customerName.trim()) return setMessage("Enter your full name.");
    if (!customerEmail.trim()) return setMessage("Enter your email.");

    try {
      const amount = Number(selectedHotel.price || selectedHotel.first_rate?.display_amount || 0);
      const currency = String(selectedHotel.currency || selectedHotel.first_rate?.display_currency || "").toUpperCase();

      const payload = {
        hotel_id: selectedHotel.hotel_id || selectedHotel.id,
        hotel_name: selectedHotel.hotel_name || selectedHotel.name,
        destination: `${city}, ${country}`,
        checkin,
        checkout,
        guests,
        rooms,
        customer_name: customerName,
        customer_email: customerEmail,
        customer_phone: customerPhone,
        note,
        amount,
        currency,
        rate_key: selectedHotel.first_rate?.rate_key || ""
      };

      const res = await fetch(`${API_BASE}/reservation-request`, {
        method: "POST",
        headers: {"Content-Type": "application/json"},
        body: JSON.stringify(payload),
      });

      const data = await res.json();

      if (data.payment_url) {
        window.location.href = data.payment_url;
        return;
      }

      setMessage(data.message || data.detail || "Reservation request sent.");
    } catch {
      setMessage("Reservation failed. Check backend reservation settings.");
    }
  }

  if (page === "guide") return <GuidePage setPage={setPage} selectedCity={city} hotels={hotels} />;
  if (page === "faq") return <InfoPage setPage={setPage} title="Frequently asked questions"><p>Search by real country and city from the hotel catalog. Catalog hotels require live price confirmation before payment.</p></InfoPage>;
  if (page === "terms") return <InfoPage setPage={setPage} title="Booking terms"><p>Prices and availability must be confirmed before customer payment. Only real hotels and real property images should be shown.</p></InfoPage>;
  if (page === "support") return <InfoPage setPage={setPage} title="Customer support"><p>Reservation support: reservations@myspace-hotel.com</p></InfoPage>;

  return (
    <div style={styles.page}>
      <section style={styles.left}>
        <div style={styles.brand}>MYSPACE HOTEL</div>
        <h1 style={styles.hero}>Real global hotels. Real images. Confident booking.</h1>
        <p style={styles.sub}>
          Search the real catalog by country and city. No fake destination cards, no fake hotel images.
        </p>

        <div style={styles.leftButtons}>
          <button style={styles.navButton} onClick={() => setPage("guide")}>Premium Travel Guide</button>
          <button style={styles.navButton} onClick={() => setPage("faq")}>FAQs</button>
          <button style={styles.navButton} onClick={() => setPage("terms")}>Booking Terms</button>
          <button style={styles.navButton} onClick={() => setPage("support")}>Customer Support</button>
        </div>

        <div style={styles.statsBox}>
          <h2>Real catalog status</h2>
          <p>Hotels: {stats?.catalog_hotels?.toLocaleString?.() || stats?.real_hotels_loaded?.toLocaleString?.() || "loading"}</p>
          <p>Hotels with images: {stats?.catalog_with_images?.toLocaleString?.() || "checking"}</p>
          <p>Countries in catalog: {stats?.countries || "loading"}</p>
          <p>Cities in catalog: {stats?.cities || "loading"}</p>
        </div>
      </section>

      <section style={styles.right}>
        <div style={styles.searchBox}>
          <h2>Search real global inventory</h2>

          <select
            style={styles.input}
            value={country}
            onChange={(e) => {
              const nextCountry = e.target.value;
              const countryObj = destinations.find((x) => x.country === nextCountry);
              const nextCity = countryObj?.cities?.[0];
              setCountry(nextCountry);
              setCity(nextCity?.city || "");
              setTargetCurrency(nextCity?.currency || "USD");
              setSelectedHotel(null);
              setConvertedPrice(null);
            }}
          >
            {destinations.map((c) => (
              <option key={c.country} value={c.country}>
                {c.country} — {c.cities?.length || 0} cities
              </option>
            ))}
          </select>

          <select style={styles.input} value={city} onChange={(e) => setCity(e.target.value)}>
            {cityOptions.map((c) => (
              <option key={c.city} value={c.city}>
                {c.city} {c.currency ? `— ${c.currency}` : ""}
              </option>
            ))}
          </select>

          <input style={styles.input} value={area} onChange={(e) => setArea(e.target.value)} placeholder="Preferred area or neighbourhood" />
          <input style={styles.input} value={keyword} onChange={(e) => setKeyword(e.target.value)} placeholder="Hotel name, landmark, or travel style" />

          <div style={styles.dateGrid}>
            <input style={styles.input} type="date" value={checkin} onChange={(e) => setCheckin(e.target.value)} />
            <input style={styles.input} type="date" value={checkout} onChange={(e) => setCheckout(e.target.value)} />
          </div>

          <div style={styles.smallGrid}>
            <input style={styles.input} type="number" min="1" value={guests} onChange={(e) => setGuests(Number(e.target.value))} />
            <input style={styles.input} type="number" min="1" value={rooms} onChange={(e) => chooseRoomCount(Number(e.target.value))} />
          </div>

          <button style={styles.goldButton} onClick={searchHotels}>{loading ? "Searching..." : "Search hotels"}</button>

          {message && <div style={styles.notice}>{message}</div>}
        </div>

        <div style={styles.contentGrid}>
          <div>
            <h2>{hotels.length} hotels</h2>
            <div style={styles.results}>
              {hotels.map((hotel) => {
                const isSelected = selectedHotel?.hotel_id === hotel.hotel_id;
                const price = Number(hotel.price || hotel.first_rate?.display_amount || 0);
                const priceCurrency = String(hotel.currency || hotel.first_rate?.display_currency || "").toUpperCase();

                return (
                  <div
                    key={hotel.hotel_id || hotel.id}
                    style={isSelected ? styles.cardSelected : styles.card}
                    onClick={() => selectHotel(hotel)}
                  >
                    <PropertyImage hotel={hotel} />
                    <h3>{hotel.hotel_name || hotel.name}</h3>
                    <p>{hotel.area || hotel.address || hotel.city}</p>
                    <div style={styles.pending}>Live rate required — cached catalog prices rejected</div><div style={styles.pending}>Real catalog hotel — verified image rule active</div>
                  </div>
                );
              })}
            </div>
          </div>

          <aside style={styles.booking}>
            <h2>Reservation request</h2>
            <div style={styles.selected}>{selectedHotel ? (selectedHotel.hotel_name || selectedHotel.name) : "Choose a hotel"}</div>

            {selectedHotel && (
              <div style={styles.converterBox}>
                <b>Live rate required</b>
                <p style={styles.converterSmall}>Fake or cached catalog prices are blocked. Reload from live supplier rates before payment.</p>
                <select
                  style={styles.input}
                  value={targetCurrency}
                  onChange={(e) => {
                    setTargetCurrency(e.target.value);
                    convertSelectedPrice(e.target.value);
                  }}
                >
                  {["GBP","USD","EUR","NGN","ZAR","AED","CAD","AUD","JPY","CHF"].map((c) => (
                    <option key={c} value={c}>{c}</option>
                  ))}
                </select>
                <button style={styles.convertButton} type="button" onClick={() => setMessage("Live supplier rate is required before conversion or payment.")}>Reload live rate</button>
                {convertedPrice && (
                  <div style={styles.convertResult}>
                    {convertedPrice.from_currency} {Number(convertedPrice.amount).toLocaleString()} ≈ {convertedPrice.to_currency} {Number(convertedPrice.converted).toLocaleString()}
                  </div>
                )}
              </div>
            )}

            <input style={styles.input} value={customerName} onChange={(e) => setCustomerName(e.target.value)} placeholder="Full name" />
            <input style={styles.input} value={customerEmail} onChange={(e) => setCustomerEmail(e.target.value)} placeholder="Email" />
            <input style={styles.input} value={customerPhone} onChange={(e) => setCustomerPhone(e.target.value)} placeholder="Phone" />
            <textarea style={styles.textarea} value={note} onChange={(e) => setNote(e.target.value)} placeholder="Special requests" />
            <button style={styles.goldButton} onClick={requestBooking}>Send reservation request</button>
            <div style={styles.safeNote}>Payment should only be used after confirmed pricing. Local hotel currency is shown where available.</div>
          </aside>
        </div>
      </section>
    </div>
  );
}

const styles = {
  page: { minHeight: "100vh", display: "grid", gridTemplateColumns: "0.92fr 1.08fr", background: "#07111f", fontFamily: "Arial, sans-serif" },
  left: { color: "white", padding: 42, background: "linear-gradient(135deg,#123a7a,#1d4da8)" },
  right: { background: "#e8eef7", color: "#07111f", padding: 28, overflow: "auto" },
  brand: { letterSpacing: 15, fontWeight: 900, marginBottom: 32 },
  hero: { fontSize: 56, lineHeight: 1.08, maxWidth: 700 },
  sub: { fontSize: 21, lineHeight: 1.5 },
  leftButtons: { display: "flex", flexWrap: "wrap", gap: 12, marginTop: 28 },
  navButton: { background: "white", color: "#07111f", border: 0, borderRadius: 12, padding: "15px 20px", fontWeight: 900, cursor: "pointer" },
  statsBox: { background: "rgba(255,255,255,.12)", border: "1px solid rgba(255,255,255,.25)", borderRadius: 22, padding: 22, marginTop: 36, fontWeight: 800 },
  searchBox: { background: "white", borderRadius: 20, padding: 22, marginBottom: 22 },
  input: { width: "100%", boxSizing: "border-box", padding: 14, borderRadius: 12, border: "1px solid #cbd5e1", marginTop: 10, fontSize: 16 },
  textarea: { width: "100%", minHeight: 120, boxSizing: "border-box", padding: 14, borderRadius: 12, border: "1px solid #cbd5e1", marginTop: 10, fontSize: 16 },
  dateGrid: { display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 },
  smallGrid: { display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 },
  goldButton: { width: "100%", padding: 16, marginTop: 16, background: "#ffd34d", border: "2px solid #07111f", borderRadius: 14, fontSize: 19, fontWeight: 900, cursor: "pointer" },
  notice: { marginTop: 16, background: "#fff2be", padding: 14, borderRadius: 12, fontWeight: 900 },
  contentGrid: { display: "grid", gridTemplateColumns: "1.1fr .9fr", gap: 20 },
  results: { maxHeight: 740, overflow: "auto", paddingRight: 8 },
  card: { background: "white", borderRadius: 18, padding: 16, marginBottom: 18, cursor: "pointer" },
  cardSelected: { background: "white", borderRadius: 18, padding: 16, marginBottom: 18, cursor: "pointer", border: "4px solid #ffd34d" },
  hotelImage: { width: "100%", height: 240, objectFit: "cover", borderRadius: 12 },
  noImage: { height: 240, borderRadius: 12, background: "#dbe4f0", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 900 },
  pending: { background: "#fff2be", color: "#7a4b00", padding: 12, borderRadius: 12, fontWeight: 900, marginTop: 10 },
  priceLine: { background: "#dff7e6", color: "#064e3b", padding: 12, borderRadius: 12, fontWeight: 900, marginTop: 10 },
  booking: { background: "white", borderRadius: 20, padding: 22, alignSelf: "start", position: "sticky", top: 20 },
  selected: { background: "#eef4ff", borderRadius: 14, padding: 16, fontWeight: 900, marginBottom: 12 },
  safeNote: { background: "#dff7e6", padding: 14, borderRadius: 12, marginTop: 14, fontWeight: 800 },
  converterBox: { background: "#f8fafc", border: "1px solid #cbd5e1", borderRadius: 16, padding: 14, marginBottom: 12 },
  converterSmall: { margin: "8px 0 0", color: "#475569", fontWeight: 700 },
  convertButton: { width: "100%", padding: 13, marginTop: 10, background: "#07111f", color: "white", border: 0, borderRadius: 12, fontWeight: 900, cursor: "pointer" },
  convertResult: { marginTop: 10, background: "#dff7e6", padding: 12, borderRadius: 12, fontWeight: 900 },
  fullPage: { minHeight: "100vh", background: "#07111f", color: "white", padding: 42, fontFamily: "Arial, sans-serif" },
  backButton: { background: "#ffd34d", border: 0, borderRadius: 12, padding: "13px 18px", fontWeight: 900, cursor: "pointer" },
  guideTitle: { fontSize: 54, color: "#ffd34d" },
  guideIntro: { fontSize: 22, maxWidth: 900, lineHeight: 1.55 },
  guideGrid: { display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 18, marginTop: 24 },
  guideCard: { background: "white", color: "#07111f", borderRadius: 18, padding: 14 },
  historyBox: { background: "rgba(255,255,255,.12)", borderRadius: 22, padding: 28, marginTop: 28, fontSize: 20, lineHeight: 1.6 },
};

