import React from "react";

export default function Support({ goBack }) {
  return (
    <div style={{ padding: 20, color: "white", background: "#07152f", minHeight: "100vh" }}>
      <button onClick={goBack}>← Back</button>

      <h1>Customer Support</h1>

      <p>
        We are here to support your booking journey.
      </p>

      <h3>Reservation enquiries</h3>
      <p>
        If you have submitted a request, check your email for confirmation or
        follow-up.
      </p>

      <h3>General support</h3>
      <p>
        For assistance, contact:
        <br />
        <b>reservations@myspace-hotel.com</b>
      </p>

      <h3>Response time</h3>
      <p>
        We aim to respond as quickly as possible, depending on request volume.
      </p>

      <h3>Before contacting</h3>
      <p>
        Ensure you include your name, hotel selection, and travel details for
        faster support.
      </p>
    </div>
  );
}