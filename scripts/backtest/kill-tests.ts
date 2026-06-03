/**
 * Kill-tests for the surviving expanded-universe sleeves (Phase-C red-team follow-up).
 * Two adversarial probes the red-team asks for:
 *   1. PER-CALENDAR-YEAR Sharpe — is the OOS edge ONE regime/episode, or repeatable?
 *   2. HEAVY-COST re-run (3x frictions, 2x borrow; extra-wide for crypto) — does the edge survive realistic costs?
 *
 *   node --use-system-ca --no-warnings --import ./scripts/register-ts.mjs scripts/backtest/kill-tests.ts
 */
import { loadUniverse, buildAligned } from "./data.ts";
import { runBacktest, type AlignedData } from "../../src/lib/backtest/engine.ts";
import { computeMetrics, capmStats, type EquityPoint } from "../../src/lib/backtest/metrics.ts";
import { DEFAULT_COSTS, type CostModel } from "../../src/lib/backtest/costs.ts";
import type { Strategy } from "../../src/lib/strategies/types.ts";
import { ALL_BACKTEST_SYMBOLS } from "../../src/lib/strategies/universe.ts";
import { cryptoTrend, cryptoXsMomLs } from "../../src/lib/strategies/crypto.ts";
import { commodityTrend, intlRotation } from "../../src/lib/strategies/newtrend.ts";
import { sectorNeutralResidMom } from "../../src/lib/strategies/equityls.ts";
import { xassetCarry } from "../../src/lib/strategies/carry.ts";

const HEAVY: CostModel = { spreadBpsPerSide: 9, slippageBpsPerSide: 6, commissionPerTrade: 0, shortBorrowAnnualBps: 300, optionCommissionPerContract: 0.65 };
const CRYPTO_HEAVY: CostModel = { spreadBpsPerSide: 25, slippageBpsPerSide: 15, commissionPerTrade: 0, shortBorrowAnnualBps: 800, optionCommissionPerContract: 0.65 };

const CANDIDATES: { strat: Strategy; maxGross: number; heavy: CostModel }[] = [
  { strat: commodityTrend, maxGross: 1.0, heavy: HEAVY },
  { strat: cryptoTrend, maxGross: 0.5, heavy: CRYPTO_HEAVY },
  { strat: sectorNeutralResidMom, maxGross: 1.6, heavy: HEAVY },
  { strat: cryptoXsMomLs, maxGross: 1.6, heavy: CRYPTO_HEAVY },
  { strat: xassetCarry, maxGross: 1.5, heavy: HEAVY },
  { strat: intlRotation, maxGross: 1.0, heavy: HEAVY },
];

function yearSharpe(curve: EquityPoint[]): Record<string, number> {
  const byYear = new Map<string, number[]>();
  for (let i = 1; i < curve.length; i++) {
    const y = curve[i].date.slice(0, 4);
    const prev = curve[i - 1].equity;
    if (prev > 0) (byYear.get(y) ?? byYear.set(y, []).get(y)!).push(curve[i].equity / prev - 1);
  }
  const out: Record<string, number> = {};
  for (const [y, r] of byYear) {
    const m = r.reduce((a, b) => a + b, 0) / r.length;
    const sd = Math.sqrt(r.reduce((a, b) => a + (b - m) ** 2, 0) / Math.max(1, r.length - 1));
    out[y] = sd > 0 ? Math.round((m * 252) / (sd * Math.sqrt(252)) * 100) / 100 : 0;
  }
  return out;
}

async function main() {
  const series = await loadUniverse(ALL_BACKTEST_SYMBOLS, 11, 12);
  const data: AlignedData = buildAligned(series, { calendarSymbol: "SPY", vixSymbol: "^VIX", vix9dSymbol: "^VIX9D" });
  for (const { strat, maxGross, heavy } of CANDIDATES) {
    const base = runBacktest(strat, data, { initialCapital: 100000, costs: DEFAULT_COSTS, rfAnnual: 0.02, maxGross });
    const hv = runBacktest(strat, data, { initialCapital: 100000, costs: heavy, rfAnnual: 0.02, maxGross });
    const m = computeMetrics(base.equityCurve, { rfAnnual: 0.02 });
    const mh = computeMetrics(hv.equityCurve, { rfAnnual: 0.02 });
    console.log(`\n### ${strat.key}`);
    console.log(`  base Sharpe ${m.sharpe}  | HEAVY-cost Sharpe ${mh.sharpe}  (Δ ${(mh.sharpe - m.sharpe).toFixed(2)})`);
    const ys = yearSharpe(base.equityCurve);
    console.log(`  per-year Sharpe: ${Object.entries(ys).map(([y, s]) => `${y}:${s}`).join("  ")}`);
  }
}
main().catch((e) => { console.error(e); process.exit(1); });
