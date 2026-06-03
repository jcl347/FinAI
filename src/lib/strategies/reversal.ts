/**
 * Short-Term Mean Reversion (RSI-2 dip-buy in an uptrend).
 *
 * Mechanism: short-horizon reversal / liquidity provision (Lehmann 1990; Connors RSI-2).
 * Sharp 1-5 day selloffs in otherwise-uptrending names tend to bounce as forced/last
 * sellers exhaust. The edge is real but SMALL and FAST — so this strategy is also the
 * harness's cost stress test: if it survives the conservative cost model, the cost model
 * isn't being kind to it.
 *
 * Rule: among names above their 200d SMA, buy the most oversold (RSI-2 < 25), capped at
 * 10 equal-weight positions. Daily rebalance: a name is dropped once it is no longer
 * oversold, which mechanically realizes the bounce.
 */
import type { Strategy, StrategyContext, StrategySignal } from "./types";
import { rsi, sma } from "./indicators";
import { isBroadETF } from "./universe";
import { liquidEquities } from "./screens";

const MAX_POSITIONS = 10;

export const shortTermReversal: Strategy = {
  key: "st_reversal",
  name: "Short-Term Reversal (RSI-2 dip-buy)",
  family: "mean_reversion",
  description:
    "Buy the most oversold names (RSI-2 < 25) that remain above their 200d SMA, up to 10 equal-weight; exit as they un-oversold. High turnover — a deliberate cost test.",
  rebalanceDays: 1,
  warmupBars: 210,
  longOnly: true,
  instrument: "equity",
  generate(ctx: StrategyContext): StrategySignal {
    const cands: { s: string; r: number }[] = [];
    const pool = [...liquidEquities(ctx, 200), ...ctx.universe.filter(isBroadETF)];
    for (const s of pool) {
      const c = ctx.closes(s);
      const r = rsi(c, 2);
      const sm = sma(c, 200);
      if (r != null && sm != null && c[c.length - 1] > sm && r < 25) cands.push({ s, r });
    }
    if (cands.length === 0) return { weights: [], confidence: 0.3, notes: "No oversold setups — cash" };
    cands.sort((a, b) => a.r - b.r); // most oversold first
    const top = cands.slice(0, MAX_POSITIONS);
    const w = (1 / top.length) * 0.95;
    return {
      weights: top.map((x) => ({ symbol: x.s, weight: w, reason: `RSI2 ${x.r.toFixed(0)}` })),
      confidence: 0.45,
      notes: `${top.length} oversold dip-buys`,
    };
  },
};
