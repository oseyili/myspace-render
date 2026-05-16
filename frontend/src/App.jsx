import React, { useEffect, useMemo, useState } from "react";

const API_BASE =
  import.meta.env.VITE_API_BASE ||
  import.meta.env.VITE_API_BASE_URL ||
  "https://myspace-hotel-backend.onrender.com";

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

function safeRooms(v) {
  const n = Number(v || 1);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : 1;
}

function safeGuests(v) {
  const n = Number(v || 1);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : 1;
}

function nightsBetween(checkin, checkout) {
  const a = new Date(checkin).getTime();
  const b = new Date(checkout).getTime();
  const d = Math.ceil((b - a) / 86400000);
  return Number.isFinite(d) && d > 0 ? d : 1;
}

function isLivePayable(hotel) {
  return Boolean(
    hotel?.live_rate_ready &&
      hotel?.first_rate?.rate_key &&
      Number(hotel?.first_rate?.amount || hotel?.first_rate?.customer_total || 0) > 0
  );
}

function rateAmount(hotel) {
  return Number(
    hotel?.first_rate?.amount ||
      hotel?.first_rate?.customer_total ||
      hotel?.first_rate?.selling_rate ||
      hotel?.first_rate?.net ||
      0
  );
}

function totalForRooms(hotel, rooms) {
  return Number((rateAmount(hotel) * safeRooms(rooms)).toFixed(2));
}

function propertyType(hotel) {
  const name = clean(hotel?.hotel_name).toLowerCase();

  if (
    name.includes("apartment") ||
    name.includes("apart ") ||
    name.includes("apart-") ||
    name.includes("residence") ||
    name.includes("residences") ||
    name.includes("penthouse") ||
    name.includes("villa") ||
    name.includes("holiday home") ||
    name.includes("home ") ||
    name.includes("studio") ||
    name.includes("suite") ||
    name.includes("flat")
  ) {
    return "Apartment / Residence";
  }

  return "Hotel";
}

function isApartmentType(hotel) {
  return propertyType(hotel) === "Apartment / Residence";
}

function go(path) {
  window.location.href = path;
}

function mapsQuery(query) {
  return `https://www.google.com/maps/search/${encodeURIComponent(query)}`;
}

function PropertyImage({ hotel, large = false }) {
  const [failed, setFailed] = useState(false);

  const url = clean(hotel?.direct_image_url || hotel?.image_url);

  useEffect(() => {
    setFailed(false);
  }, [url, hotel?.hotel_id]);

  if (!url || failed) {
    return (
      <div className={large ? "imageFallback imageLarge" : "imageFallback"}>
        <div className="imageBrand">MYSPACE HOTEL</div>
        <div className="imageFallbackTitle">Verified property image unavailable</div>
        <div className="imageFallbackText">
          Real images only. No fake property photos are displayed.
        </div>
      </div>
    );
  }

  return (
    <img
      src={url}
      alt={hotel?.hotel_name || "Property"}
      className={large ? "hotelImage imageLarge" : "hotelImage"}
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
        <h1 className="infoTitle">{title}</h1>
        <p className="infoSubtitle">{subtitle}</p>
        {children}
        <button className="goldSmall" onClick={() => go("/")}>
          Back to hotel search
        </button>
      </div>
    </div>
  );
}

function DestinationGuidePage() {
  const params = new URLSearchParams(window.location.search);
  const country = params.get("country") || "your destination";
  const city = params.get("city") || "";
  const destination = [city, country].filter(Boolean).join(", ");

  const guideCards = [
    {
      title: "Emergency numbers",
      body: "Use the local emergency number immediately for urgent police, ambulance or fire support.",
      rows: [
        "Europe and many destinations: 112",
        "United Kingdom: 999 or 112",
        "United States / Canada: 911",
        "Australia: 000",
        "Nigeria: 112",
        "UAE: Police 999, Ambulance 998, Fire 997",
      ],
    },
    {
      title: "Hospitals and pharmacies",
      body: "Before arrival, check the nearest hospital, urgent care centre and 24-hour pharmacy near your stay.",
      rows: [
        "Search: nearest hospital near your hotel",
        "Search: 24 hour pharmacy near your hotel",
        "Keep your travel insurance contact available",
      ],
    },
    {
      title: "Airport and arrival",
      body: "Confirm your arrival airport, terminal, transfer time and late-night transport before travel.",
      rows: [
        "Check terminal before departure",
        "Use official airport taxi or trusted transfer",
        "Keep hotel address saved offline",
      ],
    },
    {
      title: "Local transport",
      body: "Use official taxis, trusted ride-share, hotel-arranged transfers or main public transport stations.",
      rows: [
        "Confirm last train or bus time",
        "Avoid unmarked taxis",
        "Share your route with someone you trust",
      ],
    },
    {
      title: "Food and restaurants",
      body: "Check nearby restaurants, opening hours and walking safety before going out late.",
      rows: [
        "Search restaurants near your stay",
        "Check recent ratings",
        "Book ahead during busy periods",
      ],
    },
    {
      title: "Things to do",
      body: "Museums, parks, beaches, zoos, tour buses and landmarks are easier to enjoy when planned early.",
      rows: [
        "Check opening hours",
        "Use official attraction websites",
        "Book popular tours early",
      ],
    },
  ];

  return (
    <InfoPage
      title="Destination guide"
      subtitle={`Practical arrival, safety and local planning for ${destination}.`}
    >
      <div className="guideHero">
        <div>
          <h2>Arrive prepared</h2>
          <p>
            Use this page to plan safety, transport, nearby services, food and attractions before
            you arrive. Save the hotel address, emergency number and transport plan before travel.
          </p>
        </div>
        <button
          className="mapOpen"
          onClick={() => window.open(mapsQuery(destination), "_blank", "noopener,noreferrer")}
        >
          Open destination map
        </button>
      </div>

      <div className="guideGrid">
        {guideCards.map((card) => (
          <div className="guideCard" key={card.title}>
            <h3>{card.title}</h3>
            <p>{card.body}</p>
            <ul>
              {card.rows.map((row) => (
                <li key={row}>{row}</li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </InfoPage>
  );
}

function FAQPage() {
  return (
    <InfoPage
      title="Frequently asked questions"
      subtitle="Clear answers before you choose, reserve or pay."
    >
      <div className="simpleGrid">
        <div className="simpleBox">
          <b>Can I search hotels and apartments?</b>
          <br />
          Yes. MySpace Hotel shows different stay types including hotels, apartments, residences,
          villas, studios and penthouses where available.
        </div>
        <div className="simpleBox">
          <b>Is the total calculated for multiple rooms?</b>
          <br />
          Yes. The customer total updates by multiplying the selected room count by the room rate.
        </div>
        <div className="simpleBox">
          <b>Why do some stays require confirmation?</b>
          <br />
          Some properties need current availability and final price confirmed before payment.
        </div>
        <div className="simpleBox">
          <b>Are the photos real?</b>
          <br />
          We do not use fake hotel photos. If a verified image is unavailable, the app shows a trust
          notice instead.
        </div>
      </div>
    </InfoPage>
  );
}

function TermsPage() {
  return (
    <InfoPage
      title="Booking terms"
      subtitle="Important customer information before continuing."
    >
      <div className="simpleGrid">
        <div className="simpleBox">
          Review the property name, stay type, location, dates, guests, rooms and total before
          continuing.
        </div>
        <div className="simpleBox">
          Prices and availability may change until the reservation is confirmed.
        </div>
        <div className="simpleBox">
          Payment is only enabled when a valid payable rate is available for the selected stay.
        </div>
        <div className="simpleBox">
          For confirmation-required stays, no payment is taken until current availability and price
          are confirmed.
        </div>
      </div>
    </InfoPage>
  );
}

function ContactPage() {
  return (
    <InfoPage
      title="Customer support"
      subtitle="Reservation support for safer booking decisions."
    >
      <div className="simpleGrid">
        <div className="simpleBox">
          <b>Email</b>
          <br />
          reservations@myspace-hotel.com
        </div>
        <div className="simpleBox">
          <b>Booking help</b>
          <br />
          Include destination, dates, property name and your booking email.
        </div>
        <div className="simpleBox">
          <b>Arrival support</b>
          <br />
          Include your reservation code, guest name and arrival time.
        </div>
        <div className="simpleBox">
          <b>Special requests</b>
          <br />
          Add accessibility, family, arrival or room requests before continuing.
        </div>
      </div>
    </InfoPage>
  );
}

function ConfirmedPage() {
  const code = new URLSearchParams(window.location.search).get("code") || "";
  return (
    <InfoPage
      title="Reservation update received"
      subtitle="Your reservation update is being processed securely."
    >
      <div className="simpleBox">
        {code ? (
          <>
            <b>Reservation code</b>
            <br />
            {code}
          </>
        ) : (
          "Thank you. Your reservation update has been received."
        )}
      </div>
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
  const [stayType, setStayType] = useState("all");
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
  const [loadingHotels, setLoadingHotels] = useState(false);
  const [requesting, setRequesting] = useState(false);
  const [message, setMessage] = useState("");

  const selectedCountry = useMemo(
    () => catalog.find((x) => x.country === country) || null,
    [catalog, country]
  );

  const cities = selectedCountry?.cities || [];

  const filteredHotels = useMemo(() => {
    if (stayType === "hotel") return hotels.filter((h) => propertyType(h) === "Hotel");
    if (stayType === "apartment") return hotels.filter((h) => isApartmentType(h));
    return hotels;
  }, [hotels, stayType]);

  const stats = useMemo(() => {
    const hotelCount = hotels.filter((h) => propertyType(h) === "Hotel").length;
    const apartmentCount = hotels.filter((h) => isApartmentType(h)).length;
    const instantCount = hotels.filter(isLivePayable).length;

    return { hotelCount, apartmentCount, instantCount };
  }, [hotels]);

  async function loadCatalog() {
    setLoadingCatalog(true);
    setMessage("");

    try {
      const res = await fetch(`${API_BASE}/api/real-catalog/destinations`, { cache: "no-store" });
      const data = await res.json();
      const countries = Array.isArray(data.countries) ? data.countries : [];

      setCatalog(countries);

      const firstCountry =
        countries.find((c) => c.cities?.some((x) => Number(x.live_hotels || 0) > 0)) ||
        countries[0];

      const firstCity =
        firstCountry?.cities?.find((x) => Number(x.live_hotels || 0) > 0) ||
        firstCountry?.cities?.[0];

      setCountry(firstCountry?.country || "");
      setCity(firstCity?.city || "");

      if (firstCountry?.country && firstCity?.city) {
        await searchHotels(firstCountry.country, firstCity.city);
      }
    } catch {
      setMessage("Could not load destinations. Please refresh and try again.");
    } finally {
      setLoadingCatalog(false);
    }
  }

  async function searchHotels(nextCountry = country, nextCity = city) {
    if (!nextCountry || !nextCity) {
      setMessage("Choose a country and city first.");
      return;
    }

    setLoadingHotels(true);
    setSelectedHotel(null);
    setMessage("");

    try {
      const p = new URLSearchParams();
      p.set("country", nextCountry);
      p.set("city", nextCity);
      p.set("limit", "160");

      if (clean(area)) p.set("area", clean(area));
      if (clean(keyword)) p.set("keyword", clean(keyword));

      const res = await fetch(`${API_BASE}/api/hotels/search?${p.toString()}`, { cache: "no-store" });
      const data = await res.json();
      const list = Array.isArray(data.hotels) ? data.hotels : [];

      const unique = new Map();

      for (const hotel of list) {
        const key = [
          clean(hotel.hotel_id || hotel.hotel_code || hotel.hotel_name).toLowerCase(),
          clean(hotel.hotel_name).toLowerCase(),
          clean(hotel.city).toLowerCase(),
          clean(hotel.country).toLowerCase(),
        ].join("|");

        if (!unique.has(key)) unique.set(key, hotel);
      }

      const deduped = Array.from(unique.values());

      setHotels(deduped);
      setSelectedHotel(deduped[0] || null);

      const instant = deduped.filter(isLivePayable).length;

      setMessage(
        deduped.length
          ? `${deduped.length} stays found in ${nextCity}. ${instant} can continue to instant secure checkout.`
          : "No matching stay found. Try another city or clear filters."
      );
    } catch {
      setHotels([]);
      setMessage("Search service is temporarily unavailable. Please refresh and try again.");
    } finally {
      setLoadingHotels(false);
    }
  }

  useEffect(() => {
    loadCatalog();
  }, []);

  function changeCountry(nextCountry) {
    const found = catalog.find((x) => x.country === nextCountry);
    const firstCity =
      found?.cities?.find((x) => Number(x.live_hotels || 0) > 0)?.city ||
      found?.cities?.[0]?.city ||
      "";

    setCountry(nextCountry);
    setCity(firstCity);
    setHotels([]);
    setSelectedHotel(null);
    setMessage("City selected. Press Search stays to continue.");
  }

  function changeCity(nextCity) {
    setCity(nextCity);
    setHotels([]);
    setSelectedHotel(null);
    setMessage("Press Search stays to continue.");
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
    setMessage(isLivePayable(hotel) ? "Preparing secure checkout..." : "Sending confirmation request...");

    try {
      const rate = hotel.first_rate || {};
      const payload = {
        hotel_id: hotel.hotel_id,
        hotel_name: hotel.hotel_name,
        destination: `${hotel.city}, ${hotel.country}`,
        checkin,
        checkout,
        guests: safeGuests(guests),
        rooms: safeRooms(rooms),
        customer_name: customerName.trim(),
        customer_email: customerEmail.trim(),
        customer_phone: customerPhone.trim(),
        note: note.trim(),
        rate_key: rate.rate_key || "",
        amount: totalForRooms(hotel, rooms) || "",
        currency: rate.currency || "",
        room_name: rate.room_name || "",
        board_name: rate.board_name || "",
        price_display: rate.currency ? `${rate.currency} ${money(totalForRooms(hotel, rooms))}` : "Confirmation required",
      };

      const res = await fetch(`${API_BASE}/reservation-request`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const data = await res.json();

      if (!res.ok || !data.ok) {
        setMessage(data.message || "Could not continue with this reservation.");
        return;
      }

      if (data.payment_url) {
        window.location.href = data.payment_url;
        return;
      }

      setMessage(
        `Request received: ${data.reservation_code}. We will confirm availability and price before payment.`
      );
    } catch {
      setMessage("Reservation service is temporarily unavailable.");
    } finally {
      setRequesting(false);
    }
  }

  const selectedLive = isLivePayable(selectedHotel);
  const selectedTotal = totalForRooms(selectedHotel, rooms);
  const selectedCurrency = selectedHotel?.first_rate?.currency || "";
  const nights = nightsBetween(checkin, checkout);

  return (
    <div className="page">
      <AppStyles />

      <section className="hero">
        <div>
          <div className="brand">MYSPACE HOTEL</div>
          <h1>Book with clarity before you arrive.</h1>
          <p>
            Compare hotels, apartments and residences, review your total for all selected rooms,
            and continue with confidence.
          </p>
        </div>

        <div className="heroButtons">
          <button onClick={() => go(`/?page=travel&country=${encodeURIComponent(country)}&city=${encodeURIComponent(city)}`)}>
            Destination Guide
          </button>
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
              {loadingCatalog
                ? "Loading destinations..."
                : `${catalog.length} countries loaded. Choose hotels, apartments or all stay types.`}
            </div>

            <label>Country</label>
            <select value={country} onChange={(e) => changeCountry(e.target.value)}>
              <option value="">Choose country</option>
              {catalog.map((c) => (
                <option key={c.country} value={c.country}>
                  {c.country} - {c.city_count} cities
                </option>
              ))}
            </select>

            <label>City</label>
            <select value={city} onChange={(e) => changeCity(e.target.value)} disabled={!country}>
              <option value="">Choose city</option>
              {cities.map((c) => (
                <option key={`${country}-${c.city}`} value={c.city}>
                  {c.city} -{" "}
                  {Number(c.live_hotels || 0) > 0
                    ? `${c.live_hotels} instant stays`
                    : `${c.catalog_hotels || 0} stays`}
                </option>
              ))}
            </select>

            <label>Stay type</label>
            <select value={stayType} onChange={(e) => setStayType(e.target.value)}>
              <option value="all">Hotels and apartments</option>
              <option value="hotel">Hotels only</option>
              <option value="apartment">Apartments / residences only</option>
            </select>

            <label>Area</label>
            <input
              value={area}
              onChange={(e) => setArea(e.target.value)}
              placeholder="Neighbourhood or area"
            />

            <label>Keyword</label>
            <input
              value={keyword}
              onChange={(e) => setKeyword(e.target.value)}
              placeholder="Property name or landmark"
            />

            <div className="two">
              <div>
                <label>Check-in</label>
                <input type="date" value={checkin} onChange={(e) => setCheckin(e.target.value)} />
              </div>
              <div>
                <label>Check-out</label>
                <input type="date" value={checkout} onChange={(e) => setCheckout(e.target.value)} />
              </div>
            </div>

            <div className="two">
              <div>
                <label>Guests</label>
                <input
                  type="number"
                  min="1"
                  value={guests}
                  onChange={(e) => setGuests(safeGuests(e.target.value))}
                />
              </div>
              <div>
                <label>Rooms</label>
                <input
                  type="number"
                  min="1"
                  value={rooms}
                  onChange={(e) => setRooms(safeRooms(e.target.value))}
                />
              </div>
            </div>

            <button className="goldButton" disabled={loadingHotels || loadingCatalog} onClick={() => searchHotels()}>
              {loadingHotels ? "Searching..." : "Search stays"}
            </button>

            {message && <div className="notice">{message}</div>}

            {hotels.length > 0 && (
              <div className="summaryBox">
                <b>Results summary</b>
                <span>Hotels: {stats.hotelCount}</span>
                <span>Apartments / residences: {stats.apartmentCount}</span>
                <span>Instant checkout: {stats.instantCount}</span>
              </div>
            )}
          </div>
        </div>

        <div className="column">
          <div className="label">STAYS</div>

          <div className="results">
            {filteredHotels.map((hotel, index) => {
              const live = isLivePayable(hotel);
              const type = propertyType(hotel);
              const total = totalForRooms(hotel, rooms);

              return (
                <div
                  key={`${hotel.hotel_id || hotel.hotel_name}-${index}`}
                  className={selectedHotel?.hotel_id === hotel.hotel_id ? "hotelCard selectedCard" : "hotelCard"}
                  onClick={() => setSelectedHotel(hotel)}
                >
                  <PropertyImage hotel={hotel} />

                  <div className="hotelBody">
                    <div className="topLine">
                      <span className="typeBadge">{type}</span>
                      <span className={live ? "liveBadge" : "confirmBadge"}>
                        {live ? "Instant checkout" : "Confirm first"}
                      </span>
                    </div>

                    <h2>{hotel.hotel_name}</h2>
                    <p className="location">
                      {hotel.area ? `${hotel.area}, ` : ""}
                      {hotel.city}, {hotel.country}
                    </p>

                    {live ? (
                      <div className="pricePanel">
                        <div className="priceRow">
                          <span>Room rate</span>
                          <b>
                            {hotel.first_rate.currency} {money(rateAmount(hotel))}
                          </b>
                        </div>
                        <div className="priceRow">
                          <span>Rooms selected</span>
                          <b>{safeRooms(rooms)}</b>
                        </div>
                        <div className="priceRow total">
                          <span>Total</span>
                          <b>
                            {hotel.first_rate.currency} {money(total)}
                          </b>
                        </div>
                      </div>
                    ) : (
                      <div className="confirmPanel">
                        We will confirm today&apos;s availability and final price before payment.
                      </div>
                    )}

                    <button className="darkButton" onClick={(e) => { e.stopPropagation(); setSelectedHotel(hotel); }}>
                      View stay
                    </button>
                  </div>
                </div>
              );
            })}

            {!loadingHotels && filteredHotels.length === 0 && (
              <div className="emptyBox">Choose a destination, then press Search stays.</div>
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
                <span className="typeBadge">{propertyType(selectedHotel)}</span>
                <span className={selectedLive ? "liveBadge" : "confirmBadge"}>
                  {selectedLive ? "Instant checkout available" : "Confirmation required"}
                </span>
              </div>

              <h2>{selectedHotel.hotel_name}</h2>
              <p className="location">
                {selectedHotel.area ? `${selectedHotel.area}, ` : ""}
                {selectedHotel.city}, {selectedHotel.country}
              </p>

              <div className="totalBox">
                <div className="totalSmall">Your stay total</div>
                <div className="totalBig">
                  {selectedLive ? `${selectedCurrency} ${money(selectedTotal)}` : "Confirm before payment"}
                </div>
                <div className="totalNote">
                  {nights} night{nights === 1 ? "" : "s"} | {safeGuests(guests)} guest
                  {safeGuests(guests) === 1 ? "" : "s"} | {safeRooms(rooms)} room
                  {safeRooms(rooms) === 1 ? "" : "s"}
                </div>
              </div>

              {selectedLive && (
                <div className="pricePanel">
                  <div className="priceRow">
                    <span>Rate per room</span>
                    <b>
                      {selectedCurrency} {money(rateAmount(selectedHotel))}
                    </b>
                  </div>
                  <div className="priceRow">
                    <span>Rooms selected</span>
                    <b>{safeRooms(rooms)}</b>
                  </div>
                  <div className="priceRow total">
                    <span>Total to pay</span>
                    <b>
                      {selectedCurrency} {money(selectedTotal)}
                    </b>
                  </div>
                </div>
              )}

              <div className="mapBox">
                <iframe
                  title="Property map"
                  src={
                    selectedHotel.latitude && selectedHotel.longitude
                      ? `https://maps.google.com/maps?q=${selectedHotel.latitude},${selectedHotel.longitude}&z=14&output=embed`
                      : `https://maps.google.com/maps?q=${encodeURIComponent(
                          `${selectedHotel.hotel_name} ${selectedHotel.city} ${selectedHotel.country}`
                        )}&z=14&output=embed`
                  }
                />
              </div>

              <input
                value={customerName}
                onChange={(e) => setCustomerName(e.target.value)}
                placeholder="Your full name"
              />
              <input
                value={customerEmail}
                onChange={(e) => setCustomerEmail(e.target.value)}
                placeholder="Your email"
              />
              <input
                value={customerPhone}
                onChange={(e) => setCustomerPhone(e.target.value)}
                placeholder="Phone number"
              />
              <textarea
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="Special requests"
              />

              <button className="goldButton" disabled={requesting} onClick={() => reserveOrPay(selectedHotel)}>
                {requesting ? "Working..." : selectedLive ? "Pay exact total" : "Request confirmation"}
              </button>

              <button
                className="guideButton"
                onClick={() =>
                  go(
                    `/?page=travel&country=${encodeURIComponent(selectedHotel.country)}&city=${encodeURIComponent(
                      selectedHotel.city
                    )}`
                  )
                }
              >
                Open destination guide
              </button>

              <div className="safeBox">
                {selectedLive
                  ? "Your payment total reflects the selected number of rooms."
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
      .hero { background: linear-gradient(135deg,#10306f,#1f5dca); border-radius: 24px; padding: 28px; display: grid; grid-template-columns: 1.2fr .8fr; gap: 20px; margin-bottom: 18px; align-items: center; }
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
      .goldButton, .goldSmall { width: 100%; background: #ffd34d; color: #06101f; border: 2px solid #06101f; border-radius: 14px; padding: 15px 16px; font-weight: 900; font-size: 18px; cursor: pointer; margin-top: 12px; }
      .guideButton { width: 100%; background: #112a5f; color: white; border: 0; border-radius: 14px; padding: 15px 16px; font-weight: 900; font-size: 16px; cursor: pointer; margin-top: 10px; }
      .summaryBox { background: #f5f8fd; border-radius: 14px; padding: 13px; margin-top: 14px; display: grid; gap: 7px; font-weight: 800; }
      .hotelCard { background: white; border-radius: 20px; overflow: hidden; margin-bottom: 18px; cursor: pointer; border: 2px solid transparent; }
      .selectedCard { border: 4px solid #ffd34d; }
      .hotelImage, .imageFallback { width: 100%; height: 200px; object-fit: cover; display: block; background: #10254a; }
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
      .pricePanel, .confirmPanel { background: #f5f8fd; border-radius: 14px; padding: 14px; margin-top: 14px; line-height: 1.6; }
      .confirmPanel { background: #fff1b8; color: #6b4d00; font-weight: 800; }
      .priceRow { display: flex; justify-content: space-between; gap: 12px; border-bottom: 1px solid #dbe5f2; padding: 7px 0; }
      .priceRow.total { border-bottom: 0; color: #0f4db3; font-size: 18px; font-weight: 900; }
      .darkButton { width: 100%; margin-top: 14px; background: #112a5f; color: white; border: 0; border-radius: 14px; padding: 14px 15px; font-weight: 900; font-size: 16px; cursor: pointer; }
      .totalBox { background: #dff7e6; color: #0a5d27; border-radius: 16px; padding: 16px; margin: 14px 0; }
      .totalSmall { font-weight: 900; }
      .totalBig { font-size: 30px; font-weight: 900; margin-top: 8px; }
      .totalNote { margin-top: 8px; font-weight: 800; line-height: 1.35; }
      .mapBox { background: #f5f8fd; border-radius: 16px; padding: 8px; margin: 14px 0; }
      iframe { width: 100%; height: 190px; border: 0; border-radius: 12px; }
      .safeBox { background: #dff7e6; border-radius: 14px; padding: 14px; margin-top: 14px; font-weight: 800; color: #0a5d27; line-height: 1.5; }
      .infoPage { min-height: 100vh; background: linear-gradient(135deg,#06101f,#123b7b); padding: 28px; color: white; }
      .infoCard { max-width: 1180px; margin: 0 auto; background: rgba(255,255,255,0.12); border: 1px solid rgba(255,255,255,0.22); border-radius: 24px; padding: 34px; }
      .infoTitle { font-size: 46px; margin: 0 0 12px; color: #ffd34d; }
      .infoSubtitle { font-size: 20px; line-height: 1.5; font-weight: 800; margin-bottom: 24px; }
      .guideHero { background: rgba(255,255,255,.12); border-radius: 20px; padding: 22px; display: flex; justify-content: space-between; gap: 20px; align-items: center; margin-bottom: 22px; }
      .guideHero h2 { color: #ffd34d; margin-bottom: 10px; }
      .mapOpen { background: #ffd34d; color: #06101f; border: 0; border-radius: 14px; padding: 15px 20px; font-weight: 900; cursor: pointer; min-width: 210px; }
      .guideGrid, .simpleGrid { display: grid; grid-template-columns: 1fr 1fr; gap: 18px; }
      .guideCard, .simpleBox { background: white; color: #06101f; border-radius: 18px; padding: 20px; font-size: 17px; line-height: 1.55; }
      .guideCard h3 { margin-top: 0; color: #123b7b; }
      .guideCard li { margin-bottom: 6px; }
      @media (max-width: 980px) {
        .hero, .mainGrid, .guideGrid, .simpleGrid { grid-template-columns: 1fr; }
        .column { height: auto; min-height: 420px; }
        .guideHero { display: block; }
        .mapOpen { width: 100%; margin-top: 16px; }
      }
    `}</style>
  );
}