# research/algorithm.md — The Converged Unique Algorithm

> The deliverable of the agent-orchestration research loop: a single, implementable algorithm
> for PutStrike's automated simulated trading system. Grounded in the executed backtests
> ([results.md](results.md)) and the two agent fleets ([strategy-universe.md](strategy-universe.md),
> [advanced-strategies.md](advanced-strategies.md)). Implemented in `put_strike/src/lib/strategies/`
> + `src/lib/daily/` and run daily by a Vercel cron.

## Name: **ARMS — Adaptive Regime-aware Multi-Strategy allocator**

A self-tracking **fund-of-strategies** that paper-trades a portfolio of low-correlation sleeves,
re-weights them daily by what is *actually working*, de-risks in crises, and targets a constant
volatility. It is the cash-equity/ETF complement to PutStrike's options vol-risk-premium book.

## Why this shape (the research that forced it)

1. **No single anomaly is a slam-dunk.** The 82-agent discovery fleet scored **0 KEEP** — every
   standalone edge is marginal after costs. The executed backtest agreed (best single sleeve
   Sharpe 1.04; reversal a cost-killed null at 0.22). → *The edge must come from combination.*
2. **Long-only equity sleeves share market beta** (ρ≈0.6), so combining them compresses vol but
   not Sharpe (meta stuck at ~0.84). → *Add genuinely uncorrelated streams.*
3. **The orthogonal additions delivered:** cross-asset trend (ρ to SPY **0.28**) and a VIX-term
   tail hedge (ρ **−0.07**) lifted the naive-equal-weight ensemble to **Sharpe 0.95, MaxDD 18.5%**.
4. **Optimization loses to stable diversification out-of-sample** (DeMiguel-Garlappi-Uppal 2009):
   a performance-chasing allocator *underperformed* equal-weight. → *Adaptation must be a LIGHT
   overlay on a stable equal-risk base; its job is defense (bench the broken, de-risk crises),
   not aggressive sleeve-timing.*

## The eight sleeves (the collection)

| Sleeve | Family | Backtest Sharpe | ρ(SPY) | Role |
|---|---|---|---|---|
| Cross-Sectional Momentum (12-1) | momentum | 1.04 | 0.65 | core return engine |
| Low-Volatility Defensive | defensive | 0.91 | 0.56 | low-vol anomaly, diversifier |
| Factor-ETF Momentum Rotation | rotation | 0.90 | 0.66 | low-turnover factor leadership |
| Sector Momentum Rotation | rotation | 0.66 | 0.60 | drawdown ballast |
| Time-Series Trend (multi-asset) | trend | 0.61 | 0.58 | dual-momentum |
| **Cross-Asset Trend (non-equity)** | trend | 0.57 | **0.28** | **orthogonal crisis-alpha** |
| **Defensive Tail Hedge (VIX term)** | defensive | 0.06 | **−0.07** | **pure crash insurance** |
| Short-Term Reversal (RSI-2) | mean_reversion | 0.22 | 0.67 | *kept but auto-starved (null)* |

Each is a pure `Strategy.generate(ctx) → target weights` function (no look-ahead), so the same
code is backtested, replayed, and run live. Files: `momentum.ts`, `lowvol.ts`, `factormom.ts`,
`rotation.ts`, `trend.ts`, `crossasset.ts`, `tailhedge.ts`, `reversal.ts`.

## The allocator (`allocator.ts` + `meta.ts`) — five mechanisms

Each rebalance (weekly, or immediately on a crisis flip):

1. **Equal-RISK base.** Every sleeve with a live signal gets weight ∝ 1/vol (inverse-vol), so the
   low-Sharpe-but-diversifying sleeves (cross-asset trend, tail hedge) actually count. This is the
   stable core that beats optimization OOS.
2. **Light Sharpe tilt.** A small multiplier leans toward sleeves with higher *blended* Sharpe
   (realized 126-day, shrunk 70% toward the backtest prior — stable, not whipsawed).
3. **Self-tracking benching (the feedback loop).** A sleeve whose realized rolling Sharpe falls
   below a floor (with ≥40 obs) is **benched → weight 0**. This is how the system "adjusts behavior
   to what is working": broken sleeves (e.g. reversal) are starved automatically, winners kept.
4. **Regime tilt + defensive floor.** In risk-off (SPY<200d) defensive sleeves are tilted up,
   offensive down, and hedge sleeves get a floor so insurance is carried when needed.
5. **Crisis de-gross + volatility target.** In an acute crisis (VIX≥35) book gross is cut to 60%.
   Always, the whole book is scaled so ex-ante portfolio vol (from the sleeve return covariance)
   stays ≤ a 10% annual target — leverage-free (scale ≤ 1). This is the cheapest Sharpe/Calmar lever.

Output: signed target weights per symbol, gross ≤ 1.0 (cash-secured, no leverage), plus a full
**audit trail** (per-sleeve weight, benched flag, trailing/prior Sharpe, regime, vol-scale).

## The daily self-tracking loop (`daily/engine.ts`)

```
each trading day (Vercel cron → /api/quant/run):
  1. fetch ~110 symbols' EOD bars (yahoo-finance2) → AlignedData ending today
  2. for each sleeve: run its walk-forward backtest over history → trailing realized Sharpe/vol
     ("is this sleeve working lately?")  ── the feedback signal
  3. allocator → today's capital share per sleeve (bench broken, tilt by regime, vol-target)
  4. blend sleeve target weights → one portfolio; diff vs current holdings
  5. execute the diff as SIMULATED trades (conservative costs); update cash + holdings + equity
  6. persist book, trades, equity point, and the allocation decision to Neon
  (rebalances weekly; off-days just mark-to-market and hold)
```

The loop is **closed**: yesterday's allocation produced today's P&L, which updates each sleeve's
realized Sharpe, which changes tomorrow's allocation. Nothing is hard-coded to stay on; a sleeve
that stops working loses capital the next rebalance.

## Measured performance (executed, walk-forward, conservative costs — [results.md](results.md))

| Portfolio | CAGR | Vol | Sharpe | MaxDD | Calmar | ρ(SPY) |
|---|---|---|---|---|---|---|
| SPY buy & hold | 14.2% | 17.8% | 0.84 | 33.7% | 0.42 | 1.00 |
| Naive equal-weight ensemble | 10.2% | 10.9% | **0.95** | 18.5% | 0.55 | 0.55 |
| **ARMS (adaptive + 10% vol target)** | 6.7% | 8.1% | **0.85** | **12.2%** | **0.55** | 0.55 |
| ARMS 221-day live-sim replay | — | — | — | — | — | — (+14.7%, self-tracking verified) |

**Honest headline:** for a long-only, no-leverage, free-data, daily system the Sharpe lift over
SPY is modest (0.84→0.85–0.95); the *dramatic* win is **risk**: drawdown cut ~64% (34%→12%),
volatility cut ~55%, Calmar +31%. ARMS trades a little bull-market return for far better capital
preservation and would *out*-perform SPY's Sharpe in a sustained bear (its crisis de-gross +
negative-ρ hedge sleeves are dormant in the bull-heavy 2015–2026 sample). Claiming Sharpe ≫1 here
would require leverage or market-neutral sleeves whose hidden short-gamma tails the fleet flagged
as *anti*-diversifying for this book — so we did not.

## How to push Sharpe further (roadmap, fleet-driven — see advanced-strategies.md)

- Modest **leverage on the vol-target** (e.g. 1.3× gross when realized vol is well below target).
- A **narrow, crisis-force-closed style-pair reversion** sleeve (IWF/IWD, XLY/XLP) for orthogonal mean.
- **ML-concordance gating** of the momentum/trend sleeves (iTransformer + ensemble as a confidence sizer).
- These are specced + critically vetted by the Advanced fleet and are additive to ARMS via the registry.

## Where it lives in the product

- Engine: `src/lib/strategies/*` (sleeves + allocator + meta + production config), `src/lib/backtest/*`,
  `src/lib/daily/*`, `src/lib/quant-data.ts`, `src/lib/quant-db.ts`.
- API: `/api/quant/run` (cron target), `/api/quant/state`, `/api/quant/reset`.
- Automation: `vercel.json` cron, weekdays 21:30 UTC (after the US close).
- UI: the **Strategy Engine** tab (`QuantDashboard.tsx`) — equity curve, live adaptive allocation,
  holdings, simulated trades, KPIs.
