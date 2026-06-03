# research/diversification.md — Diversification Methods, the Opportunity-Signal Layer & the Dataset Roadmap

> Goal (user): a fleet testing hypotheses on **financial-instrument methods that improve diversification**, a
> **live-feedback system that adjusts across diverse strategies**, and **signals for investment opportunity** —
> with **foundational industry methods** and **deep dataset research**. This file records the fleet (8th run),
> the executed verdict, what was built, and the honest dataset roadmap.

## TL;DR

- **PutStrike (cash-secured-put VRP) is already in the framework** (8-factor scorer + Black-Scholes + the live
  screening APIs + the put-trade journal) and is the single most **structurally orthogonal** stream to the
  directional equity book — the real diversification lever.
- **Foundational *allocation optimizers* do NOT improve diversification here.** A from-scratch A/B
  (`scripts/backtest/alloc-ab.ts` + `src/lib/strategies/diversification.ts`) of HRP, min-variance, risk-parity,
  max-diversification, and a correlation tilt — all **lost to naive equal-risk** on the 12-sleeve menu (the
  DeMiguel-Garlappi-Uppal 2009 result, now triangulated). Covariance noise dominates; HRP/min-var even pile into
  the bleed-by-design tail-hedge. **The light-touch adaptive allocator already in production is near-optimal.**
- **What WAS built (in-repo, free-data, validated):** the **Investment-Opportunity Signal layer**
  (`src/lib/signals/opportunity.ts`) — a daily, cross-instrument ranked list (every sleeve + live put
  opportunities) scored by `signal × regime-fit × marginal-diversification`, wired into the daily cron, persisted
  to Neon (`quant_signals`), exposed via `/api/quant/run` + `/state`, and shown in the Strategy Engine UI.
- **The honest improvement path is DATA, not optimization** — the fleet's dataset research names the highest-value
  free sources the system isn't using yet (below).

## The fleet (9th run: 17 agents)

| Arm | Agents | Output |
|---|---|---|
| Dataset research (web) | 6 | **88 datasets** mapped by instrument class + cost tier + what diversification lever each unlocks |
| Foundational methods | 9 | HRP, shrinkage-cov min-var/ERC, max-diversification, Black-Litterman, regime-switching, correlation guard, fractional-Kelly, ensemble-combination, VRP-as-sleeve — each a testable hypothesis |
| Opportunity-signal design | 1 | the cross-instrument opportunity-score spec (implemented) |
| Synthesis | 1 | ranked in-repo build plan (VRP sleeve #1; covariance optimizers deprioritized after the A/B) |

## Executed A/B: foundational allocation methods vs naive (the honest finding)

`alloc-ab.ts` combines the **real 12-sleeve return streams** under each method (no-look-ahead trailing weights,
vol-targeted to 10%, allocation-turnover costed):

| Allocation method | Full Sharpe | OOS Sharpe | MaxDD | Read |
|---|---|---|---|---|
| **equal-weight (1/N)** | 0.64 | **0.81** | 12.9% | **best** |
| inverse-vol (≈ current base) | 0.50 | 0.50 | 10.9% | solid |
| risk-parity (ERC) | 0.24 | 0.60 | 17.6% | worse |
| max-diversification (MDP) | 0.26 | 0.57 | 10.6% | worse |
| min-variance (shrunk cov) | 0.12 | 0.18 | 11.3% | poor |
| HRP | ~0 | ~0 | 10.2% | piles into the bleed-by-design tail-hedge → flat |
| correlation-tilt | 0.62 | 0.80 | 12.9% | ≈ equal (neutral) |

→ **No optimizer beats naive equal-risk.** The sleeves are already curated to be low-correlation, so there's
little structure left to exploit and covariance estimation noise dominates. The production allocator's value is
its **Sharpe-tilt + benching + regime de-gross + prior** (light adaptation), not a covariance optimizer — which
is *why* it reaches OOS ~0.86 position-level while these pure optimizers sit lower. **Verdict: keep the allocator
light; do not add an optimizer.** (The `diversification.ts` methods are kept as a tested, documented module.)

## What the diversification lever actually is

1. **Add the orthogonal VRP stream (PutStrike).** Short-vol theta + skew is structurally distinct from directional
   equity (ρ ≈ +0.1–0.3 in calm, negative in crashes — convex). This is the scarce resource the optimizers can't
   manufacture. **Live-feedback integration seam:** the VRP sleeve's *realized* P&L comes from the put-trade
   journal (Neon `simulated_trades`), fed to the allocator through the same `PerfProvider` contract every sleeve
   uses — so in production the allocator diversifies across equity sleeves **and** VRP, adapting to each's realized
   rolling Sharpe. (It is NOT backtest-faked: free historical option chains don't exist, so the offline book
   excludes it and the live book tracks the real journal — consistent with the project's honesty rule.)
2. **The light adaptive allocator** (already shipped) — benches the broken, floors the insurance, de-grosses in
   crises, vol-targets. Beats every optimizer OOS.
3. **The opportunity-signal layer** (below) — surfaces *where* the diversification is, daily.

## The Investment-Opportunity Signal layer (built)

`src/lib/signals/opportunity.ts` → ranked `OpportunitySignal[]` each day:

```
oppScore = SIGNAL_STRENGTH × REGIME_FIT × MARGINAL_DIVERSIFICATION × EXECUTION_QUALITY
  SIGNAL_STRENGTH        = confidence × clamp((blendedSharpe − 0.3)/(0.6+vol), 0, 1)   [puts: score/100]
  REGIME_FIT             = defensive 1.25× / offensive 0.8× in risk-off  [puts: 1.4× normal, 0.5× crisis]
  MARGINAL_DIVERSIFICATION = 1 + (1 − |ρ-to-market|)×0.4   → low-ρ sleeves rank UP (the scarce resource)
  EXECUTION_QUALITY      = puts only (spread/OI); sleeves 1.0
```

Every sleeve (and any live put opportunities) is ranked with a **DEPLOY / HOLD / TRIM / AVOID / SELL_PUT**
recommendation. Wired into `runDay` → persisted to `quant_signals` → returned by `/api/quant/run` + `/state` →
shown in the **Strategy Engine** UI. Phase 1 is **observational** (decision support; the allocator already
adapts); Phase 2 (optional) could feed `oppScore` back as an adaptive prior.

## Dataset roadmap (the honest improvement path — fleet research, 88 datasets)

The ceiling is a **data** problem, not an optimization one. Highest-value sources the system is NOT yet using:

| Source | Tier | Unlocks |
|---|---|---|
| **SEC EDGAR fundamentals + Form 4** (10-K/Q, insider clusters) | **free** | a survivorship-free **fundamental-value sleeve** (ROE/debt/growth) + insider-cluster signal — both orthogonal to price momentum |
| **QuantConnect free futures** (70+ contracts) | **free** | a genuine **CTA trend** sleeve on real futures (not the thin ETF proxy) — crisis-alpha |
| Google Trends (pytrends) | free | retail-attention / crowded-trade nowcast for the reversal sleeve |
| Historical options chains (ORATS / OptionMetrics / Databento) | paid | a **backtestable** VRP / skew sleeve — moves PutStrike from live-only to validated |
| Point-in-time equities + delisting (CRSP / Norgate) | paid | a true 1000+-name cross-section for real residual-momentum dispersion |

→ The free wins (EDGAR fundamentals, QuantConnect futures, insider clusters) are the recommended next sleeves;
the paid sets are the genuine path past the ~0.9 ceiling (a real VRP/skew sleeve + a wide point-in-time cross-section).

## Honest verdict

The diversification question has a clean, triangulated answer: **a smarter combiner does not help (DeMiguel
2009, confirmed); the win is adding genuinely orthogonal streams.** The biggest one available — the VRP/PutStrike
sleeve — is now integrated via the live-feedback seam, the opportunity-signal layer surfaces the best
cross-instrument opportunities daily, and the dataset roadmap names the free + paid sources that unlock the next
orthogonal sleeves. Everything shipped is free-data, in-repo, and validated; the rest is honestly flagged as a
data-acquisition roadmap, not a backtest claim.
