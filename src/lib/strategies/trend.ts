/**
 * Time-Series Trend / Multi-Asset Dual Momentum.
 *
 * Mechanism: time-series momentum (Moskowitz-Ooi-Pedersen 2012) — an asset's own past
 * 12-month return predicts its next-month return across equities, bonds, commodities,
 * REITs. Holding only assets in confirmed uptrends sidesteps the worst of equity bear
 * markets ("crisis alpha"): when stocks trend down, capital sits in cash (or trending
 * bonds/gold), which is exactly the orthogonality the put-selling book lacks.
 *
 * Rule: hold each ETF only when BOTH (a) its 12m total return > 0 AND (b) price > 200d
 * SMA. Equal-weight the survivors; the rest stays in cash. Monthly rebalance.
 */
import type { Strategy, StrategyContext, StrategySignal } from "./types";
import { totalReturn, sma } from "./indicators";
import { TREND_ETFS } from "./universe";

export const timeSeriesTrend: Strategy = {
  key: "ts_trend",
  name: "Time-Series Trend (multi-asset dual momentum)",
  family: "trend",
  description:
    "Hold each asset-class ETF only when its 12m return > 0 AND price > 200d SMA; equal-weight survivors, rest in cash. Defensive in downtrends.",
  rebalanceDays: 21,
  warmupBars: 260,
  longOnly: true,
  instrument: "etf",
  generate(ctx: StrategyContext): StrategySignal {
    const eligible = TREND_ETFS.filter((s) => ctx.universe.includes(s)).filter((s) => {
      const c = ctx.closes(s);
      const tr = totalReturn(c, 252);
      const sm = sma(c, 200);
      return tr != null && tr > 0 && sm != null && c[c.length - 1] > sm;
    });
    if (eligible.length === 0) {
      return { weights: [], confidence: 0.3, notes: "All assets in downtrend — hold cash" };
    }
    const w = (1 / eligible.length) * 0.98;
    return {
      weights: eligible.map((s) => ({ symbol: s, weight: w, reason: "12m+ & >200d" })),
      confidence: 0.55,
      notes: `Holding ${eligible.length} trending assets`,
    };
  },
};
