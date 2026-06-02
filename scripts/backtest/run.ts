/**
 * Multi-strategy walk-forward backtest runner (UNBIASED).
 *
 *   node --use-system-ca --no-warnings --import ./scripts/register-ts.mjs scripts/backtest/run.ts
 *
 * Loads real ~11y daily data for the full universe, runs every registered strategy plus a
 * SPY buy-&-hold benchmark through the no-look-ahead engine with the conservative cost
 * model, and prints a comparison table. Results (metrics + weekly equity curves + sample
 * trades) are written to research/backtests/ for the research record and the UI.
 *
 * Discipline: standard literature parameters are used (no in-sample tuning on this data),
 * and EVERY strategy's result is reported — winners and losers alike.
 */
import { writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { Strategy } from "../../src/lib/strategies/types";
import { STRATEGIES } from "../../src/lib/strategies/registry";
import { ALL_BACKTEST_SYMBOLS } from "../../src/lib/strategies/universe";
import { runBacktest, type BacktestResult } from "../../src/lib/backtest/engine";
import { curveCorrelation, capmStats } from "../../src/lib/backtest/metrics";
import { loadUniverse, buildAligned } from "./data";

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT_DIR = join(__dirname, "..", "..", "research", "backtests");
const INITIAL_CAPITAL = 100000;
const YEARS = 11;

const spyBenchmark: Strategy = {
  key: "bench_spy",
  name: "Benchmark: Buy & Hold SPY",
  family: "benchmark",
  description: "100% SPY, held.",
  rebalanceDays: 100000,
  warmupBars: 1,
  longOnly: true,
  instrument: "etf",
  generate: () => ({ weights: [{ symbol: "SPY", weight: 1.0 }] }),
};

function fmt(n: number, w = 8): string {
  return String(n).padStart(w);
}

async function main() {
  console.log(`Loading ${ALL_BACKTEST_SYMBOLS.length} symbols (~${YEARS}y daily)...`);
  const series = await loadUniverse(ALL_BACKTEST_SYMBOLS, YEARS);
  console.log(`Loaded ${series.size}/${ALL_BACKTEST_SYMBOLS.length} symbols.`);
  if (!series.has("SPY")) throw new Error("SPY required for calendar/benchmark");

  const data = buildAligned(series, { vixSymbol: "^VIX", vix9dSymbol: "^VIX9D" });
  console.log(`Calendar: ${data.calendar[0]} → ${data.calendar[data.calendar.length - 1]} (${data.calendar.length} days)\n`);

  const all: Strategy[] = [spyBenchmark, ...STRATEGIES];
  const results: BacktestResult[] = [];
  const benchCurve = runBacktest(spyBenchmark, data, { initialCapital: INITIAL_CAPITAL }).equityCurve;

  // Header
  console.log(
    [
      "strategy".padEnd(34),
      "CAGR%".padStart(7),
      "Vol%".padStart(7),
      "Sharpe".padStart(7),
      "Sortino".padStart(8),
      "MaxDD%".padStart(7),
      "Calmar".padStart(7),
      "Turn%".padStart(7),
      "ρSPY".padStart(6),
      "β".padStart(6),
      "netβSh".padStart(7),
      "Trades".padStart(7),
    ].join(" ")
  );
  console.log("-".repeat(125));

  const summary: any[] = [];
  for (const strat of all) {
    const res = runBacktest(strat, data, { initialCapital: INITIAL_CAPITAL });
    results.push(res);
    const m = res.metrics;
    const rho = strat.key === "bench_spy" ? 1.0 : curveCorrelation(res.equityCurve, benchCurve);
    const capm = strat.key === "bench_spy" ? { beta: 1, alphaAnnPct: 0, netOfBetaSharpe: 0, rfExcessSharpe: m.sharpe } : capmStats(res.equityCurve, benchCurve);
    console.log(
      [
        strat.name.slice(0, 34).padEnd(34),
        fmt(m.cagrPct, 7),
        fmt(m.annVolPct, 7),
        fmt(m.sharpe, 7),
        fmt(m.sortino, 8),
        fmt(m.maxDrawdownPct, 7),
        fmt(m.calmar, 7),
        fmt(Math.round(m.annualTurnoverPct), 7),
        fmt(rho, 6),
        fmt(capm.beta, 6),
        fmt(capm.netOfBetaSharpe, 7),
        fmt(res.trades.length, 7),
      ].join(" ")
    );
    summary.push({
      key: strat.key,
      name: strat.name,
      family: strat.family,
      metrics: m,
      correlationToSPY: rho,
      capm,
      trades: res.trades.length,
      finalHoldings: res.finalHoldings,
      // weekly-sampled equity curve for the UI / research doc
      equityCurveWeekly: res.equityCurve.filter((_, i) => i % 5 === 0),
      sampleRecentTrades: res.trades.slice(-8),
    });
  }

  mkdirSync(OUT_DIR, { recursive: true });
  writeFileSync(
    join(OUT_DIR, "summary.json"),
    JSON.stringify(
      {
        generatedAt: new Date().toISOString(),
        initialCapital: INITIAL_CAPITAL,
        period: { start: data.calendar[0], end: data.calendar[data.calendar.length - 1], days: data.calendar.length },
        universeSize: series.size,
        strategies: summary,
      },
      null,
      2
    )
  );
  console.log(`\nWrote ${join(OUT_DIR, "summary.json")}`);
  console.log("\nNote: standard literature params; no in-sample tuning. Costs are conservative (≈10bps round trip + borrow).");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
