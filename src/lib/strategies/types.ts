/**
 * Core types for the multi-strategy engine.
 *
 * A Strategy is a PURE function from a no-look-ahead market context to a set of
 * signed target weights (fraction of equity per symbol). The same Strategy object
 * powers both the walk-forward backtest (src/lib/backtest/engine.ts) and the live
 * daily runner (scripts/daily/run.ts) — write the logic once, test it unbiased,
 * then deploy it. This guarantees the simulation matches what the website trades.
 */

export interface Bar {
  date: string; // YYYY-MM-DD (EOD)
  open: number;
  high: number;
  low: number;
  close: number; // adjusted close (used for returns to handle splits/dividends)
  volume: number;
}

/** Lightweight market-regime snapshot the meta-selector and strategies can read. */
export interface RegimeSnapshot {
  vix: number | null;
  /** "LOW_VOL" | "NORMAL" | "HIGH_VOL" | "CRISIS" — VIX bucket (matches scoring.ts). */
  regime: "LOW_VOL" | "NORMAL" | "HIGH_VOL" | "CRISIS";
  /** SPY above its 200d SMA → broad uptrend (risk-on). */
  spyAbove200: boolean | null;
  /** VIX term structure: ^VIX9D/^VIX < 1 = contango (calm), > 1 = backwardation (stress). */
  vixTermRatio: number | null;
}

/**
 * No-look-ahead context handed to a strategy on a given decision date.
 * Every accessor returns data with date <= `date` only. The engine enforces this.
 */
export interface StrategyContext {
  /** Current decision date (signals computed at this EOD close). */
  date: string;
  /** Index of `date` within the master trading calendar. */
  i: number;
  /** Symbols the strategy may trade today (those with enough history). */
  universe: string[];
  /** Chronological bars for a symbol, date <= current date. [] if not yet listed. */
  bars: (symbol: string) => Bar[];
  /** Convenience: adjusted closes for a symbol, date <= current date. */
  closes: (symbol: string) => number[];
  /** Regime snapshot as of `date`. */
  regime: RegimeSnapshot;
}

export interface TargetWeight {
  symbol: string;
  /** Signed fraction of equity: +0.10 = 10% long, -0.05 = 5% short. */
  weight: number;
  /** Optional human-readable reason (shown in the UI / trade notes). */
  reason?: string;
}

/** What a strategy emits each rebalance: target weights + optional diagnostics. */
export interface StrategySignal {
  weights: TargetWeight[];
  /** 0-1 confidence the strategy has in today's signal (gates the meta-selector). */
  confidence?: number;
  /** Free-form notes for the audit log. */
  notes?: string;
}

export interface Strategy {
  key: string;
  name: string;
  family: string;
  description: string;
  /** Act every N trading days (1 = daily). Between rebalances, positions drift. */
  rebalanceDays: number;
  /** Minimum bars of history required before the strategy produces signals. */
  warmupBars: number;
  /** If true, the engine clamps any negative weights to 0 (no shorting). */
  longOnly?: boolean;
  /** Instrument class — informs cost model + how trades are recorded. */
  instrument: "equity" | "etf" | "option_spread";
  generate(ctx: StrategyContext): StrategySignal;
}
