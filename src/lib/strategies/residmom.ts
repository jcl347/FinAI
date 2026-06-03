/**
 * Residual-Momentum Decile Long/Short (beta-neutralized).
 *
 * Mechanism: momentum in the IDIOSYNCRATIC (market-residual) return — the part of a stock's 12-1
 * momentum not explained by its market beta (Blitz-Huij-Martens 2011, "Residual Momentum"). It is
 * cleaner than raw momentum (sheds the time-varying market exposure that drives momentum crashes)
 * and, run dollar- + beta-neutral, produces a return stream nearly UNCORRELATED to the long-only
 * book (the advanced-options fleet scored this its top new survivor: ρ≈0.05, net-of-β ~0.3-0.4).
 * Viable only because the universe was widened to ~165 names — residual dispersion needs breadth.
 *
 * Rule: rank the equity universe by residual 12-1 momentum (stock momentum − β·SPY momentum);
 * long the top decile, short the bottom decile, equal-weight, dollar-neutral (gross ≈ 1.0).
 * NOTE: this sleeve SHORTS — the engine charges borrow; it is for the research backtest /
 * returns-level portfolio. (The live cash-secured book can express the long leg + an SPY-short hedge.)
 */
import type { Strategy, StrategyContext, StrategySignal } from "./types";
import { momentumSkip, simpleReturns, beta, annualizedVol } from "./indicators";
import { liquidEquities } from "./screens";

export const residualMomentum: Strategy = {
  key: "resid_momentum",
  name: "Residual-Momentum L/S (beta-neutral)",
  family: "offensive",
  description:
    "Long top-decile / short bottom-decile by beta-residualized 12-1 momentum, dollar-neutral. Market-neutral, low correlation to the long-only book; needs the widened universe for dispersion.",
  rebalanceDays: 21,
  warmupBars: 270,
  longOnly: false,
  instrument: "equity",
  generate(ctx: StrategyContext): StrategySignal {
    const spyCloses = ctx.closes("SPY");
    if (spyCloses.length < 260) return { weights: [], confidence: 0.1 };
    const spyRet = simpleReturns(spyCloses.slice(-253));
    const spyMom = momentumSkip(spyCloses, 252, 21);
    if (spyMom == null) return { weights: [], confidence: 0.1 };

    const scored: { s: string; resid: number; idioVol: number }[] = [];
    for (const s of liquidEquities(ctx, 200)) {
      const c = ctx.closes(s);
      if (c.length < 260) continue;
      const mom = momentumSkip(c, 252, 21);
      if (mom == null) continue;
      const b = beta(simpleReturns(c.slice(-253)), spyRet);
      const resid = mom - b * spyMom;
      scored.push({ s, resid, idioVol: annualizedVol(c, 60) || 0.3 });
    }
    if (scored.length < 20) return { weights: [], confidence: 0.2 };
    scored.sort((a, b) => b.resid - a.resid);
    const n = Math.max(3, Math.floor(scored.length / 10)); // decile
    const longs = scored.slice(0, n);
    const shorts = scored.slice(-n);
    const lw = 0.5 / longs.length;
    const sw = 0.5 / shorts.length;
    const weights = [
      ...longs.map((x) => ({ symbol: x.s, weight: lw, reason: `resid-mom +${(x.resid * 100).toFixed(0)}%` })),
      ...shorts.map((x) => ({ symbol: x.s, weight: -sw, reason: `resid-mom ${(x.resid * 100).toFixed(0)}%` })),
    ];
    return { weights, confidence: 0.5, notes: `L/S ${longs.length}×${shorts.length} residual momentum` };
  },
};
