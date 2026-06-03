/**
 * Synthetic options-sleeve backtester.
 *
 * No free historical options chains exist, so option P&L is SYNTHESIZED with Black-Scholes from
 * the real underlying path. The implied vol a seller receives is modeled as
 *   IV = trailing realized vol + a variance-risk-premium spread (vrpVolPoints),
 * which is the documented, conservative source of the short-vol edge (IV > subsequent RV on
 * average). Positions are MARKED DAILY; during the life of a position the mark uses
 *   sigma_mark = max(sigmaEntry, recentRV + vrp)
 * so a volatility spike RAISES the short's mark and the crash drawdown shows up honestly — this
 * is deliberately pessimistic about the short-gamma left tail the red team warned about.
 *
 * Output: a daily equity curve per sleeve (returns on the capital/defined-max-loss base), which
 * the returns-level portfolio backtest combines with the equity sleeves. This is a research
 * approximation — the assumptions (IV=RV+vrp, EOD marks, no early exercise) are stated, not hidden.
 */
import { putPrice } from "../black-scholes";
import type { Bar } from "../strategies/types";
import type { EquityPoint } from "./metrics";
import { annualizedVol, sma } from "../strategies/indicators";

function callPrice(S: number, K: number, T: number, r: number, sigma: number, q = 0): number {
  if (T <= 0) return Math.max(S - K, 0);
  // put-call parity off the validated put pricer
  return putPrice({ S, K, T, r, sigma, q }) + S * Math.exp(-q * T) - K * Math.exp(-r * T);
}

/** Approx strike for a target option delta via the lognormal quantile (good enough for sizing). */
function strikeForDelta(S: number, T: number, sigma: number, targetDelta: number, type: "put" | "call"): number {
  // For a put, |delta| ≈ N(-d1); invert to d1 then solve K. Use q=r=0 for the strike heuristic.
  const z = invNorm(type === "put" ? targetDelta : 1 - targetDelta); // d1 ≈ z for the target
  // d1 = (ln(S/K) + 0.5σ²T)/(σ√T) ⇒ K = S·exp(0.5σ²T − d1·σ√T); put wants K<S so use -z.
  const sqrtT = Math.sqrt(Math.max(T, 1e-6));
  const d1 = type === "put" ? -z : z;
  return S * Math.exp(0.5 * sigma * sigma * T - d1 * sigma * sqrtT);
}

// Acklam's inverse normal CDF approximation.
function invNorm(p: number): number {
  if (p <= 0) return -8;
  if (p >= 1) return 8;
  const a = [-3.969683028665376e1, 2.209460984245205e2, -2.759285104469687e2, 1.38357751867269e2, -3.066479806614716e1, 2.506628277459239];
  const b = [-5.447609879822406e1, 1.615858368580409e2, -1.556989798598866e2, 6.680131188771972e1, -1.328068155288572e1];
  const c = [-7.784894002430293e-3, -3.223964580411365e-1, -2.400758277161838, -2.549732539343734, 4.374664141464968, 2.938163982698783];
  const d = [7.784695709041462e-3, 3.224671290700398e-1, 2.445134137142996, 3.754408661907416];
  const pl = 0.02425;
  let q, r;
  if (p < pl) { q = Math.sqrt(-2 * Math.log(p)); return (((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) / ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1); }
  if (p <= 1 - pl) { q = p - 0.5; r = q * q; return (((((a[0] * r + a[1]) * r + a[2]) * r + a[3]) * r + a[4]) * r + a[5]) * q / (((((b[0] * r + b[1]) * r + b[2]) * r + b[3]) * r + b[4]) * r + 1); }
  q = Math.sqrt(-2 * Math.log(1 - p)); return -(((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) / ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1);
}

export type OptionStructure = "csp" | "covered_call" | "iron_condor" | "short_strangle";

export interface OptionsSleeveConfig {
  structure: OptionStructure;
  targetDelta: number; // short-leg delta (e.g. 0.16)
  wingDelta?: number; // long-leg delta for defined-risk (condor), e.g. 0.06
  dteCalendar: number; // days to expiration at entry (e.g. 45)
  managementDay: number; // close/roll after this many days held (e.g. 21) — the 21-DTE rule
  profitTarget: number; // close at this fraction of max profit captured (e.g. 0.5)
  vrpVolPoints: number; // IV = RV + this (annualized vol points, e.g. 0.04)
  rvWindow: number; // realized-vol lookback (e.g. 20)
  rfAnnual: number; // risk-free for BS (e.g. 0.03)
  costFracOfPremium: number; // option transaction cost per side as a fraction of premium (e.g. 0.05) — wide spreads
  costPerContract: number; // flat per-contract commission (e.g. 0.65)
  /** Only OPEN a position when the underlying is above its 200d SMA (PutStrike's documented
   *  trend/quality filter — avoids selling premium into downtrends, the main assignment-loss source). */
  requireUptrend?: boolean;
}

export const DEFAULT_OPTIONS_CONFIG: OptionsSleeveConfig = {
  structure: "csp",
  targetDelta: 0.16,
  wingDelta: 0.06,
  dteCalendar: 45,
  managementDay: 21,
  profitTarget: 0.5,
  vrpVolPoints: 0.035, // ~3.5 vol points — conservative VRP
  rvWindow: 20,
  rfAnnual: 0.03,
  costFracOfPremium: 0.06, // pessimistic on option spread
  costPerContract: 0.65,
};

interface OpenPos {
  entryIdx: number;
  expiryDays: number;
  sigmaEntry: number;
  // priced per 1 share (×100 for a contract); legs as signed quantities of options
  legs: { type: "put" | "call"; K: number; qty: number }[]; // qty>0 long, <0 short
  creditPerShare: number; // net premium received per share (short premium positive)
  collateralPerShare: number; // capital base per share (CSP=K; defined-risk=max loss)
}

/** Price a structure's net value per share (what it would cost to CLOSE = sum of leg values). */
function structureValue(pos: OpenPos, S: number, T: number, r: number, sigma: number): number {
  let v = 0;
  for (const leg of pos.legs) {
    const px = leg.type === "put" ? putPrice({ S, K: leg.K, T, r, sigma }) : callPrice(S, leg.K, T, r, sigma);
    v += leg.qty * px; // long adds, short subtracts (qty signed)
  }
  return v; // value of the position to the holder (short legs make this negative)
}

/** Simulate a systematic short-premium sleeve on ONE underlying → daily equity curve. */
export function simulateUnderlying(bars: Bar[], cfg: OptionsSleeveConfig): EquityPoint[] {
  const closes = bars.map((b) => b.close);
  const curve: EquityPoint[] = [];
  let equity = 1; // index; returns are scale-free (per unit collateral)
  let pos: (OpenPos & { cycleStartEquity: number }) | null = null;
  const startIdx = Math.max(cfg.rvWindow + 2, 30);

  for (let i = startIdx; i < bars.length; i++) {
    const S = closes[i];
    if (S <= 0) { curve.push({ date: bars[i].date, equity }); continue; }

    // Open a new position if flat.
    if (!pos) {
      // Documented entry filter: only sell premium in an uptrend (above 200d SMA).
      if (cfg.requireUptrend) {
        const sm = sma(closes.slice(0, i + 1), 200);
        if (sm == null || S <= sm) { curve.push({ date: bars[i].date, equity }); continue; }
      }
      const rv = annualizedVol(closes.slice(0, i + 1), cfg.rvWindow) || 0.2;
      const ivEntry = Math.max(0.05, rv + cfg.vrpVolPoints);
      const T = cfg.dteCalendar / 365;
      const opened = openStructure(S, T, cfg, ivEntry, i);
      const entryCost = cfg.costFracOfPremium * Math.abs(opened.creditPerShare) + cfg.costPerContract / 100;
      equity *= 1 - entryCost / opened.collateralPerShare;
      pos = { ...opened, cycleStartEquity: equity };
      curve.push({ date: bars[i].date, equity });
      continue;
    }

    // Mark the open position. Vol spikes raise the mark (hurt the short) — honest about the tail.
    const daysHeld = i - pos.entryIdx;
    const Tleft = Math.max(0, (pos.expiryDays - daysHeld) / 365);
    // Mark at REALIZED vol only (NOT RV+VRP). Audit fix: re-adding the VRP at every mark made the
    // entry credit (priced at RV+VRP) and the close value cancel, so only spread-theta was harvested
    // and the documented VRP edge was destroyed (CSP came out negative vs the real PUT-write index's
    // ~+0.5). Marking at RV lets the credit's embedded VRP be captured as the position decays, while a
    // genuine vol spike still raises rvNow and shows the short-gamma loss.
    const rvNow = annualizedVol(closes.slice(0, i + 1), cfg.rvWindow) || pos.sigmaEntry;
    const sigmaMark = Math.max(0.05, rvNow);
    const closeValueToHolder = structureValue(pos, S, Tleft, cfg.rfAnnual, sigmaMark); // ≤0 for net-short
    const pnlPerShare = pos.creditPerShare + closeValueToHolder; // credit kept + cost to close (negative)
    const markedEquity = 1 + pnlPerShare / pos.collateralPerShare; // relative to this cycle's entry
    equity = pos.cycleStartEquity * markedEquity;
    curve.push({ date: bars[i].date, equity });

    // Close on profit target / 21-DTE management / expiry.
    const capturedFrac = pos.creditPerShare !== 0 ? pnlPerShare / pos.creditPerShare : 1;
    const atExpiry = Tleft <= 0;
    const shouldClose = atExpiry || daysHeld >= cfg.managementDay || capturedFrac >= cfg.profitTarget;
    if (shouldClose) {
      const exitCost = cfg.costFracOfPremium * Math.abs(closeValueToHolder) + cfg.costPerContract / 100;
      equity *= 1 - exitCost / pos.collateralPerShare;
      curve[curve.length - 1].equity = equity;
      pos = null;
    }
  }
  return curve;
}

function openStructure(S: number, T: number, cfg: OptionsSleeveConfig, iv: number, entryIdx: number): OpenPos {
  const r = cfg.rfAnnual;
  const legs: OpenPos["legs"] = [];
  let credit = 0;
  let collateral = S; // default CSP-ish

  const shortPutK = strikeForDelta(S, T, iv, cfg.targetDelta, "put");
  const shortCallK = strikeForDelta(S, T, iv, cfg.targetDelta, "call");
  const longPutK = strikeForDelta(S, T, iv, cfg.wingDelta ?? 0.06, "put");
  const longCallK = strikeForDelta(S, T, iv, cfg.wingDelta ?? 0.06, "call");

  if (cfg.structure === "csp") {
    const p = putPrice({ S, K: shortPutK, T, r, sigma: iv });
    legs.push({ type: "put", K: shortPutK, qty: -1 });
    credit = p;
    collateral = shortPutK; // cash-secured
  } else if (cfg.structure === "covered_call") {
    const c = callPrice(S, shortCallK, T, r, iv);
    legs.push({ type: "call", K: shortCallK, qty: -1 });
    credit = c;
    collateral = S; // own the stock
  } else if (cfg.structure === "short_strangle") {
    const p = putPrice({ S, K: shortPutK, T, r, sigma: iv });
    const c = callPrice(S, shortCallK, T, r, iv);
    legs.push({ type: "put", K: shortPutK, qty: -1 }, { type: "call", K: shortCallK, qty: -1 });
    credit = p + c;
    collateral = shortPutK * 0.5; // approx margin (not cash-secured both sides)
  } else {
    // iron_condor: short put + long put wing, short call + long call wing
    const sp = putPrice({ S, K: shortPutK, T, r, sigma: iv });
    const lp = putPrice({ S, K: longPutK, T, r, sigma: iv });
    const sc = callPrice(S, shortCallK, T, r, iv);
    const lc = callPrice(S, longCallK, T, r, iv);
    legs.push(
      { type: "put", K: shortPutK, qty: -1 }, { type: "put", K: longPutK, qty: 1 },
      { type: "call", K: shortCallK, qty: -1 }, { type: "call", K: longCallK, qty: 1 }
    );
    credit = sp - lp + sc - lc;
    const putWidth = shortPutK - longPutK;
    const callWidth = longCallK - shortCallK;
    collateral = Math.max(putWidth, callWidth) - credit; // defined max loss
  }

  return {
    entryIdx,
    expiryDays: cfg.dteCalendar,
    sigmaEntry: iv,
    legs,
    creditPerShare: credit,
    collateralPerShare: Math.max(collateral, S * 0.05),
  };
}

/**
 * Run a sleeve across a basket of underlyings (equal-weight) → one daily equity curve aligned to
 * the master calendar. Diversifying across names dilutes single-name gap risk (but NOT the shared
 * short-vol tail — that is the red team's point, preserved because all names crash together).
 */
export function runOptionsSleeve(
  calendar: string[],
  barsBySymbol: Map<string, (Bar | null)[]>,
  symbols: string[],
  cfg: OptionsSleeveConfig
): EquityPoint[] {
  const perName: Map<string, Map<string, number>> = new Map();
  for (const sym of symbols) {
    const aligned = barsBySymbol.get(sym);
    if (!aligned) continue;
    const dense: Bar[] = [];
    for (const b of aligned) if (b) dense.push(b);
    if (dense.length < 120) continue;
    const c = simulateUnderlying(dense, cfg);
    perName.set(sym, new Map(c.map((p) => [p.date, p.equity])));
  }
  if (perName.size === 0) return [];

  // Equal-weight the per-name daily RETURNS across names with data on each date.
  const curve: EquityPoint[] = [];
  let equity = 1;
  const prevEqByName = new Map<string, number>();
  for (const date of calendar) {
    let sum = 0;
    let cnt = 0;
    for (const [sym, m] of perName) {
      const e = m.get(date);
      if (e == null) continue;
      const prev = prevEqByName.get(sym);
      if (prev != null && prev > 0) { sum += e / prev - 1; cnt++; }
      prevEqByName.set(sym, e);
    }
    if (cnt > 0) equity *= 1 + sum / cnt;
    curve.push({ date, equity: Math.round(equity * 1e6) / 1e6 });
  }
  return curve;
}
