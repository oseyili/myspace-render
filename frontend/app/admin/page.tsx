"use client";

import { useEffect, useState } from "react";

type Property = {
  id: string;
  title: string;
  location: string;
  country: string;
  price_per_night: number;
  host_name: string;
  rating: number;
  beds: number;
  baths: number;
  guests: number;
  image_url: string;
  description: string;
  amenities: string[];
  map_query: string;
  source?: string;
  created_at?: string;
  is_test_hotel?: boolean;
};

type Booking = {
  booking_id: string;
  property_id: string;
  property_title: string;
  guest_name: string;
  email: string;
  check_in: string;
  check_out: string;
  guests: number;
  status: string;
  total_preview: number;
  nights: number;
  created_at?: string;
};

type AdminSummary = {
  app_name: string;
  total_properties: number;
  total_bookings: number;
  revenue_preview: number;
  hosts: string[];
  recent_bookings: Booking[];
  properties: Property[];
  test_hotel_id?: string;
  test_hotel_price?: number;
};

const API_BASE = "http://127.0.0.1:5050";

function gbp(value: number) {
  return `£${Number(value).toFixed(2)}`;
}

export default function AdminPage() {
  const [data, setData] = useState<AdminSummary | null>(null);
  const [status, setStatus] = useState("Loading dashboard...");
  const [submitMessage, setSubmitMessage] = useState("");

  const [title, setTitle] = useState("");
  const [location, setLocation] = useState("");
  const [country, setCountry] = useState("");
  const [pricePerNight, setPricePerNight] = useState(120);
  const [rating, setRating] = useState(4.5);
  const [beds, setBeds] = useState(2);
  const [baths, setBaths] = useState(1);
  const [guests, setGuests] = useState(2);
  const [hostName, setHostName] = useState("");
  const [imageUrl, setImageUrl] = useState(
    "https://images.unsplash.com/photo-1566073771259-6a8506099945?auto=format&fit=crop&w=1200&q=80"
  );
  const [description, setDescription] = useState("");
  const [amenities, setAmenities] = useState("WiFi, Kitchen, Parking");
  const [mapQuery, setMapQuery] = useState("");

  async function loadAdmin() {
    setStatus("Loading dashboard...");
    try {
      const res = await fetch(`${API_BASE}/api/admin/summary`, { cache: "no-store" });
      const json = await res.json();
      setData(json);
      setStatus("Dashboard loaded.");
    } catch {
      setStatus("Could not load dashboard. Check backend server.");
    }
  }

  useEffect(() => {
    loadAdmin();
  }, []);

  async function handleCreateProperty() {
    if (
      !title.trim() ||
      !location.trim() ||
      !country.trim() ||
      !hostName.trim() ||
      !imageUrl.trim() ||
      !description.trim()
    ) {
      setSubmitMessage("Please complete all required hotel fields.");
      return;
    }

    setSubmitMessage("Saving hotel...");

    try {
      const res = await fetch(`${API_BASE}/api/host/add`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          title: title.trim(),
          location: location.trim(),
          country: country.trim(),
          price_per_night: Number(pricePerNight),
          rating,
          beds,
          baths,
          guests,
          host_name: hostName.trim(),
          image_url: imageUrl.trim(),
          description: description.trim(),
          amenities: amenities.trim(),
          map_query: mapQuery.trim() || `${location.trim()} ${country.trim()}`,
        }),
      });

      const json = await res.json();

      if (json.success) {
        setSubmitMessage("Hotel created successfully and saved to the database.");
        setTitle("");
        setLocation("");
        setCountry("");
        setPricePerNight(120);
        setRating(4.5);
        setBeds(2);
        setBaths(1);
        setGuests(2);
        setHostName("");
        setImageUrl(
          "https://images.unsplash.com/photo-1566073771259-6a8506099945?auto=format&fit=crop&w=1200&q=80"
        );
        setDescription("");
        setAmenities("WiFi, Kitchen, Parking");
        setMapQuery("");
        await loadAdmin();
      } else {
        setSubmitMessage(json.message || "Could not create hotel.");
      }
    } catch {
      setSubmitMessage("Could not create hotel because the backend could not be reached.");
    }
  }

  return (
    <main style={styles.page}>
      <div style={styles.shell}>
        <header style={styles.topBar}>
          <div>
            <h1 style={styles.appTitle}>Hotel Booking App</h1>
            <p style={styles.appSubtitle}>
              Create persistent hotels, review bookings, and manage hotel booking activity.
            </p>
          </div>

          <div style={styles.navGroup}>
            <a href="/" style={styles.primaryNavButton}>
              Booking Page
            </a>
            <a href="/admin" style={styles.secondaryNavButton}>
              Admin Dashboard
            </a>
          </div>
        </header>

        <div style={styles.headerRow}>
          <div>
            <div style={styles.badge}>HOST / ADMIN DASHBOARD</div>
            <h2 style={styles.title}>My Space Hotel Booking Admin</h2>
            <p style={styles.subtitle}>
              Add hotels to the database, review booking activity, and monitor hotel revenue preview.
            </p>
          </div>

          <button onClick={loadAdmin} style={styles.refreshButton}>
            Refresh Dashboard
          </button>
        </div>

        {data?.test_hotel_id ? (
          <div style={styles.testBanner}>
            Temporary payment test hotel is active at {gbp(data.test_hotel_price ?? 0.5)}. Use it only for the final cheap payment test, then continue with valid real bookings only.
          </div>
        ) : null}

        <div style={styles.statusBox}>{status}</div>

        <section style={styles.metricsGrid}>
          <div style={styles.metricCard}>
            <div style={styles.metricLabel}>Total Hotels</div>
            <div style={styles.metricValue}>{data?.total_properties ?? 0}</div>
          </div>
          <div style={styles.metricCard}>
            <div style={styles.metricLabel}>Total Bookings</div>
            <div style={styles.metricValue}>{data?.total_bookings ?? 0}</div>
          </div>
          <div style={styles.metricCard}>
            <div style={styles.metricLabel}>Revenue Preview</div>
            <div style={styles.metricValue}>{gbp(data?.revenue_preview ?? 0)}</div>
          </div>
          <div style={styles.metricCard}>
            <div style={styles.metricLabel}>Hosts</div>
            <div style={styles.metricValue}>{data?.hosts?.length ?? 0}</div>
          </div>
        </section>

        <section style={styles.createPanel}>
          <h3 style={styles.panelTitle}>Add New Hotel</h3>

          <div style={styles.formGrid}>
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Hotel title"
              style={styles.input}
            />

            <input
              value={location}
              onChange={(e) => setLocation(e.target.value)}
              placeholder="Location / city"
              style={styles.input}
            />

            <input
              value={country}
              onChange={(e) => setCountry(e.target.value)}
              placeholder="Country"
              style={styles.input}
            />

            <input
              type="number"
              step="0.01"
              value={pricePerNight}
              onChange={(e) => setPricePerNight(Number(e.target.value))}
              placeholder="Price per night"
              style={styles.input}
            />

            <input
              type="number"
              step="0.1"
              min="0"
              max="5"
              value={rating}
              onChange={(e) => setRating(Number(e.target.value))}
              placeholder="Rating"
              style={styles.input}
            />

            <input
              type="number"
              min="1"
              value={beds}
              onChange={(e) => setBeds(Number(e.target.value))}
              placeholder="Beds"
              style={styles.input}
            />

            <input
              type="number"
              min="1"
              value={baths}
              onChange={(e) => setBaths(Number(e.target.value))}
              placeholder="Baths"
              style={styles.input}
            />

            <input
              type="number"
              min="1"
              value={guests}
              onChange={(e) => setGuests(Number(e.target.value))}
              placeholder="Guests"
              style={styles.input}
            />

            <input
              value={hostName}
              onChange={(e) => setHostName(e.target.value)}
              placeholder="Host name"
              style={styles.input}
            />

            <input
              value={imageUrl}
              onChange={(e) => setImageUrl(e.target.value)}
              placeholder="Image URL"
              style={styles.input}
            />

            <input
              value={amenities}
              onChange={(e) => setAmenities(e.target.value)}
              placeholder="Amenities comma-separated"
              style={styles.input}
            />

            <input
              value={mapQuery}
              onChange={(e) => setMapQuery(e.target.value)}
              placeholder="Map query"
              style={styles.input}
            />
          </div>

          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Hotel description"
            style={styles.textarea}
          />

          <button onClick={handleCreateProperty} style={styles.createButton}>
            Save Hotel To Database
          </button>

          <div style={styles.submitMessage}>
            {submitMessage || "No hotel submitted yet."}
          </div>
        </section>

        <section style={styles.columns}>
          <div style={styles.panel}>
            <h3 style={styles.panelTitle}>Host names</h3>
            <div style={styles.hostWrap}>
              {(data?.hosts ?? []).map((host) => (
                <span key={host} style={styles.hostTag}>
                  {host}
                </span>
              ))}
            </div>
          </div>

          <div style={styles.panel}>
            <h3 style={styles.panelTitle}>Recent bookings</h3>
            <div style={styles.tableWrap}>
              <table style={styles.table}>
                <thead>
                  <tr>
                    <th style={styles.th}>Booking ID</th>
                    <th style={styles.th}>Guest</th>
                    <th style={styles.th}>Hotel</th>
                    <th style={styles.th}>Dates</th>
                    <th style={styles.th}>Nights</th>
                    <th style={styles.th}>Guests</th>
                    <th style={styles.th}>Total</th>
                    <th style={styles.th}>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {(data?.recent_bookings ?? []).length === 0 ? (
                    <tr>
                      <td style={styles.td} colSpan={8}>
                        No bookings yet.
                      </td>
                    </tr>
                  ) : (
                    (data?.recent_bookings ?? []).map((booking) => (
                      <tr key={booking.booking_id}>
                        <td style={styles.td}>{booking.booking_id}</td>
                        <td style={styles.td}>{booking.guest_name}</td>
                        <td style={styles.td}>{booking.property_title}</td>
                        <td style={styles.td}>
                          {booking.check_in} → {booking.check_out}
                        </td>
                        <td style={styles.td}>{booking.nights}</td>
                        <td style={styles.td}>{booking.guests}</td>
                        <td style={styles.td}>{gbp(booking.total_preview)}</td>
                        <td style={styles.td}>{booking.status}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </section>

        <section style={styles.panel}>
          <h3 style={styles.panelTitle}>Hotel inventory</h3>
          <div style={styles.tableWrap}>
            <table style={styles.table}>
              <thead>
                <tr>
                  <th style={styles.th}>Title</th>
                  <th style={styles.th}>Location</th>
                  <th style={styles.th}>Country</th>
                  <th style={styles.th}>Host</th>
                  <th style={styles.th}>Price/Night</th>
                  <th style={styles.th}>Guests Max</th>
                  <th style={styles.th}>Rating</th>
                  <th style={styles.th}>Source</th>
                </tr>
              </thead>
              <tbody>
                {(data?.properties ?? []).map((property) => (
                  <tr key={property.id}>
                    <td style={styles.td}>
                      {property.title}
                      {property.is_test_hotel ? <span style={styles.inlineTestTag}> TEST</span> : null}
                    </td>
                    <td style={styles.td}>{property.location}</td>
                    <td style={styles.td}>{property.country}</td>
                    <td style={styles.td}>{property.host_name}</td>
                    <td style={styles.td}>{gbp(property.price_per_night)}</td>
                    <td style={styles.td}>{property.guests}</td>
                    <td style={styles.td}>{property.rating}</td>
                    <td style={styles.td}>{property.source ?? "unknown"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </main>
  );
}

const styles: Record<string, React.CSSProperties> = {
  page: {
    minHeight: "100vh",
    background: "#dfe4ea",
    padding: "20px",
    fontFamily: "Arial, sans-serif",
  },
  shell: {
    maxWidth: "1250px",
    margin: "0 auto",
  },
  topBar: {
    background: "#f5f6fa",
    border: "1px solid #d6dce5",
    borderRadius: "20px",
    padding: "18px 20px",
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    gap: "20px",
    marginBottom: "16px",
  },
  appTitle: {
    margin: 0,
    color: "#081120",
    fontSize: "22px",
    fontWeight: 800,
  },
  appSubtitle: {
    margin: "6px 0 0 0",
    color: "#5b667a",
    fontSize: "14px",
  },
  navGroup: {
    display: "flex",
    gap: "10px",
    flexWrap: "wrap",
  },
  primaryNavButton: {
    textDecoration: "none",
    padding: "12px 16px",
    borderRadius: "12px",
    background: "#2563eb",
    color: "#ffffff",
    fontWeight: 700,
  },
  secondaryNavButton: {
    textDecoration: "none",
    padding: "12px 16px",
    borderRadius: "12px",
    background: "#0f172a",
    color: "#ffffff",
    fontWeight: 700,
  },
  headerRow: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "flex-start",
    gap: "20px",
    marginBottom: "18px",
  },
  badge: {
    display: "inline-block",
    padding: "8px 12px",
    borderRadius: "999px",
    background: "#17315d",
    color: "#9fd3ff",
    fontSize: "12px",
    fontWeight: 700,
    letterSpacing: "0.08em",
    marginBottom: "12px",
  },
  title: {
    margin: 0,
    fontSize: "36px",
    fontWeight: 800,
    color: "#081120",
  },
  subtitle: {
    marginTop: "10px",
    color: "#5b667a",
    lineHeight: 1.6,
  },
  refreshButton: {
    padding: "12px 16px",
    borderRadius: "12px",
    border: "none",
    background: "linear-gradient(90deg, #2563eb 0%, #06b6d4 100%)",
    color: "white",
    fontWeight: 700,
    cursor: "pointer",
  },
  testBanner: {
    marginBottom: "14px",
    borderRadius: "12px",
    padding: "12px",
    background: "#2e1065",
    border: "1px solid #6d28d9",
    color: "#f5d0fe",
    lineHeight: 1.5,
  },
  statusBox: {
    marginBottom: "18px",
    borderRadius: "12px",
    padding: "12px",
    background: "#0b1a37",
    border: "1px solid #2a3a5c",
    color: "#c8daff",
  },
  metricsGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(4, 1fr)",
    gap: "16px",
    marginBottom: "20px",
  },
  metricCard: {
    background: "linear-gradient(180deg, #0d1e48 0%, #0a1838 100%)",
    border: "1px solid #1f396a",
    borderRadius: "16px",
    padding: "18px",
    color: "#e9f1ff",
  },
  metricLabel: {
    color: "#9fb6da",
    fontSize: "13px",
    marginBottom: "8px",
  },
  metricValue: {
    fontSize: "28px",
    fontWeight: 800,
  },
  createPanel: {
    background: "linear-gradient(180deg, #0d1e48 0%, #0a1838 100%)",
    border: "1px solid #1f396a",
    borderRadius: "18px",
    padding: "18px",
    marginBottom: "20px",
    color: "#e9f1ff",
  },
  panel: {
    background: "linear-gradient(180deg, #0d1e48 0%, #0a1838 100%)",
    border: "1px solid #1f396a",
    borderRadius: "18px",
    padding: "18px",
    marginBottom: "20px",
    color: "#e9f1ff",
  },
  panelTitle: {
    marginTop: 0,
    marginBottom: "14px",
    fontSize: "22px",
  },
  formGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(3, 1fr)",
    gap: "12px",
    marginBottom: "12px",
  },
  input: {
    width: "100%",
    padding: "12px 14px",
    borderRadius: "12px",
    border: "1px solid #2f436c",
    background: "#0c1630",
    color: "#e5eefc",
    outline: "none",
    boxSizing: "border-box",
  },
  textarea: {
    width: "100%",
    minHeight: "110px",
    padding: "12px 14px",
    borderRadius: "12px",
    border: "1px solid #2f436c",
    background: "#0c1630",
    color: "#e5eefc",
    outline: "none",
    boxSizing: "border-box",
    resize: "vertical",
    marginBottom: "12px",
    fontFamily: "Arial, sans-serif",
  },
  createButton: {
    width: "100%",
    padding: "12px 14px",
    borderRadius: "12px",
    border: "none",
    background: "linear-gradient(90deg, #2563eb 0%, #06b6d4 100%)",
    color: "white",
    fontWeight: 700,
    cursor: "pointer",
    marginBottom: "10px",
  },
  submitMessage: {
    minHeight: "24px",
    color: "#b9e8ff",
  },
  columns: {
    display: "grid",
    gridTemplateColumns: "0.8fr 1.2fr",
    gap: "20px",
    marginBottom: "20px",
  },
  hostWrap: {
    display: "flex",
    flexWrap: "wrap",
    gap: "10px",
  },
  hostTag: {
    background: "#10254d",
    color: "#b9ddff",
    border: "1px solid #2b4677",
    borderRadius: "999px",
    padding: "8px 12px",
    fontSize: "13px",
  },
  tableWrap: {
    overflowX: "auto",
  },
  table: {
    width: "100%",
    borderCollapse: "collapse",
  },
  th: {
    textAlign: "left",
    padding: "12px",
    background: "#10254d",
    color: "#cde6ff",
    fontSize: "13px",
    borderBottom: "1px solid #2c4573",
  },
  td: {
    padding: "12px",
    borderBottom: "1px solid #24314f",
    color: "#d8e6fb",
    fontSize: "14px",
  },
  inlineTestTag: {
    color: "#f5d0fe",
    fontWeight: 700,
  },
};