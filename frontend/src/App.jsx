import React from "react";

export default function App() {
  return (
    <div
      style={{
        minHeight: "100vh",
        background: "#f3f6fb",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        fontFamily: "Arial, sans-serif"
      }}
    >
      <div
        style={{
          background: "white",
          padding: 40,
          borderRadius: 20,
          boxShadow: "0 10px 40px rgba(0,0,0,0.08)",
          width: 500,
          textAlign: "center"
        }}
      >
        <h1
          style={{
            marginBottom: 10,
            color: "#0f172a",
            fontSize: 42,
            fontWeight: 800
          }}
        >
          MYSPACE HOTEL
        </h1>

        <p
          style={{
            color: "#475569",
            fontSize: 18,
            marginBottom: 30
          }}
        >
          Premium global hotel booking platform
        </p>

        <div
          style={{
            background: "#2563eb",
            color: "white",
            padding: 18,
            borderRadius: 14,
            fontWeight: 700,
            fontSize: 18
          }}
        >
          Frontend restored successfully
        </div>
      </div>
    </div>
  );
}
