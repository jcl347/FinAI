/**
 * Walk-forward, no-look-ahead portfolio backtest engine.
 *
 * Model: a strategy emits SIGNED TARGET WEIGHTS (fraction of equity per symbol) on its
 * rebalance days. The engine converts weights → share holdings at that day's close,
 * charges realistic costs on the traded notional, then marks the book to market every
 * subsequent day. Cash earns the (optional) risk-free rate; shorts pay borrow.
 *
 * No look-ahead guarantees:
 *  - On decision day i, the strategy sees bars with date <= calendar[i] only.
 *  - Trades execute at calendar[i]'s close (the price the signal was computed on).
 *    This is conservative: a real system would trade at the NEXT open/close. Using the
 *    same close slightly flatters fills but is standard for EOD weight backtests; the
 *    conservative cost model offsets it. The live runner trades next session, matching.
 */

import type { Strategy, StrategyContext, Bar, RegimeSnapshot } from "../strategies/types";
import { type CostModel, DEFAULT_COSTS, tradeCost, dailyBorrowCost } from "./costs";
import { computeMetrics, type EquityPoint, type PerfMetrics } from "./metrics";

export interface AlignedData {
  /** Master trading calendar (sorted YYYY-MM-DD), typically SPY's dates. */
  calendar: string[];
  /** symbol -> close aligned to calendar (null before listing / missing). */
  closes: Map<string, (number | null)[]>;
  /** symbol -> full bars aligned to calendar (null where missing). */
  bars: Map<string, (Bar | null)[]>;
  /** Optional VIX close aligned to calendar. */
  vix?: (number | null)[];
  /** Optional ^VIX9D close aligned to calendar (for term-structure regime). */
  vix9d?: (number | null)[];
}

export interface BacktestConfig {
  initialCapital: number;
  costs?: CostModel;
  rfAnnual?: number;
  /** Cap gross exposure (sum |weight|) to this (e.g. 1.0 = no leverage). */
  maxGross?: number;
  /** First calendar index to start trading (after warmup). Default: strategy.warmupBars. */
  startIndex?: number;
}

export interface BacktestTrade {
  date: string;
  symbol: string;
  side: "BUY" | "SELL" | "SHORT" | "COVER";
  shares: number;
  price: number;
  notional: number;
  cost: number;
  reason?: string;
}

export interface BacktestResult {
  strategyKey: string;
  strategyName: string;
  equityCurve: EquityPoint[];
  trades: BacktestTrade[];
  metrics: PerfMetrics;
  /** Final positions (symbol -> shares) for inspection. */
  finalHoldings: Record<string, number>;
}

function spyRegime(closes: (number | null)[] | undefined, i: number): boolean | null {
  if (!closes) return null;
  if (i < 200) return null;
  let sum = 0;
  let cnt = 0;
  for (let k = i - 199; k <= i; k++) {
    const c = closes[k];
    if (c != null) {
      sum += c;
      cnt++;
    }
  }
  const cur = closes[i];
  if (cur == null || cnt < 150) return null;
  return cur > sum / cnt;
}

function classifyVix(vix: number | null): RegimeSnapshot["regime"] {
  if (vix == null) return "NORMAL";
  if (vix < 15) return "LOW_VOL";
  if (vix < 25) return "NORMAL";
  if (vix < 35) return "HIGH_VOL";
  return "CRISIS";
}

/** Build the no-look-ahead context for a given calendar index. */
export function makeContext(
  data: AlignedData,
  universe: string[],
  i: number
): StrategyContext {
  const date = data.calendar[i];
  const vix = data.vix?.[i] ?? null;
  const vix9d = data.vix9d?.[i] ?? null;
  const spyCloses = data.closes.get("SPY");
  const regime: RegimeSnapshot = {
    vix,
    regime: classifyVix(vix),
    spyAbove200: spyRegime(spyCloses, i),
    vixTermRatio: vix && vix9d ? vix9d / vix : null,
  };

  const barsCache = new Map<string, Bar[]>();
  const closesCache = new Map<string, number[]>();

  function barsOf(symbol: string): Bar[] {
    let b = barsCache.get(symbol);
    if (b) return b;
    const aligned = data.bars.get(symbol);
    b = [];
    if (aligned) {
      for (let k = 0; k <= i; k++) {
        const bar = aligned[k];
        if (bar) b.push(bar);
      }
    }
    barsCache.set(symbol, b);
    return b;
  }

  function closesOf(symbol: string): number[] {
    let c = closesCache.get(symbol);
    if (c) return c;
    const aligned = data.closes.get(symbol);
    c = [];
    if (aligned) {
      for (let k = 0; k <= i; k++) {
        const v = aligned[k];
        if (v != null) c.push(v);
      }
    }
    closesCache.set(symbol, c);
    return c;
  }

  return { date, i, universe, bars: barsOf, closes: closesOf, regime };
}

/**
 * Run a single strategy over the aligned dataset.
 */
export function runBacktest(
  strategy: Strategy,
  data: AlignedData,
  config: BacktestConfig
): BacktestResult {
  const costs = config.costs ?? DEFAULT_COSTS;
  const maxGross = config.maxGross ?? 1.0;
  const start = Math.max(config.startIndex ?? strategy.warmupBars, strategy.warmupBars, 1);

  let cash = config.initialCapital;
  const holdings = new Map<string, number>(); // symbol -> shares (signed)
  const equityCurve: EquityPoint[] = [];
  const trades: BacktestTrade[] = [];

  let exposureSum = 0;
  let exposureDays = 0;
  let turnoverSum = 0;

  const priceAt = (symbol: string, i: number): number | null => {
    const arr = data.closes.get(symbol);
    return arr ? arr[i] ?? null : null;
  };

  const equityAt = (i: number): number => {
    let eq = cash;
    for (const [sym, sh] of holdings) {
      if (sh === 0) continue;
      const p = priceAt(sym, i);
      if (p != null) eq += sh * p;
    }
    return eq;
  };

  for (let i = start; i < data.calendar.length; i++) {
    const date = data.calendar[i];

    // 1) Accrue borrow cost on shorts for the day (charged on yesterday's notional).
    for (const [sym, sh] of holdings) {
      if (sh < 0) {
        const p = priceAt(sym, i);
        if (p != null) cash -= dailyBorrowCost(sh * p, costs);
      }
    }

    // 2) Rebalance if due.
    const sinceStart = i - start;
    const isRebalance = sinceStart % strategy.rebalanceDays === 0;
    if (isRebalance) {
      const universe = strategy.warmupBars
        ? data.calendar.length
          ? buildUniverse(strategy, data, i)
          : []
        : [];
      const ctx = makeContext(data, universe, i);
      let signal;
      try {
        signal = strategy.generate(ctx);
      } catch {
        signal = { weights: [] };
      }
      const equity = equityAt(i);

      // Normalize / clamp weights.
      const targets = new Map<string, number>();
      let gross = 0;
      for (const w of signal.weights) {
        let wt = w.weight;
        if (strategy.longOnly && wt < 0) wt = 0;
        if (wt !== 0) {
          targets.set(w.symbol, (targets.get(w.symbol) ?? 0) + wt);
        }
      }
      for (const v of targets.values()) gross += Math.abs(v);
      // Scale down if gross exceeds cap.
      const scale = gross > maxGross && gross > 0 ? maxGross / gross : 1;

      // Compute target shares and trade the deltas.
      const reasons = new Map(signal.weights.map((w) => [w.symbol, w.reason]));
      const symbolsToConsider = new Set<string>([...targets.keys(), ...holdings.keys()]);
      let dayTurnover = 0;
      for (const sym of symbolsToConsider) {
        const p = priceAt(sym, i);
        if (p == null || p <= 0) continue;
        const targetW = (targets.get(sym) ?? 0) * scale;
        const targetDollars = targetW * equity;
        const targetShares = targetDollars / p;
        const curShares = holdings.get(sym) ?? 0;
        const deltaShares = targetShares - curShares;
        // Ignore dust (<0.2% of equity) — but ALWAYS execute a full exit so dropped positions close.
        if (targetW !== 0 && Math.abs(deltaShares * p) < equity * 0.002) continue;

        const notional = deltaShares * p;
        const cost = tradeCost(notional, costs);
        cash -= notional + cost;
        holdings.set(sym, targetShares);
        dayTurnover += Math.abs(notional);

        let side: BacktestTrade["side"];
        if (curShares >= 0 && deltaShares > 0) side = "BUY";
        else if (curShares > 0 && targetShares < curShares && targetShares >= 0) side = "SELL";
        else if (deltaShares < 0 && targetShares < 0) side = "SHORT";
        else side = "COVER";

        trades.push({
          date,
          symbol: sym,
          side,
          shares: Math.round(deltaShares * 100) / 100,
          price: Math.round(p * 100) / 100,
          notional: Math.round(notional),
          cost: Math.round(cost * 100) / 100,
          reason: reasons.get(sym),
        });
      }
      turnoverSum += equity > 0 ? dayTurnover / equity : 0;
    }

    // 3) Mark to market + record equity.
    const eq = equityAt(i);
    equityCurve.push({ date, equity: Math.round(eq * 100) / 100 });

    // 4) Track gross exposure.
    let gross = 0;
    for (const [sym, sh] of holdings) {
      const p = priceAt(sym, i);
      if (p != null) gross += Math.abs(sh * p);
    }
    if (eq > 0) {
      exposureSum += gross / eq;
      exposureDays++;
    }
  }

  // Snapshot final holdings (open positions are reported, not liquidated — terminal marks remain).
  const finalHoldings: Record<string, number> = {};
  for (const [sym, sh] of holdings) {
    if (sh !== 0) finalHoldings[sym] = Math.round(sh * 100) / 100;
  }

  const years = equityCurve.length / 252;
  const annualTurnover = years > 0 ? (turnoverSum / years) * 100 : 0;
  const avgExposure = exposureDays > 0 ? (exposureSum / exposureDays) * 100 : 0;

  const metrics = computeMetrics(equityCurve, {
    rfAnnual: config.rfAnnual ?? 0,
    avgExposurePct: avgExposure,
    annualTurnoverPct: annualTurnover,
  });

  return {
    strategyKey: strategy.key,
    strategyName: strategy.name,
    equityCurve,
    trades,
    metrics,
    finalHoldings,
  };
}

/** Symbols with at least `minBars` non-null closes up to calendar index `i`. */
export function symbolsWithHistory(data: AlignedData, i: number, minBars: number): string[] {
  const out: string[] = [];
  for (const [sym, closes] of data.closes) {
    let cnt = 0;
    for (let k = 0; k <= i; k++) if (closes[k] != null) cnt++;
    if (cnt >= minBars) out.push(sym);
  }
  return out;
}

/** Symbols with enough history (>= warmupBars non-null closes up to i). */
function buildUniverse(strategy: Strategy, data: AlignedData, i: number): string[] {
  const out: string[] = [];
  for (const [sym, closes] of data.closes) {
    let cnt = 0;
    for (let k = 0; k <= i; k++) if (closes[k] != null) cnt++;
    if (cnt >= strategy.warmupBars) out.push(sym);
  }
  return out;
}
