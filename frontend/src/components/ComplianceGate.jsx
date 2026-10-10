// COMPLETE REPLACEMENT — frontend/src/components/ComplianceGate.jsx

import React from "react";
import {
  isBlockedCountry,
  complianceMessage,
} from "../compliance/blockedRegions";

export default function ComplianceGate({
  billingCountry,
  ipCountry,
  cardCountry,
  children,
}) {
  const blocked =
    isBlockedCountry(billingCountry) ||
    isBlockedCountry(ipCountry) ||
    isBlockedCountry(cardCountry);

  if (blocked) {
    return (
      <div
        style={{
          background: "#111",
          color: "#fff",
          padding: 30,
          borderRadius: 18,
          marginTop: 20,
          border: "2px solid #ff4d4f",
        }}
      >
        <div
          style={{
            fontSize: 26,
            fontWeight: 900,
            marginBottom: 14,
          }}
        >
          Booking Restricted
        </div>

        <div
          style={{
            fontSize: 16,
            lineHeight: 1.7,
            color: "#f0f0f0",
          }}
        >
          {complianceMessage()}
        </div>
      </div>
    );
  }

  return children;
}