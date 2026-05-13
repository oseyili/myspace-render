import React, { useEffect, useMemo, useState } from "react";

const API_BASE =
  import.meta.env.VITE_API_BASE ||
  import.meta.env.VITE_API_BASE_URL ||
  "http://127.0.0.1:5050";

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
  if (typeof c === "string") return { city: c, live_hotels: 0, destination_code: "" };
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
        .filter((x) => x.city)
        .sort((a, b) => {
          if ((b.live_hotels || 0) !== (a.live_hotels || 0)) return (b.live_hotels || 0) - (a.live_hotels || 0);
          return a.city.localeCompare(b.city);
        }),
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
  return Number((baseCustomerRate(rate) * roomCount(rooms)).toFixed(2));
}

function finalSupplierTotal(rate, rooms) {
  return Number((baseSupplierRate(rate) * roomCount(rooms)).toFixed(2));
}

function fastImageUrl(url) {
  const raw = safeText(url);
  if (!raw) return "";

  let fixed = raw;

  if (fixed.includes("127.0.0.1:5050") && !API_BASE.includes("127.0.0.1")) {
    fixed = fixed
      .replace("http://127.0.0.1:5050", API_BASE)
      .replace("https://127.0.0.1:5050", API_BASE);
  }

  fixed = fixed
    .replace("/max1024x768/", "/max500/")
    .replace("/max1280x900/", "/max500/")
    .replace("/max1440x1080/", "/max500/")
    .replace("/max3000/", "/max500/")
    .replace("/bigger/", "/medium/");

  return fixed;
}

function go(path) {
  window.location.href = path;
}

function PropertyImage({ hotel, large = false }) {
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    setFailed(false);
  }, [hotel?.hotel_id, hotel?.image_url, hotel?.direct_image_url]);

  const url = fastImageUrl(hotel?.direct_image_url || hotel?.image_url);

  if (!url || failed) {
    return (
      <div className={large ? "imageMissing imageLarge" : "imageMissing"}>
        <div className="imageBadge">MYSPACE HOTEL</div>
        <div className="imageMissingTitle">Verified property image unavailable</div>
        <div className="imageMissingText">No fake hotel photo is displayed.</div>
      </div>
    );
  }

  return (
    <img
      src={url}
      alt={hotel?.hotel_name || "Hotel"}
      className={large ? "hotelImage imageLarge" : "hotelImage"}
      loading={large ? "eager" : "lazy"}
      decoding="async"
      fetchPriority={large ? "high" : "low"}
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
    <div className={compact ? "priceBox compactPrice" : "priceBox"}>
      <div className="priceLine"><span>Stay length</span><b>{nights} night{nights === 1 ? "" : "s"}</b></div>
      <div className="priceLine"><span>Guests</span><b>{guests}</b></div>
      <div className="priceLine"><span>Rooms selected</span><b>{count}</b></div>
      <div className="priceLine"><span>Rate per room</span><b>{currency} {money(base)}</b></div>
      <div className="priceLine"><span>Total check</span><b>{currency} {money(base)} Ã— {count}</b></div>
      <div className="totalLine"><span>Total to pay</span><b>{currency} {money(total)}</b></div>
    </div>
  );
}

function GuideTable({ title, items, red = false }) {
  const list = Array.isArray(items) ? items : [];

  return (
    <section className="guideTableWrap">
      <div className={red ? "guideTableTitleRed" : "guideTableTitle"}>{title}</div>
      <div className="guideTable">
        {list.length === 0 && <div className="guideEmpty">No nearby result loaded yet.</div>}
        {list.map((item, index) => (
          <div key={`${title}-${index}`} className="guideRow">
            <div className="guideCellMain">
              <b>{item.name || item.type || "Nearby place"}</b>
              <span>{item.purpose || item.address || item.type || ""}</span>
            </div>
            <div className="guideCellType">{item.type || "Nearby"}</div>
            <button className={red ? "mapBtnRed" : "mapBtn"} onClick={() => item.maps && window.open(item.maps, "_blank", "noopener,noreferrer")}>
              Map
            </button>
          </div>
        ))}
      </div>
    </section>
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
        <button className="goldSmall" onClick={() => go("/")}>Back to hotel search</button>
      </div>
    </div>
  );
}

function FAQs() {
  return (
    <InfoPage title="Frequently asked questions" subtitle="Clear answers before customers reserve or pay.">
      <div className="simpleGrid">
        <div className="simpleBox"><b>Can I pay online?</b><br />Yes. Payment is available only when a valid live rate is available.</div>
        <div className="simpleBox"><b>Are images fake?</b><br />No. Missing photos show a trust notice instead of fake hotel images.</div>
        <div className="simpleBox"><b>Why no price?</b><br />Some hotels are unavailable for the selected dates or city.</div>
        <div className="simpleBox"><b>Will I get confirmation?</b><br />Reservation updates are sent to the email address provided at checkout.</div>
      </div>
    </InfoPage>
  );
}

function Terms() {
  return (
    <InfoPage title="Booking terms" subtitle="Customer trust depends on accurate hotel and rate information.">
      <div className="simpleGrid">
        <div className="simpleBox">Review hotel name, room, board, dates, guests, currency, amount, and cancellation details before payment.</div>
        <div className="simpleBox">Prices and availability can change until confirmation is completed.</div>
        <div className="simpleBox">Payment is enabled only for stays with valid live rate keys and payable amounts.</div>
        <div className="simpleBox">No fake photos, no fake prices, and no misleading availability are shown.</div>
      </div>
    </InfoPage>
  );
}

function Support() {
  return (
    <InfoPage title="Customer support" subtitle="Reservation support for safer booking decisions.">
      <div className="simpleGrid">
        <div className="simpleBox"><b>Email</b><br />reservations@myspace-hotel.com</div>
        <div className="simpleBox"><b>Booking help</b><br />Include hotel name, dates, destination, and booking email.</div>
        <div className="simpleBox"><b>Arrival help</b><br />Include reservation code, guest name, and hotel name.</div>
        <div className="simpleBox"><b>Special requests</b><br />Add room, accessibility, family, or arrival needs before payment.</div>
      </div>
    </InfoPage>
  );
}

function TravelGuidePage() {
  const params = new URLSearchParams(window.location.search);
  const [catalog, setCatalog] = useState([]);
  const [country, setCountry] = useState(params.get("country") || "");
  const [city, setCity] = useState(params.get("city") || "");
  const [area, setArea] = useState(params.get("area") || "");
  const [guide, setGuide] = useState(null);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");

  const countries = useMemo(() => normalizeCountries(catalog), [catalog]);
  const cities = useMemo(() => countries.find((c) => c.country === country)?.cities || [], [countries, country]);

  async function loadGuide(nextCountry = country, nextCity = city, nextArea = area) {
    if (!nextCountry || !nextCity) {
      setMessage("Choose a country and city first.");
      return;
    }

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
    setLoadingCatalog(true);

    try {
      let loaded = [];

      const staticRes = await fetch("/live-destinations.json", { cache: "no-store" });
      const staticData = await staticRes.json().catch(() => ({}));
      loaded = Array.isArray(staticData.countries) ? staticData.countries : [];

      if (!loaded.length) {
        const bootRes = await fetch(`${API_BASE}/api/bootstrap`, { cache: "no-store" });
        const boot = await bootRes.json().catch(() => ({}));
        loaded = Array.isArray(boot.countries) ? boot.countries : [];
      }

      const normalized = normalizeCountries(loaded);
      setCatalog(normalized);

      const firstCountry = normalized[0] || null;
      const firstCity = firstCountry?.cities?.[0]?.city || "";

      setCountry(firstCountry?.country || "");
      setCity(firstCity);
      setHotels([]);
      setSelectedHotel(null);
      clearConverted();

      setMessage(
        firstCountry && firstCity
          ? "Available live-rate destinations are ready."
          : "No live-rate destinations are available right now."
      );
    } catch {
      setMessage("No live-rate destinations are available right now.");
    } finally {
      setLoadingCatalog(false);
    }
  }

  useEffect(() => {
    loadCatalog();
  }, []);

  function changeCountry(v) {
    const found = countries.find((x) => x.country === v);
    const firstCity =
      found?.cities?.find((c) => Number(c.live_hotels || 0) > 0)?.city ||
      found?.cities?.[0]?.city ||
      "";

    setCountry(v);
    setCity(firstCity);
    setGuide(null);
    setMessage("");

    if (v && firstCity) loadGuide(v, firstCity, area);
  }

  function changeCity(v) {
    setCity(v);
    setGuide(null);
    setMessage("");

    if (country && v) loadGuide(country, v, area);
  }

  const emergency = guide?.emergency || {};

  return (
    <div className="guidePage">
      <AppStyles />
      <section className="guideTop">
        <div>
          <div className="guideBrand">MYSPACE HOTEL</div>
          <h1 className="guideHeadline">Know the area before you arrive.</h1>
          <p className="guideCopy">Local help, nearby stays, food, transport, attractions and maps for the destination you selected.</p>
        </div>

        <div className="guideControls">
          <select className="input" value={country} onChange={(e) => changeCountry(e.target.value)}>
            <option value="">Choose country</option>
            {countries.map((c) => <option key={c.country} value={c.country}>{c.country}</option>)}
          </select>

          <select className="input" value={city} onChange={(e) => changeCity(e.target.value)} disabled={!country}>
            <option value="">Choose city</option>
            {cities.map((c) => <option key={`${country}-${c.city}`} value={c.city}>{c.city}{c.live_hotels ? ` (${c.live_hotels})` : ""}</option>)}
          </select>

          <input className="input" value={area} placeholder="Area or district" onChange={(e) => setArea(e.target.value)} />

          <button className="guidePrimary" onClick={() => loadGuide(country, city, area)} disabled={loading || !country || !city}>
            {loading ? "Loading..." : "Refresh"}
          </button>

          <button className="guideSecondary" onClick={() => go("/")}>Back</button>
        </div>
      </section>

      {message && <div className="notice">{message}</div>}

      {guide && (
        <>
          <div className="destinationBar">
            <div>
              <div className="destinationSmall">Your destination</div>
              <div className="destinationBig">{guide.destination}</div>
              <div className="destinationSub">Hotels, medical help, safety, food, transport and places to visit around this location.</div>
            </div>
            <div className="guideTrust">Maps â€¢ Nearby help â€¢ Arrival confidence</div>
          </div>

          <div className="guideContentGrid">
            <section className="emergencyPanel">
              <div className="emergencyHeader">
                <div>
                  <div className="redSmall">Important</div>
                  <h2 className="emergencyTitle">Emergency contacts</h2>
                </div>
                <div className="emergencyNumber">{emergency.emergency || "112"}</div>
              </div>

              <div className="emergencyGrid">
                {Object.entries(emergency).map(([k, v]) => (
                  <div key={k} className="emergencyItem">
                    <span>{k.replace(/_/g, " ")}</span>
                    <b>{v}</b>
                  </div>
                ))}
              </div>
            </section>

            <div className="guideTables">
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
    if (!code || code === "Your reservation") return;

    fetch(`${API_BASE}/reservation/${code}/mark-paid`, { method: "POST" })
      .then(() => setStatus("Payment received. Your reservation update is being processed."))
      .catch(() => setStatus("Payment received. Your reservation update is being processed securely."));
  }, [code]);

  return (
    <div className="confirmPage">
      <AppStyles />
      <div className="confirmCard">
        <div className="brandSmall">MYSPACE HOTEL</div>
        <h1 className="confirmTitle">Payment received</h1>
        <p className="confirmText">{status}</p>
        <div className="codeBox"><b>Reservation code:</b><div className="codeText">{code}</div></div>
        <button className="goldSmall" onClick={() => go("/")}>Back to hotel search</button>
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

      const bootRes = await fetch(`${API_BASE}/api/bootstrap`, { cache: "no-store" });
      const boot = await bootRes.json().catch(() => ({}));
      loaded = Array.isArray(boot.countries) ? boot.countries : [];

      if (!loaded.length) {
        const catRes = await fetch(`${API_BASE}/api/real-catalog/destinations`, { cache: "no-store" });
        const cat = await catRes.json().catch(() => ({}));
        loaded = Array.isArray(cat.countries) ? cat.countries : [];
      }

      const normalized = normalizeCountries(loaded);
      setCatalog(normalized);

      setCountry("");
      setCity("");
      setHotels([]);
      setSelectedHotel(null);
      clearConverted();

      setMessage(
        normalized.length
          ? `Available live-rate destinations are ready.`
          : "No live-rate destinations are available right now."
      );
    } catch {
      setMessage("No live-rate destinations are available right now.");
    } finally {
      setLoadingCatalog(false);
    }
  }

  useEffect(() => {
    loadCatalog();
  }, []);

  function changeCountry(nextCountry) {
    const found = countries.find((x) => x.country === nextCountry);
    const firstCity =
      found?.cities?.find((c) => Number(c.live_hotels || 0) > 0)?.city ||
      found?.cities?.[0]?.city ||
      "";

    setCountry(nextCountry);
    setCity(firstCity);
    setHotels([]);
    setSelectedHotel(null);
    clearConverted();
    setMessage(nextCountry && firstCity ? "City selected. Press Search stays to continue." : "No city found for this country.");
  }

  function changeCity(nextCity) {
    setCity(nextCity);
    setHotels([]);
    setSelectedHotel(null);
    clearConverted();
    setMessage(nextCity ? "Press Search stays to continue." : "Choose a city first.");
  }

  async function convertTotal() {
    if (!selectedHotel?.live_rate_ready || !selectedHotel?.first_rate) {
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
    <div className="page">
      <AppStyles />

      <section className="hero">
        <div>
          <div className="brand">MYSPACE HOTEL</div>
          <h1 className="heroTitle">Book with clarity before you arrive.</h1>
          <p className="heroText">Choose your destination, review the stay, check your total and explore the area with confidence.</p>
        </div>

        <div className="buttonRow">
          <button className="whiteButton" onClick={() => go(`/?page=travel&country=${encodeURIComponent(country)}&city=${encodeURIComponent(city)}&area=${encodeURIComponent(area)}`)}>Destination Guide</button>
          <button className="whiteButton" onClick={() => go("/?page=faq")}>FAQ</button>
          <button className="whiteButton" onClick={() => go("/?page=terms")}>Terms</button>
          <button className="whiteButton" onClick={() => go("/?page=support")}>Contact</button>
        </div>
      </section>

      <section className="mainGrid">
        <div className="column">
          <div className="labelTop">SEARCH</div>

          <div className="searchBox">
            <p className="muted">{loadingCatalog ? "Loading catalogue..." : `Available live-rate destinations are ready.`}</p>

            <label className="formLabel">Country</label>
            <select className="input" value={country} onChange={(e) => changeCountry(e.target.value)}>
              <option value="">Choose country</option>
              {countries.map((c) => <option key={c.country} value={c.country}>{c.country}</option>)}
            </select>

            <label className="formLabel">City</label>
            <select className="input" value={city} onChange={(e) => changeCity(e.target.value)} disabled={!country}>
              <option value="">Choose city</option>
              {cities.map((c) => (
                <option key={`${country}-${c.city}`} value={c.city}>{c.city}{c.live_hotels ? ` (${c.live_hotels})` : ""}</option>
              ))}
            </select>

            <label className="formLabel">Area</label>
            <input className="input" value={area} onChange={(e) => setArea(e.target.value)} placeholder="Neighbourhood or area" />

            <label className="formLabel">Keyword</label>
            <input className="input" value={keyword} onChange={(e) => setKeyword(e.target.value)} placeholder="Hotel name or landmark" />

            <div className="twoInput">
              <div>
                <label className="formLabel">Check-in</label>
                <input className="input" type="date" value={checkin} onChange={(e) => { setCheckin(e.target.value); clearConverted(); }} />
              </div>
              <div>
                <label className="formLabel">Check-out</label>
                <input className="input" type="date" value={checkout} onChange={(e) => { setCheckout(e.target.value); clearConverted(); }} />
              </div>
            </div>

            <div className="twoInput">
              <div>
                <label className="formLabel">Guests</label>
                <input className="input" type="number" min="1" value={guests} onChange={(e) => { setGuests(Number(e.target.value)); clearConverted(); }} />
              </div>
              <div>
                <label className="formLabel">Rooms</label>
                <input className="input" type="number" min="1" value={rooms} onChange={(e) => { setRooms(roomCount(e.target.value)); clearConverted(); }} />
              </div>
            </div>

            <button className="goldButton" onClick={() => runSearch()} disabled={loading || loadingCatalog || !country || !city}>
              {loading ? "Loading..." : "Search stays"}
            </button>

            {message && <div className="notice">{message}</div>}
          </div>
        </div>

        <div className="column">
          <div className="labelTop">STAYS</div>

          <div className="scroll">
            {hotels.map((hotel) => {
              const rate = hotel.first_rate || {};
              const canPay = hotel.live_rate_ready && rate.rate_key && finalCustomerTotal(rate, rooms) > 0;

              return (
                <div key={hotel.hotel_id} className={selectedHotel?.hotel_id === hotel.hotel_id ? "hotelCardSelected" : "hotelCard"} onClick={() => { setSelectedHotel(hotel); clearConverted(); }}>
                  <PropertyImage hotel={hotel} />

                  <div className="hotelBody">
                    <h2 className="hotelName">{hotel.hotel_name}</h2>
                    <p className="hotelLocation">{hotel.area ? `${hotel.area}, ` : ""}{hotel.city}, {hotel.country}</p>

                    <div className={canPay ? "rateGood" : "rateBlocked"}>{canPay ? "Ready to reserve" : "Price unavailable"}</div>

                    {canPay ? (
                      <div className="rateBox">
                        <p><b>Room:</b> {rate.room_name || "Selected room"}</p>
                        <p><b>Board:</b> {rate.board_name || "Room only"}</p>
                        <p><b>Final price:</b> {rate.currency} {money(finalCustomerTotal(rate, rooms))}</p>
                        <PriceBreakdown rate={rate} checkin={checkin} checkout={checkout} rooms={rooms} guests={guests} compact />
                      </div>
                    ) : (
                      <div className="rateBox">No unavailable price is shown.</div>
                    )}

                    <div className="buttonPair">
                      <button className="reserveMini" onClick={(e) => { e.stopPropagation(); setSelectedHotel(hotel); clearConverted(); }}>View</button>
                      <button className={canPay ? "payMini" : "payDisabled"} disabled={!canPay} onClick={(e) => { e.stopPropagation(); requestBooking(hotel); }}>
                        {canPay ? "Pay" : "Unavailable"}
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}

            {!loading && hotels.length === 0 && <div className="emptyBox">Choose an available destination, then press Search stays.</div>}
          </div>
        </div>

        <div className="column">
          <div className="labelTop">RESERVE / PAY</div>

          {!selectedHotel ? (
            <div className="emptyBox">Select a stay to continue.</div>
          ) : (
            <div className="reservePanel">
              <PropertyImage hotel={selectedHotel} large />

              <h2 className="hotelName">{selectedHotel.hotel_name}</h2>
              <p className="hotelLocation">{selectedHotel.city}, {selectedHotel.country}</p>

              {selectedCanPay ? (
                <>
                  <div className="selectedPrice">{selectedHotel.first_rate.currency} {money(finalCustomerTotal(selectedHotel.first_rate, rooms))}</div>
                  <PriceBreakdown rate={selectedHotel.first_rate} checkin={checkin} checkout={checkout} rooms={rooms} guests={guests} />
                </>
              ) : (
                <div className="selectedUnavailable">Price unavailable for this stay.</div>
              )}

              <div className="currencyBox">
                <div className="currencyTitle">Currency converter</div>
                <div className="currencyRow">
                  <select className="currencySelect" value={targetCurrency} onChange={(e) => { setTargetCurrency(e.target.value); clearConverted(); }}>
                    {["USD", "GBP", "EUR", "NGN", "AED", "CAD", "AUD", "ZAR", "CHF", "JPY"].map((c) => <option key={c} value={c}>{c}</option>)}
                  </select>
                  <button className="convertButton" onClick={convertTotal}>Convert</button>
                </div>
                <div className="convertedText">{convertedTotal || "Select currency and convert"}</div>
              </div>

              <div className="mapBox">
                <iframe
                  title="Hotel map"
                  className="map"
                  loading="lazy"
                  src={
                    selectedHotel.latitude && selectedHotel.longitude
                      ? `https://maps.google.com/maps?q=${selectedHotel.latitude},${selectedHotel.longitude}&z=14&output=embed`
                      : `https://maps.google.com/maps?q=${encodeURIComponent(selectedHotel.hotel_name + " " + selectedHotel.city)}&z=14&output=embed`
                  }
                />
              </div>

              <input className="input" value={customerName} onChange={(e) => setCustomerName(e.target.value)} placeholder="Your full name" />
              <input className="input" value={customerEmail} onChange={(e) => setCustomerEmail(e.target.value)} placeholder="Your email" />
              <input className="input" value={customerPhone} onChange={(e) => setCustomerPhone(e.target.value)} placeholder="Phone number" />
              <textarea className="textarea" value={note} onChange={(e) => setNote(e.target.value)} placeholder="Special requests" />

              <div className="buttonPairLarge">
                <button className="reserveLarge" disabled={requesting} onClick={() => setMessage(`Saved for review: ${selectedHotel.hotel_name}.`)}>Save</button>
                <button className={selectedCanPay ? "payLarge" : "payDisabledLarge"} disabled={!selectedCanPay || requesting} onClick={() => requestBooking(selectedHotel)}>
                  {requesting ? "Preparing..." : selectedCanPay ? "Pay exact total" : "Unavailable"}
                </button>
              </div>

              <button className="guideSideButton" onClick={() => go(`/?page=travel&country=${encodeURIComponent(selectedHotel.country)}&city=${encodeURIComponent(selectedHotel.city)}&area=${encodeURIComponent(selectedHotel.area || area)}`)}>
                Open destination guide
              </button>
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
      body { margin: 0; background: #06101f; }
      button, select, input, textarea { font-family: inherit; }
      .page { min-height: 100vh; background: #06101f; color: white; padding: 18px; font-family: Arial, sans-serif; }
      .hero { background: linear-gradient(135deg,#0f2f69,#1e5cc7); border-radius: 24px; padding: 24px; display: grid; grid-template-columns: 1.2fr .8fr; gap: 20px; align-items: center; margin-bottom: 16px; }
      .brand { letter-spacing: 14px; font-weight: 900; color: #ffd34d; margin-bottom: 12px; }
      .brandSmall { letter-spacing: 10px; font-weight: 900; margin-bottom: 20px; }
      .heroTitle { font-size: 38px; line-height: 1.1; margin: 0; }
      .heroText { font-size: 18px; line-height: 1.5; margin-top: 12px; }
      .buttonRow { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
      .whiteButton { background: white; color: #07111f; border: 0; border-radius: 14px; padding: 14px 18px; font-weight: 900; font-size: 16px; cursor: pointer; }
      .mainGrid { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 18px; }
      .column { height: 73vh; background: #eaf2fb; color: #07111f; border-radius: 24px; padding: 18px; overflow: hidden; display: flex; flex-direction: column; }
      .labelTop { letter-spacing: 4px; color: #63738e; font-weight: 900; margin-bottom: 12px; }
      .searchBox, .reservePanel, .emptyBox { background: white; border-radius: 18px; padding: 16px; }
      .searchBox, .reservePanel { overflow: auto; }
      .muted { color: #63738e; font-weight: 800; }
      .formLabel { display: block; font-weight: 900; margin-top: 10px; margin-bottom: 5px; }
      .input, .textarea, .currencySelect { width: 100%; padding: 12px 13px; margin: 4px 0; border-radius: 12px; border: 1px solid #c6d5e8; font-size: 15px; background: white; color: #07111f; }
      .textarea { min-height: 82px; resize: vertical; }
      .twoInput { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
      .goldButton, .goldSmall { background: #ffd34d; color: #07111f; border: 2px solid #07111f; border-radius: 14px; padding: 15px 18px; font-size: 18px; font-weight: 900; cursor: pointer; }
      .goldButton { width: 100%; margin-top: 14px; }
      .goldSmall { margin-top: 22px; }
      .notice { background: #fff2be; padding: 13px; border-radius: 14px; margin-top: 14px; font-weight: 900; color: #07111f; }
      .scroll { overflow-y: auto; padding-right: 6px; }
      .hotelCard, .hotelCardSelected { background: white; border-radius: 20px; margin-bottom: 16px; overflow: hidden; cursor: pointer; }
      .hotelCard { border: 2px solid transparent; }
      .hotelCardSelected { border: 4px solid #ffd34d; }
      .hotelImage { width: 100%; height: 180px; object-fit: cover; display: block; background: #10254a; }
      .imageLarge { height: 190px; border-radius: 16px; margin-bottom: 12px; }
      .imageMissing { height: 180px; background: linear-gradient(135deg,#10254a,#1d4da8); color: white; display: flex; flex-direction: column; justify-content: center; padding: 18px; }
      .imageBadge { letter-spacing: 7px; font-weight: 900; font-size: 11px; opacity: .8; }
      .imageMissingTitle { font-size: 22px; font-weight: 900; margin-top: 12px; }
      .imageMissingText { font-size: 14px; line-height: 1.4; margin-top: 8px; }
      .hotelBody { padding: 14px; }
      .hotelName { font-size: 21px; margin: 0 0 8px; font-weight: 900; }
      .hotelLocation { color: #52627c; margin: 0; }
      .rateGood { background: #dff7e6; border-radius: 12px; padding: 9px; margin: 10px 0; font-weight: 900; color: #075b24; }
      .rateBlocked { background: #ffe1e1; border-radius: 12px; padding: 9px; margin: 10px 0; font-weight: 900; color: #8a1111; }
      .rateBox, .priceBox { background: #f6f8fc; border-radius: 14px; padding: 13px; margin: 12px 0; font-size: 14px; }
      .compactPrice { background: white; border-radius: 12px; padding: 10px; margin-top: 10px; }
      .priceLine { display: flex; justify-content: space-between; gap: 10px; padding: 5px 0; border-bottom: 1px solid #d9e3f2; font-size: 14px; }
      .totalLine { display: flex; justify-content: space-between; gap: 10px; padding: 9px 0; font-size: 17px; font-weight: 900; color: #0f4db3; }
      .buttonPair, .buttonPairLarge { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
      .buttonPairLarge { margin-top: 14px; }
      .reserveMini, .reserveLarge, .guideSideButton { background: #10254a; color: white; border: 0; font-weight: 900; cursor: pointer; }
      .reserveMini { width: 100%; border-radius: 12px; padding: 12px; margin-top: 10px; }
      .reserveLarge, .payLarge, .payDisabledLarge { width: 100%; border-radius: 14px; padding: 15px 18px; font-size: 18px; }
      .payMini, .payLarge { background: #ffd34d; color: #07111f; border: 2px solid #07111f; font-weight: 900; cursor: pointer; }
      .payMini, .payDisabled { width: 100%; border-radius: 12px; padding: 12px; font-weight: 900; }
      .payDisabled, .payDisabledLarge { background: #c8d0dd; color: #52627c; border: 0; cursor: not-allowed; font-weight: 900; }
      .selectedPrice { color: #0f4db3; font-size: 26px; font-weight: 900; margin-bottom: 14px; }
      .selectedUnavailable { background: #ffe1e1; color: #8a1111; padding: 13px; border-radius: 14px; margin-bottom: 14px; font-weight: 900; }
      .currencyBox { background: #f6f8fc; border-radius: 16px; padding: 14px; margin-bottom: 12px; }
      .currencyTitle { font-weight: 900; margin-bottom: 10px; }
      .currencyRow { display: grid; grid-template-columns: 1fr auto; gap: 10px; }
      .convertButton { background: #123a7a; color: white; border: 0; border-radius: 12px; padding: 12px 18px; font-weight: 900; cursor: pointer; }
      .convertedText { margin-top: 10px; font-weight: 900; color: #123a7a; }
      .mapBox { background: #f6f8fc; padding: 8px; border-radius: 16px; margin-bottom: 12px; }
      .map { width: 100%; height: 170px; border: 0; border-radius: 12px; }
      .guideSideButton { margin-top: 10px; width: 100%; border-radius: 14px; padding: 14px; }

      .guidePage { min-height: 100vh; background: linear-gradient(135deg,#06101f,#071b38 45%,#0b2f6f); color: white; padding: 14px; font-family: Arial, sans-serif; overflow-y: auto; }
      .guideTop { display: grid; grid-template-columns: 1.1fr .9fr; gap: 12px; margin-bottom: 10px; }
      .guideBrand { color: #ffd34d; font-weight: 900; letter-spacing: 10px; font-size: 11px; margin-bottom: 8px; }
      .guideHeadline { font-size: 34px; line-height: 1.02; margin: 0; }
      .guideCopy { color: #d8e7ff; font-size: 15px; line-height: 1.35; margin: 8px 0 0; }
      .guideControls { background: rgba(255,255,255,.12); border-radius: 18px; padding: 12px; display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }
      .guidePrimary { background: #ffd34d; color: #07111f; border: 0; border-radius: 11px; padding: 11px; font-weight: 900; cursor: pointer; }
      .guideSecondary { background: rgba(255,255,255,.15); color: white; border: 1px solid rgba(255,255,255,.2); border-radius: 11px; padding: 11px; font-weight: 900; cursor: pointer; }
      .destinationBar { background: rgba(255,255,255,.1); border-radius: 16px; padding: 11px; display: flex; justify-content: space-between; gap: 12px; align-items: center; margin-bottom: 10px; }
      .destinationSmall { color: #ffd34d; font-weight: 900; font-size: 10px; letter-spacing: 2px; }
      .destinationBig { font-weight: 900; font-size: 22px; margin-top: 2px; }
      .destinationSub { color: #d8e7ff; font-size: 12px; margin-top: 3px; }
      .guideTrust { background: rgba(255,255,255,.13); border-radius: 999px; padding: 8px 10px; font-size: 12px; font-weight: 900; white-space: nowrap; }
      .guideContentGrid { display: grid; grid-template-columns: 360px 1fr; gap: 10px; align-items: start; }
      .emergencyPanel { background: linear-gradient(135deg,#fff0f0,#ffffff); color: #07111f; border-radius: 16px; padding: 12px; }
      .emergencyHeader { display: flex; justify-content: space-between; gap: 8px; margin-bottom: 9px; }
      .redSmall { color: #9d1111; font-weight: 900; font-size: 10px; letter-spacing: 1.5px; }
      .emergencyTitle { margin: 2px 0 0; font-size: 22px; }
      .emergencyNumber { background: #9d1111; color: white; border-radius: 14px; padding: 8px 11px; font-weight: 900; font-size: 22px; }
      .emergencyGrid { display: grid; gap: 7px; }
      .emergencyItem { background: white; border-radius: 11px; padding: 9px; display: grid; gap: 3px; box-shadow: 0 6px 14px rgba(0,0,0,.08); }
      .guideTables { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
      .guideTableWrap { background: rgba(255,255,255,.96); color: #07111f; border-radius: 16px; padding: 10px; }
      .guideTableTitle { font-weight: 900; font-size: 16px; margin-bottom: 8px; color: #123a7a; }
      .guideTableTitleRed { font-weight: 900; font-size: 16px; margin-bottom: 8px; color: #9d1111; }
      .guideTable { display: grid; gap: 6px; }
      .guideEmpty { background: #f6f8fc; border-radius: 10px; padding: 9px; font-weight: 900; color: #52627c; font-size: 12px; }
      .guideRow { display: grid; grid-template-columns: 1fr 92px 56px; gap: 7px; align-items: center; background: #f6f8fc; border: 1px solid #e1e8f4; border-radius: 10px; padding: 7px; }
      .guideCellMain { display: grid; gap: 3px; font-size: 12px; line-height: 1.25; }
      .guideCellType { font-size: 11px; font-weight: 900; color: #52627c; }
      .mapBtn, .mapBtnRed { color: white; border: 0; border-radius: 8px; padding: 7px 8px; font-weight: 900; font-size: 11px; cursor: pointer; }
      .mapBtn { background: #123a7a; }
      .mapBtnRed { background: #9d1111; }

      .infoPage { min-height: 100vh; background: linear-gradient(135deg,#06101f,#123a7a); color: white; padding: 34px; font-family: Arial, sans-serif; }
      .infoCard { max-width: 1180px; background: rgba(255,255,255,0.12); border: 1px solid rgba(255,255,255,0.22); border-radius: 28px; padding: 40px; }
      .infoTitle { font-size: 46px; color: #ffd34d; margin-bottom: 8px; }
      .infoSubtitle { font-size: 22px; font-weight: 800; line-height: 1.4; }
      .simpleGrid { display: grid; grid-template-columns: 1fr 1fr; gap: 18px; margin-top: 24px; }
      .simpleBox { background: white; color: #07111f; border-radius: 20px; padding: 22px; font-size: 18px; line-height: 1.5; }
      .confirmPage { min-height: 100vh; background: linear-gradient(90deg,#06101f 0%,#123a7a 52%,#06101f 52%); color: white; display: flex; align-items: center; padding: 34px; font-family: Arial, sans-serif; }
      .confirmCard { max-width: 780px; background: rgba(255,255,255,0.12); border: 1px solid rgba(255,255,255,0.22); border-radius: 28px; padding: 40px; }
      .confirmTitle { font-size: 48px; color: #ffd34d; margin: 0 0 20px; }
      .confirmText { font-size: 20px; line-height: 1.55; }
      .codeBox { background: rgba(255,255,255,0.14); border-radius: 18px; padding: 22px; margin: 24px 0; font-size: 18px; }
      .codeText { font-size: 28px; margin-top: 10px; font-weight: 900; color: #ffd34d; }

      @media (max-width: 980px) {
        .page { padding: 10px; overflow: auto; }
        .hero { grid-template-columns: 1fr; padding: 18px; border-radius: 18px; }
        .brand { letter-spacing: 8px; font-size: 12px; }
        .heroTitle { font-size: 32px; }
        .heroText { font-size: 16px; }
        .buttonRow { grid-template-columns: 1fr 1fr; }
        .mainGrid { grid-template-columns: 1fr; gap: 12px; }
        .column { height: auto; min-height: auto; border-radius: 18px; padding: 14px; }
        .scroll { max-height: none; overflow: visible; }
        .hotelImage, .imageMissing, .imageLarge { height: 220px; }
        .guideTop, .guideContentGrid, .guideTables { grid-template-columns: 1fr; }
        .guideControls { grid-template-columns: 1fr; }
        .destinationBar { display: block; }
        .guideTrust { margin-top: 10px; display: inline-block; white-space: normal; }
        .simpleGrid { grid-template-columns: 1fr; }
        .infoPage, .confirmPage { padding: 16px; }
        .infoCard, .confirmCard { padding: 22px; border-radius: 20px; }
        .infoTitle, .confirmTitle { font-size: 34px; }
      }

      @media (max-width: 560px) {
        .page { padding: 8px; }
        .hero { padding: 16px; }
        .heroTitle { font-size: 28px; }
        .heroText { font-size: 15px; }
        .buttonRow, .twoInput, .buttonPair, .buttonPairLarge, .currencyRow { grid-template-columns: 1fr; }
        .whiteButton, .goldButton, .reserveLarge, .payLarge, .payDisabledLarge { width: 100%; font-size: 15px; padding: 14px; }
        .column { padding: 12px; }
        .searchBox, .reservePanel, .emptyBox { padding: 14px; }
        .hotelName { font-size: 20px; }
        .selectedPrice { font-size: 24px; }
        .guideRow { grid-template-columns: 1fr; }
        .mapBtn, .mapBtnRed { width: 100%; }
      }
    `}</style>
  );
}

export default function App() {
  const path = window.location.pathname;
  const page = new URLSearchParams(window.location.search).get("page");

  if (path === "/travel" || page === "travel") return <TravelGuidePage />;
  if (path === "/faq" || page === "faq") return <FAQs />;
  if (path === "/terms" || page === "terms") return <Terms />;
  if (path === "/support" || page === "support") return <Support />;
  if (path === "/reservation-confirmed") return <Confirmed />;

  return <MainPortal />;
}
