# research/advanced-strategies.md — Advanced High-Sharpe Fleet Output

> Produced by the **Advanced High-Sharpe design fleet** (115 agents, 5.8M tokens, ~35 min):
> 10 design families → 20 exact sleeve specs → 4 red-team lenses each (incl. *net-of-beta after-cost
> Sharpe* and *tail-orthogonality*) → harsh /60 score → 4-lens idea-sharing synthesis panel →
> assembler. Machine-readable: [backtests/advanced-ranked.json](backtests/advanced-ranked.json).

## Headline: the fleet independently re-derived the exact portfolio we built — and made it honest

The synthesis recommends funding **xs_momentum + low_vol + sector_rotation + cross_asset_trend +
tail_hedge** — precisely the sleeves already implemented — and **CUT every exotic/market-neutral
candidate**. Expected after-cost portfolio Sharpe: **~1.0**. The fleet explicitly states claiming
**> 1.3** "from this free-daily-data, leverage≤1 universe would be dishonest." Its decisive new
contribution is a **measurement-honesty fix** (below).

## Scored candidates (20) — after-cost, net-of-beta Sharpe

| /60 | Verdict | Sh (net-of-β, after cost) | Candidate |
|---|---|---|---|
| 33 | CUT | −0.03 | SPY-Neutralized Factor-Momentum L/S spread |
| 32 | BUILD_AFTER_FIX | 0.13 | XATS-Defensive flight-to-quality trend overlay |
| 32 | RESEARCH_ONLY | 0.13 | Bond-Curve Carry (IEF vs SHY/BIL) |
| 30 | RESEARCH_ONLY | 0.03 | HRP-Shrink sleeve combiner |
| 28 | CUT | 0.20 (gross) | Concordance-Gated Momentum (ML meta-label) |
| 28 | CUT | −0.40 | OU-Z Style Pair Reversion (IWF/IWD) |
| 28 | RESEARCH_ONLY | 0.10 | Throttle-to-Trend redeploy overlay |
| 26 | CUT | 0.03 | BreadthCredit book throttle |
| 25 | CUT | −0.15 | OU-Z Sector Pair Reversion (XLY/XLP) |
| 25 | CUT | 0.20 (gross) | ResMom-LH residual momentum, beta-hedged |
| 24 | CUT | 0.12 | XATS-Core vol-scaled cross-asset TSMOM *(≈ our cross_asset_trend, BUILT)* |
| 23 | CUT | 0.12 | Long-Only Factor Rotation *(≈ our factor_momentum — diversifier, not Sharpe-lifter)* |
| 22 | CUT | −0.05 | ResMom-LS dollar-neutral residual momentum |
| 21 | CUT | −0.15 | Regime-Gated Turn-of-Month flow |
| 18 | CUT | 0.05 | VTS-Degross VIX-term equity de-gross *(≈ our tail_hedge logic)* |
| 18 | CUT | −0.18 | VTS-Slope continuous de-gross |
| 18 | CUT | 0.05 | Concordance-Breadth de-gross overlay |
| 17 | CUT | 0.05 | VIX term-structure carry (SVXY contango) |
| 14 | CUT | −0.05 | MinVar-Shrink global-min-variance overlay |

*(The low scores on candidates that resemble our built sleeves reflect that, as standalone
market-neutral/overlay specs, they don't clear the cost floor — but as LONG-ONLY portfolio
sleeves combined under the allocator they earn their place via diversification, which the
assembler explicitly endorses.)*

## Why every market-neutral / exotic sleeve was CUT (the critical findings)

1. **Costs are the executioner (again).** The FAC-NEUTRAL spread has gross Sharpe only ~0.10 —
   *below* the ~27 bps/yr cost floor → net −0.03. Most L/S ideas died here.
2. **Tail-orthogonality ≠ mean-orthogonality.** Dollar-neutral single-name/pair L/S (ResMom-LS,
   OU IWF/IWD & XLY/XLP, defensive-minus-cyclical RV) *look* uncorrelated full-sample but carry a
   **shared short-gamma left tail** that goes negative on Mar-2020 / Aug-2024 — *concentrating* crash
   risk on the put book. Red-team replications confirmed +0.3 to +0.63 residual SPY beta.
3. **OU pairs are near-unit-root** (half-lives 280d–4.7yr) — no fast reversion to harvest.
4. **The 6-ETF factor cross-section is too thin** for residual dispersion; ResMom needs 500+ names we
   don't have free + daily.
5. **HRP / MinVar combiners lose to the existing inverse-vol allocator** — turnover exceeds the
   ~0.3–0.5%/yr edge on a K=5 menu; RESEARCH_ONLY, no backtest.
6. **The ML concordance gate** improves win-rate but adds turnover; net it didn't clear the bar as a
   funded sleeve — keep as an optional sizer.

## The fleet's decisive fix: measure NET-OF-BETA, after-rf Sharpe (STEP 0)

The reported priors (momentum 1.04, low-vol 0.91, …) are **raw, rf=0, beta-inclusive bull-sample
numbers** — they silently credit market beta and ~2%/yr cash yield. The fleet's gating step:
**regress each sleeve's returns on SPY (CAPM) and report residual-alpha Sharpe + rolling beta, and
set the risk-free rate to the realized T-bill path.** Net-of-beta, the equity sleeves' Sharpes fall
materially (≈0.6–0.7), which is *exactly why the honest portfolio Sharpe is ~1.0, not >1.3.* This was
implemented (see [results.md](results.md) net-of-beta columns) and the priors made honest.

## Consensus build roadmap (folded into the implementation)

1. **STEP 0 (done):** net-of-beta + rf-excess Sharpe in the backtest report; priors made honest.
2. **Fund** xs_momentum, low_vol, sector_rotation, cross_asset_trend, tail_hedge; keep
   factor_momentum / ts_trend / st_reversal **registered but auto-starved** (the allocator's
   `sharpeFloor` bench does this — verified live: reversal held to 4–7%).
3. **Allocator tuning (done):** lighter Sharpe tilt (0.45→0.30), raised defensive floor (0.15→0.30)
   so the convex insurance sleeves are *pre-paid* and carried into drawdowns.
4. **Orthogonality guard + drawdown circuit-breaker (specced next steps):** halve a diversifier if its
   rolling 63d corr-to-core > 0.4 or |β|>0.3 (the 2022 stocks-and-bonds-down breakdown); hard book
   de-gross if trailing 21d drawdown breaches ~12%.

## Biggest residual risk (fleet consensus)

A **2022-style synchronized stocks-AND-bonds-down regime** (positive stock-bond correlation, no
VIX≥35 spike) is the one window where *both* diversifiers stop hedging — cross-asset-trend's bond
legs and tail-hedge's TLT fail together. Mitigated (partially, reactively) by cross-asset-trend's
commodity/dollar legs (DBC/USO/UUP — the legs that carried 2022), the orthogonality guard, and the
vol-target de-gross; but the guards lag the regime flip by their estimation window.
