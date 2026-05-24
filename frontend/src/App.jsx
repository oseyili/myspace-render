import React, { useEffect, useMemo, useState } from "react";

const API_BASE =
  import.meta.env.VITE_API_BASE ||
  "https://myspace-hotel-backend.onrender.com";

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

export default function App() {
  const [page, setPage] = useState("home");
  const [destinations, setDestinations] = useState([]);
  const [country, setCountry] = useState("");
  const [city, setCity] = useState("");
  const [checkin, setCheckin] = useState(todayISO());
  const [checkout, setCheckout] = useState(tomorrowISO());
  const [guests, setGuests] = useState(2);
  const [rooms, setRooms] = useState(1);
  const [stayType, setStayType] = useState("hotel");
  const [hotels, setHotels] = useState([]);
  const [loading, setLoading] = useState(false);
  const [selectedHotel, setSelectedHotel] = useState(null);
  const [liveRate, setLiveRate] = useState(null);
  const [liveLoading, setLiveLoading] = useState(false);
  const [notice, setNotice] = useState("");
  const [partnerSent, setPartnerSent] = useState(false);
  const [loginNotice, setLoginNotice] = useState("");

  useEffect(() => {
    loadDestinations();
  }, []);

  async function loadDestinations() {
    try {
      const res = await fetch(`${API_BASE}/api/destinations`);
      const data = await res.json();

      const countries = data?.countries || [];

      const cleanCountries = countries
        .filter((x) => clean(x.country))
        .map((x) => ({
          country: clean(x.country),
          cities: Array.from(
            new Set((x.cities || []).map((c) => clean(c)).filter(Boolean))
          ).sort((a, b) => a.localeCompare(b))
        }))
        .filter((x) => x.cities.length > 0)
        .sort((a, b) => a.country.localeCompare(b.country));

      setDestinations(cleanCountries);
    } catch (e) {
      console.log(e);
      setNotice("Destinations could not be loaded. Please refresh the page.");
    }
  }

  const cities = useMemo(() => {
    return destinations.find((x) => x.country === country)?.cities || [];
  }, [country, destinations]);

  async function searchHotels() {
    setNotice("");

    if (!country || !city) {
      setNotice("Please select a country and city first.");
      return;
    }

    setLoading(true);
    setHotels([]);
    setSelectedHotel(null);
    setLiveRate(null);

    try {
      const params = new URLSearchParams({
        country,
        city,
        stay_type: stayType,
        limit: "80"
      });

      const res = await fetch(`${API_BASE}/api/hotels/search?${params}`);
      const data = await res.json();

      const found = data?.hotels || [];
      setHotels(found);

      if (!found.length) {
        setNotice("No stays found for this search. Try another city or date.");
      }
    } catch (e) {
      console.log(e);
      setNotice("Hotel search failed. Please try again.");
    }

    setLoading(false);
  }

  async function selectHotel(hotel) {
    setSelectedHotel(hotel);
    setLiveRate(null);
    setLiveLoading(true);

    try {
      const params = new URLSearchParams({
        hotel_id: hotel.hotelbeds_code || hotel.hotel_id || hotel.id || hotel.code,
        checkin,
        checkout,
        guests: String(guests),
        rooms: String(rooms)
      });

      const res = await fetch(`${API_BASE}/api/hotels/live-rate?${params}`);
      const data = await res.json();

      setLiveRate(data);
    } catch (e) {
      console.log(e);
      setLiveRate({
        live_available: false,
        customer_message: "Live pricing could not be loaded for this stay."
      });
    }

    setLiveLoading(false);
  }

  function Header() {
    return (
      <div style={s.header}>
        <div onClick={() => setPage("home")} style={s.brand}>
          <div style={s.logo}>MYSPACE HOTEL</div>
          <div style={s.tagline}>Live stays. Clear prices. Better travel support.</div>
        </div>

        <div style={s.nav}>
          <button style={s.navBtn} onClick={() => setPage("home")}>Stays</button>
          <button style={s.navBtn} onClick={() => setPage("destinations")}>Destinations</button>
          <button style={s.navBtn} onClick={() => setPage("guide")}>Guide</button>
          <button style={s.navBtn} onClick={() => setPage("offers")}>Offers</button>
          <button style={s.navBtn} onClick={() => setPage("help")}>Help</button>
          <button style={s.goldBtn} onClick={() => setPage("partners")}>Partner Application Form</button>
          <button style={s.darkBtn} onClick={() => setPage("login")}>Partner Login</button>
        </div>
      </div>
    );
  }

  function SearchBox() {
    return (
      <div style={s.searchBox}>
        <div>
          <label style={s.label}>Stay type</label>
          <select value={stayType} onChange={(e) => setStayType(e.target.value)} style={s.input}>
            <option value="hotel">Hotels only</option>
            <option value="apartment">Apartments only</option>
            <option value="villa">Villas only</option>
          </select>
        </div>

        <div>
          <label style={s.label}>Country</label>
          <select
            value={country}
            onChange={(e) => {
              setCountry(e.target.value);
              setCity("");
              setHotels([]);
              setSelectedHotel(null);
              setLiveRate(null);
            }}
            style={s.input}
          >
            <option value="">Select country</option>
            {destinations.map((x) => (
              <option key={x.country} value={x.country}>
                {x.country}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label style={s.label}>City</label>
          <select
            value={city}
            onChange={(e) => {
              setCity(e.target.value);
              setHotels([]);
              setSelectedHotel(null);
              setLiveRate(null);
            }}
            style={s.input}
            disabled={!country}
          >
            <option value="">{country ? "Select city" : "Select country first"}</option>
            {cities.map((c) => (
              <option key={c} value={c}>{c}</option>
            ))}
          </select>
        </div>

        <div>
          <label style={s.label}>Check-in</label>
          <input type="date" value={checkin} onChange={(e) => setCheckin(e.target.value)} style={s.input} />
        </div>

        <div>
          <label style={s.label}>Check-out</label>
          <input type="date" value={checkout} onChange={(e) => setCheckout(e.target.value)} style={s.input} />
        </div>

        <div>
          <label style={s.label}>Guests</label>
          <input type="number" min="1" value={guests} onChange={(e) => setGuests(e.target.value)} style={s.input} />
        </div>

        <div>
          <label style={s.label}>Rooms</label>
          <input type="number" min="1" value={rooms} onChange={(e) => setRooms(e.target.value)} style={s.input} />
        </div>

        <button onClick={searchHotels} style={s.searchBtn}>
          {loading ? "Searching..." : "Search stays"}
        </button>
      </div>
    );
  }

  function ReservePanel() {
    const rate = liveRate?.rate || liveRate?.first_rate || selectedHotel?.first_rate || null;
    const currency = rate?.currency || liveRate?.currency || selectedHotel?.currency || "";
    const amount = rate?.amount || liveRate?.amount || selectedHotel?.price || selectedHotel?.total;

    return (
      <div style={s.reserve}>
        <div style={s.reserveTitle}>Reserve / Pay</div>

        {!selectedHotel ? (
          <div style={s.reserveEmpty}>
            Select a stay to load the latest available price.
          </div>
        ) : (
          <>
            <div style={s.reserveHotel}>{selectedHotel.name}</div>
            <div style={s.reserveAddress}>
              {selectedHotel.address}{selectedHotel.city ? `, ${selectedHotel.city}` : ""}{selectedHotel.country ? `, ${selectedHotel.country}` : ""}
            </div>

            <div style={s.tripBox}>
              <div><b>Check-in:</b> {checkin}</div>
              <div><b>Check-out:</b> {checkout}</div>
              <div><b>Guests:</b> {guests}</div>
              <div><b>Rooms:</b> {rooms}</div>
            </div>

            <div style={s.priceBox}>
              {liveLoading ? (
                <b>Loading live price...</b>
              ) : liveRate?.live_available || rate || amount ? (
                <>
                  <div style={s.priceLabel}>Current stay price</div>
                  <div style={s.price}>{currency} {money(amount)}</div>
                  <div style={s.priceNote}>
                    {liveRate?.customer_message || "Price shown for the selected stay details."}
                  </div>
                </>
              ) : (
                <>
                  <div style={s.bad}>Live rate unavailable</div>
                  <div style={s.priceNote}>Try another stay or different dates.</div>
                </>
              )}
            </div>

            <button style={s.payBtn} onClick={() => setPage("checkout")}>
              Continue to Secure Checkout
            </button>
          </>
        )}
      </div>
    );
  }

  function HotelCard({ hotel, i }) {
    return (
      <div style={s.hotelCard}>
        {hotel.image_url ? (
          <img
            src={hotel.image_url}
            alt={hotel.name || "Hotel"}
            style={s.hotelImage}
            onError={(e) => {
              e.currentTarget.style.display = "none";
            }}
          />
        ) : null}

        <div style={s.hotelBody}>
          <div style={s.hotelName}>{hotel.name || hotel.hotel_name || "Available stay"}</div>
          <div style={s.hotelLocation}>
            {hotel.address || hotel.area || "Destination stay"}
            {hotel.city ? `, ${hotel.city}` : ""}
            {hotel.country ? `, ${hotel.country}` : ""}
          </div>

          <div style={s.hotelFacts}>
            <span>{hotel.rating || "Stay option"}</span>
            <span>{stayType}</span>
            <span>Live price check</span>
          </div>

          <div style={s.liveNote}>
            Select this stay to refresh the live rate for your dates, guests and rooms.
          </div>

          <div style={s.cardBtns}>
            <button style={s.selectBtn} onClick={() => selectHotel(hotel)}>
              Select Stay
            </button>
            <button
              style={s.outlineBtn}
              onClick={() => {
                setSelectedHotel(hotel);
                setPage("guide");
              }}
            >
              Guide / Map
            </button>
          </div>
        </div>
      </div>
    );
  }

  function PageShell({ title, subtitle, children }) {
    return (
      <div style={s.root}>
        <Header />
        <div style={s.pageWrap}>
          <div style={s.pageCard}>
            <h1 style={s.pageTitle}>{title}</h1>
            <p style={s.pageSub}>{subtitle}</p>
            {children}
          </div>
        </div>
      </div>
    );
  }

  if (page === "destinations") {
    return (
      <PageShell
        title="Destinations"
        subtitle="Choose a country and city, then return to stays to search available live stays."
      >
        <SearchBox />
        <div style={s.grid3}>
          {destinations.slice(0, 90).map((d) => (
            <div style={s.infoCard} key={d.country}>
              <h2>{d.country}</h2>
              <p>{d.cities.slice(0, 12).join(", ")}</p>
              <button
                style={s.selectBtn}
                onClick={() => {
                  setCountry(d.country);
                  setCity(d.cities[0] || "");
                  setPage("home");
                }}
              >
                Search this country
              </button>
            </div>
          ))}
        </div>
      </PageShell>
    );
  }

  if (page === "guide") {
    return (
      <PageShell
        title="Destination Guide"
        subtitle="Practical travel support for safety, transport, attractions and local services."
      >
        <div style={s.guideHero}>
          <div>
            <h2>{city || selectedHotel?.city || "Your destination"}</h2>
            <p>
              Use this page to plan local safety, airport movement, attractions,
              restaurants and useful visitor services.
            </p>
          </div>
          <button style={s.goldBtn} onClick={() => setPage("home")}>Back to stays</button>
        </div>

        <div style={s.grid3}>
          <Info title="Emergency" text="Police, ambulance, hospital and fire service information should be checked locally before travel." />
          <Info title="Airport & Transport" text="Plan airport transfer, taxi, public transport and arrival time before check-in." />
          <Info title="Restaurants" text="Find nearby restaurants, cafÃ©s, family food options and late-night dining." />
          <Info title="Attractions" text="Museums, tour buses, beaches, parks, landmarks and local experiences." />
          <Info title="Family Travel" text="Zoos, aquariums, family attractions and safe visitor areas." />
          <Info title="Before Arrival" text="Check check-in time, local currency, transport rules and travel documents." />
        </div>

        {selectedHotel && (
          <div style={s.selectedBox}>
            <h2>Selected stay</h2>
            <p><b>{selectedHotel.name}</b></p>
            <p>{selectedHotel.address}</p>
          </div>
        )}
      </PageShell>
    );
  }

  if (page === "offers") {
    return (
      <PageShell
        title="Offers"
        subtitle="Customer-focused stay ideas for business, leisure, family and longer visits."
      >
        <div style={s.grid3}>
          <Info title="City breaks" text="Find practical stays near transport, restaurants and attractions." />
          <Info title="Business travel" text="Choose stays near central districts, meeting areas and airports." />
          <Info title="Family trips" text="Plan with rooms, destination support and useful local guidance." />
          <Info title="Longer stays" text="Explore apartments and villas for flexible travel." />
          <Info title="Weekend stays" text="Search short stays with clear dates and pricing." />
          <Info title="Popular escapes" text="Compare city, beach and visitor destination stays." />
        </div>
      </PageShell>
    );
  }

  if (page === "help") {
    return (
      <PageShell
        title="Help & Support"
        subtitle="Support for bookings, destination guidance and partner enquiries."
      >
        <div style={s.grid3}>
          <Info title="Booking support" text="Search by country and city, select a stay and review the live price." />
          <Info title="Price support" text="Prices can change by date, guests, rooms and live availability." />
          <Info title="Travel guide" text="Use the guide page for transport, safety and attraction planning." />
          <Info title="Checkout" text="Always confirm stay name, dates, guests, rooms and total before payment." />
          <Info title="Partner support" text="Hotels and property providers can use the application form." />
          <Info title="Customer trust" text="MySpace Hotel focuses on clarity, destination support and reliable booking flow." />
        </div>
      </PageShell>
    );
  }

  if (page === "partners") {
    return (
      <PageShell
        title="Partner Application Form"
        subtitle="For hotels, apartments, villas and property providers who want to work with MySpace Hotel."
      >
        {partnerSent ? (
          <div style={s.success}>Application received. MySpace Hotel will review the property details.</div>
        ) : (
          <form
            style={s.form}
            onSubmit={(e) => {
              e.preventDefault();
              setPartnerSent(true);
            }}
          >
            <input required style={s.input} placeholder="Property name" />
            <input required style={s.input} placeholder="Contact person" />
            <input required type="email" style={s.input} placeholder="Contact email" />
            <input style={s.input} placeholder="Phone number" />
            <input required style={s.input} placeholder="Country" />
            <input required style={s.input} placeholder="City" />
            <select required style={s.input}>
              <option value="">Property type</option>
              <option>Hotel</option>
              <option>Apartment</option>
              <option>Villa</option>
              <option>Resort</option>
              <option>Other</option>
            </select>
            <input style={s.input} placeholder="Number of rooms / units" />
            <textarea required style={s.textarea} placeholder="Tell us about your property, booking setup, PMS/channel manager and target guests." />
            <button style={s.submitBtn}>Submit Application</button>
          </form>
        )}
      </PageShell>
    );
  }

  if (page === "login") {
    return (
      <PageShell
        title="Partner Login"
        subtitle="Secure access area for approved partners."
      >
        <form
          style={s.login}
          onSubmit={(e) => {
            e.preventDefault();
            setLoginNotice("Partner login access will be enabled for approved properties.");
          }}
        >
          <input required type="email" style={s.input} placeholder="Email address" />
          <input required type="password" style={s.input} placeholder="Password" />
          <button style={s.submitBtn}>Login</button>
          {loginNotice && <div style={s.noticeSmall}>{loginNotice}</div>}
        </form>
      </PageShell>
    );
  }

  if (page === "checkout") {
    return (
      <PageShell
        title="Secure Checkout"
        subtitle="Review your stay before payment."
      >
        {!selectedHotel ? (
          <div style={s.warning}>No stay selected. Please return to stays.</div>
        ) : (
          <div style={s.checkoutGrid}>
            <div style={s.infoCard}>
              <h2>{selectedHotel.name}</h2>
              <p>{selectedHotel.address}</p>
              <p>{selectedHotel.city} {selectedHotel.country}</p>
              <p><b>Dates:</b> {checkin} to {checkout}</p>
              <p><b>Guests:</b> {guests}</p>
              <p><b>Rooms:</b> {rooms}</p>
            </div>
            <div style={s.infoCard}>
              <h2>Payment review</h2>
              <p>Confirm hotel, dates, guests, rooms and total before paying.</p>
              <button style={s.payBtn}>Proceed to payment</button>
            </div>
          </div>
        )}
      </PageShell>
    );
  }

  return (
    <div style={s.root}>
      <Header />

      <section style={s.hero}>
        <div style={s.heroInner}>
          <div style={s.badge}>Professional hotel booking portal</div>
          <h1 style={s.heroTitle}>Find trusted stays with clearer travel support.</h1>
          <p style={s.heroText}>
            Search hotels, apartments and villas, choose your destination,
            review stay details and load live rates before checkout.
          </p>
          <SearchBox />
        </div>
      </section>

      <div style={s.trustRow}>
        <Info title="Live rate flow" text="Select a stay to refresh the current available price." />
        <Info title="Destination guide" text="Useful support for transport, safety and attractions." />
        <Info title="Secure checkout" text="Review stay details before moving to payment." />
        <Info title="Partner-ready" text="Hotels and properties can apply through the partner form." />
      </div>

      {notice && <div style={s.notice}>{notice}</div>}

      <main style={s.main}>
        <section>
          <div style={s.sectionHead}>
            <div>
              <h2 style={s.sectionTitle}>Available stays</h2>
              <p style={s.sectionSub}>Search a destination, select a stay, then review live pricing.</p>
            </div>
            <button style={s.outlineBtn} onClick={() => setPage("guide")}>Open guide</button>
          </div>

          {loading && <div style={s.loading}>Searching available stays...</div>}

          {!loading && !hotels.length && (
            <div style={s.grid3}>
              <Info title="Start with destination" text="Select country and city from the dropdowns above." />
              <Info title="Choose your stay" text="Review hotel cards and select the best fit for your trip." />
              <Info title="Check live rate" text="The reserve panel updates when a stay is selected." />
            </div>
          )}

          <div style={s.hotelGrid}>
            {hotels.map((hotel, i) => (
              <HotelCard key={hotel.hotel_id || hotel.id || hotel.code || i} hotel={hotel} i={i} />
            ))}
          </div>
        </section>

        <ReservePanel />
      </main>
    </div>
  );
}

function Info({ title, text }) {
  return (
    <div style={s.infoCard}>
      <h3>{title}</h3>
      <p>{text}</p>
    </div>
  );
}

const s = {
  root: {
    minHeight: "100vh",
    background: "#edf3fb",
    color: "#081b44",
    fontFamily: "Inter, Arial, sans-serif"
  },
  header: {
    position: "sticky",
    top: 0,
    zIndex: 100,
    background: "#ffffff",
    borderBottom: "1px solid #d9e4f2",
    padding: "16px 28px",
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 20
  },
  brand: {
    cursor: "pointer",
    minWidth: 260
  },
  logo: {
    fontSize: 34,
    fontWeight: 950,
    letterSpacing: "-1px"
  },
  tagline: {
    color: "#61718b",
    fontWeight: 800
  },
  nav: {
    display: "flex",
    gap: 10,
    flexWrap: "wrap",
    justifyContent: "flex-end"
  },
  navBtn: {
    background: "#ffffff",
    border: "1px solid #d7e1ef",
    borderRadius: 12,
    padding: "11px 15px",
    fontWeight: 900,
    cursor: "pointer"
  },
  goldBtn: {
    background: "#f4c430",
    border: "none",
    borderRadius: 12,
    padding: "12px 18px",
    fontWeight: 950,
    cursor: "pointer"
  },
  darkBtn: {
    background: "#081b44",
    color: "#ffffff",
    border: "none",
    borderRadius: 12,
    padding: "12px 18px",
    fontWeight: 950,
    cursor: "pointer"
  },
  hero: {
    backgroundImage:
      "linear-gradient(90deg, rgba(255,255,255,0.97), rgba(255,255,255,0.78)), url('https://images.unsplash.com/photo-1507525428034-b723cf961d3e?q=80&w=1800')",
    backgroundSize: "cover",
    backgroundPosition: "center"
  },
  heroInner: {
    maxWidth: 1500,
    margin: "0 auto",
    padding: "42px 30px"
  },
  badge: {
    display: "inline-block",
    background: "#dbeafe",
    color: "#1d4ed8",
    borderRadius: 999,
    padding: "10px 16px",
    fontWeight: 950,
    marginBottom: 18
  },
  heroTitle: {
    maxWidth: 900,
    margin: 0,
    fontSize: 64,
    lineHeight: 1.02,
    fontWeight: 950
  },
  heroText: {
    maxWidth: 920,
    marginTop: 18,
    color: "#334967",
    fontSize: 23,
    fontWeight: 750
  },
  searchBox: {
    marginTop: 28,
    background: "#ffffff",
    borderRadius: 28,
    padding: 20,
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit,minmax(170px,1fr))",
    gap: 14,
    alignItems: "end",
    boxShadow: "0 18px 50px rgba(8,27,68,0.12)"
  },
  label: {
    display: "block",
    marginBottom: 8,
    fontWeight: 950
  },
  input: {
    width: "100%",
    height: 52,
    borderRadius: 13,
    border: "1px solid #cbd7e8",
    padding: "0 14px",
    fontSize: 16,
    boxSizing: "border-box",
    background: "#ffffff"
  },
  textarea: {
    gridColumn: "1 / -1",
    width: "100%",
    minHeight: 160,
    borderRadius: 13,
    border: "1px solid #cbd7e8",
    padding: 14,
    fontSize: 16,
    boxSizing: "border-box"
  },
  searchBtn: {
    background: "#1d4ed8",
    color: "#ffffff",
    border: "none",
    borderRadius: 15,
    padding: "16px 20px",
    minHeight: 52,
    fontSize: 17,
    fontWeight: 950,
    cursor: "pointer"
  },
  trustRow: {
    maxWidth: 1500,
    margin: "22px auto 0",
    padding: "0 30px",
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit,minmax(230px,1fr))",
    gap: 16
  },
  main: {
    maxWidth: 1500,
    margin: "0 auto",
    padding: 30,
    display: "grid",
    gridTemplateColumns: "1fr 410px",
    gap: 24,
    alignItems: "start"
  },
  sectionHead: {
    display: "flex",
    justifyContent: "space-between",
    gap: 20,
    alignItems: "center",
    marginBottom: 22
  },
  sectionTitle: {
    fontSize: 38,
    margin: 0,
    fontWeight: 950
  },
  sectionSub: {
    margin: "8px 0 0",
    color: "#60708a",
    fontWeight: 800
  },
  grid3: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit,minmax(250px,1fr))",
    gap: 18,
    marginTop: 22
  },
  infoCard: {
    background: "#ffffff",
    borderRadius: 24,
    padding: 24,
    boxShadow: "0 10px 28px rgba(8,27,68,0.07)",
    fontWeight: 750
  },
  hotelGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fill,minmax(340px,1fr))",
    gap: 22
  },
  hotelCard: {
    background: "#ffffff",
    borderRadius: 26,
    overflow: "hidden",
    boxShadow: "0 14px 36px rgba(8,27,68,0.10)"
  },
  hotelImage: {
    width: "100%",
    height: 235,
    objectFit: "cover",
    background: "#dbe4f2"
  },
  hotelBody: {
    padding: 22
  },
  hotelName: {
    fontSize: 25,
    fontWeight: 950
  },
  hotelLocation: {
    marginTop: 10,
    color: "#5d6f89",
    fontWeight: 800
  },
  hotelFacts: {
    marginTop: 14,
    display: "flex",
    flexWrap: "wrap",
    gap: 8,
    color: "#415875",
    fontWeight: 900
  },
  liveNote: {
    marginTop: 16,
    background: "#eef6ff",
    borderRadius: 15,
    padding: 14,
    color: "#124078",
    fontWeight: 850
  },
  cardBtns: {
    display: "flex",
    gap: 12,
    marginTop: 20
  },
  selectBtn: {
    background: "#f4c430",
    border: "none",
    borderRadius: 14,
    padding: "15px 16px",
    fontWeight: 950,
    cursor: "pointer"
  },
  outlineBtn: {
    background: "#ffffff",
    border: "2px solid #d9e3ef",
    borderRadius: 14,
    padding: "15px 16px",
    fontWeight: 950,
    cursor: "pointer"
  },
  reserve: {
    background: "#ffffff",
    borderRadius: 28,
    padding: 24,
    position: "sticky",
    top: 100,
    boxShadow: "0 14px 36px rgba(8,27,68,0.10)"
  },
  reserveTitle: {
    fontSize: 38,
    fontWeight: 950
  },
  reserveEmpty: {
    marginTop: 24,
    background: "#f4f8fd",
    borderRadius: 18,
    padding: 20,
    color: "#5c6f89",
    fontWeight: 850
  },
  reserveHotel: {
    marginTop: 22,
    fontSize: 27,
    fontWeight: 950
  },
  reserveAddress: {
    marginTop: 10,
    color: "#60708a",
    fontWeight: 800
  },
  tripBox: {
    marginTop: 18,
    display: "grid",
    gap: 8,
    background: "#f4f8fd",
    borderRadius: 18,
    padding: 18,
    color: "#415875"
  },
  priceBox: {
    marginTop: 22,
    background: "#ecfdf3",
    borderRadius: 19,
    padding: 22
  },
  priceLabel: {
    color: "#25603a",
    fontWeight: 950
  },
  price: {
    marginTop: 8,
    fontSize: 42,
    fontWeight: 950
  },
  priceNote: {
    marginTop: 10,
    color: "#365943",
    fontWeight: 750
  },
  bad: {
    color: "#991b1b",
    fontWeight: 950
  },
  payBtn: {
    width: "100%",
    marginTop: 22,
    background: "#10b981",
    color: "#ffffff",
    border: "none",
    borderRadius: 18,
    padding: 19,
    fontSize: 19,
    fontWeight: 950,
    cursor: "pointer"
  },
  notice: {
    maxWidth: 1440,
    margin: "20px auto 0",
    background: "#fff7ed",
    color: "#9a3412",
    border: "1px solid #fed7aa",
    borderRadius: 18,
    padding: 18,
    fontWeight: 900
  },
  noticeSmall: {
    background: "#eff6ff",
    color: "#1d4ed8",
    borderRadius: 14,
    padding: 14,
    fontWeight: 850
  },
  loading: {
    background: "#ffffff",
    borderRadius: 22,
    padding: 26,
    fontWeight: 950,
    boxShadow: "0 10px 26px rgba(8,27,68,0.06)"
  },
  pageWrap: {
    maxWidth: 1380,
    margin: "0 auto",
    padding: 30
  },
  pageCard: {
    background: "#ffffff",
    borderRadius: 30,
    padding: 36,
    boxShadow: "0 14px 36px rgba(8,27,68,0.08)"
  },
  pageTitle: {
    margin: 0,
    fontSize: 50,
    fontWeight: 950
  },
  pageSub: {
    color: "#5a6d87",
    fontSize: 20,
    fontWeight: 800,
    marginTop: 12
  },
  guideHero: {
    marginTop: 24,
    background: "#081b44",
    color: "#ffffff",
    borderRadius: 26,
    padding: 30,
    display: "flex",
    justifyContent: "space-between",
    gap: 20,
    alignItems: "center"
  },
  selectedBox: {
    marginTop: 24,
    background: "#eef6ff",
    borderRadius: 24,
    padding: 24,
    fontWeight: 800
  },
  form: {
    marginTop: 28,
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit,minmax(260px,1fr))",
    gap: 16
  },
  login: {
    marginTop: 28,
    maxWidth: 520,
    display: "grid",
    gap: 16
  },
  submitBtn: {
    background: "#1d4ed8",
    color: "#ffffff",
    border: "none",
    borderRadius: 15,
    padding: 18,
    fontSize: 18,
    fontWeight: 950,
    cursor: "pointer"
  },
  success: {
    marginTop: 24,
    background: "#ecfdf3",
    color: "#166534",
    borderRadius: 17,
    padding: 18,
    fontWeight: 950
  },
  warning: {
    marginTop: 14,
    background: "#fef2f2",
    color: "#991b1b",
    borderRadius: 15,
    padding: 15,
    fontWeight: 900
  },
  checkoutGrid: {
    marginTop: 26,
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit,minmax(320px,1fr))",
    gap: 22
  }
};
