# research/brief.md — The Research Brief (grounding for the agent fleets)

> **Role:** This is the fixed brief for the agent-orchestration research loop. It sets the
> *goal* and the *grounding facts*; the agents evolve the *strategies*. Modeled on Karpathy's
> autoresearch (human writes the brief, agents make the moves) and Research_Analyzer's
> adversarial discipline (discovery kept separate from red-team critique).

## Goal

Discover **alternative, automatable investment strategies beyond cash-secured put selling**,
then converge — through adversarial testing — on a **unique algorithm** that PutStrike can run
**daily, automatically, on simulated capital**, tracking P&L over time. The new strategies should
be **orthogonal or complementary** to the existing put-selling edge, not a restatement of it.

## What PutStrike already is (the incumbent)

A cash-secured-put optimizer. Its edge is **harvesting the options volatility-risk premium**
(selling rich IV, theta decay) filtered by an 8-factor score + a per-stock iTransformer price
forecast. Horizon: 30–45 DTE. The simulation layer (Neon Postgres) already paper-trades puts and
tracks win rate / profit factor / drawdown / capital.

**We are NOT trying to improve put selling.** We are trying to add *new signal families*.

## Hard grounding facts (data + infra already in the repo — agents must respect these)

**Already available, free, daily, no new infra:**
- `yahoo-finance2`: OHLCV (10y daily), quotes (beta, P/E, mktcap, 52w, div yield), **full options
  chains** (every expiry/strike, bid/ask/IV/OI/volume), VIX & macro tickers.
- **Black-Scholes** engine (`black-scholes.ts`): analytic Greeks + IV solver. Can price any option.
- **154–172 engineered features** per stock (`itransformer-features.ts`): technicals, macro,
  regime, gamma-squeeze proxies, sentiment, FRED, tail risk, style rotation.
- **Per-stock iTransformer forecasts** (`hf-model.ts`): 60-day price path + directional-accuracy
  confidence, already computed in the UI.
- **6-model statistical ensemble** (`prediction.ts`): mean-reversion, momentum, volatility,
  options-implied, technical, sentiment — each emits a directional signal.
- **FRED** macro (rates, credit, FX, stress), **Wikipedia** pageviews (retail attention),
  **FINRA** short-volume, **Finnhub** insider MSPR. All free/daily.
- **Universe:** ~80 high-liquidity optionable large-caps + sector/broad ETFs.
- **Persistence:** Neon Postgres; a `simulated_trades` + `capital_events` schema that can be
  generalized to any instrument (equity, option, spread, pair).

**Can be added cheaply if justified** (free, daily, programmatic): ETF constituents for
cross-sectional ranking, sector ETFs (already partly used), index membership, dividend/earnings
calendars (limited history), Treasury/factor proxies via ETFs (IWF/IWD/MTUM/QUAL/USMV/VLUE).

**Out of scope (rejected for this repo — already vetted in put_strike/CLAUDE.md):** paid tick
data, intraday/HFT, anything needing a live broker, true L2 order book, paid sentiment feeds,
Google Trends (fragile), short interest history (lagged), AAII (paywalled).

## Constraints every candidate strategy must satisfy

1. **Daily decision cadence.** Signals computed once/day on EOD data; positions held days→months.
   No intraday execution assumptions.
2. **Simulatable with the data above.** If it needs data we can't get free + daily, it's out.
3. **Capital-aware & sized.** Must fit a fixed starting capital with position sizing and risk caps.
4. **Cost-survivable.** Edge must survive realistic frictions (commissions, bid/ask, slippage,
   options spread, assignment). Red-team will attack this hardest.
5. **Not data-snooped.** Must rest on an economic mechanism (risk premium, behavioral bias,
   structural flow), not a curve-fit backtest. State the mechanism.
6. **Orthogonal-ish to put selling.** Prefer signals/returns uncorrelated with short-vol theta.

## The single fair metric (analog of Karpathy's `val_bpb`)

Every strategy candidate and hypothesis is graded 0–10 on each axis; total 0–60. Graded harshly.

`total = Edge + Orthogonality + DataAvailability + CostRobustness + Implementability + Testability`

- **Edge** — is there a real, mechanism-backed expected return? (not just a backtest)
- **Orthogonality** — return stream distinct from short-vol/put-selling and from the other picks.
- **DataAvailability** — computable *today* from the grounding data, daily, free.
- **CostRobustness** — survives commissions + spread + slippage + capacity at retail size.
- **Implementability** — fits the existing TS/Next.js engine + Neon sim in reasonable effort.
- **Testability** — has a crisp falsifier we can probe with our own data/backtest now.

`Orthogonality` and `CostRobustness` are the load-bearing adversarial axes — they force every
candidate past the skeptic's null ("this is just put-selling in disguise" / "the edge is eaten by
costs"). An idea only scores high if a skeptical quant could not dismiss it on those grounds.

## Loop (deterministic control flow; agents do the creative work)

```
discover  → N strategy-scout agents, one strategy family each (web + reason over our data)
formalize → falsifiable spec per surviving candidate (signal, entry/exit, horizon, sizing, costs)
red-team  → adversarial agents try to KILL each spec (costs, capacity, snooping, regime, decay)
score     → harsh reviewer grades the composite metric; keep > threshold
synthesize→ main loop combines the survivors into ONE unique algorithm (the deliverable)
validate  → second fleet: data probes + final red team on the converged algorithm
```

## Deliverable

`research/algorithm.md` — the converged unique algorithm: its signals, the ensemble/decision rule,
position sizing & risk, the instruments it trades (equity and/or defined-risk options), and the
exact daily automation contract. Then it is **implemented** into `put_strike/` and runs on a
schedule against simulated capital, tracked over time.
