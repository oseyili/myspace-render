const { Pool } = require("pg");

const pool = new Pool({
  connectionString:
    process.env.DATABASE_URL ||
    "postgresql://postgres:postgres@localhost:5432/myspace_hotel"
});

async function setup() {

  await pool.query(`
    CREATE TABLE IF NOT EXISTS hotel_partners (
      id UUID PRIMARY KEY,
      hotel_name TEXT,
      contact_name TEXT,
      email TEXT,
      phone TEXT,
      country TEXT,
      city TEXT,
      pms_provider TEXT,
      api_key TEXT,
      api_secret TEXT,
      onboarding_status TEXT,
      created_at TIMESTAMP DEFAULT NOW()
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS pms_credentials (
      id UUID PRIMARY KEY,
      partner_id UUID,
      provider TEXT,
      endpoint_url TEXT,
      username TEXT,
      encrypted_password TEXT,
      webhook_secret TEXT,
      production_mode BOOLEAN,
      created_at TIMESTAMP DEFAULT NOW()
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS hotel_inventory (
      id UUID PRIMARY KEY,
      partner_id UUID,
      hotel_id TEXT,
      room_type TEXT,
      rate_plan TEXT,
      available INTEGER,
      stop_sell BOOLEAN,
      synced_at TIMESTAMP DEFAULT NOW()
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS hotel_rates (
      id UUID PRIMARY KEY,
      partner_id UUID,
      hotel_id TEXT,
      room_type TEXT,
      rate_plan TEXT,
      currency TEXT,
      amount NUMERIC,
      synced_at TIMESTAMP DEFAULT NOW()
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS hotel_reservations (
      id UUID PRIMARY KEY,
      partner_id UUID,
      booking_reference TEXT,
      supplier_confirmation TEXT,
      guest_name TEXT,
      hotel_name TEXT,
      room_type TEXT,
      amount NUMERIC,
      currency TEXT,
      reservation_status TEXT,
      synced_at TIMESTAMP DEFAULT NOW()
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS webhook_logs (
      id UUID PRIMARY KEY,
      provider TEXT,
      event_type TEXT,
      payload JSONB,
      signature_valid BOOLEAN,
      processed BOOLEAN,
      created_at TIMESTAMP DEFAULT NOW()
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS reconciliation_logs (
      id UUID PRIMARY KEY,
      booking_reference TEXT,
      provider TEXT,
      status TEXT,
      details TEXT,
      created_at TIMESTAMP DEFAULT NOW()
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS payout_ledger (
      id UUID PRIMARY KEY,
      hotel_name TEXT,
      booking_reference TEXT,
      gross_amount NUMERIC,
      commission NUMERIC,
      payout_amount NUMERIC,
      currency TEXT,
      payout_status TEXT,
      created_at TIMESTAMP DEFAULT NOW()
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS analytics_events (
      id UUID PRIMARY KEY,
      event_type TEXT,
      provider TEXT,
      metadata JSONB,
      created_at TIMESTAMP DEFAULT NOW()
    )
  `);

  console.log("=================================");
  console.log("MYSPACE HOTEL ENTERPRISE DB");
  console.log("=================================");
  console.log("POSTGRESQL STRUCTURE READY");
  console.log("HOTEL ONBOARDING READY");
  console.log("PMS VAULT READY");
  console.log("OTA RECON READY");
  console.log("PAYOUT LEDGER READY");
  console.log("ANALYTICS READY");
  console.log("=================================");

  process.exit(0);
}

setup();
