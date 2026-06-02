# research/red-team.md — Consolidated Adversarial Critique

> The adversarial layer of the research, consolidated from both agent fleets (discovery: 3 red-team
> lenses × 14 specs; advanced: 4 red-team lenses × 20 specs + a skeptic synthesis lens) and the
> executed backtests. Severity-tagged. This is the "be critical / ensure viability" deliverable —
> it records where the system is weak and what was *rejected*, not just what shipped.

## Findings against the SHIPPED system (ARMS)

| # | Severity | Finding | Mitigation (in code) / Status |
|---|---|---|---|
| R1 | **Serious** | **Reported Sharpes were beta-inflated, rf=0, bull-sample.** Net-of-beta, the equity sleeves fall to 0.07–0.54; only momentum has large standalone alpha. | **Fixed** — `capmStats()` now reports net-of-β + rf-excess Sharpe ([results.md](results.md)); docs state the honest ~0.85–0.95, not >1.3. |
| R2 | **Serious** | **2022-style stocks-AND-bonds-down regime** breaks *both* diversifiers at once (cross-asset-trend bond legs + tail-hedge TLT) → book collapses to its equity beta. | **Partial** — cross-asset-trend carries DBC/USO/UUP (the legs that worked in 2022); vol-target de-grosses as cross-sleeve corr rises. **Open:** an explicit corr-to-core orthogonality guard (specced, not yet wired — needs cross-sleeve metric the single-sleeve PerfProvider lacks). |
| R3 | Serious | **Adaptive allocation *underperformed* naive equal-weight OOS** (DeMiguel-Garlappi-Uppal). Performance-chasing on a noisy 126d window gets whipsawed. | **Fixed** — adaptation made a *light* overlay on an equal-risk base (priorBlend 0.7, sharpeTiltStrength 0.30); its real job is defense (bench broken, de-risk crises), not sleeve-timing. |
| R4 | Minor | **EOD close-to-close execution flatters fills** (a live system trades next session). | Offset by a deliberately conservative cost model (~10 bps round trip + 50 bps borrow); the live runner trades the next session, matching. |
| R5 | Minor | **`factor_momentum` is collinear with `xs_momentum`** (ρ 0.66) — funding both re-buys SPY beta. | Kept **registered but the allocator's inverse-vol + light tilt sizes it small**; documented to fold its budget into momentum. |
| R6 | Minor | **Bull-heavy 2015–2026 sample** — the defensive sleeves & crisis de-gross are mostly dormant, so ARMS's relative edge (drawdown control) is under-exercised here. | Acknowledged; leave-one-crisis-out validation is the recommended pre-capital gate. |
| R7 | Minor | **Costs are flat** (spread+borrow); commodity/EM legs are undercharged in stress. | Diversifiers kept on 21d/3d cadences to bound turnover; noted as a caveat. |
| R8 | Framing | **Operational risk:** Vercel cron silent failure / Neon book divergence. | `hasRunFor()` idempotency, `CRON_SECRET` auth, full decision audit trail persisted. |

## What was REJECTED, and why (so it isn't silently re-attempted)

- **All dollar-neutral / pair / spread market-neutral sleeves** (ResMom-LS, OU IWF/IWD & XLY/XLP,
  defensive-minus-cyclical RV, FAC-NEUTRAL): after-cost net-of-beta Sharpe ≤ 0 on our thin
  74-name/6-ETF cross-section, AND several carry a **shared short-gamma left tail** that *concentrates*
  crash risk on the put book. **Tail-orthogonality ≠ mean-orthogonality.**
- **OU statistical-arbitrage pairs:** near-unit-root (half-lives 280d–4.7yr) — no harvestable reversion;
  "beta-neutral" spreads left +0.3 to +0.63 residual SPY beta (long-the-market in disguise).
- **HRP / MinVar / max-diversification combiners:** turnover exceeds the ~0.3–0.5%/yr edge on a K=5
  menu; the existing inverse-vol allocator already does the robust thing. RESEARCH_ONLY.
- **ML concordance gate as a funded sleeve:** improves win-rate but adds turnover; net it didn't clear
  the cost bar — retained only as an optional position *sizer*, not standalone alpha.
- **Short-term reversal at full weight:** executed null (Sharpe 0.22, net-of-β −0.55, 31,401%/yr
  turnover). Kept registered solely to *demonstrate* the self-tracking loop starving it (it held 4–7%).
- **Leverage / SVXY contango / vol-carry:** blow-up risk; outside the leverage≤1 cash-secured mandate.

## Honest verdict

ARMS is a **defensible, mechanism-backed, cost-survivable** long-only/no-leverage system whose
**measured** edge is *risk reduction* (drawdown −64%, vol −55% vs SPY) at a similar/slightly-better,
**net-of-beta-honest** Sharpe. It is **not** a high-Sharpe alpha machine — the research fleets and the
data agree that no such thing exists in this free-daily-data, leverage-≤1 universe without either a
much wider single-name cross-section or genuine option convexity. The system reports this truthfully.
