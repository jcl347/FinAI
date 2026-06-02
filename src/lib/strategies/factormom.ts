/**
 * Factor-ETF Momentum Rotation.
 *
 * Mechanism: factor momentum (Gupta-Kelly 2019, "Factor Momentum Everywhere") — factor
 * returns are themselves autocorrelated, so the factors that led recently tend to keep
 * leading for ~6-12 months. Rotating among low-cost factor ETFs (momentum, quality, min-vol,
 * value, size, growth) by their own trailing return captures this with very low turnover
 * (factor leadership is persistent) and a return stream tilted away from plain market beta.
 * Requires the factor ETFs added to the universe (MTUM/QUAL/USMV/VLUE/SIZE/IWF/IWD).
 *
 * Rule: hold the top-2 factor ETFs by 6-month total return, equal weight; cash when SPY<200d.
 */
import type { Strategy, StrategyContext, StrategySignal } from "./types";
import { totalReturn } from "./indicators";
import { FACTOR_ETFS } from "./universe";

const TOP_N = 2;

export const factorMomentum: Strategy = {
  key: "factor_momentum",
  name: "Factor-ETF Momentum Rotation",
  family: "rotation",
  description:
    "Hold the top-2 factor ETFs (momentum/quality/min-vol/value/size/growth) by 6-month momentum, equal weight; cash when SPY<200d. Captures persistent factor leadership at low turnover.",
  rebalanceDays: 21,
  warmupBars: 150,
  longOnly: true,
  instrument: "etf",
  generate(ctx: StrategyContext): StrategySignal {
    if (ctx.regime.spyAbove200 === false) {
      return { weights: [], confidence: 0.3, notes: "SPY<200d — risk-off cash" };
    }
    const scored = FACTOR_ETFS.filter((s) => ctx.universe.includes(s))
      .map((s) => ({ s, m: totalReturn(ctx.closes(s), 126) }))
      .filter((x): x is { s: string; m: number } => x.m != null);
    if (scored.length === 0) return { weights: [], confidence: 0.1 };
    scored.sort((a, b) => b.m - a.m);
    const top = scored.slice(0, TOP_N);
    const w = (1 / top.length) * 0.98;
    return {
      weights: top.map((x) => ({ symbol: x.s, weight: w, reason: `6m factor mom ${(x.m * 100).toFixed(0)}%` })),
      confidence: 0.5,
      notes: `Top ${top.length} factors`,
    };
  },
};
