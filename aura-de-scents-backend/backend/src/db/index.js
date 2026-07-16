const { Pool } = require('pg');

if (!process.env.DATABASE_URL) {
  console.warn(
    '\n⚠️  WARNING: DATABASE_URL is not set.\n' +
    '   Get it from Supabase → Project Settings → Database → Connection string (URI).\n'
  );
}

// Supabase requires SSL. `rejectUnauthorized: false` is standard here since
// Supabase uses its own managed CA that Node doesn't automatically trust.
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

pool.on('error', (err) => {
  console.error('Unexpected error on idle Postgres client', err);
});

const SCHEMA_SQL = `
  CREATE TABLE IF NOT EXISTS admins (
    id SERIAL PRIMARY KEY,
    username TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  );

  CREATE TABLE IF NOT EXISTS products (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    price NUMERIC NOT NULL,
    description TEXT NOT NULL,
    image TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'in-stock' CHECK (status IN ('in-stock', 'out-of-stock')),
    top_notes TEXT,
    heart_notes TEXT,
    base_notes TEXT,
    created_at BIGINT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS orders (
    id TEXT PRIMARY KEY,
    customer_name TEXT NOT NULL,
    email TEXT NOT NULL,
    phone1 TEXT NOT NULL,
    phone2 TEXT,
    address TEXT NOT NULL,
    total_price NUMERIC NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'shipped', 'delivered')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  );

  CREATE TABLE IF NOT EXISTS order_items (
    id SERIAL PRIMARY KEY,
    order_id TEXT NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
    product_id TEXT NOT NULL,
    product_name TEXT NOT NULL,
    price NUMERIC NOT NULL,
    quantity INTEGER NOT NULL
  );
`;

// Runs once at boot to make sure tables exist. Safe to run repeatedly
// thanks to IF NOT EXISTS.
async function ensureSchema() {
  await pool.query(SCHEMA_SQL);
}

module.exports = { pool, ensureSchema };
