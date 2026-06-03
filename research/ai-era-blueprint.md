# research/ai-era-blueprint.md — The Modern-AI-Era Automated-Investment System (design + honest projection)

> Goal (user): design a method for automated investments in the modern AI era that **honestly beats** the
> current Sharpe, theorize the additional data needed, and design the **agent framework** to run it. Produced by
> an 8-expert design fleet (data · AI/ML · portfolio/risk · execution · agent framework · validation) + a
> chief-architect synthesis + an adversarial skeptic. **All Sharpe figures are PROJECTIONS pending a
> CPCV/DSR-gated walk-forward** — the honesty discipline of the rest of this repo applies.

## The honest constraint (why this is a *data + method* problem, not a tuning problem)

Nine prior fleets proved **~0.9 OOS Sharpe is the wall for free daily OHLCV + no leverage + no real options
chains.** The governing equation is `S_p = s̄·√(N/(1+(N−1)·ρ̄))`: ARMS sits at ~0.85–0.91 because its real
orthogonal sleeves measure `s̄ ≈ 0.16–0.43` at `ρ̄ ≈ 0.45`. To move the needle you must add streams with
**higher s̄ and lower ρ̄ than free OHLCV can produce** — i.e. new *data* + AI methods, governed hard against the
multiple-testing bias that this very repo already lived (look-ahead 1.14→0.87; 19 of 20 designed sleeves died OOS).

## The six-layer integrated stack (each layer = one expert pillar; same pure-`Strategy` contract end-to-end)

```
 L1  DATA FABRIC          point-in-time feature store keyed (symbol, as-of-date) → feeds StrategyContext.
                          Phase-0 FREE: SEC EDGAR fundamentals + Form-4 insiders, FRED curves/credit/SKEW/VVIX,
                          Wikidata supply-chain graph, public spend/web samples, in-repo OHLCV. Unstructured text
                          (10-K Item 1A, 8-K, transcripts) → Claude Batch → structured fields → Neon + Qdrant RAG.
                          Phase-2 PAID: Sharadar SF1 (PIT, delisting-adj), OptionMetrics IvyDB (IV surface),
                          Databento MBP-10 (intraday LOB), Kpler AIS, Earnest EASI card-spend, Similarweb.
        │  every feature carries a TEMPORAL-AVAILABILITY stamp enforced by an audit checker (look-ahead guard)
        ▼
 L2  LEARNED SIGNAL TOWER three generators wrapped as pure Strategies: (a) Chronos/Kronos foundation model on
                          returns → multi-horizon quantile forecasts; (b) LLM-extracted text signals (guidance
                          direction, tone, supply-chain shock); (c) GraphSAGE/GAT GNN over the supply-chain graph.
                          ALL signals (existing 12 sleeves + new features) → LightGBM META-LEARNER on triple-barrier
                          labels + López-de-Prado meta-labeling, regime-conditioned by a 3-state Gaussian HMM.
        ▼
 L3  PORTFOLIO & RISK     KEEP the light equal-risk + Sharpe-tilt + benching + vol-target allocator (beats
                          HRP/min-var/MDP OOS — proven). ADD a Barra-style factor-neutrality guard + Ledoit-Wolf
                          shrinkage + an ORTHOGONALITY AUDITOR (gate any new sleeve on rolling ρ-to-core → ρ̄≈0.35)
                          + regime-conditional base weights + a GARCH-VaR de-gross circuit-breaker.
        ▼
 L4  EXECUTION & SIZING   Almgren-Chriss impact-aware scheduling + an RL (PPO) overlay in a LOB sim; fractional-
                          Kelly modulated by vol-of-vol + drawdown; a capacity calculator (ADV/λ-impact) capping
                          size. Defends the transfer coefficient (TC 0.88→0.92, cost 8→3 bps) — the Grinold lever.
        ▼
 L5  SELF-IMPROVING       the agent fund (below) — a persistent discover→test→approve→deploy→monitor loop.
     AGENT FUND
        ▼
 L6  VALIDATION &         the LOAD-BEARING layer, BUILT FIRST: Combinatorial Purged CV + Deflated Sharpe + PBO
     GOVERNANCE           (probability of backtest overfit) + the temporal-availability auditor + staged capital
                          gating (research→paper→small-live→scale). Nothing ships unless it clears these.
```

## The agent framework — a persistent, self-improving AI hedge fund (10 nodes)

The centerpiece. It runs on the **existing Vercel-cron / Neon spine**; the loop is a thin wrapper on infrastructure
this repo already has (pure-`Strategy` contract, walk-forward engine, options-sim, opportunity-signal layer, the
live VRP seam). A `strategy_specs` state machine (`PROPOSED → APPROVED → LIVE → RETIRED`) lives in Neon.

```
                    ┌──────────────────────────── HUMAN GOVERNOR ───────────────────────────┐
                    │            weekly review · veto authority · kill-switch                │
                    └───────────────────────────────┬───────────────────────────────────────┘
                                                     │ governance gate
   ┌──────────────┐   EOD data   ┌──────────────────▼─────────────────┐   approved specs   ┌────────────────────┐
   │ DATA ENGINEER │ ───────────▶│  SIGNAL RESEARCHER (Sonnet/Opus)    │ ─────────────────▶ │ PORTFOLIO          │
   │ keeps feature │  (blocks if │  proposes strategy specs +          │                    │ CONSTRUCTOR        │
   │ store fresh   │   stale)    │  economic mechanism daily           │                    │ equal-risk + tilt  │
   └──────────────┘              └──────────┬─────────────────────────-┘                    │ + vol-target       │
          ▲                                 │ hypothesis                                     └─────────┬──────────┘
          │                                 ▼                                                          │ target book
          │                      ┌──────────────────────┐   OOS Sharpe   ┌─────────────────────────┐  ▼
          │                      │ BACKTESTER            │ ─────────────▶ │ RED TEAM (4 lenses ‖)   │ ┌────────────────┐
          │                      │ walk-forward · CPCV   │                │ cost · regime · snoop · │ │ EXECUTION      │
          │                      │ · DSR · capacity      │ ◀───reject──── │ tail-orthogonality      │ │ TRADER (sim)   │
          │                      └──────────────────────┘                └─────────────────────────┘ └───────┬────────┘
          │                                                                                                   │ live fills
   ┌──────┴───────────┐   drift flags / signal-decay   ┌────────────────────┐   real-time   ┌────────────────▼──────┐
   │ PERFORMANCE       │ ◀──────────────────────────── │ RISK MANAGER       │ ◀──────────── │ (Neon: holdings,      │
   │ MONITOR (Haiku)   │ ───── retrigger red-team ────▶ │ GARCH-VaR · de-gross│   P&L         │  allocations, audit)  │
   │ daily attribution │                                │ · circuit-breaker  │               └───────────────────────┘
   └───────────────────┘                                └────────────────────┘
            ▲                                                                          all orchestrated by the
            └──────────────────── live P&L → attribution → retrain → redeploy ───────  META-CONTROLLER (compute
                                  (the closed self-improvement loop)                    budget · kill-switches)
```

**Roles:** MetaController (orchestration, compute budget, kill-switches) · Data Engineer (freshness gate) ·
Signal Researcher (Claude — generates specs + mechanisms) · Backtester (walk-forward + CPCV + DSR + capacity) ·
Red Team (4 adversarial lenses in parallel) · Portfolio Constructor (the proven light allocator) · Risk Manager
(GARCH-VaR, crisis de-gross) · Execution Trader (idempotent sim fills) · Performance Monitor (drift/decay) ·
Human Governor (weekly veto + kill-switch). Model tiering: **Opus for research/red-team, Sonnet for routine
generation, Haiku for monitoring** — cost-aware. **This is the same execution-anchored loop the 9 fleets already
ran, productized into a continuous service.**

## The honest blended-Sharpe projection (chief architect + skeptic)

Not a sum of pillar self-estimates (that double-counts the shared base and assumes implausibly low ρ). Treating
the ARMS core as one composite stream and adding the genuinely-orthogonal diversifiers via the portfolio math:

| Scenario | Path | Projected OOS Sharpe | Rests on |
|---|---|---|---|
| **Conservative** | Phase 0–1 only (free/cheap data) | **0.91 → ~1.00–1.05** | weak-but-real LLM/insider/fundamental streams (s≈0.2–0.3); lift is modest + cuts drawdown |
| **Base** | Phase 0–2 (paid options + intraday hold) | **0.91 → ~1.15–1.25** | real options data delivering a ~0.45-Sharpe low-ρ VRP sleeve; meta-learner IC ~0.08; CPCV/DSR keep IS/OOS gap <0.10 |
| **Optimistic** | everything ships, ρ̄≈0.30 holds in stress | **0.91 → ~1.35–1.50** | 6–8 streams at s̄≈0.35, ρ̄≈0.30 — at the edge of plausibility |

**Sharpe 2.0 is still NOT credibly reachable** — it needs `Σsᵢ² ≈ 3.1` (≈9 uncorrelated 0.6-Sharpe streams).
Realistically you source **one** 0.45–0.6 stream (options VRP) + several 0.2–0.3 streams → the arithmetic tops out
near **~1.4–1.5**, not 2.0. (2.0 lives in proprietary intraday/causal-ML territory we are not claiming.)

**The skeptic's three load-bearing caveats (carried, not buried):**
1. **The 0.91 "floor" is really ~0.80 ± 0.15 SE** over an 11-year mostly-bull sample (2022 printed −0.95). Base the
   plan on 0.80, not 0.91.
2. **The VRP 0.45 is a hopeful literature import, not a measured number** — the in-repo *synthetic* VRP backtested
   *negative*, and put-write/VRP is the single most-crowded, most-published anomaly (worst alpha-decay risk).
3. **Alt-data ρ̄ is assumed 0.30–0.40 but crisis ρ→0.7–0.8** — the streams co-move violently exactly when you need
   diversification. McLean-Pontiff: budget **26–58% post-publication decay** on anything resembling a known anomaly.

**Top-3 reasons AI funds fail to realize backtested edge** (the skeptic): (1) **backtest overfitting / multiple
testing** — the #1 killer; the LightGBM meta-learner over 20+ signals can fit 11 years of noise; this repo already
saw 95% in-sample sleeve mortality → Layer 6 must be built first and obeyed; (2) **alpha decay / crowding**;
(3) **execution slippage at scale**.

## Phased build plan + the buildable-now first move

| Phase | Cost | Adds | Target OOS Sharpe |
|---|---|---|---|
| **0 (now, free/in-repo)** | $0–100/mo | CPCV+DSR+PBO harness · look-ahead auditor · LightGBM meta-learner over the 12 sleeves · HMM regime detector · free EDGAR Form-4 + FRED features · Chronos returns-forecast · prototype LLM 10-K extraction | **~0.95–1.00, rigorously DSR-gated** |
| 1 (cheap data) | ~$3–5k | Sharadar PIT fundamentals + insider/spend/web samples → fundamental-value + insider sleeves | ~1.00–1.05 |
| 2 (paid AI) | ~$30–100k/yr | OptionMetrics IV surface (backtestable VRP) · Databento intraday LOB · Kpler/Earnest/Similarweb · RL execution | ~1.15–1.25 |
| 3 (full AI fund) | team + infra | the 10-node continuous agent fund, staged capital gating, live | ~1.25–1.5 (if ρ̄ holds) |

**Highest-ROI first move (Phase-0 item #1): the validation/governance layer — already started.** The **Deflated +
Probabilistic Sharpe Ratio** is now in the repo (`src/lib/backtest/metrics.ts` + `scripts/backtest/deflated.ts`);
it *quantified* the multiple-testing bias (the book's PSR-vs-zero is ~90–95%, but the DSR shows the searched
sleeves must stay small — exactly why they are). Next: a Combinatorial Purged CV split + a PBO estimate, then the
LightGBM meta-learner over the existing 12 sleeve signals — all free, in-repo, and gated by the harness.

## Honest verdict

There **is** a credible, defensible path from ~0.85–0.91 to **~1.2–1.3 OOS over 12–18 months** — but it is bought
with **data and AI methods, governed hard against overfitting**, not with a cleverer free-data sleeve or leverage.
The agent framework that runs it is the execution-anchored loop this repo already proved, productized into a
persistent self-improving fund with a load-bearing validation layer. **2.0 remains a different-toolkit claim we do
not make.** Every number here is a projection until the CPCV/DSR-gated walk-forward says otherwise — which is the
whole point.
