import React, { useMemo, useState } from "react";

const API_BASE = "http://127.0.0.1:5050";

const DESTINATIONS = {
  LON: {
    name: "London",
    country: "United Kingdom",
    headline: "Historic grandeur, theatre nights, riverside walks, and elegant city stays.",
    guide:
      "London rewards travellers who choose the right neighbourhood. Stay near Tower Bridge for river views and history, Mayfair for luxury shopping, Canary Wharf for business, South Kensington for museums, and Covent Garden for theatre, dining, and walkability.",
    moments: ["Tower Bridge at sunset", "West End theatre", "Afternoon tea", "Museum mornings"],
  },
  PAR: {
    name: "Paris",
    country: "France",
    headline: "Romance, design, cafés, galleries, and unforgettable neighbourhood charm.",
    guide:
      "Paris is best enjoyed slowly. Choose Saint-Germain for classic elegance, Le Marais for boutiques and food, the 8th for luxury, and the Latin Quarter for culture.",
    moments: ["Seine evening walks", "Louvre mornings", "Café terraces", "Boutique streets"],
  },
  BCN: {
    name: "Barcelona",
    country: "Spain",
    headline: "Architecture, beach energy, food markets, and warm Mediterranean nights.",
    guide:
      "Barcelona works beautifully when you balance beach access with culture. Eixample is ideal for architecture and comfort, the Gothic Quarter for history, Barceloneta for the sea, and Gràcia for local charm.",
    moments: ["Sagrada Família", "Tapas evenings", "Beach afternoons", "Gothic lanes"],
  },
  DXB: {
    name: "Dubai",
    country: "United Arab Emirates",
    headline: "Luxury towers, beach clubs, desert escapes, shopping, and fine dining.",
    guide:
      "Dubai is about choosing the right base. Downtown is best for Burj Khalifa and shopping, Marina for nightlife and waterfront stays, Palm Jumeirah for resort luxury, and Deira for heritage and value.",
    moments: ["Burj Khalifa views", "Desert dinner", "Marina nights", "Beach resorts"],
  },
  AMS: {
    name: "Amsterdam",
    country: "Netherlands",
    headline: "Canals, museums, boutique hotels, cycling routes, and quiet elegance.",
    guide:
      "Amsterdam is a city of atmosphere. Stay near the Canal Ring for beauty, Museum Quarter for culture, Jordaan for charm, and De Pijp for restaurants and nightlife.",
    moments: ["Canal cruises", "Museum Quarter", "Jordaan cafés", "Cycling routes"],
  },
};

const FACILITIES = ["wifi", "breakfast", "parking", "pool", "gym", "family rooms", "airport shuttle", "spa"];

function destinationInfo(code) {
  return DESTINATIONS[String(code || "LON").toUpperCase()] || {
    name: String(code || "Destination").toUpperCase(),
    country: "",
    headline: "Find trusted stays, clear booking details, and a smoother trip from the first search.",
    guide:
      "Choose your stay by location, comfort, facilities, access, and the purpose of your trip. A well-chosen hotel makes the whole journey easier, safer, and more memorable.",
    moments: ["Central location", "Comfortable rooms", "Secure booking", "Helpful support"],
  };
}

function getRateKey(rate) {
  return rate?.rate_key || rate?.rateKey || "";
}

function getRateAmount(rate) {
  return rate?.selling_rate || rate?.sellingRate || rate?.net || rate?.amount || "";
}

function getRateCurrency(rate) {
  return rate?.currency || "";
}

function getPropertyImageUrl(hotel) {
  const url = String(hotel?.image_url || "").trim();
  const upper = url.toUpperCase();

  if (!url) return "";
  if (!url.startsWith("http://") && !url.startsWith("https://")) return "";
  if (upper.includes("PASTE_REAL")) return "";
  if (upper.includes("PUT_THE_REAL")) return "";
  if (upper.includes("PLACEHOLDER")) return "";
  if (upper.includes("UNSPLASH")) return "";
  if (upper.includes("PEXELS")) return "";
  if (upper.includes("PIXABAY")) return "";

  return `${API_BASE}/image-proxy?url=${encodeURIComponent(url)}`;
}

function PropertyImage({ hotel }) {
  const [failed, setFailed] = useState(false);
  const imageUrl = getPropertyImageUrl(hotel);

  if (!imageUrl || failed) return null;

  return (
    <img
      src={imageUrl}
      alt={`${hotel.name} property`}
      style={styles.hotelImage}
      onError={() => setFailed(true)}
    />
  );
}

function InfoPage({ title, children }) {
  return (
    <div style={styles.infoPage}>
      <div style={styles.infoCard}>
        <div style={styles.brandSmall}>MYSPACE HOTEL</div>
        <h1 style={styles.infoTitle}>{title}</h1>
        <div style={styles.infoBody}>{children}</div>
        <button style={styles.goldSmall} onClick={() => (window.location.href = "/")}>Back to hotel search</button>
      </div>
    </div>
  );
}

function TravelGuides() {
  return (
    <div style={styles.guidePage}>
      <div style={styles.guideHero}>
        <div style={styles.brandSmall}>MYSPACE HOTEL</div>
        <h1 style={styles.guideTitle}>Travel beautifully, choose wisely, stay memorably.</h1>
        <p style={styles.guideIntro}>
          Premium travel guidance for customers who want more than a room. Choose the right neighbourhood, the right style of stay, and the experiences that make a trip worth remembering.
        </p>
      </div>

      <div style={styles.guideGrid}>
        {Object.entries(DESTINATIONS).map(([code, d]) => (
          <div key={code} style={styles.guideCard}>
            <div style={styles.guideContent}>
              <div style={styles.destinationCode}>{code}</div>
              <h2>{d.name}</h2>
              <p style={styles.guideHeadline}>{d.headline}</p>
              <p>{d.guide}</p>
              <div style={styles.momentGrid}>
                {d.moments.map((m) => <span key={m}>{m}</span>)}
              </div>
              <button style={styles.guideButton} onClick={() => (window.location.href = "/")}>
                Find stays in {d.name}
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function FAQs() {
  return (
    <InfoPage title="Frequently asked questions">
      <p><b>How do I reserve?</b> Search, choose an available stay, enter your details, and continue through secure payment.</p>
      <p><b>Will I receive confirmation?</b> Yes. Your reservation update is sent to the email address you provide.</p>
      <p><b>Why choose MySpace Hotel?</b> We focus on clarity, secure payment, useful location insight, and confident hotel selection.</p>
    </InfoPage>
  );
}

function Terms() {
  return (
    <InfoPage title="Booking terms">
      <p>Please review hotel name, room type, dates, guests, location, price, and cancellation details before payment.</p>
      <p>Hotel conditions may vary by supplier, destination, rate, room type, and cancellation policy.</p>
    </InfoPage>
  );
}

function Support() {
  return (
    <InfoPage title="Customer support">
      <p>For reservation help, payment support, or booking follow-up, contact:</p>
      <p><b>reservations@myspace-hotel.com</b></p>
      <p>Please include your reservation code, hotel name, travel dates, and booking email.</p>
    </InfoPage>
  );
}

function Confirmed() {
  const params = new URLSearchParams(window.location.search);
  const code = params.get("code") || "Your reservation";
  const [status, setStatus] = React.useState("Confirming your booking update...");

  React.useEffect(() => {
    if (!code || code === "Your reservation") return;
    fetch(`${API_BASE}/reservation/${code}/mark-paid`, { method: "POST" })
      .then(() => setStatus("Your payment has been received. Your reservation update is being processed securely."))
      .catch(() => setStatus("Your payment has been received. Your reservation update is being processed securely."));
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
        <p style={styles.confirmTextSmall}>Please keep your reservation code safe. Booking updates will be sent by email.</p>
        <button style={styles.goldSmall} onClick={() => (window.location.href = "/")}>Back to hotel search</button>
      </div>
    </div>
  );
}

export default function App() {
  const path = window.location.pathname;
  if (path === "/travel") return <TravelGuides />;
  if (path === "/faq") return <FAQs />;
  if (path === "/terms") return <Terms />;
  if (path === "/support") return <Support />;
  if (path === "/reservation-confirmed") return <Confirmed />;

  const today = new Date().toISOString().slice(0, 10);
  const tomorrow = new Date(Date.now() + 86400000).toISOString().slice(0, 10);

  const [country, setCountry] = useState("uk");
  const [city, setCity] = useState("LON");
  const [area, setArea] = useState("");
  const [keyword, setKeyword] = useState("");
  const [checkin, setCheckin] = useState(today);
  const [checkout, setCheckout] = useState(tomorrow);
  const [guests, setGuests] = useState(2);
  const [rooms, setRooms] = useState(1);
  const [facilities, setFacilities] = useState([]);
  const [hotels, setHotels] = useState([]);
  const [selectedHotel, setSelectedHotel] = useState(null);
  const [customerName, setCustomerName] = useState("");
  const [customerEmail, setCustomerEmail] = useState("");
  const [customerPhone, setCustomerPhone] = useState("");
  const [note, setNote] = useState("");
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);
  const [requesting, setRequesting] = useState(false);

  const dest = destinationInfo(city);

  const normalisedHotels = useMemo(() => {
    return hotels.map((h, i) => ({
      id: String(h.hotel_id || h.id || `hotel-${i}`),
      hotel_id: String(h.hotel_id || h.id || `hotel-${i}`),
      name: h.hotel_name || h.name || "Selected hotel",
      city: h.city || city,
      country: h.country || country,
      area: h.area || "",
      address: h.address || "",
      rating: h.rating || "Available",
      lat: h.latitude || "",
      lng: h.longitude || "",
      image_url: h.image_url || "",
      has_verified_image: Boolean(h.has_verified_image),
      source: h.source || "",
      price_confirmation_required: Boolean(h.price_confirmation_required),
      availability_message: h.availability_message || "",
      first_rate: h.first_rate || null,
    }));
  }, [hotels, city, country]);

  const selectedRate = selectedHotel?.first_rate || null;
  const canBook = Boolean(selectedHotel && getRateKey(selectedRate) && !selectedHotel.price_confirmation_required);

  async function searchHotels() {
    setLoading(true);
    setMessage("");
    setSelectedHotel(null);

    try {
      const params = new URLSearchParams();
      params.set("country", country);
      params.set("city", city);
      params.set("destination_code", city);
      params.set("checkin", checkin);
      params.set("checkout", checkout);
      params.set("guests", String(guests));
      params.set("rooms", String(rooms));
      if (area.trim()) params.set("area", area.trim());
      if (keyword.trim()) params.set("keyword", keyword.trim());
      if (facilities.length) params.set("facilities", facilities.join(","));

      const res = await fetch(`${API_BASE}/api/hotels/search?${params.toString()}`);
      const data = await res.json();
      const list = Array.isArray(data.hotels) ? data.hotels : [];

      list.sort((a, b) => {
        const ai = a.image_url ? 1 : 0;
        const bi = b.image_url ? 1 : 0;
        return bi - ai;
      });

      setHotels(list);

      if (list.length > 0) {
        setMessage(`${list.length} available stays found in ${dest.name}. Choose your stay to review the details and continue securely.`);
      } else {
        setMessage(`No available stays found for ${dest.name}. Try different dates, fewer guests, or another destination.`);
      }
    } catch {
      setMessage("We could not complete your hotel search at this moment. Please try again shortly.");
    } finally {
      setLoading(false);
    }
  }

  async function requestAvailability() {
    if (!selectedHotel) return setMessage("Choose a hotel to continue.");
    if (!canBook) return setMessage("Choose another available hotel to continue securely.");
    if (!customerName.trim() || !customerEmail.trim()) return setMessage("Enter your name and email to continue.");

    setRequesting(true);
    setMessage("Preparing your secure booking page...");

    try {
      const rate = selectedHotel.first_rate;
      const payload = {
        hotel_id: selectedHotel.id,
        hotel_name: selectedHotel.name,
        destination: `${dest.name}, ${dest.country}`,
        checkin,
        checkout,
        guests: Number(guests),
        rooms: Number(rooms),
        customer_name: customerName.trim(),
        customer_email: customerEmail.trim(),
        customer_phone: customerPhone.trim() || "0000000000",
        note: note.trim(),
        rate_key: getRateKey(rate),
        amount: getRateAmount(rate),
        currency: getRateCurrency(rate),
        room_name: rate.room_name || "",
        board_name: rate.board_name || "",
        payment_type: rate.payment_type || "",
        cancellation_policies: rate.cancellation_policies || [],
        packaging: rate.packaging || "",
        allotment: rate.allotment || "",
      };

      const res = await fetch(`${API_BASE}/reservation-request`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const data = await res.json();

      if (!res.ok || !data.ok) {
        setMessage(data.detail || data.message || "We could not prepare this booking. Please try again or choose another available hotel.");
        return;
      }

      if (data.payment_url) {
        window.location.assign(data.payment_url);
        return;
      }

      setMessage(`Your reservation request has been received. Your reservation code is ${data.reservation_code}.`);
    } catch {
      setMessage("We could not reach the secure booking service. Please try again shortly.");
    } finally {
      setRequesting(false);
    }
  }

  function toggleFacility(item) {
    setFacilities((current) => current.includes(item) ? current.filter((x) => x !== item) : [...current, item]);
  }

  return (
    <div style={styles.page}>
      <section style={styles.hero}>
        <div style={styles.brand}>MYSPACE HOTEL</div>
        <h1 style={styles.heroTitle}>Find memorable stays in {dest.name} with confidence.</h1>
        <p style={styles.heroText}>{dest.headline}</p>

        <div style={styles.buttonRow}>
          <button style={styles.whiteButton} onClick={() => (window.location.href = "/travel")}>Premium Travel Guides</button>
          <button style={styles.whiteButton} onClick={() => (window.location.href = "/faq")}>FAQs</button>
          <button style={styles.whiteButton} onClick={() => (window.location.href = "/terms")}>Booking Terms</button>
          <button style={styles.whiteButton} onClick={() => (window.location.href = "/support")}>Customer Support</button>
        </div>

        <div style={styles.destinationPanel}>
          <h2>{dest.name}{dest.country ? `, ${dest.country}` : ""}</h2>
          <p>{dest.guide}</p>
          <div style={styles.momentGridHero}>
            {dest.moments.map((m) => <span key={m}>{m}</span>)}
          </div>
        </div>
      </section>

      <section style={styles.panel}>
        <h2 style={styles.heading}>Search available stays</h2>
        <p style={styles.copy}>
          Tell us where you want to stay, choose your dates, and compare available hotels with clear booking details.
        </p>

        <input style={styles.input} value={country} onChange={(e) => setCountry(e.target.value)} placeholder="Country" />
        <input style={styles.input} value={city} onChange={(e) => setCity(e.target.value.toUpperCase())} placeholder="Where would you like to stay? Try Paris, London, Barcelona, Dubai..." />

        <div style={styles.customerNote}>
          Popular destinations include Paris, London, Barcelona, Prague, Madrid, Istanbul, Mallorca, Dubai, and Amsterdam.
        </div>

        <input style={styles.input} value={area} onChange={(e) => setArea(e.target.value)} placeholder="Preferred area or neighbourhood" />
        <input style={styles.input} value={keyword} onChange={(e) => setKeyword(e.target.value)} placeholder="Hotel name or travel style" />

        <div style={styles.dateGrid}>
          <label>Check-in<input style={styles.input} type="date" value={checkin} onChange={(e) => setCheckin(e.target.value)} /></label>
          <label>Check-out<input style={styles.input} type="date" value={checkout} onChange={(e) => setCheckout(e.target.value)} /></label>
        </div>

        <div style={styles.choiceRow}><b>Guests</b>{[1,2,3,4,5,6].map((n) => <button key={n} style={guests === n ? styles.choiceActive : styles.choice} onClick={() => setGuests(n)}>{n}</button>)}</div>
        <div style={styles.choiceRow}><b>Rooms</b>{[1,2,3,4].map((n) => <button key={n} style={rooms === n ? styles.choiceActive : styles.choice} onClick={() => setRooms(n)}>{n}</button>)}</div>

        <div style={styles.facilities}>
          <h3>Preferred facilities</h3>
          <div style={styles.facilityGrid}>
            {FACILITIES.map((item) => (
              <label key={item} style={styles.checkLabel}>
                <input type="checkbox" checked={facilities.includes(item)} onChange={() => toggleFacility(item)} />
                {item}
              </label>
            ))}
          </div>
        </div>

        <button style={styles.goldButton} onClick={searchHotels} disabled={loading}>
          {loading ? "Checking available hotels..." : "Search available hotels"}
        </button>

        {message && <div style={styles.notice}>{message}</div>}

        <div style={styles.twoCol}>
          <div>
            <div style={styles.label}>AVAILABLE STAYS</div>
            <h2>{normalisedHotels.length} available stays</h2>
            <div style={styles.results}>
              {normalisedHotels.map((hotel) => {
                const rate = hotel.first_rate;
                return (
                  <div key={hotel.id} style={selectedHotel?.id === hotel.id ? styles.cardSelected : styles.card} onClick={() => setSelectedHotel(hotel)}>
                    <PropertyImage hotel={hotel} />
                    <h3 style={styles.hotelName}>{hotel.name}</h3>
                    <p>{[hotel.area, hotel.city, hotel.country].filter(Boolean).join(", ")}</p>
                    <p><b>{hotel.rating}</b> rating</p>
                    <div style={hotel.price_confirmation_required ? styles.ratePending : styles.rateGood}>
                      {hotel.price_confirmation_required ? "Check today’s price before booking" : "Ready to book securely"}
                    </div>
                    <div style={styles.rateBox}>
                      {rate ? (
                        <>
                          <p><b>Room:</b> {rate.room_name || "Selected room"}</p>
                          <p><b>Board:</b> {rate.board_name || "Board details available at booking"}</p>
                          <p><b>Payment:</b> {rate.payment_type || "Secure payment"}</p>
                          <p><b>Price:</b> {getRateCurrency(rate)} {getRateAmount(rate) || "Available at checkout"}</p>
                        </>
                      ) : (
                        <>
                          <p><b>Status:</b> Available to review</p>
                          <p><b>Next step:</b> Choose this stay to check the latest room and price details.</p>
                        </>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          <aside style={styles.reserve}>
            <div style={styles.label}>SECURE BOOKING</div>
            <h2>Review and continue</h2>
            <div style={styles.selectedBox}>{selectedHotel ? selectedHotel.name : "Choose your stay"}</div>

            {selectedRate && (
              <div style={styles.rateBox}>
                <p><b>Room:</b> {selectedRate.room_name || "Selected room"}</p>
                <p><b>Board:</b> {selectedRate.board_name || "Board details available at booking"}</p>
                <p><b>Amount:</b> {getRateCurrency(selectedRate)} {getRateAmount(selectedRate) || "Available at checkout"}</p>
              </div>
            )}

            {selectedHotel && (
              <div style={styles.mapBox}>
                <iframe
                  title="Hotel map"
                  style={styles.map}
                  loading="lazy"
                  src={selectedHotel.lat && selectedHotel.lng
                    ? `https://maps.google.com/maps?q=${selectedHotel.lat},${selectedHotel.lng}&z=14&output=embed`
                    : `https://maps.google.com/maps?q=${encodeURIComponent(selectedHotel.name + " " + dest.name)}&z=14&output=embed`}
                />
              </div>
            )}

            <input style={styles.input} value={customerName} onChange={(e) => setCustomerName(e.target.value)} placeholder="Full name" />
            <input style={styles.input} value={customerEmail} onChange={(e) => setCustomerEmail(e.target.value)} placeholder="Email address" />
            <input style={styles.input} value={customerPhone} onChange={(e) => setCustomerPhone(e.target.value)} placeholder="Phone number for booking updates" />
            <textarea style={styles.textarea} value={note} onChange={(e) => setNote(e.target.value)} placeholder="Any special requests? Optional" />

            <button style={styles.goldButton} disabled={requesting || !canBook} onClick={requestAvailability}>
              {requesting ? "Preparing secure booking..." : canBook ? "Reserve this stay" : selectedHotel?.price_confirmation_required ? "Check latest price" : "Choose a hotel to continue"}
            </button>

            <div style={styles.safeNote}>Secure booking. Clear details. Trusted reservation process.</div>
          </aside>
        </div>
      </section>
    </div>
  );
}

const styles = {
  page: { minHeight: "100vh", background: "#06101f", display: "grid", gridTemplateColumns: "1.05fr 1fr", gap: 28, padding: 28, fontFamily: "Arial, sans-serif", color: "#07111f" },
  hero: { background: "linear-gradient(145deg, rgba(10,36,92,.96), rgba(25,86,190,.92))", color: "white", borderRadius: 28, padding: 44 },
  brand: { letterSpacing: 18, fontWeight: 900, marginBottom: 40 },
  brandSmall: { letterSpacing: 10, fontWeight: 900, marginBottom: 20 },
  heroTitle: { fontSize: 54, lineHeight: 1.12, margin: 0 },
  heroText: { fontSize: 20, lineHeight: 1.55, marginTop: 26 },
  buttonRow: { display: "flex", flexWrap: "wrap", gap: 14, marginTop: 32 },
  whiteButton: { background: "white", color: "#07111f", border: 0, borderRadius: 10, padding: "16px 24px", fontWeight: 900, fontSize: 18, cursor: "pointer" },
  destinationPanel: { background: "rgba(0,0,0,.25)", border: "1px solid rgba(255,255,255,.28)", borderRadius: 22, padding: 24, marginTop: 38, fontSize: 18, lineHeight: 1.6 },
  momentGridHero: { display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginTop: 18 },
  panel: { background: "#eaf2fb", borderRadius: 28, padding: 36, maxHeight: "92vh", overflow: "auto" },
  heading: { fontSize: 34, margin: 0 },
  copy: { fontSize: 18, lineHeight: 1.5 },
  input: { width: "100%", boxSizing: "border-box", padding: "15px 17px", margin: "8px 0", borderRadius: 14, border: "1px solid #c6d5e8", fontSize: 17 },
  textarea: { width: "100%", boxSizing: "border-box", minHeight: 130, padding: "15px 17px", margin: "8px 0", borderRadius: 14, border: "1px solid #c6d5e8", fontSize: 17 },
  dateGrid: { display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 },
  choiceRow: { display: "flex", alignItems: "center", gap: 10, margin: "13px 0", fontSize: 17 },
  choice: { background: "white", border: "1px solid #c6d5e8", borderRadius: 10, padding: "11px 15px", cursor: "pointer", fontSize: 16 },
  choiceActive: { background: "#ffd34d", border: "1px solid #ffd34d", borderRadius: 10, padding: "11px 15px", cursor: "pointer", fontSize: 16, fontWeight: 900 },
  customerNote: { background: "white", border: "1px solid #c6d5e8", borderRadius: 14, padding: 14, margin: "8px 0 16px", fontWeight: 800, color: "#10254a" },
  facilities: { background: "white", borderRadius: 18, padding: 20, marginTop: 14 },
  facilityGrid: { display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 },
  checkLabel: { display: "flex", gap: 8, alignItems: "center", fontSize: 16 },
  goldButton: { width: "100%", background: "#ffd34d", color: "#07111f", border: "2px solid #07111f", borderRadius: 16, padding: "17px 20px", fontSize: 21, fontWeight: 900, cursor: "pointer", marginTop: 20 },
  goldSmall: { background: "#ffd34d", color: "#07111f", border: 0, borderRadius: 14, padding: "15px 22px", fontSize: 18, fontWeight: 900, cursor: "pointer", marginTop: 22 },
  notice: { background: "#fff2be", padding: 16, borderRadius: 14, margin: "18px 0", fontWeight: 900 },
  twoCol: { display: "grid", gridTemplateColumns: "1.1fr 0.9fr", gap: 24, marginTop: 26 },
  label: { letterSpacing: 10, color: "#63738e", fontWeight: 900, margin: "18px 0" },
  results: { maxHeight: 760, overflow: "auto", paddingRight: 8 },
  card: { background: "white", borderRadius: 20, padding: 18, marginBottom: 18, border: "2px solid transparent", cursor: "pointer" },
  cardSelected: { background: "white", borderRadius: 20, padding: 18, marginBottom: 18, border: "4px solid #ffd34d", cursor: "pointer" },
  hotelImage: { width: "100%", height: 260, objectFit: "cover", borderRadius: 12, marginBottom: 14 },
  hotelName: { fontSize: 27, marginBottom: 8 },
  reserve: { position: "sticky", top: 0, alignSelf: "start" },
  selectedBox: { background: "#f3f7ff", borderRadius: 18, padding: 20, margin: "14px 0", fontWeight: 900, fontSize: 18 },
  mapBox: { background: "white", padding: 10, borderRadius: 18, marginBottom: 14 },
  map: { width: "100%", height: 260, border: 0, borderRadius: 14 },
  safeNote: { background: "#dff7e6", borderRadius: 14, padding: 15, marginTop: 14, fontWeight: 800 },
  rateGood: { background: "#dff7e6", borderRadius: 14, padding: 12, margin: "12px 0", fontWeight: 900, color: "#075b24" },
  ratePending: { background: "#fff2be", borderRadius: 14, padding: 12, margin: "12px 0", fontWeight: 900, color: "#7a4b00" },
  rateBox: { background: "#f6f8fc", borderRadius: 14, padding: 14, margin: "12px 0", fontSize: 15, lineHeight: 1.35 },
  confirmPage: { minHeight: "100vh", background: "linear-gradient(90deg,#06101f 0%,#123a7a 52%,#06101f 52%)", color: "white", display: "flex", alignItems: "center", padding: 34, fontFamily: "Arial, sans-serif" },
  confirmCard: { maxWidth: 780, background: "rgba(255,255,255,0.12)", border: "1px solid rgba(255,255,255,0.22)", borderRadius: 28, padding: 40 },
  confirmTitle: { fontSize: 48, color: "#ffd34d", margin: "0 0 20px" },
  confirmText: { fontSize: 20, lineHeight: 1.55 },
  confirmTextSmall: { fontSize: 18, lineHeight: 1.55 },
  codeBox: { background: "rgba(255,255,255,0.14)", borderRadius: 18, padding: 22, margin: "24px 0", fontSize: 18 },
  codeText: { fontSize: 28, marginTop: 10, fontWeight: 900, color: "#ffd34d" },
  infoPage: { minHeight: "100vh", background: "linear-gradient(135deg,#06101f,#123a7a)", color: "white", padding: 34, fontFamily: "Arial, sans-serif" },
  infoCard: { maxWidth: 900, background: "rgba(255,255,255,0.12)", border: "1px solid rgba(255,255,255,0.22)", borderRadius: 28, padding: 40 },
  infoTitle: { fontSize: 46, color: "#ffd34d" },
  infoBody: { fontSize: 20, lineHeight: 1.7 },
  guidePage: { minHeight: "100vh", background: "#07111f", color: "white", padding: 34, fontFamily: "Arial, sans-serif" },
  guideHero: { background: "linear-gradient(135deg,#123a7a,#1d4da8)", borderRadius: 28, padding: 44, marginBottom: 28 },
  guideTitle: { fontSize: 56, maxWidth: 1000, lineHeight: 1.1 },
  guideIntro: { fontSize: 22, maxWidth: 850, lineHeight: 1.55 },
  guideGrid: { display: "grid", gridTemplateColumns: "1fr 1fr", gap: 24 },
  guideCard: { background: "white", color: "#07111f", borderRadius: 24, overflow: "hidden" },
  guideContent: { padding: 24, fontSize: 17, lineHeight: 1.6 },
  destinationCode: { letterSpacing: 8, color: "#63738e", fontWeight: 900 },
  guideHeadline: { fontWeight: 900, fontSize: 20 },
  momentGrid: { display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginTop: 18 },
  guideButton: { background: "#ffd34d", border: 0, borderRadius: 14, padding: "14px 18px", fontWeight: 900, marginTop: 18, cursor: "pointer" },
};