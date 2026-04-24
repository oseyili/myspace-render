import React from "react";

export default function FAQ({ goBack }) {
  return (
    <div style={{ padding: 20, color: "white", background: "#07152f", minHeight: "100vh" }}>
      <button onClick={goBack}>← Back</button>

      <h1>Frequently Asked Questions</h1>

      <h3>How does this platform work?</h3>
      <p>
        You search hotels globally, compare available options, and send a direct
        reservation request. We simplify the process so you can decide faster.
      </p>

      <h3>Are prices real?</h3>
      <p>
        Prices reflect current available rates at the time of search. Always
        confirm availability when submitting your request.
      </p>

      <h3>Do I pay through this platform?</h3>
      <p>
        You request your stay here. Final booking and payment may be completed
        through a partner or directly with the property.
      </p>

      <h3>Can I cancel?</h3>
      <p>
        Cancellation depends on the hotel or booking provider. Always check
        conditions before confirming.
      </p>

      <h3>Why use this platform?</h3>
      <p>
        We help you filter faster, compare clearly, and move directly toward a
        reservation without unnecessary steps.
      </p>
    </div>
  );
}