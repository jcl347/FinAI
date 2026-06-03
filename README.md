# PutStrike — Adaptive Multi-Strategy Automated Trading (simulation)

A Next.js app that runs **ARMS** — an *Adaptive Regime-aware Multi-Strategy* engine that paper-trades a
portfolio of low-correlation quant sleeves and **adapts daily to what is working** — plus a research-backed
**cash-secured put analyzer**. Live market data, daily adaptive allocation on a Vercel cron, and full
simulated-trade tracking. **Simulation only — no real orders are placed.**

## What it does

1. **Strategy Engine (ARMS)** — 12 low-correlation sleeves: cross-sectional momentum, low-volatility,
   factor-ETF momentum, sector rotation, multi-asset trend, **cross-asset trend**, a **VIX-term tail hedge**,
   three market-neutral diversifiers (**residual-momentum**, **long-term reversal**, **sector long-term reversal**),
   and a **commodity-trend** real-asset diversifier. They rank within a **liquidity-screened ~430-name universe**
   plus multi-asset ETFs, using free **unique data** (CBOE SKEW/VVIX, oil/gold implied vol, the Treasury curve,
   the US-dollar index). A self-tracking allocator measures each sleeve's realized rolling Sharpe daily, weights
   by an equal-risk base + light tilt, **benches sleeves that stop working**, de-risks in crises, and targets ~10%
   volatility — all leverage-free. A Vercel cron runs it daily and persists the book + every simulated trade to Neon.
2. **Cash-Secured Put Analyzer** — screens high-liquidity stocks, scores put-selling opportunities with a
   research-validated 8-factor model (tastytrade, DataDrivenOptions, CBOE, Schwab research), a 14-rule
   decision checklist, and a separate put-trade simulation journal.

## Measured performance (walk-forward, **out-of-sample-validated**, conservative costs)

| Portfolio | Sharpe | MaxDD | Calmar |
|---|---|---|---|
| SPY buy & hold | 0.84 | 33.7% | 0.42 |
| **ARMS — out-of-sample (>2021)** | **0.95** | **9.65%** | **0.77** |

The honest, out-of-sample Sharpe is **~0.95** — roughly SPY's risk-adjusted return at **~⅓ the drawdown**.
The win is capital preservation, not raw Sharpe over SPY. (An earlier "1.14" was found by an internal method
audit to be inflated by a look-ahead bug + survivorship bias and was corrected.) A 114-agent search confirmed
**Sharpe 2.0 is not reachable** from free daily data with no leverage and no real options chains — leverage
can't help (Sharpe is scale-invariant). Full faithful trail, the mistakes corrected, and what 2.0 would
actually take: [`research/sharpe2-quest.md`](research/sharpe2-quest.md) and [`CLAUDE.md`](CLAUDE.md).

## Architecture

```
Frontend (Next.js 15 / React 19 / Tailwind v4)
  Strategy Engine tab  -> equity curve, live adaptive allocation, holdings, simulated trades
  Analyze / Screen     -> cash-secured put scoring + decision checklist
  Put Trades           -> put-selling simulation journal
        |
API (Next.js App Router, force-dynamic)
  /api/quant/run     -> daily ARMS run (Vercel cron target) . /state . /reset
  /api/analyze /screen /screen-single /options /search /health
  /api/trades/*      -> put-selling simulation CRUD + stats + capital
        |
Engine (src/lib)
  strategies/  sleeves + adaptive allocator + meta + production config
  backtest/    walk-forward no-look-ahead engine + costs + metrics + synthetic options
  daily/       live perf provider + pure daily-run core (shared by cron + local)
  scoring.ts black-scholes.ts yahoo-finance.ts fred/finra/finnhub/wikipedia
        |
Data: yahoo-finance2 (quotes, options, OHLCV, macro) . FRED . Neon Postgres (persistence)
```

## Agent fleet (how the strategies were discovered, stress-tested & validated)

Every strategy in this system was discovered and adversarially validated by **agent orchestration** (9 fleet
runs, ~670 subagents). The structure is **execution-anchored**: agents *bracket* the work — ideate before,
attack after — while the main loop runs the real backtests, so a claim never ships until it meets data.

```
                          ┌──────────────────── research/brief.md (goal + grounding + the 0–60 metric) ───────────────────┐
                          │                                                                                              │
   ┌──────────┐   ┌───────▼────────┐   ┌─────────────────┐   ┌──────────────────────┐   ┌──────────────┐   ┌────────────▼─────────┐
   │  SCOUT   │──▶│   FORMALIZE    │──▶│    MAIN LOOP    │──▶│      RED-TEAM        │──▶│  SYNTHESIZE  │──▶│   IMPLEMENT + SHIP   │
   │ N agents │   │ codeable spec  │   │ EXECUTES the    │   │ N adversaries attack │   │ panel ranks  │   │ register sleeve /    │
   │ 1 idea   │   │ + TS skeleton  │   │ real backtest   │   │ the EXECUTED result: │   │ survivors;   │   │ allocator change /   │
   │ each     │   │ + falsifier    │   │ (OOS · net-of-β │   │ look-ahead? regime-  │   │ honest verdict│   │ opportunity signal,  │
   └──────────┘   └────────────────┘   │  · ρ-to-book)   │   │ concentration? cost? │   └──────────────┘   │ then re-validate     │
        ▲                              │ + KILL-TESTS    │   │ survivorship? tail-ρ?│                       └──────────────────────┘
        │                              └────────┬────────┘   └──────────┬───────────┘
        └──────────────── the loop repeats per phase; the main loop's executed numbers are the ground truth ┘

   The 9 fleet runs (research/README.md):
     1. Strategy Discovery (82)          6. Novel-Options + Universe (141)
     2. Advanced High-Sharpe (115)       7. Options-First Regime Robustness (136)
     3. Implementation Review (9)        8. Expanded-Universe (32)
     4. Method Audit & Correction (21)   9. Diversification + Opportunity Signals (17)
     5. Uncorrelated-Sleeve Discovery (114)
```

**What the fleets proved (honestly):** ~0.9 OOS Sharpe is the ceiling for free daily data + no leverage; the
diversification win is **adding orthogonal return streams (the VRP/put sleeve) + a light adaptive allocator**,
NOT a fancier optimizer (HRP / min-variance / max-diversification all *lost* to naive equal-risk — DeMiguel 2009).
Full trail: [`research/README.md`](research/README.md) and the per-fleet `research/*.md` files.

## Quick start

```bash
npm install
npm run dev          # http://localhost:3000
npm run build        # production build (type-check + lint)
npx jest             # validation tests (scoring + Black-Scholes)
```

## Deploy to Vercel — automatic daily trading + tracking (step by step)

The system trades **all 12 sleeves in simulation every weekday** on a cron, persists the book + every trade to
Neon, and surfaces **ranked investment-opportunity signals** in the dashboard. To stand it up:

1. **Database.** Connect a **Neon Postgres** DB in the Vercel **Storage** tab → `DATABASE_URL`/`POSTGRES_URL`
   auto-inject. The `quant_*` tables (book, holdings, trades, equity, allocations, **signals**) and the
   `simulated_trades` (put journal) schema **auto-create on first request** — no migration step.
2. **Env (optional).** `CRON_SECRET` (the `/api/quant/run` route requires the `Authorization: Bearer <secret>`
   header that Vercel Cron sends), `QUANT_INITIAL_CAPITAL` (default 100000), `FRED_API_KEY`/`FINNHUB_API_KEY`.
3. **Deploy + schedule.** `vercel.json` already runs `/api/quant/run` **weekdays 21:30 UTC** (after the US
   close). The cron each day: fetches the lean live universe (`PRODUCTION_UNIVERSE`, concurrency 10, with a
   coverage guard that HOLDS rather than trade a degraded pool), runs the adaptive meta-allocator over the 12
   sleeves, executes the simulated trades, **computes the day's opportunity signals**, and persists everything.
   `maxDuration` is 300s → needs **Vercel Pro** (on Hobby, cap at 60s and trim `EQUITY_UNIVERSE`).
4. **Seed + watch.** Open the **Strategy Engine** tab → **Run Daily Now** to seed day one, then watch: the equity
   curve, the live adaptive allocation (which sleeves are funded vs benched + why), holdings, simulated trades,
   and the **Investment-Opportunity Signals** panel (every sleeve + any live puts, ranked by
   *signal × regime-fit × marginal-diversification*).
5. **Options / VRP.** The **Analyze / Screen** tab scores cash-secured puts on the live chain (the VRP stream);
   the **Put Trades** tab is its simulation journal. The VRP sleeve's realized P&L is the live-feedback seam that
   feeds the allocator (the daily run accepts live put opportunities via `opts.puts`).

**Verify the automation end-to-end locally** (no DB, no keys): `scripts/daily/run.ts` replays the exact cron
logic against a file-backed book.

## Local backtesting (no API keys needed)

```bash
node --use-system-ca --no-warnings --import ./scripts/register-ts.mjs scripts/backtest/run.ts        # single sleeves
node --use-system-ca --no-warnings --import ./scripts/register-ts.mjs scripts/backtest/portfolio.ts  # combined ARMS
node --use-system-ca --no-warnings --import ./scripts/register-ts.mjs scripts/daily/run.ts --seed 200 # replay the daily loop
```
These run the website's TypeScript directly via a tiny ESM hook; `--use-system-ca` trusts the local cert for
the Yahoo data fetch. Production uses `yahoo-finance2` instead — identical data shape, identical signals.

## Disclaimer

Research/education tool. **Simulation only — no real orders.** Options and stock trading involve substantial
risk of loss. Past performance does not guarantee future results. Always do your own research.
