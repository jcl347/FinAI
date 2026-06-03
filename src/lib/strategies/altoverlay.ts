/**
 * Alt-data defensive overlays (scout fleet) — driven by the unique free Yahoo vol/skew indices.
 * Each sits FLAT most of the time (no carry drag) and only fires a flight-to-safety on its signal:
 *   - skewCrashFear:        CBOE ^SKEW top-decile + VIX-term confirm → long TLT/GLD
 *   - vvixEarlyWarning:     ^VVIX (vol-of-vol) >1.5σ spike, still expanding, BEFORE VIX confirms → long TLT/GLD
 *   - commodityVolContagion: ^OVX/^GVZ commodity-IV stretched vs ^VIX → long GLD, short XLE/XLB
 * Honest prior: tail overlays usually bleed or do nothing; value (if any) is drawdown reduction, netβ≈0.
 */
import type { Strategy, StrategyContext, StrategySignal, TargetWeight } from "./types";
import { mean, stdev, zscore } from "./indicators";

/** Trailing percentile of the last value within its own `window` (no look-ahead). */
function trailingPct(xs: number[], window: number): number | null {
  if (xs.length < window) return null;
  const s = xs.slice(-window);
  const last = s[s.length - 1];
  let le = 0;
  for (const v of s) if (v <= last) le++;
  return le / s.length;
}

export const skewCrashFear: Strategy = {
  key: "skew_crashfear",
  name: "SKEW Crash-Fear Defensive Overlay",
  family: "defensive",
  description:
    "When CBOE ^SKEW is in its trailing top decile (elevated crash-fear) AND the VIX term structure confirms flattening/backwardation, rotate to TLT/GLD flight-to-safety for a few days; flat otherwise (no carry drag). A sentiment-gated convex hedge, orthogonal to price.",
  rebalanceDays: 3,
  warmupBars: 320,
  longOnly: true,
  instrument: "etf",
  generate(ctx: StrategyContext): StrategySignal {
    const sk = ctx.closes("^SKEW");
    if (sk.length < 252) return { weights: [], confidence: 0.2 };
    // fire if top-decile crash-fear occurred on any of the last 3 days (persistence without state)
    let crashFear = false;
    for (let back = 0; back < 3; back++) {
      const slice = sk.slice(0, sk.length - back);
      const pct = trailingPct(slice, 252);
      if (pct != null && pct >= 0.9) { crashFear = true; break; }
    }
    let termConfirm = ctx.regime.vixTermRatio != null && ctx.regime.vixTermRatio >= 0.97;
    if (ctx.regime.vixTermRatio == null) {
      const v9 = ctx.closes("^VIX9D"), v3 = ctx.closes("^VIX3M");
      if (v9.length && v3.length && v3[v3.length - 1] > 0) termConfirm = v9[v9.length - 1] / v3[v3.length - 1] >= 0.95;
    }
    if (!(crashFear && termConfirm)) return { weights: [], confidence: 0.3, notes: "no crash-fear — flat" };
    const legs = ["TLT", "GLD"].filter((s) => ctx.universe.includes(s));
    if (!legs.length) return { weights: [], confidence: 0.2 };
    return { weights: legs.map((s) => ({ symbol: s, weight: 1.0 / legs.length, reason: "SKEW crash-fear → safety" })), confidence: 0.5, notes: "crash-fear hedge on" };
  },
};

export const vvixEarlyWarning: Strategy = {
  key: "vvix_early_warning",
  name: "VVIX Early-Warning De-Gross Overlay",
  family: "defensive",
  description:
    "When ^VVIX (vol-of-vol) spikes >1.5σ above its 100d band and is still expanding BEFORE VIX confirms a crisis, pre-emptively rotate to TLT/GLD for a 5-day window. An early-warning hedge that leads the VIX-term tail-hedge; flat otherwise.",
  rebalanceDays: 1,
  warmupBars: 130,
  longOnly: true,
  instrument: "etf",
  generate(ctx: StrategyContext): StrategySignal {
    const v = ctx.closes("^VVIX");
    if (v.length < 110) return { weights: [], confidence: 0.2 };
    // fire if a >1.5σ expanding spike occurred within the last 5 days (5-day hold, stateless)
    let fired = false;
    for (let back = 0; back < 5; back++) {
      const idx = v.length - 1 - back;
      if (idx < 101) break;
      const win = v.slice(idx - 100, idx);
      const mu = mean(win), sd = stdev(win);
      if (v[idx] > mu + 1.5 * sd && v[idx] > v[idx - 1]) { fired = true; break; }
    }
    if (!fired) return { weights: [], confidence: 0.3, notes: "no VVIX spike — flat" };
    const legs = ["TLT", "GLD"].filter((s) => ctx.universe.includes(s));
    if (!legs.length) return { weights: [], confidence: 0.2 };
    return { weights: legs.map((s) => ({ symbol: s, weight: 1.0 / legs.length, reason: "VVIX early-warning → safety" })), confidence: 0.45, notes: "vol-of-vol hedge on" };
  },
};

export const commodityVolContagion: Strategy = {
  key: "commodity_vol_contagion",
  name: "Commodity-Vol Contagion (OVX/GVZ)",
  family: "defensive",
  description:
    "When commodity implied vol (^OVX oil, ^GVZ gold) is stretched vs equity ^VIX (z-score of the blended ratio), a commodity/energy stress is brewing: tilt long GLD (safe-haven) and short XLE/XLB (energy/materials). Flat when the ratio is normal.",
  rebalanceDays: 3,
  warmupBars: 260,
  longOnly: false,
  instrument: "etf",
  generate(ctx: StrategyContext): StrategySignal {
    const ovx = ctx.closes("^OVX"), gvz = ctx.closes("^GVZ"), vix = ctx.closes("^VIX");
    const n = Math.min(ovx.length, gvz.length, vix.length);
    if (n < 260) return { weights: [], confidence: 0.2 };
    const ratio: number[] = [];
    for (let i = n - 252; i < n; i++) {
      if (vix[i] > 0) ratio.push((ovx[i] + 2 * gvz[i]) / 3 / vix[i]);
    }
    const z = zscore(ratio, Math.min(252, ratio.length));
    if (z == null || z < 1.0) return { weights: [], confidence: 0.3, notes: "commodity vol normal — flat" };
    const g = Math.min(1, (z - 1.0) / 1.5) * 0.6; // scale up to 0.6 gross as stress grows
    const shorts = ["XLE", "XLB"].filter((s) => ctx.universe.includes(s));
    if (!ctx.universe.includes("GLD") || !shorts.length) return { weights: [], confidence: 0.2 };
    const weights: TargetWeight[] = [
      { symbol: "GLD", weight: g, reason: "commodity-vol stress → gold" },
      ...shorts.map((s) => ({ symbol: s, weight: -g / shorts.length, reason: "commodity-vol stress → short energy/materials" })),
    ];
    return { weights, confidence: 0.4, notes: `OVX/GVZ contagion z=${z.toFixed(1)}` };
  },
};
