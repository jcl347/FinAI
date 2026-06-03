/**
 * Out-of-sample / walk-forward validation of the POSITION-LEVEL combined book.
 *
 *   node --use-system-ca --no-warnings --import ./scripts/register-ts.mjs scripts/backtest/validate.ts
 *
 * The honest combination: one shared-capital engine run of the production meta (all sleeves incl. the
 * residual-momentum L/S, which the engine trades with real shorts + borrow). We then split the SAME
 * equity curve into in-sample vs out-of-sample sub-periods and per-year, so overfitting is exposed:
 * if OOS Sharpe << IS Sharpe, the headline number is not trustworthy. We also report SPY per window.
 *
 * This is the harness Fleet C uses to judge whether any Sharpe-2 attempt survives out of sample.
 */
import { ALL_BACKTEST_SYMBOLS } from "../../src/lib/strategies/universe";
import { PRODUCTION_SLEEVES, buildProductionMeta } from "../../src/lib/strategies/production";
import { buildAligned } from "../../src/lib/backtest/align";
import { runBacktest } from "../../src/lib/backtest/engine";
import { computeMetrics, capmStats, type EquityPoint } from "../../src/lib/backtest/metrics";
import { buildCurvePerfProvider } from "../../src/lib/daily/perf";
import { loadUniverse } from "./data";

function spyCurve(data: ReturnType<typeof buildAligned>): EquityPoint[] {
  const a = data.bars.get("SPY")!;
  const out: EquityPoint[] = [];
  let e = 100000;
  let prev: number | null = null;
  for (let i = 0; i < data.calendar.length; i++) {
    const b = a[i];
    if (b) { if (prev != null && prev > 0) e *= b.close / prev; prev = b.close; }
    out.push({ date: data.calendar[i], equity: e });
  }
  return out;
}

function sub(curve: EquityPoint[], from: string, to: string): EquityPoint[] {
  return curve.filter((p) => p.date >= from && p.date <= to);
}

function row(name: string, curve: EquityPoint[], bench?: EquityPoint[]) {
  if (curve.length < 30) { console.log(name.padEnd(26), "(too few days)"); return; }
  const m = computeMetrics(curve);
  const capm = bench ? capmStats(curve, bench) : null;
  console.log(
    [name.padEnd(26), `${m.cagrPct}%`.padStart(8), `${m.annVolPct}%`.padStart(7), String(m.sharpe).padStart(7),
     `${m.maxDrawdownPct}%`.padStart(7), String(m.calmar).padStart(7), capm ? String(capm.netOfBetaSharpe).padStart(7) : "—".padStart(7)].join(" ")
  );
}

async function main() {
  const series = await loadUniverse(ALL_BACKTEST_SYMBOLS, 11);
  const data = buildAligned(series, { vixSymbol: "^VIX", vix9dSymbol: "^VIX9D" });
  console.log(`Calendar: ${data.calendar[0]} → ${data.calendar[data.calendar.length - 1]}\n`);

  const cpp = buildCurvePerfProvider(PRODUCTION_SLEEVES, data, 126);
  const meta = buildProductionMeta(cpp.provider);
  const curve = runBacktest(meta, data, { initialCapital: 100000 }).equityCurve;
  const bench = spyCurve(data);

  const SPLIT = "2021-06-30"; // ~60/40 in-sample / out-of-sample
  console.log("POSITION-LEVEL combined book (production meta, all sleeves, shared capital, real shorts+borrow):\n");
  console.log(["window".padEnd(26), "CAGR".padStart(8), "Vol".padStart(7), "Sharpe".padStart(7), "MaxDD".padStart(7), "Calmar".padStart(7), "net-β".padStart(7)].join(" "));
  console.log("-".repeat(78));
  row("ARMS full 2015-2026", curve, bench);
  row("  in-sample ≤2021-06", sub(curve, "2000", SPLIT), sub(bench, "2000", SPLIT));
  row("  OUT-OF-SAMPLE >2021-06", sub(curve, "2021-07-01", "2099"), sub(bench, "2021-07-01", "2099"));
  console.log("");
  row("SPY full", bench);
  row("  SPY in-sample", sub(bench, "2000", SPLIT));
  row("  SPY out-of-sample", sub(bench, "2021-07-01", "2099"));

  console.log("\nPer-calendar-year Sharpe (overfitting / regime check):");
  const years = Array.from(new Set(curve.map((p) => p.date.slice(0, 4)))).sort();
  for (const y of years) {
    const yc = sub(curve, `${y}-01-01`, `${y}-12-31`);
    const yb = sub(bench, `${y}-01-01`, `${y}-12-31`);
    if (yc.length < 60) continue;
    const m = computeMetrics(yc);
    const mb = computeMetrics(yb);
    console.log(`  ${y}  ARMS Sharpe ${String(m.sharpe).padStart(6)}  ret ${String(m.totalReturnPct).padStart(7)}%   | SPY ${String(mb.sharpe).padStart(6)} ret ${String(mb.totalReturnPct).padStart(7)}%`);
  }
  console.log("\nHonest read: if OUT-OF-SAMPLE Sharpe is materially below in-sample, the headline is overfit.");
}

main().catch((e) => { console.error(e); process.exit(1); });
