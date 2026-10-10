import React from "react";

export default function Terms({ goBack }) {
  return (
    <div style={{ padding: 20, color: "white", background: "#07152f", minHeight: "100vh" }}>
      <button onClick={goBack}>← Back</button>

      <h1>Booking Terms</h1>

      <p>
        By using this platform, you agree to the following:
      </p>

      <h3>Search and comparison</h3>
      <p>
        We provide hotel search and comparison tools to help you make informed
        decisions.
      </p>

      <h3>Reservation requests</h3>
      <p>
        Submitting a request does not guarantee booking. Availability is subject
        to confirmation.
      </p>

      <h3>Pricing</h3>
      <p>
        Prices may change depending on availability, timing, and provider terms.
      </p>

      <h3>Responsibility</h3>
      <p>
        Final booking terms are governed by the hotel or booking provider.
      </p>

      <h3>Usage</h3>
      <p>
        This platform is intended for genuine travel planning and booking
        requests.
      </p>
    </div>
  );
}