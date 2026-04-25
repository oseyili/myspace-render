"use client";

import { useState } from "react";

const API = "https://hotel-backend-1-ee5z.onrender.com"; // 🔥 replace with your backend URL

export default function Page() {
  const [email, setEmail] = useState("");
  const [hotelId, setHotelId] = useState("hotel-demo-1");

  const [code, setCode] = useState("");
  const [codeSent, setCodeSent] = useState(false);
  const [verified, setVerified] = useState(false);
  const [loading, setLoading] = useState(false);

  // =========================
  // SEND CODE
  // =========================
  const sendCode = async () => {
    setLoading(true);

    const res = await fetch(`${API}/api/payment-code/send`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email,
        hotel_id: hotelId,
      }),
    });

    const data = await res.json();
    setLoading(false);

    if (data.status === "sent") {
      setCodeSent(true);
      alert("Payment code sent to your email");
    } else {
      alert("Error sending code");
    }
  };

  // =========================
  // VERIFY CODE
  // =========================
  const verifyCode = async () => {
    setLoading(true);

    const res = await fetch(`${API}/api/payment-code/verify`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email,
        hotel_id: hotelId,
        code,
      }),
    });

    const data = await res.json();
    setLoading(false);

    if (data.verified) {
      setVerified(true);
      alert("Email verified. You can now pay.");
    } else {
      alert("Invalid or expired code");
    }
  };

  // =========================
  // PAY
  // =========================
  const payNow = async () => {
    setLoading(true);

    const res = await fetch(`${API}/api/payment/checkout`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email,
        hotel_id: hotelId,
        amount: 15000, // 🔥 example: $150.00
      }),
    });

    const data = await res.json();
    setLoading(false);

    if (data.url) {
      window.location.href = data.url; // redirect to Stripe
    } else {
      alert("Payment failed");
    }
  };

  return (
    <div style={{ padding: 40, fontFamily: "Arial" }}>
      <h1>Secure Hotel Payment</h1>

      {/* EMAIL */}
      <div style={{ marginBottom: 20 }}>
        <input
          type="email"
          placeholder="Enter your email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          style={{ padding: 10, width: 300 }}
        />
      </div>

      {/* SEND CODE */}
      {!codeSent && (
        <button onClick={sendCode} disabled={loading}>
          {loading ? "Sending..." : "Send Payment Code"}
        </button>
      )}

      {/* ENTER CODE */}
      {codeSent && !verified && (
        <div style={{ marginTop: 20 }}>
          <input
            placeholder="Enter code"
            value={code}
            onChange={(e) => setCode(e.target.value)}
            style={{ padding: 10 }}
          />
          <br />
          <button onClick={verifyCode} disabled={loading}>
            {loading ? "Verifying..." : "Verify Code"}
          </button>
        </div>
      )}

      {/* PAY */}
      {verified && (
        <div style={{ marginTop: 30 }}>
          <button
            onClick={payNow}
            style={{
              background: "gold",
              padding: 15,
              fontSize: 18,
              border: "none",
              cursor: "pointer",
            }}
          >
            Pay Now
          </button>
        </div>
      )}
    </div>
  );
}