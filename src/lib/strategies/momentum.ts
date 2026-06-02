/**
 * Cross-Sectional Momentum (12-1).
 *
 * Mechanism: the momentum premium (Jegadeesh-Titman 1993; Asness-Moskowitz-Pedersen
 * 2013) — winners over the past 12 months (skipping the most recent month to avoid
 * short-term reversal) keep outperforming for ~1-3 months. Robust across markets and
 * decades; a risk/behavioral premium, not a backtest artifact.
 *
 * Cost/regime defenses (red-team driven):
 *  - Skip the last 21 days (avoids 1-month reversal that would inflate turnover-killed edge).
 *  - Monthly rebalance (not daily) → modest turnover.
 *  - Absolute-momentum overlay: when SPY < 200d SMA, go to cash. This is the documented
 *    fix for "momentum crashes" (Daniel-Moskowitz 2016; Antonacci dual momentum) — the
 *    family's worst drawdowns cluster in bear-market rebounds.
 */
import type { Strategy, StrategyContext, StrategySignal } from "./types";
import { momentumSkip } from "./indicators";
import { isEquity } from "./universe";

export const crossSectionalMomentum: Strategy = {
  key: "xs_momentum",
  name: "Cross-Sectional Momentum (12-1)",
  family: "momentum",
  description:
    "Long the top-quintile of large caps by 12-1 month momentum; de-risk to cash when SPY is below its 200d SMA.",
  rebalanceDays: 21,
  warmupBars: 260,
  longOnly: true,
  instrument: "equity",
  generate(ctx: StrategyContext): StrategySignal {
    if (ctx.regime.spyAbove200 === false) {
      return { weights: [], confidence: 0.2, notes: "SPY<200d SMA — risk-off, hold cash" };
    }
    const scored = ctx.universe
      .filter(isEquity)
      .map((s) => ({ s, m: momentumSkip(ctx.closes(s), 252, 21) }))
      .filter((x): x is { s: string; m: number } => x.m != null);
    if (scored.length < 10) return { weights: [], confidence: 0.1 };
    scored.sort((a, b) => b.m - a.m);
    const n = Math.max(5, Math.floor(scored.length / 5)); // top quintile, min 5
    const top = scored.slice(0, n);
    const w = (1 / top.length) * 0.98; // small cash buffer
    return {
      weights: top.map((x) => ({ symbol: x.s, weight: w, reason: `12-1 mom ${(x.m * 100).toFixed(0)}%` })),
      confidence: 0.6,
      notes: `Long top ${top.length} momentum names`,
    };
  },
};
