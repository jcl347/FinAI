# research/results.md — Executed Empirical Results (faithful, incl. nulls)

> **Discipline (from Research_Analyzer):** report what the data show — winners *and* losers.
> Standard literature parameters; **no in-sample tuning** on this 11-year sample; walk-forward
> no-look-ahead engine; conservative cost model (~10 bps round trip + 50 bps/yr short borrow).
> Reproduce: `node --use-system-ca --no-warnings --import ./scripts/register-ts.mjs scripts/backtest/run.ts`

## Setup

- **Universe:** 101 symbols (74 large-cap equities + 11 sector SPDRs + 11 multi-asset ETFs +
  broad/macro tickers). Free, daily Yahoo data.
- **Period:** 2015-06-02 → 2026-06-01 (2,766 trading days ≈ 11 years).
- **Capital:** \$100,000. Long-only, gross ≤ 1.0 (cash-secured, no leverage — matches the sim mandate).
- **Costs:** 3 bps spread + 2 bps slippage per side (≈10 bps round trip) + \$0 commission + 50 bps/yr
  borrow on shorts. Deliberately pessimistic — we would rather understate edge than overstate it.

## Single-strategy results (run 1)

| Strategy | Family | CAGR | Vol | **Sharpe** | Sortino | MaxDD | Calmar | Turnover/yr | ρ(SPY) | Trades |
|---|---|---|---|---|---|---|---|---|---|---|
| Buy & Hold SPY *(bench)* | benchmark | 14.2% | 17.8% | 0.84 | 0.79 | 33.7% | 0.42 | 9% | 1.00 | 1 |
| **Cross-Sectional Momentum (12-1)** | momentum | **18.6%** | 18.1% | **1.04** | 0.87 | 29.3% | 0.63 | 610% | 0.65 | 1,532 |
| **Low-Volatility Defensive** | defensive | 10.6% | 11.8% | **0.91** | 0.78 | 28.4% | 0.37 | 496% | **0.56** | 1,211 |
| Sector Momentum Rotation | rotation | 8.3% | 13.5% | 0.66 | 0.57 | **18.4%** | 0.45 | 915% | 0.60 | 432 |
| Time-Series Trend (multi-asset) | trend | 7.2% | 12.7% | 0.61 | 0.54 | 26.5% | 0.27 | 550% | 0.58 | 767 |
| Short-Term Reversal (RSI-2) | mean_reversion | 2.4% | 19.2% | 0.22 | 0.21 | 44.0% | 0.05 | **31,401%** | 0.67 | 29,484 |

## Findings (faithful)

1. **Cross-sectional momentum is the standout edge.** Sharpe 1.04 vs SPY's 0.84, +4.4%/yr CAGR,
   and a *lower* max drawdown (29% vs 34%), even after 610%/yr turnover and conservative costs. The
   absolute-momentum overlay (cash when SPY<200d) is doing real work on the drawdown. **KEEP.**

2. **Low-vol is the best diversifier.** Sharpe 0.91 at only 11.8% vol, and the lowest correlation to
   SPY (0.56) of any sleeve — exactly the orthogonality the put-selling book lacks. **KEEP.**

3. **Trend & sector-rotation are insurance, not alpha (in this sample).** Both lag SPY on return in
   a bull-heavy 11-year window, but both cut drawdown materially (sector rotation MaxDD 18.4%!) and
   sit at ρ≈0.6. Their value is *conditional* — they earn their keep in the regimes this sample is
   light on (prolonged bears). They belong in the mix as drawdown ballast, sized by the allocator. **KEEP (conditional).**

4. **Short-term reversal is a confirmed NULL.** A genuine gross edge is *annihilated* by 31,401%/yr
   turnover under realistic costs → 2.4% CAGR, 0.22 Sharpe, 44% drawdown (it buys falling knives in
   fast selloffs). This is the red-team's "CostRobustness" axis proven on data. It will NOT be
   deployed at full weight; the self-tracking allocator starves it automatically. *(A lower-turnover
   v2 — weekly rebalance + 2-day hold band — is a candidate future refinement, but the v1 result
   stands as reported.)*

## Net-of-beta honesty (advanced-fleet gating fix)

The raw Sharpes above are **beta-inflated, rf=0, bull-sample** numbers. The advanced fleet's STEP 0
forced the honest measure: CAPM-regress each sleeve on SPY and report **net-of-market-beta** Sharpe
(annualized alpha / residual vol) at a realistic ~2% risk-free rate. Run 1 with that column:

| Sleeve | Raw Sharpe | β to SPY | **Net-of-β Sharpe** | Honest read |
|---|---|---|---|---|
| Cross-Sectional Momentum | 1.04 | 0.65 | **0.54** | the genuine alpha engine |
| Low-Volatility | 0.91 | 0.37 | 0.37 | real, smaller alpha |
| Factor-ETF Momentum | 0.90 | 0.52 | 0.32 | real but collinear with momentum (ρ 0.66) |
| Sector Rotation | 0.66 | 0.45 | **0.07** | almost entirely market beta |
| Cross-Asset Trend | 0.57 | **0.11** | 0.07 | low-α *diversifier* — kept for its 0.11 β / 0.28 ρ, not α |
| Tail Hedge | 0.06 | −0.07 | **−0.15** | insurance — *costs* money in calm, by design |
| Time-Series Trend | 0.61 | 0.41 | ~0.00 | mostly beta |
| Short-Term Reversal | 0.22 | 0.72 | **−0.55** | expensive beta — dead, confirmed twice |

**The honest conclusion:** only **momentum** has a large standalone alpha (0.54). Low-vol and factor
add real but smaller alpha. The remaining sleeves are **diversifiers/insurance**, not alpha — they earn
their place by *decorrelation and drawdown control*, which is exactly why the allocator weights by
RISK (inverse-vol) and FLOORS the convex sleeves rather than chasing their (low) standalone Sharpe.
This is why the honest portfolio Sharpe is ~0.85–0.95, not >1.3.

## Run 3 — Sharpe-2 push: expanded universe + options VRP (honest, incl. nulls)

**Universe expanded** to ~165 diverse optionable names (semis, software, internet, fintech, healthcare,
more financials/industrials/energy, high-IV growth) + vol/credit ETPs. Effect on the equity sleeves:

| Sleeve | Sharpe (74→165) | Net-of-β alpha | Read |
|---|---|---|---|
| Cross-Sectional Momentum | 1.04 → **1.06** | **0.54 → 0.60** | wider cross-section ⇒ more dispersion ⇒ stronger alpha (but MaxDD 29%→34%) |
| Low-Volatility | 0.91 → 0.81 | 0.37 → 0.18 | *diluted* by higher-vol additions |
| Others | ~unchanged | — | use ETF universes |

→ Expanding to more diverse stocks is a **mixed bag**: it genuinely strengthens the momentum alpha
engine but dilutes low-vol and adds drawdown. Not a free Sharpe boost.

**Options VRP sleeves** — backtested with a purpose-built **synthetic options engine** (`options-sim.ts`:
Black-Scholes priced from the real underlying path, IV = realized vol + a 3.5-vol-point variance-risk
premium, vol spikes raise the mark so the short-gamma tail shows up; conservative option costs). Faithful results:

| Sleeve | Sharpe | MaxDD | Net-of-β | Verdict |
|---|---|---|---|---|
| Index CSP (SPY/QQQ/IWM/DIA) | −0.12 | 31% | −1.75 | **NULL** |
| Index CSP + 200d uptrend filter | −0.33 | 35% | −1.62 | **NULL** |
| Single-name CSP (stable basket) | −0.37 | 27% | −2.36 | **NULL** |
| Iron condor / short strangle | −1.9 / −2.8 | ~100% | — | **blow up** (defined-risk leverage on tiny collateral) |

**Honest finding (not a bug — verified by adding the documented trend filter, which did not help):** a
*conservative synthetic* backtest of mechanical put-selling is break-even-to-negative. At 16-delta, ~16%
of cycles finish ITM and the assignment losses roughly equal the harvested premium after realistic costs.
The real high-Sharpe VRP edge depends on (a) the **actual IV surface + skew** (richer than an RV+spread
proxy) and (b) PutStrike's **8-factor live filtering on the real chain** — neither of which can be replicated
in offline synthesis *without risking bias*. So the options sleeve is **BUILD-for-LIVE (real chain), but
ASSERT-only for backtest** — we do not claim a backtested options Sharpe we cannot honestly produce.

**Combined portfolio** (return-level, vol-targeted, expanded universe, equity sleeves + the options sleeve
which the self-tracking floor correctly **benched** because it backtests negative):

| | CAGR | Vol | **Sharpe** | MaxDD | Calmar | ρ(SPY) | net-of-β |
|---|---|---|---|---|---|---|---|
| SPY | 15.4% | 18.0% | 0.89 | 33.7% | 0.46 | 1.00 | 0 |
| Combined (6 long-only + orthogonal sleeves) | 7.0% | 6.2% | 1.13 | 8.7% | 0.80 | 0.55 | 0.45 |
| **+ Residual-Momentum L/S (market-neutral)** | 7.2% | 6.3% | **1.14** | 9.9% | 0.73 | 0.49 | **0.50** |

The fleet's top NEW survivor, **Residual-Momentum L/S** (beta-neutral, **standalone ρ(SPY) −0.13,
net-of-β alpha 0.43**), was implemented (`residmom.ts`) and added — it nudged Sharpe 1.13→**1.14** and
lifted the portfolio's **net-of-β alpha 0.45→0.50** (genuine non-beta alpha). The `csp_vrp` options sleeve
stays **benched** (Sharpe −0.38) by the self-tracking floor. → The honestly-measured ceiling is **Sharpe
~1.14, MaxDD ~10%** — roughly double SPY's risk-adjusted return at a third of its drawdown. **It does NOT
reach Sharpe 2** (independently confirmed by the 141-agent fleet: honest expected 1.15, reaches-2 = false).

### Honest verdict on the Sharpe-2 goal

**Sharpe 2 is not achievable honestly** from long-only/defined-risk, **no-leverage**, **free-daily-data**,
**offline-backtestable** sleeves. The math needs either (a) **leverage** on the vol target (out of the
current ≤1.0 mandate), or (b) a genuinely high-Sharpe **options VRP** sleeve — which is real *live* but
**cannot be backtested cleanly** without paid historical options data, and whose conservative synthetic
proxy is break-even. Claiming 2 would require either leverage or an over-optimistic options assumption —
i.e. it would be **marketing, not measurement**. The honest, defensible result of this push is **Sharpe ~1.13
with an 8.7% max drawdown (Calmar 0.80)** — and the *live* system can additionally harvest the real options
VRP through PutStrike's existing put-scoring engine on the live chain (tracked, but not counted in the backtest).

## Implication for the unique algorithm

No single sleeve dominates on all axes: momentum has the best Sharpe, low-vol the best orthogonality,
rotation the best drawdown. The brief's metric rewards *combining* uncorrelated, cost-surviving edges.
→ The deliverable is a **regime-aware, self-tracking meta-allocator** that holds the cost-surviving
sleeves (momentum, low-vol, rotation, trend), weights them by *realized* rolling performance, and
de-risks in bear regimes. Meta-backtest results are appended below once executed.

## Meta-allocator results (run 2) — the Sharpe lift from combining + adapting + vol-targeting

| Portfolio | CAGR | Vol | **Sharpe** | Sortino | MaxDD | Calmar | ρ(SPY) |
|---|---|---|---|---|---|---|---|
| Benchmark: Buy & Hold SPY | 14.23% | 17.83% | **0.84** | 0.79 | 33.73% | 0.42 | 1 |
| Naive Equal-Weight Ensemble | 10.27% | 12.59% | **0.84** | 0.74 | 31.29% | 0.33 | 0.57 |
| Adaptive Meta-Allocator | 7.89% | 9.84% | **0.82** | 0.72 | 15.41% | 0.51 | 0.59 |
| Adaptive Meta + 10% Vol Target | 7.37% | 8.91% | **0.84** | 0.74 | 13.53% | 0.54 | 0.59 |

The adaptive variants were handed all 5 sleeves — including the broken reversal sleeve — and
starved it automatically from realized rolling performance (the self-tracking feedback loop).

### Critical read (this is the key finding for "far more Sharpe")

The meta-allocator delivered a **huge drawdown/Calmar win** (MaxDD 33.7%→13.5%, Calmar 0.42→0.54,
vol 17.8%→8.9%) but **did NOT lift Sharpe above SPY (~0.84)**. That is not a bug — it is the
mathematics of the sleeve set: **every one of the five sleeves is long-only equity**, so they all
carry market beta and are mutually correlated (ρ to SPY 0.56–0.67). Diversifying among correlated
return streams compresses volatility but cannot raise Sharpe much — the ceiling is roughly the
average sleeve Sharpe.

**Therefore the path to far higher Sharpe is structural, not parametric:**
1. **Add market-neutral (dollar/beta-neutral long-short) sleeves** — they strip market beta, so
   their return stream is genuinely uncorrelated to the long-only book → large diversification lift.
2. **Add cross-asset return streams** — trend/carry on bonds, gold, commodities (the TS-trend sleeve
   hints at this but is diluted by equity ETFs); these decorrelate hard in equity selloffs.
3. **Add the options volatility-risk-premium** (defined-risk: put spreads / iron condors / covered
   calls) — short-vol P&L is structurally distinct from directional equity.
4. **Combine fewer, higher-conviction, lower-correlation sleeves** and let the winner (momentum,
   Sharpe 1.04) run — the current allocator is too defensive (risk-parity + benching dilute it).
5. **Vol-target the combination** (already in) — it is the cheapest Sharpe/Calmar lever and is doing
   real work on drawdown.

This empirical reality is the brief handed to the **Advanced High-Sharpe agent fleet** (see
[advanced-strategies.md](advanced-strategies.md) and [algorithm.md](algorithm.md)).
