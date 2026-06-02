/**
 * The Meta-Allocator — PutStrike's unique, self-tracking automated-investing algorithm.
 *
 * It is a FUND-OF-STRATEGIES controller. Each day it decides HOW MUCH capital each
 * strategy gets, then blends their target weights into one portfolio. The allocation is:
 *
 *   1. PERFORMANCE-ADAPTIVE (the "self-tracking" requirement). Each strategy's weight is
 *      driven by its *realized rolling* risk-adjusted performance on the live simulated
 *      book — shrunk toward a backtest prior so a cold start isn't random. Strategies that
 *      stop working get starved; strategies that are working get scaled up. This is what
 *      "adjust investment behaviors based on whether it is working" means in code.
 *
 *   2. REGIME-AWARE. In risk-off regimes (SPY<200d or VIX≥35) defensive sleeves (trend,
 *      low-vol, rotation) are tilted up and offensive sleeves down — addressing the
 *      momentum-crash / reversal-in-selloff failure modes the red-team flagged.
 *
 *   3. RISK-BALANCED. Scores are divided by each strategy's recent realized vol so no
 *      single sleeve dominates portfolio risk (a light risk-parity overlay).
 *
 *   4. CONVICTION-GATED. A strategy with low same-day signal confidence, or a trailing
 *      Sharpe below a floor, is benched (weight 0) for the day.
 *
 * Pure + deterministic: identical inputs → identical allocation, so the backtest and the
 * live runner agree exactly.
 */
import type { RegimeSnapshot } from "./types";

/** Rolling realized performance of one strategy as of a decision date. */
export interface StrategyPerfStat {
  key: string;
  family: string;
  /** Annualized Sharpe over the trailing window, from the strategy's realized equity. */
  trailingSharpe: number;
  /** Annualized realized vol over the trailing window (for risk balancing). >0. */
  trailingVol: number;
  /** Backtest Sharpe prior (shrinkage anchor; from research/results.md). */
  priorSharpe: number;
  /** Today's signal confidence in [0,1] (0 = no conviction → benched). */
  confidence: number;
  /** Number of realized observations behind trailingSharpe (cold-start handling). */
  sampleDays: number;
}

export interface AllocatorConfig {
  /** Weight on the backtest prior vs realized perf (shrinkage). 0=all realized, 1=all prior. */
  priorBlend: number;
  /** Trailing Sharpe below this benches the strategy for the day. */
  sharpeFloor: number;
  /** Min observations before realized perf is trusted; below this, lean on the prior. */
  minSampleDays: number;
  /** Max share of gross any single strategy may take. */
  maxWeightPerStrategy: number;
  /** Total gross to deploy in normal regime (≤1 = no leverage). Cash is the remainder. */
  targetGross: number;
  /** Gross in a slow bear (SPY<200d). Kept near 1.0 — the sleeves already self-de-risk, so
   *  de-grossing again here just double-counts and drags return (empirically confirmed). */
  riskOffGross: number;
  /** Gross in an acute CRISIS (VIX≥35) — this is where book-level de-grossing earns its keep. */
  crisisGross: number;
  /** Multiplier applied to defensive sleeves' score in risk-off (>1 tilts toward them). */
  defensiveTiltRiskOff: number;
  /** Multiplier applied to offensive sleeves' score in risk-off (<1 tilts away). */
  offensiveTiltRiskOff: number;
  /**
   * In risk-off, guarantee defensive/hedge sleeves with a live signal a floor score
   * (as a fraction of the max raw score) so pure-insurance sleeves — flat in calm, hence
   * low trailing Sharpe — are still CARRIED when they are actually needed.
   */
  defensiveFloorRiskOff: number;
  /**
   * Risk-parity strength: each sleeve's score is divided by vol^riskParityPower.
   * 1 = full equal-risk (inverse-vol) base — every non-broken sleeve gets meaningful weight,
   * which is what captures the DIVERSIFICATION value of low-Sharpe orthogonal sleeves
   * (cross-asset trend, tail hedge). Empirically this beats Sharpe-concentration on our data.
   */
  riskParityPower: number;
  /** Strength of the (light) Sharpe tilt on top of the equal-risk base. 0 = pure equal-risk. */
  sharpeTiltStrength: number;
  /** Sharpe level around which the tilt pivots (sleeves above lean up, below lean down). */
  sharpeTiltCenter: number;
}

export const DEFAULT_ALLOCATOR: AllocatorConfig = {
  // Prior-anchored: mostly weight by each sleeve's STABLE long-run quality, with only a light
  // tilt from the noisy 126d trailing window. (DeMiguel-Garlappi-Uppal 2009: naive/stable
  // diversification beats performance-chasing out-of-sample; adaptation must be a light overlay.)
  priorBlend: 0.7,
  sharpeFloor: -0.15, // bench only clearly-broken sleeves (e.g. the cost-killed reversal)
  minSampleDays: 40,
  maxWeightPerStrategy: 0.35,
  targetGross: 1.0,
  riskOffGross: 0.95, // slow bear: don't double-de-gross; sleeves self-de-risk
  crisisGross: 0.6, // acute crisis: cut book-level gross
  defensiveTiltRiskOff: 1.2,
  offensiveTiltRiskOff: 0.85,
  // Advanced-fleet consensus: lighter Sharpe tilt (suppress OOS performance-chasing) and a
  // raised defensive floor so the convex insurance sleeves (cross-asset trend, tail hedge) are
  // PRE-PAID and carried into drawdowns rather than starved by their flat calm-period Sharpe.
  defensiveFloorRiskOff: 0.3,
  riskParityPower: 1.0,
  sharpeTiltStrength: 0.3,
  sharpeTiltCenter: 0.6,
};

const DEFENSIVE_FAMILIES = new Set(["trend", "defensive", "rotation"]);
const OFFENSIVE_FAMILIES = new Set(["momentum", "mean_reversion"]);

export interface AllocationDecision {
  /** strategyKey -> capital share (sum ≤ targetGross). */
  weights: Map<string, number>;
  /** Per-strategy diagnostics for the audit log / UI. */
  detail: Array<{
    key: string;
    rawScore: number;
    blendedSharpe: number;
    benched: boolean;
    reason: string;
    weight: number;
  }>;
  regimeMode: "risk-on" | "risk-off";
  grossDeployed: number;
}

function isRiskOff(regime: RegimeSnapshot): boolean {
  if (regime.regime === "CRISIS") return true;
  if (regime.spyAbove200 === false) return true;
  return false;
}

/**
 * Compute the day's capital allocation across strategies from their realized rolling
 * performance + the regime. Returns weights that sum to ≤ targetGross (rest is cash).
 */
export function allocateStrategies(
  stats: StrategyPerfStat[],
  regime: RegimeSnapshot,
  cfg: AllocatorConfig = DEFAULT_ALLOCATOR
): AllocationDecision {
  const riskOff = isRiskOff(regime);
  const targetGross =
    regime.regime === "CRISIS" ? cfg.crisisGross : riskOff ? cfg.riskOffGross : cfg.targetGross;

  const detail: AllocationDecision["detail"] = [];
  const rawScores = new Map<string, number>();

  for (const s of stats) {
    // Shrink realized Sharpe toward the prior; lean harder on the prior when sample is thin.
    const sampleTrust = Math.min(1, s.sampleDays / Math.max(1, cfg.minSampleDays));
    const realizedWeight = (1 - cfg.priorBlend) * sampleTrust;
    const priorWeight = 1 - realizedWeight;
    const blendedSharpe = realizedWeight * s.trailingSharpe + priorWeight * s.priorSharpe;

    let benched = false;
    let reason = "";
    // Bench clearly-broken strategies (realized Sharpe under floor with enough data).
    if (s.sampleDays >= cfg.minSampleDays && s.trailingSharpe < cfg.sharpeFloor) {
      benched = true;
      reason = `benched: trailing Sharpe ${s.trailingSharpe.toFixed(2)} < floor ${cfg.sharpeFloor}`;
    } else if (s.confidence <= 0.05) {
      benched = true;
      reason = "benched: no signal conviction today";
    }

    // Equal-RISK base (inverse-vol) with a LIGHT Sharpe tilt — this gives every non-broken
    // sleeve meaningful weight so the orthogonal diversifiers actually count, while still
    // leaning toward higher-quality sleeves. Benching (below) is the real adaptive lever.
    const vol = Math.max(0.05, s.trailingVol);
    const tilt = Math.max(0.2, 1 + cfg.sharpeTiltStrength * (blendedSharpe - cfg.sharpeTiltCenter));
    let score = Math.max(0, s.confidence) * tilt / Math.pow(vol, cfg.riskParityPower);
    if (riskOff) {
      if (DEFENSIVE_FAMILIES.has(s.family)) score *= cfg.defensiveTiltRiskOff;
      else if (OFFENSIVE_FAMILIES.has(s.family)) score *= cfg.offensiveTiltRiskOff;
    }
    if (benched) score = 0;

    rawScores.set(s.key, score);
    detail.push({ key: s.key, rawScore: round4(score), blendedSharpe: round4(blendedSharpe), benched, reason, weight: 0 });
  }

  // Defensive floor in risk-off: carry hedge/defensive sleeves even when their calm-period
  // Sharpe is flat (pure insurance), so the protection is on when it is actually needed.
  if (riskOff && cfg.defensiveFloorRiskOff > 0) {
    let maxRaw = 0;
    for (const v of rawScores.values()) maxRaw = Math.max(maxRaw, v);
    if (maxRaw > 0) {
      const floor = cfg.defensiveFloorRiskOff * maxRaw;
      for (const s of stats) {
        if (!DEFENSIVE_FAMILIES.has(s.family) || s.confidence <= 0.05) continue;
        const d = detail.find((x) => x.key === s.key);
        if (d && !d.benched && (rawScores.get(s.key) ?? 0) < floor) {
          rawScores.set(s.key, floor);
          d.rawScore = round4(floor);
          if (!d.reason) d.reason = "defensive floor (risk-off insurance)";
        }
      }
    }
  }

  // Normalize positive scores to targetGross, then cap per strategy and renormalize.
  let weights = normalizeToGross(rawScores, targetGross);
  weights = capAndRenormalize(weights, cfg.maxWeightPerStrategy, targetGross);

  let grossDeployed = 0;
  for (const d of detail) {
    d.weight = round4(weights.get(d.key) ?? 0);
    grossDeployed += d.weight;
  }

  return {
    weights,
    detail,
    regimeMode: riskOff ? "risk-off" : "risk-on",
    grossDeployed: round4(grossDeployed),
  };
}

function normalizeToGross(scores: Map<string, number>, gross: number): Map<string, number> {
  let sum = 0;
  for (const v of scores.values()) sum += v;
  const out = new Map<string, number>();
  if (sum <= 0) return out; // everyone benched → all cash
  for (const [k, v] of scores) out.set(k, (v / sum) * gross);
  return out;
}

function capAndRenormalize(weights: Map<string, number>, cap: number, gross: number): Map<string, number> {
  // Iteratively cap then redistribute the excess to uncapped strategies.
  const out = new Map(weights);
  for (let iter = 0; iter < 5; iter++) {
    let excess = 0;
    const uncapped: string[] = [];
    for (const [k, v] of out) {
      if (v > cap) {
        excess += v - cap;
        out.set(k, cap);
      } else if (v > 0) {
        uncapped.push(k);
      }
    }
    if (excess <= 1e-9 || uncapped.length === 0) break;
    const room = uncapped.reduce((a, k) => a + (cap - (out.get(k) ?? 0)), 0);
    if (room <= 1e-9) break;
    for (const k of uncapped) {
      const cur = out.get(k) ?? 0;
      out.set(k, cur + excess * ((cap - cur) / room));
    }
  }
  // Final safety: ensure sum ≤ gross.
  let sum = 0;
  for (const v of out.values()) sum += v;
  if (sum > gross && sum > 0) {
    for (const [k, v] of out) out.set(k, (v / sum) * gross);
  }
  return out;
}

function round4(x: number): number {
  return Math.round(x * 10000) / 10000;
}

/** Trailing Sharpe / vol from a slice of equity values (most recent last). */
export function trailingStatsFromEquity(equities: number[]): { sharpe: number; vol: number; n: number } {
  const rets: number[] = [];
  for (let i = 1; i < equities.length; i++) {
    if (equities[i - 1] > 0) rets.push(equities[i] / equities[i - 1] - 1);
  }
  const n = rets.length;
  if (n < 5) return { sharpe: 0, vol: 0.15, n };
  const m = rets.reduce((a, b) => a + b, 0) / n;
  const sd = Math.sqrt(rets.reduce((a, b) => a + (b - m) ** 2, 0) / (n - 1));
  const annVol = sd * Math.sqrt(252);
  const sharpe = annVol > 0 ? (m * 252) / annVol : 0;
  return { sharpe: round4(sharpe), vol: round4(Math.max(annVol, 0.0001)), n };
}
