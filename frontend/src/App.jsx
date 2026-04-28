import React, { useState } from "react";
import "./App.css";

const API_BASE = "https://hotel-backend-1-ee5z.onrender.com";
const SUPPORT_EMAIL = "reservations@myspace-hotel.com";

const FACILITIES = ["wifi","gym","pool","airport shuttle","beach access","spa","restaurant","parking","family rooms","business lounge"];

const INFO = {
  faq: {
    title: "FAQs",
    intro: "Clear answers before customers search, compare, or request hotel availability.",
    rows: [
      ["How do I search?", "Enter country and city first. Add area, hotel name, or facilities only when you want to narrow results."],
      ["Why did my search return nothing?", "Start with country and city only. Filters can be added after results appear."],
      ["Do I pay immediately?", "No. Payment should only happen after availability and final price are confirmed."],
      ["Are prices final?", "Final prices depend on dates, room type, guest count, taxes, and hotel availability."],
      ["Can I use UK, USA, or NG?", "Yes. Common country abbreviations are supported where recognised by the database."]
    ]
  },
  terms: {
    title: "Booking Terms",
    intro: "Important information before continuing with a reservation request.",
    rows: [
      ["Availability", "A request is not a confirmed booking until availability is confirmed."],
      ["Price confirmation", "Final price must be confirmed for the selected dates, guests, room type, taxes, and local charges."],
      ["Customer details", "Customers must provide accurate names, email addresses, dates, destination, and room requirements."],
      ["Cancellation rules", "Cancellation rules depend on the selected hotel, room type, dates, and booking provider."],
      ["Payment", "Only continue to payment when the stay details and price have been confirmed."]
    ]
  },
  support: {
    title: "Customer Support",
    intro: "Help with hotel search and reservation requests.",
    rows: [
      ["Email", SUPPORT_EMAIL],
      ["What to include", "Send the country, city, dates, number of guests, selected hotel, and special room needs."],
      ["Search help", "Start with country and city only. Add area or facilities after results appear."],
      ["Availability help", "If one hotel is unavailable, support can help continue with another suitable stay."]
    ]
  }
};

function getHotels(payload) {
  const list = payload?.hotels || payload?.results || payload?.data || [];
  return Array.isArray(list) ? list : [];
}

function cleanImage(hotel) {
  const url = hotel?.image || hotel?.max_photo_url || hotel?.main_photo_url || hotel?.photo_url || hotel?.image_url || "";
  if (!url || typeof url !== "string") return "";
  return url.replace("square60", "max1280x900").replace("square200", "max1280x900").replace("max300", "max1280x900");
}

export default function App() {
  const [activePage, setActivePage] = useState("home");
  const [country, setCountry] = useState("uk");
  const [city, setCity] = useState("london");
  const [area, setArea] = useState("");
  const [keyword, setKeyword] = useState("");
  const [guests, setGuests] = useState(2);
  const [selectedFacilities, setSelectedFacilities] = useState([]);
  const [hotels, setHotels] = useState([]);
  const [selectedHotel, setSelectedHotel] = useState(null);
  const [notice, setNotice] = useState("");
  const [loading, setLoading] = useState(false);

  function toggleFacility(name) {
    setSelectedFacilities((old) => old.includes(name) ? old.filter((x) => x !== name) : [...old, name]);
  }

  async function searchHotels() {
    setLoading(true);
    setNotice("");
    setHotels([]);
    setSelectedHotel(null);

    try {
      const params = new URLSearchParams({ country, city, area, keyword, guests: String(guests), limit: "60" });
      if (selectedFacilities.length) params.set("facilities", selectedFacilities.join(","));

      const res = await fetch(`${API_BASE}/api/hotels/search?${params.toString()}`, { cache: "no-store" });
      const payload = await res.json();
      const list = getHotels(payload);
      setHotels(list);

      if (!list.length) setNotice("No hotel matched this search. Try country and city only first, then add area, hotel name, or facilities.");
    } catch {
      setNotice("Search is not connecting to the hotel server. Please try again shortly.");
    } finally {
      setLoading(false);
    }
  }

  if (activePage === "guide") {
    const mapQuery = encodeURIComponent([area, city, country].filter(Boolean).join(" ") || "London");
    return (
      <main className="app-shell">
        <section className="page-card">
          <button className="yellow-small" onClick={() => setActivePage("home")}>Back to hotel search</button>
          <h1>Travel Guides</h1>
          <p className="page-intro">Use the map to understand the destination area before choosing a stay.</p>
          <iframe title="Travel guide map" src={`https://www.google.com/maps?q=${mapQuery}&output=embed`} className="guide-map" loading="lazy" />
        </section>
      </main>
    );
  }

  if (activePage !== "home") {
    const content = INFO[activePage];
    return (
      <main className="app-shell">
        <section className="page-card">
          <button className="yellow-small" onClick={() => setActivePage("home")}>Back to hotel search</button>
          <h1>{content.title}</h1>
          <p className="page-intro">{content.intro}</p>
          <div className="answer-grid">
            {content.rows.map(([title, body]) => (
              <article key={title} className="answer-card">
                <h2>{title}</h2>
                <p>{body}</p>
              </article>
            ))}
          </div>
        </section>
      </main>
    );
  }

  return (
    <main className="app-shell">
      <section className="hero-grid">
        <section className="hero-card">
          <div className="brand">MY SPACE HOTEL</div>
          <h1>Find hotels around the world, compare stays clearly, and request availability with confidence.</h1>
          <p>Search real hotel records, compare location, facilities, images, and ratings, then continue only when the stay fits your trip.</p>
          <div className="count-box">50,015+ real hotel records available</div>

          <div className="nav-buttons">
            <button onClick={() => setActivePage("guide")}>Travel Guides</button>
            <button onClick={() => setActivePage("faq")}>FAQs</button>
            <button onClick={() => setActivePage("terms")}>Booking Terms</button>
            <button onClick={() => setActivePage("support")}>Customer Support</button>
          </div>

          <div className="hero-points">
            <b>Search by country, city, or area</b>
            <b>Filter by facilities that matter</b>
            <b>Compare stays before you decide</b>
            <b>Request availability directly</b>
          </div>
        </section>

        <section className="search-card">
          <h2>Search real hotels</h2>
          <p>Start with country and city. Add filters only when you want a narrower result.</p>

          <input value={country} onChange={(e) => setCountry(e.target.value)} placeholder="Country, e.g. UK, USA, NG" />
          <input value={city} onChange={(e) => setCity(e.target.value)} placeholder="City, e.g. London, Abuja" />
          <input value={area} onChange={(e) => setArea(e.target.value)} placeholder="Area, e.g. Mayfair, Lekki, City Centre" />
          <input value={keyword} onChange={(e) => setKeyword(e.target.value)} placeholder="Hotel name or keyword" />

          <div className="guest-row">
            <b>Guests</b>
            {[1,2,3,4,5,6].map((n) => <button key={n} className={guests === n ? "active" : ""} onClick={() => setGuests(n)}>{n}</button>)}
          </div>

          <div className="facility-box">
            <h3>Choose preferred facilities</h3>
            <div>{FACILITIES.map((f) => <label key={f}><input type="checkbox" checked={selectedFacilities.includes(f)} onChange={() => toggleFacility(f)} />{f}</label>)}</div>
          </div>

          <button className="search-button" onClick={searchHotels} disabled={loading}>{loading ? "Searching..." : "Search hotels"}</button>
          {notice && <div className="notice">{notice}</div>}
        </section>
      </section>

      <section className="results-grid">
        <section className="results-card">
          <h2>AVAILABLE STAYS</h2>
          <p>{hotels.length} stays shown</p>

          <div className="hotel-list">
            {hotels.map((hotel, index) => {
              const img = cleanImage(hotel);
              return (
                <button key={hotel.id || index} className="hotel-card" onClick={() => setSelectedHotel(hotel)}>
                  {img ? <img src={img} alt={hotel.name || "Hotel"} loading="lazy" /> : <div className="no-image">Image not supplied</div>}
                  <div>
                    <h3>{hotel.name || "Hotel"}</h3>
                    <p>{[hotel.area, hotel.city, hotel.country].filter(Boolean).join(", ")}</p>
                    <b>{hotel.rating ? `${hotel.rating} star` : "Rating not supplied"}{hotel.review_score ? ` • Review ${hotel.review_score}` : ""}</b>
                    {hotel.address && <p>{hotel.address}</p>}
                  </div>
                </button>
              );
            })}
          </div>
        </section>

        <section className="request-card">
          <h2>REQUEST AVAILABILITY</h2>
          <h3>Send your reservation request</h3>
          <div className="selected-hotel">{selectedHotel ? selectedHotel.name : "Select a hotel from the list to continue."}</div>
          <input placeholder="Your name" />
          <input placeholder="Your email" />
          <textarea placeholder="Special requests, dates, room needs, or questions" />
          <button>Request availability</button>
        </section>
      </section>
    </main>
  );
}
