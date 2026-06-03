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
  // Expanded-universe additions (research/expanded-universe.md)
  resid_momentum: 0.44,
  lt_reversal: 0.16,
  sector_lt_reversal: 0.14,
  commodity_trend: 0.43, // full-sample; honest read is a small low-ρ inflation/real-asset diversifier
};

/** Production allocator config (tuned + literature-anchored: equal-risk base, light tilt). */
export const PRODUCTION_ALLOCATOR: AllocatorConfig = { ...DEFAULT_ALLOCATOR };

/** Production book-level volatility target (annualized). The cheapest Sharpe/Calmar lever. */
export const PRODUCTION_VOL_TARGET = 0.1;

/** How often the meta re-allocates (trading days). Weekly keeps turnover sane. */
export const PRODUCTION_REBALANCE_DAYS = 5;

/**
 * Long-only projection of the blended book. The L/S diversifier sleeves (resid_momentum, lt_reversal,
 * sector_lt_reversal) still contribute their LONG legs; net-negative symbols are clamped to 0. MEASURED
 * (scripts/backtest/ls-ab.ts): genuine L/S is WORSE — long-only OOS Sharpe 0.87 / MaxDD 12.4% vs genuine
 * L/S OOS Sharpe 0.76 / MaxDD 15.0% (the weak free-data short legs add borrow + squeeze risk for no
 * OOS net-of-β payoff). So the cash-secured, leverage-free long-only book is retained. The SAME flag
 * drives the backtest engine AND the live runner, so the deployed cron can never silently diverge.
 */
export const PRODUCTION_LONG_ONLY = true;

/** Max gross exposure cap passed to the engine (long-only book ⇒ 1.0; raise if PRODUCTION_LONG_ONLY=false). */
export const PRODUCTION_MAX_GROSS = 1.0;

/** The sleeves the production system trades (the full registry). */
export const PRODUCTION_SLEEVES: Strategy[] = STRATEGIES;

/** Build the configured production meta-strategy around a performance provider. */
export function buildProductionMeta(perfProvider: PerfProvider, longOnly = PRODUCTION_LONG_ONLY): MetaStrategyHandle {
  return createMetaStrategy({
    subStrategies: PRODUCTION_SLEEVES,
    priors: STRATEGY_PRIORS,
    perfProvider,
    config: PRODUCTION_ALLOCATOR,
    rebalanceDays: PRODUCTION_REBALANCE_DAYS,
    volTargetAnnual: PRODUCTION_VOL_TARGET,
    longOnly,
    key: "meta_production",
    name: "PutStrike Adaptive Multi-Strategy",
  });
}
