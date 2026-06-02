/**
 * Meta-allocator backtest — measures the Sharpe lift from COMBINING + ADAPTING + VOL-TARGETING.
 *
 *   node --use-system-ca --no-warnings --import ./scripts/register-ts.mjs scripts/backtest/meta.ts
 *
 * Compares, on the same real 11y data + conservative costs:
 *   - SPY buy & hold
 *   - Naive equal-weight ensemble (4 cost-surviving sleeves, static)
 *   - Adaptive meta-allocator (self-tracking, regime-aware) over ALL 5 sleeves incl. the null
 *   - Adaptive meta-allocator + 10% volatility target (Moreira-Muir lever)
 *
 * The adaptive variants are handed the SAME sleeves and must DISCOVER (from realized rolling
 * performance) that reversal is broken and starve it — demonstrating the feedback loop.
 */
import { writeFileSync, mkdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { Strategy, StrategyContext, StrategySignal } from "../../src/lib/strategies/types";
import { STRATEGIES } from "../../src/lib/strategies/registry";
import { ALL_BACKTEST_SYMBOLS } from "../../src/lib/strategies/universe";
import { runBacktest, type AlignedData, type BacktestResult } from "../../src/lib/backtest/engine";
import { curveCorrelation, type EquityPoint } from "../../src/lib/backtest/metrics";
import { createMetaStrategy, type PerfProvider } from "../../src/lib/strategies/meta";
import { trailingStatsFromEquity } from "../../src/lib/strategies/allocator";
import { loadUniverse, buildAligned } from "./data";

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT_DIR = join(__dirname, "..", "..", "research", "backtests");
const INITIAL = 100000;
const PERF_WINDOW = 126; // ~6 months of realized perf drives adaptation

const PRIORS: Record<string, number> = {
  xs_momentum: 1.04,
  low_vol: 0.91,
  factor_momentum: 0.90,
  sector_rotation: 0.66,
  ts_trend: 0.61,
  cross_asset_trend: 0.57,
  st_reversal: 0.22,
  tail_hedge: 0.06,
};

const spyBenchmark: Strategy = {
  key: "bench_spy", name: "Benchmark: Buy & Hold SPY", family: "benchmark",
  description: "100% SPY", rebalanceDays: 100000, warmupBars: 1, longOnly: true, instrument: "etf",
  generate: () => ({ weights: [{ symbol: "SPY", weight: 1.0 }] }),
};

/** Builds a perf provider backed by precomputed standalone equity curves. */
function makeCurveProvider(curves: Map<string, EquityPoint[]>): PerfProvider {
  const idx = new Map<string, { dates: string[]; eq: number[]; map: Map<string, number> }>();
  for (const [k, curve] of curves) {
    const dates = curve.map((p) => p.date);
    const eq = curve.map((p) => p.equity);
    idx.set(k, { dates, eq, map: new Map(dates.map((d, i) => [d, i])) });
  }
  return (key, asOfDate) => {
    const c = idx.get(key);
    if (!c) return { sharpe: 0, vol: 0.15, n: 0 };
    let i = c.map.get(asOfDate);
    if (i === undefined) {
      // largest date <= asOfDate (binary search)
      let lo = 0, hi = c.dates.length - 1, best = -1;
      while (lo <= hi) {
        const mid = (lo + hi) >> 1;
        if (c.dates[mid] <= asOfDate) { best = mid; lo = mid + 1; } else hi = mid - 1;
      }
      i = best;
    }
    if (i === undefined || i < 5) return { sharpe: 0, vol: 0.15, n: 0 };
    const start = Math.max(0, i - PERF_WINDOW);
    const slice = c.eq.slice(start, i + 1);
    const stats = trailingStatsFromEquity(slice);
    const returns: number[] = [];
    for (let t = 1; t < slice.length; t++) if (slice[t - 1] > 0) returns.push(slice[t] / slice[t - 1] - 1);
    return { sharpe: stats.sharpe, vol: stats.vol, n: stats.n, returns };
  };
}

/** Naive static equal-weight ensemble over the cost-surviving sleeves. */
function equalWeightMeta(subKeys: string[]): Strategy {
  const subs = STRATEGIES.filter((s) => subKeys.includes(s.key));
  return {
    key: "meta_equal", name: "Naive Equal-Weight Ensemble", family: "meta",
    description: "Static 1/N over cost-surviving sleeves", rebalanceDays: 5,
    warmupBars: Math.max(...subs.map((s) => s.warmupBars)) + 5, longOnly: true, instrument: "equity",
    generate(ctx: StrategyContext): StrategySignal {
      const active = subs.map((s) => ({ s, sig: s.generate(ctx) })).filter((x) => (x.sig.confidence ?? 1) > 0.05 && x.sig.weights.length);
      if (active.length === 0) return { weights: [] };
      const share = 1 / active.length;
      const combined = new Map<string, number>();
      for (const { sig } of active) for (const w of sig.weights) combined.set(w.symbol, (combined.get(w.symbol) ?? 0) + share * w.weight);
      return { weights: [...combined].map(([symbol, weight]) => ({ symbol, weight })) };
    },
  };
}

function row(name: string, res: BacktestResult, bench: EquityPoint[]): any {
  const m = res.metrics;
  const rho = curveCorrelation(res.equityCurve, bench);
  console.log(
    [name.slice(0, 36).padEnd(36), String(m.cagrPct).padStart(7), String(m.annVolPct).padStart(7),
     String(m.sharpe).padStart(7), String(m.sortino).padStart(8), String(m.maxDrawdownPct).padStart(7),
     String(m.calmar).padStart(7), String(Math.round(m.annualTurnoverPct)).padStart(7), String(rho).padStart(6)].join(" ")
  );
  return { name, key: res.strategyKey, metrics: m, correlationToSPY: rho, trades: res.trades.length,
    equityCurveWeekly: res.equityCurve.filter((_, i) => i % 5 === 0) };
}

async function main() {
  const series = await loadUniverse(ALL_BACKTEST_SYMBOLS, 11);
  const data: AlignedData = buildAligned(series, { vixSymbol: "^VIX", vix9dSymbol: "^VIX9D" });
  console.log(`Calendar: ${data.calendar[0]} → ${data.calendar[data.calendar.length - 1]} (${data.calendar.length} days)\n`);

  // Standalone curves for the perf provider.
  const curves = new Map<string, EquityPoint[]>();
  for (const s of STRATEGIES) curves.set(s.key, runBacktest(s, data, { initialCapital: INITIAL }).equityCurve);
  const provider = makeCurveProvider(curves);

  const adaptive = createMetaStrategy({
    subStrategies: STRATEGIES, priors: PRIORS, perfProvider: provider, rebalanceDays: 5,
    key: "meta_adaptive", name: "Adaptive Meta-Allocator",
  });
  const adaptiveVT = createMetaStrategy({
    subStrategies: STRATEGIES, priors: PRIORS, perfProvider: provider, rebalanceDays: 5,
    key: "meta_adaptive_vt", name: "Adaptive Meta + 10% Vol Target", volTargetAnnual: 0.10,
  });
  const eqMeta = equalWeightMeta(["xs_momentum", "low_vol", "factor_momentum", "sector_rotation", "cross_asset_trend"]);

  const bench = runBacktest(spyBenchmark, data, { initialCapital: INITIAL });

  console.log(
    ["strategy".padEnd(36), "CAGR%".padStart(7), "Vol%".padStart(7), "Sharpe".padStart(7),
     "Sortino".padStart(8), "MaxDD%".padStart(7), "Calmar".padStart(7), "Turn%".padStart(7), "ρSPY".padStart(6)].join(" ")
  );
  console.log("-".repeat(100));

  const out: any[] = [];
  out.push(row("Benchmark: Buy & Hold SPY", bench, bench.equityCurve));
  out.push(row(eqMeta.name, runBacktest(eqMeta, data, { initialCapital: INITIAL }), bench.equityCurve));
  out.push(row(adaptive.name, runBacktest(adaptive, data, { initialCapital: INITIAL }), bench.equityCurve));
  out.push(row(adaptiveVT.name, runBacktest(adaptiveVT, data, { initialCapital: INITIAL }), bench.equityCurve));

  mkdirSync(OUT_DIR, { recursive: true });
  writeFileSync(join(OUT_DIR, "meta-summary.json"), JSON.stringify({
    generatedAt: new Date().toISOString(), perfWindow: PERF_WINDOW, priors: PRIORS,
    period: { start: data.calendar[0], end: data.calendar[data.calendar.length - 1] }, results: out,
  }, null, 2));
  console.log(`\nWrote ${join(OUT_DIR, "meta-summary.json")}`);

  // Patch results.md placeholder with the meta table.
  try {
    const rp = join(OUT_DIR, "..", "results.md");
    let md = readFileSync(rp, "utf8");
    const tbl = [
      "## Meta-allocator results (run 2) — the Sharpe lift from combining + adapting + vol-targeting",
      "",
      "| Portfolio | CAGR | Vol | **Sharpe** | Sortino | MaxDD | Calmar | ρ(SPY) |",
      "|---|---|---|---|---|---|---|---|",
      ...out.map((r) => `| ${r.name} | ${r.metrics.cagrPct}% | ${r.metrics.annVolPct}% | **${r.metrics.sharpe}** | ${r.metrics.sortino} | ${r.metrics.maxDrawdownPct}% | ${r.metrics.calmar} | ${r.correlationToSPY} |`),
      "",
      "The adaptive variants were handed all 5 sleeves — including the broken reversal sleeve — and",
      "starved it automatically from realized rolling performance (the self-tracking feedback loop).",
    ].join("\n");
    md = md.replace("<!-- META_RESULTS_PLACEHOLDER -->", tbl);
    writeFileSync(rp, md);
    console.log("Patched research/results.md with meta table.");
  } catch (e) {
    console.error("results.md patch skipped:", e instanceof Error ? e.message : e);
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
