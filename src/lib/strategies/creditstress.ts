/**
 * Credit / Real-Rate Stress-Triggered Rotation — the regime fleet's top 2022-fix candidate (fix2022=7).
 *
 * Mechanism: the 2022 stocks-and-bonds-down regime had a slow, detectable MACRO driver — widening credit
 * spreads (HYG falling) and rising real rates (TLT falling). Unlike fast price-trend (which whipsaws), a
 * credit/rate-stress trigger flips on the actual regime cause. When stress is on, rotate to the assets
 * that benefit from inflation / rising rates / risk-off (commodities, the dollar, defensive sectors) and
 * short long-duration Treasuries; when calm, sit FLAT (no carry drag). It is dormant in normal markets and
 * only fires in a credit/rate-stress regime — a targeted regime hedge, not an always-on bet.
 *
 * Honest note: the fleet graded this BUILD_AFTER_FIX (a prediction). It is tested here per-regime; if it
 * does not genuinely improve 2022 without breaking 2018/2020/bull, it is rejected (red-team discipline).
 */
import type { Strategy, StrategyContext, StrategySignal } from "./types";
import { totalReturn } from "./indicators";

export const creditStressRotation: Strategy = {
  key: "credit_stress",
  name: "Credit/Real-Rate Stress Rotation",
  family: "defensive",
  description:
    "When credit weakens (HYG down) or rates rise (TLT down), rotate long inflation/dollar/defensives (DBC/UUP/GLD/XLP/XLU) and short long-duration; flat in calm. Targets the 2022 stocks-and-bonds-down regime.",
  rebalanceDays: 5,
  warmupBars: 220,
  longOnly: false,
  instrument: "etf",
  generate(ctx: StrategyContext): StrategySignal {
    const hyg = ctx.closes("HYG");
    const tlt = ctx.closes("TLT");
    const hygRet = hyg.length > 70 ? totalReturn(hyg, 60) : null; // 60d high-yield credit return
    const tltRet = tlt.length > 70 ? totalReturn(tlt, 60) : null; // 60d long-Treasury return (rate proxy)
    const creditStress = hygRet != null && hygRet < -0.02;
    const rateStress = tltRet != null && tltRet < -0.03;
    if (!creditStress && !rateStress) {
      return { weights: [], confidence: 0.3, notes: "no credit/rate stress — flat (cash)" };
    }
    const longs = ["DBC", "UUP", "GLD", "XLP", "XLU"].filter((s) => ctx.universe.includes(s));
    if (longs.length === 0) return { weights: [], confidence: 0.2 };
    const weights = [];
    const lw = 0.8 / longs.length;
    const why = creditStress && rateStress ? "credit+rate stress" : creditStress ? "credit stress" : "rate stress";
    for (const s of longs) weights.push({ symbol: s, weight: lw, reason: `${why}: inflation/defensive` });
    if (rateStress && ctx.universe.includes("TLT")) weights.push({ symbol: "TLT", weight: -0.2, reason: "short duration (rates rising)" });
    return { weights, confidence: 0.6, notes: `${why} rotation` };
  },
};
