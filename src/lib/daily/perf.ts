/**
 * Live performance provider for the meta-allocator.
 *
 * "Is each sleeve working lately?" is answered by running each sleeve's own walk-forward
 * backtest over the available history (which ends today) and reading the trailing window of
 * its realized equity. This is exactly the signal the offline meta-backtest uses, so the
 * live adaptive allocation matches the backtest with no extra state to drift.
 */
import type { Strategy } from "../strategies/types";
import { runBacktest, type AlignedData } from "../backtest/engine";
import type { EquityPoint } from "../backtest/metrics";
import { trailingStatsFromEquity, type StrategyPerfStat } from "../strategies/allocator";
import type { PerfProvider } from "../strategies/meta";

const NOTIONAL = 100000; // scale-invariant; only returns matter for the perf signal

export interface CurvePerfProvider {
  provider: PerfProvider;
  curves: Map<string, EquityPoint[]>;
}

/**
 * Precompute each sleeve's standalone equity curve, then expose a PerfProvider that returns
 * trailing Sharpe/vol/returns over `windowDays` as of any date ≤ today.
 */
export function buildCurvePerfProvider(
  strategies: Strategy[],
  data: AlignedData,
  windowDays = 126
): CurvePerfProvider {
  const curves = new Map<string, EquityPoint[]>();
  for (const s of strategies) {
    curves.set(s.key, runBacktest(s, data, { initialCapital: NOTIONAL }).equityCurve);
  }

  const idx = new Map<string, { dates: string[]; eq: number[]; map: Map<string, number> }>();
  for (const [k, curve] of curves) {
    const dates = curve.map((p) => p.date);
    const eq = curve.map((p) => p.equity);
    idx.set(k, { dates, eq, map: new Map(dates.map((d, i) => [d, i])) });
  }

  const provider: PerfProvider = (key, asOfDate) => {
    const c = idx.get(key);
    if (!c) return { sharpe: 0, vol: 0.15, n: 0 };
    let i = c.map.get(asOfDate);
    if (i === undefined) {
      let lo = 0;
      let hi = c.dates.length - 1;
      let best = -1;
      while (lo <= hi) {
        const mid = (lo + hi) >> 1;
        if (c.dates[mid] <= asOfDate) {
          best = mid;
          lo = mid + 1;
        } else hi = mid - 1;
      }
      i = best;
    }
    if (i === undefined || i < 5) return { sharpe: 0, vol: 0.15, n: 0 };
    const start = Math.max(0, i - windowDays);
    const slice = c.eq.slice(start, i + 1);
    const stats = trailingStatsFromEquity(slice);
    const returns: number[] = [];
    for (let t = 1; t < slice.length; t++) if (slice[t - 1] > 0) returns.push(slice[t] / slice[t - 1] - 1);
    return { sharpe: stats.sharpe, vol: stats.vol, n: stats.n, returns };
  };

  return { provider, curves };
}

/** Convenience: per-sleeve trailing stat rows (for the UI / audit log) as of a date. */
export function perfStatRows(
  strategies: Strategy[],
  cpp: CurvePerfProvider,
  asOfDate: string,
  priors: Record<string, number>
): StrategyPerfStat[] {
  return strategies.map((s) => {
    const t = cpp.provider(s.key, asOfDate);
    return {
      key: s.key,
      family: s.family,
      trailingSharpe: t.sharpe,
      trailingVol: t.vol,
      priorSharpe: priors[s.key] ?? 0,
      confidence: 0.5,
      sampleDays: t.n,
    };
  });
}
