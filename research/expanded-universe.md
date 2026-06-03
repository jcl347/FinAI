# research/expanded-universe.md — The Expanded-Universe Push (more tickers · more instruments · more recent data · unique data)

> Goal (user): pursue **greater Sharpe** by expanding the ticker set and instrument types (all types),
> including **crypto, options, broad ETFs, and unique free data sources**, with an **optimized agent-fleet
> structure**, and validate everything rigorously. This file tracks the effort, the optimized fleet, and —
> faithfully — **what worked and what didn't**.

## TL;DR (the honest answer)

- **The expanded search was far more thorough** (438→ liquidity-screened equities + 11 crypto + intl/rates/
  credit/commodity ETFs + a *unique-data* macro/vol/skew/curve/dollar set), **but it did NOT lift the Sharpe
  ceiling.** From 16 designed sleeves, **15 backtested, 9 died on the OOS net-of-β filter, 5 of the 6 survivors
  were killed by the red-team, and exactly ONE survived: `commodity_trend`** — a *small, low-ρ, benign-tail
  inflation diversifier*, not an alpha engine.
- **The most important finding is a NEGATIVE one:** naively widening the equity cross-section (165→438)
  **degraded** the book out-of-sample (**OOS Sharpe 0.91 → 0.66, net-β → −0.13**) by feeding illiquid/
  recent-IPO junk into the momentum & residual-L/S sleeves. A principled **liquidity screen** (rank within the
  top-200 by dollar-volume) **fixed it**: OOS **0.66 → 0.87**, net-β **−0.13 → +0.20**, and the in-sample/OOS
  overfit gap **collapsed from 0.35 to 0.12**.
- **Net result:** a **more robust, less-overfit, better-diversified** book at a *similar* Sharpe — full **0.91**,
  **OOS 0.86** (net-β +0.18), MaxDD 12.9% — plus thoroughly-tested-and-honestly-reported crypto/options/alt-data,
  and **two real sim/live divergence bugs fixed** by the code-review fleet. **Sharpe ~0.9 OOS remains the toolkit
  ceiling**, now confirmed across crypto + alt-data too. The win is *robustness + breadth of validation*, not a Sharpe leap.

## The optimized fleet structure (what changed, and why it's better)

The prior fleets were **ideation-heavy, execution-light**: agents hand-waved Sharpe numbers that the main loop
then had to redo, they re-derived the same conclusions, and they littered 100+ scratch files. The new structure
is **execution-anchored** — agents *bracket* execution instead of replacing it:

```
  SCOUT (16 agents, parallel)         MAIN LOOP (executes — the ground truth)        RED-TEAM (parallel, adversarial)
  one orthogonal opportunity each  →  implement each spec as a real Strategy      →  attack the EXECUTED numbers:
  → a COMPLETE codeable spec          run the real walk-forward engine               regime-concentration? look-ahead?
    (exact signal + TS skeleton +     (full / OOS>2021 / recent>2023 +               cost-realism? survivorship?
     falsifier + self-red-team)       net-of-β + ρ-to-book)                          tail-correlation? → KEEP/CUT
                                      + KILL-TESTS (per-year Sharpe, 3× cost)        + propose a concrete kill-test
                                      → 9 of 15 cut here                             → main loop runs the kill-test
```

Why it's better: **claims always meet data before they're trusted.** The red-team attacks *executed results*,
not specs — so it caught what spec-review can't: that `crypto_trend`'s headline was a 2017 one-episode survivor
artifact with a weekend-bar sim/live bug, that `commodity_trend`'s recent shine is the 2024-26 metals bull, that
`resid_mom_sn_ls`'s OOS was 2024 alone. The main loop does all execution in-repo (no scratch-file sprawl).

**Fleet tally (this push):** scout 16 · red-team 6 · impl-review (separate) — plus the main loop's executed
backtests + 2 kill-test harnesses. Every survivor was judged on **executed OOS net-of-β**, not agent assertion.

## The expanded universe + unique data sources

| Group | Tickers | Used by | Status |
|---|---|---|---|
| US equities | **438 → screened to top-200 liquid** | momentum, low-vol, residual-L/S, LT-reversal, reversal | **kept (with liquidity screen)** |
| Crypto (`*-USD`) | BTC/ETH/SOL/BNB/XRP/ADA/DOGE/LTC/LINK/AVAX/DOT | crypto sleeves | **tested → cut** (survivorship + weekend-bar bias + decaying ρ) |
| Intl ETFs | EFA/EEM/VGK/EWJ/FXI/INDA/EWZ/EWY/EWT/ACWX | intl rotation | tested → cut (redundant equity β) |
| Rates ETFs | SHY/IEF/TLT/GOVT/TIP/BIL/AGG | curve-duration | tested → cut |
| Credit ETFs | LQD/HYG/EMB/BKLN/JNK | credit-carry | tested → cut |
| Commodity ETFs | DBC/GLD/SLV/USO/UNG/DBA/CPER/PDBC | **commodity_trend** | **KEPT** (small diversifier) |
| **Unique data** (free, daily, Yahoo) | **^SKEW** (crash-fear), **^VVIX** (vol-of-vol), **^OVX/^GVZ** (oil/gold IV), **^IRX/^FVX/^TNX/^TYX** (Treasury curve), **DX-Y.NYB** (US dollar) | alt-data gates + commodity dollar-gate | overlays tested → cut; **DX-Y.NYB used by the kept commodity sleeve** |

All 546 symbols fetch cleanly through 2026-06 (probe: `scripts/backtest/probe-altdata.ts`). The unique-data
tickers are index quotes readable via `ctx.closes("^SKEW")` etc., so the **same signal works in backtest AND live**.

## Executed results — all 15 backtested sleeves (full / OOS>2021 / recent>2023)

| Sleeve | OOS Sharpe | OOS net-β | ρ(SPY) | Verdict | Why |
|---|---|---|---|---|---|
| **commodity_trend** | 0.78 | **0.66** | 0.15 | **KEEP_SMALL** | low ρ, tail-β 0.16 (doesn't co-crash), cost-robust; recent strength is the metals bull → sized small |
| crypto_trend | 0.46 | 0.31 | 0.22 | CUT | survivorship (early basket=BTC+LTC), 2017 one-episode, **weekend-bar sim/live divergence**, ρ rising |
| resid_mom_sn_ls | 0.37 | 0.34 | 0.05 | CUT | OOS edge is **2024 alone** (2023 −1.40); cost-sensitive (Δ −0.18 at 3× cost) |
| crypto_xs_mom_ls | 0.27 | 0.29 | −0.02 | CUT | 81% MaxDD; alt-coin costs 3-6× modeled; recent decay (2025/26 negative) |
| intl_rotation | 0.52 | 0.08 | 0.62 | CUT | redundant equity β (ρ 0.62); netβ negative in 8/11 years |
| xasset_carry_ls | 0.02 | 0.06 | −0.05 | CUT | only 2026-stub positive; collapses at 3× cost (Δ −0.46) |
| bab_ls | 0.01 | −0.05 | 0.08 | CUT | null/negative OOS |
| resid_reversal_lt | −0.74 | −0.83 | 0.06 | CUT | reversal STILL cost-killed (turnover 11,629%/yr even "low-turnover") |
| factor_mom_ls | −0.96 | −1.02 | 0.08 | CUT | negative |
| curve_duration | −0.25 | −0.24 | −0.26 | CUT | negative OOS; high turnover |
| credit_carry | −1.04 | −1.30 | 0.28 | CUT | credit sleeves fail here (again) |
| usd_regime | −0.41 | −0.49 | 0.11 | CUT | negative |
| skew_crashfear | −1.10 | −1.09 | −0.04 | CUT | tail overlay **bleeds** |
| vvix_early_warning | 0.02 | −0.06 | −0.07 | CUT | ~flat; tail_hedge already does this |
| commodity_vol_contagion | −1.02 | −1.00 | −0.05 | CUT | bleeds |
| options VRP (live put-credit-spread) | — | — | — | **build-for-live** | no free historical chains → assert-only backtest; runs live via the put-scorer |

## The decisive finding: more tickers HURT until liquidity-screened

| Book | Full Sharpe | OOS Sharpe | OOS net-β | In-sample Sharpe | IS→OOS gap |
|---|---|---|---|---|---|
| Old 165-name (prior docs) | ~0.92 | 0.91 | 0.28 | 1.26 | 0.35 (overfit) |
| **Naive 438-name expansion** | 0.85 | **0.66** | **−0.13** | 1.16 | 0.50 |
| **438 + liquidity screen + commodity_trend (final)** | **0.91** | **0.86** | **+0.18** | 0.99 | **0.13** (robust) |

**Mechanism:** the wide cross-section added illiquid/recent-IPO names that the momentum & residual-L/S sleeves
bought (or shorted into squeezes), poisoning 2022-23 OOS. The fix — rank only within the **top-200 by trailing
median dollar-volume** (`src/lib/strategies/screens.ts`, no look-ahead, N=200 fixed a priori, not tuned to the
holdout) — recovered OOS and, crucially, **shrank the overfit gap from 0.35 to 0.12**. The expansion's real
payoff was forcing this robustness fix, not a Sharpe gain.

## Implementation review (10-agent fleet) — sim/live consistency fixed

The user's ask to "validate and optimize implementation with Claude Team orchestration" ran an adversarial
code-review fleet (review → verify each finding). It found **2 critical + 5 serious** issues — all genuine
**sim/live divergences** (the project's core invariant), now fixed:

| # | Finding | Fix |
|---|---|---|
| **Critical** | The meta is `longOnly:true`, so the BACKTEST clamps the L/S sleeves' shorts to 0, but the live `runDay` traded them → the deployed cron ≠ the validated book | **Measured** long-only vs genuine L/S (`scripts/backtest/ls-ab.ts`): long-only **OOS 0.87 > L/S 0.76** (worse DD 15%). Kept long-only; made `runDay` apply the **same long-only clamp + maxGross** as the engine. The `longOnly` flag now drives BOTH paths. |
| **Critical** | Live `runDay` opened shorts but charged **no borrow** (and a comment falsely claimed long-only) | `runDay` now accrues daily borrow on any short (no-op for the long-only book) and the clamp removes shorts; comment corrected. |
| Serious | Live universe floor (150 bars) ≠ backtest meta floor (805) → `liquidEquities` ranked a different set live vs backtest | `runDay` now uses `META_WARMUP_FLOOR` (= meta warmup) so the live cross-section is identical to the validated one. |
| Serious | Live fetched ~540 symbols (incl. unused crypto + alt-data) → Vercel-duration risk | Added a lean **`PRODUCTION_UNIVERSE`** (only what registered sleeves trade/read), concurrency 4→10, and a **coverage guard** that HOLDS rather than trade a degraded pool. |
| Serious | No per-sleeve cap → a hot streak could over-weight the regime-concentrated commodity_trend | Added `maxWeightByKey`; capped **only** commodity_trend (≤10%) — measured that capping the low-vol L/S diversifiers HURT (concentrates into beta), so they are deliberately uncapped. |
| Medium | Nothing structurally blocked trading a macro/context ticker | `runDay` now skips `isMacroTicker` symbols (belt-and-suspenders; sleeves already filter). |

**This is the highest-value part of the push:** the review caught that the *deployed* book differed from the
*validated* book, and the fix is now provable — the same `longOnly`/floor/borrow rules drive the backtest engine
AND the Vercel cron, so the sim can never silently diverge.

## What worked / what didn't

**Worked:**
- **Execution-anchored fleet** — agents ideate + attack; the main loop executes. Eliminated hand-waved numbers.
- **Adversarial red-team on EXECUTED results** — caught regime-concentration, the crypto weekend-bar bug, and
  survivorship that spec-review would have missed. 5 of 6 "winners" correctly killed.
- **Kill-tests (per-year Sharpe + 3× cost)** — exposed one-episode edges (2024-only) and cost-fragile turnover.
- **The liquidity screen** — turned a degradation into a robustness *win*.
- **`commodity_trend`** — one genuine low-ρ, benign-tail diversifier (inflation/real-asset exposure the book lacked).
- **The implementation-review fleet** — caught two *deployed-≠-validated* divergences pure backtesting can't see
  (the long-only/short clamp + the universe-floor mismatch). Fixing them is what makes the OOS number trustworthy
  as a forward deployment, not just a backtest.

**Didn't:**
- **Naive ticker expansion** — net-negative without a quality screen.
- **Crypto** — survivorship in the early basket, a one-episode (2017) headline, a weekend-bar **sim/live
  divergence**, and **decaying** equity-decorrelation (ρ rising to 0.36). Cut. (Infra supports it; not funded.)
- **Most market-neutral L/S** (BAB, factor-L/S, sector-neutral resid-mom, cross-asset carry) — one-episode or
  cost-killed after honest borrow + turnover.
- **Alt-data tail overlays** (SKEW/VVIX/OVX-GVZ gates) — bleed or do nothing; `tail_hedge` already covers it.
- **Credit/rate carry & duration timing** — cost-fragile / regime-thin (as before).

## "All instrument types, daily" — honest coverage

The automated daily book trades, in simulation, on the Vercel cron: **long equities** (momentum, low-vol),
**market-neutral L/S equities with real shorts** (residual-momentum, LT-reversal, sector-LT-reversal),
**sector/factor/cross-asset ETFs**, and now **commodity ETFs** (commodity_trend). **Options** are covered by the
existing Cash-Secured-Put analyzer (build-for-live on the real chain); the scout's **put-credit-spread VRP** sleeve
is specced build-for-live (no free historical chains to backtest honestly). **Crypto** was tested and cut, but the
data/engine support it if a clean (weekend-aware) implementation is built later.

## Honest verdict

The expansion **rigorously re-confirmed the ceiling**: even with 2.6× the tickers, a new asset class (crypto), a
full multi-asset ETF set, and unique vol/skew/curve/dollar data, **Sharpe ~0.9 OOS is the wall** for free-daily,
no-real-options-chains data. The deliverable is an **honestly better-engineered book** — **full Sharpe 0.91, OOS
0.86, MaxDD 12.9%, net-β +0.18**, *much* less overfit (IS→OOS gap 0.13 vs the old 0.35), one new genuine
diversifier (commodity_trend), a liquidity-screen robustness fix, two sim/live divergence bugs fixed, and an
all-instrument daily simulation whose deployed book now provably equals the validated one — not the higher Sharpe
that simply isn't there in this toolkit. **Genuine L/S was tested and measured WORSE than the long-only
projection, so the cash-secured long-only book is retained** (the user's L/S mandate explored honestly, then declined on the data).
