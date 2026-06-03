# research/ — The Agent Fleet & Research Trail

> **What this folder is.** The complete, adversarial research record behind **ARMS** (the Adaptive
> Regime-aware Multi-Strategy allocator that the website paper-trades daily). Strategies were
> *discovered, stress-tested, and corrected* by **seven agent-orchestration fleets** — ~**618 subagents**,
> **≈ 30M+ tokens** — modeled on [Research_Analyzer](https://github.com/jcl347/Research_Analyzer)'s
> discipline of keeping **discovery separate from red-team critique** and reporting **nulls as faithfully
> as wins**. This README maps the fleet *structure* and summarizes every *outcome*. Master record:
> [`../CLAUDE.md`](../CLAUDE.md).

---

## 1. The orchestration model (how every fleet is built)

Each fleet is a deterministic [`Workflow`](../CLAUDE.md) — control flow is code, the creative work is the
subagents. They all run the same brief-driven loop ([`brief.md`](brief.md) is the fixed grounding; agents
evolve the strategies, not the goal):

```
                       ┌──────────────────────────────────────────────────┐
   brief.md  ─────────▶│  the fixed brief: goal + grounding facts + the    │
   (human-written)     │  single fair metric (0–60, harshly graded)        │
                       └───────────────────────┬──────────────────────────┘
                                               │
   ┌─────────┐   ┌──────────┐   ┌──────────────▼─────────────┐   ┌───────┐   ┌────────────┐
   │ DISCOVER │─▶│ FORMALIZE │─▶│  RED-TEAM  (3–4 lenses each, │─▶│ SCORE │─▶│ SYNTHESIZE  │
   │ N scouts │   │ falsifiable│   │  adversarial, try to KILL)  │   │ /60   │   │ panel +     │
   │ 1 family │   │ spec each  │   │  • cost robustness          │   │ harsh │   │ assembler   │
   │ each     │   │ (signal,   │   │  • orthogonality / tail-ρ   │   │ grade │   │ → ONE book  │
   └─────────┘   │ entry/exit,│   │  • net-of-β after-cost Sharpe│   └───┬───┘   └─────┬──────┘
                  │ sizing,    │   │  • regime fragility         │       │             │
                  │ costs)     │   └─────────────────────────────┘       │             ▼
                  └────────────┘                                          │      VALIDATE (OOS,
                                                                          │      leave-one-crisis-out)
                                                                          ▼             │
                                              every candidate graded on 6 axes 0–10:    ▼
                              Edge · Orthogonality · DataAvailability · CostRobustness · MAIN LOOP
                              Implementability · Testability  →  Orthogonality & Cost   re-implements +
                              are the load-bearing adversarial axes (kill the null)     backtests on REAL data
```

The decisive design choice: **the main loop (me) implements and backtests on real data *between* fleets**,
so a fleet's *claims* are always checked against *executed* numbers. This is what caught the over-claims
(e.g. the adaptive allocator the fleet liked actually *underperformed* equal-weight out-of-sample → adaptation
was demoted to a light overlay; the credit-stress sleeve the fleet ranked #1 cratered the book on real data → cut).

*The lens set hardened fleet-over-fleet: Fleet 1 ran **3** red-team lenses; the 4th — **net-of-β after-cost
Sharpe** — was introduced by Fleet 2 and carried forward. The cross-fleet "validation" role (walk-forward,
leave-one-crisis-out, OOS split) was executed by the **main loop** itself (`scripts/backtest/validate.ts`)
between fleets, not by a separate agent fleet — which is why it is not a numbered row in §2.*

---

## 2. The seven fleets at a glance

| # | Fleet | Agents | Job | Method (phases) | Headline outcome |
|---|---|---:|---|---|---|
| 1 | **Strategy Discovery** | **82** | Find automatable edges *beyond* put-selling | 12 families → 33 candidates → 14 vetted (formalize → 3 red-team lenses → 0–60) | **0 KEEP** — no single anomaly is a slam-dunk; *orthogonality is the scarce resource* |
| 2 | **Advanced High-Sharpe Design** | **115** | Design exact orthogonal sleeves + daily feedback | 10 families → 20 specs → 4 red-team lenses → synthesis panel → assembler | **Re-derived the exact built portfolio**; honest ceiling **~1.0**; ">1.3 would be dishonest." Decisive fix: **measure net-of-β** |
| 3 | **Implementation Code Review** | **9** | Adversarial review of the shipped code | 6 areas (look-ahead, allocator math, TS/Neon, race, UI) | **3 serious bugs** + 17 medium/low → **all fixed & re-validated** |
| 4 | **Method Audit & Correction** (Fleet A) | **21** | Find mistakes that *inflate* the measured Sharpe; web-validate + data-check | 6 dimensions, each agent reproduces on real code/data | *Reproduced* a look-ahead bug (**1.14 → 0.87**); ~15 distortions flagged (2 critical) → corrected |
| 5 | **Uncorrelated-Sleeve Discovery** (Fleet B) | **114** | Design market-neutral, OOS-robust sleeves to push Sharpe → 2 | 20 sleeves / 10 families → red-team for overfitting → **OOS-judged** | **Only 1 of 20 survived out-of-sample** — the rest inverted (deflated-Sharpe trap) |
| 6 | **Novel-Options + Universe** | **141** | Options-inclusive sleeves + a wider optionable universe | 4 universe agents + 12 families → 24 specs → 4 lenses → panel → assembler | **CUT options VRP on its own scoring**; honest **~1.15, reaches-2 = FALSE**. Built **residual-momentum L/S** |
| 7 | **Options-First Regime Robustness** | **136** | Make the book stable across regimes (esp. 2022) | 24 specs (12 options + 12 regime) → 4 red-team lenses | **0 clean BUILD · 8 build-after-fix (all theses falsified) · 12 CUT · 4 research-only** — no new sleeve beats the book |
| 8 | **Expanded-Universe push** (execution-anchored) | **32** (scout 16 · red-team 6 · impl-review 10) | Pursue greater Sharpe via more tickers/instruments/data | scout → **main loop EXECUTES** → kill-tests → red-team → code-review | **1 keeper of 16** (commodity_trend); diagnosed naive-expansion degradation → **liquidity-screen fix** (OOS 0.66→0.86); **fixed 2 sim/live divergences**. Ceiling holds (~0.9 OOS) |
| 9 | **Diversification + Opportunity Signals** | **17** (datasets 6 · methods 9 · design 2) | Improve diversification + live feedback + opportunity signals | dataset research (web) · foundational-method A/B · opportunity-signal/VRP design | **No optimizer beats naive equal-risk** (HRP/min-var/MDP all lose — DeMiguel 2009); built the **opportunity-signal layer** + VRP live-feedback seam; **dataset roadmap** (free: EDGAR/QuantConnect/Form-4) |
| 10 | **AI-Era System Design** | **8** (6 pillars · chief-architect · skeptic) | Design the AI-era method + data + agent framework to beat the ceiling | pillar experts (web research) → synthesis → adversarial skeptic | **6-layer stack + 10-node self-improving agent fund**; honest projection 0.91→**~1.2–1.3** (conservative ~1.0, optimistic ~1.5); **2.0 not reachable**; first move = the DSR governance (shipped) |

**Totals: ~680 subagents across 10 fleet runs** (discovery 82 · advanced 115 · impl-review 9 · audit 21 ·
uncorrelated 114 · options 141 · regime 136 · expanded-universe 32 · diversification 17 · ai-era-design 8),
**≈ 32M+ subagent tokens.** Every fleet's
machine-readable ranking is in [`backtests/`](backtests/). The 8th (expanded-universe) is **execution-anchored**:
agents *bracket* execution (ideate before, attack after) while the main loop runs the real backtests — see
[`expanded-universe.md`](expanded-universe.md).

---

## 3. Per-fleet structure & outcome

### Fleet 1 — Strategy Discovery (82 agents) → [`strategy-universe.md`](strategy-universe.md)
12 strategy families fanned out to scouts → 33 candidate specs → the top 14 formalized, each hit by **3
red-team lenses** then harshly graded 0–60. **Result: 0 KEEP, all REVISE/CUT.** The harsh grader (with
*Orthogonality* and *CostRobustness* load-bearing) passed nothing clean — which is the brief *working*, not
failing: standalone anomalies sit at Sharpe ~0.6–1.0 and several are cost-killed. The cross-cutting lessons:
**costs are the executioner** (every high-turnover idea died), **orthogonality is scarce** (only cross-asset
trend, a VIX-term tail hedge, and vega-neutral slope are genuinely uncorrelated), and **tail-orthogonality ≠
mean-orthogonality** (dollar-neutral L/S hides a shared short-gamma crash tail).

### Fleet 2 — Advanced High-Sharpe Design (115 agents) → [`advanced-strategies.md`](advanced-strategies.md)
20 exact sleeve specs across 10 families → **4 red-team lenses each** (now including *net-of-β after-cost
Sharpe* and *tail-orthogonality*) → 0–60 score → a 4-lens **idea-sharing synthesis panel** → an assembler.
It independently recommended funding **exactly the sleeves already built** and CUT every exotic/market-neutral
candidate. Its decisive contribution was a **measurement-honesty fix (STEP 0):** CAPM-regress each sleeve on
SPY and report residual-alpha Sharpe at a real T-bill rate — which dropped the equity sleeves to ~0.6–0.7 and
is *why the honest portfolio Sharpe is ~1.0, not >1.3.*

### Fleet 3 — Implementation Code Review (9 agents) → [`red-team.md`](red-team.md)
6 review areas (look-ahead bugs, allocator math, TS/Neon correctness, first-run race, UI). **Confirmed 3
serious bugs + 17 medium/low notes.** All confirmed bugs were fixed and re-validated: vol-target cold-start,
trades idempotency, first-run race, UI allocation-bar, NaN sanitization, dust-exit, dead-code.

### Fleet 4 — Method Audit & Correction "Fleet A" (21 agents) → [`sharpe2-quest.md`](sharpe2-quest.md) §Fleet A
6 audit dimensions, each agent **reproducing on the real code + cached 11-year data + web-validating the
finance.** It found the reported **1.14 was materially inflated** and *empirically reproduced the biggest cause*:

| Mistake | Severity | Effect | Fix |
|---|---|---|---|
| **Look-ahead** in the return-level combiner (weights read day *i*'s own returns) | Critical | **1.14 → 0.87** | ✅ `j = i-1` cutoff on all weight inputs |
| Survivorship bias (100% survivors) | Critical | +0.10–0.25 | ⚠️ documented as upper bound (needs paid point-in-time data) |
| Options-sim re-added the VRP at every mark | Critical (sleeve) | edge destroyed | ✅ mark at realized vol only |
| In-sample overfitting (no train/test split) | High | ~0.6–0.75 deflated | ✅ OOS harness `validate.ts` |
| Short-borrow too low (50 bps) | Medium | +0.05–0.1 | ✅ raised to 150 bps |
| rf=0 framing / leverage-fallacy comment | Medium | framing | ✅ report net-of-β; Sharpe is scale-invariant |

→ Honest corrected baseline: **~0.91 OOS** (net-of-β ~0.3).

### Fleet 5 — Uncorrelated-Sleeve Discovery "Fleet B" (114 agents) → [`sharpe2-quest.md`](sharpe2-quest.md)
20 market-neutral sleeves across 10 families, each red-teamed for overfitting/snooping and **judged strictly
out-of-sample.** **Only 1 of 20 survived OOS** (industry/sector long-term reversal, OOS-Sharpe ~0.27, ρ≈0) —
the rest *inverted* out-of-sample (the deflated-Sharpe trap). The one survivor was built (`sectorltrev.ts`,
zero survivorship). This is the crux of the Sharpe-2 problem: **the genuinely-uncorrelated streams obtainable
from free daily OHLCV are individually weak (Sharpe ~0.16–0.43), not the ~0.63 the math needs.**

### Fleet 6 — Novel-Options + Universe Expansion (141 agents) → [`options-strategies.md`](options-strategies.md)
4 universe-design agents + 12 sleeve families → 24 specs → 4 red-team lenses → synthesis panel → assembler.
It **CUT the options VRP sleeves on its own scoring** (independently confirming the synthetic-backtest null),
and its assembler verdict — **honest ≈1.15, reaches-2 = FALSE**, all four panel lenses agreeing (0.95–1.35,
none reaching 2) — bracketed the *measured* combined 1.13. Its one genuinely-additive survivor,
**Residual-Momentum Decile L/S** (38/60, ρ≈0.05, net-of-β ~0.3–0.4), was **built** (`residmom.ts`).

### Fleet 7 — Options-First Regime Robustness (136 agents) → [`regime-stability.md`](regime-stability.md)
24 specs (**12 options-first + 12 regime/cross-asset**), each faithfully backtested on real cached OHLCV and
attacked by 4 red-team lenses. **Outcome: 0 clean BUILD · 8 build-after-fix · 12 CUT · 4 research-only.**
*Every* one of the 8 survivors had its headline thesis **falsified by its own red-team** — the nominal #1
(credit-stress rotation, score 40) is the very sleeve the main loop had already built and rejected, and the
fleet cited *this repo's own research file* as prior art. The one honest residual idea it kept surfacing — a
small **dollar/short-duration trend tilt** — is **already owned by the shipped `cross_asset_trend` sleeve.**

---

## 4. Consolidated outcomes

### ✅ What shipped (the 11 production sleeves in `src/lib/strategies/registry.ts`)
| Sleeve | Role | Raw Sharpe | net-of-β | ρ(SPY) |
|---|---|---|---|---|
| Cross-Sectional Momentum (12-1) | core return engine | 1.06 | **0.60** | 0.65 |
| Low-Volatility Defensive | low-vol anomaly | 0.81 | 0.18 | 0.56 |
| Factor-ETF Momentum | factor leadership | 0.90 | 0.32 | 0.66 |
| Sector Rotation | drawdown ballast | 0.66 | 0.07 | 0.60 |
| **Cross-Asset Trend** (non-equity) | **orthogonal crisis-alpha** | 0.57 | 0.07 | **0.28** |
| **Tail Hedge** (VIX term-structure) | **pure crash insurance** | 0.06 | −0.15 | **−0.07** |
| **Residual-Momentum L/S** | market-neutral diversifier | 0.44 | **0.43** | **−0.13** |
| Long-Term Reversal | market-neutral diversifier | 0.16 | — | −0.23 |
| Sector Long-Term Reversal | the **1 OOS survivor** of Fleet B | ~0.27 (OOS) | −0.05 | ~0 |
| Time-Series Trend · Short-Term Reversal | *kept but auto-starved* (demonstrate the self-tracking benching) | 0.61 / 0.22 | ~0 / −0.55 | 0.58 / 0.67 |

*Per-sleeve Sharpe / net-of-β / ρ are the documented [results.md](results.md) figures (74→165-name runs).
**Absolute single-sleeve Sharpes shift run-to-run** with the universe and window (e.g. momentum 1.04↔1.09,
factor-mom 0.90↔0.12 across runs) — which is exactly why the **portfolio OOS figure, not any one sleeve's
Sharpe, is the number to trust**. The allocator weights by *risk* and *decorrelation*, not by chasing these.*

### ❌ What was rejected (recorded so it isn't silently re-attempted) → [`red-team.md`](red-team.md) · [`regime-stability.md`](regime-stability.md) · [`options-strategies.md`](options-strategies.md)
- **All dollar-neutral pair/spread L/S** — after-cost net-of-β ≤ 0 on a thin cross-section, *and* a shared
  short-gamma left tail that **concentrates** crash risk (tail-orthogonality ≠ mean-orthogonality).
- **OU statistical-arbitrage pairs** — near-unit-root (half-lives 280d–4.7yr); "beta-neutral" spreads left
  +0.3 to +0.63 residual SPY beta (long-the-market in disguise).
- **HRP / MinVar combiners** — turnover exceeds the ~0.3–0.5%/yr edge on a K=5 menu.
- **ML-concordance gate as a funded sleeve** — kept only as an optional position *sizer*.
- **Options VRP backtest** — break-even synthetic; **BUILD-for-LIVE** (PutStrike's 8-factor scorer on the real
  chain), **ASSERT-only for backtest** (no free historical chains; calibrating to a target would be biasing).
- **CTA managed-futures (`managedfutures.ts`) & credit-stress rotation (`creditstress.ts`)** (the two
  2022-fix hypotheses) — both **built, backtested, then left unregistered**. Both have negative standalone
  net-of-β alpha; adding credit-stress **cratered the book OOS** (Sharpe 0.95→0.17, MaxDD 10%→20.6%), while
  the CTA overlay added *no* OOS value (+0.03) and worsened 2018. Both overfit to the single 2022 column.
- **Leverage / SVXY contango / vol-carry** — blow-up risk and **Sharpe is scale-invariant** (leverage can't
  raise it).

### 📊 The honest, out-of-sample-validated numbers
| Portfolio | Sharpe | MaxDD | Calmar | net-of-β | source (executed) |
|---|---|---|---|---|---|
| SPY buy & hold | 0.84 | 33.7% | 0.42 | — | benchmark |
| ARMS — full sample (return-level combiner) | 0.92 | 11.8% | 0.44 | 0.28 | [`backtests/portfolio-summary.json`](backtests/portfolio-summary.json) |
| ARMS — in-sample (≤2021) | 1.26 | 12.7% | — | 0.60 | `validate.ts` |
| **ARMS — OUT-OF-SAMPLE (>2021), the trustworthy figure** | **0.95** | **9.65%** | **0.77** | 0.28 | `validate.ts` |

The **1.26 in-sample → 0.95 OOS** gap *is* the in-sample inflation the audit removed (look-ahead fix
1.14→0.87 + a real train/test split). The sector-LT-reversal + residual-momentum diversifiers then lifted
OOS **0.91→0.95** and cut MaxDD 11.2%→9.65%. *(A **position-level** meta combiner reads higher — ~1.08–1.15,
method-dependent; the **return-level executed figures above are the conservative ones**, reproducible via
`scripts/backtest/portfolio.ts` and `scripts/backtest/validate.ts`.)*

---

## 5. The three honest verdicts (triangulated by fleets + real data + math)

1. **Sharpe ceiling ≈ 0.95 OOS — 2.0 is not reachable from this toolkit.** The diversification math
   (`Sharpe ≈ s̄·√(N/(1+(N−1)ρ̄))`) needs ~9 uncorrelated 0.6-Sharpe sleeves; a 114-agent search found
   **one** at ~0.30. Reaching 2.0 needs a *different* toolkit (paid point-in-time/delisting data, real options
   chains, or intraday/alt-data) — **not** leverage (scale-invariant). The win here is **risk** (⅓ of SPY's drawdown).
2. **Regime stability — already as stable as the toolkit allows.** ARMS loses *small* in every adverse regime
   (−1% to −6% where SPY loses −5% to −19%), MaxDD ~10% vs SPY 34%. The "2022 weakness" is a negative Sharpe on
   a tiny −5.7% loss, not a blow-up. **No OHLCV-ETF overlay made 2022 positive without breaking other regimes**
   (both 2022-fix hypotheses were red-teamed and rejected on real data).
3. **Options are not the regime answer here.** Short-vol VRP is regime-fragile (shared crash tail), long-vol
   tail hedges bleed, and chain-based ideas aren't honestly backtestable without paid data. The honest options
   exposure is the existing VIX-term-structure `tail_hedge`; the real VRP edge is harvested **live** by PutStrike's
   put-scorer on the actual chain.

---

## 6. File index

| File | What it holds |
|---|---|
| [`brief.md`](brief.md) | The fixed research brief — goal, grounding facts, the 0–60 metric (the fleets' constitution) |
| [`strategy-universe.md`](strategy-universe.md) | Fleet 1 output — 14 ranked discovery candidates, 0 KEEP, the cross-cutting themes |
| [`advanced-strategies.md`](advanced-strategies.md) | Fleet 2 output — 20 advanced specs, the net-of-β honesty fix, the consensus build roadmap |
| [`hypotheses.md`](hypotheses.md) | Every sleeve as a falsifiable H0/H1 with its **executed** verdict (confirmed / refuted-null) |
| [`results.md`](results.md) | The executed walk-forward backtests — single-sleeve, net-of-β, options nulls, meta-allocator |
| [`algorithm.md`](algorithm.md) | The converged unique algorithm — **ARMS** — its sleeves, allocator, and daily loop |
| [`red-team.md`](red-team.md) | Consolidated adversarial critique — findings against the shipped system + what was rejected |
| [`sharpe2-quest.md`](sharpe2-quest.md) | The Sharpe-2 pursuit — Fleet A audit (1.14→0.87), Fleet B, the math, the final verdict |
| [`options-strategies.md`](options-strategies.md) | The options sleeves + 141-agent fleet — why VRP is build-for-live, not backtestable |
| [`regime-stability.md`](regime-stability.md) | The 136-agent options-first regime study — both 2022-fixes rejected, final verdict |
| [`expanded-universe.md`](expanded-universe.md) | The expanded-universe push (438 eq + crypto + multi-asset + unique alt-data) — execution-anchored fleet, 1 keeper of 16, the liquidity-screen fix, sim/live divergences fixed |
| [`diversification.md`](diversification.md) | Diversification methods (HRP/min-var/MDP all lose to naive — DeMiguel 2009), the VRP live-feedback seam, the Investment-Opportunity Signal layer, and the free+paid dataset roadmap |
| [`ai-era-blueprint.md`](ai-era-blueprint.md) | The modern-AI-era system design — 6-layer stack, the **10-node self-improving agent fund** (diagram), the honest blended-Sharpe projection (conservative/base/optimistic), the skeptic's caveats, and the phased build plan |
| [`backtests/`](backtests/) | Machine-readable fleet rankings + backtest summary JSON |

---

## 7. Reproduce the executed numbers (no `npm install` needed)

```bash
# single-sleeve comparison table
node --use-system-ca --no-warnings --import ./scripts/register-ts.mjs scripts/backtest/run.ts
# combined ARMS book (return-level, no-look-ahead, vol-targeted)
node --use-system-ca --no-warnings --import ./scripts/register-ts.mjs scripts/backtest/portfolio.ts
# in-sample vs OUT-OF-SAMPLE (>2021) + per-calendar-year Sharpe — the honesty check
node --use-system-ca --no-warnings --import ./scripts/register-ts.mjs scripts/backtest/validate.ts
# replay the daily live-sim loop (validates the cron logic end-to-end)
node --use-system-ca --no-warnings --import ./scripts/register-ts.mjs scripts/daily/run.ts --seed 220
```

_All quantitative claims here are from executed walk-forward backtests on real public data; nulls are
reported as faithfully as the wins. The fleets discovered and stress-tested; the main loop verified every
claim against real data before it was trusted._
