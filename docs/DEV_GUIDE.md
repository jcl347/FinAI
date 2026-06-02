# CLAUDE.md - Development Guide for PutStrike

## Project Overview

PutStrike is a Next.js 15 app (App Router) that optimizes cash-secured put option sales using live market data, company stability analysis, and a research-validated multi-factor scoring model. Deployed on Vercel.

## Commands

- `npm run dev` - Start development server
- `npm run build` - Production build (also runs TypeScript checking and linting)
- `npx jest` - Run 34 validation tests (scoring model + stability + Black-Scholes accuracy)
- `npx jest --watch` - Run tests in watch mode

## Architecture

### Core Engine (`src/lib/`)

- **`black-scholes.ts`** - Black-Scholes-Merton pricing model for European puts. Uses Abramowitz & Stegun 26.2.17 for the normal CDF (error < 7.5e-8). Newton-Raphson IV solver with bisection fallback. All Greeks computed analytically.

- **`scoring.ts`** - Multi-factor scoring engine. Ten dimensions across two categories:
  - **Option-Level** (6 factors): premium yield (20%), delta quality (15%), DTE quality (12%), liquidity (12%), distance OTM (12%), HV rank (9%)
  - **Company Stability** (4 factors): market cap (30% of stability), beta (30%), 52-week position (25%), dividend yield (15%)
  - Stability contributes 20% of overall score when available
  - Market regime modifier based on VIX
  - Outputs 0-100 score with recommendation (STRONG_SELL / SELL / NEUTRAL / AVOID)

- **`db.ts`** - Neon Postgres serverless connection via `@neondatabase/serverless`. Lazy schema initialization creates `simulated_trades` table on first API request. Auto-detects `DATABASE_URL` (manual) or `POSTGRES_URL` (Vercel auto-injected). Returns null gracefully when unconfigured — builds succeed without database.

- **`yahoo-finance.ts`** - Data provider wrapping yahoo-finance2. Includes:
  - Retry with exponential backoff for rate limiting resilience
  - Batch processing (3 symbols at a time with 1s delays) to avoid 429 errors
  - Fetches quotes (including beta, P/E), options chains, historical prices, VIX, symbol search
  - Uses `any` casts for yahoo-finance2 return types due to strict/complex generics

### API Routes (`src/app/api/`)

All routes are `force-dynamic` (no caching — live data).

- **`/api/analyze?symbol=AAPL`** - Deep analysis with stability scoring and stock context. Fetches multiple expirations (14-75 DTE window), computes Greeks via Black-Scholes, scores all OTM puts, returns sorted results with HV rank, stability assessment, market regime, and stock context (earnings, trend, support/resistance, RSI, ATR).

- **`/api/screen?symbols=AAPL,MSFT`** - Multi-stock screener with batch processing. Defaults to 18 high-liquidity stocks. Returns:
  - `top10`: Global top 10 put sales across all stocks (ranked by combined score)
  - `results`: Per-stock results with top 5 puts each
  - `failedSymbols`: Any symbols that failed to load (for status display)

- **`/api/options?symbol=AAPL`** - Raw options chain data with quote and VIX.

- **`/api/search?q=app`** - Symbol autocomplete search.

- **`/api/trades`** - Simulated trades CRUD (Neon Postgres). Requires `DATABASE_URL`.
  - `GET /api/trades?status=OPEN|all` - List trades
  - `POST /api/trades` - Create trade with auto-calculated tastytrade management targets (profit_target_price = 50% premium, stop_loss_price = 3x premium, management_date = expiration − 21d). Supports quantity (contracts).
  - `PUT /api/trades/[id]` - Close trade (status, closePrice, stockPriceAtClose → auto-calculates P&L)
  - `DELETE /api/trades/[id]` - Delete trade
  - `GET /api/trades/stats` - Aggregate statistics: win rate, profit factor, max drawdown, avg holding period, cumulative P&L timeline, monthly breakdown, per-symbol breakdown
  - `GET /api/trades/capital` - Capital summary: deposits, withdrawals, portfolio value, available capital, return on capital, capital deployed
  - `POST /api/trades/capital` - Add deposit or withdrawal event

### Frontend (`src/components/`)

Client-side React components with Tailwind CSS (v4). Dark theme only. Compact risk disclaimer banner at top of page.

- `SymbolSearch` - Debounced autocomplete with dropdown
- `MarketRegime` - VIX-based regime indicator (color-coded)
- `StockQuoteCard` - Quote display with beta, P/E, HV rank visualization
- `Top10Puts` - Ranked top 10 put sales with expandable details, stability scores, and cross-comparison guide (? button)
- `PutDecisionAssistant` - Severity-weighted go/no-go checklist (14 rules across 6 categories: Stock Selection, IV Timing, Chart Analysis, Strike Selection, Risk Management). Rules are classified as critical/important/informational to prevent minor flags from overriding safety signals.
- `PutTable` - Expandable table of scored puts with trade details
- `ScreenerResults` - Multi-stock collapsible results view with stability scores
- `SimulateTradeModal` - Modal to create a simulated put trade from any scored put row. Pre-fills all trade parameters. Includes quantity (contracts) selector, tastytrade management targets display (50% profit close, 2x credit stop, 21 DTE management), and position sizing summary (collateral, max gain, max loss).
- `TradesDashboard` - Full simulation trading analytics with SVG charts:
  - KPI cards (total P&L, win rate, profit factor, max drawdown, avg holding period, open trades)
  - Capital management section (deposits/withdrawals, portfolio value, available capital, capital deployed %)
  - Management alerts (21 DTE warnings, approaching expiration, tastytrade targets for each open trade)
  - Win rate donut chart (SVG)
  - Cumulative P&L line chart with trade dots (SVG)
  - Monthly P&L bar chart (SVG)
  - Per-symbol P&L breakdown with horizontal bars
  - Score vs outcome analysis (validates scoring model edge)
  - Trade history list with filter (all/open/closed), close trade modal (with quantity support), delete
- Data source status indicator (connected/degraded/down)

## Simulation Trading

### Overview

Simulation trading allows paper-trading put sales directly from scored put recommendations, tracking P&L and validating the scoring model's effectiveness over time.

### Database

Uses **Neon** (serverless Postgres) via `@neondatabase/serverless`. Schema is auto-created on first API request.

**Environment variables** (auto-detected, either works):
- `DATABASE_URL` — manual Neon connection string (`.env.local`)
- `POSTGRES_URL` — auto-injected by Vercel when you connect a database via the Storage dashboard

### Trade Lifecycle

1. **Open**: User clicks "Simulate Trade" on any scored put → modal pre-fills all parameters (including quantity) → tastytrade management targets auto-calculated → saved to DB
2. **Monitor**: Dashboard shows management alerts — 21 DTE roll/close warnings, approaching expiration, profit targets and stop losses for each open position
3. **Close**: User clicks "Close" on an open trade → selects outcome (Expired/Profit/Loss/Assigned) → P&L auto-calculated (quantity-aware)
4. **Track**: Dashboard shows cumulative P&L, win rate, profit factor, max drawdown, monthly performance, per-symbol breakdown, and score-vs-outcome analysis

### Management Targets (Research-Backed Defaults, Auto-Calculated)

- **Profit target**: Close at 50% profit (buy back at 50% of premium received). Default from tastytrade; 25% also validated for faster capital turnover.
- **Stop loss**: Stop at 2x credit loss (buy back at 3x premium). This is a tastytrade **starting guideline**, not an ironclad rule — contested by SJ Options backtests; some practitioners prefer wider stops or purely mechanical 21 DTE management.
- **Management date**: Roll or close at 21 DTE before expiration. **Most validated rule** across all sources — reduces gamma risk.
- These values are stored per-trade (`profit_target_price`, `stop_loss_price`, `management_date`)
- UI presents these as guidelines with research context, not rigid rules

### P&L Calculation

- **Expired** (worthless): P&L = premium × 100 × quantity (full profit)
- **Closed**: P&L = (premium received − close price) × 100 × quantity
- **Assigned**: P&L = premium × 100 × quantity − (strike − stock price at close) × 100 × quantity

### Capital Management

- **Deposits/Withdrawals**: Track capital added or removed from the simulation fund
- **Portfolio Value**: Net capital + realized P&L
- **Available Capital**: Portfolio value − capital deployed in open positions
- **Return on Capital**: Realized P&L / net capital deposited (%)
- Stored in `capital_events` table (type, amount, notes, created_at)

### Key Analytics

- **Win Rate**: % of closed trades with positive P&L
- **Profit Factor**: Gross wins / gross losses (tastytrade key metric; >1.0 = profitable system)
- **Max Drawdown**: Peak-to-trough from equity curve (calculated from cumulative P&L timeline)
- **Avg Holding Period**: Average days from open to close (split by winners/losers)
- **Score vs Outcome**: Compares average entry score for winners vs losers — validates the scoring model
- **Cumulative P&L Chart**: SVG line chart showing equity curve across all closed trades
- **Monthly P&L**: Bar chart of monthly returns
- **Per-Symbol Breakdown**: Horizontal bar chart ranked by total P&L per stock

### Schema

```sql
simulated_trades (
  id SERIAL PRIMARY KEY,
  symbol, company_name, strike_price, expiration, dte_at_entry,
  premium_received, stock_price_at_entry, delta_at_entry,
  score_at_entry, stability_score_at_entry, iv_rank_at_entry,
  collateral, quantity, status (OPEN/CLOSED_PROFIT/CLOSED_LOSS/ASSIGNED/EXPIRED),
  profit_target_price, stop_loss_price, management_date,
  vix_at_entry, market_regime_at_entry,
  close_price, stock_price_at_close, pnl, pnl_percent,
  closed_at, notes, created_at, updated_at
)

capital_events (
  id SERIAL PRIMARY KEY,
  type (DEPOSIT/WITHDRAWAL), amount, notes, created_at
)
```

## Key Design Decisions

1. **Scoring model over ML** - Research findings are well-established (tastytrade, DataDrivenOptions). A transparent weighted model is more interpretable and reliable than ML for this problem. The edge comes from filtering/timing, not prediction.

2. **Company stability as a scoring dimension** - When you sell a put, you agree to buy the stock. The underlying must be one you'd want to own if assigned. Beta, market cap, dividends, and 52-week position capture this.

3. **HV Rank as IV Rank proxy** - True IV rank requires historical IV data (not freely available). We compute 20-day rolling historical volatility rank as a proxy.

4. **Batch processing for rate limiting** - Yahoo Finance aggressively rate limits. Processing 3 symbols at a time with 1-second delays between batches + retry with exponential backoff prevents cascade failures.

5. **yahoo-finance2 for data** - Free, JS-native, community-maintained since 2013. v3 requires `new YahooFinance()` instantiation.

6. **Data source status display** - Shows connected/degraded/down status so users know when data is stale or unavailable. Lists failed symbols in degraded mode.

## Research References & Methodology Evaluation

### Entry Criteria (Strongly Validated)
- **Delta 14-22**: tastytrade 16 delta (1 SD) + DataDrivenOptions 20 delta. Both validated; 14-22 range captures the sweet spot. Spintwig: 16 delta with leverage has better Sharpe ratio than 30 delta.
- **DTE 30-45**: tastytrade 45 DTE + DataDrivenOptions 35-45 DTE. Both validated. Longer DTEs (60+) have diminishing theta efficiency.
- **IV Rank > 50**: Schwab data shows 56.8% win rate vs 48.2% unfiltered. Strongly validated.
- **VIX 15-25 optimal**: CBOE PUT index data. VIX >35 = crisis regime (ERN analysis).
- **Beta ≤ 1.2**: CBOE research shows lower-beta underlyings have higher put-selling win rates.

### Management Rules (Nuanced — NOT All Ironclad)
- **Profit target 25-50%**: STRONGLY VALIDATED. tastytrade Sept 2018 study: managing at 25%, 50%, or 21 DTE all outperform holding to expiration. 50% = higher absolute P/L. 25% = faster capital turnover. Key: managing at all matters more than the exact percentage.
- **21 DTE management**: MOST VALIDATED RULE. Universally agreed upon across tastytrade, DataDrivenOptions, Option Alpha. Gamma risk accelerates near expiration; rolling at 21 DTE reduces this exposure.
- **Stop loss at 2x credit (3x premium)**: CONTESTED GUIDELINE. tastytrade presents as starting point, not strict rule. SJ Options 11-year SPX backtest showed underwhelming results. Third-party tests suggest wider stops (3-4x) or mechanical 21 DTE management can outperform fixed stops. Some practitioners prefer no fixed stop, relying on 21 DTE management as the primary risk mechanism.
- **Never hold through earnings**: Strongly validated across all sources.

### Contract Sizing
- Standard US equity options = 100 shares per contract (OCC mandated). No exceptions for retail equity options.
- Mini options (10 shares) were introduced in 2013 for 5 symbols only, delisted by late 2014 due to poor liquidity and disproportionate commission costs.
- Small accounts should consider vertical spreads (bull put spreads) for lower capital requirements. Example: $400 margin for a 4-wide spread vs $13,000+ for a cash-secured put.

### Additional Sources
- Spintwig: SPY wheel backtests show Sharpe 1.08 vs 0.70 buy-hold
- Early Retirement Now: Wheel strategy struggles in prolonged bear markets (VIX >35 regime)
- Schaeffer's Research: Heavy OI at strikes creates support/resistance zones for strike selection
- Standard TA: RSI 30/70 standard boundaries; for put sellers, RSI >80 = high pullback risk
- Option Alpha: Similar framework to tastytrade, emphasizes "trade small, trade often" + automation

## Decision Assistant Rule System

The `PutDecisionAssistant` component implements a severity-weighted checklist in `evaluateChecklist()`. Rules have three severity levels:

- **Critical** (Earnings, VIX crisis, Trend, Moving Averages): A single critical fail → CAUTION; two → AVOID
- **Important** (IV Rank, Beta, Company Quality, Liquidity, Support): Two important fails → CAUTION
- **Informational** (Dividend, P/E, RSI, Volume, ATR, 52-Week): Provide context but rarely disqualify alone

Key research-backed thresholds:
- IV Rank: ≥50 pass, 30-49 warn, <30 fail (Schwab 56.8% win rate data)
- VIX: 15-30 pass, 30-35 warn, ≥35 fail (CBOE PUT index + ERN analysis)
- Beta: ≤1.2 pass, 1.2-1.5 warn, >1.5 fail (CBOE lower-beta research)
- RSI: 30-70 pass, 25-30/70-80 warn, <25/>80 fail
- Earnings: date found + outside window = pass, no date = warn, imminent = fail
- Dividend: >1.5% pass, all others warn (no fail — quality non-dividend stocks are valid)
- Volume: 0.5-2x avg = pass, extreme >3x or <0.3x = fail
- Support: 3-10% below price = pass (useful for strike placement)

To modify thresholds, edit `evaluateChecklist()` in `src/components/PutDecisionAssistant.tsx`.
To modify verdict logic, edit `getOverallVerdict()` — it uses severity-weighted fail counts.

## Modifying the Scoring Model

Weights are in `src/lib/scoring.ts` in the `scorePut()` function. Each factor has:
1. A raw score (0-100) computed from the candidate's attributes
2. A weight (all weights sum to 1.0)
3. A signal object for UI display

Company stability scoring is in `scoreCompanyStability()` with its own 4-factor model.

To adjust scoring:
- Change option-level weights in `scorePut()` (must sum to 0.80 when stability is present)
- Change stability sub-weights in `scoreCompanyStability()` (must sum to 1.0)
- Modify score thresholds in individual factor scoring blocks
- Adjust recommendation cutoffs (75/55/40)
- Modify regime multipliers in `classifyMarketRegime()`

Always run `npx jest` after changes to verify model behavior (31 tests).

## Common Issues

- **yahoo-finance2 errors**: The library may fail during market closures or for symbols with no options. Errors are caught per-symbol in the screener; the UI shows failed symbols.
- **Rate limiting**: The screener processes 3 stocks at a time with 1s delays. If Yahoo still throttles, reduce `batchSize` in `src/app/api/screen/route.ts`.
- **Type errors with yahoo-finance2**: The library has complex generics. We use `any` casts in `yahoo-finance.ts` — this is intentional for practicality.
- **v3 migration**: yahoo-finance2 v3 requires `new YahooFinance()` instead of the default export.

## Automated Multi-Strategy Engine (ARMS) — `src/lib/strategies`, `src/lib/backtest`, `src/lib/daily`

A second, self-contained system layered on top of the put-selling app: a **self-tracking, adaptive,
multi-strategy simulated trading engine** that runs daily on a Vercel cron. It is the cash-equity/ETF
complement to the options vol-risk-premium book. Designed via agent orchestration and backtested
unbiased on real data — see the repo-root `../research/` workspace and `../CLAUDE.md` for the full
research trail and `../research/algorithm.md` for the design rationale.

### The sleeves (`src/lib/strategies/*.ts`)

Eight pure `Strategy.generate(ctx) → signed target weights` functions (no look-ahead). Backtest
Sharpe (walk-forward, conservative costs) and correlation to SPY:

| key | file | Sharpe | ρ(SPY) | note |
|---|---|---|---|---|
| `xs_momentum` | momentum.ts | 1.04 | 0.65 | 12-1 cross-sectional momentum, SPY<200d→cash |
| `low_vol` | lowvol.ts | 0.91 | 0.56 | lowest-vol quintile (low-vol anomaly) |
| `factor_momentum` | factormom.ts | 0.90 | 0.66 | top-2 factor ETFs by 6m momentum (MTUM/QUAL/USMV/VLUE/SIZE/IWF/IWD) |
| `sector_rotation` | rotation.ts | 0.66 | 0.60 | top-3 sector SPDRs by 3m momentum |
| `ts_trend` | trend.ts | 0.61 | 0.58 | multi-asset dual momentum |
| `cross_asset_trend` | crossasset.ts | 0.57 | **0.28** | vol-scaled trend on NON-equity ETFs — orthogonal crisis-alpha |
| `tail_hedge` | tailhedge.ts | 0.06 | **−0.07** | long TLT/GLD on VIX backwardation — pure crash insurance |
| `st_reversal` | reversal.ts | 0.22 | 0.67 | RSI-2 dip-buy — **cost-killed null, auto-starved by the allocator** |

Add a sleeve: implement `Strategy`, export it from `registry.ts`, add a prior to `production.ts`.

### The adaptive allocator (`allocator.ts` + `meta.ts`)

`allocateStrategies(stats, regime, cfg)` returns each sleeve's capital share each rebalance:
**equal-risk base (∝1/vol)** so diversifiers count, **light Sharpe tilt** (realized 126d shrunk 70%
to the backtest prior), **benching** of sleeves whose realized Sharpe falls below a floor (the
self-tracking feedback loop — this is what starves the reversal null), **regime tilt + defensive
floor** in risk-off, **crisis de-gross** (VIX≥35 → 60% gross), and a **10% ex-ante volatility target**
(leverage-free). `createMetaStrategy(...)` blends the sleeve weights into one portfolio. Tunables live
in `DEFAULT_ALLOCATOR` / `production.ts`. Key empirical lesson baked in: a performance-chasing
allocator *underperforms* naive equal-weight out-of-sample (DeMiguel-Garlappi-Uppal 2009) — so
adaptation is a *light* overlay, and its real job is defense (bench broken sleeves, de-risk crises).

### Backtest engine (`src/lib/backtest/*`)

`runBacktest(strategy, alignedData, config)` is a no-look-ahead, weight-based portfolio simulator
with a conservative cost model (`costs.ts`: ~10bps round trip + 50bps/yr borrow) and standard metrics
(`metrics.ts`). `engine.ts` enforces that a strategy on day i only sees bars with date ≤ calendar[i].

### Daily run (`src/lib/daily/*`) + API + cron

`runDay(data, book, opts)` is the **pure** daily core (shared by the cron and the local harness): it
builds the live perf provider (`perf.ts` — runs each sleeve over the trailing window to measure "what's
working"), asks the production meta for today's target weights, diffs vs the book, and returns the
simulated trades + updated book + the full allocation decision. It rebalances weekly (or immediately on
a crisis flip); off-days just mark-to-market.

- `GET/POST /api/quant/run` — the **Vercel cron target** (`vercel.json` crons, weekdays 21:30 UTC).
  Fetches the universe via `quant-data.ts` (yahoo-finance2), loads the book from Neon, runs `runDay`,
  persists. Idempotent per trading day; `?force=1` re-runs. Honors `CRON_SECRET`.
- `GET /api/quant/state` — full dashboard payload (book, equity curve, allocations, holdings, trades, stats).
- `POST /api/quant/reset` — wipe + restart from a capital base.
- Persistence: `quant-db.ts` → `quant_book`, `quant_holdings`, `quant_trades`, `quant_equity`,
  `quant_allocations` (auto-created; separate from the put-selling `simulated_trades`).
- UI: the **Strategy Engine** tab (`QuantDashboard.tsx`).

### Local backtesting/sim without `npm install`

Run with Node 24 + the ESM hook (the source stays website-compatible; the hook only adds `.ts`
resolution at runtime), trusting the system CA for outbound Yahoo fetches:
```
node --use-system-ca --no-warnings --import ./scripts/register-ts.mjs scripts/backtest/run.ts    # sleeves
node --use-system-ca --no-warnings --import ./scripts/register-ts.mjs scripts/backtest/meta.ts   # meta vs SPY
node --use-system-ca --no-warnings --import ./scripts/register-ts.mjs scripts/daily/run.ts --seed 220
```
Production uses `yahoo-finance2` (no hook, no system-CA flag) — identical `Bar[]`/`AlignedData`.
