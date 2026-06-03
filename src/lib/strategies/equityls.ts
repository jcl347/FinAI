/**
 * Market-neutral equity LONG/SHORT sleeves on the WIDE 438-name cross-section (scout fleet).
 * Higher-gross real shorting is now in-mandate, so these strip market beta for genuine decorrelation:
 *   - bettingAgainstBeta:        long low-beta / short high-beta, beta-neutralized (BAB premium)
 *   - sectorNeutralResidMom:     residual 12-1 momentum, sector- AND beta-neutral decile L/S
 *   - lowTurnResidReversal:      5-day residual reversal, beta-neutral, weekly (the low-turnover reversal redesign)
 *   - factorMomLs:               factor-ETF leadership L/S, beta-neutralized
 * Honest prior: free-daily-OHLCV market-neutral streams are individually WEAK (Sharpe ~0.2-0.4);
 * value is near-zero ρ to the long book, judged OOS net-of-beta.
 */
import type { Strategy, StrategyContext, StrategySignal, TargetWeight } from "./types";
import { simpleReturns, beta, momentumSkip, annualizedVol, correlation } from "./indicators";
import { isEquity, SECTOR_ETFS } from "./universe";

function crisisMult(ctx: StrategyContext): number {
  return ctx.regime.regime === "CRISIS" ? 0.5 : 1.0;
}

/** Beta of a name's trailing returns vs SPY. */
function nameBeta(ctx: StrategyContext, c: number[], n = 252): number {
  const r = simpleReturns(c.slice(-(n + 1)));
  const m = simpleReturns(ctx.closes("SPY").slice(-(n + 1)));
  if (r.length < 30 || m.length < 30) return 1;
  return beta(r, m);
}

/** Build beta-neutral L/S weights: long leg = longGross, short leg scaled so net beta ≈ 0. */
function betaNeutral(
  longs: { s: string; b: number }[],
  shorts: { s: string; b: number }[],
  longGross: number,
  mult: number,
  tag: string
): TargetWeight[] {
  const nL = longs.length, nS = shorts.length;
  if (!nL || !nS) return [];
  const betaL = longs.reduce((a, x) => a + x.b, 0) / nL;
  const betaS = shorts.reduce((a, x) => a + x.b, 0) / nS;
  const shortGross = betaS > 0.1 ? longGross * (betaL / betaS) : longGross;
  const wL = (longGross / nL) * mult;
  const wS = (shortGross / nS) * mult;
  return [
    ...longs.map((x) => ({ symbol: x.s, weight: wL, reason: `${tag} long` })),
    ...shorts.map((x) => ({ symbol: x.s, weight: -wS, reason: `${tag} short` })),
  ];
}

function eligibleEquities(ctx: StrategyContext, minBars: number): string[] {
  return ctx.universe.filter((s) => isEquity(s) && ctx.closes(s).length >= minBars);
}

export const bettingAgainstBeta: Strategy = {
  key: "bab_ls",
  name: "Betting-Against-Beta L/S (beta-neutral)",
  family: "offensive",
  description:
    "Long the lowest-beta decile, short the highest-beta decile of the 438-name cross-section, scaled to beta-neutral (Frazzini-Pedersen). Harvests the low-beta anomaly as a market-neutral spread; de-grossed in crises (BAB unwinds on funding-liquidity spikes).",
  rebalanceDays: 21,
  warmupBars: 270,
  longOnly: false,
  instrument: "equity",
  generate(ctx: StrategyContext): StrategySignal {
    const names = eligibleEquities(ctx, 260);
    const scored: { s: string; b: number }[] = [];
    for (const s of names) {
      const b = nameBeta(ctx, ctx.closes(s), 252);
      if (b > 0.1) scored.push({ s, b });
    }
    if (scored.length < 30) return { weights: [], confidence: 0.2 };
    scored.sort((a, b) => a.b - b.b);
    const k = Math.max(3, Math.floor(scored.length * 0.1));
    const longs = scored.slice(0, k); // low beta
    const shorts = scored.slice(-k); // high beta
    const weights = betaNeutral(longs, shorts, 1.0, crisisMult(ctx), "BAB");
    return { weights, confidence: 0.4, notes: `BAB ${k}v${k}` };
  },
};

const SECTOR_LOOKBACK = 120;
/** Data-derived sector: the SPDR sector ETF a stock's recent returns correlate with most (no hand-mapping). */
function deriveSector(ctx: StrategyContext, c: number[]): string {
  const r = simpleReturns(c.slice(-(SECTOR_LOOKBACK + 1)));
  let best = "MKT", bestRho = -2;
  for (const e of SECTOR_ETFS) {
    const ec = ctx.closes(e);
    if (ec.length < SECTOR_LOOKBACK + 1) continue;
    const rho = correlation(r, simpleReturns(ec.slice(-(SECTOR_LOOKBACK + 1))));
    if (rho > bestRho) { bestRho = rho; best = e; }
  }
  return best;
}

export const sectorNeutralResidMom: Strategy = {
  key: "resid_mom_sn_ls",
  name: "Sector-Neutral Residual Momentum L/S",
  family: "market_neutral",
  description:
    "Residual 12-1 momentum (each stock's return net of its SPY beta), de-meaned WITHIN data-derived sector buckets so the bet is intra-sector leadership, then decile L/S beta-neutralized. Strips both market and sector beta from the momentum premium.",
  rebalanceDays: 21,
  warmupBars: 270,
  longOnly: false,
  instrument: "equity",
  generate(ctx: StrategyContext): StrategySignal {
    const names = eligibleEquities(ctx, 260);
    const spyMom = momentumSkip(ctx.closes("SPY"), 252, 21) ?? 0;
    const rows: { s: string; resid: number; b: number; sector: string }[] = [];
    for (const s of names) {
      const c = ctx.closes(s);
      const raw = momentumSkip(c, 252, 21);
      if (raw == null) continue;
      const b = nameBeta(ctx, c, 252);
      rows.push({ s, resid: raw - b * spyMom, b, sector: deriveSector(ctx, c) });
    }
    if (rows.length < 40) return { weights: [], confidence: 0.2 };
    // De-mean residual within each sector bucket.
    const bySector = new Map<string, number[]>();
    for (const r of rows) (bySector.get(r.sector) ?? bySector.set(r.sector, []).get(r.sector)!).push(r.resid);
    const sectorMean = new Map<string, number>();
    for (const [k, v] of bySector) sectorMean.set(k, v.reduce((a, b) => a + b, 0) / v.length);
    const scored = rows.map((r) => ({ s: r.s, b: r.b, sn: r.resid - (sectorMean.get(r.sector) ?? 0) }));
    scored.sort((a, b) => b.sn - a.sn);
    const k = Math.max(4, Math.floor(scored.length * 0.1));
    const longs = scored.slice(0, k).map((x) => ({ s: x.s, b: x.b }));
    const shorts = scored.slice(-k).map((x) => ({ s: x.s, b: x.b }));
    const weights = betaNeutral(longs, shorts, 0.8, crisisMult(ctx), "SN-resmom");
    return { weights, confidence: 0.4, notes: `sector-neutral ${k}v${k}` };
  },
};

export const lowTurnResidReversal: Strategy = {
  key: "resid_reversal_lt",
  name: "Short-Term Residual Reversal L/S (low-turnover)",
  family: "mean_reversion",
  description:
    "Weekly 5-day RESIDUAL reversal: long the most idiosyncratically-oversold decile, short the most-overbought, beta-neutral, liquidity-screened. The low-turnover (weekly, not daily) redesign of the cost-killed RSI-2 reversal null; de-grossed in crises (a sharp move can be the start of a cascade, not a reversion).",
  rebalanceDays: 5,
  warmupBars: 90,
  longOnly: false,
  instrument: "equity",
  generate(ctx: StrategyContext): StrategySignal {
    const spy = ctx.closes("SPY");
    if (spy.length < 7) return { weights: [], confidence: 0.2 };
    const spyR5 = spy[spy.length - 1] / spy[spy.length - 6] - 1;
    const scored: { s: string; resid: number; b: number }[] = [];
    for (const s of ctx.universe) {
      if (!isEquity(s)) continue;
      const c = ctx.closes(s);
      if (c.length < 70) continue;
      // liquidity screen: median 20d dollar volume >= $50M
      const bars = ctx.bars(s).slice(-20);
      if (bars.length < 20) continue;
      const dv = bars.map((x) => x.close * x.volume).sort((a, b) => a - b);
      const medDV = dv[Math.floor(dv.length / 2)];
      if (medDV < 50e6) continue;
      const r5 = c[c.length - 1] / c[c.length - 6] - 1;
      const b = nameBeta(ctx, c, 60);
      scored.push({ s, resid: r5 - b * spyR5, b });
    }
    if (scored.length < 40) return { weights: [], confidence: 0.2 };
    scored.sort((a, b) => a.resid - b.resid); // ascending: most-negative residual first
    const k = Math.max(4, Math.floor(scored.length * 0.1));
    const longs = scored.slice(0, k).map((x) => ({ s: x.s, b: x.b })); // oversold → long
    const shorts = scored.slice(-k).map((x) => ({ s: x.s, b: x.b })); // overbought → short
    const weights = betaNeutral(longs, shorts, 0.7, crisisMult(ctx), "resrev");
    return { weights, confidence: 0.35, notes: `resid-reversal ${k}v${k}` };
  },
};

const FACTOR_LS_ETFS = ["MTUM", "QUAL", "USMV", "VLUE", "SIZE", "IWF", "IWD"];
export const factorMomLs: Strategy = {
  key: "factor_mom_ls",
  name: "Factor-ETF Momentum L/S (beta-neutral)",
  family: "offensive",
  description:
    "Long the leading / short the lagging factor ETFs by 6-month return de-meaned across the basket (so the equal-weight factor beta nets out), beta-neutralized. Harvests factor-leadership autocorrelation as a market-neutral spread.",
  rebalanceDays: 21,
  warmupBars: 160,
  longOnly: false,
  instrument: "etf",
  generate(ctx: StrategyContext): StrategySignal {
    const rows: { s: string; m: number; b: number }[] = [];
    for (const s of FACTOR_LS_ETFS) {
      if (!ctx.universe.includes(s)) continue;
      const c = ctx.closes(s);
      if (c.length < 140) continue;
      const m = momentumSkip(c, 126, 5);
      if (m == null) continue;
      rows.push({ s, m, b: nameBeta(ctx, c, 60) });
    }
    if (rows.length < 4) return { weights: [], confidence: 0.2 };
    const mean = rows.reduce((a, x) => a + x.m, 0) / rows.length;
    rows.forEach((r) => (r.m -= mean));
    rows.sort((a, b) => b.m - a.m);
    const longs = rows.slice(0, 2).map((x) => ({ s: x.s, b: x.b }));
    const shorts = rows.slice(-2).map((x) => ({ s: x.s, b: x.b }));
    const weights = betaNeutral(longs, shorts, 0.5, crisisMult(ctx), "factor-LS");
    return { weights, confidence: 0.35, notes: "factor leadership L/S" };
  },
};
