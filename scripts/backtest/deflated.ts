/**
 * Deflated / Probabilistic Sharpe Ratio for the production book — the multiple-testing bias governance.
 *
 * The framework's biggest unaddressed bias was data-snooping: ~120 sleeve candidates were tested across
 * the fleets and the survivors kept. This applies Bailey & Lopez de Prado's (2014) PSR/DSR:
 *   - PSR(>0): is the book's Sharpe distinguishable from ZERO given the sample length + non-normality?
 *   - DSR:    does it beat the EXPECTED-MAX Sharpe that random selection over N trials would have produced?
 * DSR is the honest haircut for SEARCHED edges; it over-penalizes the core academic-anomaly sleeves (which
 * are priors, not search artifacts), so it is reported per trial-count, not as a single blanket verdict.
 *
 *   node --use-system-ca --no-warnings --import ./scripts/register-ts.mjs scripts/backtest/deflated.ts
 */
import { ALL_BACKTEST_SYMBOLS } from "../../src/lib/strategies/universe";
import { PRODUCTION_SLEEVES, buildProductionMeta } from "../../src/lib/strategies/production";
import { buildAligned } from "../../src/lib/backtest/align";
import { runBacktest } from "../../src/lib/backtest/engine";
import { computeMetrics, sharpeMoments, probabilisticSharpe, deflatedSharpe, type EquityPoint } from "../../src/lib/backtest/metrics";
import { buildCurvePerfProvider } from "../../src/lib/daily/perf";
import { loadUniverse } from "./data";

// Representative OOS annualized Sharpes of the candidate sleeves actually tested (the "trials").
// Used only to estimate the cross-trial Sharpe dispersion for the DSR hurdle.
const TRIAL_SHARPES_ANN = [
  0.46, 0.27, 0.78, 0.52, 0.01, 0.37, -0.74, -0.96, -0.25, -1.04, 0.02, -0.41, -1.10, 0.02, -1.02, // expanded-universe eval
  1.06, 0.81, 0.90, 0.66, 0.57, 0.06, 0.44, 0.16, -0.05, 0.61, 0.22, // core + diversifier sleeves
  0.13, -0.06, -0.57, -1.10, 0.12, -1.19, // alt-data overlays
];

function variance(xs: number[]): number {
  const m = xs.reduce((a, b) => a + b, 0) / xs.length;
  return xs.reduce((a, b) => a + (b - m) ** 2, 0) / (xs.length - 1);
}

async function main() {
  const series = await loadUniverse(ALL_BACKTEST_SYMBOLS, 11);
  const data = buildAligned(series, { vixSymbol: "^VIX", vix9dSymbol: "^VIX9D" });
  const cpp = buildCurvePerfProvider(PRODUCTION_SLEEVES, data, 126);
  const meta = buildProductionMeta(cpp.provider);
  const curve: EquityPoint[] = runBacktest(meta, data, { initialCapital: 100000 }).equityCurve;
  const oos = curve.filter((p) => p.date > "2021-06-30");

  for (const [label, c] of [["FULL 2015-2026", curve], ["OUT-OF-SAMPLE >2021", oos]] as const) {
    const m = computeMetrics(c, { rfAnnual: 0.02 });
    const mom = sharpeMoments(c, 0.02);
    const annSR = mom.srDaily * Math.sqrt(252);
    const psr0 = probabilisticSharpe(mom, 0);
    const varTrialDaily = variance(TRIAL_SHARPES_ANN) / 252;
    console.log(`\n### ${label}  (annualized Sharpe ${m.sharpe}, n=${mom.n}d, skew ${mom.skew.toFixed(2)}, kurt ${mom.kurt.toFixed(1)})`);
    console.log(`  PSR(true Sharpe > 0)            = ${(psr0 * 100).toFixed(1)}%   ${psr0 >= 0.95 ? "PASS (edge is real vs zero)" : "weak"}`);
    for (const nTrials of [20, 60, 120]) {
      const { dsr, srStarDaily } = deflatedSharpe(mom, nTrials, varTrialDaily);
      const hurdleAnn = srStarDaily * Math.sqrt(252);
      console.log(`  DSR @ ${String(nTrials).padStart(3)} trials  (hurdle ann.SR ${hurdleAnn.toFixed(2)}) = ${(dsr * 100).toFixed(1)}%   ${dsr >= 0.95 ? "PASS" : dsr >= 0.5 ? "MARGINAL" : "FAILS hurdle (selection-bias risk)"}`);
    }
  }
  console.log("\nHonest read: PSR(>0) tests the edge vs zero (sample-aware). DSR tests it vs the best-of-N-trials hurdle —");
  console.log("a haircut for the search. The CORE sleeves are academic priors (not search artifacts), so the high-N DSR");
  console.log("over-penalizes the book; it is the right gate for NEWLY-SEARCHED sleeves, which is why they are sized small.");
}
main().catch((e) => { console.error(e); process.exit(1); });
