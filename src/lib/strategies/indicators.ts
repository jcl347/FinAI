/**
 * Pure indicator helpers shared by strategies, the backtest engine, and the live runner.
 * All functions operate on plain number[] arrays and never reach for external data.
 * Convention: the LAST element is the most recent (current) observation.
 */

export function sma(xs: number[], period: number): number | null {
  if (xs.length < period) return null;
  const s = xs.slice(-period);
  return s.reduce((a, b) => a + b, 0) / period;
}

export function ema(xs: number[], period: number): number | null {
  if (xs.length < period) return null;
  const k = 2 / (period + 1);
  // Seed with SMA of the first `period` values, then walk forward.
  let e = xs.slice(0, period).reduce((a, b) => a + b, 0) / period;
  for (let i = period; i < xs.length; i++) e = xs[i] * k + e * (1 - k);
  return e;
}

export function mean(xs: number[]): number {
  if (xs.length === 0) return 0;
  return xs.reduce((a, b) => a + b, 0) / xs.length;
}

export function stdev(xs: number[], sample = true): number {
  if (xs.length < 2) return 0;
  const m = mean(xs);
  const v = xs.reduce((a, b) => a + (b - m) ** 2, 0) / (xs.length - (sample ? 1 : 0));
  return Math.sqrt(v);
}

/** Simple (arithmetic) returns from a price series. Length = prices.length - 1. */
export function simpleReturns(prices: number[]): number[] {
  const r: number[] = [];
  for (let i = 1; i < prices.length; i++) {
    if (prices[i - 1] > 0) r.push(prices[i] / prices[i - 1] - 1);
  }
  return r;
}

/** Log returns from a price series. */
export function logReturns(prices: number[]): number[] {
  const r: number[] = [];
  for (let i = 1; i < prices.length; i++) {
    if (prices[i - 1] > 0 && prices[i] > 0) r.push(Math.log(prices[i] / prices[i - 1]));
  }
  return r;
}

/** Total return over the last `period` bars (e.g. 12-month momentum). */
export function totalReturn(prices: number[], period: number): number | null {
  if (prices.length <= period) return null;
  const a = prices[prices.length - 1 - period];
  const b = prices[prices.length - 1];
  if (!a || a <= 0) return null;
  return b / a - 1;
}

/**
 * Momentum with a skip window (classic 12-1: return from t-252 to t-21, skipping
 * the most recent `skip` bars to avoid short-term reversal contamination).
 */
export function momentumSkip(prices: number[], lookback: number, skip: number): number | null {
  if (prices.length <= lookback + 1) return null;
  const end = prices[prices.length - 1 - skip];
  const start = prices[prices.length - 1 - lookback];
  if (!start || start <= 0 || !end || end <= 0) return null;
  return end / start - 1;
}

/** Annualized realized volatility from a price series (default 20d window, 252 trading days). */
export function annualizedVol(prices: number[], window = 20): number {
  const r = logReturns(prices.slice(-(window + 1)));
  if (r.length < 2) return 0;
  return stdev(r) * Math.sqrt(252);
}

/** Z-score of the last value vs the trailing `window`. */
export function zscore(xs: number[], window: number): number | null {
  if (xs.length < window) return null;
  const s = xs.slice(-window);
  const m = mean(s);
  const sd = stdev(s);
  if (sd === 0) return null;
  return (s[s.length - 1] - m) / sd;
}

/** Wilder's RSI over `period` (default 14). Returns 0-100. */
export function rsi(prices: number[], period = 14): number | null {
  if (prices.length < period + 1) return null;
  let gains = 0;
  let losses = 0;
  // Seed with first `period` deltas.
  for (let i = prices.length - period; i < prices.length; i++) {
    const d = prices[i] - prices[i - 1];
    if (d > 0) gains += d;
    else losses += -d;
  }
  const avgGain = gains / period;
  const avgLoss = losses / period;
  if (avgLoss === 0) return 100;
  const rs = avgGain / avgLoss;
  return 100 - 100 / (1 + rs);
}

/** Short-period RSI(2) — Connors-style oversold/overbought reversal signal. */
export function rsi2(prices: number[]): number | null {
  return rsi(prices, 2);
}

/** Bollinger %B: where price sits within its bands (0 = lower, 1 = upper). */
export function percentB(prices: number[], period = 20, mult = 2): number | null {
  if (prices.length < period) return null;
  const s = prices.slice(-period);
  const m = mean(s);
  const sd = stdev(s, false);
  const upper = m + mult * sd;
  const lower = m - mult * sd;
  if (upper === lower) return 0.5;
  return (prices[prices.length - 1] - lower) / (upper - lower);
}

/** Max drawdown of an equity/price curve, as a positive fraction (0.2 = -20%). */
export function maxDrawdown(curve: number[]): number {
  let peak = -Infinity;
  let mdd = 0;
  for (const v of curve) {
    if (v > peak) peak = v;
    if (peak > 0) {
      const dd = (peak - v) / peak;
      if (dd > mdd) mdd = dd;
    }
  }
  return mdd;
}

/** Pearson correlation of two equal-length return series. */
export function correlation(a: number[], b: number[]): number {
  const n = Math.min(a.length, b.length);
  if (n < 2) return 0;
  const ax = a.slice(-n);
  const bx = b.slice(-n);
  const ma = mean(ax);
  const mb = mean(bx);
  let num = 0;
  let da = 0;
  let db = 0;
  for (let i = 0; i < n; i++) {
    const x = ax[i] - ma;
    const y = bx[i] - mb;
    num += x * y;
    da += x * x;
    db += y * y;
  }
  if (da === 0 || db === 0) return 0;
  return num / Math.sqrt(da * db);
}

/** OLS beta of `asset` returns on `market` returns. */
export function beta(assetReturns: number[], marketReturns: number[]): number {
  const n = Math.min(assetReturns.length, marketReturns.length);
  if (n < 2) return 1;
  const a = assetReturns.slice(-n);
  const m = marketReturns.slice(-n);
  const mm = mean(m);
  const ma = mean(a);
  let cov = 0;
  let varM = 0;
  for (let i = 0; i < n; i++) {
    cov += (a[i] - ma) * (m[i] - mm);
    varM += (m[i] - mm) ** 2;
  }
  if (varM === 0) return 1;
  return cov / varM;
}

/** Average True Range as a fraction of price (for vol-based sizing). */
export function atrPct(bars: { high: number; low: number; close: number }[], period = 14): number | null {
  if (bars.length < period + 1) return null;
  let trSum = 0;
  for (let i = bars.length - period; i < bars.length; i++) {
    const h = bars[i].high;
    const l = bars[i].low;
    const pc = bars[i - 1].close;
    trSum += Math.max(h - l, Math.abs(h - pc), Math.abs(l - pc));
  }
  const atr = trSum / period;
  const last = bars[bars.length - 1].close;
  return last > 0 ? atr / last : null;
}
