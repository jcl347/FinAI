/**
 * Cross-sectional selection screens.
 *
 * Lesson from the expanded-universe push: naively widening the equity cross-section from ~165 to
 * ~430 names DEGRADED the book out-of-sample (position-level OOS Sharpe 0.91 → 0.66, net-β → −0.13).
 * The added breadth was mostly illiquid / recent-IPO / junk names that the momentum and residual-L/S
 * sleeves then bought (or shorted into squeezes). The wide pool is only an ASSET if cross-sectional
 * selection is restricted to genuinely TRADABLE names — so the equity sleeves rank within the liquid
 * core, not the whole tail. This recovers the dispersion benefit of breadth without importing junk.
 */
import type { StrategyContext } from "./types";
import { isEquity } from "./universe";

/**
 * The top-N most liquid equities by trailing median daily dollar-volume (close × volume).
 * No look-ahead: uses only bars with date ≤ ctx.date. N=200 is a fixed liquidity floor (chosen
 * a priori as a sane tradable count, NOT tuned to the holdout).
 */
export function liquidEquities(ctx: StrategyContext, topN = 200, lookback = 20): string[] {
  const rows: { s: string; dv: number }[] = [];
  for (const s of ctx.universe) {
    if (!isEquity(s)) continue;
    const bars = ctx.bars(s);
    if (bars.length < lookback) continue;
    const recent = bars.slice(-lookback).map((b) => b.close * b.volume).sort((a, b) => a - b);
    const med = recent[Math.floor(recent.length / 2)];
    if (med > 0) rows.push({ s, dv: med });
  }
  rows.sort((a, b) => b.dv - a.dv);
  return rows.slice(0, topN).map((r) => r.s);
}
