/**
 * Phase-B execution harness for the EXPANDED-universe sleeve search.
 *
 * Runs each candidate Strategy through the real walk-forward engine on the full expanded
 * universe, then reports — for FULL / OOS(>2021-06) / RECENT-HOLDOUT(>2023-01) windows —
 * Sharpe, MaxDD, net-of-beta Sharpe, ρ(SPY), turnover. This is the ground-truth filter the
 * scout specs must pass (ship bar: OOS-positive net-of-beta OR genuine drawdown reduction).
 *
 *   node --use-system-ca --no-warnings --import ./scripts/register-ts.mjs scripts/backtest/eval-sleeve.ts
 */
import { loadUniverse } from "./data.ts";
import { buildAligned } from "./data.ts";
import { runBacktest, type AlignedData } from "../../src/lib/backtest/engine.ts";
import { computeMetrics, capmStats, curveCorrelation, type EquityPoint } from "../../src/lib/backtest/metrics.ts";
import { DEFAULT_COSTS } from "../../src/lib/backtest/costs.ts";
import type { Strategy } from "../../src/lib/strategies/types.ts";
import { ALL_BACKTEST_SYMBOLS } from "../../src/lib/strategies/universe.ts";

// ── Candidate sleeves under evaluation (scout-fleet expanded-universe batch) ──
import { cryptoTrend, cryptoXsMomLs } from "../../src/lib/strategies/crypto.ts";
import { commodityTrend, intlRotation } from "../../src/lib/strategies/newtrend.ts";
import { bettingAgainstBeta, sectorNeutralResidMom, lowTurnResidReversal, factorMomLs } from "../../src/lib/strategies/equityls.ts";
import { curveDuration, creditCarry, xassetCarry, usdRegime } from "../../src/lib/strategies/carry.ts";
import { skewCrashFear, vvixEarlyWarning, commodityVolContagion } from "../../src/lib/strategies/altoverlay.ts";
const CANDIDATES: { strat: Strategy; maxGross: number }[] = [
  { strat: cryptoTrend, maxGross: 0.5 },
  { strat: cryptoXsMomLs, maxGross: 1.6 },
  { strat: commodityTrend, maxGross: 1.0 },
  { strat: intlRotation, maxGross: 1.0 },
  { strat: bettingAgainstBeta, maxGross: 2.0 },
  { strat: sectorNeutralResidMom, maxGross: 1.6 },
  { strat: lowTurnResidReversal, maxGross: 1.4 },
  { strat: factorMomLs, maxGross: 1.0 },
  { strat: curveDuration, maxGross: 1.0 },
  { strat: creditCarry, maxGross: 1.2 },
  { strat: xassetCarry, maxGross: 1.5 },
  { strat: usdRegime, maxGross: 1.0 },
  { strat: skewCrashFear, maxGross: 1.0 },
  { strat: vvixEarlyWarning, maxGross: 1.0 },
  { strat: commodityVolContagion, maxGross: 0.6 },
];

const OOS_CUT = "2021-06-01";
const RECENT_CUT = "2023-01-01";

function sliceCurve(curve: EquityPoint[], cutoff: string): EquityPoint[] {
  const out = curve.filter((p) => p.date > cutoff);
  if (out.length < 30) return [];
  // re-base so metrics see a clean start
  const base = out[0].equity || 1;
  return out.map((p) => ({ date: p.date, equity: (p.equity / base) * 100000 }));
}

function spyBuyHold(data: AlignedData): EquityPoint[] {
  const c = data.closes.get("SPY")!;
  const out: EquityPoint[] = [];
  let base = 0;
  for (let i = 0; i < data.calendar.length; i++) {
    const v = c[i];
    if (v == null) continue;
    if (!base) base = v;
    out.push({ date: data.calendar[i], equity: (v / base) * 100000 });
  }
  return out;
}

function row(label: string, curve: EquityPoint[], spy: EquityPoint[], turn?: number): string {
  if (curve.length < 30) return `  ${label.padEnd(8)} (insufficient window)`;
  const m = computeMetrics(curve, { rfAnnual: 0.02 });
  const capm = capmStats(curve, spy, 0.02);
  const rho = curveCorrelation(curve, spy);
  const t = turn != null ? `  turn=${turn.toFixed(0)}%` : "";
  return `  ${label.padEnd(8)} Sharpe=${m.sharpe.toFixed(2).padStart(5)}  MaxDD=${m.maxDrawdownPct.toFixed(1).padStart(5)}%  netβ=${capm.netOfBetaSharpe.toFixed(2).padStart(5)}  ρ(SPY)=${rho.toFixed(2).padStart(5)}  CAGR=${m.cagrPct.toFixed(1).padStart(5)}%${t}`;
}

async function main() {
  process.stdout.write(`Loading ${ALL_BACKTEST_SYMBOLS.length} symbols...\n`);
  const series = await loadUniverse(ALL_BACKTEST_SYMBOLS, 11, 12);
  const data = buildAligned(series, { calendarSymbol: "SPY", vixSymbol: "^VIX", vix9dSymbol: "^VIX9D" });
  const spy = spyBuyHold(data);
  const spyOOS = sliceCurve(spy, OOS_CUT);
  const spyRecent = sliceCurve(spy, RECENT_CUT);
  process.stdout.write(`Aligned ${data.calendar.length} days, ${data.calendar[0]} -> ${data.calendar[data.calendar.length - 1]}\n\n`);

  for (const { strat, maxGross } of CANDIDATES) {
    const res = runBacktest(strat, data, { initialCapital: 100000, costs: DEFAULT_COSTS, rfAnnual: 0.02, maxGross });
    console.log(`### ${strat.key} — ${strat.name}  (maxGross=${maxGross}, instr=${strat.instrument})`);
    console.log(row("FULL", res.equityCurve, spy, res.metrics.annualTurnoverPct));
    console.log(row("OOS>21", sliceCurve(res.equityCurve, OOS_CUT), spyOOS));
    console.log(row("REC>23", sliceCurve(res.equityCurve, RECENT_CUT), spyRecent));
    console.log("");
  }
}
main().catch((e) => { console.error(e); process.exit(1); });
