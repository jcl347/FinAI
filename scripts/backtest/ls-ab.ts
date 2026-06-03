/**
 * A/B: long-only projection vs genuine long/short book (review CRITICAL #1).
 * The meta is one strategy; the only difference is whether the engine clamps net-negative blended
 * weights (longOnly) or trades them as real shorts (charging borrow). Measures both honestly so the
 * production choice (PRODUCTION_LONG_ONLY) is data-driven, not assumed.
 *
 *   node --use-system-ca --no-warnings --import ./scripts/register-ts.mjs scripts/backtest/ls-ab.ts
 */
import { ALL_BACKTEST_SYMBOLS } from "../../src/lib/strategies/universe";
import { PRODUCTION_SLEEVES, buildProductionMeta } from "../../src/lib/strategies/production";
import { buildAligned } from "../../src/lib/backtest/align";
import { runBacktest } from "../../src/lib/backtest/engine";
import { computeMetrics, capmStats, type EquityPoint } from "../../src/lib/backtest/metrics";
import { buildCurvePerfProvider } from "../../src/lib/daily/perf";
import { loadUniverse } from "./data";

function spyCurve(data: ReturnType<typeof buildAligned>): EquityPoint[] {
  const a = data.bars.get("SPY")!; const out: EquityPoint[] = []; let e = 100000; let prev: number | null = null;
  for (let i = 0; i < data.calendar.length; i++) { const b = a[i]; if (b) { if (prev != null && prev > 0) e *= b.close / prev; prev = b.close; } out.push({ date: data.calendar[i], equity: e }); }
  return out;
}
const sub = (c: EquityPoint[], from: string, to: string) => c.filter((p) => p.date >= from && p.date <= to);
function row(name: string, c: EquityPoint[], bench: EquityPoint[]) {
  if (c.length < 30) return console.log(name.padEnd(28), "(few days)");
  const m = computeMetrics(c), capm = capmStats(c, bench);
  console.log(name.padEnd(28), `Sh ${String(m.sharpe).padStart(5)}  MaxDD ${String(m.maxDrawdownPct).padStart(5)}%  Calmar ${String(m.calmar).padStart(5)}  netβ ${String(capm.netOfBetaSharpe).padStart(5)}`);
}

async function main() {
  const series = await loadUniverse(ALL_BACKTEST_SYMBOLS, 11);
  const data = buildAligned(series, { vixSymbol: "^VIX", vix9dSymbol: "^VIX9D" });
  const bench = spyCurve(data);
  const cpp = buildCurvePerfProvider(PRODUCTION_SLEEVES, data, 126);

  for (const [label, longOnly, maxGross] of [["LONG-ONLY (maxGross 1.0)", true, 1.0], ["GENUINE L/S (maxGross 1.6)", false, 1.6]] as const) {
    const meta = buildProductionMeta(cpp.provider, longOnly);
    const curve = runBacktest(meta, data, { initialCapital: 100000, maxGross }).equityCurve;
    console.log(`\n### ${label}`);
    row("  full 2015-2026", curve, bench);
    row("  OUT-OF-SAMPLE >2021-06", sub(curve, "2021-07-01", "2099"), sub(bench, "2021-07-01", "2099"));
  }
  console.log("");
  row("SPY full", bench, bench);
}
main().catch((e) => { console.error(e); process.exit(1); });
