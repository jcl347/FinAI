/**
 * Transaction-cost model for the backtest + live sim.
 *
 * The red-team's #1 attack on every retail strategy is "the edge is eaten by costs."
 * So costs are first-class and deliberately CONSERVATIVE (pessimistic) — we would
 * rather understate a strategy's edge than overstate it.
 */

export interface CostModel {
  /** Round-trip bid/ask cost as a fraction of notional traded (per side). */
  spreadBpsPerSide: number;
  /** Slippage/impact as a fraction of notional traded (per side). */
  slippageBpsPerSide: number;
  /** Flat commission per equity trade (Schwab/most retail = $0). */
  commissionPerTrade: number;
  /** Annual borrow cost on short notional (charged daily). */
  shortBorrowAnnualBps: number;
  /** Per-contract commission for options (Schwab ≈ $0.65/contract). */
  optionCommissionPerContract: number;
}

/** Default retail-equity cost assumptions (intentionally a touch pessimistic). */
export const DEFAULT_COSTS: CostModel = {
  spreadBpsPerSide: 3, // ~6 bps round trip on liquid large-caps/ETFs
  slippageBpsPerSide: 2, // ~4 bps round trip impact for small retail size
  commissionPerTrade: 0,
  shortBorrowAnnualBps: 50, // 0.50%/yr borrow on easy-to-borrow large caps
  optionCommissionPerContract: 0.65,
};

/** Cost (in $) of trading `dollarsTraded` of notional in one direction. */
export function tradeCost(dollarsTraded: number, m: CostModel): number {
  const notional = Math.abs(dollarsTraded);
  if (notional === 0) return 0;
  const bps = (m.spreadBpsPerSide + m.slippageBpsPerSide) / 10000;
  return notional * bps + m.commissionPerTrade;
}

/** Daily borrow cost (in $) on a short position of `shortNotional`. */
export function dailyBorrowCost(shortNotional: number, m: CostModel): number {
  if (shortNotional >= 0) return 0;
  const daily = m.shortBorrowAnnualBps / 10000 / 252;
  return Math.abs(shortNotional) * daily;
}
