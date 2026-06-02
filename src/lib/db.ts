import { neon, type NeonQueryFunction } from "@neondatabase/serverless";

/**
 * Get database connection URL.
 * Supports both:
 *   - DATABASE_URL (standard / manual Neon setup)
 *   - POSTGRES_URL (auto-injected by Vercel when you connect a database via the dashboard)
 */
function getDbUrl(): string | null {
  return process.env.DATABASE_URL || process.env.POSTGRES_URL || null;
}

/**
 * Get a Neon query function. Returns null if no database URL is configured.
 * This is lazy — never throws at import time so builds succeed without env vars.
 */
export function getDb(): NeonQueryFunction<false, false> | null {
  const url = getDbUrl();
  if (!url) return null;
  return neon(url);
}

/**
 * Initialize all tables if they don't exist.
 * Called lazily on first API request. Uses IF NOT EXISTS + ALTER for safe migrations.
 */
let initialized = false;

export async function ensureSchema() {
  if (initialized) return;
  const db = getDb();
  if (!db) return;

  // Simulated trades table
  await db`
    CREATE TABLE IF NOT EXISTS simulated_trades (
      id SERIAL PRIMARY KEY,
      symbol VARCHAR(10) NOT NULL,
      company_name VARCHAR(100),
      strike_price DECIMAL(10,2) NOT NULL,
      expiration DATE NOT NULL,
      dte_at_entry INTEGER NOT NULL,
      premium_received DECIMAL(10,4) NOT NULL,
      stock_price_at_entry DECIMAL(10,2) NOT NULL,
      delta_at_entry DECIMAL(6,4),
      score_at_entry DECIMAL(5,1),
      stability_score_at_entry DECIMAL(5,1),
      iv_rank_at_entry DECIMAL(5,1),
      collateral DECIMAL(12,2) NOT NULL,
      status VARCHAR(20) DEFAULT 'OPEN',
      close_price DECIMAL(10,4),
      stock_price_at_close DECIMAL(10,2),
      pnl DECIMAL(10,2),
      pnl_percent DECIMAL(6,2),
      closed_at TIMESTAMPTZ,
      notes TEXT,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW()
    )
  `;

  // Migration: add tastytrade management columns (safe for existing DBs)
  await db`
    DO $$ BEGIN
      ALTER TABLE simulated_trades ADD COLUMN IF NOT EXISTS profit_target_price DECIMAL(10,4);
      ALTER TABLE simulated_trades ADD COLUMN IF NOT EXISTS stop_loss_price DECIMAL(10,4);
      ALTER TABLE simulated_trades ADD COLUMN IF NOT EXISTS management_date DATE;
      ALTER TABLE simulated_trades ADD COLUMN IF NOT EXISTS vix_at_entry DECIMAL(5,2);
      ALTER TABLE simulated_trades ADD COLUMN IF NOT EXISTS market_regime_at_entry VARCHAR(20);
      ALTER TABLE simulated_trades ADD COLUMN IF NOT EXISTS quantity INTEGER DEFAULT 1;
      ALTER TABLE simulated_trades ADD COLUMN IF NOT EXISTS contract_size INTEGER DEFAULT 100;
      ALTER TABLE simulated_trades ADD COLUMN IF NOT EXISTS total_premium DECIMAL(12,2);
    END $$
  `;

  // Capital events table (deposits / withdrawals)
  await db`
    CREATE TABLE IF NOT EXISTS capital_events (
      id SERIAL PRIMARY KEY,
      type VARCHAR(20) NOT NULL,
      amount DECIMAL(12,2) NOT NULL,
      notes TEXT,
      created_at TIMESTAMPTZ DEFAULT NOW()
    )
  `;

  initialized = true;
}
