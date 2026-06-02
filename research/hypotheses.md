# research/hypotheses.md — Falsifiable Hypotheses + Executed Verdicts

> Each sleeve/idea as a falsifiable hypothesis (H0/H1) with the exact data falsifier and the
> **executed** verdict from the walk-forward backtest ([results.md](results.md)). Discipline:
> standard params, no in-sample tuning, conservative costs, no look-ahead. Nulls reported faithfully.

| # | Hypothesis (H1) | Falsifier (H0 holds if…) | Verdict |
|---|---|---|---|
| H1 | Cross-sectional 12-1 momentum (top quintile, SPY<200d→cash) earns a positive after-cost Sharpe > SPY | net Sharpe ≤ SPY (0.84) after 610%/yr turnover costs | **CONFIRMED** — Sharpe 1.04, MaxDD 29% |
| H2 | Low-vol/BAB long-only tilt earns a high Sharpe with low ρ to SPY | Sharpe ≤ SPY or ρ ≥ 0.8 | **CONFIRMED** — Sharpe 0.91, ρ 0.56 |
| H3 | Factor-ETF momentum rotation captures factor leadership at low turnover | Sharpe ≤ SPY or turnover > momentum's | **CONFIRMED** — Sharpe 0.90, only 208 trades |
| H4 | Sector momentum rotation gives strong drawdown control | MaxDD ≥ SPY's 34% | **CONFIRMED** — MaxDD 18.4% (best single) |
| H5 | **Cross-asset trend on non-equities is genuinely orthogonal** (ρ to SPY < 0.4) | ρ ≥ 0.4 (it's just equity beta) | **CONFIRMED** — ρ **0.28**, MaxDD 11% |
| H6 | **A VIX-term-structure tail hedge is negatively correlated to equities** | ρ ≥ 0 over the sample | **CONFIRMED** — ρ **−0.07** (pure insurance) |
| H7 | Short-term RSI-2 reversal has a real edge that survives costs | net Sharpe ≤ 0.4 after turnover | **REFUTED (NULL)** — Sharpe 0.22, 31,401%/yr turnover ate it |
| H8 | Combining low-ρ sleeves lifts portfolio Sharpe above any single long-only-equity meta | ensemble Sharpe ≤ 0.84 | **CONFIRMED** — naive ensemble 0.95 (vs 0.84) once orthogonal sleeves added |
| H9 | A performance-chasing adaptive allocator beats naive equal-weight OOS | adaptive Sharpe ≥ equal-weight | **REFUTED** — adaptive 0.79 < equal-weight 0.95 (DeMiguel 2009 confirmed) → adaptation made LIGHT |
| H10 | Vol-targeting the combination improves Calmar / cuts drawdown | MaxDD/Calmar no better than untargeted | **CONFIRMED** — MaxDD 18.5%→12.2%, Calmar 0.42→0.55 |
| H11 | The self-tracking loop starves a broken sleeve automatically | reversal keeps a full 1/N share live | **CONFIRMED** — reversal held to 4–7% in the 221-day live replay |
| H12 | Regime de-risk reallocates from offense to defense in bear flips | weights unchanged across SPY<200d / VIX≥35 | **CONFIRMED** — momentum 16%→3%, cross-asset trend →35% on the 2026-03 risk-off flip |

**Advanced (specced + critically vetted by the Advanced fleet; not yet in the executed backtest):**

| # | Hypothesis | Status |
|---|---|---|
| A1 | ML-concordance gating (iTransformer+ensemble) raises the momentum/trend sleeves' after-cost Sharpe without adding turnover | RESEARCH → BUILD candidate |
| A2 | Narrow composition-anchored style-pair reversion (IWF/IWD, XLY/XLP) adds orthogonal *mean* return if crisis-force-closed | RESEARCH → BUILD-AFTER-FIX (tail co-moves with short-vol; needs the force-close) |
| A3 | A modest leverage band on the vol-target (≤1.3× when realized vol ≪ target) lifts Sharpe without blow-up risk | RESEARCH candidate (mandate currently caps gross ≤ 1.0) |

See [algorithm.md](algorithm.md) for how the confirmed sleeves compose into ARMS, and
[advanced-strategies.md](advanced-strategies.md) for the full advanced-fleet output.
