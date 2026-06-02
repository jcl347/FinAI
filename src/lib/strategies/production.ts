/**
 * Production source-of-truth for the live automated system.
 *
 * The website, the Vercel cron daily-runner, and the offline backtest ALL import this so
 * they trade the identical sleeves, priors, and allocator config. Change it here → it
 * changes everywhere, and the sim can never silently diverge from what was backtested.
 *
 * PRIORS are each sleeve's full-period backtest Sharpe (research/results.md) — the stable
 * anchor the allocator shrinks the noisy trailing window toward.
 */
import type { Strategy } from "./types";
import { STRATEGIES } from "./registry";
import { createMetaStrategy, type PerfProvider, type MetaStrategyHandle } from "./meta";
import { DEFAULT_ALLOCATOR, type AllocatorConfig } from "./allocator";

/** Backtest Sharpe priors (from the executed walk-forward, research/results.md). */
export const STRATEGY_PRIORS: Record<string, number> = {
  xs_momentum: 1.04,
  low_vol: 0.91,
  factor_momentum: 0.9,
  sector_rotation: 0.66,
  ts_trend: 0.61,
  cross_asset_trend: 0.57,
  st_reversal: 0.22,
  tail_hedge: 0.06,
};

/** Production allocator config (tuned + literature-anchored: equal-risk base, light tilt). */
export const PRODUCTION_ALLOCATOR: AllocatorConfig = { ...DEFAULT_ALLOCATOR };

/** Production book-level volatility target (annualized). The cheapest Sharpe/Calmar lever. */
export const PRODUCTION_VOL_TARGET = 0.1;

/** How often the meta re-allocates (trading days). Weekly keeps turnover sane. */
export const PRODUCTION_REBALANCE_DAYS = 5;

/** The sleeves the production system trades (the full registry). */
export const PRODUCTION_SLEEVES: Strategy[] = STRATEGIES;

/** Build the configured production meta-strategy around a performance provider. */
export function buildProductionMeta(perfProvider: PerfProvider): MetaStrategyHandle {
  return createMetaStrategy({
    subStrategies: PRODUCTION_SLEEVES,
    priors: STRATEGY_PRIORS,
    perfProvider,
    config: PRODUCTION_ALLOCATOR,
    rebalanceDays: PRODUCTION_REBALANCE_DAYS,
    volTargetAnnual: PRODUCTION_VOL_TARGET,
    key: "meta_production",
    name: "PutStrike Adaptive Multi-Strategy",
  });
}
