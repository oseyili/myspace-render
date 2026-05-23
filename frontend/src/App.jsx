import React, { useEffect, useMemo, useState } from "react";

const API =
  import.meta.env.VITE_API_BASE ||
  import.meta.env.VITE_API_BASE_URL ||
  "https://myspace-hotel-backend.onrender.com";

const CURRENCIES = ["GBP", "USD", "EUR", "NGN", "AED", "CAD", "AUD", "JPY", "ZAR", "CHF"];

const FX = {
  GBP: 1,
  USD: 1.27,
  EUR: 1.17,
  NGN: 1900,
  AED: 4.66,
  CAD: 1.72,
  AUD: 1.92,
  JPY: 197,
  ZAR: 23.2,
  CHF: 1.11
};

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

function tomorrowISO() {
  return new Date(Date.now() + 86400000).toISOString().slice(0, 10);
}

function money(value) {
  const n = Number(value || 0);
  return Number.isFinite(n) ? n.toFixed(2) : "0.00";
}

function nightsBetween(start, end) {
  const a = new Date(start);
  const b = new Date(end);
  const diff = Math.ceil((b - a) / 86400000);
  return diff > 0 ? diff : 1;
}

function convert(amount, from, to) {
  if (!amount || from === to) return Number(amount || 0);
  if (!FX[from] || !FX[to]) return Number(amount || 0);
  return (Number(amount) / FX[from]) * FX[to];
}

function mapSearch(query) {
  return `https://www.google.com/maps/search/${encodeURIComponent(query)}`;
}

function mapDirections(query) {
  return `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(query)}`;
}

export default function App() {
  const [page, setPage] = useState("home");
  const [status, setStatus] = useState(null);
  const [destinations, setDestinations] = useState([]);

  const [country, setCountry] = useState("");
  const [city, setCity] = useState("");
  const [checkin, setCheckin] = useState(todayISO());
  const [checkout, setCheckout] = useState(tomorrowISO());
  const [guests, setGuests] = useState(2);
  const [rooms, setRooms] = useState(1);

  const [hotels, setHotels] = useState([]);
  const [selectedHotel, setSelectedHotel] = useState(null);
  const [guideHotel, setGuideHotel] = useState(null);
  const [loading, setLoading] = useState(false);
  const [paying, setPaying] = useState(false);

  const [displayCurrency, setDisplayCurrency] = useState("GBP");

  const [reservation, setReservation] = useState({
    customer_name: "",
    customer_email: "",
    customer_phone: "",
    note: ""
  });

  const [partnerId, setPartnerId] = useState("oracle-ohip");
  const [partnerToken, setPartnerToken] = useState("");
  const [partnerJwt, setPartnerJwt] = useState("");
  const [partnerMessage, setPartnerMessage] = useState("");
  const [partnerDashboard, setPartnerDashboard] = useState(null);
  const [syncStatus, setSyncStatus] = useState(null);

  const selectedCountry = useMemo(
    () => destinations.find((item) => item.country === country),
    [destinations, country]
  );

  const nights = nightsBetween(checkin, checkout);
  const selectedRate = selectedHotel?.first_rate || null;
  const baseCurrency = selectedRate?.currency || "GBP";
  const nightly = Number(selectedRate?.amount || 0);
  const stayTotal = nightly * Number(rooms || 1) * nights;
  const convertedTotal = convert(stayTotal, baseCurrency, displayCurrency);

  async function loadStatus() {
    try {
      const response = await fetch(`${API}/status`, { cache: "no-store" });
      const data = await response.json();
      setStatus(data);
    } catch {}
  }

  async function loadDestinations() {
    try {
      const response = await fetch(`${API}/api/real-catalog/destinations`, { cache: "no-store" });
      const data = await response.json();
      setDestinations(data.countries || []);
    } catch {}
  }

  async function searchHotels(customCountry = country, customCity = city) {
    if (!customCountry || !customCity) {
      alert("Please choose a country and city first.");
      return;
    }

    setLoading(true);
    setHotels([]);
    setSelectedHotel(null);

    try {
      const params = new URLSearchParams({
        country: customCountry,
        city: customCity,
        checkin,
        checkout,
        guests: String(guests),
        rooms: String(rooms),
        limit: "100"
      });

      const response = await fetch(`${API}/api/hotels/search?${params.toString()}`, { cache: "no-store" });
      const data = await response.json();

      setHotels(data.hotels || []);
      setPage("results");
    } catch {
      alert("Hotels could not be loaded. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  async function reserveAndPay() {
    if (!selectedHotel) {
      alert("Select a hotel first.");
      return;
    }

    if (!reservation.customer_name || !reservation.customer_email || !reservation.customer_phone) {
      alert("Please enter your name, email and phone number.");
      return;
    }

    setPaying(true);

    const body = {
      ...reservation,
      hotel_id: selectedHotel.hotel_id,
      hotel_name: selectedHotel.hotel_name || selectedHotel.name,
      destination: `${city}, ${country}`,
      checkin,
      checkout,
      guests: Number(guests),
      rooms: Number(rooms),
      nights,
      rate_key: selectedRate?.rate_key || "",
      amount: stayTotal,
      currency: baseCurrency,
      converted_amount: convertedTotal,
      converted_currency: displayCurrency
    };

    try {
      const stripeRoutes = [
        "/api/create-checkout-session",
        "/create-checkout-session",
        "/api/stripe/create-checkout-session",
        "/api/payments/create-checkout-session"
      ];

      for (const route of stripeRoutes) {
        try {
          const response = await fetch(`${API}${route}`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(body)
          });

          const data = await response.json().catch(() => ({}));

          if (data.url && String(data.url).startsWith("http")) {
            window.location.href = data.url;
            return;
          }
        } catch {}
      }

      const fallback = await fetch(`${API}/reservation-request`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body)
      });

      const data = await fallback.json();

      alert(data.message || "Reservation request received. We will confirm the booking before payment.");
    } catch {
      alert("Payment or reservation could not be started. Please try again.");
    } finally {
      setPaying(false);
    }
  }

  async function loginPartner() {
    setPartnerMessage("");

    if (!partnerToken.trim()) {
      setPartnerMessage("Enter your partner token.");
      return;
    }

    try {
      const response = await fetch(`${API}/api/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ partner_id: partnerId, token: partnerToken })
      });

      const data = await response.json();

      if (!data.ok || !data.jwt) {
        throw new Error("login failed");
      }

      setPartnerJwt(data.jwt);
      setPartnerMessage("Partner connected successfully.");
      await loadPartnerDashboard(data.jwt);
      await loadSyncStatus(data.jwt);
    } catch {
      setPartnerMessage("Partner login failed. Check partner ID and token.");
    }
  }

  async function loadPartnerDashboard(jwt = partnerJwt) {
    if (!jwt) return;

    try {
      const response = await fetch(`${API}/api/admin/dashboard`, {
        headers: { Authorization: `Bearer ${jwt}` },
        cache: "no-store"
      });
      const data = await response.json();
      setPartnerDashboard(data);
    } catch {}
  }

  async function loadSyncStatus(jwt = partnerJwt) {
    if (!jwt) return;

    try {
      const response = await fetch(`${API}/api/sync/status`, {
        headers: { Authorization: `Bearer ${jwt}` },
        cache: "no-store"
      });
      const data = await response.json();
      setSyncStatus(data);
    } catch {}
  }

  async function runSync() {
    if (!partnerJwt) return;

    await fetch(`${API}/api/sync/run`, {
      method: "POST",
      headers: { Authorization: `Bearer ${partnerJwt}` }
    });

    await loadSyncStatus();
    await loadPartnerDashboard();
  }

  function choosePopular(nextCountry, nextCity) {
    setCountry(nextCountry);
    setCity(nextCity);
    searchHotels(nextCountry, nextCity);
  }

  function openGuide(hotel = null) {
    setGuideHotel(hotel || selectedHotel);
    setPage("guide");
  }

  useEffect(() => {
    loadStatus();
    loadDestinations();
    const timer = setInterval(loadStatus, 30000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    if (selectedCountry && !city) {
      setCity(selectedCountry.cities?.[0]?.city || "");
    }
  }, [selectedCountry, city]);

  return (
    <div style={styles.page}>
      <Header
        setPage={setPage}
        displayCurrency={displayCurrency}
        setDisplayCurrency={setDisplayCurrency}
      />

      {page === "home" && (
        <>
          <section style={styles.hero}>
            <div style={styles.heroInner}>
              <h1 style={styles.heroTitle}>Find your perfect stay</h1>
              <p style={styles.heroText}>Search 100,000+ hotels and apartments worldwide</p>

              <div style={styles.heroBadges}>
                <span>Best price guarantee</span>
                <span>Free cancellation options</span>
                <span>24/7 support</span>
              </div>

              <div style={styles.searchPanel}>
                <div style={styles.searchCell}>
                  <label>Country</label>
                  <select value={country} onChange={(e) => { setCountry(e.target.value); setCity(""); }}>
                    <option value="">Select country</option>
                    {destinations.map((item) => (
                      <option key={item.country} value={item.country}>{item.country}</option>
                    ))}
                  </select>
                </div>

                <div style={styles.searchCell}>
                  <label>Destination</label>
                  <select value={city} onChange={(e) => setCity(e.target.value)}>
                    <option value="">Select city</option>
                    {(selectedCountry?.cities || []).map((item) => (
                      <option key={item.city} value={item.city}>{item.city}</option>
                    ))}
                  </select>
                </div>

                <div style={styles.searchCell}>
                  <label>Check-in</label>
                  <input type="date" value={checkin} onChange={(e) => setCheckin(e.target.value)} />
                </div>

                <div style={styles.searchCell}>
                  <label>Check-out</label>
                  <input type="date" value={checkout} onChange={(e) => setCheckout(e.target.value)} />
                </div>

                <div style={styles.searchCell}>
                  <label>Guests & Rooms</label>
                  <div style={styles.twoInputs}>
                    <input type="number" min="1" value={guests} onChange={(e) => setGuests(e.target.value)} />
                    <input type="number" min="1" value={rooms} onChange={(e) => setRooms(e.target.value)} />
                  </div>
                </div>

                <button style={styles.searchButton} onClick={() => searchHotels()}>
                  {loading ? "Searching..." : "Search hotels"}
                </button>
              </div>
            </div>
          </section>

          <section style={styles.trustStrip}>
            <div><strong>Free cancellation</strong><span>On most rooms</span></div>
            <div><strong>Pay later options</strong><span>Book now, pay later</span></div>
            <div><strong>Secure booking</strong><span>Your data is safe</span></div>
          </section>

          <section style={styles.section}>
            <div style={styles.sectionHeader}>
              <h2>Popular destinations</h2>
              <button onClick={() => setPage("guide")}>View all destinations</button>
            </div>

            <div style={styles.destinationRow}>
              {[
                ["United Arab Emirates", "Dubai", "Dubai", "1,542 Hotels", "From £89", "https://images.unsplash.com/photo-1512453979798-5ea266f8880c?auto=format&fit=crop&w=900&q=80"],
                ["United Kingdom", "London", "London", "2,893 Hotels", "From £75", "https://images.unsplash.com/photo-1513635269975-59663e0ac1ad?auto=format&fit=crop&w=900&q=80"],
                ["France", "Paris", "Paris", "2,156 Hotels", "From £78", "https://images.unsplash.com/photo-1502602898657-3e91760cbb34?auto=format&fit=crop&w=900&q=80"],
                ["United States", "New York", "New York", "3,476 Hotels", "From £95", "https://images.unsplash.com/photo-1485871981521-5b1fd3805eee?auto=format&fit=crop&w=900&q=80"],
                ["Indonesia", "Bali", "Bali", "1,123 Hotels", "From £68", "https://images.unsplash.com/photo-1537996194471-e657df975ab4?auto=format&fit=crop&w=900&q=80"]
              ].map(([c, ct, title, count, price, img]) => (
                <button
                  key={`${c}-${ct}`}
                  style={{ ...styles.destinationCard, backgroundImage: `linear-gradient(180deg, rgba(3,7,18,.1), rgba(3,7,18,.75)), url(${img})` }}
                  onClick={() => choosePopular(c, ct)}
                >
                  <div>
                    <h3>{title}</h3>
                    <p>{c}</p>
                  </div>
                  <div style={styles.destinationMeta}>
                    <span>{count}</span>
                    <strong>{price}</strong>
                  </div>
                </button>
              ))}
            </div>
          </section>

          <section style={styles.partnerStrip}>
            <div>
              <strong>Are you a hotel or partner?</strong>
              <span>Access your dashboard, sync tools and onboarding.</span>
            </div>
            <button onClick={() => setPage("partner")}>Partner Login</button>
            <button onClick={() => setPage("partner")}>Hotel Extranet</button>
            <button onClick={() => setPage("partner")}>PMS Sync Status</button>
            <button onClick={() => setPage("partner")}>Hotel Onboarding</button>
          </section>

          <Footer setPage={setPage} status={status} />
        </>
      )}

      {page === "results" && (
        <main style={styles.main}>
          <button style={styles.backButton} onClick={() => setPage("home")}>Back to homepage</button>

          <div style={styles.resultsLayout}>
            <section>
              <h2>Available stays in {city}, {country}</h2>
              <p style={styles.muted}>Select a hotel to continue to reservation and payment.</p>

              <div style={styles.hotelGrid}>
                {hotels.map((hotel) => {
                  const rate = hotel.first_rate;
                  return (
                    <div key={hotel.hotel_id} style={styles.hotelCard}>
                      {hotel.image_url ? (
                        <img src={hotel.image_url} style={styles.hotelImage} />
                      ) : (
                        <div style={styles.noImage}>MYSPACE HOTEL</div>
                      )}

                      <div style={styles.hotelBody}>
                        <div style={styles.badges}>
                          <span>Verified stay</span>
                          <span>{rate ? "Live price" : "Confirm price"}</span>
                        </div>

                        <h3>{hotel.hotel_name || hotel.name}</h3>
                        <p>{hotel.address || hotel.area || city}, {country}</p>

                        <div style={styles.priceBox}>
                          {rate ? (
                            <>
                              <span>From</span>
                              <strong>{rate.currency || "GBP"} {money(rate.amount)}</strong>
                              <small>per room / night</small>
                            </>
                          ) : (
                            <strong>Price confirmation required</strong>
                          )}
                        </div>

                        <div style={styles.hotelActions}>
                          <button onClick={() => setSelectedHotel(hotel)} style={styles.selectButton}>Select Hotel</button>
                          <button onClick={() => openGuide(hotel)} style={styles.guideButton}>Guide / Map</button>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </section>

            <aside style={styles.reservePanel}>
              <h2>Reserve / Pay</h2>

              {selectedHotel ? (
                <>
                  <h3>{selectedHotel.hotel_name || selectedHotel.name}</h3>
                  <p style={styles.muted}>{selectedHotel.address || selectedHotel.area || city}, {country}</p>

                  <div style={styles.totalBox}>
                    <span>Stay total</span>
                    <strong>{baseCurrency} {money(stayTotal)}</strong>
                    <small>{nights} night{nights > 1 ? "s" : ""} | {guests} guests | {rooms} room{rooms > 1 ? "s" : ""}</small>
                  </div>

                  <div style={styles.converterBox}>
                    <label>Currency converter</label>
                    <select value={displayCurrency} onChange={(e) => setDisplayCurrency(e.target.value)} style={styles.input}>
                      {CURRENCIES.map((currency) => (
                        <option key={currency} value={currency}>{currency}</option>
                      ))}
                    </select>
                    <strong>{displayCurrency} {money(convertedTotal)}</strong>
                    <small>Estimated conversion for guidance. Final payment currency may depend on hotel/payment provider.</small>
                  </div>

                  <input style={styles.input} placeholder="Full name" value={reservation.customer_name} onChange={(e) => setReservation({ ...reservation, customer_name: e.target.value })} />
                  <input style={styles.input} placeholder="Email address" value={reservation.customer_email} onChange={(e) => setReservation({ ...reservation, customer_email: e.target.value })} />
                  <input style={styles.input} placeholder="Phone number" value={reservation.customer_phone} onChange={(e) => setReservation({ ...reservation, customer_phone: e.target.value })} />
                  <textarea style={styles.textarea} placeholder="Special request" value={reservation.note} onChange={(e) => setReservation({ ...reservation, note: e.target.value })} />

                  <button style={styles.payButton} onClick={reserveAndPay}>
                    {paying ? "Starting secure checkout..." : selectedRate ? "Reserve / Pay Securely" : "Request Price Confirmation"}
                  </button>
                  <button style={styles.secondaryButton} onClick={() => openGuide(selectedHotel)}>Open Destination Guide</button>
                </>
              ) : (
                <div style={styles.notice}>Select a hotel to continue.</div>
              )}
            </aside>
          </div>
        </main>
      )}

      {page === "guide" && (
        <DestinationGuide
          setPage={setPage}
          place={[
            guideHotel?.hotel_name || guideHotel?.name,
            guideHotel?.address || guideHotel?.area,
            city,
            country
          ].filter(Boolean).join(", ") || "your destination"}
        />
      )}

      {page === "faq" && <InfoPage setPage={setPage} title="Frequently Asked Questions" sections={faqSections} />}
      {page === "terms" && <InfoPage setPage={setPage} title="Terms & Conditions" sections={termsSections} />}
      {page === "privacy" && <InfoPage setPage={setPage} title="Privacy Policy" sections={privacySections} />}
      {page === "contact" && <InfoPage setPage={setPage} title="Contact MySpace Hotel" sections={contactSections} />}
      {page === "developers" && <InfoPage setPage={setPage} title="Developers" sections={developerSections} />}
      {page === "api" && <InfoPage setPage={setPage} title="API" sections={apiSections} />}
      {page === "status" && <StatusPage setPage={setPage} status={status} />}

      {page === "partner" && (
        <PartnerPage
          setPage={setPage}
          partnerId={partnerId}
          setPartnerId={setPartnerId}
          partnerToken={partnerToken}
          setPartnerToken={setPartnerToken}
          partnerMessage={partnerMessage}
          partnerJwt={partnerJwt}
          loginPartner={loginPartner}
          partnerDashboard={partnerDashboard}
          syncStatus={syncStatus}
          runSync={runSync}
          loadSyncStatus={loadSyncStatus}
        />
      )}
    </div>
  );
}

function Header({ setPage, displayCurrency, setDisplayCurrency }) {
  return (
    <header style={styles.header}>
      <button style={styles.logoButton} onClick={() => setPage("home")}>
        <div style={styles.logoIcon}>✦</div>
        <div>
          <div style={styles.logo}>MYSPACE HOTEL</div>
          <div style={styles.logoSub}>Stay with clarity</div>
        </div>
      </button>

      <nav style={styles.nav}>
        <button onClick={() => setPage("home")}>Stays</button>
        <button onClick={() => setPage("guide")}>Destinations</button>
        <button onClick={() => setPage("faq")}>Offers</button>
        <button onClick={() => setPage("contact")}>Help</button>
        <select value={displayCurrency} onChange={(e) => setDisplayCurrency(e.target.value)} style={styles.currencySelect}>
          {CURRENCIES.map((currency) => (
            <option key={currency} value={currency}>{currency}</option>
          ))}
        </select>
        <button style={styles.loginButton} onClick={() => setPage("partner")}>Hotel / Partner Login</button>
      </nav>
    </header>
  );
}

function DestinationGuide({ setPage, place }) {
  const guide = [
    {
      title: "Emergency contacts",
      text: "Find police stations, hospitals, pharmacies and emergency assistance near your destination.",
      links: [
        ["Police nearby", mapSearch(`police station near ${place}`)],
        ["Hospital nearby", mapSearch(`hospital near ${place}`)],
        ["Pharmacy nearby", mapSearch(`pharmacy near ${place}`)]
      ]
    },
    {
      title: "Airport and transfers",
      text: "Plan airport transfers, taxis, trains, ride-share pickup points and routes before arrival.",
      links: [
        ["Nearest airport", mapSearch(`airport near ${place}`)],
        ["Taxi nearby", mapSearch(`taxi near ${place}`)],
        ["Directions", mapDirections(place)]
      ]
    },
    {
      title: "Restaurants and food",
      text: "Discover restaurants, cafes, supermarkets, late-night food and local favourites around the hotel.",
      links: [
        ["Restaurants", mapSearch(`restaurants near ${place}`)],
        ["Cafes", mapSearch(`cafes near ${place}`)],
        ["Supermarkets", mapSearch(`supermarket near ${place}`)]
      ]
    },
    {
      title: "Tourism and attractions",
      text: "Explore attractions, museums, shopping areas, sightseeing tours, zoos and family activities.",
      links: [
        ["Things to do", mapSearch(`things to do near ${place}`)],
        ["Museums", mapSearch(`museums near ${place}`)],
        ["Tour bus", mapSearch(`tour bus near ${place}`)]
      ]
    },
    {
      title: "Transport and navigation",
      text: "Check nearby train stations, metro routes, bus stops, car hire and walking directions.",
      links: [
        ["Train station", mapSearch(`train station near ${place}`)],
        ["Bus station", mapSearch(`bus station near ${place}`)],
        ["Car rental", mapSearch(`car rental near ${place}`)]
      ]
    },
    {
      title: "Map and directions",
      text: "Open the property area on Google Maps and plan your route before travelling.",
      links: [
        ["Open Map", mapSearch(place)],
        ["Get Directions", mapDirections(place)],
        ["Explore Nearby", mapSearch(`restaurants hospitals airport attractions near ${place}`)]
      ]
    }
  ];

  return (
    <main style={styles.contentPage}>
      <button style={styles.backButton} onClick={() => setPage("home")}>Back to homepage</button>
      <div style={styles.pageHero}>
        <h1>Destination Guide</h1>
        <p>{place}</p>
      </div>

      <div style={styles.guideGrid}>
        {guide.map((section) => (
          <div key={section.title} style={styles.guideCard}>
            <h2>{section.title}</h2>
            <p>{section.text}</p>
            <div style={styles.guideLinks}>
              {section.links.map(([label, url]) => (
                <a key={label} href={url} target="_blank" rel="noreferrer">{label}</a>
              ))}
            </div>
          </div>
        ))}
      </div>
    </main>
  );
}

function InfoPage({ setPage, title, sections }) {
  return (
    <main style={styles.contentPage}>
      <button style={styles.backButton} onClick={() => setPage("home")}>Back to homepage</button>
      <div style={styles.pageHero}>
        <h1>{title}</h1>
      </div>
      <div style={styles.infoStack}>
        {sections.map(([heading, text]) => (
          <div key={heading} style={styles.infoPanel}>
            <h2>{heading}</h2>
            <p>{text}</p>
          </div>
        ))}
      </div>
    </main>
  );
}

function StatusPage({ setPage, status }) {
  return (
    <main style={styles.contentPage}>
      <button style={styles.backButton} onClick={() => setPage("home")}>Back to homepage</button>
      <div style={styles.pageHero}>
        <h1>System Status</h1>
        <p>Public service health for MySpace Hotel customer booking.</p>
      </div>
      <div style={styles.metricGrid}>
        <Metric label="API" value={status?.api || status?.status || "checking"} />
        <Metric label="Hotels" value={status?.hotels_loaded || "-"} />
        <Metric label="Countries" value={status?.countries || "-"} />
        <Metric label="Cities" value={status?.cities || "-"} />
      </div>
    </main>
  );
}

function PartnerPage(props) {
  const {
    setPage,
    partnerId,
    setPartnerId,
    partnerToken,
    setPartnerToken,
    partnerMessage,
    partnerJwt,
    loginPartner,
    partnerDashboard,
    syncStatus,
    runSync,
    loadSyncStatus
  } = props;

  return (
    <main style={styles.contentPage}>
      <button style={styles.backButton} onClick={() => setPage("home")}>Back to homepage</button>

      <div style={styles.pageHero}>
        <h1>Hotel & Partner Access</h1>
        <p>Secure tools for hotel extranet, PMS sync, partner API and onboarding.</p>
      </div>

      {!partnerJwt && (
        <section style={styles.loginPanel}>
          <h2>Secure partner login</h2>
          <p>Customer visitors cannot see enterprise data. These tools open after authenticated login.</p>
          <input style={styles.input} value={partnerId} onChange={(e) => setPartnerId(e.target.value)} placeholder="Partner ID" />
          <input style={styles.input} value={partnerToken} onChange={(e) => setPartnerToken(e.target.value)} placeholder="Partner token" type="password" />
          {partnerMessage && <div style={styles.messageBox}>{partnerMessage}</div>}
          <button style={styles.primaryButton} onClick={loginPartner}>Login securely</button>
        </section>
      )}

      {partnerJwt && (
        <section style={styles.partnerGrid}>
          <div style={styles.partnerCard}>
            <h2>Partner Dashboard</h2>
            <MetricGrid data={{
              Hotels: partnerDashboard?.hotels_loaded,
              Reservations: partnerDashboard?.reservations,
              Webhooks: partnerDashboard?.webhook_events,
              Mappings: partnerDashboard?.mappings,
              Failures: partnerDashboard?.sync_failures || 0
            }} />
          </div>

          <div style={styles.partnerCard}>
            <h2>PMS Sync Status</h2>
            <MetricGrid data={{
              Partners: syncStatus?.partners?.length || 0,
              Inventory: syncStatus?.inventory_syncs || 0,
              Rates: syncStatus?.rate_syncs || 0,
              Reservations: syncStatus?.reservation_syncs || 0,
              Failures: syncStatus?.failures || 0
            }} />
            <button style={styles.primaryButton} onClick={runSync}>Run sync now</button>
            <button style={styles.secondaryButton} onClick={() => loadSyncStatus()}>Refresh</button>
          </div>

          <div style={styles.partnerCard}>
            <h2>Hotel Extranet</h2>
            <p>Manage property information, rooms, inventory, reservations and onboarding steps.</p>
          </div>

          <div style={styles.partnerCard}>
            <h2>Hotel Onboarding</h2>
            <p>Connect hotels, PMS credentials, mappings, live inventory checks and production activation.</p>
          </div>
        </section>
      )}
    </main>
  );
}

function Metric({ label, value }) {
  return (
    <div style={styles.metricBox}>
      <span>{label}</span>
      <strong>{value ?? "-"}</strong>
    </div>
  );
}

function MetricGrid({ data }) {
  return (
    <div style={styles.metricGrid}>
      {Object.entries(data || {}).map(([key, value]) => (
        <Metric key={key} label={key} value={value} />
      ))}
    </div>
  );
}

function Footer({ setPage, status }) {
  return (
    <footer style={styles.footer}>
      <span>© 2026 MySpace Hotel. All rights reserved.</span>
      <div style={styles.footerLinks}>
        <button onClick={() => setPage("contact")}>About Us</button>
        <button onClick={() => setPage("contact")}>Contact</button>
        <button onClick={() => setPage("privacy")}>Privacy Policy</button>
        <button onClick={() => setPage("terms")}>Terms & Conditions</button>
        <button onClick={() => setPage("developers")}>Developers</button>
        <button onClick={() => setPage("api")}>API</button>
        <button onClick={() => setPage("status")}>Status</button>
        <span>{status?.api === "online" || status?.ok ? "Online" : "Checking"}</span>
      </div>
    </footer>
  );
}

const faqSections = [
  ["How do I book?", "Search by country and destination, choose a stay, review the total and continue with the Reserve / Pay button."],
  ["Can I cancel?", "Cancellation depends on the hotel and room rate selected. Flexible rates may allow cancellation before the deadline."],
  ["Why do some hotels need confirmation?", "Some properties require final price and availability confirmation before payment."],
  ["Is payment secure?", "Payment opens through secure checkout where enabled. Do not share card details in chat or email."]
];

const termsSections = [
  ["Availability", "All stays depend on live availability and hotel conditions at the time of reservation."],
  ["Pricing", "Prices can change until the hotel or payment provider confirms the booking."],
  ["Guest responsibility", "Guests must provide accurate details and follow hotel rules, local laws and identification requirements."],
  ["Payment", "Payments are processed through secure providers where enabled. Some reservations may be confirmed before payment."]
];

const privacySections = [
  ["Customer data", "We use customer information to support reservations, arrival support and booking communication."],
  ["Payment information", "Card details are handled by secure payment providers and are not collected directly in the public portal."],
  ["Partner data", "Hotel and partner tools are protected behind authenticated login."],
  ["Support", "Contact reservations@myspace-hotel.com for privacy or booking questions."]
];

const contactSections = [
  ["Reservations", "Email reservations@myspace-hotel.com for booking support and reservation questions."],
  ["Arrival support", "Use the Destination Guide for maps, directions, hospitals, airports and local travel guidance."],
  ["Hotels and partners", "Use Hotel / Partner Login for onboarding, PMS sync and extranet access."],
  ["Emergency", "For urgent safety issues, contact local emergency services first."]
];

const developerSections = [
  ["Partner API", "Authenticated partners can access sync monitoring, mappings, webhook ingestion and operational dashboards."],
  ["PMS integrations", "Supported workflows include inventory sync, rate sync, reservation sync and webhook retries."],
  ["Security", "Use secure tokens, signed webhooks, audit logs and approved partner credentials."],
  ["Access", "Developer tools are available after Hotel / Partner Login."]
];

const apiSections = [
  ["Authentication", "Partners authenticate with partner ID and token."],
  ["Hotel search", "Customer search uses live destination and hotel endpoints."],
  ["Payments", "Reserve / Pay attempts secure Stripe checkout and falls back to reservation request if checkout is unavailable."],
  ["Webhooks", "PMS and channel-manager events can be processed through partner webhook routes."]
];

const styles = {
  page: { minHeight: "100vh", background: "#f6f8fc", color: "#07142f", fontFamily: "Inter, Arial, sans-serif" },
  header: { height: 88, background: "#fff", display: "flex", alignItems: "center", justifyContent: "space-between", padding: "0 52px", boxShadow: "0 2px 18px rgba(15,23,42,.08)", position: "sticky", top: 0, zIndex: 10 },
  logoButton: { display: "flex", alignItems: "center", gap: 12, border: 0, background: "transparent", cursor: "pointer", textAlign: "left" },
  logoIcon: { width: 44, height: 44, borderRadius: 14, display: "grid", placeItems: "center", background: "#fff3c4", color: "#b77900", fontSize: 24, fontWeight: 900 },
  logo: { fontSize: 28, fontWeight: 900, letterSpacing: 1 },
  logoSub: { fontSize: 13, color: "#64748b", fontWeight: 700 },
  nav: { display: "flex", alignItems: "center", gap: 24 },
  currencySelect: { border: "1px solid #cbd5e1", borderRadius: 12, padding: "10px 12px", fontWeight: 800 },
  loginButton: { border: "1px solid #b8cdf8", background: "#fff", color: "#1857df", borderRadius: 14, padding: "12px 18px", fontWeight: 900, cursor: "pointer" },
  hero: { minHeight: 500, backgroundImage: "linear-gradient(90deg, rgba(255,255,255,.98), rgba(255,255,255,.74), rgba(255,255,255,.15)), url('https://images.unsplash.com/photo-1507525428034-b723cf961d3e?auto=format&fit=crop&w=2000&q=80')", backgroundSize: "cover", backgroundPosition: "center" },
  heroInner: { maxWidth: 1420, margin: "0 auto", padding: "70px 52px 40px" },
  heroTitle: { fontSize: 58, lineHeight: 1.02, margin: 0, letterSpacing: -2 },
  heroText: { fontSize: 22, color: "#334155", marginTop: 14, fontWeight: 700 },
  heroBadges: { display: "flex", flexWrap: "wrap", gap: 28, marginTop: 24, color: "#1857df", fontWeight: 900 },
  searchPanel: { marginTop: 34, background: "#fff", borderRadius: 24, display: "grid", gridTemplateColumns: "1.15fr 1.15fr .9fr .9fr .9fr 1fr", boxShadow: "0 26px 60px rgba(15,23,42,.18)", overflow: "hidden" },
  searchCell: { padding: 18, borderRight: "1px solid #e2e8f0", display: "flex", flexDirection: "column", gap: 8 },
  twoInputs: { display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 },
  searchButton: { border: 0, background: "#1857df", color: "#fff", fontSize: 16, fontWeight: 900, cursor: "pointer" },
  trustStrip: { maxWidth: 1320, margin: "-22px auto 24px", background: "#fff", borderRadius: 20, padding: 22, display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 20, boxShadow: "0 15px 45px rgba(15,23,42,.08)", position: "relative", zIndex: 2 },
  section: { maxWidth: 1420, margin: "0 auto", padding: "28px 52px" },
  sectionHeader: { display: "flex", alignItems: "center", justifyContent: "space-between" },
  destinationRow: { display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: 16 },
  destinationCard: { height: 220, border: 0, borderRadius: 18, backgroundSize: "cover", backgroundPosition: "center", color: "#fff", textAlign: "left", padding: 22, display: "flex", flexDirection: "column", justifyContent: "space-between", cursor: "pointer", boxShadow: "0 14px 35px rgba(15,23,42,.18)" },
  destinationMeta: { display: "flex", justifyContent: "space-between", alignItems: "center" },
  partnerStrip: { maxWidth: 1320, margin: "30px auto 48px", background: "#f8fbff", borderRadius: 20, padding: 18, display: "grid", gridTemplateColumns: "1.5fr repeat(4, 1fr)", gap: 12, boxShadow: "0 15px 45px rgba(15,23,42,.08)" },
  main: { maxWidth: 1420, margin: "0 auto", padding: "28px 52px" },
  backButton: { border: 0, background: "#e0ecff", color: "#1747b8", padding: "12px 16px", borderRadius: 14, fontWeight: 900, cursor: "pointer", marginBottom: 18 },
  resultsLayout: { display: "grid", gridTemplateColumns: "1fr 390px", gap: 24 },
  muted: { color: "#64748b", fontWeight: 700 },
  hotelGrid: { display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(295px,1fr))", gap: 18 },
  hotelCard: { background: "#fff", borderRadius: 22, overflow: "hidden", boxShadow: "0 16px 40px rgba(15,23,42,.08)" },
  hotelImage: { width: "100%", height: 190, objectFit: "cover" },
  noImage: { height: 190, display: "grid", placeItems: "center", background: "#dbeafe", color: "#1747b8", fontWeight: 900 },
  hotelBody: { padding: 18 },
  badges: { display: "flex", justifyContent: "space-between", gap: 8 },
  priceBox: { background: "#f8fafc", borderRadius: 14, padding: 14, display: "flex", flexDirection: "column", gap: 4, marginBottom: 12 },
  hotelActions: { display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 },
  selectButton: { border: 0, borderRadius: 14, background: "#f6c744", padding: 14, fontWeight: 900, cursor: "pointer" },
  guideButton: { border: "1px solid #cbd5e1", borderRadius: 14, background: "#fff", color: "#1747b8", padding: 14, fontWeight: 900, cursor: "pointer" },
  reservePanel: { position: "sticky", top: 110, alignSelf: "start", background: "#fff", borderRadius: 24, padding: 24, boxShadow: "0 18px 50px rgba(15,23,42,.12)" },
  totalBox: { background: "#dcfce7", borderRadius: 18, padding: 18, display: "flex", flexDirection: "column", gap: 6, margin: "18px 0" },
  converterBox: { background: "#eff6ff", borderRadius: 18, padding: 16, display: "flex", flexDirection: "column", gap: 6, marginBottom: 14 },
  input: { width: "100%", padding: 13, borderRadius: 13, border: "1px solid #cbd5e1", marginBottom: 12, fontWeight: 700 },
  textarea: { width: "100%", minHeight: 88, padding: 13, borderRadius: 13, border: "1px solid #cbd5e1", marginBottom: 12 },
  payButton: { width: "100%", border: 0, background: "#10b981", color: "#052e1c", padding: 15, borderRadius: 14, fontWeight: 950, cursor: "pointer", marginBottom: 10 },
  secondaryButton: { width: "100%", border: "1px solid #cbd5e1", background: "#fff", color: "#1747b8", padding: 14, borderRadius: 14, fontWeight: 900, cursor: "pointer" },
  notice: { background: "#f8fafc", borderRadius: 14, padding: 14 },
  contentPage: { maxWidth: 1320, margin: "0 auto", padding: 52 },
  pageHero: { background: "#fff", borderRadius: 24, padding: 30, marginBottom: 24, boxShadow: "0 15px 45px rgba(15,23,42,.08)" },
  guideGrid: { display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(320px,1fr))", gap: 18 },
  guideCard: { background: "#fff", borderRadius: 22, padding: 22, boxShadow: "0 15px 45px rgba(15,23,42,.08)" },
  guideLinks: { display: "grid", gap: 10, marginTop: 15 },
  infoStack: { display: "grid", gap: 18 },
  infoPanel: { background: "#fff", borderRadius: 22, padding: 24, boxShadow: "0 15px 45px rgba(15,23,42,.08)" },
  metricGrid: { display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(180px,1fr))", gap: 12 },
  metricBox: { background: "#f1f5f9", borderRadius: 14, padding: 14, display: "flex", flexDirection: "column", gap: 6 },
  loginPanel: { background: "#fff", maxWidth: 560, borderRadius: 24, padding: 28, boxShadow: "0 18px 50px rgba(15,23,42,.12)" },
  messageBox: { background: "#eff6ff", color: "#1747b8", borderRadius: 12, padding: 12, marginBottom: 12, fontWeight: 900 },
  primaryButton: { width: "100%", border: 0, background: "#1857df", color: "#fff", padding: 14, borderRadius: 14, fontWeight: 900, cursor: "pointer", marginBottom: 10 },
  partnerGrid: { display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(330px,1fr))", gap: 18 },
  partnerCard: { background: "#fff", borderRadius: 24, padding: 22, boxShadow: "0 15px 45px rgba(15,23,42,.08)" },
  footer: { background: "#fff", borderTop: "1px solid #e2e8f0", padding: "22px 52px", display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 14 },
  footerLinks: { display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }
};
