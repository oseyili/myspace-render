"use client";

import { useEffect, useMemo, useState } from "react";

type Hotel = {
  hotel_id?: string;
  name: string;
  location: string;
  city?: string;
  country: string;
  price: number;
  rating: number;
  image: string;
  address?: string;
  currency?: string;
  amenities?: string[];
};

type SearchResponse = {
  results?: Hotel[];
  message?: string;
  detail?: string;
  total?: number;
  page?: number;
  page_size?: number;
  has_more?: boolean;
  resolved_city?: string;
  resolved_country?: string;
};

type MapsConfigResponse = {
  google_maps_api_key?: string;
  google_maps_configured?: boolean;
};

type SurveyState = {
  satisfaction: string;
  recommend: string;
  cleanliness: string;
  easeOfUse: string;
  comments: string;
};

type AffiliateProvider =
  | "booking"
  | "expedia"
  | "hotels"
  | "trip"
  | "agoda"
  | "travelpayouts"
  | "none";

type AffiliateSelection = {
  provider: AffiliateProvider;
  label: string;
  disclosure: string;
  url: string;
};

const API_BASE = process.env.NEXT_PUBLIC_API_BASE || "http://127.0.0.1:5050";
const SUPPORT_EMAIL =
  process.env.NEXT_PUBLIC_SUPPORT_EMAIL || "reservations@myspace-hotel.com";
const APP_NAME = process.env.NEXT_PUBLIC_APP_NAME || "My Space Hotel";
const FALLBACK_HOTEL_IMAGE =
  "https://images.unsplash.com/photo-1505693416388-ac5ce068fe85?auto=format&fit=crop&w=1600&q=80";

const PREFERENCE_LABELS = [
  "Free WiFi",
  "Breakfast included",
  "Parking",
  "Gym",
  "Swimming pool",
  "Airport shuttle",
  "Family rooms",
  "Free cancellation",
];

function todayPlus(days: number) {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

function formatMoney(value: number, currency?: string) {
  const code = (currency || "").trim().toUpperCase() || "USD";
  try {
    return new Intl.NumberFormat("en", {
      style: "currency",
      currency: code,
      maximumFractionDigits: 2,
    }).format(Number(value || 0));
  } catch {
    return `${code} ${Number(value || 0).toFixed(2)}`;
  }
}

function getDestinationText(hotel: Hotel) {
  return [hotel.name, hotel.location, hotel.country].filter(Boolean).join(", ");
}

function applyTemplate(
  template: string,
  hotel: Hotel,
  checkIn: string,
  checkOut: string,
  guests: number,
  rooms: number
) {
  const destinationText = getDestinationText(hotel);
  const replacements: Record<string, string> = {
    "{hotel_name}": hotel.name || "",
    "{location}": hotel.location || "",
    "{city}": hotel.city || hotel.location || "",
    "{country}": hotel.country || "",
    "{destination}": destinationText,
    "{address}": hotel.address || "",
    "{checkin}": checkIn,
    "{checkout}": checkOut,
    "{guests}": String(Math.max(1, guests)),
    "{rooms}": String(Math.max(1, rooms)),
    "{price}": String(Number(hotel.price || 0)),
    "{currency}": (hotel.currency || "").trim().toUpperCase(),
  };

  let built = template;
  Object.entries(replacements).forEach(([token, value]) => {
    built = built.split(token).join(encodeURIComponent(value));
  });

  return built;
}

function buildAffiliateSelection(
  hotel: Hotel,
  checkIn: string,
  checkOut: string,
  guests: number,
  rooms: number
): AffiliateSelection {
  const destinationText = getDestinationText(hotel);

  const bookingAid = (process.env.NEXT_PUBLIC_BOOKING_AID || "").trim();
  if (bookingAid) {
    const params = new URLSearchParams();
    params.set("aid", bookingAid);
    params.set("label", "myspace_hotel_app");
    params.set("checkin", checkIn);
    params.set("checkout", checkOut);
    params.set("group_adults", String(Math.max(1, guests)));
    params.set("no_rooms", String(Math.max(1, rooms)));
    if (destinationText) params.set("ss", destinationText);

    return {
      provider: "booking",
      label: "Check availability on Booking.com",
      disclosure: "You will be redirected to Booking.com to complete your reservation.",
      url: `https://www.booking.com/searchresults.html?${params.toString()}`,
    };
  }

  const expediaTemplate = (
    process.env.NEXT_PUBLIC_EXPEDIA_AFFILIATE_TEMPLATE || ""
  ).trim();
  if (expediaTemplate) {
    return {
      provider: "expedia",
      label: "Check availability on Expedia",
      disclosure: "You will be redirected to Expedia to complete your reservation.",
      url: applyTemplate(expediaTemplate, hotel, checkIn, checkOut, guests, rooms),
    };
  }

  const hotelsTemplate = (
    process.env.NEXT_PUBLIC_HOTELS_AFFILIATE_TEMPLATE || ""
  ).trim();
  if (hotelsTemplate) {
    return {
      provider: "hotels",
      label: "Check availability on Hotels.com",
      disclosure: "You will be redirected to Hotels.com to complete your reservation.",
      url: applyTemplate(hotelsTemplate, hotel, checkIn, checkOut, guests, rooms),
    };
  }

  const tripTemplate = (process.env.NEXT_PUBLIC_TRIP_AFFILIATE_TEMPLATE || "").trim();
  if (tripTemplate) {
    return {
      provider: "trip",
      label: "Check availability on Trip.com",
      disclosure: "You will be redirected to Trip.com to complete your reservation.",
      url: applyTemplate(tripTemplate, hotel, checkIn, checkOut, guests, rooms),
    };
  }

  const agodaAffiliateId = (
    process.env.NEXT_PUBLIC_AGODA_AFFILIATE_ID || ""
  ).trim();
  if (agodaAffiliateId) {
    const params = new URLSearchParams();
    params.set("cid", agodaAffiliateId);
    params.set("checkIn", checkIn);
    params.set("checkOut", checkOut);
    params.set("adults", String(Math.max(1, guests)));
    params.set("rooms", String(Math.max(1, rooms)));
    if (destinationText) params.set("textToSearch", destinationText);

    return {
      provider: "agoda",
      label: "Check availability on Agoda",
      disclosure: "You will be redirected to Agoda to complete your reservation.",
      url: `https://www.agoda.com/search?${params.toString()}`,
    };
  }

  const marker = (process.env.NEXT_PUBLIC_TRAVELPAYOUTS_MARKER || "").trim();
  const host = (
    process.env.NEXT_PUBLIC_TRAVELPAYOUTS_HOST || "https://tp.media"
  ).trim();

  if (marker) {
    const deep = new URL("https://search.hotellook.com/");
    deep.searchParams.set("destination", destinationText || hotel.name || "Hotel");
    deep.searchParams.set("checkIn", checkIn);
    deep.searchParams.set("checkOut", checkOut);
    deep.searchParams.set("adults", String(Math.max(1, guests)));
    deep.searchParams.set("rooms", String(Math.max(1, rooms)));

    const wrapper = new URL(`${host.replace(/\/$/, "")}/r`);
    wrapper.searchParams.set("marker", marker);
    wrapper.searchParams.set("trs", "426710");
    wrapper.searchParams.set("p", "4114");
    wrapper.searchParams.set("u", deep.toString());

    return {
      provider: "travelpayouts",
      label: "Check hotel options",
      disclosure: "You will be redirected to our hotel partner to complete your reservation.",
      url: wrapper.toString(),
    };
  }

  return {
    provider: "none",
    label: "Affiliate booking unavailable",
    disclosure: "Affiliate booking is not active yet. Add your approved affiliate details first.",
    url: "",
  };
}

export default function HomePage() {
  const [destination, setDestination] = useState("London");
  const [country, setCountry] = useState("United Kingdom");
  const [city, setCity] = useState("");
  const [locationText, setLocationText] = useState("");

  const [checkIn, setCheckIn] = useState(todayPlus(7));
  const [checkOut, setCheckOut] = useState(todayPlus(8));
  const [guests, setGuests] = useState(1);
  const [rooms, setRooms] = useState(1);

  const [guestName, setGuestName] = useState("");
  const [email, setEmail] = useState("");

  const [hotels, setHotels] = useState<Hotel[]>([]);
  const [selected, setSelected] = useState<Hotel | null>(null);

  const [mapsApiKey, setMapsApiKey] = useState("");
  const [mapsConfigured, setMapsConfigured] = useState(false);

  const [loadingSearch, setLoadingSearch] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);

  const [preferences, setPreferences] = useState<string[]>([]);
  const [statusMessage, setStatusMessage] = useState(
    "Enter a destination and search live real hotel results."
  );
  const [bookingMessage, setBookingMessage] = useState("");

  const [page, setPage] = useState(1);
  const [pageSize] = useState(50);
  const [totalResults, setTotalResults] = useState(0);
  const [hasMore, setHasMore] = useState(false);

  const [surveySubmitted, setSurveySubmitted] = useState(false);
  const [survey, setSurvey] = useState<SurveyState>({
    satisfaction: "",
    recommend: "",
    cleanliness: "",
    easeOfUse: "",
    comments: "",
  });

  useEffect(() => {
    void fetchMapsConfig();
  }, []);

  async function fetchMapsConfig() {
    try {
      const res = await fetch(`${API_BASE}/api/maps-config`, { cache: "no-store" });
      const data: MapsConfigResponse = await res.json();
      setMapsApiKey(String(data.google_maps_api_key || ""));
      setMapsConfigured(Boolean(data.google_maps_configured));
    } catch {
      setMapsApiKey("");
      setMapsConfigured(false);
    }
  }

  function togglePreference(label: string) {
    setPreferences((current) =>
      current.includes(label) ? current.filter((item) => item !== label) : [...current, label]
    );
  }

  async function fetchHotels(targetPage: number, append: boolean) {
    if (!destination.trim() && !city.trim() && !locationText.trim() && !country.trim()) {
      setStatusMessage("Please enter a destination, city, country, or location to search hotels.");
      setHotels([]);
      setSelected(null);
      return;
    }

    if (append) {
      setLoadingMore(true);
    } else {
      setLoadingSearch(true);
      setStatusMessage("Searching real hotels across a larger area...");
    }

    try {
      const params = new URLSearchParams();
      params.set("destination", destination.trim());
      if (country.trim()) params.set("country", country.trim());
      if (city.trim()) params.set("city", city.trim());
      if (locationText.trim()) params.set("location", locationText.trim());
      params.set("checkin", checkIn);
      params.set("checkout", checkOut);
      params.set("guests", String(Math.max(1, guests)));
      params.set("rooms", String(Math.max(1, rooms)));
      params.set("page", String(targetPage));
      params.set("page_size", String(pageSize));

      const res = await fetch(`${API_BASE}/api/search?${params.toString()}`, {
        cache: "no-store",
      });
      const data: SearchResponse = await res.json();

      const items = Array.isArray(data.results) ? data.results : [];

      setHotels((current) => {
        if (!append) return items;

        const merged = [...current];
        for (const hotel of items) {
          const exists = merged.some(
            (item) =>
              item.name === hotel.name &&
              item.location === hotel.location &&
              item.country === hotel.country
          );
          if (!exists) merged.push(hotel);
        }
        return merged;
      });

      setPage(Number(data.page || targetPage));
      setTotalResults(Number(data.total || 0));
      setHasMore(Boolean(data.has_more));

      if (Number(data.total || 0) > 0) {
        setStatusMessage(
          data.message ||
            `Showing page ${targetPage}. Found ${Number(data.total || 0)} real hotel results.`
        );
      } else {
        setStatusMessage(
          data.detail ||
            "No matching hotels were found for this search. Please try another destination."
        );
      }
    } catch {
      if (!append) {
        setHotels([]);
        setSelected(null);
      }
      setStatusMessage("Hotel search is temporarily unavailable. Please try again shortly.");
    } finally {
      setLoadingSearch(false);
      setLoadingMore(false);
    }
  }

  async function searchHotels() {
    setPage(1);
    setHasMore(false);
    setTotalResults(0);
    await fetchHotels(1, false);
  }

  async function loadMoreHotels() {
    if (!hasMore || loadingMore) return;
    await fetchHotels(page + 1, true);
  }

  function handleAffiliateCheckout() {
    if (!selected) {
      setBookingMessage("Please select a hotel before continuing.");
      return;
    }

    if (!guestName.trim()) {
      setBookingMessage("Please enter guest name.");
      return;
    }

    if (!email.trim()) {
      setBookingMessage("Please enter guest email.");
      return;
    }

    if (!checkIn || !checkOut) {
      setBookingMessage("Please select check-in and check-out dates.");
      return;
    }

    const selection = buildAffiliateSelection(selected, checkIn, checkOut, guests, rooms);

    if (!selection.url) {
      setBookingMessage(selection.disclosure);
      return;
    }

    setBookingMessage(selection.disclosure);
    window.open(selection.url, "_blank", "noopener,noreferrer");
  }

  const filteredHotels = useMemo(() => {
    if (preferences.length === 0) return hotels;

    return hotels.filter((hotel) => {
      const amenities = (hotel.amenities || []).map((item) => item.toLowerCase());
      return preferences.every((pref) => amenities.includes(pref.toLowerCase()));
    });
  }, [hotels, preferences]);

  const recommendedHotels = useMemo(() => {
    return [...filteredHotels]
      .sort((a, b) => {
        const scoreA = (a.rating || 0) * 10 + (a.amenities?.length || 0);
        const scoreB = (b.rating || 0) * 10 + (b.amenities?.length || 0);
        return scoreB - scoreA;
      })
      .slice(0, 3);
  }, [filteredHotels]);

  useEffect(() => {
    if (filteredHotels.length > 0) {
      setSelected((current) => {
        if (!current) return filteredHotels[0];
        const stillExists = filteredHotels.find(
          (item) =>
            item.name === current.name &&
            item.location === current.location &&
            item.country === current.country
        );
        return stillExists ?? filteredHotels[0];
      });
    } else {
      setSelected(null);
    }
  }, [filteredHotels]);

  const affiliateSelection = useMemo(() => {
    if (!selected) {
      return {
        provider: "none" as AffiliateProvider,
        label: "Affiliate booking unavailable",
        disclosure: "Affiliate booking is not active yet. Add your approved affiliate details first.",
        url: "",
      };
    }

    return buildAffiliateSelection(selected, checkIn, checkOut, guests, rooms);
  }, [selected, checkIn, checkOut, guests, rooms]);

  const selectedImage = selected?.image || FALLBACK_HOTEL_IMAGE;
  const selectedAmenities = selected?.amenities || [];

  const mapQuery =
    [selected?.name, selected?.location, selected?.country].filter(Boolean).join(", ") ||
    destination ||
    city ||
    country ||
    locationText;

  const realCloudMapSrc = useMemo(() => {
    if (!mapsApiKey || !mapQuery) return "";
    return `https://www.google.com/maps/embed/v1/place?key=${encodeURIComponent(
      mapsApiKey
    )}&q=${encodeURIComponent(mapQuery)}`;
  }, [mapsApiKey, mapQuery]);

  function updateSurvey(field: keyof SurveyState, value: string) {
    setSurvey((current) => ({ ...current, [field]: value }));
  }

  function submitSurvey() {
    setSurveySubmitted(true);
  }

  return (
    <main style={styles.page}>
      <section style={styles.shell}>
        <header style={styles.header}>
          <div>
            <div style={styles.headerEyebrow}>WORLDWIDE HOTEL RESERVATIONS</div>
            <h1 style={styles.headerTitle}>{APP_NAME}</h1>
            <p style={styles.headerSubtitle}>
              Search a much larger real hotel list, filter your stay, and continue with trusted
              booking partners.
            </p>
          </div>

          <div style={styles.headerActions}>
            <a
              href={`mailto:${SUPPORT_EMAIL}?subject=Hotel%20Booking%20Support`}
              style={styles.primaryLink}
            >
              Contact Support
            </a>
          </div>
        </header>

        <section style={styles.grid}>
          <section style={styles.leftColumn}>
            <div style={styles.heroCard}>
              <div style={styles.heroEyebrow}>LIVE REAL HOTEL SEARCH</div>
              <h2 style={styles.heroTitle}>Search larger hotel inventories</h2>
              <p style={styles.heroText}>
                This version searches a broader real map area and supports pagination, so cities like
                London are no longer restricted to one tiny batch of results.
              </p>

              <div style={styles.heroStats}>
                <div style={styles.heroStatCard}>
                  <div style={styles.heroStatLabel}>Loaded Results</div>
                  <div style={styles.heroStatValue}>{filteredHotels.length}</div>
                </div>
                <div style={styles.heroStatCard}>
                  <div style={styles.heroStatLabel}>Total Found</div>
                  <div style={styles.heroStatValue}>{totalResults}</div>
                </div>
                <div style={styles.heroStatCard}>
                  <div style={styles.heroStatLabel}>Selected Hotel</div>
                  <div style={styles.heroStatValueSmall}>{selected?.name || "None"}</div>
                </div>
              </div>
            </div>

            <div style={styles.preferencesCard}>
              <div style={styles.sectionEyebrow}>PREFERRED FACILITIES</div>
              <div style={styles.sectionTitle}>Refine your search before choosing a hotel</div>
              <div style={styles.checkboxGrid}>
                {PREFERENCE_LABELS.map((label) => (
                  <label key={label} style={styles.checkboxItem}>
                    <input
                      type="checkbox"
                      checked={preferences.includes(label)}
                      onChange={() => togglePreference(label)}
                    />
                    <span>{label}</span>
                  </label>
                ))}
              </div>
            </div>

            <div style={styles.overviewCard}>
              <div style={styles.sectionTop}>
                <div>
                  <div style={styles.sectionEyebrow}>PROPERTY OVERVIEW</div>
                  <div style={styles.sectionTitle}>
                    {selected?.name || "Select a hotel to preview"}
                  </div>
                  <div style={styles.sectionSub}>
                    {selected
                      ? `${selected.location}, ${selected.country}`
                      : "Search and select a hotel to view full details"}
                  </div>
                </div>

                <div style={styles.priceBadge}>
                  {selected ? formatMoney(selected.price, selected.currency) : ""}
                </div>
              </div>

              <div style={styles.mediaRow}>
                <div style={styles.imageCard}>
                  <img
                    src={selectedImage}
                    alt={selected?.name || "Hotel preview"}
                    style={styles.hotelImage}
                  />
                </div>

                <div style={styles.mapCard}>
                  <div style={styles.mapBar}>
                    <span style={styles.mapLabel}>Location map</span>
                    {mapQuery ? (
                      <a
                        href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(
                          mapQuery
                        )}`}
                        target="_blank"
                        rel="noreferrer"
                        style={styles.mapLink}
                      >
                        Open in Google Maps
                      </a>
                    ) : null}
                  </div>

                  {mapsConfigured && mapsApiKey && mapQuery ? (
                    <iframe
                      title="hotel-location-map"
                      src={realCloudMapSrc}
                      style={styles.mapFrame}
                      loading="lazy"
                      referrerPolicy="no-referrer-when-downgrade"
                    />
                  ) : (
                    <div style={styles.mapMessage}>
                      Search and select a hotel to display its Google Cloud location map.
                    </div>
                  )}
                </div>
              </div>

              <div style={styles.detailsBlock}>
                <div style={styles.detailsHeading}>Hotel details</div>
                <div style={styles.detailsText}>
                  {selected?.address || "Select a hotel from the results list to view property details."}
                </div>
              </div>

              <div style={styles.amenitiesSection}>
                <div style={styles.detailsHeading}>Popular facilities</div>
                <div style={styles.amenitiesWrap}>
                  {selectedAmenities.length > 0 ? (
                    selectedAmenities.map((item) => (
                      <span key={item} style={styles.amenityChip}>
                        {item}
                      </span>
                    ))
                  ) : (
                    <span style={styles.amenityChip}>Facilities information unavailable</span>
                  )}
                </div>
              </div>
            </div>

            <div style={styles.infoGrid}>
              <div style={styles.infoCard}>
                <div style={styles.infoTitle}>Terms and Conditions</div>
                <div style={styles.infoText}>
                  Prices, taxes, and availability may change on the booking partner's website before
                  completion.
                </div>
              </div>

              <div style={styles.infoCard}>
                <div style={styles.infoTitle}>Cancellation Policy</div>
                <div style={styles.infoText}>
                  Cancellation terms vary by hotel and booking provider. Review the supplier policy
                  before completing your reservation.
                </div>
              </div>

              <div style={styles.infoCard}>
                <div style={styles.infoTitle}>Booking Protection</div>
                <div style={styles.infoText}>
                  Reservations are completed on trusted third-party booking platforms.
                </div>
              </div>

              <div style={styles.infoCard}>
                <div style={styles.infoTitle}>Customer Support</div>
                <div style={styles.infoText}>
                  Need help? Contact {SUPPORT_EMAIL}.
                </div>
              </div>
            </div>
          </section>

          <section style={styles.rightColumn}>
            <div style={styles.searchCard}>
              <div style={styles.darkEyebrow}>SEARCH</div>
              <div style={styles.darkTitle}>Search hotels</div>

              <input
                value={destination}
                onChange={(e) => setDestination(e.target.value)}
                placeholder="Destination"
                style={styles.darkInput}
              />

              <div style={styles.filterGrid}>
                <input
                  value={country}
                  onChange={(e) => setCountry(e.target.value)}
                  placeholder="Country"
                  style={styles.darkInput}
                />
                <input
                  value={city}
                  onChange={(e) => setCity(e.target.value)}
                  placeholder="City"
                  style={styles.darkInput}
                />
                <input
                  value={locationText}
                  onChange={(e) => setLocationText(e.target.value)}
                  placeholder="Location"
                  style={styles.darkInput}
                />
              </div>

              <div style={styles.filterGrid}>
                <div style={styles.dateFieldDark}>
                  <label style={styles.darkLabel}>Check-in</label>
                  <input
                    type="date"
                    value={checkIn}
                    onChange={(e) => setCheckIn(e.target.value)}
                    style={styles.darkInput}
                  />
                </div>
                <div style={styles.dateFieldDark}>
                  <label style={styles.darkLabel}>Check-out</label>
                  <input
                    type="date"
                    value={checkOut}
                    onChange={(e) => setCheckOut(e.target.value)}
                    style={styles.darkInput}
                  />
                </div>
                <div style={styles.dateFieldDark}>
                  <label style={styles.darkLabel}>Guests</label>
                  <input
                    type="number"
                    min={1}
                    value={guests}
                    onChange={(e) => setGuests(Number(e.target.value))}
                    style={styles.darkInput}
                  />
                </div>
              </div>

              <div style={styles.roomsRow}>
                <div style={styles.dateFieldDark}>
                  <label style={styles.darkLabel}>Rooms</label>
                  <input
                    type="number"
                    min={1}
                    value={rooms}
                    onChange={(e) => setRooms(Number(e.target.value))}
                    style={styles.darkInput}
                  />
                </div>
              </div>

              <button onClick={searchHotels} style={styles.searchButton} disabled={loadingSearch}>
                {loadingSearch ? "Searching..." : "Search Hotels"}
              </button>

              <div style={styles.noticeBox}>{statusMessage}</div>
            </div>

            <div style={styles.resultsCard}>
              <div style={styles.sectionEyebrow}>RESULTS</div>
              <div style={styles.sectionTitle}>Available hotels</div>
              <div style={styles.resultsSummary}>
                Showing {filteredHotels.length} loaded results
                {totalResults > 0 ? ` out of ${totalResults} found` : ""}
              </div>

              <div style={styles.resultsScroller}>
                <div style={styles.resultsList}>
                  {filteredHotels.length === 0 ? (
                    <div style={styles.emptyBox}>No hotel options available</div>
                  ) : (
                    filteredHotels.map((hotel, index) => {
                      const isActive =
                        selected?.name === hotel.name &&
                        selected?.location === hotel.location &&
                        selected?.country === hotel.country;

                      return (
                        <button
                          key={`${hotel.name}-${hotel.location}-${index}`}
                          onClick={() => setSelected(hotel)}
                          style={{
                            ...styles.resultRow,
                            border: isActive ? "2px solid #8fd8ff" : "1px solid #e2e8f0",
                            background: isActive ? "#eef8ff" : "#ffffff",
                          }}
                        >
                          <div style={styles.resultMain}>
                            <div style={styles.resultName}>{hotel.name}</div>
                            <div style={styles.resultMeta}>
                              {hotel.location}, {hotel.country}
                            </div>
                          </div>

                          <div style={styles.resultSide}>
                            <div style={styles.resultPrice}>
                              {formatMoney(hotel.price, hotel.currency)}
                            </div>
                            <div style={styles.resultRating}>★ {hotel.rating || "N/A"}</div>
                          </div>
                        </button>
                      );
                    })
                  )}
                </div>
              </div>

              {hasMore ? (
                <button style={styles.loadMoreButton} onClick={loadMoreHotels} disabled={loadingMore}>
                  {loadingMore ? "Loading more..." : "Load More Hotels"}
                </button>
              ) : null}
            </div>

            <div style={styles.recommendCard}>
              <div style={styles.sectionEyebrow}>RECOMMENDED STAYS</div>
              <div style={styles.sectionTitle}>Recommended for you</div>
              <div style={styles.recommendList}>
                {recommendedHotels.length === 0 ? (
                  <div style={styles.emptyBox}>Recommendations will appear after search results load.</div>
                ) : (
                  recommendedHotels.map((hotel) => (
                    <button
                      key={`rec-${hotel.name}-${hotel.location}`}
                      style={styles.recommendItem}
                      onClick={() => setSelected(hotel)}
                    >
                      <div style={styles.recommendName}>{hotel.name}</div>
                      <div style={styles.recommendMeta}>
                        {hotel.location}, {hotel.country} · ★ {hotel.rating || "N/A"}
                      </div>
                    </button>
                  ))
                )}
              </div>
            </div>

            <div style={styles.checkoutCard}>
              <div style={styles.sectionEyebrow}>BOOK WITH PARTNER</div>
              <div style={styles.sectionTitle}>Guest information</div>

              <div style={styles.formStack}>
                <input
                  value={guestName}
                  onChange={(e) => setGuestName(e.target.value)}
                  placeholder="Guest name"
                  style={styles.lightInput}
                />

                <input
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="Guest email"
                  style={styles.lightInput}
                />
              </div>

              <div style={styles.totalCard}>
                <span style={styles.totalLabel}>Selected hotel price</span>
                <strong style={styles.totalValue}>
                  {selected ? formatMoney(selected.price, selected.currency) : ""}
                </strong>
              </div>

              <button onClick={handleAffiliateCheckout} style={styles.checkoutButton}>
                {affiliateSelection.label}
              </button>

              <div style={styles.bookingText}>
                {bookingMessage || affiliateSelection.disclosure}
              </div>
            </div>

            <div style={styles.surveyCard}>
              <div style={styles.sectionEyebrow}>CUSTOMER SATISFACTION</div>
              <div style={styles.sectionTitle}>Help us improve your booking experience</div>

              {surveySubmitted ? (
                <div style={styles.surveyThankYou}>Thank you for sharing your feedback.</div>
              ) : (
                <div style={styles.surveyForm}>
                  <select
                    value={survey.satisfaction}
                    onChange={(e) => updateSurvey("satisfaction", e.target.value)}
                    style={styles.lightInput}
                  >
                    <option value="">Overall satisfaction</option>
                    <option value="excellent">Excellent</option>
                    <option value="good">Good</option>
                    <option value="fair">Fair</option>
                    <option value="poor">Poor</option>
                  </select>

                  <select
                    value={survey.recommend}
                    onChange={(e) => updateSurvey("recommend", e.target.value)}
                    style={styles.lightInput}
                  >
                    <option value="">Would you recommend us?</option>
                    <option value="yes">Yes</option>
                    <option value="maybe">Maybe</option>
                    <option value="no">No</option>
                  </select>

                  <select
                    value={survey.cleanliness}
                    onChange={(e) => updateSurvey("cleanliness", e.target.value)}
                    style={styles.lightInput}
                  >
                    <option value="">Hotel information quality</option>
                    <option value="excellent">Excellent</option>
                    <option value="good">Good</option>
                    <option value="fair">Fair</option>
                    <option value="poor">Poor</option>
                  </select>

                  <select
                    value={survey.easeOfUse}
                    onChange={(e) => updateSurvey("easeOfUse", e.target.value)}
                    style={styles.lightInput}
                  >
                    <option value="">Ease of using this app</option>
                    <option value="very_easy">Very easy</option>
                    <option value="easy">Easy</option>
                    <option value="average">Average</option>
                    <option value="hard">Hard</option>
                  </select>

                  <textarea
                    value={survey.comments}
                    onChange={(e) => updateSurvey("comments", e.target.value)}
                    placeholder="Additional comments"
                    style={styles.textArea}
                  />

                  <button style={styles.surveyButton} onClick={submitSurvey}>
                    Submit Feedback
                  </button>
                </div>
              )}
            </div>
          </section>
        </section>
      </section>
    </main>
  );
}

const styles: Record<string, React.CSSProperties> = {
  page: {
    minHeight: "100vh",
    background: "linear-gradient(180deg, #eef3f8 0%, #e7edf5 100%)",
    padding: "12px",
    boxSizing: "border-box",
    fontFamily: "Arial, sans-serif",
  },
  shell: {
    maxWidth: "1440px",
    margin: "0 auto",
    display: "flex",
    flexDirection: "column",
    gap: "12px",
  },
  header: {
    background: "rgba(255,255,255,0.98)",
    border: "1px solid #dde5ef",
    borderRadius: "24px",
    padding: "16px 22px",
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    gap: "18px",
    boxShadow: "0 10px 24px rgba(15, 23, 42, 0.05)",
  },
  headerEyebrow: {
    fontSize: "10px",
    letterSpacing: "0.18em",
    fontWeight: 700,
    color: "#64748b",
    marginBottom: "4px",
  },
  headerTitle: {
    margin: 0,
    color: "#081120",
    fontSize: "24px",
    fontWeight: 800,
  },
  headerSubtitle: {
    margin: "5px 0 0 0",
    color: "#64748b",
    fontSize: "13px",
    maxWidth: "720px",
  },
  headerActions: {
    display: "flex",
    gap: "10px",
    flexWrap: "wrap",
  },
  primaryLink: {
    textDecoration: "none",
    padding: "10px 16px",
    borderRadius: "14px",
    background: "linear-gradient(135deg, #2563eb 0%, #1d4ed8 100%)",
    color: "#ffffff",
    fontWeight: 700,
    fontSize: "14px",
  },
  grid: {
    display: "grid",
    gridTemplateColumns: "1.08fr 0.92fr",
    gap: "12px",
    alignItems: "start",
  },
  leftColumn: {
    display: "grid",
    gap: "12px",
  },
  rightColumn: {
    display: "grid",
    gap: "12px",
  },
  heroCard: {
    background: "linear-gradient(135deg, #081c4b 0%, #0a245f 48%, #081833 100%)",
    borderRadius: "28px",
    padding: "16px",
    color: "#ffffff",
    display: "flex",
    flexDirection: "column",
    gap: "10px",
    boxShadow: "0 18px 34px rgba(15, 23, 42, 0.12)",
  },
  heroEyebrow: {
    fontSize: "10px",
    letterSpacing: "0.18em",
    fontWeight: 700,
    color: "#9fc0f0",
  },
  heroTitle: {
    fontSize: "36px",
    lineHeight: 1,
    fontWeight: 800,
    margin: 0,
  },
  heroText: {
    color: "#d6e5ff",
    fontSize: "13px",
    lineHeight: 1.45,
    margin: 0,
  },
  heroStats: {
    display: "grid",
    gridTemplateColumns: "repeat(3, 1fr)",
    gap: "8px",
  },
  heroStatCard: {
    background: "rgba(255,255,255,0.08)",
    border: "1px solid rgba(255,255,255,0.10)",
    borderRadius: "16px",
    padding: "10px",
  },
  heroStatLabel: {
    fontSize: "10px",
    color: "#afc9f0",
    marginBottom: "6px",
  },
  heroStatValue: {
    fontSize: "24px",
    fontWeight: 800,
    color: "#ffffff",
  },
  heroStatValueSmall: {
    fontSize: "15px",
    fontWeight: 800,
    color: "#ffffff",
  },
  preferencesCard: {
    background: "#ffffff",
    borderRadius: "28px",
    border: "1px solid #dde4ec",
    padding: "14px",
    display: "flex",
    flexDirection: "column",
    gap: "10px",
    boxShadow: "0 14px 26px rgba(15, 23, 42, 0.05)",
  },
  checkboxGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(4, minmax(0, 1fr))",
    gap: "10px",
  },
  checkboxItem: {
    display: "flex",
    alignItems: "center",
    gap: "8px",
    padding: "10px 12px",
    border: "1px solid #dbe5ef",
    borderRadius: "14px",
    background: "#f8fbff",
    fontSize: "12px",
    fontWeight: 700,
    color: "#0f172a",
  },
  overviewCard: {
    background: "#ffffff",
    borderRadius: "28px",
    border: "1px solid #dde4ec",
    padding: "14px",
    display: "flex",
    flexDirection: "column",
    gap: "10px",
    boxShadow: "0 14px 26px rgba(15, 23, 42, 0.05)",
  },
  sectionTop: {
    display: "flex",
    justifyContent: "space-between",
    gap: "12px",
    alignItems: "flex-start",
  },
  sectionEyebrow: {
    fontSize: "10px",
    letterSpacing: "0.18em",
    fontWeight: 700,
    color: "#64748b",
    marginBottom: "4px",
  },
  sectionTitle: {
    fontSize: "20px",
    fontWeight: 800,
    color: "#081120",
    lineHeight: 1.05,
  },
  sectionSub: {
    marginTop: "4px",
    color: "#64748b",
    fontSize: "12px",
  },
  priceBadge: {
    background: "#eff6ff",
    color: "#1d4ed8",
    borderRadius: "999px",
    padding: "8px 11px",
    fontWeight: 800,
    fontSize: "13px",
    whiteSpace: "nowrap",
  },
  mediaRow: {
    display: "grid",
    gridTemplateColumns: "1fr 1fr",
    gap: "10px",
  },
  imageCard: {
    height: "280px",
    borderRadius: "18px",
    overflow: "hidden",
    background: "#edf2f7",
  },
  hotelImage: {
    width: "100%",
    height: "100%",
    objectFit: "cover",
    display: "block",
  },
  mapCard: {
    height: "280px",
    borderRadius: "18px",
    overflow: "hidden",
    background: "#edf2f7",
    display: "flex",
    flexDirection: "column",
  },
  mapBar: {
    padding: "8px 10px",
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    background: "#f8fbff",
    borderBottom: "1px solid #e3ebf4",
  },
  mapLabel: {
    fontSize: "11px",
    fontWeight: 700,
    color: "#475569",
  },
  mapLink: {
    fontSize: "11px",
    fontWeight: 700,
    color: "#2563eb",
    textDecoration: "none",
  },
  mapFrame: {
    width: "100%",
    height: "100%",
    border: "none",
    display: "block",
    flex: 1,
  },
  mapMessage: {
    flex: 1,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    textAlign: "center",
    padding: "18px",
    fontSize: "13px",
    lineHeight: 1.55,
    color: "#475569",
    background: "#f8fbff",
  },
  detailsBlock: {
    display: "flex",
    flexDirection: "column",
    gap: "4px",
  },
  detailsHeading: {
    fontSize: "13px",
    fontWeight: 800,
    color: "#081120",
  },
  detailsText: {
    fontSize: "12px",
    color: "#475569",
    lineHeight: 1.4,
  },
  amenitiesSection: {
    display: "flex",
    flexDirection: "column",
    gap: "8px",
  },
  amenitiesWrap: {
    display: "flex",
    flexWrap: "wrap",
    gap: "8px",
  },
  amenityChip: {
    padding: "8px 10px",
    borderRadius: "999px",
    background: "#eff6ff",
    color: "#1d4ed8",
    fontSize: "12px",
    fontWeight: 700,
  },
  infoGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(2, 1fr)",
    gap: "12px",
  },
  infoCard: {
    background: "#ffffff",
    borderRadius: "22px",
    border: "1px solid #dde4ec",
    padding: "16px",
    boxShadow: "0 14px 26px rgba(15, 23, 42, 0.05)",
  },
  infoTitle: {
    fontSize: "16px",
    fontWeight: 800,
    color: "#081120",
    marginBottom: "8px",
  },
  infoText: {
    fontSize: "13px",
    color: "#475569",
    lineHeight: 1.5,
  },
  searchCard: {
    background: "#0b1f52",
    borderRadius: "28px",
    padding: "14px",
    display: "flex",
    flexDirection: "column",
    gap: "8px",
    boxShadow: "0 18px 34px rgba(15, 23, 42, 0.12)",
  },
  darkEyebrow: {
    fontSize: "10px",
    letterSpacing: "0.18em",
    fontWeight: 700,
    color: "#9fc0f0",
    marginBottom: "4px",
  },
  darkTitle: {
    fontSize: "20px",
    fontWeight: 800,
    color: "#ffffff",
    lineHeight: 1.05,
  },
  darkInput: {
    width: "100%",
    padding: "11px 12px",
    borderRadius: "13px",
    border: "1px solid rgba(255,255,255,0.14)",
    background: "rgba(255,255,255,0.08)",
    color: "#ffffff",
    outline: "none",
    boxSizing: "border-box",
    fontSize: "13px",
  },
  filterGrid: {
    display: "grid",
    gridTemplateColumns: "1fr 1fr 1fr",
    gap: "8px",
  },
  roomsRow: {
    display: "grid",
    gridTemplateColumns: "1fr",
    gap: "8px",
  },
  dateFieldDark: {
    display: "flex",
    flexDirection: "column",
    gap: "4px",
  },
  darkLabel: {
    fontSize: "10px",
    fontWeight: 700,
    color: "#cfe1ff",
  },
  searchButton: {
    width: "100%",
    padding: "11px 12px",
    borderRadius: "13px",
    border: "none",
    background: "linear-gradient(90deg, #2563eb 0%, #06b6d4 100%)",
    color: "#ffffff",
    fontWeight: 800,
    cursor: "pointer",
    fontSize: "14px",
  },
  noticeBox: {
    borderRadius: "13px",
    padding: "10px",
    background: "rgba(255,255,255,0.08)",
    border: "1px solid rgba(255,255,255,0.08)",
    color: "#dbeafe",
    lineHeight: 1.35,
    fontSize: "12px",
  },
  resultsCard: {
    background: "#ffffff",
    borderRadius: "28px",
    border: "1px solid #dde4ec",
    padding: "14px",
    display: "flex",
    flexDirection: "column",
    gap: "10px",
    boxShadow: "0 14px 26px rgba(15, 23, 42, 0.05)",
    minHeight: "440px",
  },
  resultsSummary: {
    fontSize: "12px",
    color: "#475569",
    fontWeight: 700,
  },
  resultsScroller: {
    maxHeight: "460px",
    overflowY: "auto",
    paddingRight: "4px",
  },
  resultsList: {
    display: "grid",
    gap: "8px",
  },
  emptyBox: {
    width: "100%",
    minHeight: "120px",
    borderRadius: "16px",
    background: "#f8fbff",
    border: "1px solid #e3ebf4",
    color: "#64748b",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    textAlign: "center",
    fontSize: "13px",
  },
  resultRow: {
    width: "100%",
    borderRadius: "15px",
    padding: "10px 12px",
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    textAlign: "left",
    cursor: "pointer",
    boxSizing: "border-box",
  },
  resultMain: {
    minWidth: 0,
    flex: 1,
    paddingRight: "10px",
  },
  resultName: {
    fontSize: "13px",
    fontWeight: 800,
    color: "#081120",
    lineHeight: 1.2,
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },
  resultMeta: {
    fontSize: "11px",
    color: "#64748b",
    marginTop: "4px",
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },
  resultSide: {
    textAlign: "right",
    flex: "0 0 auto",
  },
  resultPrice: {
    fontSize: "14px",
    fontWeight: 800,
    color: "#081120",
  },
  resultRating: {
    fontSize: "11px",
    color: "#2563eb",
    marginTop: "4px",
    fontWeight: 700,
  },
  loadMoreButton: {
    width: "100%",
    padding: "11px 12px",
    borderRadius: "13px",
    border: "1px solid #dbe5ef",
    background: "#f8fbff",
    color: "#0f172a",
    fontWeight: 800,
    cursor: "pointer",
    fontSize: "14px",
  },
  recommendCard: {
    background: "#ffffff",
    borderRadius: "28px",
    border: "1px solid #dde4ec",
    padding: "14px",
    display: "flex",
    flexDirection: "column",
    gap: "10px",
    boxShadow: "0 14px 26px rgba(15, 23, 42, 0.05)",
  },
  recommendList: {
    display: "grid",
    gap: "8px",
  },
  recommendItem: {
    border: "1px solid #dbe5ef",
    background: "#f8fbff",
    borderRadius: "15px",
    padding: "10px 12px",
    textAlign: "left",
    cursor: "pointer",
  },
  recommendName: {
    fontSize: "13px",
    fontWeight: 800,
    color: "#081120",
  },
  recommendMeta: {
    marginTop: "4px",
    fontSize: "11px",
    color: "#64748b",
  },
  checkoutCard: {
    background: "#ffffff",
    borderRadius: "28px",
    border: "1px solid #dde4ec",
    padding: "14px",
    display: "flex",
    flexDirection: "column",
    gap: "8px",
    boxShadow: "0 14px 26px rgba(15, 23, 42, 0.05)",
  },
  formStack: {
    display: "flex",
    flexDirection: "column",
    gap: "8px",
  },
  lightInput: {
    width: "100%",
    padding: "11px 12px",
    borderRadius: "13px",
    border: "1px solid #d7e0ea",
    background: "#fbfdff",
    color: "#0f172a",
    outline: "none",
    boxSizing: "border-box",
    fontSize: "13px",
  },
  textArea: {
    width: "100%",
    minHeight: "88px",
    padding: "11px 12px",
    borderRadius: "13px",
    border: "1px solid #d7e0ea",
    background: "#fbfdff",
    color: "#0f172a",
    outline: "none",
    boxSizing: "border-box",
    fontSize: "13px",
    resize: "vertical",
    fontFamily: "Arial, sans-serif",
  },
  totalCard: {
    padding: "12px 14px",
    borderRadius: "15px",
    background: "#f8fbff",
    border: "1px solid #e3ebf4",
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
  },
  totalLabel: {
    color: "#475569",
    fontSize: "13px",
    fontWeight: 700,
  },
  totalValue: {
    fontSize: "20px",
    color: "#081120",
  },
  checkoutButton: {
    width: "100%",
    padding: "11px 12px",
    borderRadius: "13px",
    border: "none",
    background: "linear-gradient(90deg, #2563eb 0%, #06b6d4 100%)",
    color: "#ffffff",
    fontWeight: 800,
    cursor: "pointer",
    fontSize: "14px",
  },
  bookingText: {
    color: "#475569",
    fontSize: "11px",
    lineHeight: 1.35,
  },
  surveyCard: {
    background: "#ffffff",
    borderRadius: "28px",
    border: "1px solid #dde4ec",
    padding: "14px",
    display: "flex",
    flexDirection: "column",
    gap: "10px",
    boxShadow: "0 14px 26px rgba(15, 23, 42, 0.05)",
  },
  surveyForm: {
    display: "grid",
    gap: "8px",
  },
  surveyButton: {
    width: "100%",
    padding: "11px 12px",
    borderRadius: "13px",
    border: "none",
    background: "#0f172a",
    color: "#ffffff",
    fontWeight: 800,
    cursor: "pointer",
    fontSize: "14px",
  },
  surveyThankYou: {
    borderRadius: "13px",
    padding: "14px",
    background: "#eff6ff",
    color: "#1d4ed8",
    fontWeight: 700,
    fontSize: "13px",
  },
};