import React, { useEffect, useMemo, useState } from "react";

const API_BASE =
  import.meta.env.VITE_API_BASE ||
  import.meta.env.VITE_API_BASE_URL ||
  "https://myspace-hotel-backend.onrender.com";

const CURRENCIES = ["GBP", "USD", "EUR", "NGN", "AED", "CAD", "AUD"];

const FX = {
  GBP: 1,
  USD: 1.27,
  EUR: 1.17,
  NGN: 1900,
  AED: 4.66,
  CAD: 1.72,
  AUD: 1.92
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

function clean(v) {
  return String(v || "").trim();
}

function nightsBetween(start, end) {
  const n = Math.ceil((new Date(end) - new Date(start)) / 86400000);
  return n > 0 ? n : 1;
}

function convert(amount, from, to) {
  if (!amount || from === to) return Number(amount || 0);
  if (!FX[from] || !FX[to]) return Number(amount || 0);
  return (Number(amount) / FX[from]) * FX[to];
}

function mapSearch(q) {
  return `https://www.google.com/maps/search/${encodeURIComponent(q)}`;
}

function mapDirections(q) {
  return `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(q)}`;
}

export default function App() {
  const [page, setPage] = useState("home");
  const [destinations, setDestinations] = useState([]);
  const [country, setCountry] = useState("");
  const [city, setCity] = useState("");
  const [stayType, setStayType] = useState("hotel");
  const [checkin, setCheckin] = useState(todayISO());
  const [checkout, setCheckout] = useState(tomorrowISO());
  const [guests, setGuests] = useState(2);
  const [rooms, setRooms] = useState(1);
  const [currency, setCurrency] = useState("GBP");

  const [hotels, setHotels] = useState([]);
  const [loadingHotels, setLoadingHotels] = useState(false);
  const [selectedHotel, setSelectedHotel] = useState(null);
  const [guideHotel, setGuideHotel] = useState(null);

  const [rateLoading, setRateLoading] = useState(false);
  const [rateResult, setRateResult] = useState(null);
  const [checkoutLoading, setCheckoutLoading] = useState(false);

  const [guest, setGuest] = useState({
    customer_name: "",
    customer_email: "",
    customer_phone: "",
    note: ""
  });

  const [partner, setPartner] = useState({
    partner_type: "hotel",
    business_name: "",
    legal_business_name: "",
    contact_name: "",
    email: "",
    phone: "",
    country: "",
    city: "",
    address: "",
    website: "",
    integration_interest: "pms-api",
    pms_provider: "oracle-ohip",
    notes: ""
  });

  const [partnerMessage, setPartnerMessage] = useState("");
  const [partnerLogin, setPartnerLogin] = useState({
    partner_id: "",
    token: ""
  });

  const selectedCountry = useMemo(
    () => destinations.find((x) => x.country === country),
    [destinations, country]
  );

  const cities = selectedCountry?.cities || [];
  const nights = nightsBetween(checkin, checkout);
  const rate = rateResult?.rate || null;
  const baseCurrency = rate?.currency || "GBP";
  const total = rate ? Number(rate.amount || 0) * Number(rooms || 1) * nights : 0;
  const convertedTotal = convert(total, baseCurrency, currency);

  useEffect(() => {
    loadDestinations();
  }, []);

  useEffect(() => {
    if (cities.length && !cities.find((x) => x.city === city)) {
      setCity(cities[0].city);
    }
  }, [cities, city]);

  async function loadDestinations() {
    try {
      const res = await fetch(`${API_BASE}/api/destinations`, { cache: "no-store" });
      const data = await res.json();
      const list = Array.isArray(data.countries) ? data.countries : [];
      setDestinations(list);

      if (list.length) {
        setCountry(list[0].country);
        setCity(list[0].cities?.[0]?.city || "");
      }
    } catch {
      setDestinations([]);
    }
  }

  async function searchHotels(nextCountry = country, nextCity = city) {
    if (!nextCountry || !nextCity) {
      alert("Please choose country and city first.");
      return;
    }

    setPage("results");
    setLoadingHotels(true);
    setHotels([]);
    setSelectedHotel(null);
    setRateResult(null);

    try {
      const params = new URLSearchParams({
        country: nextCountry,
        city: nextCity,
        stay_type: stayType,
        checkin,
        checkout,
        guests: String(guests),
        rooms: String(rooms),
        limit: "120"
      });

      const res = await fetch(`${API_BASE}/api/hotels/search?${params.toString()}`, { cache: "no-store" });
      const data = await res.json();
      setHotels(Array.isArray(data.hotels) ? data.hotels : []);
    } catch {
      alert("Stays could not be loaded. Please try again.");
    } finally {
      setLoadingHotels(false);
    }
  }

  async function selectHotel(hotel) {
    setSelectedHotel(hotel);
    setRateResult(null);
    setRateLoading(true);

    try {
      const params = new URLSearchParams({
        hotel_id: hotel.hotel_id || hotel.id,
        checkin,
        checkout,
        guests: String(guests),
        rooms: String(rooms)
      });

      const res = await fetch(`${API_BASE}/api/hotels/live-rate?${params.toString()}`, { cache: "no-store" });
      const data = await res.json();
      setRateResult(data);
    } catch {
      setRateResult({
        ok: false,
        message: "Live rate search could not complete. Please try another stay."
      });
    } finally {
      setRateLoading(false);
    }
  }

  async function reserveAndPay() {
    if (!selectedHotel) return alert("Select a stay first.");
    if (!rate?.amount || !rate?.rate_key) return alert("A supplier-backed rate is required before checkout.");
    if (!guest.customer_name || !guest.customer_email || !guest.customer_phone) {
      return alert("Please enter guest name, email and phone number.");
    }

    setCheckoutLoading(true);

    try {
      const res = await fetch(`${API_BASE}/api/create-checkout-session`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...guest,
          hotel_id: selectedHotel.hotel_id,
          hotel_name: selectedHotel.hotel_name || selectedHotel.name,
          destination: `${city}, ${country}`,
          checkin,
          checkout,
          guests: Number(guests),
          rooms: Number(rooms),
          nights,
          amount: total,
          currency: baseCurrency,
          converted_amount: convertedTotal,
          converted_currency: currency,
          rate_key: rate.rate_key,
          rate_status: rateResult?.rate_status || rate?.rate_status || ""
        })
      });

      const data = await res.json();
      if (data.url) window.location.href = data.url;
      else alert(data.error || "Checkout could not open.");
    } catch {
      alert("Secure checkout could not be started.");
    } finally {
      setCheckoutLoading(false);
    }
  }

  async function submitPartner() {
    if (!partner.business_name || !partner.contact_name || !partner.email) {
      alert("Please complete business name, contact name and email.");
      return;
    }

    try {
      const res = await fetch(`${API_BASE}/api/extranet/register`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(partner)
      });
      const data = await res.json();
      setPartnerMessage(data.message || "Partner application received.");
    } catch {
      setPartnerMessage("Partner application captured for review.");
    }
  }

  function openGuide(hotel = null) {
    setGuideHotel(hotel || selectedHotel);
    setPage("guide");
  }

  return (
    <div style={styles.page}>
      <Header setPage={setPage} currency={currency} setCurrency={setCurrency} />

      {page === "home" && (
        <>
          <section style={styles.hero}>
            <div style={styles.heroContent}>
              <div style={styles.heroTag}>Trusted stays. Clear prices. Global support.</div>
              <h1 style={styles.heroTitle}>Find your perfect stay</h1>
              <p style={styles.heroText}>
                Search hotels, apartments, villas and verified accommodation worldwide with
                supplier-backed rates, saved-rate transparency and secure checkout.
              </p>

              <div style={styles.heroBadges}>
                <span>113+ countries</span>
                <span>Supplier rate engine</span>
                <span>Hotelbeds connected</span>
                <span>PMS/API partner ready</span>
              </div>

              <SearchPanel
                destinations={destinations}
                country={country}
                city={city}
                cities={cities}
                stayType={stayType}
                checkin={checkin}
                checkout={checkout}
                guests={guests}
                rooms={rooms}
                loading={loadingHotels}
                setCountry={(v) => {
                  setCountry(v);
                  setCity("");
                }}
                setCity={setCity}
                setStayType={setStayType}
                setCheckin={setCheckin}
                setCheckout={setCheckout}
                setGuests={setGuests}
                setRooms={setRooms}
                searchHotels={() => searchHotels()}
              />
            </div>
          </section>

          <section style={styles.trustStrip}>
            <InfoPill title="Clean search" text="Countries and cities stay aligned from the searchable catalogue." />
            <InfoPill title="Rate transparency" text="Fresh live rates are preferred. Saved supplier rates are clearly marked." />
            <InfoPill title="Secure payment" text="Checkout opens only after a supplier-backed rate is available." />
          </section>

          <section style={styles.section}>
            <div style={styles.sectionHead}>
              <div>
                <h2>Popular destinations</h2>
                <p>Start with high-demand cities while the global catalogue remains available.</p>
              </div>
              <button style={styles.outlineBtn} onClick={() => setPage("guide")}>Open destination guide</button>
            </div>

            <div style={styles.destGrid}>
              {[
                ["United Kingdom", "London", "London", "Business, luxury and family stays"],
                ["France", "Paris", "Paris", "Romantic breaks and city hotels"],
                ["United Arab Emirates", "Dubai", "Dubai", "Luxury hotels and apartments"],
                ["United States", "New York", "New York", "City breaks and premium stays"],
                ["Spain", "Barcelona", "Barcelona", "Beach, city and culture stays"]
              ].map(([c, cityName, title, text]) => (
                <button
                  key={`${c}-${cityName}`}
                  style={styles.destCard}
                  onClick={() => {
                    setCountry(c);
                    setCity(cityName);
                    searchHotels(c, cityName);
                  }}
                >
                  <strong>{title}</strong>
                  <span>{c}</span>
                  <p>{text}</p>
                </button>
              ))}
            </div>
          </section>

          <section style={styles.section}>
            <div style={styles.valueGrid}>
              <ValueCard title="For travellers" text="Book with confidence using clear rate status and destination support." />
              <ValueCard title="For hotels" text="Apply to connect inventory, direct rates, PMS or API feeds." />
              <ValueCard title="For PMS/API partners" text="Oracle OHIP, SiteMinder, Cloudbeds, Mews and other integrations can be onboarded." />
              <ValueCard title="For global scale" text="Built to grow from supplier-backed search into multi-partner availability." />
            </div>
          </section>

          <section style={styles.partnerBanner}>
            <div>
              <h2>Partner with MySpace Hotel</h2>
              <p>Hotels, apartments, villas, travel partners, PMS providers and API partners can apply.</p>
            </div>
            <button onClick={() => setPage("partnerApply")}>Partner Application Form</button>
            <button onClick={() => setPage("partnerLogin")}>Partner Login</button>
          </section>

          <Footer setPage={setPage} />
        </>
      )}

      {page === "results" && (
        <main style={styles.resultsPage}>
          <button style={styles.backBtn} onClick={() => setPage("home")}>Back to search</button>

          <div style={styles.resultsLayout}>
            <section>
              <h2 style={styles.resultsTitle}>Available stays in {city}, {country}</h2>
              <p style={styles.resultsSub}>
                Showing {stayType === "hotel" ? "hotels only" : stayType === "other" ? "other accommodation only" : "hotels and other accommodation"}.
                Select a stay to check the live supplier rate or saved supplier fallback.
              </p>

              {loadingHotels && <div style={styles.notice}>Searching stays...</div>}
              {!loadingHotels && hotels.length === 0 && <div style={styles.notice}>No stays found for this exact search. Try another city or stay type.</div>}

              <div style={styles.hotelGrid}>
                {hotels.map((hotel, i) => (
                  <HotelCard
                    key={`${hotel.hotel_id}-${i}`}
                    hotel={hotel}
                    city={city}
                    country={country}
                    selectHotel={selectHotel}
                    openGuide={openGuide}
                  />
                ))}
              </div>
            </section>

            <aside style={styles.reservePanel}>
              <h2>Reserve / Pay</h2>

              {!selectedHotel && <div style={styles.notice}>Select a stay to check supplier-backed pricing.</div>}

              {selectedHotel && (
                <>
                  <h3>{selectedHotel.hotel_name || selectedHotel.name}</h3>
                  <p style={styles.muted}>{selectedHotel.address || selectedHotel.area || city}, {country}</p>

                  <div style={styles.rateBox}>
                    {rateLoading && (
                      <>
                        <span>Rate engine</span>
                        <strong>Searching...</strong>
                        <small>Checking Hotelbeds first, then saved supplier rates if needed.</small>
                      </>
                    )}

                    {!rateLoading && rate && (
                      <>
                        <span>{rateResult?.rate_status === "fresh_live" ? "Fresh live supplier rate" : "Saved supplier rate"}</span>
                        <strong>{baseCurrency} {money(total)}</strong>
                        <small>{nights} night{nights > 1 ? "s" : ""} | {guests} guest{Number(guests) > 1 ? "s" : ""} | {rooms} room{Number(rooms) > 1 ? "s" : ""}</small>
                      </>
                    )}

                    {!rateLoading && rateResult && !rate && (
                      <>
                        <span>Rate engine</span>
                        <strong>Unavailable</strong>
                        <small>{rateResult.message || "No supplier-backed rate available for this selected stay."}</small>
                      </>
                    )}
                  </div>

                  {rateResult?.rate_status === "fresh_live" && (
                    <div style={styles.successBox}>Fresh live supplier rate confirmed.</div>
                  )}

                  {rateResult?.rate_status === "saved_recent" && (
                    <div style={styles.warningBox}>{rateResult.warning}</div>
                  )}

                  <div style={styles.converterBox}>
                    <label>Currency converter</label>
                    <select value={currency} onChange={(e) => setCurrency(e.target.value)}>
                      {CURRENCIES.map((c) => <option key={c} value={c}>{c}</option>)}
                    </select>
                    <strong>{currency} {money(convertedTotal)}</strong>
                  </div>

                  <input style={styles.input} placeholder="Full name" value={guest.customer_name} onChange={(e) => setGuest({ ...guest, customer_name: e.target.value })} />
                  <input style={styles.input} placeholder="Email address" value={guest.customer_email} onChange={(e) => setGuest({ ...guest, customer_email: e.target.value })} />
                  <input style={styles.input} placeholder="Phone number" value={guest.customer_phone} onChange={(e) => setGuest({ ...guest, customer_phone: e.target.value })} />
                  <textarea style={styles.textarea} placeholder="Special request" value={guest.note} onChange={(e) => setGuest({ ...guest, note: e.target.value })} />

                  <button
                    style={{ ...styles.payBtn, opacity: rate ? 1 : 0.55 }}
                    disabled={!rate || checkoutLoading}
                    onClick={reserveAndPay}
                  >
                    {checkoutLoading ? "Opening checkout..." : rate ? "Reserve / Pay securely" : "Waiting for supplier rate"}
                  </button>

                  <button style={styles.outlineFullBtn} onClick={() => openGuide(selectedHotel)}>Open Guide / Map</button>
                </>
              )}
            </aside>
          </div>
        </main>
      )}

      {page === "guide" && <GuidePage setPage={setPage} place={[guideHotel?.hotel_name || guideHotel?.name, guideHotel?.address || guideHotel?.area, city, country].filter(Boolean).join(", ") || "your destination"} />}
      {page === "offers" && <OffersPage setPage={setPage} />}
      {page === "terms" && <TermsPage setPage={setPage} />}
      {page === "privacy" && <PrivacyPage setPage={setPage} />}
      {page === "contact" && <ContactPage setPage={setPage} />}
      {page === "partnerApply" && <PartnerApplyPage setPage={setPage} partner={partner} setPartner={setPartner} submitPartner={submitPartner} partnerMessage={partnerMessage} />}
      {page === "partnerLogin" && <PartnerLoginPage setPage={setPage} partnerLogin={partnerLogin} setPartnerLogin={setPartnerLogin} />}
    </div>
  );
}

function Header({ setPage, currency, setCurrency }) {
  return (
    <header style={styles.header}>
      <button style={styles.logoWrap} onClick={() => setPage("home")}>
        <div style={styles.logoIcon}>✦</div>
        <div>
          <div style={styles.logoText}>MYSPACE HOTEL</div>
          <div style={styles.logoSub}>Stay with clarity</div>
        </div>
      </button>

      <nav style={styles.nav}>
        <button onClick={() => setPage("home")}>Stays</button>
        <button onClick={() => setPage("guide")}>Destinations</button>
        <button onClick={() => setPage("offers")}>Offers</button>
        <button onClick={() => setPage("contact")}>Help</button>
        <select value={currency} onChange={(e) => setCurrency(e.target.value)}>
          {CURRENCIES.map((c) => <option key={c} value={c}>{c}</option>)}
        </select>
        <button style={styles.goldBtn} onClick={() => setPage("partnerApply")}>Partner Application Form</button>
        <button style={styles.blueOutlineBtn} onClick={() => setPage("partnerLogin")}>Partner Login</button>
      </nav>
    </header>
  );
}

function SearchPanel(props) {
  const {
    destinations, country, city, cities, stayType, checkin, checkout, guests, rooms, loading,
    setCountry, setCity, setStayType, setCheckin, setCheckout, setGuests, setRooms, searchHotels
  } = props;

  return (
    <div style={styles.searchPanel}>
      <div style={styles.searchGrid}>
        <label>Stay type
          <select value={stayType} onChange={(e) => setStayType(e.target.value)}>
            <option value="hotel">Hotels only</option>
            <option value="other">Apartments, villas, hostels and residences</option>
            <option value="both">Hotels and other accommodation</option>
          </select>
        </label>

        <label>Country
          <select value={country} onChange={(e) => setCountry(e.target.value)}>
            <option value="">Select country</option>
            {destinations.map((d) => <option key={d.country} value={d.country}>{d.country}</option>)}
          </select>
        </label>

        <label>City
          <select value={city} onChange={(e) => setCity(e.target.value)} disabled={!country}>
            <option value="">{country ? "Select city" : "Choose country first"}</option>
            {cities.map((c) => <option key={c.city} value={c.city}>{c.city}</option>)}
          </select>
        </label>

        <label>Check-in
          <input type="date" value={checkin} onChange={(e) => setCheckin(e.target.value)} />
        </label>

        <label>Check-out
          <input type="date" value={checkout} onChange={(e) => setCheckout(e.target.value)} />
        </label>

        <label>Guests
          <input type="number" min="1" value={guests} onChange={(e) => setGuests(e.target.value)} />
        </label>

        <label>Rooms
          <input type="number" min="1" value={rooms} onChange={(e) => setRooms(e.target.value)} />
        </label>

        <button style={styles.searchBtn} onClick={searchHotels}>{loading ? "Searching..." : "Search stays"}</button>
      </div>
    </div>
  );
}

function HotelCard({ hotel, city, country, selectHotel, openGuide }) {
  return (
    <div style={styles.hotelCard}>
      {hotel.image_url ? (
        <img src={hotel.image_url} alt={hotel.hotel_name || "Stay"} style={styles.hotelImg} />
      ) : (
        <div style={styles.noImage}>MYSPACE HOTEL</div>
      )}

      <div style={styles.hotelBody}>
        <div style={styles.hotelTop}>
          <span>Verified stay</span>
          <span>Rate on selection</span>
        </div>
        <h3>{hotel.hotel_name || hotel.name}</h3>
        <p>{hotel.address || hotel.area || city}, {country}</p>
        <div style={styles.rateNotice}>Supplier-backed rate is checked after you select this stay.</div>
        <div style={styles.hotelActions}>
          <button style={styles.selectBtn} onClick={() => selectHotel(hotel)}>Select Stay</button>
          <button style={styles.guideBtn} onClick={() => openGuide(hotel)}>Guide / Map</button>
        </div>
      </div>
    </div>
  );
}

function InfoPill({ title, text }) {
  return <div style={styles.infoPill}><strong>{title}</strong><span>{text}</span></div>;
}

function ValueCard({ title, text }) {
  return <div style={styles.valueCard}><h3>{title}</h3><p>{text}</p></div>;
}

function GuidePage({ setPage, place }) {
  const items = [
    ["Emergency", "Police, hospitals, pharmacies and urgent local support.", [["Police", mapSearch(`police near ${place}`)], ["Hospital", mapSearch(`hospital near ${place}`)], ["Pharmacy", mapSearch(`pharmacy near ${place}`)]]],
    ["Airport & transfers", "Airport, taxis, trains and route planning.", [["Airport", mapSearch(`airport near ${place}`)], ["Taxi", mapSearch(`taxi near ${place}`)], ["Directions", mapDirections(place)]]],
    ["Food & restaurants", "Restaurants, cafes, groceries and nearby food choices.", [["Restaurants", mapSearch(`restaurants near ${place}`)], ["Cafes", mapSearch(`cafes near ${place}`)], ["Supermarket", mapSearch(`supermarket near ${place}`)]]],
    ["Attractions", "Museums, tours, sightseeing, zoos and shopping.", [["Things to do", mapSearch(`things to do near ${place}`)], ["Museums", mapSearch(`museums near ${place}`)], ["Tour bus", mapSearch(`tour bus near ${place}`)]]],
    ["Transport", "Train stations, buses, car rental and local movement.", [["Train", mapSearch(`train station near ${place}`)], ["Bus", mapSearch(`bus station near ${place}`)], ["Car rental", mapSearch(`car rental near ${place}`)]]],
    ["Map", "Open map and local discovery.", [["Open map", mapSearch(place)], ["Directions", mapDirections(place)], ["Explore nearby", mapSearch(`restaurants hospitals airport attractions near ${place}`)]]]
  ];

  return (
    <main style={styles.contentPage}>
      <button style={styles.backBtn} onClick={() => setPage("home")}>Back to homepage</button>
      <div style={styles.pageHero}><h1>Destination Guide</h1><p>{place}</p></div>
      <div style={styles.guideGrid}>
        {items.map(([title, text, links]) => (
          <div key={title} style={styles.guideCard}>
            <h2>{title}</h2>
            <p>{text}</p>
            <div style={styles.guideLinks}>
              {links.map(([label, url]) => <a key={label} href={url} target="_blank" rel="noreferrer">{label}</a>)}
            </div>
          </div>
        ))}
      </div>
    </main>
  );
}

function OffersPage({ setPage }) {
  return (
    <main style={styles.contentPage}>
      <button style={styles.backBtn} onClick={() => setPage("home")}>Back to homepage</button>
      <div style={styles.pageHero}><h1>Offers</h1><p>Explore flexible stays, city breaks, family trips and business travel support.</p></div>
      <div style={styles.valueGrid}>
        <ValueCard title="Flexible city stays" text="Search hotels and other accommodation with clear pricing status." />
        <ValueCard title="Family and group stays" text="Use guests and rooms separately for better search accuracy." />
        <ValueCard title="Business travel" text="Find hotels near transport, financial districts and airports." />
        <ValueCard title="Partner-backed growth" text="More suppliers and PMS integrations can expand availability." />
      </div>
    </main>
  );
}

function TermsPage({ setPage }) {
  return (
    <main style={styles.contentPage}>
      <button style={styles.backBtn} onClick={() => setPage("home")}>Back to homepage</button>
      <div style={styles.pageHero}>
        <h1>Terms & Conditions</h1>
        <p>These terms are designed to protect guests and MySpace Hotel while maintaining transparency.</p>
      </div>

      <div style={styles.infoStack}>
        {[
          ["Platform role", "MySpace Hotel operates as a travel technology and accommodation booking platform connecting guests with hotels, accommodation providers, suppliers, PMS/API partners and payment providers. MySpace Hotel is not the owner or operator of every accommodation displayed unless clearly stated."],
          ["Supplier availability", "All availability, room categories, taxes, fees, amenities, cancellation conditions and final booking confirmation remain subject to supplier systems and accommodation provider rules at the time of confirmation."],
          ["Fresh and saved supplier rates", "Fresh live supplier rates are preferred. If a supplier is temporarily unavailable or quota-limited, MySpace Hotel may show a saved supplier-backed rate for transparency. Saved rates are not presented as freshly updated rates and may require final reconfirmation."],
          ["Pricing errors and reconfirmation", "MySpace Hotel reserves the right to cancel, amend, refund, reconfirm or refuse a booking where supplier pricing errors, stale rates, connectivity failures, fraud prevention checks, payment failures, force majeure events or accommodation-provider rejection occur."],
          ["Guest responsibility", "Guests must provide accurate names, email, phone number, dates, guest count and room count. Guests are responsible for passports, visas, destination entry rules, local taxes, deposits, conduct rules and special requirements."],
          ["Payments", "Payment is processed through secure checkout. A booking is not fully confirmed until payment and supplier confirmation are complete. MySpace Hotel may block checkout when no supplier-backed rate is available."],
          ["Cancellations and refunds", "Cancellation and refund rights depend on the selected supplier rate, accommodation rules, payment provider timing and local regulations. Non-refundable or partially refundable rates may apply."],
          ["Limitation of liability", "MySpace Hotel is not responsible for losses caused by supplier outages, incorrect customer details, travel disruption, denied entry, local charges, force majeure, third-party service failure or accommodation-provider decisions beyond MySpace Hotel’s reasonable control."]
        ].map(([title, text]) => (
          <div key={title} style={styles.infoPanel}><h2>{title}</h2><p>{text}</p></div>
        ))}
      </div>
    </main>
  );
}

function PrivacyPage({ setPage }) {
  return (
    <main style={styles.contentPage}>
      <button style={styles.backBtn} onClick={() => setPage("home")}>Back to homepage</button>
      <div style={styles.pageHero}><h1>Privacy Policy</h1><p>We use booking and partner details to support reservations, payments and customer service.</p></div>
      <div style={styles.infoStack}>
        <div style={styles.infoPanel}><h2>Customer data</h2><p>We process guest contact and booking information to support search, reservation, payment and customer service.</p></div>
        <div style={styles.infoPanel}><h2>Payment data</h2><p>Card details are handled by secure payment providers. MySpace Hotel does not need to expose card numbers in the app.</p></div>
        <div style={styles.infoPanel}><h2>Partner data</h2><p>Partner applications are used for onboarding, verification, integration and business communication.</p></div>
      </div>
    </main>
  );
}

function ContactPage({ setPage }) {
  return (
    <main style={styles.contentPage}>
      <button style={styles.backBtn} onClick={() => setPage("home")}>Back to homepage</button>
      <div style={styles.pageHero}><h1>Help & Contact</h1><p>For reservations, partner onboarding and travel support.</p></div>
      <div style={styles.valueGrid}>
        <ValueCard title="Reservations" text="Use the booking form and checkout after a supplier-backed rate loads." />
        <ValueCard title="Partners" text="Hotels, PMS providers and travel businesses should complete the Partner Application Form." />
        <ValueCard title="Destination support" text="Use the Guide page for local directions, emergency services, airports and attractions." />
      </div>
    </main>
  );
}

function PartnerApplyPage({ setPage, partner, setPartner, submitPartner, partnerMessage }) {
  const fields = [
    ["partner_type", "Partner type"],
    ["business_name", "Business / trading name"],
    ["legal_business_name", "Legal business name"],
    ["contact_name", "Contact name"],
    ["email", "Email"],
    ["phone", "Phone"],
    ["country", "Country"],
    ["city", "City"],
    ["address", "Address"],
    ["website", "Website"],
    ["integration_interest", "Integration interest"],
    ["pms_provider", "PMS / API provider"],
    ["notes", "Notes"]
  ];

  return (
    <main style={styles.contentPage}>
      <button style={styles.backBtn} onClick={() => setPage("home")}>Back to homepage</button>
      <div style={styles.pageHero}><h1>Partner Application Form</h1><p>For hotels, apartments, PMS/API providers, travel partners and other accommodation businesses.</p></div>

      <div style={styles.formGrid}>
        {fields.map(([field, label]) => (
          <label key={field}>
            {label}
            {field === "notes" ? (
              <textarea value={partner[field]} onChange={(e) => setPartner({ ...partner, [field]: e.target.value })} />
            ) : field === "partner_type" ? (
              <select value={partner[field]} onChange={(e) => setPartner({ ...partner, [field]: e.target.value })}>
                <option value="hotel">Hotel / accommodation owner</option>
                <option value="apartment">Apartment / short-let operator</option>
                <option value="pms">PMS provider</option>
                <option value="api">API / connectivity partner</option>
                <option value="travel">Travel / agency partner</option>
                <option value="other">Other partner</option>
              </select>
            ) : field === "integration_interest" ? (
              <select value={partner[field]} onChange={(e) => setPartner({ ...partner, [field]: e.target.value })}>
                <option value="pms-api">PMS / API connection</option>
                <option value="direct-listing">Direct listing</option>
                <option value="rates-availability">Rates and availability</option>
                <option value="booking-flow">Booking flow partnership</option>
              </select>
            ) : field === "pms_provider" ? (
              <select value={partner[field]} onChange={(e) => setPartner({ ...partner, [field]: e.target.value })}>
                <option value="oracle-ohip">Oracle OHIP</option>
                <option value="siteminder">SiteMinder</option>
                <option value="cloudbeds">Cloudbeds</option>
                <option value="mews">Mews</option>
                <option value="other">Other / not sure</option>
              </select>
            ) : (
              <input value={partner[field]} onChange={(e) => setPartner({ ...partner, [field]: e.target.value })} />
            )}
          </label>
        ))}
      </div>

      <button style={styles.primaryFullBtn} onClick={submitPartner}>Submit partner application</button>
      {partnerMessage && <div style={styles.successBox}>{partnerMessage}</div>}
    </main>
  );
}

function PartnerLoginPage({ setPage, partnerLogin, setPartnerLogin }) {
  return (
    <main style={styles.contentPage}>
      <button style={styles.backBtn} onClick={() => setPage("home")}>Back to homepage</button>
      <div style={styles.pageHero}><h1>Partner Login</h1><p>Approved partners can log in after review. New partners should apply first.</p></div>
      <div style={styles.loginBox}>
        <input placeholder="Partner ID" value={partnerLogin.partner_id} onChange={(e) => setPartnerLogin({ ...partnerLogin, partner_id: e.target.value })} />
        <input placeholder="Partner token" type="password" value={partnerLogin.token} onChange={(e) => setPartnerLogin({ ...partnerLogin, token: e.target.value })} />
        <button style={styles.primaryFullBtn}>Login securely</button>
        <button style={styles.outlineFullBtn} onClick={() => setPage("partnerApply")}>Open application form</button>
      </div>
    </main>
  );
}

function Footer({ setPage }) {
  return (
    <footer style={styles.footer}>
      <span>© 2026 MySpace Hotel. Stay with clarity.</span>
      <div>
        <button onClick={() => setPage("contact")}>Contact</button>
        <button onClick={() => setPage("privacy")}>Privacy</button>
        <button onClick={() => setPage("terms")}>Terms</button>
        <button onClick={() => setPage("partnerApply")}>Partner Application</button>
      </div>
    </footer>
  );
}

const styles = {
  page: { minHeight: "100vh", background: "#f4f7fb", color: "#07142f", fontFamily: "Arial, sans-serif" },
  header: { minHeight: 86, background: "#fff", padding: "0 48px", display: "flex", justifyContent: "space-between", alignItems: "center", boxShadow: "0 3px 20px rgba(15,23,42,.08)", position: "sticky", top: 0, zIndex: 10 },
  logoWrap: { display: "flex", alignItems: "center", gap: 12, border: 0, background: "transparent", cursor: "pointer", textAlign: "left" },
  logoIcon: { width: 46, height: 46, borderRadius: 16, display: "grid", placeItems: "center", background: "#fff3c4", color: "#b77900", fontSize: 24, fontWeight: 900 },
  logoText: { fontSize: 30, fontWeight: 900, letterSpacing: 1 },
  logoSub: { color: "#64748b", fontWeight: 700 },
  nav: { display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap", justifyContent: "flex-end" },
  goldBtn: { background: "#f6c744", border: 0, borderRadius: 14, padding: "12px 18px", fontWeight: 900 },
  blueOutlineBtn: { background: "#fff", border: "1px solid #b8cdf8", borderRadius: 14, padding: "12px 18px", color: "#1857df", fontWeight: 900 },
  hero: { minHeight: 560, backgroundImage: "linear-gradient(90deg,rgba(255,255,255,.98),rgba(255,255,255,.78),rgba(255,255,255,.25)),url('https://images.unsplash.com/photo-1507525428034-b723cf961d3e?auto=format&fit=crop&w=2000&q=80')", backgroundSize: "cover", backgroundPosition: "center" },
  heroContent: { maxWidth: 1480, margin: "0 auto", padding: "70px 52px 45px" },
  heroTag: { color: "#1857df", fontWeight: 900, marginBottom: 16 },
  heroTitle: { fontSize: 64, lineHeight: 1.02, margin: 0, letterSpacing: -2 },
  heroText: { fontSize: 23, color: "#334155", maxWidth: 850, fontWeight: 700 },
  heroBadges: { display: "flex", gap: 22, flexWrap: "wrap", marginTop: 24, color: "#1857df", fontWeight: 900 },
  searchPanel: { marginTop: 34, background: "#fff", borderRadius: 24, padding: 18, boxShadow: "0 26px 60px rgba(15,23,42,.18)" },
  searchGrid: { display: "grid", gridTemplateColumns: "1.2fr 1fr 1fr .85fr .85fr .65fr .65fr 1fr", gap: 12, alignItems: "end" },
  searchGrid: { display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(145px,1fr))", gap: 12, alignItems: "end" },
  searchGrid: { display: "grid", gridTemplateColumns: "1.2fr 1fr 1fr .85fr .85fr .65fr .65fr 1fr", gap: 12, alignItems: "end" },
  searchBtn: { minHeight: 68, border: 0, borderRadius: 18, background: "#1857df", color: "#fff", fontSize: 17, fontWeight: 900, cursor: "pointer" },
  trustStrip: { maxWidth: 1340, margin: "-30px auto 24px", background: "#fff", borderRadius: 22, padding: 22, display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 20, boxShadow: "0 16px 45px rgba(15,23,42,.08)" },
  infoPill: { display: "grid", gap: 6 },
  section: { maxWidth: 1420, margin: "0 auto", padding: "34px 52px" },
  sectionHead: { display: "flex", justifyContent: "space-between", alignItems: "center", gap: 18 },
  destGrid: { display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(230px,1fr))", gap: 16 },
  destCard: { minHeight: 170, border: 0, borderRadius: 22, padding: 22, background: "linear-gradient(135deg,#0f172a,#1d4ed8)", color: "#fff", textAlign: "left", cursor: "pointer", display: "grid", alignContent: "space-between" },
  valueGrid: { display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(250px,1fr))", gap: 18 },
  valueCard: { background: "#fff", borderRadius: 22, padding: 24, boxShadow: "0 15px 45px rgba(15,23,42,.08)" },
  partnerBanner: { maxWidth: 1340, margin: "20px auto 46px", background: "#07142f", color: "#fff", borderRadius: 26, padding: 28, display: "grid", gridTemplateColumns: "1fr 260px 180px", gap: 16, alignItems: "center" },
  resultsPage: { maxWidth: 1480, margin: "0 auto", padding: "30px 52px" },
  backBtn: { border: 0, background: "#e0ecff", color: "#1747b8", padding: "12px 16px", borderRadius: 14, fontWeight: 900, cursor: "pointer", marginBottom: 18 },
  resultsLayout: { display: "grid", gridTemplateColumns: "1fr 410px", gap: 24 },
  resultsTitle: { fontSize: 38, marginBottom: 8 },
  resultsSub: { color: "#64748b", fontWeight: 700 },
  notice: { background: "#f8fafc", borderRadius: 14, padding: 16, marginTop: 14 },
  hotelGrid: { display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(320px,1fr))", gap: 20 },
  hotelCard: { background: "#fff", borderRadius: 24, overflow: "hidden", boxShadow: "0 16px 40px rgba(15,23,42,.08)" },
  hotelImg: { width: "100%", height: 210, objectFit: "cover" },
  noImage: { height: 210, display: "grid", placeItems: "center", background: "#dbeafe", color: "#1747b8", fontWeight: 900 },
  hotelBody: { padding: 18 },
  hotelTop: { display: "flex", justifyContent: "space-between", color: "#64748b", marginBottom: 10 },
  rateNotice: { background: "#f3f7ff", borderRadius: 14, padding: 14, fontWeight: 800, margin: "14px 0" },
  hotelActions: { display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 },
  selectBtn: { background: "#f6c744", border: 0, borderRadius: 14, padding: 14, fontWeight: 900 },
  guideBtn: { background: "#fff", border: "1px solid #cbd5e1", borderRadius: 14, padding: 14, color: "#1747b8", fontWeight: 900 },
  reservePanel: { background: "#fff", borderRadius: 26, padding: 26, height: "fit-content", position: "sticky", top: 110, boxShadow: "0 18px 50px rgba(15,23,42,.12)" },
  muted: { color: "#64748b" },
  rateBox: { background: "#dcfce7", borderRadius: 18, padding: 18, display: "grid", gap: 6, margin: "18px 0" },
  successBox: { background: "#dcfce7", color: "#14532d", borderRadius: 14, padding: 14, fontWeight: 900, marginBottom: 12 },
  warningBox: { background: "#fff7ed", color: "#7c2d12", borderRadius: 14, padding: 14, fontWeight: 900, marginBottom: 12 },
  converterBox: { background: "#eff6ff", borderRadius: 18, padding: 16, display: "grid", gap: 8, marginBottom: 14 },
  input: { width: "100%", boxSizing: "border-box", padding: 13, borderRadius: 13, border: "1px solid #cbd5e1", marginBottom: 12, fontWeight: 700 },
  textarea: { width: "100%", boxSizing: "border-box", minHeight: 88, padding: 13, borderRadius: 13, border: "1px solid #cbd5e1", marginBottom: 12 },
  payBtn: { width: "100%", border: 0, background: "#10b981", color: "#052e1c", padding: 15, borderRadius: 14, fontWeight: 950, cursor: "pointer", marginBottom: 10 },
  outlineFullBtn: { width: "100%", border: "1px solid #cbd5e1", background: "#fff", color: "#1747b8", padding: 14, borderRadius: 14, fontWeight: 900, cursor: "pointer", marginBottom: 10 },
  contentPage: { maxWidth: 1320, margin: "0 auto", padding: 52 },
  pageHero: { background: "#fff", borderRadius: 24, padding: 30, marginBottom: 24, boxShadow: "0 15px 45px rgba(15,23,42,.08)" },
  guideGrid: { display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(320px,1fr))", gap: 18 },
  guideCard: { background: "#fff", borderRadius: 22, padding: 22, boxShadow: "0 15px 45px rgba(15,23,42,.08)" },
  guideLinks: { display: "grid", gap: 10, marginTop: 15 },
  infoStack: { display: "grid", gap: 18 },
  infoPanel: { background: "#fff", borderRadius: 22, padding: 24, boxShadow: "0 15px 45px rgba(15,23,42,.08)" },
  formGrid: { background: "#fff", borderRadius: 24, padding: 28, display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(280px,1fr))", gap: 12, boxShadow: "0 15px 45px rgba(15,23,42,.08)" },
  primaryFullBtn: { width: "100%", border: 0, background: "#1857df", color: "#fff", padding: 14, borderRadius: 14, fontWeight: 900, cursor: "pointer", marginTop: 16 },
  loginBox: { background: "#fff", maxWidth: 560, borderRadius: 24, padding: 28, boxShadow: "0 18px 50px rgba(15,23,42,.12)", display: "grid", gap: 12 },
  footer: { background: "#fff", borderTop: "1px solid #e2e8f0", padding: "22px 52px", display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 14 }
};