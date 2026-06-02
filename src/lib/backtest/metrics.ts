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
