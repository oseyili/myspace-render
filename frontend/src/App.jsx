import React, { useState } from "react";

const API_BASE = import.meta.env.VITE_API_BASE || "";

const PAGES = {
  home: "home",
  guides: "guides",
  faqs: "faqs",
  terms: "terms",
  support: "support",
};

export default function App() {
  const [page, setPage] = useState(PAGES.home);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");

  const [form, setForm] = useState({
    name: "",
    email: "",
    notes: "",
  });

  const hotels = [
    {
      name: "Mayfair Executive Stay",
      location: "London",
      price: "£310",
    },
    {
      name: "Soho Corner Hotel",
      location: "London",
      price: "£205",
    },
  ];

  const handleReserve = async (hotel) => {
    setLoading(true);
    setMessage("");

    try {
      const res = await fetch(`${API_BASE}/reserve`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          ...form,
          hotel: hotel.name,
        }),
      });

      const data = await res.json();

      if (data.success) {
        setMessage("Reservation request sent successfully.");
      } else {
        setMessage("Reservation failed.");
      }
    } catch (err) {
      setMessage("Server not reachable.");
    }

    setLoading(false);
  };

  // ================= PAGES =================

  if (page === PAGES.guides) {
    return (
      <div style={styles.page}>
        <h1>Travel Guides</h1>
        <p>
          Discover cities worldwide with confidence. Our platform connects you
          to a growing global database of hotels so you can explore options
          without limits.
        </p>
        <button onClick={() => setPage(PAGES.home)}>Back</button>
      </div>
    );
  }

  if (page === PAGES.faqs) {
    return (
      <div style={styles.page}>
        <h1>FAQs</h1>
        <p>
          Search, compare, and reserve directly inside the platform. No redirects.
          No confusion. Everything stays in one place.
        </p>
        <button onClick={() => setPage(PAGES.home)}>Back</button>
      </div>
    );
  }

  if (page === PAGES.terms) {
    return (
      <div style={styles.page}>
        <h1>Booking Terms</h1>
        <p>
          Reservations are handled directly inside My Space Hotel. Details are
          confirmed after request submission.
        </p>
        <button onClick={() => setPage(PAGES.home)}>Back</button>
      </div>
    );
  }

  if (page === PAGES.support) {
    return (
      <div style={styles.page}>
        <h1>Customer Support</h1>
        <p>
          Need help? Contact support anytime. We ensure every booking request is
          handled securely and efficiently.
        </p>
        <button onClick={() => setPage(PAGES.home)}>Back</button>
      </div>
    );
  }

  // ================= HOME =================

  return (
    <div style={styles.container}>
      <h1>My Space Hotel</h1>

      <p>
        Find better hotels worldwide. Book with confidence. Reserve without
        pressure.
      </p>

      <div style={styles.nav}>
        <button onClick={() => setPage(PAGES.guides)}>Travel Guides</button>
        <button onClick={() => setPage(PAGES.faqs)}>FAQs</button>
        <button onClick={() => setPage(PAGES.terms)}>Booking Terms</button>
        <button onClick={() => setPage(PAGES.support)}>
          Customer Support
        </button>
      </div>

      <div style={styles.grid}>
        {hotels.map((hotel, i) => (
          <div key={i} style={styles.card}>
            <h3>{hotel.name}</h3>
            <p>{hotel.location}</p>
            <p>{hotel.price}</p>

            <button onClick={() => handleReserve(hotel)}>
              Reserve in app
            </button>
          </div>
        ))}
      </div>

      <div style={styles.form}>
        <h2>Complete your reservation request</h2>

        <input
          placeholder="Your name"
          value={form.name}
          onChange={(e) =>
            setForm({ ...form, name: e.target.value })
          }
        />

        <input
          placeholder="Your email"
          value={form.email}
          onChange={(e) =>
            setForm({ ...form, email: e.target.value })
          }
        />

        <textarea
          placeholder="Special requests"
          value={form.notes}
          onChange={(e) =>
            setForm({ ...form, notes: e.target.value })
          }
        />

        <button disabled={loading}>
          {loading ? "Sending request..." : "Submit request"}
        </button>

        <p>{message}</p>
      </div>
    </div>
  );
}

// ================= STYLES =================

const styles = {
  container: {
    padding: "20px",
    fontFamily: "Arial",
  },
  nav: {
    marginBottom: "20px",
  },
  grid: {
    display: "flex",
    gap: "20px",
  },
  card: {
    border: "1px solid #ccc",
    padding: "10px",
    width: "200px",
  },
  form: {
    marginTop: "30px",
    display: "flex",
    flexDirection: "column",
    gap: "10px",
    maxWidth: "400px",
  },
  page: {
    padding: "20px",
  },
};