/**
 * Sector Momentum Rotation.
 *
 * Mechanism: relative-strength sector rotation — sector returns exhibit 3-12 month
 * persistence driven by the business cycle and slow institutional flows. Concentrating
 * in the strongest sectors captures cross-sectional momentum at the sector level with far
 * lower idiosyncratic/single-name risk than stock-level momentum.
 *
 * Rule: hold the top-3 GICS sector SPDRs by 3-month total return, equal weight; cash when
 * SPY < 200d SMA. Monthly rebalance.
 */
import type { Strategy, StrategyContext, StrategySignal } from "./types";
import { totalReturn } from "./indicators";
import { SECTOR_ETFS } from "./universe";

const TOP_N = 3;

export const sectorRotation: Strategy = {
  key: "sector_rotation",
  name: "Sector Momentum Rotation",
  family: "rotation",
  description:
    "Hold the top-3 sector SPDRs by 3-month momentum, equal weight; de-risk to cash when SPY < 200d SMA.",
  rebalanceDays: 21,
  warmupBars: 130,
  longOnly: true,
  instrument: "etf",
  generate(ctx: StrategyContext): StrategySignal {
    if (ctx.regime.spyAbove200 === false) {
      return { weights: [], confidence: 0.3, notes: "SPY<200d — risk-off cash" };
    }
    const scored = SECTOR_ETFS.filter((s) => ctx.universe.includes(s))
      .map((s) => ({ s, m: totalReturn(ctx.closes(s), 63) }))
      .filter((x): x is { s: string; m: number } => x.m != null);
    if (scored.length === 0) return { weights: [], confidence: 0.1 };
    scored.sort((a, b) => b.m - a.m);
    const top = scored.slice(0, TOP_N);
    const w = (1 / top.length) * 0.98;
    return {
      weights: top.map((x) => ({ symbol: x.s, weight: w, reason: `3m mom ${(x.m * 100).toFixed(0)}%` })),
      confidence: 0.5,
      notes: `Top ${top.length} sectors`,
    };
  },
};
