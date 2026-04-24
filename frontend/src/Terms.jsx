import React from "react";

export default function Terms({ goBack }) {
  return (
    <div style={pageStyle}>
      <button onClick={goBack} style={backBtn}>Return to search</button>
      <h1>Booking Terms</h1>
      <p>My Space Hotel helps you search, compare, and submit reservation requests.</p>

      <h2>Reservation requests</h2>
      <p>A request is not a final confirmed booking until availability and next steps are confirmed.</p>

      <h2>Prices</h2>
      <p>Displayed prices help comparison and may vary by availability, dates, location, and provider rules.</p>

      <h2>Customer responsibility</h2>
      <p>Please check your travel details carefully before submitting a request.</p>
    </div>
  );
}

const pageStyle = { minHeight: "100vh", background: "#07152f", color: "white", padding: 30, fontFamily: "Arial" };
const backBtn = { background: "#f1c644", border: "none", padding: 14, borderRadius: 12, fontWeight: 800 };