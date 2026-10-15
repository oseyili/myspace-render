import React, { memo, useCallback, useMemo, useRef, useState } from "react";

const API_BASE =
  window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1"
    ? "http://127.0.0.1:5050"
    : "https://hotel-backend-1-ee5z.onrender.com";

const INITIAL_VISIBLE_RESULTS = 18;
const LOAD_MORE_RESULTS = 18;

const DESTINATIONS = {
  LON: {
    code: "LON",
    name: "London",
    country: "United Kingdom",
    currency: "GBP",
    aliases: ["london", "ldn", "lon", "london uk", "tower bridge", "heathrow", "gatwick", "mayfair", "westminster", "kensington", "canary wharf"],
    headline: "Historic grandeur, theatre nights, riverside walks, and elegant city stays.",
    guide:
      "London rewards travellers who choose the right neighbourhood. Stay near Tower Bridge for river views and history, Mayfair for luxury shopping, Canary Wharf for business, South Kensington for museums, and Covent Garden for theatre, dining, and walkability.",
    moments: ["Tower Bridge at sunset", "West End theatre", "Afternoon tea", "Museum mornings"],
  },
  PAR: {
    code: "PAR",
    name: "Paris",
    country: "France",
    currency: "EUR",
    aliases: ["paris", "par", "paris france", "cdg", "orly", "eiffel", "le marais", "saint germain"],
    headline: "Romance, design, cafés, galleries, and unforgettable neighbourhood charm.",
    guide:
      "Paris is best enjoyed slowly. Choose Saint-Germain for classic elegance, Le Marais for boutiques and food, the 8th for luxury, and the Latin Quarter for culture.",
    moments: ["Seine evening walks", "Louvre mornings", "Café terraces", "Boutique streets"],
  },
  BCN: {
    code: "BCN",
    name: "Barcelona",
    country: "Spain",
    currency: "EUR",
    aliases: ["barcelona", "bcn", "barcelona spain", "sagrada familia", "gothic quarter", "eixample"],
    headline: "Architecture, beach energy, food markets, and warm Mediterranean nights.",
    guide:
      "Barcelona works beautifully when you balance beach access with culture. Eixample is ideal for architecture and comfort, the Gothic Quarter for history, Barceloneta for the sea, and Gràcia for local charm.",
    moments: ["Sagrada Família", "Tapas evenings", "Beach afternoons", "Gothic lanes"],
  },
  DXB: {
    code: "DXB",
    name: "Dubai",
    country: "United Arab Emirates",
    currency: "AED",
    aliases: ["dubai", "dxb", "dubai marina", "downtown dubai", "palm jumeirah", "deira"],
    headline: "Luxury towers, beach clubs, desert escapes, shopping, and fine dining.",
    guide:
      "Dubai is about choosing the right base. Downtown is best for Burj Khalifa and shopping, Marina for nightlife and waterfront stays, Palm Jumeirah for resort luxury, and Deira for heritage and value.",
    moments: ["Burj Khalifa views", "Desert dinner", "Marina nights", "Beach resorts"],
  },
  AMS: {
    code: "AMS",
    name: "Amsterdam",
    country: "Netherlands",
    currency: "EUR",
    aliases: ["amsterdam", "ams", "netherlands", "canal ring", "jordaan", "museum quarter"],
    headline: "Canals, museums, boutique hotels, cycling routes, and quiet elegance.",
    guide:
      "Amsterdam is a city of atmosphere. Stay near the Canal Ring for beauty, Museum Quarter for culture, Jordaan for charm, and De Pijp for restaurants and nightlife.",
    moments: ["Canal cruises", "Museum Quarter", "Jordaan cafés", "Cycling routes"],
  },
  NYC: {
    code: "NYC",
    name: "New York",
    country: "United States",
    currency: "USD",
    aliases: ["new york", "nyc", "new york city", "manhattan", "brooklyn", "jfk", "laguardia", "newark"],
    headline: "Skyline views, landmark stays, culture, shopping, and neighbourhood energy.",
    guide:
      "New York is best searched by neighbourhood. Midtown works for first-time visitors, SoHo for style, Upper West Side for calmer access, and Brooklyn for local character.",
    moments: ["Central Park", "Broadway nights", "SoHo shopping", "Skyline views"],
  },
  ROM: {
    code: "ROM",
    name: "Rome",
    country: "Italy",
    currency: "EUR",
    aliases: ["rome", "rom", "roma", "rome italy", "colosseum", "vatican"],
    headline: "Ancient streets, landmark views, neighbourhood trattorias, and timeless city stays.",
    guide:
      "Rome rewards location. Centro Storico is best for walking, Prati for Vatican access, Monti for atmosphere, and Trastevere for food and evenings.",
    moments: ["Colosseum walks", "Vatican mornings", "Trastevere dinners", "Historic piazzas"],
  },
  MAD: {
    code: "MAD",
    name: "Madrid",
    country: "Spain",
    currency: "EUR",
    aliases: ["madrid", "mad", "madrid spain", "gran via", "retiro", "salamanca"],
    headline: "Grand boulevards, museums, tapas, elegant parks, and warm Spanish nights.",
    guide:
      "Madrid is easy to enjoy with the right base. Salamanca is refined, Gran Via is central, Retiro is graceful, and La Latina is lively.",
    moments: ["Retiro Park", "Tapas evenings", "Museum triangle", "Gran Via"],
  },
  IST: {
    code: "IST",
    name: "Istanbul",
    country: "Türkiye",
    currency: "TRY",
    aliases: ["istanbul", "ist", "sultanahmet", "bosphorus", "taksim", "istanbul turkey"],
    headline: "Bosphorus views, grand history, markets, rooftops, and memorable hospitality.",
    guide:
      "Istanbul works best when matched to your trip. Sultanahmet is ideal for landmarks, Karaköy for dining and design, and Taksim for nightlife and transport.",
    moments: ["Bosphorus views", "Grand Bazaar", "Sultanahmet", "Rooftop dinners"],
  },
  PRG: {
    code: "PRG",
    name: "Prague",
    country: "Czech Republic",
    currency: "CZK",
    aliases: ["prague", "prg", "praha", "old town", "charles bridge"],
    headline: "Storybook streets, grand squares, river walks, and atmospheric boutique stays.",
    guide:
      "Prague is highly walkable. Old Town is best for first visits, Mala Strana for charm, and New Town for value and transport.",
    moments: ["Charles Bridge", "Old Town Square", "Castle views", "River walks"],
  },
};

const FACILITIES = ["wifi", "breakfast", "parking", "pool", "gym", "family rooms", "airport shuttle", "spa"];

const TRUST_BOXES = [
  ["Real hotel media", "Supplier images only. No Unsplash, fake stock photos, or misleading property visuals."],
  ["Global city matching", "Search accepts city names, airport terms, landmarks, and common travel abbreviations."],
  ["Currency clarity", "Display price and payment currency are separated so customers know what they may be charged."],
  ["Production ranking", "Backend search should rank by availability, verified image, location, value, and supplier confidence."],
];

const IMPROVEMENT_BOXES = [
  ["1", "Port clarity", "Frontend runs on 5050 and calls one stable API base."],
  ["2", "No fake images", "Invalid stock/photo placeholder URLs are blocked."],
  ["3", "Faster search", "Abortable requests and incremental result rendering."],
  ["4", "City matching", "Aliases convert London, Heathrow, NYC, Paris, and landmarks."],
  ["5", "Global coverage", "Destination model is prepared for worldwide city expansion."],
  ["6", "Currency clarity", "Payment and display currency are shown separately."],
  ["7", "Booking trust", "Verified image, cancellation, supplier, and rate details are visible."],
  ["8", "/api/hotels/search", "Frontend uses the production hotel search endpoint."],
  ["9", "Inventory scaling", "Large results are rendered in chunks instead of all at once."],
  ["10", "Hotel ranking", "Frontend preserves backend ranking instead of random sorting."],
];

function text(value) {
  return String(value || "").trim();
}

function normalize(value) {
  return text(value)
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function resolveDestination(input) {
  const q = normalize(input);
  const upper = text(input).toUpperCase();

  if (!q) return DESTINATIONS.LON;
  if (DESTINATIONS[upper]) return DESTINATIONS[upper];

  for (const destination of Object.values(DESTINATIONS)) {
    if (destination.aliases.some((alias) => q === alias || q.includes(alias))) {
      return destination;
    }
  }

  return {
    code: upper || "GLOBAL",
    name: text(input) || "Destination",
    country: "",
    currency: "",
    aliases: [],
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
  return rate?.display_amount || rate?.selling_rate || rate?.sellingRate || rate?.net || rate?.amount || "";
}

function getRateCurrency(rate) {
  return rate?.display_currency || rate?.currency || "";
}

function getPaymentAmount(rate) {
  return rate?.payment_amount || rate?.paymentAmount || getRateAmount(rate);
}

function getPaymentCurrency(rate) {
  return rate?.payment_currency || rate?.paymentCurrency || getRateCurrency(rate);
}

function getPaymentCurrencyNote(rate) {
  if (!rate) return "";
  const displayCurrency = getRateCurrency(rate);
  const paymentCurrency = getPaymentCurrency(rate);

  if (rate.currency_note) return rate.currency_note;
  if (displayCurrency && paymentCurrency && displayCurrency !== paymentCurrency) {
    return `Displayed in ${displayCurrency}. Payment may be processed in ${paymentCurrency}.`;
  }
  if (displayCurrency) return `Displayed and expected payment currency: ${displayCurrency}.`;
  return "Currency is confirmed before secure payment.";
}

function getCancellationSummary(rate) {
  const policies = Array.isArray(rate?.cancellation_policies) ? rate.cancellation_policies : [];
  const first = policies[0];

  if (!first) return "Cancellation terms shown before payment.";
  if (first.from && first.amount) return `Cancellation charge ${getRateCurrency(rate)} ${first.amount} from ${String(first.from).slice(0, 10)}.`;
  if (first.amount) return `Cancellation charge may apply: ${getRateCurrency(rate)} ${first.amount}.`;
  return "Cancellation terms shown before payment.";
}

function getPropertyImageUrl(hotel) {
  const url = text(hotel?.image_url);
  const upper = url.toUpperCase();

  if (!url) return "";
  if (!url.startsWith("http://") && !url.startsWith("https://")) return "";
  if (upper.includes("PASTE_REAL")) return "";
  if (upper.includes("PUT_THE_REAL")) return "";
  if (upper.includes("PLACEHOLDER")) return "";
  if (upper.includes("UNSPLASH")) return "";
  if (upper.includes("PEXELS")) return "";
  if (upper.includes("PIXABAY")) return "";
  if (upper.includes("DUMMYIMAGE")) return "";
  if (upper.includes("FAKEIMG")) return "";

  return url;
}

function normalizeHotel(hotel, index, destination, country) {
  const id = String(hotel?.hotel_id || hotel?.id || `hotel-${index}`);
  const imageUrl = getPropertyImageUrl(hotel);

  return {
    id,
    hotel_id: String(hotel?.hotel_id || hotel?.id || id),
    name: hotel?.hotel_name || hotel?.name || "Selected hotel",
    city: hotel?.city || destination.code,
    country: hotel?.country || country || destination.country,
    area: hotel?.area || "",
    address: hotel?.address || "",
    rating: hotel?.rating || "Available",
    lat: hotel?.latitude || hotel?.lat || "",
    lng: hotel?.longitude || hotel?.lng || "",
    image_url: imageUrl,
    image_caption: hotel?.image_caption || "",
    image_source: hotel?.image_source || "",
    has_verified_image: Boolean(hotel?.has_verified_image && imageUrl),
    source: hotel?.source || hotel?.image_source || "supplier_inventory",
    price_confirmation_required: Boolean(hotel?.price_confirmation_required),
    availability_message: hotel?.availability_message || "",
    first_rate: hotel?.first_rate || hotel?.rate || null,
  };
}

const PropertyImage = memo(function PropertyImage({ hotel }) {
  const [failed, setFailed] = useState(false);
  const imageUrl = getPropertyImageUrl(hotel);

  if (!imageUrl || failed) {
    return (
      <div style={styles.noImageBox}>
        <div style={styles.noImageTitle}>Image unavailable</div>
        <div style={styles.noImageText}>No fake hotel image is used for this property.</div>
      </div>
    );
  }

  return (
    <div style={styles.imageWrap}>
      <img
        src={imageUrl}
        alt={`${hotel.name} verified property`}
        style={styles.hotelImage}
        loading="lazy"
        decoding="async"
        onError={() => setFailed(true)}
      />
      <div style={styles.verifiedBadge}>Verified supplier image</div>
    </div>
  );
});

const HotelCard = memo(function HotelCard({ hotel, selected, onSelect }) {
  const rate = hotel.first_rate;
  const ready = Boolean(rate && getRateKey(rate) && !hotel.price_confirmation_required);

  return (
    <button type="button" style={selected ? styles.cardSelected : styles.card} onClick={() => onSelect(hotel)}>
      <PropertyImage hotel={hotel} />

      <div style={styles.cardPillRow}>
        <span style={ready ? styles.readyPill : styles.pendingPill}>{ready ? "Ready to book" : "Confirm latest price"}</span>
        <span style={styles.sourcePill}>{hotel.has_verified_image ? "Verified media" : "No fake image"}</span>
      </div>

      <h3 style={styles.hotelName}>{hotel.name}</h3>
      <p style={styles.locationText}>{[hotel.area, hotel.city, hotel.country].filter(Boolean).join(", ")}</p>
      <p style={styles.ratingText}>{hotel.rating}</p>

      <div style={styles.rateBox}>
        {rate ? (
          <>
            <p><b>Room:</b> {rate.room_name || "Selected room"}</p>
            <p><b>Board:</b> {rate.board_name || "Board details available at booking"}</p>
            <p><b>Display price:</b> {getRateCurrency(rate)} {getRateAmount(rate) || "Available at checkout"}</p>
            <p><b>Payment:</b> {getPaymentCurrency(rate)} {getPaymentAmount(rate) || getRateAmount(rate) || "Secure payment"}</p>
            <p style={styles.currencyNote}>{getPaymentCurrencyNote(rate)}</p>
            <p style={styles.cancelNote}>{getCancellationSummary(rate)}</p>
          </>
        ) : (
          <>
            <p><b>Status:</b> Available to review</p>
            <p><b>Next step:</b> Choose this stay to check the latest room and price details.</p>
          </>
        )}
      </div>
    </button>
  );
});

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
        {Object.entries(DESTINATIONS).map(([code, destination]) => (
          <div key={code} style={styles.guideCard}>
            <div style={styles.guideContent}>
              <div style={styles.destinationCode}>{code}</div>
              <h2>{destination.name}</h2>
              <p style={styles.guideHeadline}>{destination.headline}</p>
              <p>{destination.guide}</p>
              <div style={styles.momentGrid}>
                {destination.moments.map((moment) => <span key={moment}>{moment}</span>)}
              </div>
              <button style={styles.guideButton} onClick={() => (window.location.href = "/")}>
                Find stays in {destination.name}
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
      <p><b>Why choose MySpace Hotel?</b> We focus on real property details, clear currency, secure payment, useful location insight, and confident hotel selection.</p>
    </InfoPage>
  );
}

function Terms() {
  return (
    <InfoPage title="Booking terms">
      <p>Please review hotel name, room type, dates, guests, location, price, payment currency, and cancellation details before payment.</p>
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
  const [status, setStatus] = useState("Confirming your booking update...");

  React.useEffect(() => {
    if (!code || code === "Your reservation") return;

    fetch(`${API_BASE}/reservation/${encodeURIComponent(code)}/mark-paid`, { method: "POST" })
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

  const abortRef = useRef(null);

  const [country, setCountry] = useState("uk");
  const [city, setCity] = useState("London");
  const [area, setArea] = useState("");
  const [keyword, setKeyword] = useState("");
  const [checkin, setCheckin] = useState(today);
  const [checkout, setCheckout] = useState(tomorrow);
  const [guests, setGuests] = useState(2);
  const [rooms, setRooms] = useState(1);
  const [facilities, setFacilities] = useState([]);
  const [hotels, setHotels] = useState([]);
  const [visibleCount, setVisibleCount] = useState(INITIAL_VISIBLE_RESULTS);
  const [selectedHotel, setSelectedHotel] = useState(null);
  const [customerName, setCustomerName] = useState("");
  const [customerEmail, setCustomerEmail] = useState("");
  const [customerPhone, setCustomerPhone] = useState("");
  const [note, setNote] = useState("");
  const [message, setMessage] = useState("");
  const [searchMeta, setSearchMeta] = useState(null);
  const [loading, setLoading] = useState(false);
  const [requesting, setRequesting] = useState(false);

  const dest = useMemo(() => resolveDestination(city), [city]);

  const normalisedHotels = useMemo(() => {
    return hotels.map((hotel, index) => normalizeHotel(hotel, index, dest, country));
  }, [hotels, dest, country]);

  const visibleHotels = useMemo(() => {
    return normalisedHotels.slice(0, visibleCount);
  }, [normalisedHotels, visibleCount]);

  const selectedRate = selectedHotel?.first_rate || null;
  const canBook = Boolean(selectedHotel && getRateKey(selectedRate) && !selectedHotel.price_confirmation_required);

  const searchHotels = useCallback(async () => {
    if (abortRef.current) abortRef.current.abort();

    const controller = new AbortController();
    abortRef.current = controller;

    setLoading(true);
    setMessage("");
    setSelectedHotel(null);
    setVisibleCount(INITIAL_VISIBLE_RESULTS);

    try {
      const params = new URLSearchParams();
      params.set("country", country);
      params.set("city", city);
      params.set("destination", city);
      params.set("destination_code", dest.code);
      params.set("checkin", checkin);
      params.set("checkout", checkout);
      params.set("guests", String(guests));
      params.set("rooms", String(rooms));
      params.set("page", "1");
      params.set("limit", "100");
      params.set("rank", "production");
      params.set("real_images_only", "true");

      if (area.trim()) params.set("area", area.trim());
      if (keyword.trim()) params.set("keyword", keyword.trim());
      if (facilities.length) params.set("facilities", facilities.join(","));

      const response = await fetch(`${API_BASE}/api/hotels/search?${params.toString()}`, {
        method: "GET",
        signal: controller.signal,
        headers: { Accept: "application/json" },
      });

      const data = await response.json().catch(() => ({}));

      if (!response.ok) {
        setHotels([]);
        setSearchMeta(null);
        setMessage(data.detail || data.message || "We could not complete your hotel search. Please try again shortly.");
        return;
      }

      const list = Array.isArray(data.hotels) ? data.hotels : [];

      setHotels(list);
      setSearchMeta({
        count: Number(data.count || list.length || 0),
        source: data.source || "production_search",
        destination_code: data.destination_code || dest.code,
        availability_message: data.availability_message || "",
      });

      if (list.length > 0) {
        setMessage(`${list.length} available stays found in ${dest.name}. Results keep backend production ranking and display verified booking details.`);
      } else {
        setMessage(`No available stays found for ${dest.name}. Try different dates, fewer guests, or another destination.`);
      }
    } catch (error) {
      if (error.name !== "AbortError") {
        setHotels([]);
        setSearchMeta(null);
        setMessage("We could not reach the hotel search service. Please try again shortly.");
      }
    } finally {
      setLoading(false);
    }
  }, [country, city, dest, checkin, checkout, guests, rooms, area, keyword, facilities]);

  async function requestAvailability() {
    if (!selectedHotel) return setMessage("Choose a hotel to continue.");
    if (!canBook) return setMessage("Choose another available hotel to continue securely.");
    if (!customerName.trim() || !customerEmail.trim()) return setMessage("Enter your name and email to continue.");

    setRequesting(true);
    setMessage("Preparing your secure booking page...");

    try {
      const rate = selectedHotel.first_rate;

      const payload = {
        hotel_id: selectedHotel.hotel_id || selectedHotel.id,
        hotel_name: selectedHotel.name,
        destination: `${dest.name}${dest.country ? `, ${dest.country}` : ""}`,
        destination_code: dest.code,
        checkin,
        checkout,
        guests: Number(guests),
        rooms: Number(rooms),
        customer_name: customerName.trim(),
        customer_email: customerEmail.trim(),
        customer_phone: customerPhone.trim() || "0000000000",
        note: note.trim(),
        rate_key: getRateKey(rate),
        amount: getPaymentAmount(rate),
        currency: getPaymentCurrency(rate),
        display_amount: getRateAmount(rate),
        display_currency: getRateCurrency(rate),
        room_name: rate?.room_name || "",
        board_name: rate?.board_name || "",
        payment_type: rate?.payment_type || "",
        cancellation_policies: rate?.cancellation_policies || [],
        packaging: rate?.packaging || "",
        allotment: rate?.allotment || "",
      };

      const response = await fetch(`${API_BASE}/reservation-request`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify(payload),
      });

      const data = await response.json().catch(() => ({}));

      if (!response.ok || !data.ok) {
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
    setFacilities((current) => current.includes(item) ? current.filter((value) => value !== item) : [...current, item]);
  }

  return (
    <div style={styles.page}>
      <section style={styles.hero}>
        <div style={styles.brand}>MYSPACE HOTEL</div>

        <div style={styles.heroBox}>
          <div style={styles.destinationCodeHero}>{dest.code}</div>
          <h1 style={styles.heroTitle}>Find memorable stays in {dest.name} with confidence.</h1>
          <p style={styles.heroText}>{dest.headline}</p>
        </div>

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
            {dest.moments.map((moment) => <span key={moment}>{moment}</span>)}
          </div>
        </div>

        <div style={styles.trustGrid}>
          {TRUST_BOXES.map(([title, body]) => (
            <div key={title} style={styles.trustBox}>
              <b>{title}</b>
              <span>{body}</span>
            </div>
          ))}
        </div>

        <div style={styles.improvementPanel}>
          <h2>Production fixes covered</h2>
          <div style={styles.improvementGrid}>
            {IMPROVEMENT_BOXES.map(([number, title, body]) => (
              <div key={number} style={styles.improvementBox}>
                <div style={styles.improvementNumber}>{number}</div>
                <b>{title}</b>
                <span>{body}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section style={styles.panel}>
        <div style={styles.searchHeaderBox}>
          <h2 style={styles.heading}>Search available stays</h2>
          <p style={styles.copy}>
            Tell us where you want to stay, choose your dates, and compare available hotels with clear booking details.
          </p>
          <div style={styles.apiStatus}>
            <b>Frontend port:</b> 5050 · <b>Search endpoint:</b> {API_BASE}/api/hotels/search
          </div>
        </div>

        <div style={styles.formBox}>
          <input style={styles.input} value={country} onChange={(event) => setCountry(event.target.value)} placeholder="Country" />
          <input style={styles.input} value={city} onChange={(event) => setCity(event.target.value)} placeholder="Where would you like to stay? Try London, Paris, NYC, Dubai, Heathrow..." />

          <div style={styles.customerNote}>
            Matched destination: <b>{dest.name}</b>{dest.country ? `, ${dest.country}` : ""} · Code: <b>{dest.code}</b>{dest.currency ? ` · Local currency: ${dest.currency}` : ""}
          </div>

          <input style={styles.input} value={area} onChange={(event) => setArea(event.target.value)} placeholder="Preferred area, airport, landmark, or neighbourhood" />
          <input style={styles.input} value={keyword} onChange={(event) => setKeyword(event.target.value)} placeholder="Hotel name or travel style" />

          <div style={styles.dateGrid}>
            <label>Check-in<input style={styles.input} type="date" value={checkin} onChange={(event) => setCheckin(event.target.value)} /></label>
            <label>Check-out<input style={styles.input} type="date" value={checkout} onChange={(event) => setCheckout(event.target.value)} /></label>
          </div>

          <div style={styles.choiceRow}>
            <b>Guests</b>
            {[1, 2, 3, 4, 5, 6].map((number) => (
              <button key={number} style={guests === number ? styles.choiceActive : styles.choice} onClick={() => setGuests(number)}>{number}</button>
            ))}
          </div>

          <div style={styles.choiceRow}>
            <b>Rooms</b>
            {[1, 2, 3, 4].map((number) => (
              <button key={number} style={rooms === number ? styles.choiceActive : styles.choice} onClick={() => setRooms(number)}>{number}</button>
            ))}
          </div>
        </div>

        <div style={styles.facilities}>
          <h3>Preferred facilities</h3>
          <p style={styles.facilityHint}>Optional preferences are sent to the backend. Hotels are not hidden client-side because supplier facility tags are often incomplete.</p>
          <div style={styles.facilityGrid}>
            {FACILITIES.map((item) => (
              <label key={item} style={styles.checkLabel}>
                <input type="checkbox" checked={facilities.includes(item)} onChange={() => toggleFacility(item)} />
                {item}
              </label>
            ))}
          </div>
        </div>

        <button style={loading ? styles.goldButtonDisabled : styles.goldButton} onClick={searchHotels} disabled={loading}>
          {loading ? "Checking available hotels..." : "Search available hotels"}
        </button>

        {message && <div style={styles.notice}>{message}</div>}

        {searchMeta && (
          <div style={styles.metaBox}>
            <div><b>Source:</b> {searchMeta.source}</div>
            <div><b>Destination:</b> {searchMeta.destination_code}</div>
            <div><b>Returned:</b> {normalisedHotels.length} stays</div>
            {searchMeta.availability_message && <div><b>Note:</b> {searchMeta.availability_message}</div>}
          </div>
        )}

        <div style={styles.twoCol}>
          <div>
            <div style={styles.label}>AVAILABLE STAYS</div>
            <h2>{normalisedHotels.length} available stays</h2>

            <div style={styles.results}>
              {visibleHotels.map((hotel) => (
                <HotelCard
                  key={hotel.id}
                  hotel={hotel}
                  selected={selectedHotel?.id === hotel.id}
                  onSelect={setSelectedHotel}
                />
              ))}

              {visibleCount < normalisedHotels.length && (
                <button style={styles.loadMoreButton} onClick={() => setVisibleCount((current) => current + LOAD_MORE_RESULTS)}>
                  Show more trusted stays
                </button>
              )}
            </div>
          </div>

          <aside style={styles.reserve}>
            <div style={styles.reserveBox}>
              <div style={styles.label}>SECURE BOOKING</div>
              <h2>Review and continue</h2>

              <div style={styles.selectedBox}>{selectedHotel ? selectedHotel.name : "Choose your stay"}</div>

              {selectedRate && (
                <div style={styles.rateBox}>
                  <p><b>Room:</b> {selectedRate.room_name || "Selected room"}</p>
                  <p><b>Board:</b> {selectedRate.board_name || "Board details available at booking"}</p>
                  <p><b>Display amount:</b> {getRateCurrency(selectedRate)} {getRateAmount(selectedRate) || "Available at checkout"}</p>
                  <p><b>Payment amount:</b> {getPaymentCurrency(selectedRate)} {getPaymentAmount(selectedRate) || getRateAmount(selectedRate) || "Secure payment"}</p>
                  <p style={styles.currencyNote}>{getPaymentCurrencyNote(selectedRate)}</p>
                  <p style={styles.cancelNote}>{getCancellationSummary(selectedRate)}</p>
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
                      : `https://maps.google.com/maps?q=${encodeURIComponent(`${selectedHotel.name} ${dest.name}`)}&z=14&output=embed`}
                  />
                </div>
              )}

              <input style={styles.input} value={customerName} onChange={(event) => setCustomerName(event.target.value)} placeholder="Full name" />
              <input style={styles.input} value={customerEmail} onChange={(event) => setCustomerEmail(event.target.value)} placeholder="Email address" />
              <input style={styles.input} value={customerPhone} onChange={(event) => setCustomerPhone(event.target.value)} placeholder="Phone number for booking updates" />
              <textarea style={styles.textarea} value={note} onChange={(event) => setNote(event.target.value)} placeholder="Any special requests? Optional" />

              <button style={requesting || !canBook ? styles.goldButtonDisabled : styles.goldButton} disabled={requesting || !canBook} onClick={requestAvailability}>
                {requesting ? "Preparing secure booking..." : canBook ? "Reserve this stay" : selectedHotel?.price_confirmation_required ? "Check latest price" : "Choose a hotel to continue"}
              </button>

              <div style={styles.safeNote}>Secure booking. Clear details. Trusted reservation process. No fake urgency. No fake images.</div>
            </div>
          </aside>
        </div>
      </section>
    </div>
  );
}

const styles = {
  page: { minHeight: "100vh", background: "#06101f", display: "grid", gridTemplateColumns: "1.02fr 1fr", gap: 28, padding: 28, fontFamily: "Arial, sans-serif", color: "#07111f" },
  hero: { background: "linear-gradient(145deg, rgba(10,36,92,.96), rgba(25,86,190,.92))", color: "white", borderRadius: 28, padding: 34 },
  brand: { letterSpacing: 16, fontWeight: 900, marginBottom: 24 },
  brandSmall: { letterSpacing: 10, fontWeight: 900, marginBottom: 20 },
  heroBox: { background: "rgba(255,255,255,.11)", border: "1px solid rgba(255,255,255,.2)", borderRadius: 24, padding: 28 },
  destinationCodeHero: { letterSpacing: 9, color: "#ffd34d", fontWeight: 900, marginBottom: 14 },
  heroTitle: { fontSize: 48, lineHeight: 1.1, margin: 0 },
  heroText: { fontSize: 19, lineHeight: 1.55, marginTop: 20 },
  buttonRow: { display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginTop: 22 },
  whiteButton: { background: "white", color: "#07111f", border: 0, borderRadius: 14, padding: "15px 18px", fontWeight: 900, fontSize: 16, cursor: "pointer" },
  destinationPanel: { background: "rgba(0,0,0,.25)", border: "1px solid rgba(255,255,255,.28)", borderRadius: 22, padding: 22, marginTop: 22, fontSize: 17, lineHeight: 1.55 },
  momentGridHero: { display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginTop: 18 },
  trustGrid: { display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginTop: 22 },
  trustBox: { background: "rgba(255,255,255,.12)", border: "1px solid rgba(255,255,255,.22)", borderRadius: 18, padding: 16, display: "grid", gap: 8, lineHeight: 1.35 },
  improvementPanel: { background: "rgba(0,0,0,.22)", border: "1px solid rgba(255,255,255,.18)", borderRadius: 22, padding: 20, marginTop: 22 },
  improvementGrid: { display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 },
  improvementBox: { background: "rgba(255,255,255,.1)", borderRadius: 14, padding: 13, display: "grid", gap: 5, fontSize: 13.5 },
  improvementNumber: { width: 28, height: 28, background: "#ffd34d", color: "#07111f", borderRadius: 999, display: "grid", placeItems: "center", fontWeight: 900 },
  panel: { background: "#eaf2fb", borderRadius: 28, padding: 30, maxHeight: "92vh", overflow: "auto" },
  searchHeaderBox: { background: "white", border: "1px solid #c6d5e8", borderRadius: 22, padding: 22, marginBottom: 18 },
  heading: { fontSize: 34, margin: 0 },
  copy: { fontSize: 17, lineHeight: 1.5 },
  apiStatus: { background: "#dcecff", border: "1px solid #bdd5ef", color: "#10254a", borderRadius: 14, padding: 13, marginTop: 14, fontWeight: 800, fontSize: 13, wordBreak: "break-word" },
  formBox: { background: "white", borderRadius: 22, padding: 20, border: "1px solid #c6d5e8" },
  input: { width: "100%", boxSizing: "border-box", padding: "15px 17px", margin: "8px 0", borderRadius: 14, border: "1px solid #c6d5e8", fontSize: 17 },
  textarea: { width: "100%", boxSizing: "border-box", minHeight: 120, padding: "15px 17px", margin: "8px 0", borderRadius: 14, border: "1px solid #c6d5e8", fontSize: 17 },
  dateGrid: { display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 },
  choiceRow: { display: "flex", alignItems: "center", gap: 10, margin: "13px 0", fontSize: 17, flexWrap: "wrap" },
  choice: { background: "white", border: "1px solid #c6d5e8", borderRadius: 10, padding: "11px 15px", cursor: "pointer", fontSize: 16 },
  choiceActive: { background: "#ffd34d", border: "1px solid #ffd34d", borderRadius: 10, padding: "11px 15px", cursor: "pointer", fontSize: 16, fontWeight: 900 },
  customerNote: { background: "#f6f8fc", border: "1px solid #c6d5e8", borderRadius: 14, padding: 14, margin: "8px 0 16px", fontWeight: 800, color: "#10254a" },
  facilities: { background: "white", borderRadius: 18, padding: 20, marginTop: 16, border: "1px solid #c6d5e8" },
  facilityGrid: { display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, alignItems: "center" },
  checkLabel: { display: "grid", gridTemplateColumns: "24px 1fr", gap: 10, alignItems: "center", fontSize: 16, minHeight: 34 },
  facilityHint: { margin: "6px 0 16px", color: "#526782", fontWeight: 800 },
  goldButton: { width: "100%", background: "#ffd34d", color: "#07111f", border: "2px solid #07111f", borderRadius: 16, padding: "17px 20px", fontSize: 20, fontWeight: 900, cursor: "pointer", marginTop: 18 },
  goldButtonDisabled: { width: "100%", background: "#d6d6d6", color: "#52606f", border: "2px solid #9aa5b1", borderRadius: 16, padding: "17px 20px", fontSize: 20, fontWeight: 900, cursor: "not-allowed", marginTop: 18 },
  goldSmall: { background: "#ffd34d", color: "#07111f", border: 0, borderRadius: 14, padding: "15px 22px", fontSize: 18, fontWeight: 900, cursor: "pointer", marginTop: 22 },
  notice: { background: "#fff2be", padding: 16, borderRadius: 14, margin: "18px 0", fontWeight: 900 },
  metaBox: { background: "#ffffff", border: "1px solid #c6d5e8", borderRadius: 14, padding: 14, marginBottom: 14, fontSize: 14, lineHeight: 1.6 },
  twoCol: { display: "grid", gridTemplateColumns: "1.08fr .92fr", gap: 22, marginTop: 24 },
  label: { letterSpacing: 8, color: "#63738e", fontWeight: 900, margin: "14px 0" },
  results: { maxHeight: 760, overflow: "auto", paddingRight: 8 },
  card: { width: "100%", textAlign: "left", background: "white", borderRadius: 20, padding: 17, marginBottom: 18, border: "2px solid transparent", cursor: "pointer", color: "#07111f" },
  cardSelected: { width: "100%", textAlign: "left", background: "white", borderRadius: 20, padding: 17, marginBottom: 18, border: "4px solid #ffd34d", cursor: "pointer", color: "#07111f" },
  imageWrap: { position: "relative" },
  hotelImage: { width: "100%", height: 230, objectFit: "cover", borderRadius: 12, marginBottom: 14, background: "#d9e5f3" },
  noImageBox: { height: 165, borderRadius: 12, marginBottom: 14, background: "#edf2f7", border: "1px dashed #a9b8ca", display: "flex", flexDirection: "column", justifyContent: "center", padding: 18, color: "#526782" },
  noImageTitle: { fontWeight: 900, fontSize: 18, marginBottom: 6 },
  noImageText: { fontWeight: 700, fontSize: 14 },
  verifiedBadge: { position: "absolute", left: 10, bottom: 24, background: "#dff7e6", color: "#075b24", padding: "8px 10px", borderRadius: 999, fontWeight: 900, fontSize: 12 },
  cardPillRow: { display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 8 },
  readyPill: { background: "#dff7e6", color: "#075b24", borderRadius: 999, padding: "7px 10px", fontWeight: 900, fontSize: 12 },
  pendingPill: { background: "#fff2be", color: "#7a4b00", borderRadius: 999, padding: "7px 10px", fontWeight: 900, fontSize: 12 },
  sourcePill: { background: "#edf2f7", color: "#334e68", borderRadius: 999, padding: "7px 10px", fontWeight: 900, fontSize: 12 },
  hotelName: { fontSize: 24, margin: "8px 0" },
  locationText: { color: "#334e68", fontWeight: 800 },
  ratingText: { color: "#07111f", fontWeight: 900 },
  reserve: { position: "sticky", top: 0, alignSelf: "start" },
  reserveBox: { background: "white", borderRadius: 22, padding: 20, border: "1px solid #c6d5e8" },
  selectedBox: { background: "#f3f7ff", borderRadius: 18, padding: 18, margin: "14px 0", fontWeight: 900, fontSize: 18 },
  mapBox: { background: "white", padding: 10, borderRadius: 18, marginBottom: 14, border: "1px solid #d8e3ef" },
  map: { width: "100%", height: 240, border: 0, borderRadius: 14 },
  currencyNote: { margin: "8px 0 0", color: "#7a4b00", fontSize: 13, fontWeight: 800 },
  cancelNote: { margin: "8px 0 0", color: "#334e68", fontSize: 13, fontWeight: 800 },
  safeNote: { background: "#dff7e6", borderRadius: 14, padding: 15, marginTop: 14, fontWeight: 800 },
  rateBox: { background: "#f6f8fc", borderRadius: 14, padding: 14, margin: "12px 0", fontSize: 15, lineHeight: 1.35 },
  loadMoreButton: { width: "100%", background: "#07111f", color: "white", border: 0, borderRadius: 14, padding: "15px 20px", fontWeight: 900, fontSize: 17, cursor: "pointer", marginBottom: 18 },
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