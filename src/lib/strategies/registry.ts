/**
 * Central registry of all tradable strategies. The backtest runner, the live daily
 * runner, and the meta-selector all iterate this list — add a strategy here and it flows
 * through the whole system (sim DB tagging, allocation, UI) automatically.
 */
import type { Strategy } from "./types";
import { crossSectionalMomentum } from "./momentum";
import { timeSeriesTrend } from "./trend";
import { shortTermReversal } from "./reversal";
import { lowVolatility } from "./lowvol";
import { sectorRotation } from "./rotation";
import { crossAssetTrend } from "./crossasset";
import { tailHedge } from "./tailhedge";
import { factorMomentum } from "./factormom";
import { residualMomentum } from "./residmom";
import { longTermReversal } from "./ltreversal";
import { sectorLongTermReversal } from "./sectorltrev";

export const STRATEGIES: Strategy[] = [
  // Cost-surviving long-only equity sleeves (proven in results.md)
  crossSectionalMomentum,
  lowVolatility,
  sectorRotation,
  factorMomentum,
  // Genuinely ORTHOGONAL diversifiers (the Sharpe-lift additions)
  crossAssetTrend,
  tailHedge,
  // Market-neutral L/S diversifiers (low/negative ρ to the momentum-heavy book)
  residualMomentum,
  longTermReversal,
  sectorLongTermReversal,
  // Kept for completeness; allocator starves it (cost-killed null)
  timeSeriesTrend,
  shortTermReversal,
];

export const STRATEGY_BY_KEY: Record<string, Strategy> = Object.fromEntries(
  STRATEGIES.map((s) => [s.key, s])
);

export function getStrategy(key: string): Strategy | undefined {
  return STRATEGY_BY_KEY[key];
}
