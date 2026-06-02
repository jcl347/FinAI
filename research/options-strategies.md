# research/options-strategies.md — Options Sleeves & the Sharpe-2 Push (honest)

> The "expand stocks + novel options strategies + target Sharpe 2" effort. Built a synthetic options
> backtester, expanded the universe to ~165 diverse optionable names, designed/red-teamed options
> sleeves (a dedicated agent fleet), and **measured** the result. Executed evidence is in
> [results.md](results.md) Run 3; machine data in [backtests/options-summary.json](backtests/options-summary.json)
> and [backtests/portfolio-summary.json](backtests/portfolio-summary.json).

## TL;DR (the honest answer to "Sharpe 2+")

**Not reachable honestly** with long-only/defined-risk, **no-leverage**, **free-daily-data**,
**offline-backtestable** sleeves. The push *did* produce a real, measured gain — **combined Sharpe 1.13,
MaxDD 8.7%, Calmar 0.80** (vs the prior 0.85–0.95) — but Sharpe 2 would require leverage or an
over-optimistic options assumption. We refuse to fake it.

## What was built

- **Expanded universe** (`universe.ts`): ~165 diverse optionable names (semis, software, internet,
  fintech, healthcare, more financials/industrials/energy, high-IV growth) + vol/credit/commodity ETPs
  (VXX, SVXY, VIXY, HYG, GDX, XBI, UNG). Effect: **strengthened the momentum alpha engine**
  (net-of-β Sharpe 0.54 → **0.60**, more cross-sectional dispersion) but **diluted low-vol** (0.91→0.81)
  and raised drawdown — a mixed bag, not a free boost.
- **Synthetic options backtester** (`backtest/options-sim.ts`): no free historical chains exist, so
  option P&L is Black-Scholes-synthesized from the real underlying path with IV = realized vol + a 3.5
  vol-point variance-risk premium; vol spikes raise the daily mark so the short-gamma crash tail shows
  up. Supports CSP, covered call, iron condor, short strangle, an uptrend entry filter, and conservative
  option costs. Reusable for live too (the live path uses the *real* chain via the existing app).
- **Returns-level portfolio combiner** (`scripts/backtest/portfolio.ts`): combines equity sleeves +
  options sleeves at the return level (options can't go through the weight engine), with the adaptive
  equal-risk + regime + vol-target allocation, **de-risking the short-vol sleeve hard in crises**.

## Measured results (faithful, incl. nulls)

| Sleeve / portfolio | Sharpe | MaxDD | Net-of-β | Verdict |
|---|---|---|---|---|
| Cross-sectional momentum (165 names) | 1.06 | 34% | **0.60** | improved alpha |
| Index CSP (SPY/QQQ/IWM/DIA) | −0.12 | 31% | −1.75 | **NULL (backtest)** |
| Index CSP + 200d uptrend filter | −0.33 | 35% | −1.62 | **NULL (backtest)** |
| Single-name CSP | −0.37 | 27% | −2.36 | **NULL (backtest)** |
| Iron condor / short strangle | −1.9 / −2.8 | ~100% | — | blow up |
| **Combined portfolio** | **1.13** | **8.7%** | 0.45 | **the honest high-water mark** |

## Why the options sleeves backtest as nulls (this is a finding, not a bug)

Verified by adding the documented trend filter (it did not help). A *conservative synthetic* backtest of
mechanical put-selling is break-even-to-negative because:
1. At 16-delta, ~16% of cycles finish ITM and the assignment losses ≈ the premium harvested after costs.
2. An RV+spread IV proxy does **not** capture the real, persistent IV-surface/skew richness that is the
   true VRP — and calibrating it upward to "make it work" would be **biasing the backtest to a target**.
3. The real edge requires PutStrike's **8-factor live filtering on the actual chain** (IV rank, skew,
   support, stability, earnings avoidance) — which can't be honestly replicated offline.

→ The options/VRP sleeve is **BUILD-for-LIVE** (the existing PutStrike put-scorer trades it on the real
chain, tracked in the sim DB) but **ASSERT-only for backtest** (we do not count a backtested options
Sharpe we cannot honestly produce). The short-vol crash tail (Feb-2018/Mar-2020) is real and must be
hedged by the convex tail-hedge sleeve — stacking short-vol flavors would concentrate, not diversify.

## The honest path to a higher (not 2) Sharpe, and what 2 would actually take

- **Realized here:** combine uncorrelated equity sleeves (momentum + the orthogonal cross-asset-trend
  ρ 0.11 and tail-hedge ρ −0.02) on the wider universe, **vol-target the book** → **Sharpe ~1.13, MaxDD 8.7%.**
- **To approach 2 honestly you would need** at least one of: (a) a **leverage band** on the vol target
  (e.g. up to 1.5× gross when realized vol ≪ target — outside the current ≤1.0 cash-secured mandate);
  (b) **paid historical options data** to backtest a genuine high-Sharpe VRP sleeve (CBOE PUT-index VRP
  is ~0.7 Sharpe *for the index*, and a hedged, filtered version higher); (c) a **much wider single-name
  cross-section** (500+ names) for true residual-momentum dispersion. Each is a real lever — none is free,
  and we flag them rather than smuggle them into a backtest.

## Novel-Options fleet verdict (141 agents, 8M tokens) — independent confirmation

The dedicated fleet (4 universe agents + 12 design families → 24 specs → 4 red-team lenses each →
4-lens synthesis panel → assembler) reached the **same honest conclusion as the measured backtest**:

- **Assembler: honest expected Sharpe ≈ 1.15; reaches-2 honestly = FALSE.** All four panel lenses
  agreed — max-Sharpe 1.35, tail-purist 1.35, engineer 1.0, skeptic 0.95 — **none reaches 2.** This
  brackets the *measured* combined 1.13.
- **It CUT the options VRP sleeves on its own scoring** (VRP-CSP core 12/60, Sh −0.15; condors/calendars
  CUT/RESEARCH_ONLY) — independently confirming the synthetic-backtest null. Options VRP is real *live*
  but not honestly backtestable here.
- **Top NEW survivor (38/60, REAL/pure-OHLCV): Residual-Momentum Decile L/S** — beta-neutralized,
  idio-vol-scaled, ρ≈0.05, net-of-β ~0.30–0.40. **Implemented** (`residmom.ts`) — the one genuinely
  additive, honestly-backtestable new sleeve, viable because the universe was widened.
- **The architecture it endorses for a *hedged* short-vol book** (if/when real options data is added):
  fund **one** short-vol VRP sleeve + a **VRP-funded convex tail hedge** (long VXX/OTM-SPX puts — note
  **VXX/SVXY are REAL OHLCV and ARE backtestable**) + an **avoid-through-earnings** filter. Stacking
  multiple short-vol flavors is the trap (shared Feb-2018/Mar-2020 short-gamma tail).
- **Novel free data it flagged** (all off the live chain we already fetch): true IV-rank/percentile (vs
  the current HV proxy), 25-delta risk-reversal skew, VIX term-structure slope, ATM straddle-implied
  earnings move, put/call OI ratio — these sharpen the *live* options book, not the offline backtest.

Machine-readable: [backtests/options-fleet-ranked.json](backtests/options-fleet-ranked.json). **Net:
the fleet and the data agree — ~1.1–1.15 is the honest ceiling here; 2 needs leverage or paid options data.**
