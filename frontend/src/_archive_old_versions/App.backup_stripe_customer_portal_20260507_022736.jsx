import React, { useEffect, useMemo, useState } from "react";

const API_BASE = "http://127.0.0.1:5050";

const FEATURED_GUIDES = {
  Lagos: {
    title: "Lagos: beaches, business districts, nightlife, and culture",
    intro:
      "Lagos is bold, energetic, and full of contrast. Stay close to Victoria Island, Ikoyi, Lekki, or Ikeja depending on whether your trip is for business, leisure, family visits, or nightlife.",
    highlights: [
      "Victoria Island and Ikoyi are strong choices for business travellers and premium stays.",
      "Lekki offers restaurants, lounges, beaches, shopping, and modern apartments.",
      "Ikeja is useful for airport access and shorter business trips.",
      "Landmark Beach, Nike Art Gallery, and the Lekki Conservation Centre are popular visitor highlights.",
    ],
  },
  Abuja: {
    title: "Abuja: calm city planning, premium districts, and scenic views",
    intro:
      "Abuja is a polished capital city with wide roads, diplomatic areas, upscale hotels, parks, hills, and a calmer pace than Lagos.",
    highlights: [
      "Maitama, Wuse, and Asokoro are convenient for government, business, and diplomatic visits.",
      "Jabi offers lake views, shopping, and relaxed dining.",
      "Aso Rock and surrounding hills give Abuja its distinctive identity.",
      "Choose location carefully because Abuja is spacious and journeys vary by district.",
    ],
  },
  London: {
    title: "London: history, theatre, shopping, museums, and riverside stays",
    intro:
      "London rewards travellers who choose the right neighbourhood. From royal parks to theatres and museums, the city works for luxury breaks, business trips, family visits, and culture-filled weekends.",
    highlights: [
      "Mayfair and Knightsbridge are ideal for luxury shopping and premium hotels.",
      "South Kensington is excellent for museums and family travel.",
      "Covent Garden and the West End suit theatre, restaurants, and walkability.",
      "Canary Wharf is practical for business travellers.",
    ],
  },
  Paris: {
    title: "Paris: art, romance, fashion, food, and timeless neighbourhoods",
    intro:
      "Paris is best experienced by area. Choose carefully between classic elegance, boutique streets, museum access, luxury shopping, and relaxed café culture.",
    highlights: [
      "Saint-Germain offers classic Paris style and walkable charm.",
      "Le Marais is loved for boutiques, cafés, food, and nightlife.",
      "The 8th arrondissement is strong for luxury hotels and shopping.",
      "The Louvre, Seine, Eiffel Tower, and Montmartre remain essential highlights.",
    ],
  },
  Dubai: {
    title: "Dubai: luxury stays, beaches, shopping, skyline views, and desert escapes",
    intro:
      "Dubai is built for memorable travel. Choose Downtown for landmarks, Marina for waterfront energy, Palm Jumeirah for resorts, or Deira and Bur Dubai for heritage and value.",
    highlights: [
      "Downtown Dubai works well for Burj Khalifa, Dubai Mall, and first-time visitors.",
      "Dubai Marina suits nightlife, waterfront dining, and serviced apartments.",
      "Palm Jumeirah is best for resort-style luxury.",
      "Desert experiences add a memorable contrast to the city skyline.",
    ],
  },
};

function safeText(value) {
  return String(value || "").trim();
}

function displayCityName(city) {
  return safeText(city) || "your destination";
}

function getImageProxyUrl(hotel) {
  const raw = safeText(hotel.image_url || hotel.image);
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

function PropertyImage({ hotel }) {
  const [failed, setFailed] = useState(false);
  const image = getImageProxyUrl(hotel);

  if (!image || failed) {
    return (
      <div style={styles.imagePending}>
        <div style={styles.imagePendingTitle}>Image being verified</div>
        <div style={styles.imagePendingText}>We only display trusted property photos.</div>
      </div>
    );
  }

  return (
    <img
      src={image}
      alt={hotel.hotel_name || hotel.name || "Hotel"}
      loading="lazy"
      style={styles.hotelImage}
      onError={() => setFailed(true)}
    />
  );
}

function GuidePage({ onBack, city, country, hotels }) {
  const chosenCity = displayCityName(city);
  const guide = FEATURED_GUIDES[chosenCity] || {
    title: `${chosenCity}: where to stay, what to see, and how to plan`,
    intro:
      `${chosenCity} offers a range of stays for different travel styles. Compare neighbourhoods, hotel images, location, comfort, and access before choosing your preferred property.`,
    highlights: [
      "Choose your area first, then compare hotels by comfort and location.",
      "Check transport access, business districts, beaches, attractions, and family convenience.",
      "Use property photos and neighbourhood details to avoid poor location choices.",
      "Send a reservation request so current availability and price can be confirmed before payment.",
    ],
  };

  const guideHotels = hotels.filter((h) => getImageProxyUrl(h)).slice(0, 4);

  return (
    <div style={styles.infoPage}>
      <button style={styles.backButton} onClick={onBack}>Back to search</button>
      <div style={styles.brandSmall}>MYSPACE HOTEL</div>
      <h1 style={styles.guideTitle}>{guide.title}</h1>
      <p style={styles.guideIntro}>{guide.intro}</p>

      {guideHotels.length > 0 && (
        <>
          <h2 style={styles.sectionTitle}>Featured stays in {chosenCity}</h2>
          <div style={styles.guideHotelGrid}>
            {guideHotels.map((hotel) => (
              <div key={hotel.hotel_id || hotel.id} style={styles.guideHotelCard}>
                <PropertyImage hotel={hotel} />
                <div style={styles.guideHotelBody}>
                  <h3>{hotel.hotel_name || hotel.name}</h3>
                  <p>{hotel.area || hotel.address || country}</p>
                </div>
              </div>
            ))}
          </div>
        </>
      )}

      <div style={styles.guideNotes}>
        <h2>Places of interest and travel tips</h2>
        {guide.highlights.map((item) => (
          <p key={item}>• {item}</p>
        ))}
      </div>
    </div>
  );
}

function InfoPage({ onBack, title, children }) {
  return (
    <div style={styles.infoPage}>
      <button style={styles.backButton} onClick={onBack}>Back to search</button>
      <div style={styles.brandSmall}>MYSPACE HOTEL</div>
      <h1 style={styles.guideTitle}>{title}</h1>
      <div style={styles.guideNotes}>{children}</div>
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
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    async function loadDestinations() {
      try {
        const res = await fetch(`${API_BASE}/api/real-catalog/destinations`);
        const data = await res.json();
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
        setMessage("We could not load destinations. Please try again shortly.");
      }
    }

    loadDestinations();
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

      const res = await fetch(`${API_BASE}/api/real-catalog/search?${params.toString()}`);
      const data = await res.json();
      const list = Array.isArray(data.hotels) ? data.hotels : [];

      setHotels(list);
      setMessage(
        list.length
          ? `${list.length} stays found in ${displayCityName(city)}. Choose a property to continue.`
          : `No stays found for this search. Try another area, keyword, or nearby city.`
      );
    } catch {
      setMessage("Search is temporarily unavailable. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  async function sendReservationRequest() {
    if (!selectedHotel) return setMessage("Please choose a hotel first.");
    if (!customerName.trim()) return setMessage("Please enter your full name.");
    if (!customerEmail.trim()) return setMessage("Please enter your email address.");

    try {
      const payload = {
        hotel_id: selectedHotel.hotel_id || selectedHotel.id,
        hotel_name: selectedHotel.hotel_name || selectedHotel.name,
        destination: `${displayCityName(city)}, ${country}`,
        checkin,
        checkout,
        guests,
        rooms,
        customer_name: customerName.trim(),
        customer_email: customerEmail.trim(),
        customer_phone: customerPhone.trim(),
        note: note.trim(),
      };

      const res = await fetch(`${API_BASE}/reservation-request`, {
        method: "POST",
        headers: {"Content-Type": "application/json"},
        body: JSON.stringify(payload),
      });

      const data = await res.json();

      setMessage(
        data.message ||
        "Your request has been received. Our reservations team will confirm the latest availability and next steps."
      );
    } catch {
      setMessage("We could not send your request. Please try again.");
    }
  }

  if (page === "guide") {
    return <GuidePage onBack={() => setPage("home")} city={city} country={country} hotels={hotels} />;
  }

  if (page === "faq") {
    return (
      <InfoPage onBack={() => setPage("home")} title="Frequently asked questions">
        <p><b>How do I choose a hotel?</b><br />Search by country, city, neighbourhood, dates, and travel style. Compare location, images, and property details before sending a request.</p>
        <p><b>Is payment taken immediately?</b><br />For properties that require confirmation, current availability and price are checked before payment is requested.</p>
        <p><b>Why do some images say they are being verified?</b><br />We avoid misleading photos. Images are shown only when a trusted property image is available.</p>
      </InfoPage>
    );
  }

  if (page === "terms") {
    return (
      <InfoPage onBack={() => setPage("home")} title="Booking terms">
        <p>Hotel rates, room availability, cancellation conditions, taxes, and payment terms may vary by property, destination, supplier, room type, and dates.</p>
        <p>Please review your selected hotel, travel dates, guest count, room count, and contact details before submitting a reservation request.</p>
      </InfoPage>
    );
  }

  if (page === "support") {
    return (
      <InfoPage onBack={() => setPage("home")} title="Customer support">
        <p>For help with a reservation request, payment link, hotel selection, or booking update, contact:</p>
        <p><b>reservations@myspace-hotel.com</b></p>
        <p>Please include your name, destination, hotel name, travel dates, and booking email.</p>
      </InfoPage>
    );
  }

  return (
    <div style={styles.page}>
      <section style={styles.left}>
        <div style={styles.brand}>MYSPACE HOTEL</div>
        <h1 style={styles.hero}>Find memorable stays worldwide with confidence.</h1>
        <p style={styles.sub}>
          Choose your destination, compare real properties, and send a secure reservation request with clarity.
        </p>

        <div style={styles.leftButtons}>
          <button style={styles.navButton} onClick={() => setPage("guide")}>Premium Travel Guide</button>
          <button style={styles.navButton} onClick={() => setPage("faq")}>FAQs</button>
          <button style={styles.navButton} onClick={() => setPage("terms")}>Booking Terms</button>
          <button style={styles.navButton} onClick={() => setPage("support")}>Customer Support</button>
        </div>

        <div style={styles.destinationPanel}>
          <h2>{displayCityName(city)}, {country || "Worldwide"}</h2>
          <p>
            Find stays close to the neighbourhoods, attractions, beaches, business districts, and transport links that matter most to your trip.
          </p>
          <div style={styles.momentGrid}>
            <span>Verified property images</span>
            <span>Neighbourhood choice</span>
            <span>Reservation support</span>
            <span>Clear next steps</span>
          </div>
        </div>
      </section>

      <section style={styles.right}>
        <div style={styles.searchBox}>
          <h2 style={styles.heading}>Search destinations</h2>
          <p style={styles.copy}>Tell us where you want to stay, choose your dates, and compare properties with useful booking details.</p>

          <select
            style={styles.input}
            value={country}
            onChange={(e) => {
              const nextCountry = e.target.value;
              const item = destinations.find((x) => x.country === nextCountry);
              setCountry(nextCountry);
              setCity(item?.cities?.[0]?.city || "");
            }}
          >
            {destinations.map((item) => (
              <option key={item.country} value={item.country}>
                {item.country}
              </option>
            ))}
          </select>

          <select style={styles.input} value={city} onChange={(e) => setCity(e.target.value)}>
            {cityOptions.map((item) => (
              <option key={item.city} value={item.city}>{item.city}</option>
            ))}
          </select>

          <input style={styles.input} value={area} onChange={(e) => setArea(e.target.value)} placeholder="Preferred area or neighbourhood" />
          <input style={styles.input} value={keyword} onChange={(e) => setKeyword(e.target.value)} placeholder="Hotel name or travel style" />

          <div style={styles.dateGrid}>
            <label>Check-in<input style={styles.input} type="date" value={checkin} onChange={(e) => setCheckin(e.target.value)} /></label>
            <label>Check-out<input style={styles.input} type="date" value={checkout} onChange={(e) => setCheckout(e.target.value)} /></label>
          </div>

          <div style={styles.choiceRow}>
            <b>Guests</b>
            {[1,2,3,4,5,6].map((n) => (
              <button key={n} style={guests === n ? styles.choiceActive : styles.choice} onClick={() => setGuests(n)}>{n}</button>
            ))}
          </div>

          <div style={styles.choiceRow}>
            <b>Rooms</b>
            {[1,2,3,4].map((n) => (
              <button key={n} style={rooms === n ? styles.choiceActive : styles.choice} onClick={() => setRooms(n)}>{n}</button>
            ))}
          </div>

          <button style={styles.goldButton} onClick={searchHotels} disabled={loading}>
            {loading ? "Searching stays..." : "Search available stays"}
          </button>

          {message && <div style={styles.notice}>{message}</div>}
        </div>

        <div style={styles.twoCol}>
          <div>
            <div style={styles.label}>AVAILABLE STAYS</div>
            <h2>{hotels.length} stays in {displayCityName(city)}</h2>

            <div style={styles.results}>
              {hotels.map((hotel) => (
                <div
                  key={hotel.hotel_id || hotel.id}
                  style={selectedHotel?.hotel_id === hotel.hotel_id ? styles.cardSelected : styles.card}
                  onClick={() => setSelectedHotel(hotel)}
                >
                  <PropertyImage hotel={hotel} />
                  <h3 style={styles.hotelName}>{hotel.hotel_name || hotel.name}</h3>
                  <p>{hotel.area || hotel.address || hotel.city}</p>
                  <p><b>{hotel.rating || "Selected property"}</b></p>
                  <div style={styles.rateGood}>Available for reservation request</div>
                </div>
              ))}
            </div>
          </div>

          <aside style={styles.reserve}>
            <div style={styles.label}>RESERVATION REQUEST</div>
            <h2>Review and continue</h2>
            <div style={styles.selectedBox}>{selectedHotel ? (selectedHotel.hotel_name || selectedHotel.name) : "Choose a stay"}</div>

            <input style={styles.input} value={customerName} onChange={(e) => setCustomerName(e.target.value)} placeholder="Full name" />
            <input style={styles.input} value={customerEmail} onChange={(e) => setCustomerEmail(e.target.value)} placeholder="Email address" />
            <input style={styles.input} value={customerPhone} onChange={(e) => setCustomerPhone(e.target.value)} placeholder="Phone number" />
            <textarea style={styles.textarea} value={note} onChange={(e) => setNote(e.target.value)} placeholder="Special requests, arrival time, room needs, or questions" />

            <button style={styles.goldButton} onClick={sendReservationRequest}>Send reservation request</button>
            <div style={styles.safeNote}>Our reservations team will help confirm the latest availability and next steps.</div>
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
  imagePending: { height: 260, borderRadius: 12, background: "linear-gradient(135deg,#10254a,#1d4da8)", color: "white", display: "flex", flexDirection: "column", justifyContent: "center", padding: 24, boxSizing: "border-box" },
  imagePendingTitle: { fontSize: 26, fontWeight: 900 },
  imagePendingText: { fontSize: 15, lineHeight: 1.45, marginTop: 10 },
  hotelName: { fontSize: 27, marginBottom: 8 },
  reserve: { position: "sticky", top: 0, alignSelf: "start" },
  selectedBox: { background: "#f3f7ff", borderRadius: 18, padding: 20, margin: "14px 0", fontWeight: 900, fontSize: 18 },
  safeNote: { background: "#dff7e6", borderRadius: 14, padding: 15, marginTop: 14, fontWeight: 800 },
  rateGood: { background: "#dff7e6", borderRadius: 14, padding: 12, margin: "12px 0", fontWeight: 900, color: "#075b24" },
  infoPage: { minHeight: "100vh", background: "#07111f", color: "white", padding: 42, fontFamily: "Arial, sans-serif" },
  backButton: { background: "#ffd34d", border: 0, borderRadius: 12, padding: "13px 18px", fontWeight: 900, cursor: "pointer" },
  guideTitle: { fontSize: 54, color: "#ffd34d" },
  guideIntro: { fontSize: 22, maxWidth: 900, lineHeight: 1.55 },
  sectionTitle: { marginTop: 30 },
  guideHotelGrid: { display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 18, marginTop: 18 },
  guideHotelCard: { background: "white", color: "#07111f", borderRadius: 18, overflow: "hidden" },
  guideHotelBody: { padding: 16 },
  guideNotes: { background: "rgba(255,255,255,.12)", borderRadius: 22, padding: 28, marginTop: 28, fontSize: 20, lineHeight: 1.6 },
};
