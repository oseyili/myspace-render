import React, { useEffect, useMemo, useState } from "react";
import ExperiencePage from "./ExperiencePage";
const API_BASE =
  import.meta.env.VITE_API_BASE ||
  import.meta.env.VITE_API_BASE_URL ||
  "http://127.0.0.1:5050";

const STRIPE_PAYMENT_LINK =
  import.meta.env.VITE_STRIPE_PAYMENT_LINK ||
  import.meta.env.VITE_PUBLIC_STRIPE_PAYMENT_LINK ||
  "";

const KLOOK_WIDGET_SCRIPT = "https://affiliate.klook.com/widget/fetch-iframe-init.js";

const KLOOK_DYNAMIC_WIDGETS = {
  GLOBAL: "1293547",
  Paris: "1293547",
};

const ROUTES = {
  hotels: "/",
  compare: "/#/compare-prices",
  guide: "/#/destination-guide",
  about: "/#/about-us",
  faq: "/#/faq",
  reviews: "/#/guest-reviews",
  support: "/#/support-centre",
  partners: "/#/industry-partnerships",
  insurance: "/#/insurance",
  transfers: "/#/transfers",
  attractions: "/#/attractions",
experiences: "/#/experiences",
  featured: "/#/featured-hotels",
  affiliates: "/#/affiliate-network",
  business: "/#/business-portal",
};

const FX = {
  GBP: 1,
  USD: 1.27,
  EUR: 1.17,
  AED: 4.66,
  NGN: 1900,
  CAD: 1.73,
  AUD: 1.93,
  JPY: 199,
};

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

function tomorrowISO() {
  return new Date(Date.now() + 86400000).toISOString().slice(0, 10);
}

function money(v) {
  const n = Number(v || 0);
  return Number.isFinite(n)
    ? n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })
    : "0.00";
}

function nightsBetween(a, b) {
  const start = new Date(a);
  const end = new Date(b);
  const diff = Math.ceil((end - start) / 86400000);
  return Number.isFinite(diff) && diff > 0 ? diff : 1;
}

function routeUrl(path) {
  return path;
}

function mapSearch(type, query) {
  return `https://www.google.com/maps/search/${encodeURIComponent(`${type} near ${query}`)}`;
}

function currentRoute() {
  const hash = window.location.hash || "";
  if (hash === "#/compare-prices") return "compare";
  if (hash === "#/destination-guide") return "guide";
  if (hash === "#/about-us") return "about";
  if (hash === "#/faq") return "faq";
  if (hash === "#/guest-reviews") return "reviews";
  if (hash === "#/support-centre") return "support";
  if (hash === "#/industry-partnerships") return "partners";
  if (hash === "#/insurance") return "insurance";
  if (hash === "#/transfers") return "transfers";
  if (hash === "#/attractions") return "attractions";
if (hash === "#/experiences") return "experiences";
  if (hash === "#/featured-hotels") return "featured";
  if (hash === "#/affiliate-network") return "affiliates";
  if (hash === "#/business-portal") return "business";
  return "hotels";
}

function convertCurrency(amount, from, to) {
  const base = Number(amount || 0) / (FX[from] || 1);
  return base * (FX[to] || 1);
}

function safeNumber(v) {
  const n = Number(v || 0);
  return Number.isFinite(n) ? n : 0;
}

function hotelKey(hotel) {
  return hotel?.hotelId || hotel?.hotel_id || hotel?.id || hotel?.code || hotel?.name || "";
}

function hotelPrice(hotel) {
  return safeNumber(
    hotel?.selectedRoom?.convertedPrice ||
      hotel?.selectedRoom?.price ||
      hotel?.price ||
      hotel?.amount ||
      hotel?.nightly_rate ||
      hotel?.rate ||
      hotel?.rooms?.[0]?.convertedPrice ||
      hotel?.rooms?.[0]?.price ||
      0
  );
}

function hotelCurrency(hotel, fallback = "GBP") {
  return (
    hotel?.selectedRoom?.displayCurrency ||
    hotel?.currency ||
    hotel?.displayCurrency ||
    hotel?.rooms?.[0]?.displayCurrency ||
    fallback
  );
}

function hotelRoomCode(hotel) {
  return hotel?.selectedRoom?.roomCode || hotel?.rooms?.[0]?.roomCode || hotel?.roomCode || "STANDARD";
}

function hotelRoomName(hotel) {
  return hotel?.selectedRoom?.roomName || hotel?.rooms?.[0]?.roomName || hotel?.roomName || "Available room";
}

function hotelRateSourceId(hotel) {
  return hotel?.selectedRoom?.rate_source_id || hotel?.rate_source_id || hotel?.rooms?.[0]?.rate_source_id || "";
}

function hotelRateSourceTimestamp(hotel) {
  return (
    hotel?.selectedRoom?.rate_source_timestamp ||
    hotel?.rate_source_timestamp ||
    hotel?.rooms?.[0]?.rate_source_timestamp ||
    ""
  );
}

function cleanList(list) {
  return Array.from(new Set((list || []).map((x) => String(x || "").trim()).filter(Boolean))).sort((a, b) =>
    a.localeCompare(b)
  );
}

function normaliseCityName(value) {
  return String(value || "")
    .trim()
    .replace(/\s+/g, " ")
    .replace(/[^\w\s-]/g, "");
}

function klookAdIdForCity(city) {
  const clean = normaliseCityName(city);
  return KLOOK_DYNAMIC_WIDGETS[clean] || KLOOK_DYNAMIC_WIDGETS.GLOBAL;
}

function buildComparisons(selectedHotel, hotels, nights, rooms, fallbackCurrency) {
  if (!selectedHotel) return [];

  const baseNight = hotelPrice(selectedHotel);
  const currency = hotelCurrency(selectedHotel, fallbackCurrency);
  const stayMultiplier = Math.max(1, Number(nights || 1)) * Math.max(1, Number(rooms || 1));
  const selectedName = selectedHotel.name || "Selected hotel";

  const selectedOptions = [
    {
      id: "best-value",
      hotelName: selectedName,
      label: "Best value stay",
      text: "Clear price review before secure checkout.",
      badge: "Best value",
      currency,
      total: baseNight * stayMultiplier,
    },
    {
      id: "flexible",
      hotelName: selectedName,
      label: "Flexible stay option",
      text: "A useful comparison for guests who want extra flexibility.",
      badge: "Flexible",
      currency,
      total: baseNight * 1.08 * stayMultiplier,
    },
    {
      id: "comfort",
      hotelName: selectedName,
      label: "Extra comfort stay",
      text: "A higher-comfort comparison for longer or special trips.",
      badge: "Comfort",
      currency,
      total: baseNight * 1.16 * stayMultiplier,
    },
  ];

  const alternatives = (hotels || [])
    .filter((h) => hotelKey(h) !== hotelKey(selectedHotel))
    .slice(0, 4)
    .map((hotel, idx) => {
      const price = hotelPrice(hotel);
      return {
        id: `alt-${hotelKey(hotel) || idx}`,
        hotelName: hotel.name || "Nearby hotel",
        label: idx === 0 ? "Nearby alternative" : "Destination alternative",
        text: `${hotel.city || selectedHotel.city || "Destination"}, ${hotel.country || selectedHotel.country || ""}`,
        badge: "Compare",
        currency: hotelCurrency(hotel, currency),
        total: price * stayMultiplier,
      };
    });

  return [...selectedOptions, ...alternatives];
}

function validHotelImage(hotel) {
  const image = hotel?.image || hotel?.image_url || hotel?.photo || hotel?.thumbnail;
  return typeof image === "string" && image.startsWith("http") ? image : "";
}

function selectedHotelWithRoom(hotel) {
  const firstRoom = Array.isArray(hotel?.rooms) && hotel.rooms.length ? hotel.rooms[0] : null;

  return {
    ...hotel,
    selectedRoom: firstRoom,
    price: safeNumber(firstRoom?.convertedPrice || firstRoom?.price || hotel?.price || 0),
    currency: firstRoom?.displayCurrency || hotel?.currency || "GBP",
    roomCode: firstRoom?.roomCode || hotel?.roomCode || "STANDARD",
    roomName: firstRoom?.roomName || hotel?.roomName || "Available room",
    rate_source_id: firstRoom?.rate_source_id || hotel?.rate_source_id || "",
    rate_source_timestamp: firstRoom?.rate_source_timestamp || hotel?.rate_source_timestamp || "",
  };
}

function KlookDynamicWidget({ city, country }) {
  const destinationLabel = [city, country].filter(Boolean).join(", ") || "your destination";
  const klookAid = "";
  const getYourGuidePartnerId = "";

  const openKlookExperiences = () => {
    const query = encodeURIComponent(destinationLabel + " tours attractions experiences");
    window.open(
      "https://www.klook.com/en-US/search/result/?query=" + query + "&aid=" + encodeURIComponent(klookAid),
      "_blank",
      "noopener,noreferrer"
    );
  };

  const openGetYourGuideExperiences = () => {
    const query = encodeURIComponent(destinationLabel + " tours attractions experiences");
    window.open(
      "https://www.getyourguide.com/s/?q=" + query + "&partner_id=" + encodeURIComponent(getYourGuidePartnerId),
      "_blank",
      "noopener,noreferrer"
    );
  };

  return (
    <section style={styles.klookPanel}>
      <div style={styles.panelHeader}>
        <div>
          <div style={styles.kicker}>Recommended Experiences</div>
          <h2 style={styles.titleSmall}>Explore More In {destinationLabel}</h2>
          <p style={styles.sectionText}>
            Discover selected tours, attractions, transfers and local experiences for the city chosen for your stay.
          </p>
        </div>
      </div>

      <div style={styles.customerReminderBox}>
        Your hotel choice remains saved on MySpace Hotel while you explore experiences for your trip.
      </div>

      <div style={{
        background: "#ffffff",
        border: "1px solid #d9efe9",
        borderRadius: 24,
        padding: 24,
        boxShadow: "0 10px 28px rgba(0,0,0,.06)"
      }}>
        <h3 style={{ margin: "0 0 8px", fontSize: 22, color: "#0f172a" }}>
          Experiences in {destinationLabel}
        </h3>

        <p style={{ margin: "0 0 18px", color: "#475569", lineHeight: 1.6 }}>
          Open city-matched activities through MySpace Hotel affiliate partners.
        </p>

        <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
          <button
            type="button"
            onClick={openKlookExperiences}
            style={{
              background: "#007f7a",
              color: "#ffffff",
              border: 0,
              borderRadius: 14,
              padding: "14px 22px",
              fontWeight: 900,
              cursor: "pointer"
            }}
          >
            View city experiences
          </button>

          <button
            type="button"
            onClick={openGetYourGuideExperiences}
            style={{
              background: "#0f172a",
              color: "#ffffff",
              border: 0,
              borderRadius: 14,
              padding: "14px 22px",
              fontWeight: 900,
              cursor: "pointer"
            }}
          >
            More tours and tickets
          </button>
        </div>
      </div>
    </section>
  );
}

export default function App() {
  useEffect(() => {
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.register("/sw.js").catch(() => {});
    }
  }, []);
const [route, setRoute] = useState(currentRoute());
const [currentPage, setCurrentPage] = useState("home");

  const [affiliateCode, setAffiliateCode] = useState("");
  const [countries, setCountries] = useState([]);
  const [cities, setCities] = useState([]);
  const [country, setCountry] = useState("");
  const [city, setCity] = useState("");
  const [checkIn, setCheckIn] = useState(todayISO());
  const [checkOut, setCheckOut] = useState(tomorrowISO());
  const [guests, setGuests] = useState(2);
  const [rooms, setRooms] = useState(1);
  const [currency, setCurrency] = useState("GBP");
  const [hotels, setHotels] = useState([]);
  const [selectedHotel, setSelectedHotel] = useState(() => {
    try {
      const saved = localStorage.getItem("msh_selected_hotel");
      return saved ? JSON.parse(saved) : null;
    } catch {
      return null;
    }
  });
  const [notice, setNotice] = useState("");
  const [loading, setLoading] = useState(false);
  const [paying, setPaying] = useState(false);
  const [liveRateLoading, setLiveRateLoading] = useState(false);
  const [liveRateNotice, setLiveRateNotice] = useState("");

  const [customerName, setCustomerName] = useState("");
  const [customerEmail, setCustomerEmail] = useState("");
  const [customerPhone, setCustomerPhone] = useState("");
  const [specialRequests, setSpecialRequests] = useState("");

  const [fxAmount, setFxAmount] = useState(100);
  const [fxFrom, setFxFrom] = useState("GBP");
  const [fxTo, setFxTo] = useState("USD");

  const [reviewSent, setReviewSent] = useState(false);
  const [partnerSent, setPartnerSent] = useState(false);

  useEffect(() => {
    try {
      const params = new URLSearchParams(window.location.search || "");
      const ref = String(params.get("ref") || "").trim().toUpperCase();

      if (ref) {
        localStorage.setItem("msh_affiliate_code", ref);
        setAffiliateCode(ref);
        window.history.replaceState({}, document.title, window.location.pathname + window.location.hash);
      } else {
        const savedRef = String(localStorage.getItem("msh_affiliate_code") || "").trim().toUpperCase();
        if (savedRef) setAffiliateCode(savedRef);
      }
    } catch {}

    const onHashChange = () => setRoute(currentRoute());
    window.addEventListener("hashchange", onHashChange);
    onHashChange();
    return () => window.removeEventListener("hashchange", onHashChange);
  }, []);

  useEffect(() => {
    loadDestinations();
  }, []);

  useEffect(() => {
    const found = countries.find((x) => x.country === country);
    setCities(cleanList(found?.cities || []));
    setCity("");
    setHotels([]);
    setSelectedHotel(null);
  }, [country, countries]);

  const nights = useMemo(() => nightsBetween(checkIn, checkOut), [checkIn, checkOut]);
  const selectedNightPrice = hotelPrice(selectedHotel);
  const selectedCurrency = hotelCurrency(selectedHotel, currency);
  const selectedRoomCode = hotelRoomCode(selectedHotel);
  const selectedRoomName = hotelRoomName(selectedHotel);
  const selectedRateSourceId = hotelRateSourceId(selectedHotel);
  const selectedRateSourceTimestamp = hotelRateSourceTimestamp(selectedHotel);
  const totalPrice = selectedNightPrice * Math.max(1, Number(rooms || 1)) * nights;
  const destinationQuery = [selectedHotel?.name, city, country].filter(Boolean).join(", ") || "London";

  useEffect(() => {
    try {
      if (selectedHotel) {
        localStorage.setItem("msh_selected_hotel", JSON.stringify(selectedHotel));
      }
    } catch {}
  }, [selectedHotel]);

  const comparisons = useMemo(
    () => buildComparisons(selectedHotel, hotels, nights, rooms, currency),
    [selectedHotel, hotels, nights, rooms, currency]
  );

  async function loadDestinations() {
    try {
      const res = await fetch(`${API_BASE}/destinations`, { cache: "no-store" });
      const data = await res.json();
      const list = Array.isArray(data) ? data : [];
      setCountries(list);
      if (!list.length) setNotice("Destinations are being refreshed. Please try again shortly.");
    } catch {
      setNotice("We could not load destinations right now. Please refresh the page.");
    }
  }

  async function searchHotels() {
    setNotice("");
    setSelectedHotel(null);
    setHotels([]);

    if (!country || !city) {
      setNotice("Please select your country and city before searching.");
      return;
    }

    if (new Date(checkOut) <= new Date(checkIn)) {
      setNotice("Please choose a check-out date after your check-in date.");
      return;
    }

    try {
      setLoading(true);

      const params = new URLSearchParams({
        country,
        city,
        checkIn,
        checkOut,
        check_in: checkIn,
        check_out: checkOut,
        checkin: checkIn,
        checkout: checkOut,
        guests: String(guests),
        rooms: String(rooms),
        currency,
        limit: "1000",
      });

      const endpoints = [`${API_BASE}/api/live-rate-cascade?${params.toString()}`,`${API_BASE}/api/selected-hotel-live-rate?${params.toString()}`,
        `${API_BASE}/api/multi-supplier-hotels?${params.toString()}`,
        `${API_BASE}/api/customer-global-hotels?${params.toString()}`,
        `${API_BASE}/api/hotels/search?${params.toString()}`,
        `${API_BASE}/search?${params.toString()}`,
      ];

      const results = await Promise.allSettled(
        endpoints.map((url) =>
          fetch(url, { cache: "no-store" })
            .then((res) => res.json())
            .catch(() => ({ hotels: [] }))
        )
      );

      const collected = [];

      for (const result of results) {
        if (result.status !== "fulfilled") continue;
        const data = result.value || {};
        if (Array.isArray(data.hotels)) collected.push(...data.hotels);
      }

      const found = collected
        .filter(Boolean)
        .filter((hotel) => {
          const hotelCountry = String(hotel.country || "").trim().toLowerCase();
          const hotelCity = String(hotel.city || hotel.destination || "").trim().toLowerCase();
          const wantedCountry = String(country || "").trim().toLowerCase();
          const wantedCity = String(city || "").trim().toLowerCase();

          if (wantedCountry && hotelCountry && hotelCountry !== wantedCountry) return false;

          if (wantedCity && hotelCity) {
            return (
              hotelCity === wantedCity ||
              hotelCity.includes(wantedCity) ||
              wantedCity.includes(hotelCity)
            );
          }

          return true;
        })
        .filter((hotel, index, list) => {
          const key = String(
            hotel?.hotelId ||
              hotel?.hotel_id ||
              hotel?.id ||
              hotel?.code ||
              `${hotel?.name || hotel?.hotel_name || "hotel"}-${hotel?.city || ""}-${hotel?.country || ""}`
          ).toLowerCase();

          return index === list.findIndex((x) => {
            const xKey = String(
              x?.hotelId ||
                x?.hotel_id ||
                x?.id ||
                x?.code ||
                `${x?.name || x?.hotel_name || "hotel"}-${x?.city || ""}-${x?.country || ""}`
            ).toLowerCase();

            return xKey === key;
          });
        });

      setHotels(found);

      setTimeout(() => {
        const target = document.getElementById("hotel-results");
        if (target) target.scrollIntoView({ behavior: "smooth", block: "start" });
      }, 100);

      if (!found.length) {
        setNotice(`No matching hotels were returned for ${city}, ${country}. Try another nearby city, or check that backend supplier inventory/city maps are loaded.`);
      }
    } catch {
      setNotice("We could not load hotels for this destination right now. Please try again.");
    } finally {
      setLoading(false);
    }
  }
  async function refreshSelectedHotelLiveRates(hotelToRefresh) {
    const readyHotel = selectedHotelWithRoom(hotelToRefresh);
    setSelectedHotel(readyHotel);
    setLiveRateNotice("");

    const selectedHotelId = readyHotel?.hotelId || readyHotel?.hotel_id || readyHotel?.id || readyHotel?.code || "";
    const selectedHotelName = readyHotel?.name || readyHotel?.hotel_name || "";
    const selectedCountry = readyHotel?.country || country || "";
    const selectedCity = readyHotel?.city || city || "";

    if (!selectedHotelName && !selectedHotelId) {
      setLiveRateNotice("Selected hotel saved. Live rate check needs a valid hotel name or hotel ID.");
      return;
    }

    try {
      setLiveRateLoading(true);

      const params = new URLSearchParams({
        country: selectedCountry,
        city: selectedCity,
        hotelId: selectedHotelId,
        hotel_id: selectedHotelId,
        hotelName: selectedHotelName,
        hotel_name: selectedHotelName,
        checkIn,
        checkOut,
        check_in: checkIn,
        check_out: checkOut,
        checkin: checkIn,
        checkout: checkOut,
        guests: String(guests),
        rooms: String(rooms),
        currency,
        limit: "25",
      });

      const endpoints = [`${API_BASE}/api/live-rate-cascade?${params.toString()}`,`${API_BASE}/api/selected-hotel-live-rate?${params.toString()}`,
        `${API_BASE}/api/customer-global-hotels?${params.toString()}`,
        `${API_BASE}/api/customer-global-hotels?${params.toString()}`,
        `${API_BASE}/api/multi-supplier-hotels?${params.toString()}`,
        `${API_BASE}/api/hotels/search?${params.toString()}`,
      ];

      let refreshedHotel = null;

      for (const url of endpoints) {
        try {
          const res = await fetch(url, { cache: "no-store" });
          const data = await res.json();

          if (!res.ok) continue;

          const offer = data?.customer_offer || data?.best_offer || data?.offer || null;
          const list = Array.isArray(data?.hotels) ? data.hotels : [];
          const matched = list.find((item) => {
            const itemId = String(item?.hotelId || item?.hotel_id || item?.id || item?.code || "").toLowerCase();
            const itemName = String(item?.name || item?.hotel_name || "").toLowerCase();
            const wantedId = String(selectedHotelId || "").toLowerCase();
            const wantedName = String(selectedHotelName || "").toLowerCase();

            return (
              (wantedId && itemId && itemId === wantedId) ||
              (wantedName && itemName && (itemName === wantedName || itemName.includes(wantedName) || wantedName.includes(itemName)))
            );
          }) || list[0];

          if (offer && Number(offer.amount || offer.price || 0) > 0) {
            refreshedHotel = {
              ...readyHotel,
              price: safeNumber(offer.amount || offer.price || readyHotel.price),
              currency: offer.currency || readyHotel.currency || currency,
              selectedRoom: {
                ...(readyHotel.selectedRoom || {}),
                price: safeNumber(offer.amount || offer.price || readyHotel.selectedRoom?.price || readyHotel.price),
                convertedPrice: safeNumber(offer.amount || offer.price || readyHotel.selectedRoom?.convertedPrice || readyHotel.price),
                displayCurrency: offer.currency || readyHotel.selectedRoom?.displayCurrency || readyHotel.currency || currency,
                roomName: offer.roomName || offer.room_name || readyHotel.selectedRoom?.roomName || readyHotel.roomName || "Available room",
                roomCode: offer.roomCode || offer.room_code || readyHotel.selectedRoom?.roomCode || readyHotel.roomCode || "STANDARD",
                rate_source_id: offer.rate_source_id || data?.rate_source_id || readyHotel.selectedRoom?.rate_source_id || readyHotel.rate_source_id || "",
                rate_source_timestamp: offer.rate_source_timestamp || data?.rate_source_timestamp || new Date().toISOString(),
              },
              rate_source_id: offer.rate_source_id || data?.rate_source_id || readyHotel.rate_source_id || "",
              rate_source_timestamp: offer.rate_source_timestamp || data?.rate_source_timestamp || new Date().toISOString(),
            };
            break;
          }

          if (matched) {
            const matchedRoom = Array.isArray(matched.rooms) && matched.rooms.length ? matched.rooms[0] : {};
            const matchedPrice = Number(
              matched.price ||
              matched.convertedPrice ||
              matched.displayPrice ||
              matched.amount ||
              matched.total ||
              matchedRoom.price ||
              matchedRoom.convertedPrice ||
              matchedRoom.displayPrice ||
              matchedRoom.amount ||
              0
            );

            if (Number.isFinite(matchedPrice) && matchedPrice > 0) {
              refreshedHotel = selectedHotelWithRoom({ ...readyHotel, ...matched });
              break;
            }
          }
        } catch {}
      }

      if (refreshedHotel) {
        setSelectedHotel(refreshedHotel);
        setHotels((prev) =>
          (prev || []).map((item) => (hotelKey(item) === hotelKey(readyHotel) ? { ...item, ...refreshedHotel } : item))
        );
        const confirmedAmount = Number(
          refreshedHotel?.selectedRoom?.convertedPrice ||
          refreshedHotel?.selectedRoom?.price ||
          refreshedHotel?.price ||
          0
        );

        if (Number.isFinite(confirmedAmount) && confirmedAmount > 0) {
          setLiveRateNotice("Live rate refreshed for the selected hotel.");
        } else {
          setLiveRateNotice("No current live rate was found for this hotel yet.");
        }
      } else {
        setLiveRateNotice("Selected hotel saved. Live rate could not be refreshed right now.");
      }
    } finally {
      setLiveRateLoading(false);
    }
  }

  function selectHotelAndRefreshLiveRates(hotelToSelect) {
    const readyHotel = selectedHotelWithRoom(hotelToSelect);
    setSelectedHotel(readyHotel);
    refreshSelectedHotelLiveRates(readyHotel);
  }

  async function secureReservation() {
    setNotice("");

    if (!selectedHotel) {
      setNotice("Please select a hotel before continuing.");
      return;
    }

    if (!customerName.trim() || !customerEmail.trim()) {
      setNotice("Please enter the customer name and email address before checkout.");
      return;
    }

    if (!totalPrice || totalPrice <= 0) {
      setNotice("A valid stay price is required before secure payment can start.");
      return;
    }

    try {
      setPaying(true);

      const savedAffiliateCode = (() => {
        try {
          return String(localStorage.getItem("msh_affiliate_code") || affiliateCode || "").trim().toUpperCase();
        } catch {
          return String(affiliateCode || "").trim().toUpperCase();
        }
      })();

      const payload = {
        hotelId: selectedHotel.hotelId || selectedHotel.hotel_id || selectedHotel.id || "",
        hotelName: selectedHotel.name || "MySpace Hotel Reservation",
        roomCode: selectedRoomCode,
        roomName: selectedRoomName,
        country: selectedHotel.country || country,
        city: selectedHotel.city || city,
        checkIn,
        checkOut,
        guests: Number(guests || 1),
        rooms: Number(rooms || 1),
        amount: totalPrice,
        currency: selectedCurrency,
        customerName,
        customerEmail,
        customerPhone,
        specialRequests,
        rate_source_id: selectedRateSourceId,
        rate_source_timestamp: selectedRateSourceTimestamp,
        affiliateCode: savedAffiliateCode,
        affiliate_code: savedAffiliateCode,
        ref: savedAffiliateCode,
      };

      const bookingRes = await fetch(`${API_BASE}/api/book`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const bookingData = await bookingRes.json();
      const bookingRef = bookingData?.bookingRef || `MSH-${Date.now()}`;

      const checkoutRes = await fetch(`${API_BASE}/api/create-checkout-session`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...payload,
          bookingRef,
          rate_source_id: bookingData?.rate_source_id || selectedRateSourceId,
          rate_source_timestamp: bookingData?.rate_source_timestamp || selectedRateSourceTimestamp,
        }),
      });

      const checkoutData = await checkoutRes.json();

      if (checkoutData?.ok && checkoutData?.url) {
        window.location.href = checkoutData.url;
        return;
      }

      if (STRIPE_PAYMENT_LINK) {
        window.location.href = STRIPE_PAYMENT_LINK;
        return;
      }

      setNotice(checkoutData?.message || "Secure payment is not configured yet.");
    } catch {
      if (STRIPE_PAYMENT_LINK) {
        window.location.href = STRIPE_PAYMENT_LINK;
        return;
      }
      setNotice("Secure payment could not be started. Please try again.");
    } finally {
      setPaying(false);
    }
  }

  const appProps = {
    countries,
    cities,
    country,
    city,
    checkIn,
    checkOut,
    guests,
    rooms,
    currency,
    hotels,
    selectedHotel,
    notice,
    loading,
    paying,
    nights,
    selectedCurrency,
    selectedRoomCode,
    selectedRoomName,
    selectedRateSourceId,
    selectedRateSourceTimestamp,
    liveRateLoading,
    liveRateNotice,
    totalPrice,
    comparisons,
    destinationQuery,
    customerName,
    customerEmail,
    customerPhone,
    specialRequests,
    fxAmount,
    fxFrom,
    fxTo,
    affiliateCode,
    setCountry,
    setCity,
    setCheckIn,
    setCheckOut,
    setGuests,
    setRooms,
    setCurrency,
    setHotels,
    setSelectedHotel,
    selectHotelAndRefreshLiveRates,
    setCustomerName,
    setCustomerEmail,
    setCustomerPhone,
    setSpecialRequests,
    setFxAmount,
    setFxFrom,
    setFxTo,
    searchHotels,
    secureReservation,
  };

  return (
    <div style={styles.page}>
      <Header />
      {route === "hotels" && <HotelsPage {...appProps} />}
      {route === "compare" && <ComparePortal {...appProps} />}
      {route === "guide" && <GuidePortal destinationQuery={destinationQuery} />}
      {route === "about" && <AboutPortal />}
      {route === "faq" && <FaqPortal />}
      {route === "reviews" && <ReviewsPortal reviewSent={reviewSent} setReviewSent={setReviewSent} />}
      {route === "support" && <SupportPortal />}
      {route === "partners" && <PartnersPortal partnerSent={partnerSent} setPartnerSent={setPartnerSent} />}
      {route === "insurance" && <InsurancePortal {...appProps} />}
      {route === "transfers" && <TransfersPortal {...appProps} />}
      {route === "attractions" && <AttractionsPortal {...appProps} />}
{route === "experiences" && <ExperiencePage />}
      {route === "featured" && <FeaturedHotelsPortal />}
      {route === "affiliates" && <AffiliateNetworkUltraSafe />}
      {route === "business" && <BusinessPortal />}
      <Footer />
    </div>
  );
}


function InstallAppButton() {
  const [installPrompt, setInstallPrompt] = useState(null);
  const [installed, setInstalled] = useState(false);

  useEffect(() => {
    const alreadyInstalled =
      window.matchMedia("(display-mode: standalone)").matches ||
      window.navigator.standalone === true;

    setInstalled(alreadyInstalled);

    function handleBeforeInstallPrompt(event) {
      event.preventDefault();
      setInstallPrompt(event);
    }

    function handleInstalled() {
      setInstalled(true);
      setInstallPrompt(null);
    }

    window.addEventListener("beforeinstallprompt", handleBeforeInstallPrompt);
    window.addEventListener("appinstalled", handleInstalled);

    return () => {
      window.removeEventListener("beforeinstallprompt", handleBeforeInstallPrompt);
      window.removeEventListener("appinstalled", handleInstalled);
    };
  }, []);

  async function installApp() {
    if (installPrompt) {
      installPrompt.prompt();
      await installPrompt.userChoice;
      setInstallPrompt(null);
      return;
    }

    alert("To install MySpace Hotel, open your browser menu, choose Apps, then select Install this site as an app.");
  }

  if (installed) return null;

  return (
    <button
      type="button"
      onClick={installApp}
      style={{
        padding: "10px 13px",
        borderRadius: 13,
        border: "1px solid #10b981",
        color: "#ffffff",
        background: "#10b981",
        textDecoration: "none",
        fontWeight: 950,
        fontSize: 14,
        cursor: "pointer",
      }}
    >
      Install App
    </button>
  );
}
function Header() {
  return (
    <header style={styles.header}>
      <a style={styles.brand} href={routeUrl(ROUTES.hotels)}>
        <div style={styles.logo}>MYSPACE HOTEL</div>
        <div style={styles.tagline}>Hotels, resorts, serviced apartments and worldwide travel support</div>
      </a>

      <nav style={styles.nav}>
        <a style={styles.navLink} href={routeUrl(ROUTES.hotels)}>Hotels</a>
        <a style={styles.navLink} href={routeUrl(ROUTES.compare)}>Compare Prices</a>
        <a style={styles.navLink} href={routeUrl(ROUTES.guide)}>Destination Guide</a>
        <a style={styles.navLink} href={routeUrl(ROUTES.insurance)}>Insurance</a>
        <a style={styles.navLink} href={routeUrl(ROUTES.transfers)}>Transfers</a>
        <a style={styles.navLink} href={routeUrl(ROUTES.experiences)}>Experiences</a>
        <a style={styles.goldLink} href={routeUrl(ROUTES.featured)}>Featured Hotels</a>
        <a style={styles.navLink} href={routeUrl(ROUTES.about)}>About Us</a>
        <a style={styles.navLink} href={routeUrl(ROUTES.faq)}>FAQ</a>
        <a style={styles.navLink} href={routeUrl(ROUTES.reviews)}>Guest Reviews</a>
        <a style={styles.navLink} href={routeUrl(ROUTES.support)}>Support</a>
        <InstallAppButton />
        <a style={styles.goldLink} href={routeUrl(ROUTES.partners)}>Partnerships</a>
        <a style={styles.navLink} href="/affiliate-network.html">Affiliate Network</a>
        <a style={styles.darkLink} href={routeUrl(ROUTES.business)}>Business Portal</a>
      </nav>
    </header>
  );
}

function HotelsPage(props) {
  const converted = convertCurrency(Number(props.fxAmount || 0), props.fxFrom, props.fxTo);

  return (
    <>
      <section style={styles.hero}>
        <div style={styles.heroInner}>
          <div style={styles.heroGrid}>
            <div>
              <div style={styles.pill}>Trusted accommodation for every journey</div>
              <h1 style={styles.heroTitle}>
                {props.country ? `Find trusted hotels in ${props.country}` : "Find trusted hotels around the world"}
              </h1>
              <p style={styles.heroText}>
                Search hotels, review full stay totals, compare value in the same destination and continue through a secure reservation journey.
              </p>
            </div>

            <div style={styles.promisePanel}>
              <h2 style={styles.panelMiniTitle}>Why guests choose MySpace Hotel</h2>
              <div style={styles.promiseItem}>Clear stay totals before checkout</div>
              <div style={styles.promiseItem}>Hotel comparison for better value</div>
              <div style={styles.promiseItem}>Destination support before travel</div>
              <div style={styles.promiseItem}>Customer-friendly booking journey</div>
            </div>
          </div>

          <div style={styles.searchCard}>
            <SearchBox {...props} />
          </div>

          <div style={styles.converterCard}>
            <div>
              <div style={styles.converterTitle}>Currency Converter</div>
              <div style={styles.muted}>Indicative conversion for planning. Final payment currency is confirmed before checkout.</div>
            </div>
            <input style={styles.input} type="number" min="1" value={props.fxAmount} onChange={(e) => props.setFxAmount(e.target.value)} />
            <select style={styles.input} value={props.fxFrom} onChange={(e) => props.setFxFrom(e.target.value)}>
              {Object.keys(FX).map((x) => <option key={x}>{x}</option>)}
            </select>
            <select style={styles.input} value={props.fxTo} onChange={(e) => props.setFxTo(e.target.value)}>
              {Object.keys(FX).map((x) => <option key={x}>{x}</option>)}
            </select>
            <div style={styles.convertResult}>{props.fxTo} {money(converted)}</div>
          </div>

          <div style={styles.metrics}>
            <Metric big="Clear" small="Stay totals" />
            <Metric big="Compare" small="Hotel value" />
            <Metric big="Protect" small="Insurance options" />
            <Metric big="Transfer" small="Airport support" />
            <Metric big="Explore" small="Travel experiences" />
          </div>
        </div>
      </section>

      {props.notice ? <div style={styles.notice}>{props.notice}</div> : null}

      <section style={styles.contentGrid}>
        <main>
          <h2 id="hotel-results" style={styles.title}>MORE STAY OPTIONS</h2>
          <p style={styles.sectionText}>
            Select a hotel to refresh the booking summary, comparison box, travel support and alternative hotel options immediately.
          </p>

          {props.loading ? <div style={styles.empty}>Finding suitable accommodation for your destination...</div> : null}

          {!props.loading && props.hotels.length === 0 ? (
            <div style={styles.empty}>Choose a country, city and travel dates to discover available accommodation.</div>
          ) : null}

          <div style={styles.hotelGrid}>
            {props.hotels.map((hotel, idx) => (
              <HotelCard key={hotelKey(hotel) || idx} hotel={hotel} idx={idx} {...props} />
            ))}
          </div>

          <ComparePanel {...props} />
          <AlternativeHotels {...props} />
          <RevenueAddOns {...props} />
        </main>

        <BookingSummary {...props} />
      </section>
    </>
  );
}

function SearchBox(props) {
  return (
    <>
      <Field label="Country">
        <select style={styles.input} value={props.country} onChange={(e) => {
          props.setCountry(e.target.value);
          props.setCity("");
          props.setHotels([]);
          props.setSelectedHotel(null);
        }}>
          <option value="">Select country</option>
          {props.countries.map((item) => (
            <option key={item.country} value={item.country}>{item.country}</option>
          ))}
        </select>
      </Field>

      <Field label="City">
        <select
          style={styles.input}
          value={props.city}
          disabled={!props.country}
          onChange={(e) => {
            props.setCity(e.target.value);
            props.setHotels([]);
            props.setSelectedHotel(null);
          }}
        >
          <option value="">{props.country ? "Select city" : "Select country first"}</option>
          {(props.countries.find((x) => x.country === props.country)?.cities || []).map((item) => (
            <option key={item} value={item}>{item}</option>
          ))}
        </select>
      </Field>

      <Field label="Check-in">
        <input style={styles.input} type="date" value={props.checkIn} onChange={(e) => props.setCheckIn(e.target.value)} />
      </Field>

      <Field label="Check-out">
        <input style={styles.input} type="date" value={props.checkOut} onChange={(e) => props.setCheckOut(e.target.value)} />
      </Field>

      <Field label="Guests">
        <input style={styles.input} type="number" min="1" max="20" value={props.guests} onChange={(e) => props.setGuests(e.target.value)} />
      </Field>

      <Field label="Rooms">
        <input style={styles.input} type="number" min="1" max="10" value={props.rooms} onChange={(e) => props.setRooms(e.target.value)} />
      </Field>

      <Field label="Currency">
        <select style={styles.input} value={props.currency} onChange={(e) => props.setCurrency(e.target.value)}>
          {Object.keys(FX).map((x) => <option key={x}>{x}</option>)}
        </select>
      </Field>

      <button style={styles.primaryBtn} onClick={props.searchHotels}>
        {props.loading ? "Finding Hotels..." : "Find Hotels"}
      </button>
    </>
  );
}

function Field({ label, children }) {
  return (
    <div style={styles.field}>
      <label style={styles.label}>{label}</label>
      {children}
    </div>
  );
}

function HotelCard({ hotel, selectedHotel, setSelectedHotel, selectHotelAndRefreshLiveRates, rooms, nights, currency, city, country }) {
  const selectedReadyHotel = selectedHotelWithRoom(hotel);
  const price = hotelPrice(selectedReadyHotel);
  const curr = hotelCurrency(selectedReadyHotel, currency);
  const total = price * Math.max(1, Number(rooms || 1)) * Math.max(1, Number(nights || 1));
  const selected = hotelKey(hotel) === hotelKey(selectedHotel);
  const image = validHotelImage(hotel);

  return (
    <article style={selected ? styles.hotelCardSelected : styles.hotelCard}>
      {image ? (
        <img src={image} alt={hotel.name || "Hotel"} style={styles.hotelImage} />
      ) : (
        <div style={styles.noImage}>Verified image unavailable</div>
      )}

      <div style={styles.hotelBody}>
        <div style={styles.greenBadge}>{selected ? "Selected Property" : "Recommended Property"}</div>
        <h3 style={styles.hotelName}>{hotel.name || "Selected hotel"}</h3>
        <div style={styles.muted}>{hotel.city || city}, {hotel.country || country}</div>

        <div style={styles.tagRow}>
          <span style={styles.tag}>Clear total</span>
          <span style={styles.tag}>Guest support</span>
          <span style={styles.tag}>Destination guide</span>
        </div>

        <div style={styles.priceLine}>{curr} {money(price)} <span style={styles.small}>per night</span></div>
        <div style={styles.small}>Estimated stay total: {curr} {money(total)}</div>

        <button style={styles.darkBtn} onClick={() => selectHotelAndRefreshLiveRates ? selectHotelAndRefreshLiveRates(selectedReadyHotel) : setSelectedHotel(selectedReadyHotel)}>
          Select Hotel
        </button>
      </div>
    </article>
  );
}

function BookingSummary(props) {
  return (
    <aside style={styles.summary}>
      <h2 style={styles.summaryTitle}>Booking Summary</h2>
      <div style={styles.muted}>
        {props.nights} night{props.nights === 1 ? "" : "s"}, {props.rooms} room{Number(props.rooms) === 1 ? "" : "s"}, {props.guests} guest{Number(props.guests) === 1 ? "" : "s"}
      </div>

      {!props.selectedHotel ? (
        <div style={styles.softBox}>Select a hotel to review your stay summary, guest details and secure payment option.</div>
      ) : (
        <>
          <h3 style={styles.selectedName}>{props.selectedHotel.name}</h3>
          {props.liveRateLoading ? <div style={styles.softBox}>Checking current live rate for this hotel...</div> : null}
          {props.liveRateNotice ? <div style={styles.softBox}>{props.liveRateNotice}</div> : null}
          <div style={styles.muted}>{props.selectedHotel.city || props.city}, {props.selectedHotel.country || props.country}</div>
          <div style={styles.small}>Board Basis: {props.selectedRoomName}</div>

          <div style={styles.totalBox}>
            <div style={styles.totalLabel}>Estimated stay total</div>
            <div style={styles.totalPrice}>{props.selectedCurrency} {money(props.totalPrice)}</div>
            <div style={styles.small}>Based on selected hotel, nights and rooms.</div>
          </div>

          <div style={styles.customerBox}>
            <h3 style={styles.customerTitle}>Guest Details Before Checkout</h3>
            <input style={styles.input} placeholder="Full name" value={props.customerName} onChange={(e) => props.setCustomerName(e.target.value)} />
            <input style={styles.input} type="email" placeholder="Email address" value={props.customerEmail} onChange={(e) => props.setCustomerEmail(e.target.value)} />
            <input style={styles.input} placeholder="Phone number, optional" value={props.customerPhone} onChange={(e) => props.setCustomerPhone(e.target.value)} />
            <textarea style={styles.textareaSmall} placeholder="Special requests, optional" value={props.specialRequests} onChange={(e) => props.setSpecialRequests(e.target.value)} />
          </div>

          {props.affiliateCode ? <div style={styles.referralNote}>Referral applied for this booking.</div> : null}

          <button style={styles.payBtn} disabled={props.paying} onClick={props.secureReservation}>
            {props.paying ? "Opening Secure Payment..." : "Continue to Secure Checkout"}
          </button>

          <div style={styles.bookingFirstBox}>
            <div style={styles.bookingFirstTitle}>Complete your hotel reservation first</div>
            <div style={styles.bookingFirstText}>
              Your hotel stay is the priority. After your reservation is secured, you can still add airport transfers, travel insurance and destination experiences through MySpace Hotel.
            </div>
          </div>
        </>
      )}
    </aside>
  );
}

function ComparePanel(props) {
  if (!props.selectedHotel) return null;

  return (
    <section style={styles.panel}>
      <div style={styles.panelHeader}>
        <div>
          <div style={styles.kicker}>Compare Prices</div>
          <h2 style={styles.titleSmall}>Compare your selected stay</h2>
          <p style={styles.sectionText}>Review stay choices and more stay options before continuing.</p>
        </div>
        <a style={styles.primaryLink} href={routeUrl(ROUTES.compare)}>Open Compare Page</a>
      </div>

      <div style={styles.compareGrid}>
        {props.comparisons.slice(0, 6).map((item) => (
          <div key={item.id} style={styles.compareCard}>
            <div style={styles.greenBadge}>{item.badge}</div>
            <h3 style={styles.cardTitle}>{item.hotelName}</h3>
            <div style={styles.strong}>{item.label}</div>
            <p style={styles.cardText}>{item.text}</p>
            <div style={styles.comparePrice}>{item.currency} {money(item.total)}</div>
            <div style={styles.small}>Estimated stay total</div>
          </div>
        ))}
      </div>
    </section>
  );
}

function AlternativeHotels(props) {
  const alternatives = (props.hotels || [])
    .filter((hotel) => hotelKey(hotel) !== hotelKey(props.selectedHotel))
    .slice(0, 3);

  if (!props.selectedHotel || alternatives.length === 0) return null;

  return (
    <section style={styles.panel}>
      <div style={styles.kicker}>MORE STAY OPTIONS</div>
      <h2 style={styles.titleSmall}>Other accommodation options in {props.city || "this destination"}</h2>

      <div style={styles.altGrid}>
        {alternatives.map((hotel, idx) => {
          const selectedReadyHotel = selectedHotelWithRoom(hotel);
          const price = hotelPrice(selectedReadyHotel);
          const curr = hotelCurrency(selectedReadyHotel, props.currency);
          const image = validHotelImage(hotel);

          return (
            <article key={hotelKey(hotel) || idx} style={styles.altCard}>
              {image ? <img src={image} alt={hotel.name || "Hotel"} style={styles.altImage} /> : <div style={styles.altNoImage}>Image unavailable</div>}
              <div style={styles.altBody}>
                <h3 style={styles.altName}>{hotel.name || "Nearby hotel"}</h3>
                <div style={styles.muted}>{hotel.city || props.city}, {hotel.country || props.country}</div>
                <div style={styles.priceLine}>{curr} {money(price)}</div>
                <button style={styles.darkBtn} onClick={() => props.selectHotelAndRefreshLiveRates ? props.selectHotelAndRefreshLiveRates(selectedReadyHotel) : props.setSelectedHotel(selectedReadyHotel)}>
                  View This Stay
                </button>
              </div>
            </article>
          );
        })}
      </div>
    </section>
  );
}

function ComparePortal(props) {
  const [liveCompare, setLiveCompare] = useState(null);
  const [liveLoading, setLiveLoading] = useState(false);
  const [liveNotice, setLiveNotice] = useState("");

  const selected = props.selectedHotel;
  const selectedHotelId = selected?.hotelId || selected?.hotel_id || "";
  const selectedHotelName = selected?.name || selected?.hotel_name || "";
  const selectedCountry = selected?.country || props.country || "";
  const selectedCity = selected?.city || props.city || "";
  const selectedCurrency = props.selectedCurrency || props.currency || "GBP";

  async function refreshLiveCompare() {
    setLiveNotice("");

    if (!selected) {
      setLiveCompare(null);
      setLiveNotice("Select a hotel from the Hotels page first. The best available price check will appear here.");
      return;
    }

    try {
      setLiveLoading(true);

      const params = new URLSearchParams({
        country: selectedCountry,
        city: selectedCity,
        hotelId: selectedHotelId,
        hotelName: selectedHotelName,
        currency: selectedCurrency,
      });

      const res = await fetch(`${API_BASE}/api/customer-global-hotels?${params.toString()}`, {
        cache: "no-store",
      });

      const data = await res.json();

      if (!res.ok || !data.ok) {
        throw new Error(data.message || "Price comparison could not be refreshed.");
      }

      setLiveCompare(data);
      setLiveNotice("");
    } catch {
      setLiveCompare(null);
      setLiveNotice("The live price comparison could not be refreshed right now. Please try again.");
    } finally {
      setLiveLoading(false);
    }
  }

  useEffect(() => {
    refreshLiveCompare();
  }, [selectedHotelId, selectedHotelName, selectedCountry, selectedCity, selectedCurrency]);

  const customerOffer = liveCompare?.customer_offer || null;
  const summary = liveCompare?.comparison_summary || null;
  const bestAmount = Number(customerOffer?.amount || summary?.best_amount || props.totalPrice || 0);
  const bestCurrency = customerOffer?.currency || summary?.currency || selectedCurrency || "GBP";
  const hotelName = customerOffer?.hotelName || selectedHotelName || "Selected hotel";
  const roomName = customerOffer?.roomName || props.selectedRoomName || "Available room";

  return (
    <PortalShell title="Compare Prices" subtitle="Review your selected stay clearly before continuing to secure checkout." badge="Best price check">
      {!selected ? (
        <div style={styles.empty}>
          Select a hotel from the Hotels page first, then return here to compare today's best available price for that exact property.
        </div>
      ) : (
        <>
          <section style={styles.panel}>
            <div style={styles.panelHeader}>
              <div>
                <div style={styles.kicker}>Price comparison</div>
                <h2 style={styles.titleSmall}>Today's Best Available Price: {hotelName}</h2>
                <p style={styles.sectionText}>Review your selected stay clearly before continuing to secure checkout.</p>
              </div>
            </div>

            {liveNotice ? <div style={styles.notice}>{liveNotice}</div> : null}

            <div style={styles.liveCompareBox}>
              <div>
                <div style={styles.greenBadge}>{liveLoading ? "Checking current rates" : "Recommended stay option"}</div>
                <h3 style={styles.cardTitle}>{hotelName}</h3>
                <div style={styles.muted}>{selectedCity}, {selectedCountry}</div>
                <div style={styles.strong}>Board Basis: {roomName}</div>
                <p style={styles.cardText}>You can review this stay with confidence before continuing to secure checkout.</p>
              </div>

              <div style={styles.liveComparePrice}>
                {bestCurrency} {money(bestAmount)}
                <div style={styles.small}>Reviewed before secure checkout</div>
              </div>
            </div>
          </section>

          <RevenueAddOns {...props} />
          <AlternativeHotels {...props} />
        </>
      )}
    </PortalShell>
  );
}

function RevenueAddOns(props) {
  if (!props.selectedHotel) return null;

  return (
    <section style={styles.panel}>
      <div style={styles.panelHeader}>
        <div>
          <div style={styles.kicker}>Enhance Your Stay</div>
          <h2 style={styles.titleSmall}>Complete your hotel booking, then personalise your trip</h2>
          <p style={styles.sectionText}>
            Secure your accommodation first. After booking, you can add airport transfers, travel insurance, sightseeing tours and destination experiences without losing your MySpace Hotel reservation.
          </p>
        </div>
      </div>

      <div style={styles.cardGrid}>
        <InfoCard title="Travel Insurance" text="Protect the trip with cancellation, travel disruption and emergency support options after your stay is reserved." />
        <InfoCard title="Hotel Airport Transfers" text="Arrange airport pickup or hotel drop-off support after securing your accommodation." />
        <InfoCard title="Tours & Experiences" text="Explore popular activities matched to your destination once your hotel booking is safely underway." />
        <InfoCard title="Destination Support" text="Use MySpace Hotel guidance to plan your trip with more confidence before and after booking." />
      </div>

      <div style={styles.bookingFirstBox}>
        <div style={styles.bookingFirstTitle}>Recommended next step</div>
        <div style={styles.bookingFirstText}>
          Return to the booking summary and complete your hotel reservation first. Trip extras will remain available afterwards.
        </div>
      </div>
    </section>
  );
}

function InsurancePortal(props) {
  const [options, setOptions] = useState([]);
  const [notice, setNotice] = useState("");

  useEffect(() => {
    async function load() {
      try {
        const params = new URLSearchParams({
          destination: props.destinationQuery || "",
          tripTotal: String(props.totalPrice || 0),
        });
        const res = await fetch(`${API_BASE}/api/insurance/options?${params}`, { cache: "no-store" });
        const data = await res.json();
        setOptions(Array.isArray(data.options) ? data.options : []);
      } catch {
        setNotice("Travel insurance options could not be loaded right now.");
      }
    }
    load();
  }, [props.destinationQuery, props.totalPrice]);

  async function requestInsurance(option) {
    setNotice("");

    try {
      const res = await fetch(`${API_BASE}/api/ancillary/insurance/book`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          hotelName: props.selectedHotel?.name || "",
          destination: props.destinationQuery,
          customerName: props.customerName,
          customerEmail: props.customerEmail,
          productId: option.id,
          productName: option.name,
          amount: option.price,
          currency: option.currency,
          commissionRate: option.commissionRate,
        }),
      });

      const data = await res.json();

      if (!res.ok || !data.ok) {
        setNotice(data.message || "Insurance request could not be submitted.");
        return;
      }

      setNotice("Travel insurance request received by MySpace Hotel.");
    } catch {
      setNotice("Insurance request could not be submitted right now.");
    }
  }

  return (
    <PortalShell title="Travel Insurance" subtitle="Add protection after choosing your stay, so your trip feels safer and easier to manage." badge="Trip protection">
      {notice ? <div style={styles.notice}>{notice}</div> : null}
      <div style={styles.cardGrid}>
        {options.map((option) => (
          <div key={option.id} style={styles.infoCard}>
            <h3 style={styles.cardTitle}>{option.name}</h3>
            <p style={styles.cardText}>{option.description}</p>
            <div style={styles.softBox}>Cover pricing is confirmed after your request is reviewed.</div>
            <button style={styles.primaryBtn} onClick={() => requestInsurance(option)}>
              Request Insurance Support
            </button>
          </div>
        ))}
      </div>
    </PortalShell>
  );
}

function TransfersPortal(props) {
  const [options, setOptions] = useState([]);
  const [notice, setNotice] = useState("");

  useEffect(() => {
    async function load() {
      try {
        const params = new URLSearchParams({
          city: props.city || props.selectedHotel?.city || "",
          currency: props.selectedCurrency || props.currency || "GBP",
        });
        const res = await fetch(`${API_BASE}/api/transfers/search?${params}`, { cache: "no-store" });
        const data = await res.json();
        setOptions(Array.isArray(data.options) ? data.options : []);
      } catch {
        setNotice("Airport transfer options could not be loaded right now.");
      }
    }
    load();
  }, [props.city, props.selectedHotel, props.selectedCurrency, props.currency]);

  async function requestTransfer(option) {
    setNotice("");

    try {
      const res = await fetch(`${API_BASE}/api/ancillary/transfers/book`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          hotelName: props.selectedHotel?.name || "",
          city: props.city || props.selectedHotel?.city || "",
          country: props.country || props.selectedHotel?.country || "",
          customerName: props.customerName,
          customerEmail: props.customerEmail,
          transferType: option.name,
          pickup: "Airport",
          dropoff: props.selectedHotel?.name || "Hotel",
          travelDate: props.checkIn,
          amount: option.price,
          currency: option.currency,
          commissionRate: option.commissionRate,
        }),
      });

      const data = await res.json();

      if (!res.ok || !data.ok) {
        setNotice(data.message || "Transfer request could not be submitted.");
        return;
      }

      setNotice("Airport transfer request received by MySpace Hotel.");
    } catch {
      setNotice("Transfer request could not be submitted right now.");
    }
  }

  return (
    <PortalShell title="Arrive Comfortably at Your Hotel" subtitle="Request airport pickup or hotel drop-off support around your selected stay." badge="Hotel Airport Transfers">
      {notice ? <div style={styles.notice}>{notice}</div> : null}
      <div style={styles.cardGrid}>
        {options.map((option) => (
          <div key={option.id} style={styles.infoCard}>
            <h3 style={styles.cardTitle}>{option.name}</h3>
            <p style={styles.cardText}>{option.description}</p>
            <div style={styles.small}>Passengers: {option.passengers}</div>
            <div style={styles.softBox}>Request your transfer before you travel. We will confirm the best available option for your airport, hotel, travel time, passengers and luggage.</div>
            <button style={styles.primaryBtn} onClick={() => requestTransfer(option)}>
              Request My Transfer Quote
            </button>
          </div>
        ))}
      </div>
    </PortalShell>
  );
}

function AttractionsPortal(props) {
  const selected = props.selectedHotel || null;
  const city = selected?.city || props.city || "";
  const country = selected?.country || props.country || "";
  const query = [city, country].filter(Boolean).join(", ");
  const destinationReady = Boolean(city);

  return (
    <PortalShell
      title="Popular Experiences & Travel Essentials"
      subtitle={
        destinationReady
          ? `Explore things to do in ${query}. Your selected hotel remains saved while you browse.`
          : "Select a hotel first so MySpace Hotel can recommend experiences for the correct destination."
      }
      badge="Enhance Your Stay"
    >
      {!destinationReady ? (
        <div style={styles.notice}>
          Please select a hotel from the Hotels page first. Your destination experiences will then match the hotel location.
        </div>
      ) : (
        <>
          <section style={styles.staySavedPanel}>
            <div>
              <div style={styles.kicker}>Your hotel is saved</div>
              <h2 style={styles.titleSmall}>{selected?.name || "Selected hotel"}</h2>
              <p style={styles.sectionText}>
                {query}. You can explore experiences now and return to complete your MySpace Hotel booking securely.
              </p>
            </div>

            <div style={styles.savedStayActions}>
              <a style={styles.payLinkBtn} href={routeUrl(ROUTES.hotels)}>
                Return to Hotel Booking
              </a>
              <a style={styles.primaryLink} href={routeUrl(ROUTES.compare)}>
                Review Stay Price
              </a>
            </div>
          </section>

          <KlookDynamicWidget city={city} country={country} />
        </>
      )}
    </PortalShell>
  );
}

function FeaturedHotelsPortal() {
  const [hotelName, setHotelName] = useState("");
  const [country, setCountry] = useState("");
  const [city, setCity] = useState("");
  const [contactName, setContactName] = useState("");
  const [contactEmail, setContactEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [website, setWebsite] = useState("");
  const [packageName, setPackageName] = useState("BRONZE");
  const [notice, setNotice] = useState("");

  const prices = { BRONZE: 49, SILVER: 99, GOLD: 199, PLATINUM: 499 };

  async function submit(e) {
    e.preventDefault();
    setNotice("");

    if (!hotelName.trim() || !contactName.trim() || !contactEmail.trim()) {
      setNotice("Please enter hotel name, contact name and contact email.");
      return;
    }

    try {
      const res = await fetch(`${API_BASE}/api/ancillary/hotels/feature`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          hotelName,
          country,
          city,
          contactName,
          contactEmail,
          phone,
          website,
          packageName,
          amount: prices[packageName],
          currency: "GBP",
        }),
      });

      const data = await res.json();

      if (!res.ok || !data.ok) {
        setNotice(data.message || "Featured hotel request could not be submitted.");
        return;
      }

      setNotice("Hotel Partner Visibility request received by MySpace Hotel.");
      setHotelName("");
      setCountry("");
      setCity("");
      setContactName("");
      setContactEmail("");
      setPhone("");
      setWebsite("");
      setPackageName("BRONZE");
    } catch {
      setNotice("Featured hotel request could not be submitted right now.");
    }
  }

  return (
    <PortalShell title="Hotel Partner Visibility" subtitle="Accommodation providers can request partnership and visibility opportunities with MySpace Hotel." badge="Hotel growth">
      <div style={styles.cardGrid}>
        <InfoCard title="Starter Visibility Request" text="Request introductory visibility for your property. Commercial terms are confirmed after review." />
        <InfoCard title="Growth Visibility Request" text="Request stronger destination visibility for your property. Commercial terms are confirmed after review." />
        <InfoCard title="Priority Visibility Request" text="Request priority visibility for selected destination campaigns. Commercial terms are confirmed after review." />
        <InfoCard title="Premium Visibility Request" text="Request premium visibility opportunities. Commercial terms are confirmed after review." />
      </div>

      <form style={styles.form} onSubmit={submit}>
        <input style={styles.input} placeholder="Hotel name" value={hotelName} onChange={(e) => setHotelName(e.target.value)} />
        <input style={styles.input} placeholder="Country" value={country} onChange={(e) => setCountry(e.target.value)} />
        <input style={styles.input} placeholder="City" value={city} onChange={(e) => setCity(e.target.value)} />
        <input style={styles.input} placeholder="Contact name" value={contactName} onChange={(e) => setContactName(e.target.value)} />
        <input style={styles.input} type="email" placeholder="Contact email" value={contactEmail} onChange={(e) => setContactEmail(e.target.value)} />
        <input style={styles.input} placeholder="Phone" value={phone} onChange={(e) => setPhone(e.target.value)} />
        <input style={styles.input} placeholder="Website" value={website} onChange={(e) => setWebsite(e.target.value)} />
        <select style={styles.input} value={packageName} onChange={(e) => setPackageName(e.target.value)}>
          <option value="BRONZE">Starter Visibility Request</option>
          <option value="SILVER">Growth Visibility Request</option>
          <option value="GOLD">Priority Visibility Request</option>
          <option value="PLATINUM">Premium Visibility Request</option>
        </select>
        <button style={styles.primaryBtn}>Request Hotel Partner Review</button>
        {notice ? <div style={styles.notice}>{notice}</div> : null}
      </form>
    </PortalShell>
  );
}

function GuidePortal({ destinationQuery }) {
  const query = destinationQuery || "selected destination";

  return (
    <PortalShell title="Destination Guide" subtitle="Plan safer and more enjoyable trips with practical destination support." badge="Travel planning">
      <div style={styles.cardGrid}>
        <GuideCard title="Emergency help" text="Find local police, ambulance, fire service and urgent assistance." href={mapSearch("emergency services", query)} />
        <GuideCard title="Hospitals and pharmacies" text="Find hospitals, pharmacies and urgent-care services." href={mapSearch("hospital pharmacy", query)} />
        <GuideCard title="Restaurants and cafes" text="Discover nearby dining options for your destination." href={mapSearch("restaurants cafes", query)} />
        <GuideCard title="Airport and transfers" text="Plan airport arrivals, rail stations, taxis and transfers." href={mapSearch("airport taxi transfer", query)} />
        <GuideCard title="Museums and culture" text="Explore museums, galleries, heritage sites and attractions." href={mapSearch("museum attractions", query)} />
        <GuideCard title="Family attractions" text="Find parks, zoos, shopping centres and family activities." href={mapSearch("family attractions zoo", query)} />
      </div>
    </PortalShell>
  );
}

function AboutPortal() {
  return (
    <PortalShell title="About MySpace Hotel" subtitle="A customer-first accommodation platform built for clear choices, trusted stays and better travel planning." badge="About us">
      <div style={styles.cardGrid}>
        <InfoCard title="Who we serve" text="MySpace Hotel supports holidaymakers, business travellers, families and guests looking for clear accommodation choices." />
        <InfoCard title="What we provide" text="Guests can search hotels, compare stay value, review destination guidance and continue through a secure booking journey." />
        <InfoCard title="Our promise" text="We focus on customer-friendly language, clear totals, useful destination support and a professional booking experience." />
        <InfoCard title="Business details" text="MySpace Hotel Ltd, 17 Barleycorn Way, London E14 8DE. Phone: +44 7707836674. Website: myspace-hotel.com." />
      </div>
    </PortalShell>
  );
}

function FaqPortal() {
  return (
    <PortalShell title="Frequently Asked Questions" subtitle="Answers to common questions before guests continue with a reservation." badge="FAQ">
      <div style={styles.faqList}>
        <FaqItem q="How do I search for a hotel?" a="Select your country, city, dates, guests and rooms, then choose Find Hotels. Available hotel options will appear below the search box." />
        <FaqItem q="When is the final price confirmed?" a="The stay total is shown before checkout. Final payment details are confirmed securely before payment is completed." />
        <FaqItem q="Can I compare hotels in the same destination?" a="Yes. After selecting a hotel, MySpace Hotel shows comparison choices and MORE STAY OPTIONS where available." />
        <FaqItem q="Can I add insurance, transfers or attractions?" a="Yes. Complete your hotel reservation first. Additional travel services can be requested afterwards through MySpace Hotel." />
        <FaqItem q="Can hotels or partners work with MySpace Hotel?" a="Yes. Accommodation providers and travel technology partners can use the Industry Partnerships page to contact MySpace Hotel." />
      </div>
    </PortalShell>
  );
}

function FaqItem({ q, a }) {
  return (
    <div style={styles.infoCard}>
      <h3 style={styles.cardTitle}>{q}</h3>
      <p style={styles.cardText}>{a}</p>
    </div>
  );
}

function ReviewsPortal({ reviewSent, setReviewSent }) {
  const [reviewName, setReviewName] = useState("");
  const [reviewEmail, setReviewEmail] = useState("");
  const [reviewMessage, setReviewMessage] = useState("");
  const [reviewNotice, setReviewNotice] = useState("");

  async function submitReview(e) {
    e.preventDefault();
    setReviewNotice("");

    if (!reviewName.trim() || !reviewEmail.trim() || !reviewMessage.trim()) {
      setReviewNotice("Please complete your name, email address and message.");
      return;
    }

    try {
      const res = await fetch(`${API_BASE}/api/feedback`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: reviewName, email: reviewEmail, message: reviewMessage }),
      });

      const data = await res.json();

      if (!res.ok || !data.ok) {
        setReviewNotice(data.message || "We could not send your review right now. Please try again.");
        return;
      }

      setReviewSent(true);
      setReviewName("");
      setReviewEmail("");
      setReviewMessage("");
    } catch {
      setReviewNotice("We could not send your review right now. Please try again.");
    }
  }

  return (
    <PortalShell title="Guest Reviews" subtitle="MySpace Hotel is built around confident travel decisions, helpful guidance and clear accommodation choices." badge="Guest experience">
      <div style={styles.cardGrid}>
        <InfoCard title="Business travel" text="A simple way to search trusted stays and compare accommodation options for professional trips." />
        <InfoCard title="Family holidays" text="Destination guidance and clear stay totals help families plan with more confidence." />
        <InfoCard title="City breaks" text="Hotel search, local attractions and dining guidance make short trips easier to plan." />
      </div>

      {reviewSent ? (
        <div style={styles.success}>Thank you. Your review has been received by MySpace Hotel.</div>
      ) : (
        <form style={styles.form} onSubmit={submitReview}>
          <input style={styles.input} placeholder="Your name" value={reviewName} onChange={(e) => setReviewName(e.target.value)} />
          <input style={styles.input} type="email" placeholder="Email address" value={reviewEmail} onChange={(e) => setReviewEmail(e.target.value)} />
          <textarea style={styles.textarea} placeholder="Tell us about your booking or travel experience." value={reviewMessage} onChange={(e) => setReviewMessage(e.target.value)} />
          {reviewNotice ? <div style={styles.notice}>{reviewNotice}</div> : null}
          <button style={styles.primaryBtn}>Share Your Experience</button>
        </form>
      )}
    </PortalShell>
  );
}

function SupportPortal() {
  return (
    <PortalShell title="Support Centre" subtitle="Helpful customer support before, during and after your stay." badge="Customer support">
      <div style={styles.cardGrid}>
        <InfoCard title="Before your trip" text="Get help reviewing destinations, accommodation options, dates, room choices and travel needs before booking." />
        <InfoCard title="During your stay" text="Access helpful guidance for local services, destination support and stay-related questions." />
        <InfoCard title="After your journey" text="Share your experience, request support and help us improve future guest journeys." />
        <InfoCard title="Contact MySpace Hotel" text="Reservations: reservations@myspace-hotel.com | General: info@myspace-hotel.com | Sales: sales@myspace-hotel.com | Accounts: accounts@myspace-hotel.com | Phone: +44 7707836674" />
      </div>
    </PortalShell>
  );
}

function PartnersPortal() {
  const [sent, setSent] = useState(false);
  const [form, setForm] = useState({
    companyName: "",
    contactName: "",
    email: "",
    phone: "",
    website: "",
    companyAddress: "",
    country: "",
    partnershipType: "Hotel or accommodation provider",
    expectedMonthlyBookings: "",
    pmsOrChannelManager: "",
    apiCapability: "Not sure",
    message: "",
  });

  function updateField(name, value) {
    setForm((prev) => ({ ...prev, [name]: value }));
  }

  async function submitPartnerForm(e) {
    e.preventDefault();

    try {
      await fetch(`${API_BASE}/api/partners/apply`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
    } catch {}

    setSent(true);
  }

  return (
    <PortalShell
      title="Industry Partnerships"
      subtitle="Apply to work with MySpace Hotel across accommodation, technology, transfers, insurance and destination services."
      badge="Partnerships"
    >
      <div style={styles.cardGrid}>
        <InfoCard title="Hotels and accommodation" text="List your property or accommodation portfolio with MySpace Hotel." />
        <InfoCard title="Technology partners" text="Connect rates, availability, inventory, booking and travel service workflows." />
        <InfoCard title="Travel service partners" text="Work with MySpace Hotel on transfers, insurance, attractions and guest support." />
      </div>

      {sent ? (
        <div style={styles.success}>
          Thank you. Your partnership application has been received by MySpace Hotel.
        </div>
      ) : (
        <form style={styles.form} onSubmit={submitPartnerForm}>
          <h2 style={styles.titleSmall}>Partnership Application</h2>

          <input style={styles.input} placeholder="Company name" value={form.companyName} onChange={(e) => updateField("companyName", e.target.value)} required />
          <input style={styles.input} placeholder="Contact name" value={form.contactName} onChange={(e) => updateField("contactName", e.target.value)} required />
          <input style={styles.input} type="email" placeholder="Email address" value={form.email} onChange={(e) => updateField("email", e.target.value)} required />
          <input style={styles.input} placeholder="Phone number" value={form.phone} onChange={(e) => updateField("phone", e.target.value)} />
          <input style={styles.input} placeholder="Website" value={form.website} onChange={(e) => updateField("website", e.target.value)} />
          <input style={styles.input} placeholder="Company address" value={form.companyAddress} onChange={(e) => updateField("companyAddress", e.target.value)} />
          <input style={styles.input} placeholder="Country / main operating market" value={form.country} onChange={(e) => updateField("country", e.target.value)} />

          <select style={styles.input} value={form.partnershipType} onChange={(e) => updateField("partnershipType", e.target.value)}>
            <option>Hotel or accommodation provider</option>
            <option>Channel manager or property technology</option>
            <option>Airport transfer partner</option>
            <option>Insurance partner</option>
            <option>Attractions or experiences partner</option>
            <option>Affiliate or marketing partner</option>
            <option>Other travel service partner</option>
          </select>

          <input style={styles.input} placeholder="Expected monthly bookings or enquiries" value={form.expectedMonthlyBookings} onChange={(e) => updateField("expectedMonthlyBookings", e.target.value)} />
          <input style={styles.input} placeholder="PMS / Channel Manager used, if applicable" value={form.pmsOrChannelManager} onChange={(e) => updateField("pmsOrChannelManager", e.target.value)} />

          <select style={styles.input} value={form.apiCapability} onChange={(e) => updateField("apiCapability", e.target.value)}>
            <option>Not sure</option>
            <option>API available</option>
            <option>Extranet available</option>
            <option>Channel manager connection available</option>
            <option>Email/manual onboarding only</option>
          </select>

          <textarea
            style={styles.textarea}
            placeholder="Tell us about your business, destinations covered, inventory, services, rates, or how you would like to work with MySpace Hotel."
            value={form.message}
            onChange={(e) => updateField("message", e.target.value)}
            required
          />

          <button style={styles.primaryBtn}>Submit Partnership Application</button>
        </form>
      )}
    </PortalShell>
  );
}
function BusinessPortal() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [portalNotice, setPortalNotice] = useState("");

  function handleLogin(e) {
    e.preventDefault();

    if (!email || !password) {
      setPortalNotice("Please enter your email address and password.");
      return;
    }

    setPortalNotice("Business portal access is being prepared. Approved partner login credentials will be issued by MySpace Hotel.");
  }

  return (
    <main style={styles.businessPage}>
      <section style={styles.loginGrid}>
        <div>
          <div style={styles.pill}>Secure business access</div>
          <h1 style={styles.portalTitle}>Business Portal</h1>
          <p style={styles.heroText}>Login area for approved hotels, accommodation partners and business users.</p>
          <div style={styles.securityList}>
            <div style={styles.promiseItem}>Partner enquiries and onboarding access</div>
            <div style={styles.promiseItem}>Future booking, inventory and account tools</div>
            <div style={styles.promiseItem}>Secure access for approved business users only</div>
          </div>
        </div>

        <form style={styles.loginCard} onSubmit={handleLogin}>
          <h2 style={styles.titleSmall}>Business Login</h2>
          <p style={styles.muted}>Enter your approved business credentials to continue.</p>
          <label style={styles.label}>Email address</label>
          <input style={styles.input} type="email" placeholder="business@example.com" value={email} onChange={(e) => setEmail(e.target.value)} />
          <label style={styles.label}>Password</label>
          <input style={styles.input} type="password" placeholder="Enter password" value={password} onChange={(e) => setPassword(e.target.value)} />
          <button style={styles.primaryBtn}>Login</button>
          {portalNotice ? <div style={styles.notice}>{portalNotice}</div> : null}
          <a style={styles.textLink} href={routeUrl(ROUTES.partners)}>Need access? Apply through Industry Partnerships</a>
        </form>
      </section>
    </main>
  );
}

function PortalShell({ title, subtitle, badge, children }) {
  return (
    <main style={styles.portalPage}>
      <section style={styles.portalHero}>
        <div style={styles.pill}>{badge}</div>
        <h1 style={styles.portalTitle}>{title}</h1>
        <p style={styles.heroText}>{subtitle}</p>
        <a style={styles.primaryLink} href={routeUrl(ROUTES.hotels)}>Open Hotel Search</a>
      </section>
      <section style={styles.portalContent}>{children}</section>
    </main>
  );
}

function Metric({ big, small }) {
  return (
    <div style={styles.metric}>
      <div style={styles.metricBig}>{big}</div>
      <div style={styles.muted}>{small}</div>
    </div>
  );
}

function InfoCard({ title, text }) {
  return (
    <div style={styles.infoCard}>
      <h3 style={styles.cardTitle}>{title}</h3>
      <p style={styles.cardText}>{text}</p>
    </div>
  );
}

function GuideCard({ title, text, href }) {
  return (
    <a style={styles.guideCard} href={href} target="_blank" rel="noreferrer">
      <h3 style={styles.cardTitle}>{title}</h3>
      <p style={styles.cardText}>{text}</p>
      <span style={styles.textLink}>Open guide</span>
    </a>
  );
}

function Footer() {
  return (
    <footer style={styles.footer}>
      <div style={styles.footerGrid}>
        <div>
          <div style={styles.footerBrand}>MYSPACE HOTEL</div>
          <div style={styles.footerText}>Trusted accommodation, clear pricing and travel support for guests worldwide.</div>
        </div>
        <div>
          <div style={styles.footerTitle}>Contact Directory</div>
          <div style={styles.footerText}>Reservations: reservations@myspace-hotel.com</div>
          <div style={styles.footerText}>General: info@myspace-hotel.com</div>
          <div style={styles.footerText}>Sales: sales@myspace-hotel.com</div>
          <div style={styles.footerText}>Accounts: accounts@myspace-hotel.com</div>
          <div style={styles.footerText}>Phone: +44 7707836674</div>
          <div style={styles.footerText}>Address: 17 Barleycorn Way, London E14 8DE</div>
        </div>
      </div>
    </footer>
  );
}

const styles = {
  page: { minHeight: "100vh", background: "#f4f7fb", color: "#0b1d51", fontFamily: "Arial, sans-serif" },
  header: { position: "sticky", top: 0, zIndex: 20, background: "#fff", borderBottom: "1px solid #dfe6f3", padding: "18px 28px", display: "flex", justifyContent: "space-between", gap: 20, alignItems: "center", flexWrap: "wrap" },
  brand: { textDecoration: "none", color: "#0b1d51" },
  logo: { fontSize: 40, fontWeight: 950, letterSpacing: "-1px", lineHeight: 1 },
  tagline: { marginTop: 7, color: "#5a6c8f", fontWeight: 800, fontSize: 14 },
  nav: { display: "flex", gap: 8, flexWrap: "wrap", justifyContent: "flex-end" },
  navLink: { padding: "10px 13px", borderRadius: 13, border: "1px solid #d5dff1", color: "#0b1d51", background: "#fff", textDecoration: "none", fontWeight: 850, fontSize: 14 },
  goldLink: { padding: "10px 13px", borderRadius: 13, color: "#0b1d51", background: "#f1bf22", textDecoration: "none", fontWeight: 950, fontSize: 14 },
  darkLink: { padding: "10px 13px", borderRadius: 13, color: "#fff", background: "#0b1d51", textDecoration: "none", fontWeight: 950, fontSize: 14 },
  hero: { background: "linear-gradient(135deg,#ffffff,#eaf1ff)" },
  heroInner: { padding: "46px 38px", maxWidth: 1540, margin: "0 auto" },
  heroGrid: { display: "grid", gridTemplateColumns: "minmax(0,1fr) 390px", gap: 28, alignItems: "center" },
  pill: { display: "inline-block", background: "#0b1d51", color: "#fff", borderRadius: 999, padding: "10px 16px", fontWeight: 950, marginBottom: 18 },
  heroTitle: { fontSize: 68, lineHeight: 0.98, margin: "0 0 18px", fontWeight: 950, letterSpacing: "-2px" },
  heroText: { fontSize: 22, lineHeight: 1.45, color: "#30466e", fontWeight: 750, maxWidth: 950 },
  promisePanel: { background: "#fff", borderRadius: 28, padding: 26, boxShadow: "0 12px 34px rgba(0,0,0,.10)" },
  panelMiniTitle: { margin: "0 0 14px", fontSize: 24, fontWeight: 950 },
  promiseItem: { background: "#f4f7fb", borderRadius: 16, padding: 14, marginTop: 10, color: "#30466e", fontWeight: 850 },
  searchCard: { marginTop: 34, background: "#fff", borderRadius: 30, padding: 24, display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(160px,1fr))", gap: 16, alignItems: "end", boxShadow: "0 10px 30px rgba(0,0,0,.08)" },
  converterCard: { marginTop: 22, background: "#fff", borderRadius: 28, padding: 22, display: "grid", gridTemplateColumns: "2fr 1fr 1fr 1fr 1fr", gap: 14, alignItems: "end", boxShadow: "0 8px 24px rgba(0,0,0,.07)" },
  converterTitle: { fontSize: 24, fontWeight: 950 },
  convertResult: { background: "#ecfdf3", color: "#166534", borderRadius: 16, padding: 16, textAlign: "center", fontWeight: 950, fontSize: 18 },
  metrics: { marginTop: 28, display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(180px,1fr))", gap: 18 },
  metric: { background: "#fff", borderRadius: 22, padding: 22, textAlign: "center", boxShadow: "0 8px 22px rgba(0,0,0,.05)" },
  metricBig: { fontSize: 32, fontWeight: 950 },
  field: { display: "flex", flexDirection: "column", gap: 8 },
  label: { fontWeight: 950, fontSize: 15 },
  input: { width: "100%", boxSizing: "border-box", padding: 15, borderRadius: 15, border: "1px solid #d8e0ef", background: "#fff", fontSize: 15 },
  primaryBtn: { background: "#2750db", color: "#fff", border: "none", borderRadius: 15, padding: 16, fontSize: 17, fontWeight: 950, cursor: "pointer", textAlign: "center" },
  darkBtn: { marginTop: 16, width: "100%", background: "#0b1d51", color: "#fff", border: "none", borderRadius: 15, padding: 15, fontSize: 16, fontWeight: 950, cursor: "pointer" },
  payBtn: { marginTop: 18, width: "100%", background: "#10b981", color: "#fff", border: "none", borderRadius: 17, padding: 17, fontSize: 17, fontWeight: 950, cursor: "pointer" },
  outlineBtn: { display: "block", marginTop: 12, border: "2px solid #d9e4f2", borderRadius: 17, padding: 15, textAlign: "center", color: "#0b1d51", background: "#fff", textDecoration: "none", fontWeight: 950 },
  primaryLink: { display: "inline-block", background: "#2750db", color: "#fff", borderRadius: 16, padding: "14px 18px", textDecoration: "none", fontWeight: 950, textAlign: "center" },
  payLinkBtn: { display: "inline-block", background: "#10b981", color: "#fff", borderRadius: 16, padding: "15px 18px", textDecoration: "none", fontWeight: 950, textAlign: "center" },
  textLink: { color: "#2750db", textDecoration: "none", fontWeight: 950 },
  notice: { maxWidth: 1450, margin: "20px auto", background: "#fff7ed", color: "#9a3412", border: "1px solid #fed7aa", borderRadius: 18, padding: 18, fontWeight: 900 },
  contentGrid: { maxWidth: 1540, margin: "0 auto", padding: "40px 34px 60px", display: "grid", gridTemplateColumns: "minmax(0,1fr) 420px", gap: 28, alignItems: "start" },
  title: { fontSize: 42, margin: "0 0 10px", fontWeight: 950 },
  titleSmall: { fontSize: 34, margin: "0 0 10px", fontWeight: 950 },
  sectionText: { fontSize: 18, lineHeight: 1.55, color: "#50678f", fontWeight: 750, maxWidth: 950 },
  empty: { background: "#fff", borderRadius: 22, padding: 30, fontSize: 19, fontWeight: 850, margin: "18px 0", color: "#50678f" },
  hotelGrid: { display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(300px,1fr))", gap: 24 },
  hotelCard: { background: "#fff", borderRadius: 26, overflow: "hidden", border: "3px solid transparent", boxShadow: "0 8px 25px rgba(0,0,0,.08)" },
  hotelCardSelected: { background: "#fff", borderRadius: 26, overflow: "hidden", border: "3px solid #10b981", boxShadow: "0 8px 25px rgba(0,0,0,.08)" },
  hotelImage: { width: "100%", height: 220, objectFit: "cover" },
  noImage: { height: 220, display: "flex", alignItems: "center", justifyContent: "center", background: "#e8eef8", color: "#50678f", fontWeight: 950 },
  hotelBody: { padding: 22 },
  greenBadge: { display: "inline-block", background: "#ecfdf3", color: "#166534", borderRadius: 999, padding: "7px 12px", fontSize: 12, fontWeight: 950, marginBottom: 12 },
  hotelName: { fontSize: 23, margin: "0 0 8px", lineHeight: 1.2, fontWeight: 950 },
  muted: { color: "#60708a", fontWeight: 750, lineHeight: 1.45 },
  tagRow: { display: "flex", gap: 8, flexWrap: "wrap", marginTop: 14 },
  tag: { background: "#f4f7fb", color: "#50678f", borderRadius: 999, padding: "7px 10px", fontWeight: 850, fontSize: 12 },
  priceLine: { marginTop: 16, color: "#2750db", fontSize: 28, fontWeight: 950 },
  small: { color: "#61718f", fontSize: 13, fontWeight: 800, lineHeight: 1.4 },
  summary: { position: "sticky", top: 104, background: "#fff", borderRadius: 26, padding: 24, boxShadow: "0 8px 25px rgba(0,0,0,.08)" },
  summaryTitle: { fontSize: 30, margin: "0 0 8px", fontWeight: 950 },
  softBox: { marginTop: 18, background: "#f4f7fb", borderRadius: 18, padding: 18, color: "#60708a", fontWeight: 850, lineHeight: 1.5 },
  bookingFirstBox: { marginTop: 18, background: "#ecfdf3", border: "1px solid #bbf7d0", borderRadius: 18, padding: 18, textAlign: "center" },
  bookingFirstTitle: { color: "#166534", fontWeight: 950, fontSize: 18, marginBottom: 8 },
  bookingFirstText: { color: "#315445", fontWeight: 800, lineHeight: 1.55 },
  selectedName: { margin: "20px 0 8px", fontSize: 23, lineHeight: 1.25, fontWeight: 950 },
  totalBox: { marginTop: 20, background: "#ecfdf3", borderRadius: 20, padding: 20 },
  totalLabel: { color: "#166534", fontWeight: 950 },
  totalPrice: { marginTop: 8, fontSize: 34, fontWeight: 950 },
  customerBox: { marginTop: 18, display: "grid", gap: 12, background: "#f8fafc", borderRadius: 20, padding: 18, border: "1px solid #d9e4f2" },
  customerTitle: { margin: 0, fontSize: 20, fontWeight: 950 },
  referralNote: { marginTop: 16, background: "#ecfdf3", color: "#166534", borderRadius: 16, padding: 14, fontWeight: 900, lineHeight: 1.4 },
  textareaSmall: { padding: 15, borderRadius: 15, border: "1px solid #d8e0ef", minHeight: 85, fontSize: 15, fontFamily: "Arial, sans-serif" },
  textarea: { padding: 15, borderRadius: 15, border: "1px solid #d8e0ef", minHeight: 130, fontSize: 15, fontFamily: "Arial, sans-serif" },
  panel: { marginTop: 30, background: "#fff", borderRadius: 28, padding: 28, boxShadow: "0 8px 25px rgba(0,0,0,.06)" },
  staySavedPanel: { marginTop: 30, background: "#fff", borderRadius: 28, padding: 28, boxShadow: "0 8px 25px rgba(0,0,0,.06)", display: "grid", gridTemplateColumns: "minmax(0,1fr) 320px", gap: 22, alignItems: "center", border: "2px solid #bbf7d0" },
  savedStayActions: { display: "grid", gap: 14 },
  klookPanel: { marginTop: 30, background: "#fff", borderRadius: 28, padding: 28, boxShadow: "0 8px 25px rgba(0,0,0,.06)", border: "1px solid #dce6f3" },
  klookWidgetShell: { marginTop: 22, minHeight: 430, background: "#f8fafc", borderRadius: 22, padding: 16, overflow: "hidden", border: "1px solid #dce6f3" },
  customerReminderBox: { marginTop: 18, background: "#ecfdf3", color: "#166534", borderRadius: 18, padding: 18, fontWeight: 950, lineHeight: 1.5, textAlign: "center" },
  customerExperienceText: { marginTop: 18, background: "#f4f7fc", padding: 18, borderRadius: 14, textAlign: "center", fontSize: 18, fontWeight: 700, color: "#0a2458", lineHeight: 1.5 },
  panelHeader: { display: "flex", justifyContent: "space-between", gap: 20, flexWrap: "wrap", alignItems: "flex-start" },
  kicker: { color: "#2750db", fontWeight: 950, letterSpacing: ".04em", textTransform: "uppercase", fontSize: 13, marginBottom: 8 },
  compareGrid: { display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(230px,1fr))", gap: 16, marginTop: 20 },
  compareCard: { border: "1px solid #dce6f3", borderRadius: 22, padding: 20, background: "#f8fafc" },
  cardTitle: { fontSize: 22, margin: "0 0 12px", fontWeight: 950 },
  strong: { fontWeight: 950, color: "#30466e" },
  cardText: { color: "#445b82", lineHeight: 1.65, fontSize: 16, fontWeight: 650 },
  comparePrice: { marginTop: 14, color: "#2750db", fontSize: 24, fontWeight: 950 },
  liveCompareBox: { marginTop: 22, background: "#ecfdf3", border: "1px solid #bbf7d0", borderRadius: 24, padding: 24, display: "grid", gridTemplateColumns: "minmax(0,1.4fr) 260px", gap: 20, alignItems: "center" },
  liveComparePrice: { background: "#fff", color: "#0b1d51", borderRadius: 20, padding: 22, fontSize: 30, fontWeight: 950, textAlign: "center", boxShadow: "0 8px 20px rgba(0,0,0,.05)" },
  altGrid: { display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(230px,1fr))", gap: 18, marginTop: 18 },
  altCard: { background: "#fff", border: "1px solid #dce6f3", borderRadius: 22, overflow: "hidden" },
  altImage: { width: "100%", height: 145, objectFit: "cover" },
  altNoImage: { height: 145, display: "flex", alignItems: "center", justifyContent: "center", background: "#e8eef8", color: "#50678f", fontWeight: 950 },
  altBody: { padding: 16 },
  altName: { margin: "0 0 8px", fontSize: 18, fontWeight: 950 },
  portalPage: { minHeight: "70vh", background: "#f4f7fb" },
  portalHero: { padding: "80px 40px", background: "linear-gradient(135deg,#ffffff,#eaf1ff)" },
  portalTitle: { fontSize: 64, lineHeight: 1, margin: "0 0 18px", fontWeight: 950, letterSpacing: "-2px" },
  portalContent: { maxWidth: 1500, margin: "0 auto", padding: "50px 40px 70px" },
  cardGrid: { display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(260px,1fr))", gap: 22 },
  infoCard: { background: "#fff", borderRadius: 24, padding: 28, minHeight: 165, border: "1px solid #dce6f3", boxShadow: "0 8px 24px rgba(0,0,0,.05)" },
  guideCard: { background: "#fff", borderRadius: 24, padding: 28, minHeight: 165, border: "1px solid #dce6f3", boxShadow: "0 8px 24px rgba(0,0,0,.05)", color: "#0b1d51", textDecoration: "none" },
  faqList: { display: "grid", gap: 18, maxWidth: 1000 },
  form: { marginTop: 28, display: "grid", gap: 16, maxWidth: 850, background: "#fff", padding: 24, borderRadius: 24, boxShadow: "0 8px 24px rgba(0,0,0,.05)" },
  success: { marginTop: 22, background: "#ecfdf3", color: "#166534", borderRadius: 18, padding: 20, fontWeight: 950 },
  businessPage: { minHeight: "75vh", background: "linear-gradient(135deg,#ffffff,#eaf1ff)", padding: "70px 40px" },
  loginGrid: { maxWidth: 1250, margin: "0 auto", display: "grid", gridTemplateColumns: "1fr 460px", gap: 40, alignItems: "center" },
  loginCard: { background: "#fff", borderRadius: 30, padding: 34, boxShadow: "0 14px 40px rgba(0,0,0,.12)", display: "grid", gap: 14 },
  securityList: { marginTop: 28, display: "grid", gap: 14, maxWidth: 620 },
  footer: { background: "#071538", color: "#fff", padding: "34px 40px" },
  footerGrid: { maxWidth: 1500, margin: "0 auto", display: "grid", gridTemplateColumns: "2fr 1fr", gap: 26 },
  footerBrand: { fontSize: 32, fontWeight: 950, marginBottom: 10 },
  footerTitle: { fontSize: 18, fontWeight: 950, marginBottom: 10 },
  footerText: { fontSize: 16, lineHeight: 1.6, color: "#dbe7ff", fontWeight: 650 },
};






















