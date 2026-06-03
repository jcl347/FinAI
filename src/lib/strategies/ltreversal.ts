/**
 * Long-Term Reversal (price-based VALUE proxy), market-neutral L/S.
 *
 * Mechanism: long-horizon mean reversion (De Bondt-Thaler 1985) — stocks that lagged over the past
 * ~3-to-1 years tend to outperform prior winners over the next year. It proxies the VALUE premium
 * from price alone (cheap = beaten-down), and value is the canonical NEGATIVE-correlation diversifier
 * to momentum (Asness-Moskowitz-Pedersen, "Value and Momentum Everywhere"). The existing book is
 * momentum-heavy, so a value-like, anti-momentum stream is exactly what raises portfolio Sharpe.
 *
 * Construction (survivorship-aware): rank by the (t-3y → t-1y) return, LONG the bottom quintile
 * (past losers), SHORT the top quintile (past winners), dollar-neutral. Quintiles (not deciles) and a
 * monthly rebalance keep it less extreme / lower-turnover and less survivorship-sensitive than a
 * decile bet. Beta is near-neutral by construction (long-short within one equity universe).
 */
import type { Strategy, StrategyContext, StrategySignal } from "./types";
import { momentumSkip } from "./indicators";
import { isEquity } from "./universe";

export const longTermReversal: Strategy = {
  key: "lt_reversal",
  name: "Long-Term Reversal / Value (market-neutral L/S)",
  family: "value",
  description:
    "Long the bottom-quintile / short the top-quintile of large caps by 3y→1y past return (De Bondt-Thaler long-term reversal = a price value proxy), dollar-neutral. Negatively correlated to momentum.",
  rebalanceDays: 21,
  warmupBars: 800,
  longOnly: false,
  instrument: "equity",
  generate(ctx: StrategyContext): StrategySignal {
    const scored: { s: string; pastRet: number }[] = [];
    for (const s of ctx.universe) {
      if (!isEquity(s)) continue;
      const c = ctx.closes(s);
      if (c.length < 780) continue;
      const pastRet = momentumSkip(c, 756, 252); // return from t-3y to t-1y
      if (pastRet != null) scored.push({ s, pastRet });
    }
    if (scored.length < 20) return { weights: [], confidence: 0.2 };
    scored.sort((a, b) => a.pastRet - b.pastRet); // ascending: biggest losers first
    const n = Math.max(3, Math.floor(scored.length / 5)); // quintile
    const longs = scored.slice(0, n); // past losers → long (reversal/value)
    const shorts = scored.slice(-n); // past winners → short
    const lw = 0.5 / longs.length;
    const sw = 0.5 / shorts.length;
    const weights = [
      ...longs.map((x) => ({ symbol: x.s, weight: lw, reason: `3y-1y ret ${(x.pastRet * 100).toFixed(0)}% (loser→long)` })),
      ...shorts.map((x) => ({ symbol: x.s, weight: -sw, reason: `3y-1y ret ${(x.pastRet * 100).toFixed(0)}% (winner→short)` })),
    ];
    return { weights, confidence: 0.5, notes: `L/S ${longs.length}×${shorts.length} long-term reversal` };
  },
};
