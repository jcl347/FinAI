/**
 * Pure daily-run core for the automated simulated trading system.
 *
 * Given today's market data (AlignedData ending today) and the current sim book (cash +
 * holdings, from Neon in prod or a JSON file locally), it: builds the live perf provider,
 * asks the production meta for today's target weights, diffs against current holdings, and
 * returns the simulated trades + the updated book + the full allocation decision (the
 * self-tracking audit trail). No IO here — adapters persist the result.
 */
import { makeContext, symbolsWithHistory, type AlignedData } from "../backtest/engine";
import { DEFAULT_COSTS, tradeCost, dailyBorrowCost, type CostModel } from "../backtest/costs";
import type { RegimeSnapshot } from "../strategies/types";
import type { AllocationDecision } from "../strategies/allocator";
import {
  buildProductionMeta,
  PRODUCTION_SLEEVES,
  STRATEGY_PRIORS,
  PRODUCTION_REBALANCE_DAYS,
  PRODUCTION_MAX_GROSS,
} from "../strategies/production";
import { isMacroTicker } from "../strategies/universe";
import { buildCurvePerfProvider, perfStatRows } from "./perf";
import { rankOpportunities, type OpportunitySignal, type PutOpportunity, type SleeveDecisionRow } from "../signals/opportunity";

/** Documented standalone ρ-to-SPY per sleeve (research/results.md) — drives the diversification boost in
 *  the opportunity score. Negative/low-ρ sleeves are the scarce resource and get surfaced higher. */
const RHO_SPY: Record<string, number> = {
  xs_momentum: 0.65, low_vol: 0.56, factor_momentum: 0.66, sector_rotation: 0.6,
  ts_trend: 0.58, cross_asset_trend: 0.28, tail_hedge: -0.07,
  resid_momentum: -0.13, lt_reversal: -0.23, sector_lt_reversal: -0.15,
  commodity_trend: 0.15, st_reversal: 0.67,
};

/** Universe floor used by the LIVE trade context — MUST equal the backtested meta's warmup
 *  (max sub-sleeve warmup + 5, see meta.ts) so the live-traded cross-section is identical to the
 *  validated backtest's buildUniverse(meta). Mismatch = silent sim/live divergence (review fix). */
const META_WARMUP_FLOOR = Math.max(...PRODUCTION_SLEEVES.map((s) => s.warmupBars)) + 5;

export interface SimBook {
  initialCapital: number;
  cash: number;
  holdings: Record<string, number>; // symbol -> shares
  /** Date of the last rebalance — gates the weekly cadence so off-days just hold. */
  lastRebalanceDate?: string | null;
}

export interface SimTrade {
  date: string;
  symbol: string;
  side: "BUY" | "SELL" | "SHORT" | "COVER";
  shares: number;
  price: number;
  notional: number;
  cost: number;
  reason: string;
}

export interface DailyRunResult {
  date: string;
  regime: RegimeSnapshot;
  volScale: number;
  decision: AllocationDecision | null;
  targetWeights: { symbol: string; weight: number; reason?: string }[];
  trades: SimTrade[];
  book: SimBook;
  equityBefore: number;
  equityAfter: number;
  grossExposurePct: number;
  deployedPct: number;
  perfRows: ReturnType<typeof perfStatRows>;
  /** Ranked cross-instrument investment-opportunity signals (sleeves + optional put opportunities). */
  opportunities: OpportunitySignal[];
  notes: string;
}

export interface DailyRunOptions {
  costs?: CostModel;
  perfWindowDays?: number;
  /** Ignore trades smaller than this fraction of equity (avoid dust churn). */
  minTradeFraction?: number;
  /** Trading-day cadence between rebalances (default from production config). */
  rebalanceDays?: number;
  /** Force a rebalance regardless of cadence. */
  forceRebalance?: boolean;
  /** Top scored PutStrike VRP put opportunities to fold into the opportunity-signal list (live only). */
  puts?: PutOpportunity[];
}

function priceAt(data: AlignedData, symbol: string, i: number): number | null {
  const arr = data.closes.get(symbol);
  return arr ? arr[i] ?? null : null;
}

/**
 * Run one trading day: compute target portfolio from the adaptive meta and execute the
 * diff against the book. `data` must end on the decision date (no look-ahead).
 */
export function runDay(data: AlignedData, book: SimBook, opts: DailyRunOptions = {}): DailyRunResult {
  const costs = opts.costs ?? DEFAULT_COSTS;
  const minFrac = opts.minTradeFraction ?? 0.003;
  const cadence = opts.rebalanceDays ?? PRODUCTION_REBALANCE_DAYS;
  const i = data.calendar.length - 1;
  const date = data.calendar[i];

  // Context (cheap — no backtests) so we can gate on regime + cadence before heavy compute.
  // Floor MUST match the backtested meta's warmup so the live cross-section == the validated one.
  const universe = symbolsWithHistory(data, i, META_WARMUP_FLOOR);
  const ctx = makeContext(data, universe, i);

  // Rebalance gate: rebalance on cadence, on first run, on force, or on a crisis flip.
  let isRebalance = opts.forceRebalance ?? false;
  if (!book.lastRebalanceDate) isRebalance = true;
  else {
    const lastIdx = data.calendar.indexOf(book.lastRebalanceDate);
    const since = lastIdx >= 0 ? i - lastIdx : cadence;
    if (since >= cadence) isRebalance = true;
    if (ctx.regime.regime === "CRISIS") isRebalance = true; // re-derisk immediately in a crisis
  }

  // Mark the book to today's close.
  const holdings = { ...book.holdings };
  let cash = book.cash;
  // Accrue one day of borrow on any short positions (mirrors the backtest engine). No-op for the
  // long-only production book; keeps cash/financing identical to the backtest if longOnly is flipped.
  for (const [sym, sh] of Object.entries(holdings)) {
    if (sh < 0) { const p = priceAt(data, sym, i); if (p != null) cash -= dailyBorrowCost(sh * p, costs); }
  }
  const equityOf = (): number => {
    let eq = cash;
    for (const [sym, sh] of Object.entries(holdings)) {
      if (!sh) continue;
      const p = priceAt(data, sym, i);
      if (p != null) eq += sh * p;
    }
    return eq;
  };
  const equityBefore = equityOf();

  // Off-day: just hold (no heavy compute, no trades).
  if (!isRebalance) {
    let gross = 0;
    for (const [sym, sh] of Object.entries(holdings)) {
      const p = priceAt(data, sym, i);
      if (p != null) gross += Math.abs(sh * p);
    }
    return {
      date,
      regime: ctx.regime,
      volScale: 1,
      decision: null,
      targetWeights: [],
      trades: [],
      book: { ...book, cash: Math.round(cash * 100) / 100, holdings },
      equityBefore: Math.round(equityBefore * 100) / 100,
      equityAfter: Math.round(equityBefore * 100) / 100,
      grossExposurePct: equityBefore > 0 ? Math.round((gross / equityBefore) * 1000) / 10 : 0,
      deployedPct: equityBefore > 0 ? Math.round((gross / equityBefore) * 1000) / 10 : 0,
      perfRows: [],
      opportunities: [],
      notes: "hold (between rebalances)",
    };
  }

  // Rebalance day: build the live perf provider + production meta and compute target weights.
  const cpp = buildCurvePerfProvider(PRODUCTION_SLEEVES, data, opts.perfWindowDays ?? 126);
  const meta = buildProductionMeta(cpp.provider);
  const signal = meta.generate(ctx);
  const decision = meta.lastDecision;
  const volScale = meta.lastVolScale;

  // 4) Diff target weights → trades. Normalize EXACTLY as the backtest engine does so the live book
  //    matches the validated one: never trade macro/context tickers, clamp net-negative weights when
  //    the meta is long-only, then cap gross to PRODUCTION_MAX_GROSS.
  const targets = new Map<string, number>();
  for (const w of signal.weights) {
    if (isMacroTicker(w.symbol)) continue; // ^VIX/^TNX/DX-Y.NYB etc. are signals, never positions
    let wt = w.weight;
    if (meta.longOnly && wt < 0) wt = 0;
    if (wt !== 0) targets.set(w.symbol, (targets.get(w.symbol) ?? 0) + wt);
  }
  let grossTarget = 0;
  for (const v of targets.values()) grossTarget += Math.abs(v);
  if (grossTarget > PRODUCTION_MAX_GROSS && grossTarget > 0) {
    const sc = PRODUCTION_MAX_GROSS / grossTarget;
    for (const [k, v] of targets) targets.set(k, v * sc);
  }
  const reasonOf = new Map(signal.weights.map((w) => [w.symbol, w.reason ?? ""]));
  const symbols = new Set<string>([...targets.keys(), ...Object.keys(holdings)]);

  const trades: SimTrade[] = [];
  for (const sym of symbols) {
    const p = priceAt(data, sym, i);
    if (p == null || p <= 0) continue;
    const targetShares = ((targets.get(sym) ?? 0) * equityBefore) / p;
    const cur = holdings[sym] ?? 0;
    const delta = targetShares - cur;
    if (Math.abs(delta * p) < equityBefore * minFrac) continue;
    const notional = delta * p;
    const cost = tradeCost(notional, costs);
    cash -= notional + cost;
    holdings[sym] = targetShares;
    if (Math.abs(targetShares) < 1e-9) delete holdings[sym];
    let side: SimTrade["side"];
    if (cur >= 0 && delta > 0) side = "BUY";
    else if (cur > 0 && targetShares < cur && targetShares >= 0) side = "SELL";
    else if (delta < 0 && targetShares < 0) side = "SHORT";
    else side = "COVER";
    trades.push({
      date,
      symbol: sym,
      side,
      shares: Math.round(delta * 1000) / 1000,
      price: Math.round(p * 100) / 100,
      notional: Math.round(notional),
      cost: Math.round(cost * 100) / 100,
      reason: reasonOf.get(sym) ?? "",
    });
  }

  // Borrow on any shorts is accrued at the top of the day (see above); with the long-only meta the
  // book holds no shorts, so the accrual is a no-op — but the code path is correct if longOnly flips.
  const equityAfter = equityOf();
  let gross = 0;
  for (const [sym, sh] of Object.entries(holdings)) {
    const p = priceAt(data, sym, i);
    if (p != null) gross += Math.abs(sh * p);
  }

  const perfRows = perfStatRows(PRODUCTION_SLEEVES, cpp, date, STRATEGY_PRIORS);

  // Investment-opportunity signals: rank every sleeve (+ any live put opportunities) by
  // signal × regime-fit × marginal-diversification, so the UI surfaces the best opportunities daily.
  const detailByKey = new Map((decision?.detail ?? []).map((d) => [d.key, d]));
  const sleeveRows: SleeveDecisionRow[] = perfRows.map((pr) => {
    const d = detailByKey.get(pr.key);
    return {
      key: pr.key, family: pr.family, weight: d?.weight ?? 0,
      blendedSharpe: d?.blendedSharpe ?? pr.trailingSharpe, trailingSharpe: pr.trailingSharpe,
      trailingVol: pr.trailingVol, benched: d?.benched ?? false, confidence: pr.confidence ?? 0.5,
      correlationToSpy: RHO_SPY[pr.key], reason: d?.reason ?? "",
    };
  });
  const opportunities = rankOpportunities(date, sleeveRows, opts.puts ?? [], ctx.regime);

  return {
    date,
    regime: ctx.regime,
    volScale,
    decision,
    targetWeights: signal.weights,
    trades,
    book: { initialCapital: book.initialCapital, cash: Math.round(cash * 100) / 100, holdings, lastRebalanceDate: date },
    equityBefore: Math.round(equityBefore * 100) / 100,
    equityAfter: Math.round(equityAfter * 100) / 100,
    grossExposurePct: equityAfter > 0 ? Math.round((gross / equityAfter) * 1000) / 10 : 0,
    // Realized gross (consistent with the off-day hold path); the target was decision.grossDeployed*volScale.
    deployedPct: equityAfter > 0 ? Math.round((gross / equityAfter) * 1000) / 10 : 0,
    perfRows,
    opportunities,
    notes: signal.notes ?? "",
  };
}
