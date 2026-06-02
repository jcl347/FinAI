/**
 * Cross-Asset Trend (vol-scaled, NON-equity) — the orthogonal crisis-alpha sleeve.
 *
 * Mechanism: time-series momentum (Moskowitz-Ooi-Pedersen 2012; Hurst-Ooi-Pedersen "A
 * Century of Evidence on Trend-Following") across NON-(US-large-cap-equity) assets — long
 * Treasuries, gold, silver, broad commodities, oil, the US dollar, REITs, intl equity —
 * each held only when trending up, inverse-vol weighted. This is the one sleeve whose
 * return stream is *structurally* decorrelated from the long-only/short-vol equity book:
 * in equity selloffs capital trends into bonds/gold/dollar (positive skew / "crisis alpha"),
 * exactly when the put-selling book bleeds. The advanced fleet scored this the most
 * genuinely orthogonal addition (data 9).
 *
 * Rule: among the cross-asset ETFs, hold each with positive 12m return AND price>200d SMA,
 * weighted by 1/realized-vol (equal risk contribution), normalized to gross 1.0; cash if none trend.
 */
import type { Strategy, StrategyContext, StrategySignal } from "./types";
import { totalReturn, sma, annualizedVol } from "./indicators";
import { CROSS_ASSET_ETFS } from "./universe";

export const crossAssetTrend: Strategy = {
  key: "cross_asset_trend",
  name: "Cross-Asset Trend (vol-scaled, non-equity)",
  family: "trend",
  description:
    "Managed-futures-style trend across bonds, gold, silver, commodities, oil, the dollar, REITs and intl equity — long only what is trending up, inverse-vol weighted. Positive-skew crisis-alpha, structurally decorrelated from the equity/short-vol book.",
  rebalanceDays: 21,
  warmupBars: 260,
  longOnly: true,
  instrument: "etf",
  generate(ctx: StrategyContext): StrategySignal {
    const active: { s: string; invVol: number; tr: number }[] = [];
    for (const s of CROSS_ASSET_ETFS) {
      if (!ctx.universe.includes(s)) continue;
      const c = ctx.closes(s);
      const tr = totalReturn(c, 252);
      const sm = sma(c, 200);
      if (tr != null && tr > 0 && sm != null && c[c.length - 1] > sm) {
        const vol = annualizedVol(c, 60) || 0.15;
        active.push({ s, invVol: 1 / Math.max(0.04, vol), tr });
      }
    }
    if (active.length === 0) {
      return { weights: [], confidence: 0.3, notes: "No cross-asset uptrends — hold cash" };
    }
    const sumInv = active.reduce((a, x) => a + x.invVol, 0);
    const weights = active.map((x) => ({
      symbol: x.s,
      weight: (x.invVol / sumInv) * 0.98,
      reason: `trend +${(x.tr * 100).toFixed(0)}% (vol-scaled)`,
    }));
    return { weights, confidence: 0.55, notes: `${active.length} non-equity trends` };
  },
};
