/**
 * Black-Scholes Option Pricing & Greeks Calculator
 *
 * Implements the Black-Scholes-Merton model for European put option pricing,
 * Greeks calculation (Delta, Gamma, Theta, Vega), and implied volatility
 * estimation via the Newton-Raphson method.
 *
 * References:
 * - Black, F. & Scholes, M. (1973). "The Pricing of Options and Corporate Liabilities"
 * - Newton-Raphson IV solver based on Manaster & Koehler (1982)
 */

// Standard normal CDF using Abramowitz & Stegun 26.2.17 (error < 7.5e-8)
function normalCDF(x: number): number {
  if (x < -8) return 0;
  if (x > 8) return 1;

  // For x >= 0: Phi(x) = 1 - phi(x) * (b1*t + b2*t^2 + b3*t^3 + b4*t^4 + b5*t^5)
  // where phi(x) = (1/sqrt(2*pi)) * exp(-x^2/2) and t = 1/(1 + 0.2316419*x)
  const b1 = 0.31938153;
  const b2 = -0.356563782;
  const b3 = 1.781477937;
  const b4 = -1.821255978;
  const b5 = 1.330274429;
  const p = 0.2316419;

  const absX = Math.abs(x);
  const t = 1.0 / (1.0 + p * absX);
  const pdf = Math.exp(-0.5 * absX * absX) / Math.sqrt(2 * Math.PI);
  const poly = ((((b5 * t + b4) * t + b3) * t + b2) * t + b1) * t;
  const cdf = 1.0 - pdf * poly;

  return x >= 0 ? cdf : 1.0 - cdf;
}

// Standard normal PDF
function normalPDF(x: number): number {
  return Math.exp(-0.5 * x * x) / Math.sqrt(2 * Math.PI);
}

export interface BlackScholesInputs {
  S: number; // Current stock price
  K: number; // Strike price
  T: number; // Time to expiration in years
  r: number; // Risk-free interest rate (e.g. 0.05 for 5%)
  sigma: number; // Volatility (e.g. 0.3 for 30%)
  q?: number; // Dividend yield (default 0)
}

export interface OptionGreeks {
  price: number;
  delta: number;
  gamma: number;
  theta: number; // Per day
  vega: number; // Per 1% move in vol
  rho: number;
}

function d1d2(S: number, K: number, T: number, r: number, sigma: number, q: number) {
  const d1 =
    (Math.log(S / K) + (r - q + 0.5 * sigma * sigma) * T) / (sigma * Math.sqrt(T));
  const d2 = d1 - sigma * Math.sqrt(T);
  return { d1, d2 };
}

export function putPrice(inputs: BlackScholesInputs): number {
  const { S, K, T, r, sigma, q = 0 } = inputs;
  if (T <= 0) return Math.max(K - S, 0);
  const { d1, d2 } = d1d2(S, K, T, r, sigma, q);
  return K * Math.exp(-r * T) * normalCDF(-d2) - S * Math.exp(-q * T) * normalCDF(-d1);
}

export function putGreeks(inputs: BlackScholesInputs): OptionGreeks {
  const { S, K, T, r, sigma, q = 0 } = inputs;
  if (T <= 0) {
    const itm = K > S;
    return {
      price: Math.max(K - S, 0),
      delta: itm ? -1 : 0,
      gamma: 0,
      theta: 0,
      vega: 0,
      rho: 0,
    };
  }

  const { d1, d2 } = d1d2(S, K, T, r, sigma, q);
  const expQT = Math.exp(-q * T);
  const expRT = Math.exp(-r * T);

  const price = K * expRT * normalCDF(-d2) - S * expQT * normalCDF(-d1);
  const delta = -expQT * normalCDF(-d1);
  const gamma = (expQT * normalPDF(d1)) / (S * sigma * Math.sqrt(T));
  const theta =
    (-(S * expQT * normalPDF(d1) * sigma) / (2 * Math.sqrt(T)) +
      r * K * expRT * normalCDF(-d2) -
      q * S * expQT * normalCDF(-d1)) /
    365;
  const vega = (S * expQT * normalPDF(d1) * Math.sqrt(T)) / 100;
  const rho = (-K * T * expRT * normalCDF(-d2)) / 100;

  return { price, delta, gamma, theta, vega, rho };
}

/**
 * Compute implied volatility from market price using Newton-Raphson.
 * Falls back to bisection if Newton-Raphson diverges.
 */
export function impliedVolatility(
  marketPrice: number,
  S: number,
  K: number,
  T: number,
  r: number,
  q: number = 0
): number {
  if (T <= 0 || marketPrice <= 0) return 0;

  let sigma = 0.3; // initial guess
  const maxIter = 100;
  const tol = 1e-6;

  // Newton-Raphson
  for (let i = 0; i < maxIter; i++) {
    const bsPrice = putPrice({ S, K, T, r, sigma, q });
    const diff = bsPrice - marketPrice;

    if (Math.abs(diff) < tol) return sigma;

    const { d1 } = d1d2(S, K, T, r, sigma, q);
    const vegaVal = S * Math.exp(-q * T) * normalPDF(d1) * Math.sqrt(T);

    if (vegaVal < 1e-10) break; // vega too small, switch to bisection

    sigma = sigma - diff / vegaVal;
    if (sigma <= 0.001) sigma = 0.001;
    if (sigma > 5) sigma = 5;
  }

  // Bisection fallback
  let lo = 0.01,
    hi = 5.0;
  for (let i = 0; i < 100; i++) {
    const mid = (lo + hi) / 2;
    const bsPrice = putPrice({ S, K, T, r, sigma: mid, q });
    if (Math.abs(bsPrice - marketPrice) < tol) return mid;
    if (bsPrice > marketPrice) hi = mid;
    else lo = mid;
  }

  return (lo + hi) / 2;
}
