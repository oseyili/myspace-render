import React from "react";

export default function FAQ({ goBack }) {
  return (
    <div style={pageStyle}>
      <button onClick={goBack} style={backBtn}>Return to search</button>
      <h1>FAQs</h1>
      <h2>How does My Space Hotel work?</h2>
      <p>Search globally, compare stays clearly, choose the hotel that fits your trip, and send a reservation request directly.</p>

      <h2>Do I pay immediately?</h2>
      <p>No. You first send a reservation request so the next step can be handled clearly and safely.</p>

      <h2>Can I search by country, city, or area?</h2>
      <p>Yes. You can search broadly by country, narrow by city, or focus on a specific area.</p>

      <h2>Will I receive confirmation?</h2>
      <p>When email delivery is active, you receive a request confirmation by email.</p>
    </div>
  );
}

const pageStyle = { minHeight: "100vh", background: "#07152f", color: "white", padding: 30, fontFamily: "Arial" };
const backBtn = { background: "#f1c644", border: "none", padding: 14, borderRadius: 12, fontWeight: 800 };