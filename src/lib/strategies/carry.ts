/**
 * Carry / rates / macro sleeves driven by the unique alt-data tickers (scout fleet):
 *   - curveDuration:  yield-curve-slope + rate-trend duration timing (TLT/IEF/SHY) from ^TNX/^IRX/^FVX
 *   - creditCarry:    trend-confirmed HY credit risk-on carry (long HYG vs short IEF), VIX-term gated
 *   - xassetCarry:    within-class cross-asset carry L/S (rates/credit/commodity/intl), excess-over-^IRX-cash
 *   - usdRegime:      US-dollar (DX-Y.NYB) regime tilt — defensives vs EM/commodity
 * Designed to AVOID the prior credit-stress / CTA traps that overfit the single 2022 column.
 */
import type { Strategy, StrategyContext, StrategySignal, TargetWeight } from "./types";
import { sma, totalReturn, annualizedVol, zscore } from "./indicators";
import { RATES_ETFS, CREDIT_ETFS, COMMODITY_ETFS, INTL_ETFS } from "./universe";

export const curveDuration: Strategy = {
  key: "curve_duration",
  name: "Yield-Curve Duration Timing (TNX/IRX)",
  family: "rates",
  description:
    "Time Treasury duration off the actual curve: when the 10y yield (^TNX) is trending DOWN (price up) hold long-duration TLT; when rates trend UP hold short-duration SHY; otherwise IEF. A rates sleeve driven by the yield curve, low ρ to equities.",
  rebalanceDays: 10,
  warmupBars: 260,
  longOnly: true,
  instrument: "etf",
  generate(ctx: StrategyContext): StrategySignal {
    const t10 = ctx.closes("^TNX");
    if (t10.length < 210) return { weights: [], confidence: 0.2, notes: "no ^TNX" };
    const last = t10[t10.length - 1], ma50 = sma(t10, 50), ma200 = sma(t10, 200);
    if (ma50 == null || ma200 == null) return { weights: [], confidence: 0.2 };
    const falling = last < ma50 && ma50 < ma200; // yields down → duration price up
    const rising = last > ma50 && ma50 > ma200;
    let pick: string, reason: string;
    if (falling && ctx.universe.includes("TLT")) { pick = "TLT"; reason = "rates falling → long duration"; }
    else if (rising && ctx.universe.includes("SHY")) { pick = "SHY"; reason = "rates rising → short duration"; }
    else if (ctx.universe.includes("IEF")) { pick = "IEF"; reason = "neutral rate trend → belly"; }
    else return { weights: [], confidence: 0.2 };
    return { weights: [{ symbol: pick, weight: 1.0, reason }], confidence: 0.45, notes: reason };
  },
};

export const creditCarry: Strategy = {
  key: "credit_carry",
  name: "Credit Carry (trend-confirmed HY risk-on)",
  family: "carry",
  description:
    "Long high-yield credit (HYG) vs short Treasuries (IEF) — the pure credit-spread carry — ONLY when HY is trending up, outperforming Treasuries, and not in stress (VIX term contango, not HIGH_VOL/CRISIS, SPY>200d). Flat otherwise. A small risk-on carry, explicitly NOT a 2022 hedge.",
  rebalanceDays: 5,
  warmupBars: 230,
  longOnly: false,
  instrument: "etf",
  generate(ctx: StrategyContext): StrategySignal {
    const hy = ctx.universe.includes("HYG") ? "HYG" : ctx.universe.includes("JNK") ? "JNK" : null;
    if (!hy || !ctx.universe.includes("IEF")) return { weights: [], confidence: 0.2 };
    const c = ctx.closes(hy), ief = ctx.closes("IEF");
    if (c.length < 210 || ief.length < 130) return { weights: [], confidence: 0.2 };
    const s100 = sma(c, 100);
    const trendUp = s100 != null && c[c.length - 1] > s100 && (totalReturn(c, 126) ?? -1) > 0;
    const rsUp = (totalReturn(c, 126) ?? 0) > (totalReturn(ief, 126) ?? 0);
    const term = ctx.regime.vixTermRatio;
    const stress = (term != null && term > 1.0) || ctx.regime.regime === "HIGH_VOL" || ctx.regime.regime === "CRISIS" || ctx.regime.spyAbove200 === false;
    if (!(trendUp && rsUp) || stress) return { weights: [], confidence: 0.3, notes: "no risk-on credit carry — flat" };
    return {
      weights: [
        { symbol: hy, weight: 0.7, reason: "HY risk-on carry" },
        { symbol: "IEF", weight: -0.5, reason: "duration hedge (credit-minus-rates)" },
      ],
      confidence: 0.5,
      notes: "credit-spread carry on",
    };
  },
};

export const xassetCarry: Strategy = {
  key: "xasset_carry_ls",
  name: "Cross-Asset Carry L/S (within-class)",
  family: "carry",
  description:
    "Rank rates/credit/commodity/intl ETFs by risk-adjusted excess-over-cash carry (trailing return minus the ^IRX T-bill rate, per unit vol), de-meaned within each class, then long the highest- / short the lowest-carry across classes, inverse-vol weighted. Carry distinct from trend.",
  rebalanceDays: 21,
  warmupBars: 170,
  longOnly: false,
  instrument: "etf",
  generate(ctx: StrategyContext): StrategySignal {
    const irx = ctx.closes("^IRX");
    const rf = irx.length ? (irx[irx.length - 1] ?? 2) / 100 : 0.02;
    const cashDrag = rf * (126 / 252);
    const all: { s: string; dscore: number; invVol: number }[] = [];
    for (const pool of [RATES_ETFS, CREDIT_ETFS, COMMODITY_ETFS, INTL_ETFS]) {
      const rows: { s: string; score: number; invVol: number }[] = [];
      for (const s of pool) {
        if (!ctx.universe.includes(s)) continue;
        const c = ctx.closes(s);
        if (c.length < 150) continue;
        const tr = totalReturn(c, 126);
        if (tr == null) continue;
        const vol = Math.max(0.04, annualizedVol(c, 63) || 0.1);
        rows.push({ s, score: (tr - cashDrag) / vol, invVol: 1 / vol });
      }
      if (rows.length < 3) continue;
      const mean = rows.reduce((a, x) => a + x.score, 0) / rows.length;
      for (const r of rows) all.push({ s: r.s, dscore: r.score - mean, invVol: r.invVol });
    }
    if (all.length < 6) return { weights: [], confidence: 0.2 };
    all.sort((a, b) => b.dscore - a.dscore);
    const k = Math.max(2, Math.floor(all.length / 4));
    const longs = all.slice(0, k), shorts = all.slice(-k);
    const lSum = longs.reduce((a, x) => a + x.invVol, 0), sSum = shorts.reduce((a, x) => a + x.invVol, 0);
    const weights: TargetWeight[] = [
      ...longs.map((x) => ({ symbol: x.s, weight: (x.invVol / lSum) * 0.75, reason: "carry long" })),
      ...shorts.map((x) => ({ symbol: x.s, weight: -(x.invVol / sSum) * 0.75, reason: "carry short" })),
    ];
    return { weights, confidence: 0.4, notes: `xasset carry ${k}v${k}` };
  },
};

const USD_DEFENSIVES = ["XLP", "USMV"];
const USD_EM_COMMODITY = ["EEM", "INDA", "EWZ", "DBC", "GLD"];
export const usdRegime: Strategy = {
  key: "usd_regime",
  name: "USD-Regime Cross-Asset Tilt (DXY)",
  family: "macro",
  description:
    "US-dollar regime tilt: a strong, trending dollar (DX-Y.NYB > 200d AND positive 6m) favors US defensives over EM/commodity; a weak dollar favors EM/commodity. Sized by the strength of the dollar trend, flat when the signal is weak. The macro factor behind 2022.",
  rebalanceDays: 10,
  warmupBars: 260,
  longOnly: false,
  instrument: "etf",
  generate(ctx: StrategyContext): StrategySignal {
    const dxy = ctx.closes("DX-Y.NYB");
    if (dxy.length < 260) return { weights: [], confidence: 0.2, notes: "no DXY" };
    const last = dxy[dxy.length - 1], ma200 = sma(dxy, 200);
    const z = zscore(dxy, 252);
    const mom126 = totalReturn(dxy, 126);
    if (ma200 == null || z == null || mom126 == null) return { weights: [], confidence: 0.2 };
    if (Math.abs(z) < 0.5) return { weights: [], confidence: 0.3, notes: "no clear USD regime — flat" };
    const trendSign = last > ma200 ? 1 : -1;
    let dir = 0;
    if (trendSign > 0 && mom126 > 0) dir = 1; // strong dollar
    else if (trendSign < 0 && mom126 < 0) dir = -1; // weak dollar
    if (dir === 0) return { weights: [], confidence: 0.3, notes: "USD trend/mom disagree — flat" };
    const strength = Math.min(2, Math.abs(z)) / 2; // 0..1
    const g = 0.5 * strength;
    const defs = USD_DEFENSIVES.filter((s) => ctx.universe.includes(s));
    const ems = USD_EM_COMMODITY.filter((s) => ctx.universe.includes(s));
    if (!defs.length || !ems.length) return { weights: [], confidence: 0.2 };
    const longBasket = dir > 0 ? defs : ems;
    const shortBasket = dir > 0 ? ems : defs;
    const weights: TargetWeight[] = [
      ...longBasket.map((s) => ({ symbol: s, weight: g / longBasket.length, reason: dir > 0 ? "strong-USD: defensives" : "weak-USD: EM/cmdty" })),
      ...shortBasket.map((s) => ({ symbol: s, weight: -g / shortBasket.length, reason: dir > 0 ? "strong-USD: short EM/cmdty" : "weak-USD: short defensives" })),
    ];
    return { weights, confidence: 0.4, notes: `USD ${dir > 0 ? "strong" : "weak"} (z=${z.toFixed(1)})` };
  },
};
