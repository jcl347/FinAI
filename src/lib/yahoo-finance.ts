/**
 * Yahoo Finance Data Provider
 *
 * Wraps yahoo-finance2 to fetch:
 * - Stock quotes (price, volume, market cap, beta, P/E)
 * - Options chains (all expirations, strikes, greeks)
 * - Historical data (for IV rank calculation)
 *
 * Includes:
 * - Retry with exponential backoff for rate limiting resilience
 * - Batch processing to avoid hammering Yahoo with 54+ concurrent requests
 * - Sample data fallback when Yahoo Finance is unavailable
 */

/* eslint-disable @typescript-eslint/no-explicit-any */
import YahooFinanceModule from "yahoo-finance2";

// yahoo-finance2 v3 requires `new YahooFinance()`.
// ESM/CJS interop on Vercel can resolve the default export differently,
// so we handle both cases: the import may be the class directly,
// or it may be a module with a .default property.
function createYahooFinance(): any {
  const opts = { suppressNotices: ["yahooSurvey"] };
  try {
    // Direct: import resolved to the class
    return new (YahooFinanceModule as any)(opts);
  } catch {
    // Fallback: import resolved to { default: class }
    const Ctor = (YahooFinanceModule as any)?.default ?? YahooFinanceModule;
    return new Ctor(opts);
  }
}

const yahooFinance = createYahooFinance();

export interface StockQuote {
  symbol: string;
  price: number;
  previousClose: number;
  change: number;
  changePercent: number;
  volume: number;
  avgVolume: number;
  marketCap: number;
  fiftyTwoWeekLow: number;
  fiftyTwoWeekHigh: number;
  dividendYield: number;
  beta: number;
  trailingPE: number;
  name: string;
}

export interface OptionsChainData {
  expirationDates: string[];
  options: OptionContract[];
  underlyingPrice: number;
}

export interface OptionContract {
  strike: number;
  expiration: string;
  dte: number;
  type: "put" | "call";
  bid: number;
  ask: number;
  lastPrice: number;
  volume: number;
  openInterest: number;
  impliedVolatility: number;
}

/**
 * Retry a function with exponential backoff.
 * Yahoo Finance rate limits aggressively; this prevents cascade failures.
 */
async function withRetry<T>(
  fn: () => Promise<T>,
  retries = 3,
  baseDelay = 500
): Promise<T> {
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      return await fn();
    } catch (err: any) {
      const isLast = attempt === retries;
      const isRetryable =
        err?.message?.includes("429") ||
        err?.message?.includes("Too Many") ||
        err?.message?.includes("fetch failed") ||
        err?.message?.includes("ECONNRESET") ||
        err?.message?.includes("socket hang up");
      if (isLast || !isRetryable) throw err;
      const delay = baseDelay * Math.pow(2, attempt);
      await new Promise((r) => setTimeout(r, delay));
    }
  }
  throw new Error("Retry exhausted");
}

export async function getStockQuote(symbol: string): Promise<StockQuote> {
  const quote: any = await withRetry(() => yahooFinance.quote(symbol));

  if (!quote) {
    throw new Error(`No quote data returned for ${symbol}. The symbol may be invalid or Yahoo Finance may be unavailable.`);
  }

  return {
    symbol: quote.symbol ?? symbol,
    price: quote.regularMarketPrice ?? 0,
    previousClose: quote.regularMarketPreviousClose ?? 0,
    change: quote.regularMarketChange ?? 0,
    changePercent: quote.regularMarketChangePercent ?? 0,
    volume: quote.regularMarketVolume ?? 0,
    avgVolume: quote.averageDailyVolume3Month ?? 0,
    marketCap: quote.marketCap ?? 0,
    fiftyTwoWeekLow: quote.fiftyTwoWeekLow ?? 0,
    fiftyTwoWeekHigh: quote.fiftyTwoWeekHigh ?? 0,
    dividendYield: quote.dividendYield ?? 0,
    beta: quote.beta ?? 1.0,
    trailingPE: quote.trailingPE ?? 0,
    name: quote.shortName ?? quote.longName ?? symbol,
  };
}

export async function getOptionsChain(
  symbol: string,
  expirationDate?: string
): Promise<OptionsChainData> {
  const result: any = await withRetry(() =>
    yahooFinance.options(
      symbol,
      expirationDate ? { date: new Date(expirationDate) } : {}
    )
  );

  if (!result) {
    throw new Error(`No options data returned for ${symbol}. The symbol may not have options or Yahoo Finance may be unavailable.`);
  }

  const now = new Date();
  const options: OptionContract[] = [];

  function processContracts(contracts: any[], type: "put" | "call") {
    if (!contracts) return;
    for (const c of contracts) {
      const expDate = c.expiration ? new Date(c.expiration) : null;
      const dte = expDate
        ? Math.ceil(
            (expDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)
          )
        : 0;

      options.push({
        strike: c.strike ?? 0,
        expiration: expDate?.toISOString().split("T")[0] ?? "",
        dte,
        type,
        bid: c.bid ?? 0,
        ask: c.ask ?? 0,
        lastPrice: c.lastPrice ?? 0,
        volume: c.volume ?? 0,
        openInterest: c.openInterest ?? 0,
        impliedVolatility: c.impliedVolatility ?? 0,
      });
    }
  }

  if (result.options?.[0]) {
    processContracts(result.options[0].puts, "put");
    processContracts(result.options[0].calls, "call");
  }

  const expirationDates = result.expirationDates
    ? result.expirationDates.map((d: any) =>
        new Date(d).toISOString().split("T")[0]
      )
    : [];

  return {
    expirationDates,
    options,
    underlyingPrice: result.quote?.regularMarketPrice ?? 0,
  };
}

/**
 * Fetch historical price data for HV Rank calculation.
 * HV Rank = (Current HV - 52wk Low HV) / (52wk High HV - 52wk Low HV) * 100
 */
export async function getHistoricalVolatility(
  symbol: string,
  period: "3mo" | "6mo" | "1y" = "1y"
): Promise<{
  currentHV: number;
  hvHigh: number;
  hvLow: number;
  hvRank: number;
}> {
  const endDate = new Date();
  const startDate = new Date();
  if (period === "3mo") startDate.setMonth(startDate.getMonth() - 3);
  else if (period === "6mo") startDate.setMonth(startDate.getMonth() - 6);
  else startDate.setFullYear(startDate.getFullYear() - 1);

  const history: any = await withRetry(() =>
    yahooFinance.chart(symbol, {
      period1: startDate,
      period2: endDate,
      interval: "1d",
    })
  );

  if (!history) {
    return { currentHV: 0, hvHigh: 0, hvLow: 0, hvRank: 50 };
  }

  const quotes = history.quotes ?? [];
  if (quotes.length < 22) {
    return { currentHV: 0, hvHigh: 0, hvLow: 0, hvRank: 50 };
  }

  const logReturns: number[] = [];
  for (let i = 1; i < quotes.length; i++) {
    const prev = quotes[i - 1].close;
    const curr = quotes[i].close;
    if (prev && curr && prev > 0 && curr > 0) {
      logReturns.push(Math.log(curr / prev));
    }
  }

  const windowSize = 20;
  const hvValues: number[] = [];

  for (let i = windowSize; i <= logReturns.length; i++) {
    const slice = logReturns.slice(i - windowSize, i);
    const mean = slice.reduce((a, b) => a + b, 0) / slice.length;
    const variance =
      slice.reduce((a, b) => a + (b - mean) ** 2, 0) / (slice.length - 1);
    const dailyVol = Math.sqrt(variance);
    const annualizedVol = dailyVol * Math.sqrt(252);
    hvValues.push(annualizedVol);
  }

  if (hvValues.length === 0) {
    return { currentHV: 0, hvHigh: 0, hvLow: 0, hvRank: 50 };
  }

  const currentHV = hvValues[hvValues.length - 1];
  const hvHigh = Math.max(...hvValues);
  const hvLow = Math.min(...hvValues);

  const hvRank =
    hvHigh === hvLow ? 50 : ((currentHV - hvLow) / (hvHigh - hvLow)) * 100;

  return {
    currentHV: Math.round(currentHV * 10000) / 100,
    hvHigh: Math.round(hvHigh * 10000) / 100,
    hvLow: Math.round(hvLow * 10000) / 100,
    hvRank: Math.round(hvRank * 10) / 10,
  };
}

/**
 * Get VIX value for market regime detection.
 */
export async function getVIX(): Promise<number> {
  try {
    const quote: any = await withRetry(() => yahooFinance.quote("^VIX"), 2, 300);
    return quote.regularMarketPrice ?? 20;
  } catch {
    return 20; // default to normal
  }
}

/**
 * Search for stock symbols.
 */
export async function searchSymbols(
  query: string
): Promise<{ symbol: string; name: string; type: string }[]> {
  const results: any = await withRetry(() => yahooFinance.search(query));

  if (!results) {
    return [];
  }

  return (results.quotes ?? [])
    .filter(
      (q: any) => q.quoteType === "EQUITY" || q.quoteType === "ETF"
    )
    .slice(0, 10)
    .map((q: any) => ({
      symbol: q.symbol ?? "",
      name: q.shortname ?? q.longname ?? "",
      type: q.quoteType ?? "EQUITY",
    }));
}

/**
 * Fetch earnings date + trend analysis for a symbol.
 * Uses quoteSummary for earnings dates and chart data for trend/support levels.
 */
export interface StockContext {
  earningsDate: string | null;    // Next earnings date (ISO string)
  daysToEarnings: number | null;  // Days until next earnings
  earningsWarning: boolean;       // True if earnings within 14 days
  trendDirection: "up" | "down" | "sideways";
  trendStrength: number;          // 0-100, how strong the trend is
  sma20: number;
  sma50: number;
  sma200: number;
  priceVsSMA20: number;           // % above/below SMA20
  priceVsSMA50: number;
  priceVsSMA200: number;
  rsi14: number;                  // RSI(14)
  supportLevel: number;           // Estimated support (recent swing low)
  resistanceLevel: number;        // Estimated resistance (recent swing high)
  avgTrueRange: number;           // ATR(14) for volatility sizing
  recentHighs: number[];          // Last 3 swing highs
  recentLows: number[];           // Last 3 swing lows
}

export async function getStockContext(
  symbol: string,
  currentPrice: number
): Promise<StockContext> {
  const endDate = new Date();
  const startDate = new Date();
  startDate.setMonth(startDate.getMonth() - 12); // 1 year of data

  // Fetch earnings date and historical data in parallel
  const [earningsResult, historyResult] = await Promise.allSettled([
    withRetry(() =>
      yahooFinance.quoteSummary(symbol, { modules: ["calendarEvents"] })
    ),
    withRetry(() =>
      yahooFinance.chart(symbol, {
        period1: startDate,
        period2: endDate,
        interval: "1d",
      })
    ),
  ]);

  // Parse earnings date
  let earningsDate: string | null = null;
  let daysToEarnings: number | null = null;
  let earningsWarning = false;

  if (earningsResult.status === "fulfilled") {
    const cal = (earningsResult.value as any)?.calendarEvents;
    const eDates = cal?.earnings?.earningsDate;
    if (Array.isArray(eDates) && eDates.length > 0) {
      const nextEarnings = new Date(eDates[0]);
      earningsDate = nextEarnings.toISOString().split("T")[0];
      daysToEarnings = Math.ceil(
        (nextEarnings.getTime() - Date.now()) / (1000 * 60 * 60 * 24)
      );
      earningsWarning = daysToEarnings >= 0 && daysToEarnings <= 14;
    }
  }

  // Default context for when historical data is unavailable
  const defaultCtx: StockContext = {
    earningsDate,
    daysToEarnings,
    earningsWarning,
    trendDirection: "sideways",
    trendStrength: 50,
    sma20: currentPrice,
    sma50: currentPrice,
    sma200: currentPrice,
    priceVsSMA20: 0,
    priceVsSMA50: 0,
    priceVsSMA200: 0,
    rsi14: 50,
    supportLevel: currentPrice * 0.95,
    resistanceLevel: currentPrice * 1.05,
    avgTrueRange: currentPrice * 0.02,
    recentHighs: [],
    recentLows: [],
  };

  if (historyResult.status !== "fulfilled") return defaultCtx;

  const quotes = (historyResult.value as any).quotes ?? [];
  if (quotes.length < 50) return defaultCtx;

  // Extract closes and highs/lows
  const closes: number[] = quotes.map((q: any) => q.close).filter((c: number) => c > 0);
  const highs: number[] = quotes.map((q: any) => q.high).filter((h: number) => h > 0);
  const lows: number[] = quotes.map((q: any) => q.low).filter((l: number) => l > 0);

  if (closes.length < 50) return defaultCtx;

  // Use the last historical close when currentPrice is 0 or missing
  // (predict API fetches quote in parallel so can't pass price upfront)
  if (!currentPrice || currentPrice <= 0) {
    currentPrice = closes[closes.length - 1];
  }

  // SMAs
  const sma = (arr: number[], period: number) => {
    if (arr.length < period) return arr[arr.length - 1];
    const slice = arr.slice(-period);
    return slice.reduce((a, b) => a + b, 0) / period;
  };

  const sma20 = sma(closes, 20);
  const sma50 = sma(closes, 50);
  const sma200 = closes.length >= 200 ? sma(closes, 200) : sma50;

  // RSI(14)
  const rsiPeriod = 14;
  const rsiCloses = closes.slice(-rsiPeriod - 1);
  let gains = 0, losses = 0;
  for (let i = 1; i < rsiCloses.length; i++) {
    const diff = rsiCloses[i] - rsiCloses[i - 1];
    if (diff > 0) gains += diff;
    else losses += Math.abs(diff);
  }
  const avgGain = gains / rsiPeriod;
  const avgLoss = losses / rsiPeriod;
  const rs = avgLoss === 0 ? 100 : avgGain / avgLoss;
  const rsi14 = 100 - 100 / (1 + rs);

  // ATR(14)
  const atrPeriod = 14;
  const recentQuotes = quotes.slice(-atrPeriod - 1);
  let atrSum = 0;
  for (let i = 1; i < recentQuotes.length; i++) {
    const h = recentQuotes[i].high ?? 0;
    const l = recentQuotes[i].low ?? 0;
    const pc = recentQuotes[i - 1].close ?? 0;
    const tr = Math.max(h - l, Math.abs(h - pc), Math.abs(l - pc));
    atrSum += tr;
  }
  const avgTrueRange = atrSum / atrPeriod;

  // Swing highs and lows (last 60 days, looking for 5-day pivots)
  const recentHighs: number[] = [];
  const recentLows: number[] = [];
  const lookback = Math.min(60, highs.length - 5);
  const startIdx = highs.length - lookback;

  for (let i = startIdx + 2; i < highs.length - 2; i++) {
    if (highs[i] > highs[i - 1] && highs[i] > highs[i - 2] &&
        highs[i] > highs[i + 1] && highs[i] > highs[i + 2]) {
      recentHighs.push(highs[i]);
    }
    if (lows[i] < lows[i - 1] && lows[i] < lows[i - 2] &&
        lows[i] < lows[i + 1] && lows[i] < lows[i + 2]) {
      recentLows.push(lows[i]);
    }
  }

  // Support = lowest recent swing low, Resistance = highest recent swing high
  const supportLevel = recentLows.length > 0
    ? Math.min(...recentLows.slice(-3))
    : Math.min(...lows.slice(-20));
  const resistanceLevel = recentHighs.length > 0
    ? Math.max(...recentHighs.slice(-3))
    : Math.max(...highs.slice(-20));

  // Trend detection
  const priceVsSMA20 = ((currentPrice - sma20) / sma20) * 100;
  const priceVsSMA50 = ((currentPrice - sma50) / sma50) * 100;
  const priceVsSMA200 = ((currentPrice - sma200) / sma200) * 100;

  let trendDirection: "up" | "down" | "sideways";
  let trendStrength: number;

  if (currentPrice > sma20 && sma20 > sma50 && currentPrice > sma200) {
    trendDirection = "up";
    trendStrength = Math.min(100, 50 + Math.abs(priceVsSMA50) * 3);
  } else if (currentPrice < sma20 && sma20 < sma50 && currentPrice < sma200) {
    trendDirection = "down";
    trendStrength = Math.min(100, 50 + Math.abs(priceVsSMA50) * 3);
  } else {
    trendDirection = "sideways";
    trendStrength = Math.max(0, 50 - Math.abs(priceVsSMA50) * 3);
  }

  return {
    earningsDate,
    daysToEarnings,
    earningsWarning,
    trendDirection,
    trendStrength,
    sma20: Math.round(sma20 * 100) / 100,
    sma50: Math.round(sma50 * 100) / 100,
    sma200: Math.round(sma200 * 100) / 100,
    priceVsSMA20: Math.round(priceVsSMA20 * 100) / 100,
    priceVsSMA50: Math.round(priceVsSMA50 * 100) / 100,
    priceVsSMA200: Math.round(priceVsSMA200 * 100) / 100,
    rsi14: Math.round(rsi14 * 10) / 10,
    supportLevel: Math.round(supportLevel * 100) / 100,
    resistanceLevel: Math.round(resistanceLevel * 100) / 100,
    avgTrueRange: Math.round(avgTrueRange * 100) / 100,
    recentHighs: recentHighs.slice(-3).map(h => Math.round(h * 100) / 100),
    recentLows: recentLows.slice(-3).map(l => Math.round(l * 100) / 100),
  };
}

/**
 * Process symbols in sequential batches to avoid Yahoo rate limiting.
 * Runs batchSize symbols concurrently, waits between batches.
 * This replaced the previous approach of firing all 18 stocks in parallel
 * which caused 429 rate limit errors.
 */
export async function batchProcess<T>(
  items: string[],
  processor: (symbol: string) => Promise<T>,
  batchSize: number = 3,
  delayMs: number = 1000
): Promise<{ symbol: string; result: T | null; error?: string }[]> {
  const results: { symbol: string; result: T | null; error?: string }[] = [];

  for (let i = 0; i < items.length; i += batchSize) {
    const batch = items.slice(i, i + batchSize);
    const batchResults = await Promise.allSettled(
      batch.map(async (symbol) => {
        const result = await processor(symbol);
        return { symbol, result };
      })
    );

    for (let j = 0; j < batchResults.length; j++) {
      const r = batchResults[j];
      if (r.status === "fulfilled") {
        results.push({ symbol: r.value.symbol, result: r.value.result });
      } else {
        results.push({
          symbol: batch[j],
          result: null,
          error: r.reason?.message ?? "Failed",
        });
      }
    }

    // Delay between batches
    if (i + batchSize < items.length) {
      await new Promise((r) => setTimeout(r, delayMs));
    }
  }

  return results;
}
