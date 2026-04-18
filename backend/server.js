import express from "express";
import cors from "cors";
import jwt from "jsonwebtoken";
import bcrypt from "bcrypt";
import { Pool } from "pg";

const app = express();

app.use(
  cors({
    origin: [
      "https://myspace-frontend.onrender.com",
      "https://myspace-frontend.vercel.app",
      "https://myspace-frontend-6h2wahh62-integritys-projects-d00b1864.vercel.app"
    ],
    methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"]
  })
);

app.use(express.json());

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

async function ensureUsersTable() {
  await pool.query(`
    CREATE EXTENSION IF NOT EXISTS pgcrypto;

    CREATE TABLE IF NOT EXISTS users (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      email TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);
  console.log("Users table ensured");
}

ensureUsersTable().catch((err) => console.error("Users table init failed", err));

app.post("/auth/register", async (req, res) => {
  try {
    const { email, password } = req.body || {};
    if (!email || !password) return res.status(400).json({ message: "email and password required" });

    const passwordHash = await bcrypt.hash(password, 12);

    const result = await pool.query(
      "INSERT INTO users (email, password_hash) VALUES ($1, $2) RETURNING id, email",
      [email.toLowerCase(), passwordHash]
    );

    return res.status(201).json(result.rows[0]);
  } catch (e) {
    const msg = String(e || "").toLowerCase();
    if (msg.includes("unique")) return res.status(409).json({ message: "email already exists" });
    console.error("Register error:", e);
    return res.status(500).json({ message: "server error" });
  }
});

app.post("/auth/login", async (req, res) => {
  try {
    const { email, password } = req.body || {};
    if (!email || !password) return res.status(400).json({ message: "email and password required" });

    const result = await pool.query(
      "SELECT id, email, password_hash FROM users WHERE email=$1",
      [email.toLowerCase()]
    );

    const user = result.rows[0];
    if (!user) return res.status(401).json({ message: "invalid credentials" });

    const ok = await bcrypt.compare(password, user.password_hash);
    if (!ok) return res.status(401).json({ message: "invalid credentials" });

    if (!process.env.JWT_SECRET) return res.status(500).json({ message: "JWT_SECRET not set" });

    const token = jwt.sign({ sub: user.id, email: user.email }, process.env.JWT_SECRET, { expiresIn: "7d" });
    return res.json({ token });
  } catch (e) {
    console.error("Login error:", e);
    return res.status(500).json({ message: "server error" });
  }
});

app.get("/", (req, res) => res.json({ status: "myspace-backend running" }));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
