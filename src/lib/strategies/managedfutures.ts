/**
 * Managed-Futures / CTA Trend (full long-SHORT, multi-asset, vol-scaled) — the regime-stability /
 * "fix 2022" sleeve.
 *
 * Mechanism: time-series momentum across asset classes (Moskowitz-Ooi-Pedersen 2012; the canonical
 * "crisis alpha" / divergent strategy). Unlike the existing long-only cross_asset_trend (which can only
 * sit in CASH on a downtrend), this sleeve goes SHORT downtrending assets — so in the 2022
 * stocks-and-bonds-down regime it shorts Treasuries (TLT/IEF) and equity indices and goes long the
 * commodity/energy/dollar uptrends (DBC/USO/UUP), which is exactly why trend-following CTAs returned
 * +20-40% in 2022 while a 60/40 book fell ~17%. It is the single most direct fix for the book's 2022
 * weakness, and structurally decorrelated (positive skew) from the long-equity sleeves.
 *
 * Construction: 12-1 month time-series momentum sign per asset across a diversified ETF set (equity
 * indices, Treasuries, gold/silver, broad commodities, oil, the dollar, REITs, intl); inverse-vol
 * (equal-risk) weighted; gross normalized to ~1.0. Monthly rebalance.
 */
import type { Strategy, StrategyContext, StrategySignal } from "./types";
import { momentumSkip, annualizedVol } from "./indicators";

// Diversified, liquid asset-class ETFs (NOT single stocks) — the CTA trading set.
const CTA_ASSETS = [
  "SPY", "QQQ", "IWM", "EFA", "EEM", // equity indices (shortable in downtrends)
  "TLT", "IEF", // Treasuries (the 2022 short)
  "GLD", "SLV", "DBC", "USO", // gold, silver, broad commodities, oil (the 2022 longs)
  "UUP", // US dollar (the 2022 long)
  "VNQ", // real estate
];

export const managedFutures: Strategy = {
  key: "managed_futures",
  name: "Managed-Futures / CTA Trend (long-short, vol-scaled)",
  family: "trend",
  description:
    "12-1 time-series momentum across asset-class ETFs, LONG up-trends / SHORT down-trends, inverse-vol weighted. Shorts bonds+equities and longs commodities/dollar in stocks-and-bonds-down regimes (the 2022 fix); positive-skew crisis alpha.",
  rebalanceDays: 21,
  warmupBars: 260,
  longOnly: false,
  instrument: "etf",
  generate(ctx: StrategyContext): StrategySignal {
    const legs: { s: string; dir: number; invVol: number; mom: number }[] = [];
    for (const s of CTA_ASSETS) {
      if (!ctx.universe.includes(s)) continue;
      const c = ctx.closes(s);
      if (c.length < 260) continue;
      // Blend FAST (3m) + medium (6m) + slow (12m) trend so the sleeve flips with a fast regime
      // shift (the 2022 rate shock) instead of lagging on a pure 12m signal.
      const mom3 = momentumSkip(c, 63, 5);
      const mom6 = momentumSkip(c, 126, 10);
      const mom12 = momentumSkip(c, 252, 21);
      const blend = (mom3 ?? 0) + (mom6 ?? 0) + (mom12 ?? 0);
      if (blend === 0) continue;
      const vol = annualizedVol(c, 60) || 0.15;
      legs.push({ s, dir: Math.sign(blend), invVol: 1 / Math.max(0.04, vol), mom: mom3 ?? mom12 ?? 0 });
    }
    if (legs.length < 4) return { weights: [], confidence: 0.2 };
    const sumInv = legs.reduce((a, x) => a + x.invVol, 0);
    // inverse-vol (equal-risk), signed by trend direction, gross normalized to ~1.0
    const weights = legs.map((x) => ({
      symbol: x.s,
      weight: x.dir * (x.invVol / sumInv) * 0.98,
      reason: `12m ${x.mom > 0 ? "+" : ""}${(x.mom * 100).toFixed(0)}% (${x.dir > 0 ? "long" : "short"})`,
    }));
    return { weights, confidence: 0.55, notes: `CTA ${legs.length} assets (${legs.filter((l) => l.dir > 0).length}L/${legs.filter((l) => l.dir < 0).length}S)` };
  },
};
