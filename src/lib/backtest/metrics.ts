/**
 * Performance metrics computed from a daily equity curve + trade log.
 * Pure functions — no IO. Used by the backtest report and the live dashboard.
 */

import { maxDrawdown as mddOfCurve } from "../strategies/indicators";

export interface EquityPoint {
  date: string;
  equity: number;
}

export interface PerfMetrics {
  startEquity: number;
  endEquity: number;
  totalReturnPct: number;
  cagrPct: number;
  annVolPct: number;
  sharpe: number;
  sortino: number;
  maxDrawdownPct: number;
  calmar: number;
  hitRatePctDays: number; // % of days with positive return
  bestDayPct: number;
  worstDayPct: number;
  avgExposurePct: number; // avg gross exposure (filled by engine)
  annualTurnoverPct: number; // filled by engine
  nDays: number;
}

function dailyReturns(curve: EquityPoint[]): number[] {
  const r: number[] = [];
  for (let i = 1; i < curve.length; i++) {
    const prev = curve[i - 1].equity;
    if (prev > 0) r.push(curve[i].equity / prev - 1);
  }
  return r;
}

/**
 * Compute summary metrics from an equity curve.
 * @param rfAnnual annual risk-free rate (default 0) for Sharpe.
 */
export function computeMetrics(
  curve: EquityPoint[],
  opts: { rfAnnual?: number; avgExposurePct?: number; annualTurnoverPct?: number } = {}
): PerfMetrics {
  const rf = opts.rfAnnual ?? 0;
  const start = curve.length ? curve[0].equity : 0;
  const end = curve.length ? curve[curve.length - 1].equity : 0;
  const rets = dailyReturns(curve);
  const n = rets.length;

  const m = n ? rets.reduce((a, b) => a + b, 0) / n : 0;
  const sd = n > 1 ? Math.sqrt(rets.reduce((a, b) => a + (b - m) ** 2, 0) / (n - 1)) : 0;
  const annVol = sd * Math.sqrt(252);
  const annRet = m * 252;
  const sharpe = annVol > 0 ? (annRet - rf) / annVol : 0;

  // Sortino uses downside deviation only.
  const downside = rets.filter((x) => x < 0);
  const dd = downside.length
    ? Math.sqrt(downside.reduce((a, b) => a + b * b, 0) / downside.length) * Math.sqrt(252)
    : 0;
  const sortino = dd > 0 ? (annRet - rf) / dd : 0;

  const years = n / 252;
  const cagr = years > 0 && start > 0 && end > 0 ? Math.pow(end / start, 1 / years) - 1 : 0;
  const mdd = mddOfCurve(curve.map((p) => p.equity));
  const calmar = mdd > 0 ? cagr / mdd : 0;

  const wins = rets.filter((x) => x > 0).length;

  return {
    startEquity: round2(start),
    endEquity: round2(end),
    totalReturnPct: round2(start > 0 ? (end / start - 1) * 100 : 0),
    cagrPct: round2(cagr * 100),
    annVolPct: round2(annVol * 100),
    sharpe: round2(sharpe),
    sortino: round2(sortino),
    maxDrawdownPct: round2(mdd * 100),
    calmar: round2(calmar),
    hitRatePctDays: round2(n ? (wins / n) * 100 : 0),
    bestDayPct: round2(n ? Math.max(...rets) * 100 : 0),
    worstDayPct: round2(n ? Math.min(...rets) * 100 : 0),
    avgExposurePct: round2(opts.avgExposurePct ?? 0),
    annualTurnoverPct: round2(opts.annualTurnoverPct ?? 0),
    nDays: n,
  };
}

function round2(x: number): number {
  return Math.round(x * 100) / 100;
}

export interface CapmStats {
  beta: number; // sensitivity to the market (SPY)
  alphaAnnPct: number; // annualized CAPM alpha (%)
  netOfBetaSharpe: number; // information ratio: annualized alpha / residual vol — the "is it more than beta?" measure
  rfExcessSharpe: number; // level Sharpe net of the risk-free rate
}

/** Align two equity curves on shared dates → paired daily returns. */
function pairedReturns(a: EquityPoint[], b: EquityPoint[]): { ra: number[]; rb: number[] } {
  const mapB = new Map(b.map((p) => [p.date, p.equity]));
  const ra: number[] = [];
  const rb: number[] = [];
  for (let i = 1; i < a.length; i++) {
    const db = mapB.get(a[i].date);
    const dbPrev = mapB.get(a[i - 1].date);
    if (db != null && dbPrev != null && a[i - 1].equity > 0 && dbPrev > 0) {
      ra.push(a[i].equity / a[i - 1].equity - 1);
      rb.push(db / dbPrev - 1);
    }
  }
  return { ra, rb };
}

/**
 * CAPM decomposition of a strategy vs the market (SPY) — the honesty fix the advanced fleet
 * demanded: report Sharpe NET OF MARKET BETA (so a sleeve can't be credited for just holding
 * beta) and net of the risk-free rate (so carry/cash sleeves are judged excess-of-cash).
 * @param rfAnnual realized risk-free rate (≈ T-bill path; default 2%, a blended 2015-2026 proxy).
 */
export function capmStats(strat: EquityPoint[], market: EquityPoint[], rfAnnual = 0.02): CapmStats {
  const { ra, rb } = pairedReturns(strat, market);
  const n = ra.length;
  if (n < 20) return { beta: 0, alphaAnnPct: 0, netOfBetaSharpe: 0, rfExcessSharpe: 0 };
  const rfD = rfAnnual / 252;
  const ex = ra.map((x) => x - rfD); // excess strategy
  const mx = rb.map((x) => x - rfD); // excess market
  const mEx = ex.reduce((a, b) => a + b, 0) / n;
  const mMx = mx.reduce((a, b) => a + b, 0) / n;
  let cov = 0;
  let varM = 0;
  for (let i = 0; i < n; i++) {
    cov += (ex[i] - mEx) * (mx[i] - mMx);
    varM += (mx[i] - mMx) ** 2;
  }
  const beta = varM > 0 ? cov / varM : 0;
  const alphaD = mEx - beta * mMx; // daily CAPM alpha
  // Residual (idiosyncratic) returns and their vol.
  let ssRes = 0;
  for (let i = 0; i < n; i++) {
    const resid = ex[i] - (alphaD + beta * mx[i]);
    ssRes += resid * resid;
  }
  const residStdD = Math.sqrt(ssRes / Math.max(1, n - 2));
  const netOfBetaSharpe = residStdD > 0 ? (alphaD * Math.sqrt(252)) / residStdD : 0;
  const sdEx = Math.sqrt(ex.reduce((a, b) => a + (b - mEx) ** 2, 0) / (n - 1));
  const rfExcessSharpe = sdEx > 0 ? (mEx * Math.sqrt(252)) / sdEx : 0;
  const r2 = (x: number) => Math.round(x * 100) / 100;
  return { beta: r2(beta), alphaAnnPct: r2(alphaD * 252 * 100), netOfBetaSharpe: r2(netOfBetaSharpe), rfExcessSharpe: r2(rfExcessSharpe) };
}

/** Annualized covariance/correlation of two strategy equity curves (for orthogonality checks). */
export function curveCorrelation(a: EquityPoint[], b: EquityPoint[]): number {
  // Align on shared dates.
  const mapB = new Map(b.map((p) => [p.date, p.equity]));
  const ax: number[] = [];
  const bx: number[] = [];
  for (let i = 1; i < a.length; i++) {
    const db = mapB.get(a[i].date);
    const dbPrev = mapB.get(a[i - 1].date);
    if (db != null && dbPrev != null && a[i - 1].equity > 0 && dbPrev > 0) {
      ax.push(a[i].equity / a[i - 1].equity - 1);
      bx.push(db / dbPrev - 1);
    }
  }
  if (ax.length < 2) return 0;
  const ma = ax.reduce((s, x) => s + x, 0) / ax.length;
  const mb = bx.reduce((s, x) => s + x, 0) / bx.length;
  let num = 0;
  let da = 0;
  let dbb = 0;
  for (let i = 0; i < ax.length; i++) {
    const x = ax[i] - ma;
    const y = bx[i] - mb;
    num += x * y;
    da += x * x;
    dbb += y * y;
  }
  if (da === 0 || dbb === 0) return 0;
  return round2(num / Math.sqrt(da * dbb));
}

// ── Deflated / Probabilistic Sharpe Ratio (Bailey & López de Prado 2014) ──
// The bias-governance the framework was missing: a strategy "factory" that tests N candidates on the
// same window and keeps the best has a built-in MULTIPLE-TESTING bias — some winners survive by chance.
// PSR corrects a Sharpe for short samples + non-normal returns; DSR additionally deflates the hurdle by
// the EXPECTED MAXIMUM Sharpe across N independent trials, so a shipped sleeve must beat what random
// selection over N tries would have produced. DSR > 0.95 ⇒ the edge is unlikely to be a selection artifact.

/** Abramowitz-Stegun erf approximation. */
function erf(x: number): number {
  const t = 1 / (1 + 0.3275911 * Math.abs(x));
  const y = 1 - (((((1.061405429 * t - 1.453152027) * t) + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * Math.exp(-x * x);
  return x >= 0 ? y : -y;
}
export function normalCdf(z: number): number {
  return 0.5 * (1 + erf(z / Math.SQRT2));
}
/** Inverse standard-normal CDF (Acklam's rational approximation). */
export function normalInv(p: number): number {
  if (p <= 0) return -Infinity;
  if (p >= 1) return Infinity;
  const a = [-3.969683028665376e1, 2.209460984245205e2, -2.759285104469687e2, 1.38357751867269e2, -3.066479806614716e1, 2.506628277459239];
  const b = [-5.447609879822406e1, 1.615858368580409e2, -1.556989798598866e2, 6.680131188771972e1, -1.328068155288572e1];
  const c = [-7.784894002430293e-3, -3.223964580411365e-1, -2.400758277161838, -2.549732539343734, 4.374664141464968, 2.938163982698783];
  const d = [7.784695709041462e-3, 3.224671290700398e-1, 2.445134137142996, 3.754408661907416];
  const pl = 0.02425;
  let q: number, r: number;
  if (p < pl) { q = Math.sqrt(-2 * Math.log(p)); return (((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) / ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1); }
  if (p <= 1 - pl) { q = p - 0.5; r = q * q; return (((((a[0] * r + a[1]) * r + a[2]) * r + a[3]) * r + a[4]) * r + a[5]) * q / (((((b[0] * r + b[1]) * r + b[2]) * r + b[3]) * r + b[4]) * r + 1); }
  q = Math.sqrt(-2 * Math.log(1 - p)); return -(((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) / ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1);
}

export interface SharpeMoments {
  srDaily: number; // per-period (daily) Sharpe — NOT annualized (the DSR formula is per-observation)
  n: number;       // number of return observations
  skew: number;
  kurt: number;    // non-excess kurtosis (3 = normal)
}

/** Per-period Sharpe + higher moments of an equity curve's daily returns (inputs to PSR/DSR). */
export function sharpeMoments(curve: EquityPoint[], rfAnnual = 0): SharpeMoments {
  const rets: number[] = [];
  for (let i = 1; i < curve.length; i++) if (curve[i - 1].equity > 0) rets.push(curve[i].equity / curve[i - 1].equity - 1);
  const n = rets.length;
  if (n < 20) return { srDaily: 0, n, skew: 0, kurt: 3 };
  const rfD = rfAnnual / 252;
  const m = rets.reduce((a, b) => a + b, 0) / n;
  const sd = Math.sqrt(rets.reduce((a, b) => a + (b - m) ** 2, 0) / (n - 1));
  if (sd === 0) return { srDaily: 0, n, skew: 0, kurt: 3 };
  const srDaily = (m - rfD) / sd;
  const skew = rets.reduce((a, b) => a + ((b - m) / sd) ** 3, 0) / n;
  const kurt = rets.reduce((a, b) => a + ((b - m) / sd) ** 4, 0) / n;
  return { srDaily, n, skew, kurt };
}

/** Probabilistic Sharpe Ratio: P(true Sharpe > benchmarkSrDaily) given sample length + non-normality. */
export function probabilisticSharpe(m: SharpeMoments, benchmarkSrDaily = 0): number {
  const { srDaily: sr, n, skew, kurt } = m;
  if (n < 20) return 0;
  const denom = Math.sqrt(Math.max(1e-9, 1 - skew * sr + ((kurt - 1) / 4) * sr * sr));
  return normalCdf(((sr - benchmarkSrDaily) * Math.sqrt(n - 1)) / denom);
}

/**
 * Deflated Sharpe Ratio: the PSR against the expected-MAXIMUM Sharpe across `nTrials` independent trials
 * with cross-trial Sharpe variance `varTrialSrDaily` (per-period units). The honest hurdle for a sleeve
 * selected from a factory of nTrials candidates. Returns the DSR probability + the deflated hurdle.
 */
export function deflatedSharpe(m: SharpeMoments, nTrials: number, varTrialSrDaily: number): { dsr: number; srStarDaily: number; psr0: number } {
  const gamma = 0.5772156649015329; // Euler-Mascheroni
  const N = Math.max(2, nTrials);
  const z1 = normalInv(1 - 1 / N);
  const z2 = normalInv(1 - 1 / (N * Math.E));
  const srStar = Math.sqrt(Math.max(0, varTrialSrDaily)) * ((1 - gamma) * z1 + gamma * z2);
  return { dsr: round2(probabilisticSharpe(m, srStar)), srStarDaily: srStar, psr0: round2(probabilisticSharpe(m, 0)) };
}
