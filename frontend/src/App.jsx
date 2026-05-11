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

function trackPage(title) {
  initGA();
  if (!GA_READY) return;
  ReactGA.send({
    hitType: "pageview",
    page: window.location.pathname + window.location.search,
    title,
  });
}

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

function tomorrowISO() {
  return new Date(Date.now() + 86400000).toISOString().slice(0, 10);
}

function safeText(v) {
  return String(v || "").trim();
}

function money(v) {
  const n = Number(v || 0);
  return Number.isFinite(n) ? n.toFixed(2) : "0.00";
}

function roomCount(v) {
  const n = Number(v || 1);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : 1;
}

function nightsBetween(checkin, checkout) {
  const diff = Math.ceil((new Date(checkout).getTime() - new Date(checkin).getTime()) / 86400000);
  return Number.isFinite(diff) && diff > 0 ? diff : 1;
}

function normalizeCity(c) {
  if (typeof c === "string") return { city: c, live_hotels: 0 };
  return {
    city: safeText(c?.city),
    live_hotels: Number(c?.live_hotels || 0),
    destination_code: safeText(c?.destination_code),
  };
}

function normalizeCountries(raw) {
  return (Array.isArray(raw) ? raw : [])
    .map((c) => ({
      country: safeText(c?.country),
      cities: (Array.isArray(c?.cities) ? c.cities : [])
        .map(normalizeCity)
        .filter((x) => x.city),
    }))
    .filter((c) => c.country && c.cities.length)
    .sort((a, b) => a.country.localeCompare(b.country));
}

function baseCustomerRate(rate) {
  return Number(rate?.customer_total || rate?.amount || rate?.selling_rate || 0);
}

function baseSupplierRate(rate) {
  return Number(rate?.supplier_total || rate?.supplier_amount || rate?.amount || 0);
}

function finalCustomerTotal(rate, rooms) {
  const roomRate = baseCustomerRate(rate);
  const count = roomCount(rooms);
  return Number((roomRate * count).toFixed(2));
}

function finalSupplierTotal(rate, rooms) {
  const supplierRate = baseSupplierRate(rate);
  const count = roomCount(rooms);
  return Number((supplierRate * count).toFixed(2));
}

function hotelImageUrl(value) {
  const raw = safeText(value);
  if (!raw) return "";
  if (raw.startsWith("http://") || raw.startsWith("https://")) return raw;

  const cleaned = raw
    .replace(/^\/+/, "")
    .replace(/^giata\//i, "")
    .replace(/^bigger\//i, "")
    .replace(/^medium\//i, "")
    .replace(/^small\//i, "");

  return `https://photos.hotelbeds.com/giata/bigger/${cleaned}`;
}

function extractImageFromRaw(rawValue) {
  const raw = safeText(rawValue);
  if (!raw) return "";

  try {
    const parsed = JSON.parse(raw);
    const images = Array.isArray(parsed?.images) ? parsed.images : [];

    for (const img of images) {
      const p =
        safeText(img?.path) ||
        safeText(img?.url) ||
        safeText(img?.imageUrl) ||
        safeText(img?.image_url);

      const url = hotelImageUrl(p);
      if (url) return url;
    }
  } catch {}

  return "";
}

function PropertyImage({ hotel, large = false }) {
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    setFailed(false);
  }, [hotel?.hotel_id, hotel?.image_url, hotel?.raw_hotel_json]);

  const url =
    hotelImageUrl(hotel?.image_url) ||
    hotelImageUrl(hotel?.direct_image_url) ||
    hotelImageUrl(hotel?.main_image) ||
    hotelImageUrl(hotel?.thumbnail) ||
    hotelImageUrl(hotel?.photo) ||
    hotelImageUrl(hotel?.picture) ||
    extractImageFromRaw(hotel?.raw_hotel_json);

  if (!url || failed) {
    return (
      <div style={large ? styles.imageMissingLarge : styles.imageMissing}>
        <div style={styles.imageBadge}>MYSPACE HOTEL</div>
        <div style={styles.imageMissingTitle}>Verified property image unavailable</div>
        <div style={styles.imageMissingText}>No fake hotel photo is displayed.</div>
      </div>
    );
  }

  return (
    <img
      src={url}
      alt={hotel?.hotel_name || "Hotel"}
      style={large ? styles.hotelImageLarge : styles.hotelImage}
      loading={large ? "eager" : "lazy"}
      decoding="async"
      fetchPriority={large ? "high" : "auto"}
      referrerPolicy="no-referrer"
      onError={() => setFailed(true)}
    />
  );
}

function PriceBreakdown({ rate, checkin, checkout, rooms, guests, compact = false }) {
  const nights = nightsBetween(checkin, checkout);
  const count = roomCount(rooms);
  const base = baseCustomerRate(rate);
  const total = finalCustomerTotal(rate, count);
  const currency = rate?.currency || "GBP";

  return (
    <div style={compact ? styles.priceBreakdownCompact : styles.priceBreakdown}>
      <div style={styles.priceLine}>
        <span>Stay length</span>
        <b>
          {nights} night{nights === 1 ? "" : "s"}
        </b>
      </div>
      <div style={styles.priceLine}>
        <span>Guests</span>
        <b>{guests}</b>
      </div>
      <div style={styles.priceLine}>
        <span>Rooms selected</span>
        <b>{count}</b>
      </div>
      <div style={styles.priceLine}>
        <span>Rate per room</span>
        <b>
          {currency} {money(base)}
        </b>
      </div>
      <div style={styles.priceLine}>
        <span>Total check</span>
        <b>
          {currency} {money(base)} × {count}
        </b>
      </div>
      <div style={styles.totalLine}>
        <span>Total to pay</span>
        <b>
          {currency} {money(total)}
        </b>
      </div>
      <div style={styles.priceTrustNote}>Secure checkout must match this exact room total.</div>
    </div>
  );
}

function GuideTable({ title, items, red = false }) {
  const list = Array.isArray(items) ? items : [];

  return (
    <section style={styles.guideTableWrap}>
      <div style={red ? styles.guideTableTitleRed : styles.guideTableTitle}>{title}</div>
      <div style={styles.guideTable}>
        {list.length === 0 && <div style={styles.guideEmpty}>No nearby result loaded yet.</div>}
        {list.map((item, index) => (
          <div key={`${title}-${index}`} style={styles.guideRow}>
            <div style={styles.guideCellMain}>
              <b>{item.name || item.type || "Nearby place"}</b>
              <span>{item.purpose || item.address || item.type || ""}</span>
            </div>
            <div style={styles.guideCellType}>{item.type || "Nearby"}</div>
            <button
              style={red ? styles.mapBtnRed : styles.mapBtn}
              onClick={() => item.maps && window.open(item.maps, "_blank", "noopener,noreferrer")}
            >
              Map
            </button>
          </div>
        ))}
      </div>
    </section>
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
        <button style={styles.goldSmall} onClick={() => (window.location.href = "/")}>
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
          Yes. Payment is available only when a valid live rate is available.
        </div>
        <div style={styles.simpleBox}>
          <b>Are images fake?</b>
          <br />
          No. Missing hotel photos show a clear notice instead of fake hotel images.
        </div>
        <div style={styles.simpleBox}>
          <b>Why no price?</b>
          <br />
          Some hotels are unavailable for the selected dates or city.
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
        <div style={styles.simpleBox}>Prices and availability can change until confirmation is completed.</div>
        <div style={styles.simpleBox}>Payment is enabled only for stays with valid live rate keys and payable amounts.</div>
        <div style={styles.simpleBox}>No fake photos, no fake prices, and no misleading availability are shown.</div>
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
          <b>Arrival help</b>
          <br />
          Include reservation code, guest name, and hotel name.
        </div>
        <div style={styles.simpleBox}>
          <b>Special requests</b>
          <br />
          Add room, accessibility, family, or arrival needs before payment.
        </div>
      </div>
    </InfoPage>
  );
}

function TravelGuidePage() {
  const params = new URLSearchParams(window.location.search);
  const [catalog, setCatalog] = useState([]);
  const [country, setCountry] = useState(params.get("country") || "United Kingdom");
  const [city, setCity] = useState(params.get("city") || "London");
  const [area, setArea] = useState(params.get("area") || "");
  const [guide, setGuide] = useState(null);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");

  const countries = useMemo(() => normalizeCountries(catalog), [catalog]);
  const cities = useMemo(() => countries.find((c) => c.country === country)?.cities || [], [countries, country]);

  async function loadGuide(nextCountry = country, nextCity = city, nextArea = area) {
    setLoading(true);
    setMessage("");

    try {
      const p = new URLSearchParams();
      p.set("country", nextCountry);
      p.set("city", nextCity);
      if (safeText(nextArea)) p.set("area", safeText(nextArea));

      const res = await fetch(`${API_BASE}/api/travel-guide/live?${p.toString()}`, { cache: "no-store" });
      const data = await res.json();

      if (!data.ok) {
        setMessage(data.message || "Guide unavailable.");
        return;
      }

      setGuide(data.guide);
    } catch {
      setMessage("Could not load destination guide.");
    } finally {
      setLoading(false);
    }
  }

  async function loadCatalog() {
    try {
      let loaded = [];

      const res1 = await fetch(`${API_BASE}/api/real-catalog/destinations`, { cache: "no-store" });
      const data1 = await res1.json().catch(() => ({}));
      loaded = Array.isArray(data1.countries) ? data1.countries : [];

      if (!loaded.length) {
        const res2 = await fetch(`${API_BASE}/api/bootstrap`, { cache: "no-store" });
        const data2 = await res2.json().catch(() => ({}));
        loaded = Array.isArray(data2.countries) ? data2.countries : [];
      }

      setCatalog(loaded);

      const normalized = normalizeCountries(loaded);
      const pickedCountry = normalized.find((c) => c.country === country)?.country || normalized[0]?.country || country;
      const pickedCity =
        normalized.find((c) => c.country === pickedCountry)?.cities?.find((x) => x.city === city)?.city ||
        normalized.find((c) => c.country === pickedCountry)?.cities?.[0]?.city ||
        city;

      setCountry(pickedCountry);
      setCity(pickedCity);
      loadGuide(pickedCountry, pickedCity, area);
    } catch {
      setMessage("Could not load destination list.");
    }
  }

  useEffect(() => {
    trackPage("Destination guide");
    loadCatalog();
  }, []);

  function changeCountry(v) {
    const found = countries.find((x) => x.country === v);
    const firstCity = found?.cities?.[0]?.city || "";
    setCountry(v);
    setCity(firstCity);
    setGuide(null);
    if (v && firstCity) loadGuide(v, firstCity, area);
  }

  function changeCity(v) {
    setCity(v);
    setGuide(null);
    if (country && v) loadGuide(country, v, area);
  }

  const emergency = guide?.emergency || {};

  return (
    <div style={styles.guidePage}>
      <section style={styles.guideTop}>
        <div>
          <div style={styles.guideBrand}>MYSPACE HOTEL</div>
          <h1 style={styles.guideHeadline}>Know the area before you arrive.</h1>
          <p style={styles.guideCopy}>
            Local help, nearby stays, food, transport, attractions and maps for the destination you selected.
          </p>
        </div>

        <div style={styles.guideControls}>
          <select style={styles.guideInput} value={country} onChange={(e) => changeCountry(e.target.value)}>
            <option value="">Choose country</option>
            {countries.map((c) => (
              <option key={c.country} value={c.country}>
                {c.country}
              </option>
            ))}
          </select>

          <select style={styles.guideInput} value={city} onChange={(e) => changeCity(e.target.value)}>
            <option value="">Choose city</option>
            {cities.map((c) => (
              <option key={`${country}-${c.city}`} value={c.city}>
                {c.city}
                {c.live_hotels ? ` (${c.live_hotels})` : ""}
              </option>
            ))}
          </select>

          <input style={styles.guideInput} value={area} placeholder="Area or district" onChange={(e) => setArea(e.target.value)} />

          <button style={styles.guidePrimary} onClick={() => loadGuide(country, city, area)} disabled={loading || !country || !city}>
            {loading ? "Loading..." : "Refresh"}
          </button>

          <button style={styles.guideSecondary} onClick={() => (window.location.href = "/")}>
            Back
          </button>
        </div>
      </section>

      {message && <div style={styles.notice}>{message}</div>}

      {guide && (
        <>
          <div style={styles.destinationBar}>
            <div>
              <div style={styles.destinationSmall}>Your destination</div>
              <div style={styles.destinationBig}>{guide.destination}</div>
              <div style={styles.destinationSub}>Hotels, medical help, safety, food, transport and places to visit around this location.</div>
            </div>
            <div style={styles.guideTrust}>Maps • Nearby help • Arrival confidence</div>
          </div>

          <div style={styles.guideContentGrid}>
            <section style={styles.emergencyPanel}>
              <div style={styles.emergencyHeader}>
                <div>
                  <div style={styles.redSmall}>Important</div>
                  <h2 style={styles.emergencyTitle}>Emergency contacts</h2>
                </div>
                <div style={styles.emergencyNumber}>{emergency.emergency || "112"}</div>
              </div>

              <div style={styles.emergencyGrid}>
                {Object.entries(emergency).map(([k, v]) => (
                  <div key={k} style={styles.emergencyItem}>
                    <span>{k.replace(/_/g, " ")}</span>
                    <b>{v}</b>
                  </div>
                ))}
              </div>
            </section>

            <div style={styles.guideTables}>
              <GuideTable title="Selected stay area" items={guide.hotels} />
              <GuideTable title="Medical help" items={guide.hospitals} red />
              <GuideTable title="Safety support" items={guide.police} red />
              <GuideTable title="Pharmacies" items={guide.pharmacies} />
              <GuideTable title="Food nearby" items={guide.restaurants} />
              <GuideTable title="Transport" items={guide.transport} />
              <GuideTable title="Things to do" items={guide.attractions} />
              <GuideTable title="Taxi support" items={guide.taxis} />
            </div>
          </div>
        </>
      )}
    </div>
  );
}

function Confirmed() {
  const code = new URLSearchParams(window.location.search).get("code") || "Your reservation";
  const [status, setStatus] = useState("Confirming payment update...");

  useEffect(() => {
    trackPage("Reservation confirmed");

    if (!code || code === "Your reservation") return;

    fetch(`${API_BASE}/reservation/${code}/mark-paid`, { method: "POST" })
      .then(() => setStatus("Payment received. Your reservation update is being processed."))
      .catch(() => setStatus("Payment received. Your reservation update is being processed securely."));
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
        <button style={styles.goldSmall} onClick={() => (window.location.href = "/")}>
          Back to hotel search
        </button>
      </div>
    </div>
  );
}

function MainPortal() {
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

  const countries = useMemo(() => normalizeCountries(catalog), [catalog]);
  const selectedCountry = useMemo(() => countries.find((x) => x.country === country) || null, [countries, country]);
  const cities = useMemo(() => selectedCountry?.cities || [], [selectedCountry]);

  function clearConverted() {
    setConvertedTotal("");
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

    try {
      const p = new URLSearchParams();
      p.set("country", searchCountry);
      p.set("city", searchCity);
      p.set("checkin", checkin);
      p.set("checkout", checkout);
      p.set("guests", String(guests));
      p.set("rooms", String(roomCount(rooms)));
      if (area.trim()) p.set("area", area.trim());
      if (keyword.trim()) p.set("keyword", keyword.trim());

      const res = await fetch(`${API_BASE}/api/hotels/search?${p.toString()}`, { cache: "no-store" });
      const data = await res.json();
      const list = Array.isArray(data.hotels) ? data.hotels : [];

      setHotels(list);
      setSelectedHotel(list[0] || null);
      setMessage(list.length ? `${list.length} best matches found in ${searchCity}.` : "No matching live-rate hotels found.");
    } catch {
      setHotels([]);
      setSelectedHotel(null);
      setMessage("Backend unavailable. Restart backend and frontend.");
    } finally {
      setLoading(false);
    }
  }

  async function loadCatalog() {
    setLoadingCatalog(true);

    try {
      let loaded = [];
      let bootHotels = [];
      let bootCountry = "";
      let bootCity = "";

      const res1 = await fetch(`${API_BASE}/api/real-catalog/destinations`, { cache: "no-store" });
      const data1 = await res1.json().catch(() => ({}));
      loaded = Array.isArray(data1.countries) ? data1.countries : [];

      const res2 = await fetch(`${API_BASE}/api/bootstrap`, { cache: "no-store" });
      const data2 = await res2.json().catch(() => ({}));

      if (!loaded.length) loaded = Array.isArray(data2.countries) ? data2.countries : [];
      bootHotels = Array.isArray(data2.hotels) ? data2.hotels : [];
      bootCountry = safeText(data2.default_country);
      bootCity = safeText(data2.default_city);

      const normalized = normalizeCountries(loaded);
      setCatalog(normalized);

      const preferred =
        normalized.find((c) => c.country === bootCountry) ||
        normalized.find((c) => c.country.toLowerCase() === "united kingdom") ||
        normalized[0] ||
        null;

      const preferredCity =
        preferred?.cities?.find((c) => c.city === bootCity) ||
        preferred?.cities?.find((c) => c.live_hotels > 0) ||
        preferred?.cities?.[0] ||
        null;

      const firstCountry = preferred?.country || "";
      const firstCity = preferredCity?.city || "";

      setCountry(firstCountry);
      setCity(firstCity);

      if (bootHotels.length && firstCountry && firstCity) {
        setHotels(bootHotels);
        setSelectedHotel(bootHotels[0] || null);
        setMessage(`${bootHotels.length} stays ready.`);
      } else if (firstCountry && firstCity) {
        runSearch(firstCountry, firstCity);
      } else {
        setMessage("No country/city catalogue loaded. Check backend data JSON files.");
      }
    } catch {
      setMessage("Could not load country and city catalogue.");
    } finally {
      setLoadingCatalog(false);
    }
  }

  useEffect(() => {
    loadCatalog();
  }, []);

  function changeCountry(nextCountry) {
    const found = countries.find((x) => x.country === nextCountry);
    const firstCity = found?.cities?.[0]?.city || "";

    setCountry(nextCountry);
    setCity(firstCity);
    setHotels([]);
    setSelectedHotel(null);
    clearConverted();

    if (firstCity) runSearch(nextCountry, firstCity);
    else setMessage("No city found for this country.");
  }

  function changeCity(nextCity) {
    setCity(nextCity);
    setHotels([]);
    setSelectedHotel(null);
    clearConverted();
    if (country && nextCity) runSearch(country, nextCity);
  }

  function selectHotel(hotel) {
    setSelectedHotel(hotel);
    clearConverted();
  }

  async function convertTotal() {
    if (!selectedHotel?.live_rate_ready || !Number(selectedHotel?.first_rate?.amount || 0)) {
      setConvertedTotal("0.00");
      return;
    }

    try {
      const total = finalCustomerTotal(selectedHotel.first_rate, rooms);
      const p = new URLSearchParams();
      p.set("amount", String(total));
      p.set("from", selectedHotel.first_rate.currency);
      p.set("to", targetCurrency);

      const res = await fetch(`${API_BASE}/api/currency/convert?${p.toString()}`);
      const data = await res.json();
      setConvertedTotal(data.ok ? `${targetCurrency} ${money(data.converted)}` : "Conversion unavailable");
    } catch {
      setConvertedTotal("Conversion unavailable");
    }
  }

  async function requestBooking(hotel = selectedHotel) {
    if (!hotel) {
      setMessage("Select a live-rate hotel first.");
      return;
    }

    const rate = hotel.first_rate || {};
    const customerTotal = finalCustomerTotal(rate, rooms);
    const supplierTotal = finalSupplierTotal(rate, rooms);

    if (!hotel.live_rate_ready || !rate.rate_key || !customerTotal) {
      setMessage("Payment blocked because this hotel has no live rate.");
      return;
    }

    if (!customerName.trim() || !customerEmail.trim()) {
      setMessage("Enter your name and email before payment.");
      return;
    }

    setRequesting(true);
    setMessage("Preparing secure checkout...");

    try {
      const payload = {
        hotel_id: hotel.hotel_id,
        hotel_name: hotel.hotel_name,
        destination: `${hotel.city}, ${hotel.country}`,
        checkin,
        checkout,
        guests: Number(guests),
        rooms: roomCount(rooms),
        customer_name: customerName.trim(),
        customer_email: customerEmail.trim(),
        customer_phone: customerPhone.trim(),
        note: note.trim(),
        rate_key: rate.rate_key,
        amount: supplierTotal,
        supplier_total: supplierTotal,
        room_rate: baseCustomerRate(rate),
        displayed_customer_total: customerTotal,
        currency: rate.currency,
        room_name: rate.room_name,
        board_name: rate.board_name,
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
        return;
      }

      if (data.payment_url) {
        window.location.href = data.payment_url;
        return;
      }

      setMessage(`Reservation created: ${data.reservation_code}.`);
    } catch {
      setMessage("Secure booking service unavailable.");
    } finally {
      setRequesting(false);
    }
  }

  const selectedCanPay =
    selectedHotel?.live_rate_ready &&
    selectedHotel?.first_rate?.rate_key &&
    finalCustomerTotal(selectedHotel?.first_rate, rooms) > 0;

  return (
    <div style={styles.page}>
      <section style={styles.hero}>
        <div>
          <div style={styles.brand}>MYSPACE HOTEL</div>
          <h1 style={styles.heroTitle}>Book with clarity before you arrive.</h1>
          <p style={styles.heroText}>Choose your destination, review the stay, check your total and explore the area with confidence.</p>
        </div>

        <div style={styles.buttonRow}>
          <button style={styles.whiteButton} onClick={() => (window.location.href = `/?page=travel&country=${encodeURIComponent(country)}&city=${encodeURIComponent(city)}&area=${encodeURIComponent(area)}`)}>Destination Guide</button>
          <button style={styles.whiteButton} onClick={() => (window.location.href = "/?page=faq")}>FAQ</button>
          <button style={styles.whiteButton} onClick={() => (window.location.href = "/?page=terms")}>Terms</button>
          <button style={styles.whiteButton} onClick={() => (window.location.href = "/?page=support")}>Contact</button>
        </div>
      </section>

      <section style={styles.mainGrid}>
        <div style={styles.column}>
          <div style={styles.label}>SEARCH</div>

          <div style={styles.searchBox}>
            <p style={styles.muted}>{loadingCatalog ? "Loading catalogue..." : `${countries.length} countries ready.`}</p>

            <label style={styles.formLabel}>Country</label>
            <select style={styles.input} value={country} onChange={(e) => changeCountry(e.target.value)}>
              <option value="">Choose country</option>
              {countries.map((c) => <option key={c.country} value={c.country}>{c.country}</option>)}
            </select>

            <label style={styles.formLabel}>City</label>
            <select style={styles.input} value={city} onChange={(e) => changeCity(e.target.value)}>
              <option value="">Choose city</option>
              {cities.map((c) => (
                <option key={`${country}-${c.city}`} value={c.city}>{c.city}{c.live_hotels ? ` (${c.live_hotels})` : ""}</option>
              ))}
            </select>

            <label style={styles.formLabel}>Area</label>
            <input style={styles.input} value={area} onChange={(e) => setArea(e.target.value)} placeholder="Neighbourhood or area" />

            <label style={styles.formLabel}>Keyword</label>
            <input style={styles.input} value={keyword} onChange={(e) => setKeyword(e.target.value)} placeholder="Hotel name or landmark" />

            <div style={styles.twoInput}>
              <div>
                <label style={styles.formLabel}>Check-in</label>
                <input style={styles.input} type="date" value={checkin} onChange={(e) => { setCheckin(e.target.value); clearConverted(); }} />
              </div>
              <div>
                <label style={styles.formLabel}>Check-out</label>
                <input style={styles.input} type="date" value={checkout} onChange={(e) => { setCheckout(e.target.value); clearConverted(); }} />
              </div>
            </div>

            <div style={styles.twoInput}>
              <div>
                <label style={styles.formLabel}>Guests</label>
                <input style={styles.input} type="number" min="1" value={guests} onChange={(e) => { setGuests(Number(e.target.value)); clearConverted(); }} />
              </div>
              <div>
                <label style={styles.formLabel}>Rooms</label>
                <input style={styles.input} type="number" min="1" value={rooms} onChange={(e) => { setRooms(roomCount(e.target.value)); clearConverted(); }} />
              </div>
            </div>

            <button style={styles.goldButton} onClick={() => runSearch()} disabled={loading || loadingCatalog}>
              {loading ? "Loading..." : "Search stays"}
            </button>

            {message && <div style={styles.notice}>{message}</div>}
          </div>
        </div>

        <div style={styles.column}>
          <div style={styles.label}>STAYS</div>

          <div style={styles.scroll}>
            {hotels.map((hotel) => {
              const rate = hotel.first_rate || {};
              const canPay = hotel.live_rate_ready && rate.rate_key && finalCustomerTotal(rate, rooms) > 0;

              return (
                <div
                  key={hotel.hotel_id}
                  style={selectedHotel?.hotel_id === hotel.hotel_id ? styles.hotelCardSelected : styles.hotelCard}
                  onClick={() => selectHotel(hotel)}
                >
                  <PropertyImage hotel={hotel} />

                  <div style={styles.hotelBody}>
                    <h2 style={styles.hotelName}>{hotel.hotel_name}</h2>
                    <p style={styles.hotelLocation}>{hotel.area ? `${hotel.area}, ` : ""}{hotel.city}, {hotel.country}</p>

                    <div style={canPay ? styles.rateGood : styles.rateBlocked}>{canPay ? "Ready to reserve" : "Price unavailable"}</div>

                    {canPay ? (
                      <div style={styles.rateBox}>
                        <p><b>Room:</b> {rate.room_name || "Selected room"}</p>
                        <p><b>Board:</b> {rate.board_name || "Room only"}</p>
                        <p><b>Final price:</b> {rate.currency} {money(finalCustomerTotal(rate, rooms))}</p>
                        <PriceBreakdown rate={rate} checkin={checkin} checkout={checkout} rooms={rooms} guests={guests} compact />
                      </div>
                    ) : (
                      <div style={styles.rateBox}>No unavailable price is shown.</div>
                    )}

                    <div style={styles.buttonPair}>
                      <button style={styles.reserveMini} onClick={(e) => { e.stopPropagation(); selectHotel(hotel); }}>View</button>
                      <button style={canPay ? styles.payMini : styles.payDisabled} disabled={!canPay} onClick={(e) => { e.stopPropagation(); requestBooking(hotel); }}>
                        {canPay ? "Pay" : "Unavailable"}
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}

            {!loading && hotels.length === 0 && <div style={styles.emptyBox}>No stays loaded yet.</div>}
          </div>
        </div>

        <div style={styles.column}>
          <div style={styles.label}>RESERVE / PAY</div>

          {!selectedHotel ? (
            <div style={styles.emptyBox}>Select a stay to continue.</div>
          ) : (
            <div style={styles.reservePanel}>
              <PropertyImage hotel={selectedHotel} large />

              <h2 style={styles.hotelName}>{selectedHotel.hotel_name}</h2>
              <p style={styles.hotelLocation}>{selectedHotel.city}, {selectedHotel.country}</p>

              {selectedCanPay ? (
                <>
                  <div style={styles.selectedPrice}>
                    {selectedHotel.first_rate.currency} {money(finalCustomerTotal(selectedHotel.first_rate, rooms))}
                  </div>
                  <PriceBreakdown rate={selectedHotel.first_rate} checkin={checkin} checkout={checkout} rooms={rooms} guests={guests} />
                </>
              ) : (
                <div style={styles.selectedUnavailable}>Price unavailable for this stay.</div>
              )}

              <div style={styles.currencyBox}>
                <div style={styles.currencyTitle}>Currency converter</div>
                <div style={styles.currencyRow}>
                  <select style={styles.currencySelect} value={targetCurrency} onChange={(e) => { setTargetCurrency(e.target.value); clearConverted(); }}>
                    {["USD", "GBP", "EUR", "NGN", "AED", "CAD", "AUD", "ZAR", "CHF", "JPY"].map((c) => <option key={c} value={c}>{c}</option>)}
                  </select>
                  <button style={styles.convertButton} onClick={convertTotal}>Convert</button>
                </div>
                <div style={styles.convertedText}>{convertedTotal || "Select currency and convert"}</div>
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
                <button style={styles.reserveLarge} disabled={requesting} onClick={() => setMessage(`Saved for review: ${selectedHotel.hotel_name}.`)}>Save</button>
                <button style={selectedCanPay ? styles.payLarge : styles.payDisabledLarge} disabled={!selectedCanPay || requesting} onClick={() => requestBooking(selectedHotel)}>
                  {requesting ? "Preparing..." : selectedCanPay ? "Pay exact total" : "Unavailable"}
                </button>
              </div>

              <button style={styles.guideSideButton} onClick={() => (window.location.href = `/?page=travel&country=${encodeURIComponent(selectedHotel.country)}&city=${encodeURIComponent(selectedHotel.city)}&area=${encodeURIComponent(selectedHotel.area || area)}`)}>
                Open destination guide
              </button>
            </div>
          )}
        </div>
      </section>
    </div>
  );
}

export default function App() {
  const path = window.location.pathname;
  const page = new URLSearchParams(window.location.search).get("page");

  useEffect(() => {
    initGA();
  }, []);

  if (path === "/travel" || page === "travel") return <TravelGuidePage />;
  if (path === "/faq" || page === "faq") return <FAQs />;
  if (path === "/terms" || page === "terms") return <Terms />;
  if (path === "/support" || page === "support") return <Support />;
  if (path === "/reservation-confirmed") return <Confirmed />;

  return <MainPortal />;
}

const styles = {
  page: { minHeight: "100vh", background: "#06101f", color: "white", padding: 18, fontFamily: "Arial, sans-serif", overflow: "hidden" },
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
  input: { width: "100%", boxSizing: "border-box", padding: "12px 13px", margin: "4px 0", borderRadius: 12, border: "1px solid #c6d5e8", fontSize: 15, background: "white", color: "#07111f" },
  textarea: { width: "100%", boxSizing: "border-box", minHeight: 82, padding: "12px 13px", margin: "7px 0", borderRadius: 12, border: "1px solid #c6d5e8", fontSize: 15 },
  twoInput: { display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 },
  goldButton: { width: "100%", background: "#ffd34d", color: "#07111f", border: "2px solid #07111f", borderRadius: 14, padding: "15px 18px", fontSize: 18, fontWeight: 900, cursor: "pointer", marginTop: 14 },
  goldSmall: { background: "#ffd34d", color: "#07111f", border: 0, borderRadius: 14, padding: "15px 22px", fontSize: 18, fontWeight: 900, cursor: "pointer", marginTop: 22 },
  notice: { background: "#fff2be", padding: 13, borderRadius: 14, marginTop: 14, fontWeight: 900, color: "#07111f" },
  scroll: { overflowY: "auto", paddingRight: 6 },
  hotelCard: { background: "white", borderRadius: 20, marginBottom: 16, overflow: "hidden", cursor: "pointer", border: "2px solid transparent" },
  hotelCardSelected: { background: "white", borderRadius: 20, marginBottom: 16, overflow: "hidden", cursor: "pointer", border: "4px solid #ffd34d" },
  hotelImage: { width: "100%", height: 180, objectFit: "cover", display: "block", background: "#10254a" },
  hotelImageLarge: { width: "100%", height: 190, objectFit: "cover", display: "block", borderRadius: 16, background: "#10254a", marginBottom: 12 },
  imageMissing: { height: 180, background: "linear-gradient(135deg,#10254a,#1d4da8)", color: "white", display: "flex", flexDirection: "column", justifyContent: "center", padding: 18, boxSizing: "border-box" },
  imageMissingLarge: { height: 190, background: "linear-gradient(135deg,#10254a,#1d4da8)", color: "white", display: "flex", flexDirection: "column", justifyContent: "center", padding: 18, boxSizing: "border-box", borderRadius: 16, marginBottom: 12 },
  imageBadge: { letterSpacing: 7, fontWeight: 900, fontSize: 11, opacity: 0.8 },
  imageMissingTitle: { fontSize: 22, fontWeight: 900, marginTop: 12 },
  imageMissingText: { fontSize: 14, lineHeight: 1.4, marginTop: 8 },
  hotelBody: { padding: 14 },
  hotelName: { fontSize: 21, margin: "0 0 8px", fontWeight: 900 },
  hotelLocation: { color: "#52627c", margin: 0 },
  rateGood: { background: "#dff7e6", borderRadius: 12, padding: 9, margin: "10px 0", fontWeight: 900, color: "#075b24" },
  rateBlocked: { background: "#ffe1e1", borderRadius: 12, padding: 9, margin: "10px 0", fontWeight: 900, color: "#8a1111" },
  rateBox: { background: "#f6f8fc", borderRadius: 14, padding: 13, margin: "12px 0", fontSize: 14 },
  priceBreakdown: { background: "#f6f8fc", borderRadius: 16, padding: 13, marginBottom: 12 },
  priceBreakdownCompact: { background: "white", borderRadius: 12, padding: 10, marginTop: 10 },
  priceLine: { display: "flex", justifyContent: "space-between", gap: 10, padding: "5px 0", borderBottom: "1px solid #d9e3f2", fontSize: 14 },
  totalLine: { display: "flex", justifyContent: "space-between", gap: 10, padding: "9px 0", fontSize: 17, fontWeight: 900, color: "#0f4db3" },
  priceTrustNote: { background: "#dff7e6", color: "#075b24", borderRadius: 10, padding: 10, fontWeight: 900, fontSize: 12, marginTop: 8 },
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
  currencySelect: { padding: 12, borderRadius: 12, border: "1px solid #c6d5e8", fontWeight: 900, background: "white", color: "#07111f" },
  convertButton: { background: "#123a7a", color: "white", border: 0, borderRadius: 12, padding: "12px 18px", fontWeight: 900, cursor: "pointer" },
  convertedText: { marginTop: 10, fontWeight: 900, color: "#123a7a" },
  mapBox: { background: "#f6f8fc", padding: 8, borderRadius: 16, marginBottom: 12 },
  map: { width: "100%", height: 170, border: 0, borderRadius: 12 },
  guideSideButton: { marginTop: 10, width: "100%", background: "#10254a", color: "white", border: 0, borderRadius: 14, padding: 14, fontWeight: 900, cursor: "pointer" },

  guidePage: { minHeight: "100vh", background: "linear-gradient(135deg,#06101f,#071b38 45%,#0b2f6f)", color: "white", padding: 14, fontFamily: "Arial, sans-serif", boxSizing: "border-box", overflowY: "auto" },
  guideTop: { display: "grid", gridTemplateColumns: "1.1fr .9fr", gap: 12, marginBottom: 10 },
  guideBrand: { color: "#ffd34d", fontWeight: 900, letterSpacing: 10, fontSize: 11, marginBottom: 8 },
  guideHeadline: { fontSize: 34, lineHeight: 1.02, margin: 0 },
  guideCopy: { color: "#d8e7ff", fontSize: 15, lineHeight: 1.35, margin: "8px 0 0" },
  guideControls: { background: "rgba(255,255,255,.12)", borderRadius: 18, padding: 12, display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 },
  guideInput: { width: "100%", boxSizing: "border-box", border: 0, borderRadius: 11, padding: "10px 11px", fontSize: 14, background: "white", color: "#07111f" },
  guidePrimary: { background: "#ffd34d", color: "#07111f", border: 0, borderRadius: 11, padding: 11, fontWeight: 900, cursor: "pointer" },
  guideSecondary: { background: "rgba(255,255,255,.15)", color: "white", border: "1px solid rgba(255,255,255,.2)", borderRadius: 11, padding: 11, fontWeight: 900, cursor: "pointer" },
  destinationBar: { background: "rgba(255,255,255,.1)", borderRadius: 16, padding: 11, display: "flex", justifyContent: "space-between", gap: 12, alignItems: "center", marginBottom: 10 },
  destinationSmall: { color: "#ffd34d", fontWeight: 900, fontSize: 10, letterSpacing: 2 },
  destinationBig: { fontWeight: 900, fontSize: 22, marginTop: 2 },
  destinationSub: { color: "#d8e7ff", fontSize: 12, marginTop: 3 },
  guideTrust: { background: "rgba(255,255,255,.13)", borderRadius: 999, padding: "8px 10px", fontSize: 12, fontWeight: 900, whiteSpace: "nowrap" },
  guideContentGrid: { display: "grid", gridTemplateColumns: "360px 1fr", gap: 10, alignItems: "start" },
  emergencyPanel: { background: "linear-gradient(135deg,#fff0f0,#ffffff)", color: "#07111f", borderRadius: 16, padding: 12 },
  emergencyHeader: { display: "flex", justifyContent: "space-between", alignItems: "start", gap: 8, marginBottom: 9 },
  redSmall: { color: "#9d1111", fontWeight: 900, fontSize: 10, letterSpacing: 1.5 },
  emergencyTitle: { margin: "2px 0 0", fontSize: 22 },
  emergencyNumber: { background: "#9d1111", color: "white", borderRadius: 14, padding: "8px 11px", fontWeight: 900, fontSize: 22 },
  emergencyGrid: { display: "grid", gap: 7 },
  emergencyItem: { background: "white", borderRadius: 11, padding: 9, display: "grid", gap: 3, boxShadow: "0 6px 14px rgba(0,0,0,.08)" },
  guideTables: { display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 },
  guideTableWrap: { background: "rgba(255,255,255,.96)", color: "#07111f", borderRadius: 16, padding: 10 },
  guideTableTitle: { fontWeight: 900, fontSize: 16, marginBottom: 8, color: "#123a7a" },
  guideTableTitleRed: { fontWeight: 900, fontSize: 16, marginBottom: 8, color: "#9d1111" },
  guideTable: { display: "grid", gap: 6 },
  guideEmpty: { background: "#f6f8fc", borderRadius: 10, padding: 9, fontWeight: 900, color: "#52627c", fontSize: 12 },
  guideRow: { display: "grid", gridTemplateColumns: "1fr 92px 56px", gap: 7, alignItems: "center", background: "#f6f8fc", border: "1px solid #e1e8f4", borderRadius: 10, padding: 7 },
  guideCellMain: { display: "grid", gap: 3, fontSize: 12, lineHeight: 1.25 },
  guideCellType: { fontSize: 11, fontWeight: 900, color: "#52627c" },
  mapBtn: { background: "#123a7a", color: "white", border: 0, borderRadius: 8, padding: "7px 8px", fontWeight: 900, fontSize: 11, cursor: "pointer" },
  mapBtnRed: { background: "#9d1111", color: "white", border: 0, borderRadius: 8, padding: "7px 8px", fontWeight: 900, fontSize: 11, cursor: "pointer" },

  infoPage: { minHeight: "100vh", background: "linear-gradient(135deg,#06101f,#123a7a)", color: "white", padding: 34, fontFamily: "Arial, sans-serif" },
  infoCardWide: { maxWidth: 1180, background: "rgba(255,255,255,0.12)", border: "1px solid rgba(255,255,255,0.22)", borderRadius: 28, padding: 40 },
  infoTitle: { fontSize: 46, color: "#ffd34d", marginBottom: 8 },
  infoSubtitle: { fontSize: 22, fontWeight: 800, lineHeight: 1.4 },
  infoBody: { fontSize: 18, lineHeight: 1.6 },
  simpleGrid: { display: "grid", gridTemplateColumns: "1fr 1fr", gap: 18, marginTop: 24 },
  simpleBox: { background: "white", color: "#07111f", borderRadius: 20, padding: 22, fontSize: 18, lineHeight: 1.5 },
  confirmPage: { minHeight: "100vh", background: "linear-gradient(90deg,#06101f 0%,#123a7a 52%,#06101f 52%)", color: "white", display: "flex", alignItems: "center", padding: 34, fontFamily: "Arial, sans-serif" },
  confirmCard: { maxWidth: 780, background: "rgba(255,255,255,0.12)", border: "1px solid rgba(255,255,255,0.22)", borderRadius: 28, padding: 40 },
  confirmTitle: { fontSize: 48, color: "#ffd34d", margin: "0 0 20px" },
  confirmText: { fontSize: 20, lineHeight: 1.55 },
  codeBox: { background: "rgba(255,255,255,0.14)", borderRadius: 18, padding: 22, margin: "24px 0", fontSize: 18 },
  codeText: { fontSize: 28, marginTop: 10, fontWeight: 900, color: "#ffd34d" },
};