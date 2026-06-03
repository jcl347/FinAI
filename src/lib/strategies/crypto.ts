/**
 * Crypto sleeves (scout fleet — expanded-universe push). Two distinct premia on the 11-coin
 * CRYPTO_UNIVERSE (Yahoo *-USD daily closes, weekend bars sampled onto the SPY calendar):
 *   - cryptoTrend:     time-series trend, long-only-when-trending, inverse-vol, SMALL gross (crypto vol is huge)
 *   - cryptoXsMomLs:   cross-sectional momentum L/S WITHIN the basket (market-neutral to equities)
 * Both de-gross in CRISIS (crypto correlation to equities spikes toward 1 exactly in risk-off).
 * Honest prior: crypto's free-data diversification is fair-weather; these are weak/convex, not crisis hedges.
 */
import type { Strategy, StrategyContext, StrategySignal, TargetWeight } from "./types";
import { totalReturn, momentumSkip, annualizedVol } from "./indicators";
import { CRYPTO_UNIVERSE, isCrypto } from "./universe";

function regimeMult(ctx: StrategyContext): number {
  const r = ctx.regime.regime;
  if (r === "CRISIS") return 0;
  if (r === "HIGH_VOL") return 0.5;
  return 1.0;
}

export const cryptoTrend: Strategy = {
  key: "crypto_trend",
  name: "Crypto Time-Series Trend (inverse-vol, small gross)",
  family: "trend",
  description:
    "Hold each crypto coin only when trending up (close>100d SMA AND positive ~75d return), inverse-vol weighted, small gross (base 40%), de-grossed in stress. A convex crypto-momentum stream, decorrelated from equities in calm regimes.",
  rebalanceDays: 7,
  warmupBars: 120,
  longOnly: true,
  instrument: "etf",
  generate(ctx: StrategyContext): StrategySignal {
    const mult = regimeMult(ctx);
    if (mult === 0) return { weights: [], confidence: 0.2, notes: "crisis — out of crypto" };
    const elig: { s: string; invVol: number }[] = [];
    for (const s of CRYPTO_UNIVERSE) {
      if (!ctx.universe.includes(s) || !isCrypto(s)) continue;
      const c = ctx.closes(s);
      if (c.length < 110) continue;
      const sm = c.slice(-100).reduce((a, b) => a + b, 0) / 100;
      const tr = totalReturn(c, 75);
      if (c[c.length - 1] > sm && tr != null && tr > 0) {
        const vol = annualizedVol(c, 30) || 0.8;
        elig.push({ s, invVol: 1 / Math.max(0.2, vol) });
      }
    }
    if (elig.length === 0) return { weights: [], confidence: 0.3, notes: "no crypto uptrend — cash" };
    const sum = elig.reduce((a, x) => a + x.invVol, 0);
    const gross = 0.4 * mult;
    const weights: TargetWeight[] = elig.map((x) => ({
      symbol: x.s,
      weight: (x.invVol / sum) * gross,
      reason: "crypto uptrend (vol-scaled)",
    }));
    return { weights, confidence: 0.45, notes: `${elig.length} crypto trends @${(gross * 100).toFixed(0)}% gross` };
  },
};

export const cryptoXsMomLs: Strategy = {
  key: "crypto_xs_mom_ls",
  name: "Crypto Cross-Sectional Momentum L/S (intra-basket)",
  family: "offensive",
  description:
    "Within the crypto basket, long the top-2 and short the bottom-2 by blended 30/60/90d skip-1w momentum — market-neutral to equities. De-grossed in stress. Diversifier valued for near-zero equity correlation, not standalone Sharpe.",
  rebalanceDays: 7,
  warmupBars: 120,
  longOnly: false,
  instrument: "etf",
  generate(ctx: StrategyContext): StrategySignal {
    const mult = regimeMult(ctx);
    if (mult === 0) return { weights: [], confidence: 0.2, notes: "crisis — flat" };
    const scored: { s: string; score: number }[] = [];
    for (const s of CRYPTO_UNIVERSE) {
      if (!ctx.universe.includes(s) || !isCrypto(s)) continue;
      const c = ctx.closes(s);
      if (c.length < 100) continue;
      const legs = [30, 60, 90].map((L) => momentumSkip(c, L, 7)).filter((x): x is number => x != null);
      if (legs.length === 0) continue;
      scored.push({ s, score: legs.reduce((a, b) => a + b, 0) / legs.length });
    }
    if (scored.length < 6) return { weights: [], confidence: 0.2, notes: "crypto basket too thin" };
    scored.sort((a, b) => b.score - a.score);
    const longs = scored.slice(0, 2);
    const shorts = scored.slice(-2);
    const legGross = 0.4 * mult; // per-name; 2 longs + 2 shorts → gross 1.6*mult
    const weights: TargetWeight[] = [
      ...longs.map((x) => ({ symbol: x.s, weight: legGross, reason: "crypto XS-mom long" })),
      ...shorts.map((x) => ({ symbol: x.s, weight: -legGross, reason: "crypto XS-mom short" })),
    ];
    return { weights, confidence: 0.4, notes: "crypto L/S top2-bottom2" };
  },
};
