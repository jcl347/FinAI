/**
 * Investment-Opportunity Signal layer.
 *
 * Unifies, every day, the strongest opportunities across ALL diverse streams into one ranked list:
 *   - each of the 12 ARMS sleeves (from the allocator's daily decision + trailing performance), and
 *   - the top PutStrike VRP put opportunities (from the options scorer).
 * Each is scored by  oppScore = SIGNAL_STRENGTH × REGIME_FIT × MARGINAL_DIVERSIFICATION × EXECUTION_QUALITY
 * (fleet design). Phase 1 is OBSERVATIONAL — it surfaces what the live-feedback allocator is doing and
 * where the best opportunities are; it does not reprogram the allocator (which already adapts).
 */
import type { RegimeSnapshot } from "../strategies/types";

export interface SleeveDecisionRow {
  key: string;
  family: string;
  weight: number;          // current allocator weight (capital share)
  blendedSharpe: number;   // prior-shrunk trailing Sharpe
  trailingSharpe: number;
  trailingVol: number;
  benched: boolean;
  confidence: number;      // today's signal confidence
  correlationToSpy?: number; // optional ρ proxy for the diversification boost
  reason?: string;
}

export interface PutOpportunity {
  symbol: string;
  strike: number;
  dte: number;
  delta: number;
  impliedVolatility: number;
  annualizedReturn: number; // % on collateral
  score: number;            // 0-100 from the put scorer
  spreadPct: number;
  openInterest: number;
}

export interface OpportunitySignal {
  id: string;
  type: "sleeve" | "put";
  date: string;
  name: string;
  symbol?: string;
  oppScore: number;
  rank: number;
  components: { signalStrength: number; regimeFit: number; marginalDiversification: number; executionQuality: number };
  currentWeight: number;
  recommendation: "DEPLOY" | "HOLD" | "TRIM" | "AVOID" | "SELL_PUT" | "WATCH";
  regime: string;
  detail: Record<string, unknown>;
}

const DEFENSIVE = new Set(["trend", "defensive", "rotation", "value", "market_neutral"]);
const OFFENSIVE = new Set(["momentum", "mean_reversion", "offensive"]);

function clamp(x: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, x));
}

/** Regime multiplier for a sleeve family (defensive favored in risk-off, offensive in risk-on). */
function regimeFitSleeve(family: string, regime: RegimeSnapshot): number {
  const riskOff = regime.regime === "CRISIS" || regime.spyAbove200 === false;
  if (riskOff) {
    if (DEFENSIVE.has(family)) return 1.25;
    if (OFFENSIVE.has(family)) return 0.8;
  }
  return 1.0;
}

/** Regime multiplier for selling puts (VRP): great in calm/normal, dangerous in crisis. */
function regimeFitPut(regime: RegimeSnapshot): number {
  switch (regime.regime) {
    case "LOW_VOL": return 1.3;
    case "NORMAL": return 1.4;
    case "HIGH_VOL": return 1.0;
    case "CRISIS": return 0.5;
  }
}

/**
 * Build the ranked opportunity list for a day.
 * @param sleeves  the allocator's per-sleeve decision rows (from meta.lastDecision.detail + perf rows)
 * @param puts     top scored put opportunities from the PutStrike scorer (optional — live only)
 * @param regime   today's regime snapshot
 */
export function rankOpportunities(
  date: string,
  sleeves: SleeveDecisionRow[],
  puts: PutOpportunity[],
  regime: RegimeSnapshot,
): OpportunitySignal[] {
  const out: OpportunitySignal[] = [];

  for (const s of sleeves) {
    // SIGNAL_STRENGTH: confidence-weighted, scaled by how far the blended Sharpe is above ~0.5.
    const volBucket = clamp(s.trailingVol || 0.12, 0.05, 0.4);
    const signalStrength = clamp(s.confidence, 0, 1) * clamp((s.blendedSharpe - 0.3) / (0.6 + volBucket), 0, 1);
    const regimeFit = regimeFitSleeve(s.family, regime);
    // MARGINAL_DIVERSIFICATION: lower |ρ to market| → bigger boost (the scarce resource).
    const rho = s.correlationToSpy != null ? Math.abs(s.correlationToSpy) : 0.6;
    const marginalDiversification = clamp(1.0 + (1 - rho) * 0.4, 0.7, 1.5);
    const executionQuality = 1.0; // liquid equity/ETF sleeves
    const oppScore = signalStrength * regimeFit * marginalDiversification * executionQuality;

    let recommendation: OpportunitySignal["recommendation"];
    if (s.benched) recommendation = "AVOID";
    else if (oppScore >= 0.5 && s.weight < 0.12) recommendation = "DEPLOY";
    else if (oppScore < 0.15) recommendation = "TRIM";
    else recommendation = "HOLD";

    out.push({
      id: `sleeve:${s.key}:${date}`, type: "sleeve", date, name: s.key,
      oppScore: round3(oppScore), rank: 0,
      components: { signalStrength: round3(signalStrength), regimeFit, marginalDiversification: round3(marginalDiversification), executionQuality },
      currentWeight: round3(s.weight), recommendation, regime: regime.regime,
      detail: { family: s.family, blendedSharpe: s.blendedSharpe, trailingSharpe: s.trailingSharpe, benched: s.benched, reason: s.reason ?? "", rhoToSpy: s.correlationToSpy },
    });
  }

  for (const p of puts) {
    const signalStrength = clamp(p.score / 100, 0, 1);
    const regimeFit = regimeFitPut(regime);
    const marginalDiversification = 1.3; // VRP is structurally orthogonal to the directional book
    const executionQuality = p.spreadPct <= 5 && p.openInterest >= 100 ? 0.95 : p.spreadPct <= 15 ? 0.85 : 0.7;
    const oppScore = signalStrength * regimeFit * marginalDiversification * executionQuality;
    out.push({
      id: `put:${p.symbol}:${p.strike}:${date}`, type: "put", date,
      name: `${p.symbol} $${p.strike}P ${p.dte}d`, symbol: p.symbol,
      oppScore: round3(oppScore), rank: 0,
      components: { signalStrength: round3(signalStrength), regimeFit, marginalDiversification, executionQuality },
      currentWeight: 0,
      recommendation: regime.regime === "CRISIS" ? "WATCH" : p.score >= 55 ? "SELL_PUT" : "WATCH",
      regime: regime.regime,
      detail: { strike: p.strike, dte: p.dte, delta: p.delta, iv: p.impliedVolatility, annualizedReturn: p.annualizedReturn, score: p.score, spreadPct: p.spreadPct, openInterest: p.openInterest },
    });
  }

  out.sort((a, b) => b.oppScore - a.oppScore);
  out.forEach((o, i) => (o.rank = i + 1));
  return out;
}

function round3(x: number): number {
  return Math.round(x * 1000) / 1000;
}
