import React, { useEffect, useMemo, useState } from "react";
import ReactGA from "react-ga4";

const API_BASE =
  import.meta.env.VITE_API_BASE ||
  import.meta.env.VITE_API_BASE_URL ||
  "http://127.0.0.1:5050";

const GA_MEASUREMENT_ID = import.meta.env.VITE_GA_MEASUREMENT_ID || "";

let GA_READY = false;

function initGA() {
  if (!GA_READY && GA_MEASUREMENT_ID && GA_MEASUREMENT_ID.startsWith("G-")) {
    ReactGA.initialize(GA_MEASUREMENT_ID);
    GA_READY = true;
  }
}

function trackPage(pageTitle) {
  initGA();

  if (!GA_READY) return;

  ReactGA.send({
    hitType: "pageview",
    page: window.location.pathname + window.location.search,
    title: pageTitle || document.title || "MySpace Hotel",
  });
}

function trackEvent(action, params = {}) {
  initGA();

  if (!GA_READY) return;

  ReactGA.event(action, {
    app_name: "MySpace Hotel",
    ...params,
  });
}

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

function safeText(v) {
  return String(v || "").trim();
}

function openLink(url) {
  if (!url) return;

  trackEvent("guide_open_map", {
    url,
  });

  window.open(url, "_blank", "noopener,noreferrer");
}

function PropertyImage({ hotel }) {
  const [failed, setFailed] = useState(false);

  if (!hotel?.image_url || failed) {
    return (
      <div style={styles.realImageMissing}>
        <div style={styles.imageBadge}>MYSPACE HOTEL</div>
        <div style={styles.imageMissingTitle}>Verified property image coming soon</div>
        <div style={styles.imageMissingText}>No fake hotel photos are displayed.</div>
      </div>
    );
  }

  return (
    <img
      loading="lazy"
      decoding="async"
      src={hotel.image_url}
      alt={hotel.hotel_name || "Hotel"}
      style={styles.hotelImage}
      onError={() => setFailed(true)}
    />
  );
}

function PlaceCard({ place }) {
  return (
    <div style={styles.placeCard}>
      <div style={styles.placeName}>{place.name || "Location"}</div>
      {place.address && <div style={styles.placeText}>{place.address}</div>}
      {place.phone && <div style={styles.placePhone}>{place.phone}</div>}
      {place.rating && <div style={styles.placeRating}>Rating: {place.rating}</div>}
      {place.open_now && <div style={styles.placeOpen}>{place.open_now}</div>}
      {place.maps && (
        <button style={styles.mapsButton} onClick={() => openLink(place.maps)}>
          Open in Maps
        </button>
      )}
    </div>
  );
}

function GuideSection({ title, items }) {
  return (
    <div style={styles.guideSection}>
      <h2 style={styles.guideSectionTitle}>{title}</h2>
      {Array.isArray(items) && items.length > 0 ? (
        <div style={styles.guideGrid}>
          {items.map((item, i) => (
            <PlaceCard key={`${title}-${i}`} place={item} />
          ))}
        </div>
      ) : (
        <div style={styles.emptyBox}>No live information available.</div>
      )}
    </div>
  );
}

function InfoPage({ title, subtitle, children }) {
  useEffect(() => {
    trackPage(title);
  }, [title]);

  return (
    <div style={styles.infoPage}>
      <div style={styles.infoCardWide}>
        <div style={styles.brandSmall}>MYSPACE HOTEL</div>
        <h1 style={styles.infoTitle}>{title}</h1>
        {subtitle && <p style={styles.infoSubtitle}>{subtitle}</p>}
        <div style={styles.infoBody}>{children}</div>
        <button
          style={styles.goldSmall}
          onClick={() => {
            trackEvent("navigation_back_to_search", { from_page: title });
            window.location.href = "/";
          }}
        >
          Back to hotel search
        </button>
      </div>
    </div>
  );
}

function FAQs() {
  return (
    <InfoPage title="Frequently asked questions" subtitle="Clear answers before customers reserve or pay.">
      <div style={styles.simpleGrid}>
        <div style={styles.simpleBox}>
          <b>Can I pay online?</b>
          <br />
          Yes. Payment is enabled only when a valid live supplier rate is available.
        </div>
        <div style={styles.simpleBox}>
          <b>Are images fake?</b>
          <br />
          No. Missing hotel photos show a trust notice instead of fake hotel images.
        </div>
        <div style={styles.simpleBox}>
          <b>Why no price?</b>
          <br />
          Some hotels are catalogue-only or unavailable for the selected dates.
        </div>
        <div style={styles.simpleBox}>
          <b>Will I get confirmation?</b>
          <br />
          Reservation updates are sent to the email address provided at checkout.
        </div>
      </div>
    </InfoPage>
  );
}

function Terms() {
  return (
    <InfoPage title="Booking terms" subtitle="Customer trust depends on accurate hotel and rate information.">
      <div style={styles.simpleGrid}>
        <div style={styles.simpleBox}>
          Review hotel name, room, board, dates, guests, currency, amount, and cancellation details before payment.
        </div>
        <div style={styles.simpleBox}>
          Prices and availability can change until the reservation is completed and supplier confirmation is received.
        </div>
        <div style={styles.simpleBox}>
          Payment is enabled only for hotels with valid live rate keys and payable amounts.
        </div>
        <div style={styles.simpleBox}>
          No fake photos, no fake prices, and no misleading availability should be shown.
        </div>
      </div>
    </InfoPage>
  );
}

function Support() {
  return (
    <InfoPage title="Customer support" subtitle="Reservation support for safer booking decisions.">
      <div style={styles.simpleGrid}>
        <div style={styles.simpleBox}>
          <b>Email</b>
          <br />
          reservations@myspace-hotel.com
        </div>
        <div style={styles.simpleBox}>
          <b>Booking help</b>
          <br />
          Include hotel name, dates, destination, and booking email.
        </div>
        <div style={styles.simpleBox}>
          <b>Check-in problems</b>
          <br />
          Include reservation code, hotel name, guest name, and the issue at reception.
        </div>
        <div style={styles.simpleBox}>
          <b>Special requests</b>
          <br />
          Add mobility, room, arrival, or family requirements before payment.
        </div>
      </div>
    </InfoPage>
  );
}

function TravelGuidePage() {
  const [country, setCountry] = useState("United Kingdom");
  const [city, setCity] = useState("London");
  const [area, setArea] = useState("Tower Hamlets");
  const [guide, setGuide] = useState(null);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");

  async function loadGuide() {
    setLoading(true);
    setMessage("");
    setGuide(null);

    trackEvent("travel_guide_search", {
      country,
      city,
      area,
    });

    try {
      const params = new URLSearchParams();
      params.set("country", country);
      params.set("city", city);
      if (area.trim()) params.set("area", area.trim());

      const res = await fetch(`${API_BASE}/api/travel-guide/live?${params.toString()}`);
      const data = await res.json();

      if (!data.ok) {
        setMessage(data.message || "Guide unavailable.");
        trackEvent("travel_guide_failed", {
          country,
          city,
          area,
        });
        return;
      }

      setGuide(data.guide);

      trackEvent("travel_guide_loaded", {
        country,
        city,
        area,
        destination: data.guide?.destination || "",
      });
    } catch {
      setMessage("Could not load travel guide.");
      trackEvent("travel_guide_error", {
        country,
        city,
        area,
      });
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    trackPage("Premium live destination guide");
    loadGuide();
  }, []);

  return (
    <div style={styles.pageScrollable}>
      <section style={styles.hero}>
        <div>
          <div style={styles.brand}>MYSPACE HOTEL</div>
          <h1 style={styles.heroTitle}>Premium live destination guide.</h1>
          <p style={styles.heroText}>
            Real local emergency contacts, hospitals, police stations, pharmacies, transport,
            restaurants, attractions, museums, taxis, and local services for the customer’s exact destination.
          </p>
        </div>

        <div style={styles.guideSearchCard}>
          <label style={styles.formLabel}>Country</label>
          <input style={styles.input} value={country} onChange={(e) => setCountry(e.target.value)} />

          <label style={styles.formLabel}>City</label>
          <input style={styles.input} value={city} onChange={(e) => setCity(e.target.value)} />

          <label style={styles.formLabel}>Area / District</label>
          <input style={styles.input} value={area} onChange={(e) => setArea(e.target.value)} />

          <button style={styles.goldButton} onClick={loadGuide} disabled={loading}>
            {loading ? "Building live guide..." : "Build Live Guide"}
          </button>

          <button
            style={styles.reserveMini}
            onClick={() => {
              trackEvent("navigation_back_to_portal", { from_page: "guide" });
              window.location.href = "/";
            }}
          >
            Back to hotel portal
          </button>
        </div>
      </section>

      {message && <div style={styles.notice}>{message}</div>}

      {guide && (
        <>
          <div style={styles.destinationBanner}>{guide.destination}</div>

          <div style={styles.emergencyBox}>
            <h2 style={styles.emergencyTitle}>Emergency contacts</h2>
            <div style={styles.emergencyGrid}>
              {Object.entries(guide.emergency || {}).map(([k, v]) => (
                <div key={k} style={styles.emergencyItem}>
                  <div style={styles.emergencyKey}>{k.replace(/_/g, " ").toUpperCase()}</div>
                  <div style={styles.emergencyValue}>{v}</div>
                </div>
              ))}
            </div>
          </div>

          <GuideSection title="Hospitals" items={guide.hospitals} />
          <GuideSection title="Police & Safety" items={guide.police} />
          <GuideSection title="Pharmacies" items={guide.pharmacies} />
          <GuideSection title="Restaurants & Food" items={guide.restaurants} />
          <GuideSection title="Airports" items={guide.airports} />
          <GuideSection title="Train Stations" items={guide.stations} />
          <GuideSection title="Museums" items={guide.museums} />
          <GuideSection title="Attractions" items={guide.attractions} />
          <GuideSection title="Taxi Services" items={guide.taxis} />
        </>
      )}
    </div>
  );
}

function Confirmed() {
  const params = new URLSearchParams(window.location.search);
  const code = params.get("code") || "Your reservation";
  const [status, setStatus] = useState("Confirming payment update...");

  useEffect(() => {
    trackPage("Reservation confirmed");
    trackEvent("payment_returned_to_app", {
      reservation_code: code,
    });

    if (!code || code === "Your reservation") return;

    fetch(`${API_BASE}/reservation/${code}/mark-paid`, { method: "POST" })
      .then(async (res) => {
        const data = await res.json().catch(() => ({}));

        if (res.ok && data.ok && data.supplier_reference) {
          setStatus("Payment received. Supplier booking confirmed.");
          trackEvent("supplier_booking_confirmed", {
            reservation_code: code,
            supplier_reference: data.supplier_reference,
          });
          return;
        }

        setStatus("Payment received, but supplier confirmation is still being checked.");
        trackEvent("supplier_booking_pending_or_failed", {
          reservation_code: code,
          message: data.message || "",
        });
      })
      .catch(() => {
        setStatus("Payment received. Reservation update is being processed securely.");
        trackEvent("supplier_booking_check_error", {
          reservation_code: code,
        });
      });
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
        <button
          style={styles.goldSmall}
          onClick={() => {
            trackEvent("navigation_back_to_search", {
              from_page: "reservation-confirmed",
              reservation_code: code,
            });
            window.location.href = "/";
          }}
        >
          Back to hotel search
        </button>
      </div>
    </div>
  );
}

export default function App() {
  const path = window.location.pathname;
  const pageParams = new URLSearchParams(window.location.search);
  const page = pageParams.get("page");

  useEffect(() => {
    initGA();
  }, []);

  if (path === "/travel" || page === "travel") return <TravelGuidePage />;
  if (path === "/faq" || page === "faq") return <FAQs />;
  if (path === "/terms" || page === "terms") return <Terms />;
  if (path === "/support" || page === "support") return <Support />;
  if (path === "/reservation-confirmed") return <Confirmed />;

  const [catalog, setCatalog] = useState([]);
  const [country, setCountry] = useState("");
  const [city, setCity] = useState("");
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

  const [targetCurrency, setTargetCurrency] = useState("USD");
  const [convertedTotal, setConvertedTotal] = useState("");

  const [loadingCatalog, setLoadingCatalog] = useState(true);
  const [loading, setLoading] = useState(false);
  const [requesting, setRequesting] = useState(false);
  const [message, setMessage] = useState("");

  useEffect(() => {
    trackPage("Hotel search portal");
  }, []);

  const countries = useMemo(() => {
    return [...catalog]
      .filter((c) => safeText(c.country))
      .sort((a, b) => safeText(a.country).localeCompare(safeText(b.country)));
  }, [catalog]);

  const selectedCountry = useMemo(() => {
    return countries.find((x) => x.country === country) || countries[0] || null;
  }, [countries, country]);

  const cities = useMemo(() => {
    const raw = Array.isArray(selectedCountry?.cities) ? selectedCountry.cities : [];
    const map = new Map();

    for (const c of raw) {
      const cityName = safeText(c.city);
      if (!cityName) continue;
      const key = cityName.toLowerCase();
      if (!map.has(key)) map.set(key, c);
    }

    return [...map.values()].sort((a, b) => safeText(a.city).localeCompare(safeText(b.city)));
  }, [selectedCountry]);

  function clearConverted() {
    setConvertedTotal("");
  }

  async function convertTotal() {
    if (!selectedHotel?.live_rate_ready || !Number(selectedHotel?.first_rate?.amount || 0)) {
      setConvertedTotal("0.00");
      return;
    }

    trackEvent("currency_convert_clicked", {
      hotel_id: selectedHotel.hotel_id || "",
      hotel_name: selectedHotel.hotel_name || "",
      from_currency: selectedHotel.first_rate.currency || "",
      to_currency: targetCurrency,
      amount: Number(selectedHotel.first_rate.amount || 0),
    });

    try {
      const params = new URLSearchParams();
      params.set("amount", String(Number(selectedHotel.first_rate.amount || 0)));
      params.set("from", selectedHotel.first_rate.currency);
      params.set("to", targetCurrency);

      const res = await fetch(`${API_BASE}/api/currency/convert?${params.toString()}`);
      const data = await res.json();

      if (!data.ok) {
        setConvertedTotal("Conversion unavailable");
        trackEvent("currency_convert_failed", {
          to_currency: targetCurrency,
        });
        return;
      }

      setConvertedTotal(`${targetCurrency} ${money(data.converted)}`);

      trackEvent("currency_convert_success", {
        to_currency: targetCurrency,
        converted: Number(data.converted || 0),
      });
    } catch {
      setConvertedTotal("Conversion unavailable");
      trackEvent("currency_convert_error", {
        to_currency: targetCurrency,
      });
    }
  }

  async function runSearch(nextCountry = country, nextCity = city) {
    const searchCountry = safeText(nextCountry);
    const searchCity = safeText(nextCity);

    if (!searchCountry || !searchCity) {
      setMessage("Choose a country and city first.");
      return;
    }

    setLoading(true);
    setSelectedHotel(null);
    clearConverted();
    setMessage("");

    trackEvent("hotel_search_started", {
      country: searchCountry,
      city: searchCity,
      area,
      keyword,
      checkin,
      checkout,
      guests,
      rooms,
    });

    try {
      const params = new URLSearchParams();
      params.set("country", searchCountry);
      params.set("city", searchCity);
      params.set("checkin", checkin);
      params.set("checkout", checkout);
      params.set("guests", String(guests));
      params.set("rooms", String(rooms));

      if (area.trim()) params.set("area", area.trim());
      if (keyword.trim()) params.set("keyword", keyword.trim());

      const res = await fetch(`${API_BASE}/api/hotels/search?${params.toString()}`);
      const data = await res.json();

      const list = Array.isArray(data.hotels) ? data.hotels : [];
      setHotels(list);

      trackEvent("hotel_search_completed", {
        country: searchCountry,
        city: searchCity,
        area,
        keyword,
        result_count: list.length,
        live_rate_count: list.filter((h) => h.live_rate_ready).length,
      });

      if (list.length > 0) {
        setSelectedHotel(list[0]);
        setMessage(`${list.length} best matches found in ${searchCity}.`);
      } else {
        setMessage("No matching hotels found. Try a shorter hotel name, area, or landmark.");
      }
    } catch {
      setHotels([]);
      setMessage("Backend unavailable. Restart backend and frontend.");

      trackEvent("hotel_search_error", {
        country: searchCountry,
        city: searchCity,
      });
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    async function loadCatalog() {
      setLoadingCatalog(true);

      try {
        const res = await fetch(`${API_BASE}/api/real-catalog/destinations`);
        const data = await res.json();
        const loadedCountries = Array.isArray(data.countries) ? data.countries : [];

        setCatalog(loadedCountries);

        trackEvent("catalog_loaded", {
          countries_count: loadedCountries.length,
        });

        const uk =
          loadedCountries.find((c) => safeText(c.country).toLowerCase() === "united kingdom") ||
          loadedCountries[0];

        const ukCities = Array.isArray(uk?.cities) ? uk.cities : [];
        const london =
          ukCities.find((c) => safeText(c.city).toLowerCase() === "london") ||
          ukCities[0];

        const firstCountry = safeText(uk?.country);
        const firstCity = safeText(london?.city);

        setCountry(firstCountry);
        setCity(firstCity);

        if (firstCountry && firstCity) {
          setTimeout(() => runSearch(firstCountry, firstCity), 150);
        }
      } catch {
        setMessage("Could not load country and city catalogue.");

        trackEvent("catalog_load_error", {});
      } finally {
        setLoadingCatalog(false);
      }
    }

    loadCatalog();
  }, []);

  function changeCountry(nextCountry) {
    const found = countries.find((x) => x.country === nextCountry);
    const cityList = Array.isArray(found?.cities) ? found.cities : [];
    const firstCity = safeText(cityList[0]?.city);

    setCountry(nextCountry);
    setCity(firstCity);
    setHotels([]);
    setSelectedHotel(null);
    clearConverted();
    setMessage(firstCity ? "Country changed. Press Search." : "No city found for this country.");

    trackEvent("country_changed", {
      country: nextCountry,
      first_city: firstCity,
    });
  }

  function changeCity(nextCity) {
    setCity(nextCity);
    setHotels([]);
    setSelectedHotel(null);
    clearConverted();
    setMessage("City changed. Press Search.");

    trackEvent("city_changed", {
      country,
      city: nextCity,
    });
  }

  function selectHotel(hotel) {
    setSelectedHotel(hotel);
    clearConverted();

    trackEvent("hotel_selected", {
      hotel_id: hotel.hotel_id || "",
      hotel_name: hotel.hotel_name || "",
      country: hotel.country || "",
      city: hotel.city || "",
      live_rate_ready: Boolean(hotel.live_rate_ready),
      amount: Number(hotel?.first_rate?.amount || 0),
      currency: hotel?.first_rate?.currency || "",
    });
  }

  async function requestBooking(hotel = selectedHotel) {
    if (!hotel) return setMessage("Select a live-rate hotel first.");

    if (!hotel.live_rate_ready || !Number(hotel?.first_rate?.amount || 0)) {
      trackEvent("payment_blocked_no_live_rate", {
        hotel_id: hotel.hotel_id || "",
        hotel_name: hotel.hotel_name || "",
      });
      return setMessage("Payment blocked because this hotel has no live rate.");
    }

    if (!customerName.trim() || !customerEmail.trim()) {
      trackEvent("payment_blocked_missing_customer", {
        hotel_id: hotel.hotel_id || "",
        hotel_name: hotel.hotel_name || "",
      });
      return setMessage("Enter your name and email before payment.");
    }

    selectHotel(hotel);
    setRequesting(true);
    setMessage("Preparing secure Stripe checkout...");

    trackEvent("payment_attempt_started", {
      hotel_id: hotel.hotel_id || "",
      hotel_name: hotel.hotel_name || "",
      country: hotel.country || "",
      city: hotel.city || "",
      amount: Number(hotel?.first_rate?.amount || 0),
      currency: hotel?.first_rate?.currency || "",
    });

    try {
      const rate = hotel.first_rate || {};

      const payload = {
        hotel_id: hotel.hotel_id,
        hotel_name: hotel.hotel_name,
        destination: `${hotel.city}, ${hotel.country}`,
        checkin,
        checkout,
        guests: Number(guests),
        rooms: Number(rooms),
        customer_name: customerName.trim(),
        customer_email: customerEmail.trim(),
        customer_phone: customerPhone.trim(),
        note: note.trim(),
        rate_key: rate.rate_key,
        amount: Number(rate.supplier_amount || rate.supplier_total || rate.amount || 0),
        supplier_total: Number(rate.supplier_total || rate.supplier_amount || rate.amount || 0),
        currency: rate.currency,
        room_name: rate.room_name,
        board_name: rate.board_name,
        payment_type: rate.payment_type,
        cancellation_policies: rate.cancellation_policies || [],
      };

      const res = await fetch(`${API_BASE}/reservation-request`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const data = await res.json();

      if (!res.ok || !data.ok) {
        setMessage(data.message || "Could not prepare secure checkout.");

        trackEvent("payment_checkout_failed", {
          hotel_id: hotel.hotel_id || "",
          hotel_name: hotel.hotel_name || "",
          message: data.message || "",
        });

        return;
      }

      trackEvent("payment_checkout_created", {
        hotel_id: hotel.hotel_id || "",
        hotel_name: hotel.hotel_name || "",
        reservation_code: data.reservation_code || "",
        currency: rate.currency || "",
        amount: Number(rate.amount || 0),
      });

      if (data.payment_url) {
        window.location.href = data.payment_url;
        return;
      }

      setMessage(`Reservation created: ${data.reservation_code}.`);
    } catch {
      setMessage("Secure booking service unavailable.");

      trackEvent("payment_checkout_error", {
        hotel_id: hotel.hotel_id || "",
        hotel_name: hotel.hotel_name || "",
      });
    } finally {
      setRequesting(false);
    }
  }

  const selectedCanPay =
    selectedHotel?.live_rate_ready &&
    selectedHotel?.first_rate?.rate_key &&
    Number(selectedHotel?.first_rate?.amount || 0) > 0;

  return (
    <div style={styles.page}>
      <section style={styles.hero}>
        <div>
          <div style={styles.brand}>MYSPACE HOTEL</div>
          <h1 style={styles.heroTitle}>Hotelbeds live rates with secure reserve and pay.</h1>
          <p style={styles.heroText}>
            Full supplier catalogue loaded. Payment is only available for hotels with live supplier rates.
          </p>
        </div>

        <div style={styles.buttonRow}>
          <button
            style={styles.whiteButton}
            onClick={() => {
              trackEvent("top_nav_clicked", { page: "guide" });
              window.location.href = "/?page=travel";
            }}
          >
            Guide
          </button>
          <button
            style={styles.whiteButton}
            onClick={() => {
              trackEvent("top_nav_clicked", { page: "faq" });
              window.location.href = "/?page=faq";
            }}
          >
            FAQ
          </button>
          <button
            style={styles.whiteButton}
            onClick={() => {
              trackEvent("top_nav_clicked", { page: "terms" });
              window.location.href = "/?page=terms";
            }}
          >
            Terms
          </button>
          <button
            style={styles.whiteButton}
            onClick={() => {
              trackEvent("top_nav_clicked", { page: "support" });
              window.location.href = "/?page=support";
            }}
          >
            Contact
          </button>
        </div>
      </section>

      <section style={styles.mainGrid}>
        <div style={styles.column}>
          <div style={styles.label}>SEARCH</div>

          <div style={styles.searchBox}>
            <p style={styles.muted}>
              {loadingCatalog
                ? "Loading catalogue..."
                : `${countries.length} countries loaded. Choose country and city.`}
            </p>

            <label style={styles.formLabel}>Country</label>
            <select style={styles.input} value={country} onChange={(e) => changeCountry(e.target.value)}>
              {countries.map((c) => (
                <option key={c.country} value={c.country}>
                  {c.country}
                </option>
              ))}
            </select>

            <label style={styles.formLabel}>City</label>
            <select style={styles.input} value={city} onChange={(e) => changeCity(e.target.value)}>
              {cities.map((c) => (
                <option key={`${country}-${c.city}`} value={c.city}>
                  {c.city}
                </option>
              ))}
            </select>

            <label style={styles.formLabel}>Area</label>
            <input
              style={styles.input}
              value={area}
              onChange={(e) => setArea(e.target.value)}
              placeholder="Neighbourhood or area"
            />

            <label style={styles.formLabel}>Keyword</label>
            <input
              style={styles.input}
              value={keyword}
              onChange={(e) => setKeyword(e.target.value)}
              placeholder="Hotel name, short stay, apartment, landmark"
            />

            <div style={styles.twoInput}>
              <div>
                <label style={styles.formLabel}>Check-in</label>
                <input
                  style={styles.input}
                  type="date"
                  value={checkin}
                  onChange={(e) => {
                    setCheckin(e.target.value);
                    clearConverted();
                    trackEvent("checkin_changed", { checkin: e.target.value });
                  }}
                />
              </div>
              <div>
                <label style={styles.formLabel}>Check-out</label>
                <input
                  style={styles.input}
                  type="date"
                  value={checkout}
                  onChange={(e) => {
                    setCheckout(e.target.value);
                    clearConverted();
                    trackEvent("checkout_changed", { checkout: e.target.value });
                  }}
                />
              </div>
            </div>

            <div style={styles.twoInput}>
              <div>
                <label style={styles.formLabel}>Guests</label>
                <input
                  style={styles.input}
                  type="number"
                  min="1"
                  value={guests}
                  onChange={(e) => {
                    setGuests(Number(e.target.value));
                    clearConverted();
                    trackEvent("guests_changed", { guests: Number(e.target.value) });
                  }}
                />
              </div>
              <div>
                <label style={styles.formLabel}>Rooms</label>
                <input
                  style={styles.input}
                  type="number"
                  min="1"
                  value={rooms}
                  onChange={(e) => {
                    setRooms(Number(e.target.value));
                    clearConverted();
                    trackEvent("rooms_changed", { rooms: Number(e.target.value) });
                  }}
                />
              </div>
            </div>

            <button style={styles.goldButton} onClick={() => runSearch()} disabled={loading || loadingCatalog}>
              {loading ? "Loading best matches..." : "Search best hotel matches"}
            </button>

            {message && <div style={styles.notice}>{message}</div>}
          </div>
        </div>

        <div style={styles.column}>
          <div style={styles.label}>LIVE HOTELS</div>

          <div style={styles.scroll}>
            {hotels.map((hotel) => {
              const rate = hotel.first_rate || {};
              const canPay = hotel.live_rate_ready && rate.rate_key && Number(rate.amount || 0) > 0;

              return (
                <div
                  key={hotel.hotel_id}
                  style={selectedHotel?.hotel_id === hotel.hotel_id ? styles.hotelCardSelected : styles.hotelCard}
                  onClick={() => selectHotel(hotel)}
                >
                  <PropertyImage hotel={hotel} />

                  <div style={styles.hotelBody}>
                    <h2 style={styles.hotelName}>{hotel.hotel_name}</h2>
                    <p style={styles.hotelLocation}>
                      {hotel.area ? `${hotel.area}, ` : ""}
                      {hotel.city}, {hotel.country}
                    </p>

                    <div style={canPay ? styles.rateGood : styles.rateBlocked}>
                      {canPay ? "Live payable rate" : "Live price unavailable for selected dates"}
                    </div>

                    {canPay ? (
                      <div style={styles.rateBox}>
                        <p><b>Room:</b> {rate.room_name}</p>
                        <p><b>Board:</b> {rate.board_name}</p>
                        <p><b>Final price:</b> {rate.currency} {money(rate.amount)}</p>
                      </div>
                    ) : (
                      <div style={styles.rateBox}>Real-time hotel rate required. No fake price is shown.</div>
                    )}

                    <div style={styles.buttonPair}>
                      <button
                        style={styles.reserveMini}
                        onClick={(e) => {
                          e.stopPropagation();
                          selectHotel(hotel);
                          trackEvent("reserve_clicked", {
                            hotel_id: hotel.hotel_id || "",
                            hotel_name: hotel.hotel_name || "",
                            live_rate_ready: Boolean(canPay),
                          });
                        }}
                      >
                        Reserve
                      </button>
                      <button
                        style={canPay ? styles.payMini : styles.payDisabled}
                        disabled={!canPay}
                        onClick={(e) => {
                          e.stopPropagation();
                          requestBooking(hotel);
                        }}
                      >
                        {canPay ? "Pay" : "Unavailable"}
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}

            {!loading && hotels.length === 0 && (
              <div style={styles.emptyBox}>
                No hotels loaded yet. Choose country and city, then press Search.
              </div>
            )}
          </div>
        </div>

        <div style={styles.column}>
          <div style={styles.label}>RESERVE / PAY</div>

          {!selectedHotel ? (
            <div style={styles.emptyBox}>Select a hotel to reserve or pay.</div>
          ) : (
            <div style={styles.reservePanel}>
              <h2 style={styles.hotelName}>{selectedHotel.hotel_name}</h2>

              {selectedCanPay ? (
                <div style={styles.selectedPrice}>
                  {selectedHotel.first_rate.currency} {money(selectedHotel.first_rate.amount)}
                </div>
              ) : (
                <div style={styles.selectedUnavailable}>Live price unavailable for selected dates.</div>
              )}

              <div style={styles.currencyBox}>
                <div style={styles.currencyTitle}>Currency converter</div>
                <div style={styles.currencyRow}>
                  <select
                    style={styles.currencySelect}
                    value={targetCurrency}
                    onChange={(e) => {
                      setTargetCurrency(e.target.value);
                      clearConverted();
                      trackEvent("target_currency_changed", { currency: e.target.value });
                    }}
                  >
                    {["USD", "GBP", "EUR", "NGN", "AED", "CAD", "AUD", "ZAR", "CHF", "JPY"].map((c) => (
                      <option key={c} value={c}>{c}</option>
                    ))}
                  </select>

                  <button style={styles.convertButton} onClick={convertTotal}>
                    Convert
                  </button>
                </div>

                <div style={styles.convertedText}>
                  {convertedTotal || "Select currency and convert"}
                </div>
              </div>

              <div style={styles.mapBox}>
                <iframe
                  title="Hotel map"
                  style={styles.map}
                  loading="lazy"
                  src={
                    selectedHotel.latitude && selectedHotel.longitude
                      ? `https://maps.google.com/maps?q=${selectedHotel.latitude},${selectedHotel.longitude}&z=14&output=embed`
                      : `https://maps.google.com/maps?q=${encodeURIComponent(selectedHotel.hotel_name + " " + selectedHotel.city)}&z=14&output=embed`
                  }
                />
              </div>

              <input style={styles.input} value={customerName} onChange={(e) => setCustomerName(e.target.value)} placeholder="Your full name" />
              <input style={styles.input} value={customerEmail} onChange={(e) => setCustomerEmail(e.target.value)} placeholder="Your email" />
              <input style={styles.input} value={customerPhone} onChange={(e) => setCustomerPhone(e.target.value)} placeholder="Phone number" />
              <textarea style={styles.textarea} value={note} onChange={(e) => setNote(e.target.value)} placeholder="Special requests" />

              <div style={styles.buttonPairLarge}>
                <button
                  style={styles.reserveLarge}
                  disabled={requesting}
                  onClick={() => {
                    setMessage(`Reserved for review: ${selectedHotel.hotel_name}.`);
                    trackEvent("reserve_for_review_clicked", {
                      hotel_id: selectedHotel.hotel_id || "",
                      hotel_name: selectedHotel.hotel_name || "",
                    });
                  }}
                >
                  Reserve
                </button>

                <button
                  style={selectedCanPay ? styles.payLarge : styles.payDisabledLarge}
                  disabled={!selectedCanPay || requesting}
                  onClick={() => requestBooking(selectedHotel)}
                >
                  {requesting ? "Preparing Stripe..." : selectedCanPay ? "Pay" : "Unavailable"}
                </button>
              </div>

              <div style={styles.safeNote}>Payment is only enabled for valid live supplier rate keys.</div>
            </div>
          )}
        </div>
      </section>
    </div>
  );
}

const styles = {
  page: { minHeight: "100vh", background: "#06101f", color: "white", padding: 18, fontFamily: "Arial, sans-serif", overflow: "hidden" },
  pageScrollable: { minHeight: "100vh", background: "#06101f", color: "white", padding: 18, fontFamily: "Arial, sans-serif" },
  hero: { background: "linear-gradient(135deg,#0f2f69,#1e5cc7)", borderRadius: 24, padding: 24, display: "grid", gridTemplateColumns: "1.2fr .8fr", gap: 20, alignItems: "center", marginBottom: 16 },
  brand: { letterSpacing: 14, fontWeight: 900, color: "#ffd34d", marginBottom: 12 },
  brandSmall: { letterSpacing: 10, fontWeight: 900, marginBottom: 20 },
  heroTitle: { fontSize: 38, lineHeight: 1.1, margin: 0 },
  heroText: { fontSize: 18, lineHeight: 1.5, marginTop: 12 },
  buttonRow: { display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 },
  whiteButton: { background: "white", color: "#07111f", border: 0, borderRadius: 14, padding: "14px 18px", fontWeight: 900, fontSize: 16, cursor: "pointer" },
  mainGrid: { display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 18 },
  column: { height: "73vh", background: "#eaf2fb", color: "#07111f", borderRadius: 24, padding: 18, overflow: "hidden", display: "flex", flexDirection: "column" },
  label: { letterSpacing: 4, color: "#63738e", fontWeight: 900, marginBottom: 12 },
  searchBox: { background: "white", borderRadius: 18, padding: 16, overflow: "auto" },
  muted: { color: "#63738e", fontWeight: 800 },
  formLabel: { display: "block", fontWeight: 900, marginTop: 10, marginBottom: 5 },
  input: { width: "100%", boxSizing: "border-box", padding: "12px 13px", margin: "4px 0", borderRadius: 12, border: "1px solid #c6d5e8", fontSize: 15 },
  textarea: { width: "100%", boxSizing: "border-box", minHeight: 100, padding: "12px 13px", margin: "7px 0", borderRadius: 12, border: "1px solid #c6d5e8", fontSize: 15 },
  twoInput: { display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 },
  goldButton: { width: "100%", background: "#ffd34d", color: "#07111f", border: "2px solid #07111f", borderRadius: 14, padding: "15px 18px", fontSize: 18, fontWeight: 900, cursor: "pointer", marginTop: 14 },
  goldSmall: { background: "#ffd34d", color: "#07111f", border: 0, borderRadius: 14, padding: "15px 22px", fontSize: 18, fontWeight: 900, cursor: "pointer", marginTop: 22 },
  notice: { background: "#fff2be", padding: 13, borderRadius: 14, marginTop: 14, fontWeight: 900, color: "#07111f" },
  scroll: { overflowY: "auto", paddingRight: 6 },
  hotelCard: { background: "white", borderRadius: 20, marginBottom: 16, overflow: "hidden", cursor: "pointer", border: "2px solid transparent" },
  hotelCardSelected: { background: "white", borderRadius: 20, marginBottom: 16, overflow: "hidden", cursor: "pointer", border: "4px solid #ffd34d" },
  hotelImage: { width: "100%", height: 190, objectFit: "cover", display: "block", background: "#10254a" },
  realImageMissing: { height: 190, background: "linear-gradient(135deg,#10254a,#1d4da8)", color: "white", display: "flex", flexDirection: "column", justifyContent: "center", padding: 22, boxSizing: "border-box" },
  imageBadge: { letterSpacing: 7, fontWeight: 900, fontSize: 11, opacity: 0.8 },
  imageMissingTitle: { fontSize: 22, fontWeight: 900, marginTop: 12 },
  imageMissingText: { fontSize: 14, lineHeight: 1.4, marginTop: 8 },
  hotelBody: { padding: 16 },
  hotelName: { fontSize: 22, margin: "0 0 8px", fontWeight: 900 },
  hotelLocation: { color: "#52627c", margin: 0 },
  rateGood: { background: "#dff7e6", borderRadius: 12, padding: 10, margin: "12px 0", fontWeight: 900, color: "#075b24" },
  rateBlocked: { background: "#ffe1e1", borderRadius: 12, padding: 10, margin: "12px 0", fontWeight: 900, color: "#8a1111" },
  rateBox: { background: "#f6f8fc", borderRadius: 14, padding: 13, margin: "12px 0", fontSize: 14, lineHeight: 1.25 },
  buttonPair: { display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 },
  buttonPairLarge: { display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginTop: 14 },
  reserveMini: { width: "100%", background: "#10254a", color: "white", border: 0, borderRadius: 12, padding: 12, fontWeight: 900, cursor: "pointer", marginTop: 10 },
  payMini: { width: "100%", background: "#ffd34d", color: "#07111f", border: "2px solid #07111f", borderRadius: 12, padding: 12, fontWeight: 900, cursor: "pointer" },
  payDisabled: { width: "100%", background: "#c8d0dd", color: "#52627c", border: 0, borderRadius: 12, padding: 12, fontWeight: 900, cursor: "not-allowed" },
  reserveLarge: { width: "100%", background: "#10254a", color: "white", border: 0, borderRadius: 14, padding: "15px 18px", fontSize: 18, fontWeight: 900, cursor: "pointer" },
  payLarge: { width: "100%", background: "#ffd34d", color: "#07111f", border: "2px solid #07111f", borderRadius: 14, padding: "15px 18px", fontSize: 18, fontWeight: 900, cursor: "pointer" },
  payDisabledLarge: { width: "100%", background: "#c8d0dd", color: "#52627c", border: 0, borderRadius: 14, padding: "15px 18px", fontSize: 18, fontWeight: 900, cursor: "not-allowed" },
  emptyBox: { background: "white", color: "#07111f", borderRadius: 18, padding: 22, fontWeight: 900, lineHeight: 1.5 },
  reservePanel: { background: "white", borderRadius: 18, padding: 16, overflow: "auto" },
  selectedPrice: { color: "#0f4db3", fontSize: 26, fontWeight: 900, marginBottom: 14 },
  selectedUnavailable: { background: "#ffe1e1", color: "#8a1111", padding: 13, borderRadius: 14, marginBottom: 14, fontWeight: 900 },
  currencyBox: { background: "#f6f8fc", borderRadius: 16, padding: 14, marginBottom: 12 },
  currencyTitle: { fontWeight: 900, marginBottom: 10 },
  currencyRow: { display: "grid", gridTemplateColumns: "1fr auto", gap: 10 },
  currencySelect: { padding: 12, borderRadius: 12, border: "1px solid #c6d5e8", fontWeight: 900 },
  convertButton: { background: "#123a7a", color: "white", border: 0, borderRadius: 12, padding: "12px 18px", fontWeight: 900, cursor: "pointer" },
  convertedText: { marginTop: 10, fontWeight: 900, color: "#123a7a" },
  mapBox: { background: "#f6f8fc", padding: 8, borderRadius: 16, marginBottom: 12 },
  map: { width: "100%", height: 190, border: 0, borderRadius: 12 },
  safeNote: { background: "#dff7e6", borderRadius: 14, padding: 13, marginTop: 14, fontWeight: 900, color: "#075b24" },
  confirmPage: { minHeight: "100vh", background: "linear-gradient(90deg,#06101f 0%,#123a7a 52%,#06101f 52%)", color: "white", display: "flex", alignItems: "center", padding: 34, fontFamily: "Arial, sans-serif" },
  confirmCard: { maxWidth: 780, background: "rgba(255,255,255,0.12)", border: "1px solid rgba(255,255,255,0.22)", borderRadius: 28, padding: 40 },
  confirmTitle: { fontSize: 48, color: "#ffd34d", margin: "0 0 20px" },
  confirmText: { fontSize: 20, lineHeight: 1.55 },
  codeBox: { background: "rgba(255,255,255,0.14)", borderRadius: 18, padding: 22, margin: "24px 0", fontSize: 18 },
  codeText: { fontSize: 28, marginTop: 10, fontWeight: 900, color: "#ffd34d" },
  infoPage: { minHeight: "100vh", background: "linear-gradient(135deg,#06101f,#123a7a)", color: "white", padding: 34, fontFamily: "Arial, sans-serif" },
  infoCardWide: { maxWidth: 1180, background: "rgba(255,255,255,0.12)", border: "1px solid rgba(255,255,255,0.22)", borderRadius: 28, padding: 40 },
  infoTitle: { fontSize: 46, color: "#ffd34d", marginBottom: 8 },
  infoSubtitle: { fontSize: 22, fontWeight: 800, lineHeight: 1.4 },
  infoBody: { fontSize: 18, lineHeight: 1.6 },
  simpleGrid: { display: "grid", gridTemplateColumns: "1fr 1fr", gap: 18, marginTop: 24 },
  simpleBox: { background: "white", color: "#07111f", borderRadius: 20, padding: 22, fontSize: 18, lineHeight: 1.5 },
  guideSearchCard: { background: "white", color: "#07111f", borderRadius: 22, padding: 20 },
  destinationBanner: { background: "#123a7a", borderRadius: 20, padding: 18, fontSize: 28, fontWeight: 900, marginBottom: 18 },
  emergencyBox: { background: "#ffefef", color: "#07111f", borderRadius: 24, padding: 24, marginBottom: 22 },
  emergencyTitle: { fontSize: 28, fontWeight: 900, color: "#9d1111", marginBottom: 18 },
  emergencyGrid: { display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(220px,1fr))", gap: 16 },
  emergencyItem: { background: "white", borderRadius: 18, padding: 18 },
  emergencyKey: { fontWeight: 900, marginBottom: 8, color: "#7d0f0f" },
  emergencyValue: { fontSize: 30, fontWeight: 900 },
  guideSection: { marginBottom: 28 },
  guideSectionTitle: { fontSize: 32, fontWeight: 900, marginBottom: 16, color: "#ffd34d" },
  guideGrid: { display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(320px,1fr))", gap: 18 },
  placeCard: { background: "#ffffff", color: "#07111f", borderRadius: 22, padding: 20, minHeight: 180 },
  placeName: { fontSize: 22, fontWeight: 900, marginBottom: 10, color: "#123a7a" },
  placeText: { fontSize: 15, lineHeight: 1.5, marginBottom: 10 },
  placePhone: { fontWeight: 900, marginBottom: 8 },
  placeRating: { color: "#0c5e2b", fontWeight: 900, marginBottom: 6 },
  placeOpen: { color: "#0c5e2b", fontWeight: 900, marginBottom: 10 },
  mapsButton: { marginTop: 10, background: "#123a7a", color: "white", border: 0, borderRadius: 14, padding: "12px 16px", fontWeight: 900, cursor: "pointer" },
};