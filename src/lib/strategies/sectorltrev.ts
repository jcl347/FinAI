/**
 * Industry Long-Term Reversal — Sector-SPDR L/S (the one sleeve that survived Fleet B's OOS red-team).
 *
 * Mechanism: industry-level long-term return reversal — sectors that led/lagged over a ~3-year horizon
 * subsequently reverse (slow cyclical mean-reversion of sector valuations; a sector-level value/contrarian
 * premium). Because it trades only broad, deeply liquid sector INDICES, it carries ZERO survivorship bias
 * (indices cannot be delisted) and is the cleanest market-neutral expression of the value family — a slow
 * contrarian mirror of the book's fast sector momentum.
 *
 * Honest grade (Fleet B): the only positive-OOS, near-zero-ρ survivor of a 20-sleeve search — but a WEAK
 * one (OOS net-of-β Sharpe ~0.27, ρ to book ≈ 0). It is ballast, not an alpha engine; sized small.
 *
 * Construction: formationRet = 36-month return (skip last 21d), DE-MEANED across the 11 SPDRs (so the
 * equal-weight sector basket nets out → market-neutral). Long the 4 most-lagged-vs-peers, short the 4
 * most-led, equal-weight ±0.125, monthly rebalance.
 */
import type { Strategy, StrategyContext, StrategySignal } from "./types";
import { momentumSkip } from "./indicators";
import { SECTOR_ETFS } from "./universe";

export const sectorLongTermReversal: Strategy = {
  key: "sector_lt_reversal",
  name: "Sector Long-Term Reversal (market-neutral L/S)",
  family: "value",
  description:
    "Long the most-lagged / short the most-led sector SPDRs by 36-month return (de-meaned across sectors), dollar- & beta-neutral. Zero survivorship bias (ETFs); a slow contrarian mirror of sector momentum.",
  rebalanceDays: 21,
  warmupBars: 800,
  longOnly: false,
  instrument: "etf",
  generate(ctx: StrategyContext): StrategySignal {
    const scored: { s: string; f: number }[] = [];
    for (const s of SECTOR_ETFS) {
      if (!ctx.universe.includes(s)) continue;
      const c = ctx.closes(s);
      if (c.length < 780) continue;
      const f = momentumSkip(c, 756, 21); // 36-month return, skip last 21d
      if (f != null) scored.push({ s, f });
    }
    if (scored.length < 8) return { weights: [], confidence: 0.2 };
    const mean = scored.reduce((a, x) => a + x.f, 0) / scored.length;
    // score = -(formationRet - mean): most-lagged-vs-peers → highest → long
    scored.sort((a, b) => (a.f - mean) - (b.f - mean)); // ascending formationRet (most lagged first)
    const k = Math.min(4, Math.floor(scored.length / 2));
    const longs = scored.slice(0, k); // most lagged → long (reversal)
    const shorts = scored.slice(-k); // most led → short
    const w = 0.5 / k;
    const weights = [
      ...longs.map((x) => ({ symbol: x.s, weight: w, reason: `36m ret ${(x.f * 100).toFixed(0)}% (laggard→long)` })),
      ...shorts.map((x) => ({ symbol: x.s, weight: -w, reason: `36m ret ${(x.f * 100).toFixed(0)}% (leader→short)` })),
    ];
    return { weights, confidence: 0.45, notes: `Sector L/S ${k}×${k} long-term reversal` };
  },
};
