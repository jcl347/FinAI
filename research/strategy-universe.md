# research/strategy-universe.md — The Discovered Strategy Universe (Agent-Fleet Output)

> Produced by the **Strategy Discovery fleet** (82 agents, 3.2M tokens, ~10 min): 12 strategy
> families → 33 candidates → 14 fully vetted (formalize → 3 red-team lenses → harsh 0–60 score).
> Full machine-readable ranking: [backtests/discovery-ranked.json](backtests/discovery-ranked.json).
> Cross-referenced against the **executed backtests** in [results.md](results.md).

## Headline: 0 KEEP, all REVISE/CUT — and that is the correct, honest result

The harsh grader (Orthogonality + CostRobustness load-bearing) passed **nothing** as a clean KEEP.
This is not failure — it is the brief working. It matches the executed backtest: standalone anomalies
sit at Sharpe ~0.6–1.0 and several are cost-killed. **The edge is in the *combination*, not any one sleeve.**

## Ranked candidates (fleet score /60)

| Score | Verdict | Candidate | Family | The critical finding |
|---|---|---|---|---|
| 37 | REVISE | Structural ETF style/sector-spread OU reversion (IWF/IWD, XLY/XLP), dollar+beta-neutral | pairs/stat-arb | Real *composition-anchored* mechanism (not mined cointegration), but its tail co-moves with the short-vol book; SPY/QQQ cap-weight drift breaks fair value. Salvage: narrow style/sector pairs only. |
| 34 | REVISE | **TSM-Gate**: 12-1 time-series momentum, ML-concordance as veto/sizer | trend + ML | **orth 7.** Positive-skew crisis-alpha vs the CSP's negative skew → genuinely different drawdown regime. Use ML concordance as a *filter*, not standalone alpha. |
| 33 | REVISE | Factor-momentum style-ETF rotation (SPY-neutralized) | factor | Factor returns autocorrelate, but **cost 3** and needs a broad factor-ETF set *wired in* (IWF/IWD/MTUM/QUAL absent from current universe). |
| 31 | CUT | Residual (idiosyncratic) cross-sectional momentum, vol-target sized | momentum | Only survives as a **beta-neutral** selection overlay on a widened (S&P 500) universe. |
| 29 | REVISE | **Cross-Asset TSMOM overlay** (long-vol crisis-alpha diversifier) | managed futures | **data 9, genuinely orthogonal.** Slow-bear hedge; deploy when bond-equity corr is negative, sized off *non-equity* trends (bonds/gold/commodities). |
| 28 | REVISE | **VIX front-end backwardation beta-cut** + defined-risk convexity | options term-structure | **orth 8 (highest).** Strip convexity; run only the equity de-gross (SPY/QQQ→TLT, else cash) as a ≤30% tail-hedge layer. |
| 27 | CUT | VIX-conditioned 5-day cross-sectional reversal | mean reversion | **cost 2.** Liquidity-provision premium real but eaten by turnover — *exactly the executed reversal null*. Only a counter-cyclically-sized, separately-capitalized version is admissible. |
| 25 | REVISE | Beta-neutral Betting-Against-Beta (BAB) L/S | factor | **cost 2.** Shorting leg's borrow/turnover kills it; only the **long-only low-beta core survives — already coded as `lowvol.ts`.** |
| 19 | CUT | Credit-stress defensive sector tilt (HYG/TLT + FRED gated) | macro rotation | Accepted-negative-carry insurance at best; data plumbing weak (data 3). |
| 16 | CUT | Concordance-gated cross-sectional iTransformer L/S (dollar-neutral) | ML | **Shared short-gamma left tail would CONCENTRATE crash risk** on the put book — anti-diversifying. |
| 14 | CUT | TS-gated convexity overlay (VIX9D/VIX put debit spread) | tail-risk | cost 1; defined-risk tail-smoothing only, not alpha. |
| 14 | CUT | Quality-minus-Junk (QMJ) E/P + low-vol beta-neutral L/S | factor | E/P tilt adds nothing beyond low-beta (its own H0); cost 1. |
| 13 | CUT | Event-vol term-structure RV (vega-balanced earnings calendar) | earnings/event | Only vega-neutral *slope* as a low-corr diversifier; data 2 (earnings history limited). |
| 12 | CUT | Regime-gated SPY/QQQ ATM put calendar (contango harvest) | VRP beyond puts | Captures a decayed/crowded premium, non-orthogonal to the incumbent short-vol book. |

## Cross-cutting themes (what the whole fleet agreed on)

1. **Costs are the executioner.** Every high-turnover idea (reversal, factor-mom, BAB, calendars) was
   cut or gutted on CostRobustness. The conservative cost model + the executed reversal null agree.
2. **Orthogonality is scarce and precious.** The only return streams genuinely uncorrelated to the
   long-only/short-vol book are: **(a) cross-asset trend on non-equities** (positive skew),
   **(b) a VIX-term-structure-gated equity de-gross / tail hedge**, and **(c) vega-neutral term-structure slope.**
3. **Beware false orthogonality.** Dollar-neutral single-name L/S *looks* market-neutral but carries a
   shared short-gamma left tail that concentrates crash risk on the put book. Tail orthogonality ≠ mean orthogonality.
4. **The ML model earns its keep as a FILTER**, not an oracle: concordance-gate trend/momentum entries
   and size by `model_confidence`; never trade the raw forecast standalone.
5. **Add data to unlock factors** (user-authorized): factor ETFs (MTUM/QUAL/USMV/VLUE/IWF/IWD) and a
   clean non-equity trend sleeve (TLT/IEF/GLD/DBC) widen the orthogonal opportunity set.

## What this implies for the build (→ [algorithm.md](algorithm.md))

Keep the cost-surviving long-only sleeves (**momentum**, **low-vol**, **sector rotation**) and ADD the
**genuinely orthogonal** ones the fleet surfaced: a **cross-asset trend sleeve** (non-equity, positive
skew) and a **VIX-term-structure tail-hedge de-gross overlay**, plus an optional **ML-concordance gate**
on the directional sleeves and a **narrow style/sector pair-reversion** sleeve. Combine via the
adaptive, vol-targeted allocator. The Advanced High-Sharpe fleet designs the exact specs + feedback loops.
