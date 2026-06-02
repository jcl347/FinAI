/**
 * Neon persistence for the automated multi-strategy simulated trading book.
 *
 * Separate from the put-selling tables (db.ts). Stores the portfolio book (cash + holdings),
 * the daily equity curve, every simulated trade, and — critically for the self-tracking story —
 * the per-day allocation decisions (which sleeves got capital, which were benched, and why).
 * Schema auto-creates on first use. Returns gracefully when no DATABASE_URL is configured.
 */
import { getDb } from "./db";
import type { SimBook, DailyRunResult } from "./daily/engine";

let quantInit = false;

export async function ensureQuantSchema(): Promise<boolean> {
  const db = getDb();
  if (!db) return false;
  if (quantInit) return true;

  await db`
    CREATE TABLE IF NOT EXISTS quant_book (
      id INTEGER PRIMARY KEY DEFAULT 1,
      initial_capital NUMERIC NOT NULL,
      cash NUMERIC NOT NULL,
      last_rebalance_date DATE,
      started_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW()
    )
  `;
  await db`
    CREATE TABLE IF NOT EXISTS quant_holdings (
      symbol VARCHAR(12) PRIMARY KEY,
      shares NUMERIC NOT NULL,
      updated_at TIMESTAMPTZ DEFAULT NOW()
    )
  `;
  await db`
    CREATE TABLE IF NOT EXISTS quant_trades (
      id SERIAL PRIMARY KEY,
      trade_date DATE NOT NULL,
      symbol VARCHAR(12) NOT NULL,
      side VARCHAR(6) NOT NULL,
      shares NUMERIC NOT NULL,
      price NUMERIC NOT NULL,
      notional NUMERIC NOT NULL,
      cost NUMERIC NOT NULL,
      reason TEXT,
      created_at TIMESTAMPTZ DEFAULT NOW()
    )
  `;
  await db`
    CREATE TABLE IF NOT EXISTS quant_equity (
      equity_date DATE PRIMARY KEY,
      equity NUMERIC NOT NULL,
      cash NUMERIC NOT NULL,
      gross_exposure_pct NUMERIC,
      deployed_pct NUMERIC,
      regime VARCHAR(12),
      vol_scale NUMERIC,
      note TEXT,
      created_at TIMESTAMPTZ DEFAULT NOW()
    )
  `;
  await db`
    CREATE TABLE IF NOT EXISTS quant_allocations (
      id SERIAL PRIMARY KEY,
      alloc_date DATE NOT NULL,
      strategy_key VARCHAR(40) NOT NULL,
      weight NUMERIC NOT NULL,
      benched BOOLEAN DEFAULT FALSE,
      trailing_sharpe NUMERIC,
      prior_sharpe NUMERIC,
      reason TEXT
    )
  `;
  quantInit = true;
  return true;
}

/** Create the book if it doesn't exist; return the current book. */
export async function initQuantBook(initialCapital = 100000): Promise<SimBook | null> {
  const db = getDb();
  if (!db) return null;
  await ensureQuantSchema();
  // ON CONFLICT DO NOTHING guards the first-run check-then-insert race (two cron/manual hits
  // on a brand-new DB could both read 0 rows and both attempt the insert).
  await db`INSERT INTO quant_book (id, initial_capital, cash) VALUES (1, ${initialCapital}, ${initialCapital}) ON CONFLICT (id) DO NOTHING`;
  return getQuantBook();
}

export async function getQuantBook(): Promise<SimBook | null> {
  const db = getDb();
  if (!db) return null;
  await ensureQuantSchema();
  const bookRows = await db`SELECT * FROM quant_book WHERE id = 1`;
  if (bookRows.length === 0) return null;
  const b = bookRows[0];
  const holdingRows = await db`SELECT symbol, shares FROM quant_holdings`;
  const holdings: Record<string, number> = {};
  for (const h of holdingRows) holdings[h.symbol] = Number(h.shares);
  return {
    initialCapital: Number(b.initial_capital),
    cash: Number(b.cash),
    holdings,
    lastRebalanceDate: b.last_rebalance_date ? new Date(b.last_rebalance_date).toISOString().split("T")[0] : null,
  };
}

/** True if a daily run has already been recorded for `date`. */
export async function hasRunFor(date: string): Promise<boolean> {
  const db = getDb();
  if (!db) return false;
  await ensureQuantSchema();
  const rows = await db`SELECT 1 FROM quant_equity WHERE equity_date = ${date}`;
  return rows.length > 0;
}

/** Persist a completed daily run: book, holdings, trades, equity point, allocation decision. */
export async function persistDailyRun(res: DailyRunResult): Promise<void> {
  const db = getDb();
  if (!db) return;
  await ensureQuantSchema();

  await db`
    UPDATE quant_book SET cash = ${res.book.cash}, last_rebalance_date = ${res.book.lastRebalanceDate ?? null}, updated_at = NOW() WHERE id = 1
  `;

  // Replace holdings snapshot.
  await db`DELETE FROM quant_holdings`;
  for (const [symbol, shares] of Object.entries(res.book.holdings)) {
    if (Math.abs(shares) < 1e-9) continue;
    await db`INSERT INTO quant_holdings (symbol, shares, updated_at) VALUES (${symbol}, ${shares}, NOW())`;
  }

  // Trades for the day (idempotent: a forced re-run replaces the day's trades, never appends).
  await db`DELETE FROM quant_trades WHERE trade_date = ${res.date}`;
  for (const t of res.trades) {
    await db`
      INSERT INTO quant_trades (trade_date, symbol, side, shares, price, notional, cost, reason)
      VALUES (${t.date}, ${t.symbol}, ${t.side}, ${t.shares}, ${t.price}, ${t.notional}, ${t.cost}, ${t.reason})
    `;
  }

  // Equity point (idempotent per date).
  await db`
    INSERT INTO quant_equity (equity_date, equity, cash, gross_exposure_pct, deployed_pct, regime, vol_scale, note)
    VALUES (${res.date}, ${res.equityAfter}, ${res.book.cash}, ${res.grossExposurePct}, ${res.deployedPct}, ${res.regime.regime}, ${res.volScale}, ${res.notes})
    ON CONFLICT (equity_date) DO UPDATE SET
      equity = EXCLUDED.equity, cash = EXCLUDED.cash, gross_exposure_pct = EXCLUDED.gross_exposure_pct,
      deployed_pct = EXCLUDED.deployed_pct, regime = EXCLUDED.regime, vol_scale = EXCLUDED.vol_scale, note = EXCLUDED.note
  `;

  // Allocation decisions for the day (replace).
  await db`DELETE FROM quant_allocations WHERE alloc_date = ${res.date}`;
  if (res.decision) {
    const sharpeByKey = new Map(res.perfRows.map((r) => [r.key, r.trailingSharpe]));
    const priorByKey = new Map(res.perfRows.map((r) => [r.key, r.priorSharpe]));
    for (const d of res.decision.detail) {
      await db`
        INSERT INTO quant_allocations (alloc_date, strategy_key, weight, benched, trailing_sharpe, prior_sharpe, reason)
        VALUES (${res.date}, ${d.key}, ${d.weight}, ${d.benched}, ${sharpeByKey.get(d.key) ?? null}, ${priorByKey.get(d.key) ?? null}, ${d.reason})
      `;
    }
  }
}

/** Reset the book to a fresh start with the given capital. */
export async function resetQuant(initialCapital = 100000): Promise<SimBook | null> {
  const db = getDb();
  if (!db) return null;
  await ensureQuantSchema();
  await db`DELETE FROM quant_holdings`;
  await db`DELETE FROM quant_trades`;
  await db`DELETE FROM quant_equity`;
  await db`DELETE FROM quant_allocations`;
  await db`DELETE FROM quant_book`;
  await db`INSERT INTO quant_book (id, initial_capital, cash) VALUES (1, ${initialCapital}, ${initialCapital})`;
  return getQuantBook();
}

/** Full dashboard state: book, holdings, equity curve, latest allocations, recent trades, stats. */
export async function getQuantState() {
  const db = getDb();
  if (!db) return null;
  await ensureQuantSchema();
  const book = await getQuantBook();
  if (!book) return { configured: true, initialized: false };

  const equity = await db`SELECT * FROM quant_equity ORDER BY equity_date`;
  const latestDate = equity.length ? new Date(equity[equity.length - 1].equity_date).toISOString().split("T")[0] : null;
  const allocations = latestDate
    ? await db`SELECT * FROM quant_allocations WHERE alloc_date = ${latestDate} ORDER BY weight DESC`
    : [];
  const trades = await db`SELECT * FROM quant_trades ORDER BY trade_date DESC, id DESC LIMIT 60`;
  const holdings = await db`SELECT symbol, shares FROM quant_holdings ORDER BY symbol`;

  // Stats from the equity curve.
  const curve = equity.map((e: any) => ({ date: new Date(e.equity_date).toISOString().split("T")[0], equity: Number(e.equity), deployedPct: Number(e.deployed_pct), regime: e.regime }));
  const stats = computeCurveStats(curve.map((c) => c.equity), book.initialCapital);

  return {
    configured: true,
    initialized: true,
    book,
    latestDate,
    equityCurve: curve,
    allocations: allocations.map((a: any) => ({
      strategyKey: a.strategy_key, weight: Number(a.weight), benched: a.benched,
      trailingSharpe: a.trailing_sharpe != null ? Number(a.trailing_sharpe) : null,
      priorSharpe: a.prior_sharpe != null ? Number(a.prior_sharpe) : null, reason: a.reason,
    })),
    holdings: holdings.map((h: any) => ({ symbol: h.symbol, shares: Number(h.shares) })),
    recentTrades: trades.map((t: any) => ({
      date: new Date(t.trade_date).toISOString().split("T")[0], symbol: t.symbol, side: t.side,
      shares: Number(t.shares), price: Number(t.price), notional: Number(t.notional), cost: Number(t.cost), reason: t.reason,
    })),
    stats,
  };
}

function computeCurveStats(eq: number[], initial: number) {
  if (eq.length < 2) return { equity: eq[eq.length - 1] ?? initial, totalReturnPct: 0, cagrPct: 0, sharpe: 0, maxDrawdownPct: 0, volPct: 0, days: eq.length };
  const rets: number[] = [];
  for (let i = 1; i < eq.length; i++) if (eq[i - 1] > 0) rets.push(eq[i] / eq[i - 1] - 1);
  const m = rets.reduce((a, b) => a + b, 0) / rets.length;
  const sd = Math.sqrt(rets.reduce((a, b) => a + (b - m) ** 2, 0) / Math.max(1, rets.length - 1));
  const annVol = sd * Math.sqrt(252);
  const sharpe = annVol > 0 ? (m * 252) / annVol : 0;
  let peak = -Infinity, mdd = 0;
  for (const v of eq) { if (v > peak) peak = v; if (peak > 0) mdd = Math.max(mdd, (peak - v) / peak); }
  const years = rets.length / 252;
  const end = eq[eq.length - 1];
  const cagr = years > 0 && eq[0] > 0 ? Math.pow(end / eq[0], 1 / years) - 1 : 0;
  const r2 = (x: number) => Math.round(x * 100) / 100;
  return {
    equity: r2(end), totalReturnPct: r2((end / initial - 1) * 100), cagrPct: r2(cagr * 100),
    sharpe: r2(sharpe), maxDrawdownPct: r2(mdd * 100), volPct: r2(annVol * 100), days: eq.length,
  };
}
