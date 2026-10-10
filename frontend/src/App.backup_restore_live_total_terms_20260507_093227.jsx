import React, { useEffect, useMemo, useState } from "react";

const API_BASE = "http://127.0.0.1:5050";

const GUIDE_CONTENT = {
  Lagos: {
    title: "Lagos: beaches, nightlife, culture, business, and unforgettable city energy",
    intro:
      "Lagos is one of Africa’s most exciting cities: fast, creative, coastal, business-focused, and full of music, food, art, beaches, and premium neighbourhoods.",
    experiences: [
      "Stay in Victoria Island or Ikoyi for business meetings, restaurants, lounges, and premium hotels.",
      "Choose Lekki for beaches, nightlife, modern apartments, shopping, and weekend experiences.",
      "Use Ikeja for airport convenience, short stays, and practical business trips.",
      "Visit Nike Art Gallery for culture, Landmark Beach for leisure, and Lekki Conservation Centre for nature.",
      "Try local restaurants for jollof rice, suya, pepper soup, grilled fish, and modern Nigerian dining.",
    ],
    practical: [
      "Best for: business, nightlife, beaches, creative culture, shopping, and family visits.",
      "Popular areas: Victoria Island, Ikoyi, Lekki, Ikeja, Maryland, and Yaba.",
      "Safety tip: ask your hotel about reliable transport and local movement at night.",
      "Emergency support: ask hotel reception for the nearest hospital, local emergency contact, and police station.",
    ],
  },
  Abuja: {
    title: "Abuja: calm luxury, government districts, hills, parks, and premium city planning",
    intro:
      "Abuja is spacious, calmer than Lagos, and excellent for government visits, diplomatic travel, conferences, family stays, and comfortable city breaks.",
    experiences: [
      "Stay in Maitama, Wuse, or Asokoro for central access and premium hospitality.",
      "Visit Jabi Lake for relaxed dining, shopping, and leisure.",
      "Enjoy views around Aso Rock and the city’s surrounding hills.",
      "Choose hotels based on your meeting location because Abuja is spread out.",
      "Look for properties with airport transfer options if arriving late.",
    ],
    practical: [
      "Best for: government visits, business, family travel, diplomatic stays, and calm premium hotels.",
      "Popular areas: Maitama, Wuse, Asokoro, Garki, Jabi, and Central Business District.",
      "Safety tip: confirm transport with your hotel or trusted driver.",
      "Emergency support: ask your hotel for the nearest hospital and local emergency assistance.",
    ],
  },
  London: {
    title: "London: theatre, royal parks, museums, shopping, history, and riverside hotels",
    intro:
      "London is built for memorable trips: world-class museums, West End theatre, luxury shopping, royal parks, football, history, food markets, and neighbourhoods with very different personalities.",
    experiences: [
      "Choose Mayfair or Knightsbridge for luxury hotels, shopping, and elegant dining.",
      "Stay near Covent Garden or Soho for theatre, restaurants, and nightlife.",
      "Use South Kensington for museums, families, and classic London streets.",
      "Choose Canary Wharf for business, river views, and modern hotels.",
      "Visit Tower Bridge, Westminster, Buckingham Palace, the British Museum, Hyde Park, and Borough Market.",
    ],
    practical: [
      "Best for: theatre, museums, luxury shopping, family travel, football, business, and history.",
      "Popular areas: Mayfair, Covent Garden, South Kensington, Canary Wharf, Westminster, and Shoreditch.",
      "Transport tip: stay close to a Tube station to save time.",
      "Emergency support: hotels can direct guests to the nearest hospital, police station, and urgent care service.",
    ],
  },
  Paris: {
    title: "Paris: romance, art, fashion, cafés, museums, and beautiful neighbourhood stays",
    intro:
      "Paris is one of the world’s great travel cities, offering art, food, design, fashion, luxury hotels, historic streets, and neighbourhoods made for walking.",
    experiences: [
      "Stay in Saint-Germain for classic elegance, cafés, galleries, and walkability.",
      "Choose Le Marais for boutiques, restaurants, nightlife, and character.",
      "Use the 8th arrondissement for luxury hotels, shopping, and landmark access.",
      "Visit the Eiffel Tower, Louvre, Musée d’Orsay, Montmartre, Notre-Dame area, and the Seine.",
      "Plan time for bakeries, bistros, wine bars, fashion streets, and quiet neighbourhood walks.",
    ],
    practical: [
      "Best for: romance, art, food, shopping, luxury stays, and cultural trips.",
      "Popular areas: Saint-Germain, Le Marais, Opera, Champs-Élysées, Latin Quarter, and Montmartre.",
      "Transport tip: central location matters because Paris rewards walking.",
      "Emergency support: your hotel can help locate nearby hospitals, pharmacies, and police help.",
    ],
  },
  Dubai: {
    title: "Dubai: luxury resorts, skyline views, shopping, beaches, desert evenings, and family fun",
    intro:
      "Dubai offers polished hospitality, iconic architecture, beaches, shopping, restaurants, theme parks, desert experiences, and high-service hotels.",
    experiences: [
      "Stay Downtown for Burj Khalifa, Dubai Mall, fountains, and first-time landmark access.",
      "Choose Dubai Marina for nightlife, waterfront restaurants, and serviced apartments.",
      "Use Palm Jumeirah for resort luxury, beach clubs, and family-friendly hotels.",
      "Visit the desert for evening dinners, dune experiences, and memorable photos.",
      "Explore Old Dubai, souks, Jumeirah Beach, museums, luxury malls, and rooftop dining.",
    ],
    practical: [
      "Best for: luxury, family resorts, shopping, beaches, business events, and skyline experiences.",
      "Popular areas: Downtown, Marina, Palm Jumeirah, JBR, Deira, Business Bay, and Jumeirah.",
      "Comfort tip: check distance carefully because attractions are spread out.",
      "Emergency support: hotels and malls can direct guests to clinics, hospitals, and official help.",
    ],
  },
};

function safe(value) {
  return String(value || "").trim();
}

function cityLabel(city) {
  return safe(city) || "your destination";
}

function guideFor(city) {
  return GUIDE_CONTENT[city] || {
    title: `${cityLabel(city)}: discover where to stay, what to enjoy, and how to plan well`,
    intro:
      `${cityLabel(city)} offers different experiences depending on your neighbourhood. Compare hotels by area, comfort, access, images, and travel purpose before choosing your stay.`,
    experiences: [
      "Choose your neighbourhood before comparing hotel prices.",
      "Look for access to restaurants, transport, attractions, business areas, beaches, or family facilities.",
      "Use property images and location details to avoid poor fit.",
      "Ask the reservations team to confirm latest availability and conditions before payment.",
      "Plan local restaurants, places of interest, shopping, transport, and emergency support before arrival.",
    ],
    practical: [
      "Best for: city breaks, business travel, family trips, local experiences, and comfortable stays.",
      "Travel tip: location often matters more than a small price difference.",
      "Safety tip: ask the hotel about trusted transport and nearby support services.",
      "Emergency support: check with hotel reception for the nearest hospital, police assistance, and urgent help.",
    ],
  };
}

function imageProxy(hotel) {
  const raw = safe(hotel.image_url || hotel.image);
  const upper = raw.toUpperCase();

  if (!raw.startsWith("http")) return "";
  if (upper.includes("PASTE_REAL")) return "";
  if (upper.includes("PUT_THE_REAL")) return "";
  if (upper.includes("PLACEHOLDER")) return "";
  if (upper.includes("UNSPLASH")) return "";
  if (upper.includes("PEXELS")) return "";
  if (upper.includes("PIXABAY")) return "";

  return `${API_BASE}/image-proxy?url=${encodeURIComponent(raw)}`;
}

function HotelImage({ hotel }) {
  const [failed, setFailed] = useState(false);
  const img = imageProxy(hotel);

  if (!img || failed) {
    function chooseRoomCount(nextRooms) {
    setRooms(nextRooms);
    setSelectedHotel(null);
    setConvertedPrice(null);
    setMessage("Room count changed. Please choose the stay again so we can refresh the live total price.");
  }

  return (
      <div style={styles.imagePending}>
        <b>Trusted image pending</b>
        <span>We avoid misleading hotel photos.</span>
      </div>
    );
  }

  return <img src={img} alt={hotel.hotel_name || hotel.name || "Hotel"} style={styles.hotelImage} loading="lazy" onError={() => setFailed(true)} />;
}

function TravelGuide({ onBack, city, country, hotels }) {
  const guide = guideFor(city);
  const featured = hotels.filter((h) => imageProxy(h)).slice(0, 4);

  function chooseRoomCount(nextRooms) {
    setRooms(nextRooms);
    setSelectedHotel(null);
    setConvertedPrice(null);
    setMessage("Room count changed. Please choose the stay again so we can refresh the live total price.");
  }

  return (
    <div style={styles.infoPage}>
      <button style={styles.backButton} onClick={onBack}>Back to search</button>
      <div style={styles.brandSmall}>MYSPACE HOTEL PREMIUM GUIDE</div>
      <h1 style={styles.guideTitle}>{guide.title}</h1>
      <p style={styles.guideIntro}>{guide.intro}</p>

      <div style={styles.guidePanel}>
        <h2>Memorable experiences</h2>
        {guide.experiences.map((x) => <p key={x}>• {x}</p>)}
      </div>

      <div style={styles.guidePanel}>
        <h2>Visitor essentials</h2>
        {guide.practical.map((x) => <p key={x}>• {x}</p>)}
      </div>

      <div style={styles.guidePanel}>
        <h2>Food, facilities, safety, and local support</h2>
        <p>• Restaurants: ask for hotels near dining districts, markets, waterfronts, malls, or business areas.</p>
        <p>• Facilities: filter by family comfort, business access, airport convenience, parking, spa, gym, pool, or beach access where available.</p>
        <p>• Emergency planning: confirm the nearest hospital, pharmacy, police assistance, and trusted transport with the hotel before travelling.</p>
        <p>• Local movement: use hotel-recommended taxis, official ride apps where available, or trusted airport transfer services.</p>
      </div>

      {featured.length > 0 && (
        <>
          <h2 style={styles.sectionTitle}>Featured stays in {cityLabel(city)}</h2>
          <div style={styles.featuredGrid}>
            {featured.map((h) => (
              <div key={h.hotel_id || h.id} style={styles.featureCard}>
                <HotelImage hotel={h} />
                <div style={styles.featureBody}>
                  <h3>{h.hotel_name || h.name}</h3>
                  <p>{h.area || h.address || country}</p>
                </div>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

function InfoPage({ onBack, title, children }) {
  function chooseRoomCount(nextRooms) {
    setRooms(nextRooms);
    setSelectedHotel(null);
    setConvertedPrice(null);
    setMessage("Room count changed. Please choose the stay again so we can refresh the live total price.");
  }

  return (
    <div style={styles.infoPage}>
      <button style={styles.backButton} onClick={onBack}>Back to search</button>
      <div style={styles.brandSmall}>MYSPACE HOTEL</div>
      <h1 style={styles.guideTitle}>{title}</h1>
      <div style={styles.guidePanel}>{children}</div>
    </div>
  );
}

export default function App() {
  const today = new Date().toISOString().slice(0, 10);
  const tomorrow = new Date(Date.now() + 86400000).toISOString().slice(0, 10);

  const [page, setPage] = useState("home");
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
  const [targetCurrency, setTargetCurrency] = useState("GBP");
  const [convertedPrice, setConvertedPrice] = useState(null);
  const [convertingCurrency, setConvertingCurrency] = useState(false);
  const [loading, setLoading] = useState(false);
  const [checkingLivePrice, setCheckingLivePrice] = useState(false);

  useEffect(() => {
    async function load() {
      try {
        const data = await fetch(`${API_BASE}/api/real-catalog/destinations`).then((r) => r.json());
        const list = Array.isArray(data.countries) ? data.countries : [];
        setDestinations(list);

        const preferred =
          list.find((x) => x.country.toLowerCase() === "nigeria") ||
          list.find((x) => x.country.toLowerCase() === "united kingdom") ||
          list[0];

        if (preferred) {
          setCountry(preferred.country);
          setCity(preferred.cities?.[0]?.city || "");
        }
      } catch {
        setMessage("Destinations are temporarily unavailable. Please try again.");
      }
    }

    load();
  }, []);

  const cityOptions = useMemo(() => {
    return destinations.find((x) => x.country === country)?.cities || [];
  }, [destinations, country]);

  async function searchHotels() {
    setLoading(true);
    setSelectedHotel(null);
    setMessage("");

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
      setMessage(
        list.length
          ? `${list.length} stays found in ${cityLabel(city)}. Choose a property to continue.`
          : "No stays found. Try a nearby city, area, or different keyword."
      );
    } catch {
      setMessage("Search is temporarily unavailable. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  async function checkLivePriceForHotel(hotel) {
    if (!hotel) return;

    setSelectedHotel(hotel);
    setCheckingLivePrice(true);
    setMessage("Checking the latest live room price for this selected stay...");

    try {
      const params = new URLSearchParams();
      params.set("hotel_id", hotel.hotel_id || hotel.id || "");
      params.set("hotel_name", hotel.hotel_name || hotel.name || "");
      params.set("destination_code", city);
      params.set("checkin", checkin);
      params.set("checkout", checkout);
      params.set("guests", String(guests));
      params.set("rooms", String(rooms));

      const data = await fetch(`${API_BASE}/api/hotels/live-check?${params.toString()}`).then((r) => r.json());

      const updated = {
        ...hotel,
        live_payment_ready: Boolean(data.live_payment_ready),
        price_status: data.price_status || hotel.price_status,
        first_rate: data.first_rate || hotel.first_rate || null,
        price: data.amount || hotel.price,
        currency: data.currency || hotel.currency,
      };

      setSelectedHotel(updated);
      setHotels((current) =>
        current.map((x) =>
          String(x.hotel_id || x.id) === String(hotel.hotel_id || hotel.id) ? updated : x
        )
      );

      if (updated.live_payment_ready) {
        setMessage("Live room price is ready. You can continue securely.");
      } else {
        setMessage("Latest room price will be confirmed before payment. You can send a reservation request.");
      }
    } catch {
      setMessage("We could not check live pricing right now. You can still send a reservation request.");
    } finally {
      setCheckingLivePrice(false);
    }
  }

  async function convertSelectedPrice(nextCurrency = targetCurrency) {
    if (!selectedHotel) {
      setMessage("Please choose a stay first.");
      return;
    }

    const amount = selectedHotel.first_rate?.selling_rate || selectedHotel.first_rate?.net || selectedHotel.price || "";
    const from = selectedHotel.first_rate?.currency || selectedHotel.currency || "";

    if (!amount || !from) {
      setConvertedPrice(null);
      setMessage("Choose a stay with a price before converting currency.");
      return;
    }

    setConvertingCurrency(true);

    try {
      const params = new URLSearchParams();
      params.set("amount", String(amount));
      params.set("from_currency", from);
      params.set("to_currency", nextCurrency);

      const data = await fetch(`${API_BASE}/api/currency/convert?${params.toString()}`).then((r) => r.json());

      if (!data.ok) {
        setConvertedPrice(null);
        setMessage(data.detail || "Currency conversion is temporarily unavailable.");
        return;
      }

      setConvertedPrice(data);
    } catch {
      setConvertedPrice(null);
      setMessage("Currency conversion is temporarily unavailable.");
    } finally {
      setConvertingCurrency(false);
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
        rate_key: selectedHotel.first_rate?.rate_key || "",
        amount: selectedHotel.first_rate?.selling_rate || selectedHotel.price || "",
        currency: selectedHotel.first_rate?.currency || selectedHotel.currency || "",
        amount_is_total: true,
      };

      const data = await fetch(`${API_BASE}/reservation-request`, {
        method: "POST",
        headers: {"Content-Type": "application/json"},
        body: JSON.stringify(payload),
      }).then((r) => r.json());
      if (data.payment_url) {
        window.location.href = data.payment_url;
        return;
      }

      setMessage(data.message || "Your request has been received. We will confirm the latest availability and next steps.");
    } catch {
      setMessage("We could not send your request. Please try again.");
    }
  }

  if (page === "guide") return <TravelGuide onBack={() => setPage("home")} city={city} country={country} hotels={hotels} />;
  if (page === "faq") return <InfoPage onBack={() => setPage("home")} title="Frequently asked questions"><p><b>How do I reserve?</b><br />Choose a destination, compare stays, submit your request, and our reservations team confirms the latest availability and next steps.</p><p><b>Why request before payment?</b><br />Some global properties require current price confirmation before payment, which protects customers from outdated availability.</p></InfoPage>;
  if (page === "terms") return <InfoPage onBack={() => setPage("home")} title="Booking terms"><p>Hotel conditions, prices, taxes, cancellation terms, and availability can vary by property, room type, dates, and supplier. Please review details carefully before payment.</p></InfoPage>;
  if (page === "support") return <InfoPage onBack={() => setPage("home")} title="Customer support"><p>For reservation help, email <b>reservations@myspace-hotel.com</b>. Include your destination, hotel name, travel dates, and contact email.</p></InfoPage>;

  function chooseRoomCount(nextRooms) {
    setRooms(nextRooms);
    setSelectedHotel(null);
    setConvertedPrice(null);
    setMessage("Room count changed. Please choose the stay again so we can refresh the live total price.");
  }

  return (
    <div style={styles.page}>
      <section style={styles.left}>
        <div style={styles.brand}>MYSPACE HOTEL</div>
        <h1 style={styles.hero}>Find memorable stays worldwide with confidence.</h1>
        <p style={styles.sub}>Compare real properties, choose the right neighbourhood, and enjoy travel support designed around better decisions.</p>

        <div style={styles.leftButtons}>
          <button style={styles.navButton} onClick={() => setPage("guide")}>Premium Travel Guide</button>
          <button style={styles.navButton} onClick={() => setPage("faq")}>FAQs</button>
          <button style={styles.navButton} onClick={() => setPage("terms")}>Booking Terms</button>
          <button style={styles.navButton} onClick={() => setPage("support")}>Customer Support</button>
        </div>

        <div style={styles.destinationPanel}>
          <h2>{cityLabel(city)}, {country || "Worldwide"}</h2>
          <p>Plan where to stay, what to enjoy, where to eat, how to move safely, and how to access help if needed.</p>
          <div style={styles.momentGrid}>
            <span>Memorable experiences</span>
            <span>Places of interest</span>
            <span>Restaurants and facilities</span>
            <span>Safety and local support</span>
          </div>
        </div>
      </section>

      <section style={styles.right}>
        <div style={styles.searchBox}>
          <h2 style={styles.heading}>Search destinations</h2>
          <p style={styles.copy}>Choose your country, city, dates, and preferred area. Then compare properties before sending a reservation request.</p>

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
          <div style={styles.choiceRow}><b>Rooms</b>{[1,2,3,4].map((n) => <button key={n} style={rooms === n ? styles.choiceActive : styles.choice} onClick={() => chooseRoomCount(n)}>{n}</button>)}</div>

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
                  <div style={styles.rateGood}>Available for reservation request</div>
                </div>
              ))}
            </div>
          </div>

          <aside style={styles.reserve}>
            <div style={styles.label}>RESERVATION REQUEST</div>
            <h2>Review and continue</h2>
            <div style={styles.selectedBox}>{selectedHotel ? (selectedHotel.hotel_name || selectedHotel.name) : "Choose a stay"}</div>
            {selectedHotel && (
              <div style={selectedHotel.live_payment_ready ? styles.rateGood : styles.safeNote}>
                {checkingLivePrice
                  ? "Checking latest room price..."
                  : selectedHotel.live_payment_ready
                    ? `Live total ready: ${selectedHotel.currency || ""} ${selectedHotel.price || ""} for ${rooms} room${Number(rooms) === 1 ? "" : "s"}`.trim()
                    : (selectedHotel.price_status || "Latest price will be confirmed before payment.")}
              </div>
            )}

            {selectedHotel && (
              <div style={styles.converterBox}>
                <b>Currency converter</b>
                <p style={styles.converterSmall}>Estimate this stay in another currency before continuing.</p>
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
                <button style={styles.convertButton} type="button" onClick={() => convertSelectedPrice()}>
                  {convertingCurrency ? "Converting..." : "Convert price"}
                </button>
                {convertedPrice && (
                  <div style={styles.convertResult}>
                    {convertedPrice.from_currency} {Number(convertedPrice.amount).toLocaleString()} ≈ {convertedPrice.to_currency} {Number(convertedPrice.converted).toLocaleString()}
                  </div>
                )}
              </div>
            )}

            <input style={styles.input} value={customerName} onChange={(e) => setCustomerName(e.target.value)} placeholder="Full name" />
            <input style={styles.input} value={customerEmail} onChange={(e) => setCustomerEmail(e.target.value)} placeholder="Email address" />
            <input style={styles.input} value={customerPhone} onChange={(e) => setCustomerPhone(e.target.value)} placeholder="Phone number" />
            <textarea style={styles.textarea} value={note} onChange={(e) => setNote(e.target.value)} placeholder="Special requests, arrival time, room needs, or questions" />
            <button style={styles.goldButton} onClick={sendRequest}>{checkingLivePrice ? "Checking latest price..." : selectedHotel?.live_payment_ready ? "Continue securely" : "Send reservation request"}</button>
            <div style={styles.safeNote}>Our reservations team will help confirm the latest availability, price, and next steps.</div>
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
  brandSmall: { letterSpacing: 10, fontWeight: 900, marginBottom: 20 },
  hero: { fontSize: 54, lineHeight: 1.12, margin: 0 },
  sub: { fontSize: 20, lineHeight: 1.55, marginTop: 26 },
  leftButtons: { display: "flex", flexWrap: "wrap", gap: 14, marginTop: 32 },
  navButton: { background: "white", color: "#07111f", border: 0, borderRadius: 10, padding: "16px 24px", fontWeight: 900, fontSize: 18, cursor: "pointer" },
  destinationPanel: { background: "rgba(0,0,0,.25)", border: "1px solid rgba(255,255,255,.28)", borderRadius: 22, padding: 24, marginTop: 38, fontSize: 18, lineHeight: 1.6 },
  momentGrid: { display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginTop: 18 },
  right: { background: "#eaf2fb", borderRadius: 28, padding: 36, maxHeight: "92vh", overflow: "auto" },
  searchBox: { background: "white", borderRadius: 20, padding: 22, marginBottom: 22 },
  heading: { fontSize: 34, margin: 0 },
  copy: { fontSize: 18, lineHeight: 1.5 },
  input: { width: "100%", boxSizing: "border-box", padding: "15px 17px", margin: "8px 0", borderRadius: 14, border: "1px solid #c6d5e8", fontSize: 17 },
  textarea: { width: "100%", boxSizing: "border-box", minHeight: 130, padding: "15px 17px", margin: "8px 0", borderRadius: 14, border: "1px solid #c6d5e8", fontSize: 17 },
  dateGrid: { display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 },
  choiceRow: { display: "flex", alignItems: "center", gap: 10, margin: "13px 0", fontSize: 17 },
  choice: { background: "white", border: "1px solid #c6d5e8", borderRadius: 10, padding: "11px 15px", cursor: "pointer", fontSize: 16 },
  choiceActive: { background: "#ffd34d", border: "1px solid #ffd34d", borderRadius: 10, padding: "11px 15px", cursor: "pointer", fontSize: 16, fontWeight: 900 },
  goldButton: { width: "100%", background: "#ffd34d", color: "#07111f", border: "2px solid #07111f", borderRadius: 16, padding: "17px 20px", fontSize: 21, fontWeight: 900, cursor: "pointer", marginTop: 20 },
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
  converterBox: { background: "white", borderRadius: 16, padding: 16, margin: "14px 0", border: "1px solid #c6d5e8" },
  converterSmall: { margin: "8px 0", color: "#475569", fontSize: 14 },
  convertButton: { width: "100%", background: "#07111f", color: "white", border: 0, borderRadius: 12, padding: "12px 14px", fontWeight: 900, cursor: "pointer", marginTop: 8 },
  convertResult: { marginTop: 12, background: "#eef4ff", borderRadius: 12, padding: 12, fontWeight: 900 },
  rateGood: { background: "#dff7e6", borderRadius: 14, padding: 12, margin: "12px 0", fontWeight: 900, color: "#075b24" },
  infoPage: { minHeight: "100vh", background: "#07111f", color: "white", padding: 42, fontFamily: "Arial, sans-serif" },
  backButton: { background: "#ffd34d", border: 0, borderRadius: 12, padding: "13px 18px", fontWeight: 900, cursor: "pointer" },
  guideTitle: { fontSize: 54, color: "#ffd34d" },
  guideIntro: { fontSize: 22, maxWidth: 900, lineHeight: 1.55 },
  guidePanel: { background: "rgba(255,255,255,.12)", borderRadius: 22, padding: 28, marginTop: 24, fontSize: 20, lineHeight: 1.6 },
  sectionTitle: { marginTop: 30 },
  featuredGrid: { display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 18, marginTop: 18 },
  featureCard: { background: "white", color: "#07111f", borderRadius: 18, overflow: "hidden" },
  featureBody: { padding: 16 },
};




