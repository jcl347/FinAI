# research/regime-stability.md — Regime-Robustness Review + Options-First Fleet

> Goal: a daily-adjustable, Vercel-deployable portfolio that is STABLE across regime shifts. This doc
> reviews the current book's regime behavior, records the options-first + regime fleet, and logs every
> hypothesis tested (incl. the rejected ones — red-team discipline).

## Review: is the current book already regime-stable? (mostly yes, in absolute terms)

Per-calendar-year OOS Sharpe + return (position-level book, `scripts/backtest/validate.ts`):

| Year | Regime | ARMS Sharpe | ARMS ret | SPY ret | Read |
|---|---|---|---|---|---|
| 2018 | Q4 selloff | −0.3 to −1.5 | −4% | −5.3% | small loss, ≈ SPY |
| 2020 | COVID crash | **+1.0** | **+11%** | +17% | **crisis alpha worked** |
| 2022 | stocks+bonds down | **−0.95** | **−5.7%** | **−18.7%** | small loss; *negative Sharpe but lost ⅓ of SPY* |
| 2021/2023 | strong bull | lagged | +8–13% | +27–31% | de-grossed → under-participates |
| Full | all | 1.08 | — | — | **MaxDD ~10% vs SPY 34%** |

**Key finding:** the book is **already regime-stable in *absolute* terms** — its worst-regime drawdowns
are small (loses 5–6% where SPY loses 18–34%). The "2022 weakness" is a *negative Sharpe on a small loss*,
not a blow-up. The real (hard) target is therefore *making 2022 positive without breaking other regimes* —
and de-grossing/vol-targeting already deliver the stability; turning the small 2022 loss into a gain is the open问题.

## Hypotheses tested (red-team discipline — incl. rejections)

| Hypothesis | Result | Verdict |
|---|---|---|
| **Managed-futures / CTA trend (12-1m), long-short multi-asset** — short bonds+equities, long commodities/dollar in 2022 | standalone net-of-β **−0.27**; 2022 still −0.98; **made 2018 worse (−1.5)**; combined OOS +0.03 only | **REJECTED** — whipsaws in choppy markets; the slow 12m signal was long bonds *into* the 2022 selloff |
| Same, **faster (3m+6m+12m blend)** to catch the fast 2022 rate shock | net-of-β **−0.22**; 2022 −0.94; 2018 −1.52; no OOS gain | **REJECTED** — faster = more whipsaw, no 2022 benefit. CTA does not help on this ETF universe |

→ A trend/CTA overlay does **not** improve regime stability here; the `managedfutures.ts` sleeve is kept
in the tree but **unregistered** (not in the production book). The honest reason 2022 is a small loss
rather than a gain: the assets that profited in 2022 (commodities/dollar shorts-of-bonds) net against the
book's equity/bond legs, and trend signals whipsaw enough elsewhere to erase the benefit.

## Options-first + regime fleet (24 specs, 4 red-team lenses) — verdict

**Options were researched first, and the honest verdict is that options are NOT the regime-stability
answer here.** Every options/VIX-ETP sleeve was downgraded by the red-team:

| Options sleeve | Verdict | Why |
|---|---|---|
| Gated short-vol VRP carry (SVXY, term-structure kill-switch) | RESEARCH_ONLY | regime-fragile; shares the Feb-2018 short-gamma crash tail |
| Synthetic collar overlay (VIX-ETP financed) | CUT | approximate (no real chains); carry drag |
| SVXY VRP carry with VIX3M/VIX backwardation gate | CUT | the gate lags; Volmageddon tail |
| Convex crash hedge (long VXX, credit-triggered) | CUT/low | the long-vol bleed in calm outweighs the crash payoff |

→ **No options sleeve is both regime-stabilizing AND honestly backtestable.** VIX-ETP short-vol carry is
regime-fragile (crash tail); long-vol tail hedges bleed; collars are only approximable without real chains.
The existing VIX-term-structure `tail_hedge` (long TLT/GLD in backwardation, cash in calm) remains the
honest, no-carry-drag version and stays.

**The two non-options survivors (BUILD_AFTER_FIX):**
1. **Credit/Real-Rate Stress Rotation (fix2022=7, backtestable=9)** — fires on credit widening (HYG↓) +
   rising rates (TLT↓), rotates to inflation/dollar/defensives. Built (`creditstress.ts`) and **under
   per-regime test** — kept only if it genuinely improves 2022 without breaking 2018/2020/bull.
2. Min-Variance Defensive Tilt (USMV/SPLV) (fix2022=5) — defensive low-vol tilt in stress.

**Credit/Real-Rate Stress Rotation — TESTED → REJECTED.** Standalone net-of-β **−0.42** (strongly
negative alpha); added to the book it **cratered it**: full-sample Sharpe 1.08→0.47, **OOS 0.95→0.17**,
MaxDD 10%→**20.6%**, and 2022 barely moved (−0.76). Cause: HYG and TLT fell through much of the rising-rate
2022–2024 stretch, so the trigger was "on" constantly and its inflation/defensive longs *lost* once 2022
ended — a persistent negative-alpha drag, not a targeted hedge. Unregistered.

## 136-agent fleet (24 specs, 4 red-team lenses each) — independent re-test → SAME verdict

A second, much larger fleet (136 agents) was tasked to design the regime fix from scratch — **options-first**,
12 options/VIX-ETP specs + 12 regime/cross-asset specs — each faithfully backtested on the repo's real cached
OHLCV and attacked by 4 red-team lenses (regime fragility, fabricated-corr, falsifier-breach, redundancy).

**Outcome: 0 clean BUILD. 8 BUILD_AFTER_FIX (every headline thesis falsified by the red-team), 12 CUT, 4 RESEARCH_ONLY.**

| Rank | Spec (top scorers) | Score | Red-team kill |
|---|---|---|---|
| 1 | Credit/Real-Rate Stress Rotation → DBC/UUP/GLD | 40 | corr −0.45 **fabricated** (realized ≈ +0.01); Mar-2020 **−14.25%** (held GLD into the liquidation); TRAIN≤2021 Sharpe **0.077** (≈ all P&L in the single 2022 window); breaches own <1%/yr calm-drag falsifier (2021 −3.28%); **repo already rejected this exact overlay** |
| 2 | Dollar-Ballast + Vol Carry (USD-VRP) | 36 | only the **UUP-only** leg works; SVXY carry leg ~doubles drawdown & cuts Sharpe; 2018Q4 −7.7%, Mar-2020 −4.8%; breaches own 0.3 corr cap |
| 3 | Defensive Dual-Momentum (DEF-DM) | 33.5 | 2022 is **XLE-concentration + in-sample fit** (ex-XLE/DBC → −6.4%); diversification falsifier fails (ρ 0.47 not 0.15, duplicates cross_asset_trend); loses in 3 of 4 regimes |
| 4 | Regime-Scaled Defensive Sector Tilt | 33 | net-of-beta Sharpe **negative** (de-levered long-SPY proxy); "2–4%/yr carry" is really 4.6–19%/yr drag; already covered by sectorRotation + allocator floor |
| 5 | Min-Variance Defensive Tilt (USMV/SPLV) | 32 | 75% of budget self-falsifies (alpha +0.09%/yr, t=0.06); only genuine leg is a **near-duplicate of cross_asset_trend** |
| 6 | Dollar/Short-Duration Anchor (corr switch) | 31 | corr gate lags ~9 months (misses all of H1-2022); strictly worse than an **ungated UUP60/SHY40**; corr(UUP,USO)=−0.48 fabricated (actual +0.01) |
| — | every VXX / SVXY / VIXY vol sleeve | 26–28.5 | single-regime; calm bleed > crash payoff; most **LOSE in the 2022 regime they target**; duplicate the existing `tail_hedge` |

**The fleet's red-team converged on one honest residual idea — and it is already in the book.** Across all 8
BUILD_AFTER_FIX specs, the *only* piece that survived attack was a small **dollar / short-duration trend tilt**
(long UUP/SHY/GLD/DBC when trending). That is **exactly** what the shipped `cross_asset_trend` sleeve already
holds (`CROSS_ASSET_ETFS = TLT, IEF, SHY, GLD, SLV, DBC, USO, UUP, VNQ, EEM, EFA`, long-only-when-trending,
inverse-vol). Every spec that tried to *re-package* it as a new sleeve (a) overstated it as a −0.45 crash hedge,
(b) **fabricated the correlation** (realized ≈ 0), (c) put ~all its P&L in the single 2022 window, and (d)
tripped its own calm-year drag falsifier. The fleet's nominal #1 (credit-stress rotation, 40) is the **same
sleeve I built and rejected** above — its own red-team rejected it for the same reasons, and cited *this very
file* as prior art.

> **Triangulated:** manual real-data testing + the 114-agent Sharpe quest + this 136-agent options-first regime
> fleet + the diversification math **all agree** — no new sleeve beats the book, and the one genuine 2022-residual
> edge (a small dollar/short-duration trend) is **already owned** by `cross_asset_trend` + `tail_hedge`.

## FINAL VERDICT — regime stability

**Both 2022-fix hypotheses (CTA trend, credit-stress rotation) were red-teamed and REJECTED on real,
out-of-sample data** — each has negative net-of-β alpha and degrades the book. The honest conclusion:

> **ARMS is already as regime-stable as this free-daily-data / no-leverage / no-real-options-chains toolkit
> allows.** It loses small in every adverse regime (−1% to −6% where SPY loses −5% to −19%) and its
> full-period max drawdown is **~10% vs SPY's 34%**. The small 2022 *loss* is the honest cost of a
> diversified long-biased book in a stocks-and-bonds-down regime; the assets that would have turned it
> *positive* (commodity/dollar longs, bond shorts) are themselves negative-alpha over the full sample —
> they only "work" in the 2022 column and whipsaw everywhere else (the classic overfit-to-one-episode trap).

**What genuinely stays:** the existing regime machinery — vol-targeting, crisis de-gross (VIX≥35 → 60%
gross), the VIX-term-structure `tail_hedge` (cash in calm, TLT/GLD in stress), and the market-neutral
diversifiers — which together deliver the small-loss-everywhere profile. No new sleeve beat it.

**Options verdict (researched first):** options are not the regime answer here — short-vol VRP is
regime-fragile (shared crash tail), long-vol tail hedges bleed, and chain-based ideas aren't honestly
backtestable. The honest options exposure is the existing VIX-term tail_hedge (real ETP/index signal).

**To genuinely make 2022 *positive*** you would need a different toolkit (real managed-futures *futures*
with a deep curve, point-in-time macro data, or paid options) — not another OHLCV-ETF overlay that
back-fits the one bad year. Reported honestly rather than shipped.
