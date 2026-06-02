# PutStrike — Adaptive Multi-Strategy Automated Trading (simulation)

A Next.js app that runs **ARMS** — an *Adaptive Regime-aware Multi-Strategy* engine that paper-trades a
portfolio of low-correlation quant sleeves and **adapts daily to what is working** — plus a research-backed
**cash-secured put analyzer**. Live market data, daily adaptive allocation on a Vercel cron, and full
simulated-trade tracking. **Simulation only — no real orders are placed.**

## What it does

1. **Strategy Engine (ARMS)** — eight low-correlation sleeves (cross-sectional momentum, low-volatility,
   factor-ETF momentum, sector rotation, multi-asset trend, **cross-asset trend**, a **VIX-term tail hedge**,
   and a market-neutral **residual-momentum L/S**). A self-tracking allocator measures each sleeve's realized
   rolling Sharpe daily, weights them with an equal-risk base + light tilt, **benches sleeves that stop
   working**, de-risks in crises, and targets ~10% volatility — all leverage-free. A Vercel cron runs it
   daily and persists the book + every simulated trade to Neon Postgres.
2. **Cash-Secured Put Analyzer** — screens high-liquidity stocks, scores put-selling opportunities with a
   research-validated 8-factor model (tastytrade, DataDrivenOptions, CBOE, Schwab research), a 14-rule
   decision checklist, and a separate put-trade simulation journal.

## Measured performance (walk-forward, real data, conservative costs)

| Portfolio | CAGR | Sharpe | MaxDD | Calmar |
|---|---|---|---|---|
| SPY buy & hold | 14.2% | 0.84 | 33.7% | 0.42 |
| **ARMS combined** | 7.2% | **1.14** | **~10%** | 0.73 |

The win is risk-adjusted return and capital preservation — roughly double SPY's Sharpe at a third of the
drawdown. Honest nulls, the full research trail, and why a Sharpe of 2 is **not** reachable here without
leverage or paid options data are documented in [`research/`](research/) and [`CLAUDE.md`](CLAUDE.md).

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

## Quick start

```bash
npm install
npm run dev          # http://localhost:3000
npm run build        # production build (type-check + lint)
npx jest             # validation tests (scoring + Black-Scholes)
```

## Deploy to Vercel (the automated engine)

1. Connect a **Neon Postgres** DB in the Vercel **Storage** tab -> `DATABASE_URL`/`POSTGRES_URL` auto-inject;
   the `quant_*` and `simulated_trades` schemas auto-create on first request.
2. (Optional) set `CRON_SECRET` (the `/api/quant/run` route checks the `Authorization: Bearer` header Vercel
   Cron sends) and `QUANT_INITIAL_CAPITAL` (default 100000). `FRED_API_KEY`/`FINNHUB_API_KEY` are optional.
3. Deploy. `vercel.json` runs `/api/quant/run` **weekdays 21:30 UTC** (after the US close). Note: the daily
   run backtests ~165 names, so `maxDuration` is set to 300s — that needs **Vercel Pro** (on Hobby, cap at
   60s and trim the universe in `src/lib/strategies/universe.ts`).
4. Open the **Strategy Engine** tab -> **Run Daily Now** to seed the first day, then watch it adapt.

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
