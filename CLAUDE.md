# CLAUDE.md — FinAI: Automated Multi-Strategy Trading Research & Simulation

> **What this is.** FinAI takes the cloned PutStrike cash-secured-put app and builds
> on top of it an **automated, self-tracking, multi-strategy simulated trading system** — discovered
> and stress-tested with **agent orchestration** (inspired by Research_Analyzer (methodology)),
> backtested unbiased on real data, and wired into the website to run **daily on a Vercel cron** against
> simulated capital. Simulation only — no real orders.
>
> **This file is the master record.** Implementation-level detail lives in
> [docs/DEV_GUIDE.md](docs/DEV_GUIDE.md); the research trail lives in [research/](research/).

---

## 1. What was asked, and where it lives

| Ask | Delivered | Where |
|---|---|---|
| Clone `put_strike` fully (exact copy) | full clone with git history | this repo |
| Agent-orchestration research (à la Research_Analyzer) for alternative strategies | 2 large agent fleets + adversarial review | [research/](research/), §4 |
| Test alt-investment hypotheses unbiased against data | walk-forward backtest harness, real data, conservative costs, nulls reported | [research/results.md](research/results.md) |
| A collection of strategies + auto-decide which to enact | 8 sleeves + adaptive meta-allocator | [research/algorithm.md](research/algorithm.md) |
| Devise a unique algorithm for automated trading | **ARMS** — Adaptive Regime-aware Multi-Strategy allocator | [research/algorithm.md](research/algorithm.md) |
| Red team + critical viability, Claude Teams w/ security | discovery fleet (82 agents) + advanced fleet + red-team lenses; security settings | [research/strategy-universe.md](research/strategy-universe.md), §6 |
| Self-tracking system that adjusts to what's working | realized-Sharpe feedback loop, auto-benches broken sleeves | `src/lib/strategies/allocator.ts` |
| Implement on the website, daily automation, simulated trades, capital-aware, tracked over time | Strategy Engine tab + `/api/quant/*` + Neon tables + Vercel cron | §5 |
| Deploy to Vercel | cron + serverless routes + Neon, reuses existing yahoo-finance2 | `vercel.json`, §5 |
| Keep work in CLAUDE.md | this file + docs/DEV_GUIDE.md | — |

---

## 2. The unique algorithm — ARMS (one paragraph)

ARMS is a **fund-of-strategies** that paper-trades a portfolio of eight low-correlation sleeves
(momentum, low-vol, factor-momentum, sector rotation, multi-asset trend, **cross-asset trend**,
**VIX-term tail hedge**, reversal). Each day it measures how each sleeve is *actually* performing
(realized rolling Sharpe), allocates capital with an **equal-risk base + light Sharpe tilt**,
**benches sleeves that stop working**, **tilts defensive and de-grosses in crises**, and **targets
10% volatility** — all leverage-free. The same pure `Strategy` code is backtested, replayed, and run
live, so the simulation can never silently diverge from what was tested. Full design:
[research/algorithm.md](research/algorithm.md).

---

## 3. Headline results (executed, walk-forward, conservative costs)

| Portfolio | CAGR | Vol | Sharpe | MaxDD | Calmar |
|---|---|---|---|---|---|
| SPY buy & hold | 14.2% | 17.8% | 0.84 | 33.7% | 0.42 |
| Naive equal-weight ensemble | 10.2% | 10.9% | 0.95 | 18.5% | 0.55 |
| ARMS (adaptive + 10% vol target) | 6.7% | 8.1% | 0.85 | 12.2% | 0.55 |
| **Combined (expanded ~165-name universe + residual-momentum L/S + return-level vol-target)** | 7.2% | 6.3% | **1.14** | 9.9% | 0.73 |

**On the later Sharpe-2 goal — honestly NOT reachable** from long-only/defined-risk, no-leverage,
free-daily-data, *offline-backtestable* sleeves. The push (expanded universe + a purpose-built synthetic
options-VRP engine) lifted the *measured* combined Sharpe to **1.13 (MaxDD 8.7%, Calmar 0.80)** — a real
gain — but the high-Sharpe options VRP **cannot be backtested honestly** without paid historical chains: a
conservative Black-Scholes synthesis of put-selling (even trend-filtered) is break-even-to-negative, and the
self-tracking floor correctly *benched* it. Reaching 2 needs **leverage** (outside the ≤1.0 mandate) or an
**over-optimistic options assumption** — marketing, not measurement. The options edge is real *live* (the
existing PutStrike put-scorer on the real chain) → **BUILD-for-live / ASSERT-for-backtest**. See
[research/results.md](research/results.md) Run 3 + [research/options-strategies.md](research/options-strategies.md).

**Honest read:** for a long-only, no-leverage, free-data daily system the Sharpe lift over SPY is
modest; the dramatic win is **risk** — drawdown −64%, volatility −55%, Calmar +31%. The 221-day
live-sim replay returned **+14.7%** and visibly demonstrated the self-tracking (the cost-killed
reversal sleeve was auto-starved to 4–7%; the tail hedge appeared only in stress; the 2026-03
risk-off flip cut momentum 16%→3% and raised cross-asset trend →35%). We did **not** claim Sharpe
≫1 — that needs leverage or market-neutral sleeves whose hidden short-gamma tails the fleet flagged
as anti-diversifying here. **Net-of-beta honesty (advanced-fleet gating fix, now implemented):** the
raw Sharpes are beta-inflated; CAPM-regressed on SPY, only **momentum has real standalone alpha
(net-of-β Sharpe 0.54)** — the rest are diversifiers/insurance (sector 0.07, cross-asset-trend 0.07,
tail-hedge −0.15, reversal −0.55). The system reports this truthfully ([research/results.md](research/results.md)).
Faithful nulls and the full reasoning are in [research/](research/).

---

## 4. The agent orchestration (how the research was done)

Modeled on Research_Analyzer's adversarial, fleet-driven method. Three layers of "Claude Teams";
the work used the **local, in-workflow** layer (no upload required). Security model + the proposed
`.claude/settings.json` are in [research/proposed-claude-settings.json](research/proposed-claude-settings.json) (§6).

- **Fleet 1 — Strategy Discovery** (82 agents, 3.2M tokens): 12 strategy families → 33 candidates →
  14 vetted (formalize → 3 red-team lenses → harsh 0–60 score). Result: **0 KEEP, all REVISE/CUT** —
  no single anomaly is a slam-dunk; orthogonality is the scarce resource. → [research/strategy-universe.md](research/strategy-universe.md).
- **Fleet 2 — Advanced High-Sharpe Design** (~90 agents): design exact orthogonal sleeves + daily
  feedback loops → 4 red-team lenses (incl. net-of-beta after-cost Sharpe, tail-orthogonality) →
  score → idea-sharing synthesis panel → assembler. → [research/advanced-strategies.md](research/advanced-strategies.md).
- **Empirical execution (this session):** built the backtest harness + sleeves and **ran them on
  real data**, which corrected fleet over-claims (e.g. the adaptive allocator *under*performed naive
  equal-weight OOS → adaptation was made light). → [research/results.md](research/results.md).

Research files: [brief.md](research/brief.md) (the grounding), [strategy-universe.md](research/strategy-universe.md),
[results.md](research/results.md), [algorithm.md](research/algorithm.md), [hypotheses.md](research/hypotheses.md),
[advanced-strategies.md](research/advanced-strategies.md), [backtests/](research/backtests/).

---

## 5. Architecture & how to run

### Code map (at the repo root)
```
src/lib/strategies/
  types.ts indicators.ts universe.ts        # core types, pure indicators, tradable universe
  momentum.ts lowvol.ts factormom.ts        # the 8 sleeves (pure Strategy.generate)
  rotation.ts trend.ts crossasset.ts tailhedge.ts reversal.ts
  allocator.ts                              # the adaptive equal-risk + benching + regime + vol-target logic
  meta.ts                                   # meta-strategy factory (blends sleeves; vol-targets)
  registry.ts production.ts                 # registry + production source-of-truth (priors, config)
src/lib/backtest/  engine.ts costs.ts metrics.ts align.ts   # walk-forward engine (no look-ahead) + cost model
src/lib/daily/     perf.ts engine.ts        # live perf provider + pure daily-run core (shared by cron + local)
src/lib/quant-data.ts quant-db.ts           # prod data adapter (yahoo-finance2) + Neon persistence
src/app/api/quant/ run/ state/ reset/       # daily cron target + dashboard state + reset
src/components/QuantDashboard.tsx           # the "Strategy Engine" UI tab
scripts/backtest/  data.ts run.ts meta.ts   # offline backtest (raw-fetch loader, --use-system-ca)
scripts/daily/     run.ts                    # local daily-sim harness (file-backed book)
scripts/ts-resolve.mjs register-ts.mjs       # Node ESM hook to run the TS unchanged (no node_modules)
```

### Run the unbiased backtests locally (no `npm install` needed)
```bash
# single-sleeve comparison table
node --use-system-ca --no-warnings --import ./scripts/register-ts.mjs scripts/backtest/run.ts
# meta-allocator vs SPY vs naive ensemble
node --use-system-ca --no-warnings --import ./scripts/register-ts.mjs scripts/backtest/meta.ts
# replay the daily live-sim loop (validates the cron logic end-to-end)
node --use-system-ca --no-warnings --import ./scripts/register-ts.mjs scripts/daily/run.ts --seed 220
```
> This sandbox can't reach the npm registry, so the backtest uses Node's built-in `fetch` to
> Yahoo's chart API (`--use-system-ca` trusts the corporate proxy cert) and Node 24's native TS
> execution via a tiny resolution hook. **Production uses the repo's `yahoo-finance2` instead** —
> same `Bar[]`/`AlignedData`, identical signals.

### Deploy the automated system (Vercel)
1. Connect a **Neon Postgres** DB (Vercel Storage tab) → injects `POSTGRES_URL`/`DATABASE_URL`.
   The `quant_*` schema auto-creates on first request.
2. (Optional) set `CRON_SECRET` (the `/api/quant/run` route checks the `Authorization: Bearer`
   header Vercel Cron sends) and `QUANT_INITIAL_CAPITAL` (default 100000).
3. Deploy. `vercel.json` runs `/api/quant/run` **weekdays 21:30 UTC** (after the US close).
4. Open the **Strategy Engine** tab → "Run Daily Now" to seed the first day; watch the equity curve,
   live adaptive allocation, holdings, and simulated trades.

---

## 6. Claude Teams security (the "necessary security")

Three layers by blast radius — **in-workflow subagents (used, local-only)** → teammates (local) →
Remote Control/claude.ai (outward-facing). The agent **cannot** write `.claude/settings.json` itself
(the auto-mode classifier blocks it — by design, since enabling outward sharing is the user's
consent), so the reviewed config is in
[research/proposed-claude-settings.json](research/proposed-claude-settings.json) to apply by hand.
Keep `isolatePeerMachines: true` whenever Remote Control is on. The user enabled
`remoteControlAtStartup` + `autoUploadSessions` manually this session (note: `autoUploadSessions`
mirrors *every* session to the web).

---

## 7. Limitations & honest caveats

- **Simulation only.** No broker, no real fills. EOD weight-based execution flatters fills slightly;
  the conservative cost model offsets it.
- **Bull-heavy sample (2015–2026).** The defensive/hedge sleeves and crisis de-gross are mostly
  dormant here; ARMS should *relatively* shine in a sustained bear (untested out of this window).
- **Options sleeves approximated.** The cash/ETF sleeves are backtested on real data; option-based
  VRP ideas from the fleet are specced but not yet in the executed backtest (no free historical
  options chains) — flagged in [research/advanced-strategies.md](research/advanced-strategies.md).
- **Sharpe is honest, not hyped.** ~0.85–0.95 long-only/no-leverage; the value is drawdown control.

---

## 8. Status / next steps

- [x] Clone, deep-study, research workspace + security
- [x] Backtest harness + 8 sleeves + adaptive vol-targeted meta-allocator (validated on real data)
- [x] Three agent fleets (discovery 82 · advanced 115 · impl-review 9) + executed empirical correction of fleet claims
- [x] Net-of-beta honesty fix (CAPM vs SPY + rf) — priors made truthful
- [x] Neon multi-strategy book + `/api/quant/*` + Vercel cron + Strategy Engine UI tab + daily-loop validation
- [x] Adversarial implementation review → confirmed bugs fixed (vol-target cold-start, trades idempotency,
      first-run race, UI allocation-bar, NaN sanitization, dust-exit, dead-code) and re-validated
- [ ] Fold Advanced-fleet BUILD sleeves (ML-concordance gate, narrow style-pair reversion) into the registry
- [ ] Wire the orthogonality guard (corr-to-core / rolling-β) + drawdown circuit-breaker (specced in red-team.md)
- [ ] (Optional) modest leverage band on the vol-target to lift Sharpe

_Generated with Claude Code. All quantitative claims are from executed walk-forward backtests on real
public data; nulls are reported as faithfully as the wins._
