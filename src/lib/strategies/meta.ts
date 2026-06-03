/**
 * Meta-Strategy factory — turns the registry of sub-strategies + the allocator into ONE
 * Strategy the engine (and the live runner) can execute. Each decision day it:
 *   1. collects every sub-strategy's signal + same-day confidence,
 *   2. pulls each sub-strategy's realized rolling performance via a pluggable provider
 *      (precomputed equity curves in backtest; the sim DB in production),
 *   3. asks the allocator for capital shares,
 *   4. blends the sub-strategies' target weights into one portfolio (share × weight), and
 *   5. (optional) VOL-TARGETS the whole book: scales gross down when the ex-ante portfolio
 *      volatility (from the sub-strategy return covariance) exceeds a target. This is the
 *      Moreira-Muir (2017) "volatility-managed portfolio" Sharpe lever, applied
 *      leverage-free (scale ≤ 1), which also sharply cuts drawdowns.
 *
 * The provider seam lets the SAME meta logic run identically in the unbiased backtest and
 * on the live simulated book — the only difference is where realized performance comes from.
 */
import type { Strategy, StrategyContext, StrategySignal } from "./types";
import {
  allocateStrategies,
  type AllocatorConfig,
  type AllocationDecision,
  DEFAULT_ALLOCATOR,
} from "./allocator";

/** Returns a strategy's trailing realized performance as of a date. `returns` (daily) is
 *  optional but required for vol-targeting. */
export type PerfProvider = (
  strategyKey: string,
  asOfDate: string
) => { sharpe: number; vol: number; n: number; returns?: number[] };

export interface MetaStrategyHandle extends Strategy {
  lastDecision: AllocationDecision | null;
  lastVolScale: number;
}

export function createMetaStrategy(opts: {
  subStrategies: Strategy[];
  priors: Record<string, number>;
  perfProvider: PerfProvider;
  config?: AllocatorConfig;
  rebalanceDays?: number;
  key?: string;
  name?: string;
  /** Annualized vol target (e.g. 0.10). Omit to disable vol-targeting. */
  volTargetAnnual?: number;
  /** Floor on the vol-scale so we never fully de-risk to 0 (default 0.25). */
  minVolScale?: number;
  /** If true (default), the engine clamps the blended book's net-negative weights to 0 (long-only
   *  projection). Set false to trade the L/S sleeves' shorts genuinely (engine charges borrow). The
   *  live runner reads this same flag, so the sim and the backtest can never diverge on shorting. */
  longOnly?: boolean;
}): MetaStrategyHandle {
  const cfg = opts.config ?? DEFAULT_ALLOCATOR;
  const subs = opts.subStrategies;
  const warmup = Math.max(...subs.map((s) => s.warmupBars)) + 5;
  const minVolScale = opts.minVolScale ?? 0.25;

  const handle: MetaStrategyHandle = {
    key: opts.key ?? "meta_allocator",
    name: opts.name ?? "Adaptive Meta-Allocator",
    family: "meta",
    description:
      "Self-tracking fund-of-strategies: weights each sleeve by realized rolling Sharpe (shrunk to a backtest prior), risk-balanced, regime-tilted, and volatility-targeted; de-risks in bear/high-vol regimes.",
    rebalanceDays: opts.rebalanceDays ?? 5,
    warmupBars: warmup,
    longOnly: opts.longOnly ?? true,
    instrument: "equity",
    lastDecision: null,
    lastVolScale: 1,
    generate(ctx: StrategyContext): StrategySignal {
      // 1) Sub-strategy signals (one call each).
      const signals = subs.map((s) => ({ s, sig: s.generate(ctx) }));

      // 2) Realized rolling performance.
      const perf = new Map(subs.map((s) => [s.key, opts.perfProvider(s.key, ctx.date)]));
      const stats = signals.map(({ s, sig }) => {
        const t = perf.get(s.key)!;
        // Sanitize provider output — a NaN from the DB-backed provider would otherwise poison
        // the whole allocation (NaN passes the `sum <= 0` guard in normalizeToGross).
        return {
          key: s.key,
          family: s.family,
          trailingSharpe: Number.isFinite(t.sharpe) ? t.sharpe : 0,
          trailingVol: Number.isFinite(t.vol) && t.vol > 0 ? t.vol : 0.15,
          priorSharpe: opts.priors[s.key] ?? 0,
          confidence: sig.confidence ?? 0.5,
          sampleDays: Number.isFinite(t.n) ? t.n : 0,
        };
      });

      // 3) Allocate capital shares.
      const decision = allocateStrategies(stats, ctx.regime, cfg);
      handle.lastDecision = decision;

      // 5) Vol-target: scale gross by targetVol / ex-ante portfolio vol (leverage-free).
      let volScale = 1;
      if (opts.volTargetAnnual && opts.volTargetAnnual > 0) {
        const activeKeys = [...decision.weights.keys()].filter((k) => (decision.weights.get(k) ?? 0) > 0);
        const portVol = exAntePortfolioVol(activeKeys, decision.weights, perf);
        if (portVol > 0) {
          volScale = Math.max(minVolScale, Math.min(1, opts.volTargetAnnual / portVol));
        } else {
          // Vol unmeasurable (cold start, <20d history): fail SAFE — assume a conservative book
          // vol rather than deploying full gross with no risk control.
          volScale = Math.max(minVolScale, Math.min(1, opts.volTargetAnnual / 0.12));
        }
      }
      handle.lastVolScale = round4(volScale);

      // 4) Blend sub-weights by capital share × volScale.
      const combined = new Map<string, { weight: number; reasons: string[] }>();
      for (const { s, sig } of signals) {
        const share = (decision.weights.get(s.key) ?? 0) * volScale;
        if (share <= 0) continue;
        for (const w of sig.weights) {
          const prev = combined.get(w.symbol) ?? { weight: 0, reasons: [] };
          prev.weight += share * w.weight;
          prev.reasons.push(`${s.key}`);
          combined.set(w.symbol, prev);
        }
      }

      const weights = Array.from(combined.entries()).map(([symbol, v]) => ({
        symbol,
        weight: v.weight,
        reason: Array.from(new Set(v.reasons)).join("+"),
      }));

      const active = decision.detail.filter((d) => d.weight > 0).map((d) => `${d.key} ${(d.weight * 100).toFixed(0)}%`);
      // Report ACTUAL deployed gross (sum of blended weights) — capital allocated to a sleeve
      // that itself chose cash (empty weights) is NOT invested and must not inflate the figure.
      const actualGross = weights.reduce((a, w) => a + Math.abs(w.weight), 0);
      return {
        weights,
        confidence: Math.min(1, actualGross),
        notes: `[${decision.regimeMode}] volScale ${volScale.toFixed(2)} | ${active.join(", ") || "all cash"}`,
      };
    },
  };

  return handle;
}

/** Ex-ante annualized portfolio vol from sub-strategy daily-return covariance × shares. */
function exAntePortfolioVol(
  keys: string[],
  shares: Map<string, number>,
  perf: Map<string, { returns?: number[] }>
): number {
  const series: { k: string; w: number; r: number[] }[] = [];
  let minLen = Infinity;
  for (const k of keys) {
    const r = perf.get(k)?.returns;
    if (r && r.length >= 20) {
      series.push({ k, w: shares.get(k) ?? 0, r });
      minLen = Math.min(minLen, r.length);
    }
  }
  if (series.length === 0 || !isFinite(minLen)) return 0;
  // Renormalize the INCLUDED weights to sum 1 so portVol is the vol of the fully-invested
  // measured sub-portfolio. Without this, sleeves lacking ≥20d history are dropped from the
  // variance sum while the survivors keep their small shares → vol understated → over-leverage.
  const wSum = series.reduce((a, s) => a + s.w, 0);
  if (wSum > 0) for (const s of series) s.w /= wSum;
  // Align to the common trailing length.
  for (const s of series) s.r = s.r.slice(s.r.length - minLen);
  const means = series.map((s) => s.r.reduce((a, b) => a + b, 0) / minLen);
  let varDaily = 0;
  for (let i = 0; i < series.length; i++) {
    for (let j = 0; j < series.length; j++) {
      let cov = 0;
      for (let t = 0; t < minLen; t++) cov += (series[i].r[t] - means[i]) * (series[j].r[t] - means[j]);
      cov /= minLen - 1;
      varDaily += series[i].w * series[j].w * cov;
    }
  }
  if (varDaily <= 0) return 0;
  return Math.sqrt(varDaily) * Math.sqrt(252);
}

function round4(x: number): number {
  return Math.round(x * 10000) / 10000;
}
