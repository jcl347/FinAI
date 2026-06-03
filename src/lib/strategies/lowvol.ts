/**
 * Low-Volatility Defensive.
 *
 * Mechanism: the low-volatility anomaly (Baker-Bradley-Wurgler 2011; Frazzini-Pedersen
 * "betting against beta" 2014) — low-risk stocks earn higher risk-adjusted returns than
 * CAPM predicts, because leverage-constrained investors bid up high-beta names. Pairs
 * naturally with PutStrike: put-selling wants stable underlyings, and a low-vol equity
 * sleeve is the cash-equity expression of the same preference, with shallower drawdowns.
 *
 * Rule: long the lowest-realized-vol quintile of the equity universe; cash when SPY<200d.
 */
import type { Strategy, StrategyContext, StrategySignal } from "./types";
import { annualizedVol } from "./indicators";
import { liquidEquities } from "./screens";

export const lowVolatility: Strategy = {
  key: "low_vol",
  name: "Low-Volatility Defensive",
  family: "defensive",
  description:
    "Long the lowest-90d-realized-vol quintile of large caps (low-vol / betting-against-beta anomaly); de-risk to cash when SPY < 200d.",
  rebalanceDays: 21,
  warmupBars: 140,
  longOnly: true,
  instrument: "equity",
  generate(ctx: StrategyContext): StrategySignal {
    if (ctx.regime.spyAbove200 === false) {
      return { weights: [], confidence: 0.3, notes: "SPY<200d — risk-off cash" };
    }
    const scored = liquidEquities(ctx, 200)
      .map((s) => ({ s, v: annualizedVol(ctx.closes(s), 90) }))
      .filter((x) => x.v > 0);
    if (scored.length < 10) return { weights: [], confidence: 0.1 };
    scored.sort((a, b) => a.v - b.v); // lowest vol first
    const n = Math.max(5, Math.floor(scored.length / 5));
    const top = scored.slice(0, n);
    const w = (1 / top.length) * 0.98;
    return {
      weights: top.map((x) => ({ symbol: x.s, weight: w, reason: `vol ${(x.v * 100).toFixed(0)}%` })),
      confidence: 0.5,
      notes: `Long ${top.length} lowest-vol names`,
    };
  },
};
