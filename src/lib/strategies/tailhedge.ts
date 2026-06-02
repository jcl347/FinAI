/**
 * Defensive Tail Hedge (VIX term-structure gated).
 *
 * Mechanism: the VIX term structure is normally in contango (^VIX9D < ^VIX < ^VIX3M); it
 * inverts into backwardation (^VIX9D > ^VIX) only under acute stress, and that inversion is
 * one of the fastest, cleanest risk-off signals available (faster than a 200d trend break).
 * When it fires, capital flees to long-duration Treasuries and gold (flight-to-safety),
 * which are strongly NEGATIVELY correlated with equities precisely in crashes. Held only
 * during stress → no contango carry drag in calm markets (sits in cash). The advanced fleet
 * scored the de-gross/tail-hedge idea the single most orthogonal (orth 8).
 *
 * Rule: if VIX in backwardation OR SPY<200d OR VIX≥35 → long TLT+GLD (flight to safety);
 * otherwise hold cash.
 */
import type { Strategy, StrategyContext, StrategySignal } from "./types";

export const tailHedge: Strategy = {
  key: "tail_hedge",
  name: "Defensive Tail Hedge (VIX term-structure)",
  family: "defensive",
  description:
    "Long Treasuries + gold when the VIX term structure inverts (backwardation), SPY breaks its 200d, or VIX≥35 — fast flight-to-safety, negatively correlated with equities in crashes; cash in calm (no carry drag).",
  rebalanceDays: 3,
  warmupBars: 210,
  longOnly: true,
  instrument: "etf",
  generate(ctx: StrategyContext): StrategySignal {
    const backwardation = ctx.regime.vixTermRatio != null && ctx.regime.vixTermRatio > 1.0;
    const riskOff = backwardation || ctx.regime.spyAbove200 === false || ctx.regime.regime === "CRISIS";
    if (!riskOff) {
      return { weights: [], confidence: 0.4, notes: "Calm term structure — no hedge (cash)" };
    }
    const picks = ["TLT", "GLD"].filter((s) => ctx.universe.includes(s));
    if (picks.length === 0) return { weights: [], confidence: 0.2 };
    const w = (1 / picks.length) * 0.9;
    const why = backwardation ? "VIX backwardation" : ctx.regime.regime === "CRISIS" ? "VIX≥35" : "SPY<200d";
    return {
      weights: picks.map((s) => ({ symbol: s, weight: w, reason: `flight-to-safety (${why})` })),
      confidence: 0.65,
      notes: `Risk-off hedge: long ${picks.join("+")}`,
    };
  },
};
