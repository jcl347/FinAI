/**
 * New long-only trend/rotation sleeves on the expanded multi-asset universe (scout fleet):
 *   - commodityTrend:  real-asset time-series trend over the cash-commodity ETFs, dollar-gated (DXY)
 *   - intlRotation:    international regional relative-strength rotation vs the ACWX ex-US benchmark
 * Both are long-only diversifiers; value is decorrelation + inflation/geographic exposure the US book lacks.
 */
import type { Strategy, StrategyContext, StrategySignal, TargetWeight } from "./types";
import { sma, totalReturn, momentumSkip, annualizedVol } from "./indicators";
import { INTL_ETFS } from "./universe";

const COMMODITY_TREND_ETFS = ["GLD", "SLV", "USO", "UNG", "DBA", "CPER", "PDBC"]; // drop DBC (twin of PDBC / in cross_asset_trend)

export const commodityTrend: Strategy = {
  key: "commodity_trend",
  name: "Commodity Time-Series Trend (dollar-gated)",
  family: "trend",
  description:
    "Hold each commodity ETF only when in a confirmed up-trend (price>100&200d SMA, 50>200, positive blended 3-6m momentum), inverse-vol weighted; halve gross when the US dollar (DX-Y.NYB) is itself trending up (a mechanical headwind to USD-priced commodities). Inflation/real-asset diversifier.",
  rebalanceDays: 21,
  warmupBars: 260,
  longOnly: true,
  instrument: "etf",
  generate(ctx: StrategyContext): StrategySignal {
    const elig: { s: string; invVol: number }[] = [];
    for (const s of COMMODITY_TREND_ETFS) {
      if (!ctx.universe.includes(s)) continue;
      const c = ctx.closes(s);
      if (c.length < 210) continue;
      const s200 = sma(c, 200), s100 = sma(c, 100), s50 = sma(c, 50);
      if (s200 == null || s100 == null || s50 == null) continue;
      const last = c[c.length - 1];
      const m126 = totalReturn(c, 126), m63 = momentumSkip(c, 63, 5);
      const m = 0.5 * (m126 ?? 0) + 0.5 * (m63 ?? 0);
      if (last > s200 && last > s100 && s50 > s200 && m > 0) {
        elig.push({ s, invVol: 1 / Math.max(0.06, annualizedVol(c, 60) || 0.2) });
      }
    }
    if (elig.length === 0) return { weights: [], confidence: 0.3, notes: "no commodity trend — cash" };
    // Dollar gate: strong-dollar uptrend halves gross.
    const dxy = ctx.closes("DX-Y.NYB");
    const dxyStrong = dxy.length > 110 && dxy[dxy.length - 1] > (sma(dxy, 100) ?? Infinity);
    const gross = dxyStrong ? 0.5 : 1.0;
    const sum = elig.reduce((a, x) => a + x.invVol, 0);
    const weights: TargetWeight[] = elig.map((x) => ({
      symbol: x.s,
      weight: (x.invVol / sum) * gross,
      reason: `commodity uptrend${dxyStrong ? " (USD-gated)" : ""}`,
    }));
    return { weights, confidence: 0.45, notes: `${elig.length} commodity trends` };
  },
};

export const intlRotation: Strategy = {
  key: "intl_rotation",
  name: "International Regional Relative-Strength Rotation",
  family: "rotation",
  description:
    "Rotate into the top regional equity ETFs that out-trend the ACWX ex-US benchmark (RS = region 12-1 minus ACWX 12-1) AND are in their own up-trend; inverse-vol weighted, long-only, de-grossed when US is risk-off. Geographic decorrelation the US-only book lacks.",
  rebalanceDays: 21,
  warmupBars: 260,
  longOnly: true,
  instrument: "etf",
  generate(ctx: StrategyContext): StrategySignal {
    const regions = INTL_ETFS.filter((s) => s !== "ACWX");
    const acwx = ctx.closes("ACWX");
    if (acwx.length < 260) return { weights: [], confidence: 0.2, notes: "no ACWX benchmark" };
    const benchMom = momentumSkip(acwx, 252, 21) ?? 0;
    const elig: { s: string; rs: number; invVol: number }[] = [];
    for (const s of regions) {
      if (!ctx.universe.includes(s)) continue;
      const c = ctx.closes(s);
      if (c.length < 260) continue;
      const mom = momentumSkip(c, 252, 21);
      const s200 = sma(c, 200);
      if (mom == null || s200 == null) continue;
      const rs = mom - benchMom;
      if (rs > 0 && c[c.length - 1] > s200) {
        elig.push({ s, rs, invVol: 1 / Math.max(0.06, annualizedVol(c, 60) || 0.18) });
      }
    }
    if (elig.length === 0) return { weights: [], confidence: 0.3, notes: "no region out-trending — cash" };
    elig.sort((a, b) => b.rs - a.rs);
    const top = elig.slice(0, 4);
    const riskOff = ctx.regime.spyAbove200 === false;
    const gross = riskOff ? 0.5 : 1.0;
    const sum = top.reduce((a, x) => a + x.invVol, 0);
    const weights: TargetWeight[] = top.map((x) => ({
      symbol: x.s,
      weight: (x.invVol / sum) * gross,
      reason: `intl RS +${(x.rs * 100).toFixed(0)}%`,
    }));
    return { weights, confidence: 0.45, notes: `${top.length} regions${riskOff ? " (risk-off)" : ""}` };
  },
};
