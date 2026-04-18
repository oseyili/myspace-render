import React, { useState } from "react";

const API_BASE = import.meta.env.VITE_API_BASE_URL;

export default function App() {
  const [mode, setMode] = useState("login"); // login | register
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState("");

  async function register() {
    setMessage("Registering...");
    try {
      const res = await fetch(`${API_BASE}/auth/register`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });

      const data = await res.json();
      if (!res.ok) {
        setMessage(data.message || "Register failed");
        return;
      }

      setMessage("Registered. You can now log in.");
      setMode("login");
    } catch {
      setMessage("Network error");
    }
  }

  async function login() {
    setMessage("Logging in...");
    try {
      const res = await fetch(`${API_BASE}/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });

      const data = await res.json();
      if (!res.ok) {
        setMessage(data.message || "Login failed");
        return;
      }

      setMessage("Login successful ✅");
    } catch {
      setMessage("Network error");
    }
  }

  return (
    <div style={{ maxWidth: 400, margin: "60px auto", fontFamily: "system-ui" }}>
      <h2>My Space</h2>
      <p style={{ opacity: 0.7 }}>API: {API_BASE}</p>

      <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
        <button onClick={() => setMode("login")} disabled={mode === "login"}>
          Login
        </button>
        <button onClick={() => setMode("register")} disabled={mode === "register"}>
          Register
        </button>
      </div>

      <input
        placeholder="Email"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        style={{ display: "block", width: "100%", marginBottom: 8 }}
      />

      <input
        type="password"
        placeholder="Password"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        style={{ display: "block", width: "100%", marginBottom: 8 }}
      />

      {mode === "register" ? (
        <button onClick={register}>Create account</button>
      ) : (
        <button onClick={login}>Log in</button>
      )}

      <p style={{ marginTop: 12 }}>{message}</p>
    </div>
  );
}
