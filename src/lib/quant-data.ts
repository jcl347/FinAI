/**
 * Production data adapter for the automated quant system.
 *
 * Fetches daily OHLCV for the strategy universe via yahoo-finance2 (the same library the rest
 * of the app already uses, proven on Vercel) and aligns it into the AlignedData shape the
 * strategy engine consumes. The offline backtest uses a raw-fetch loader instead; both produce
 * identical Bar[] / AlignedData, so the sim and production trade the same signals.
 */
/* eslint-disable @typescript-eslint/no-explicit-any */
import YahooFinanceModule from "yahoo-finance2";
import type { Bar } from "./strategies/types";
import { buildAligned } from "./backtest/align";
import type { AlignedData } from "./backtest/engine";
import { PRODUCTION_UNIVERSE } from "./strategies/universe";

function createYahooFinance(): any {
  const opts = { suppressNotices: ["yahooSurvey"] };
  try {
    return new (YahooFinanceModule as any)(opts);
  } catch {
    const Ctor = (YahooFinanceModule as any)?.default ?? YahooFinanceModule;
    return new Ctor(opts);
  }
}
const yahooFinance = createYahooFinance();

async function withRetry<T>(fn: () => Promise<T>, retries = 3, baseDelay = 400): Promise<T> {
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      return await fn();
    } catch (err: any) {
      const isLast = attempt === retries;
      const retryable =
        err?.message?.includes("429") ||
        err?.message?.includes("Too Many") ||
        err?.message?.includes("fetch failed") ||
        err?.message?.includes("ECONNRESET");
      if (isLast || !retryable) throw err;
      await new Promise((r) => setTimeout(r, baseDelay * 2 ** attempt));
    }
  }
  throw new Error("retry exhausted");
}

/** Fetch ~`years` of split/dividend-adjusted daily bars for one symbol. */
export async function getDailyBars(symbol: string, years = 11): Promise<Bar[]> {
  const period2 = new Date();
  const period1 = new Date();
  period1.setFullYear(period1.getFullYear() - years);
  const r: any = await withRetry(() =>
    yahooFinance.chart(symbol, { period1, period2, interval: "1d" })
  );
  const quotes: any[] = r?.quotes ?? [];
  const bars: Bar[] = [];
  for (const q of quotes) {
    const close = q.adjclose ?? q.close;
    if (close == null || q.date == null) continue;
    const raw = q.close ?? close;
    const f = raw > 0 ? close / raw : 1; // scale OHL to the adjusted series
    bars.push({
      date: new Date(q.date).toISOString().split("T")[0],
      open: (q.open ?? raw) * f,
      high: (q.high ?? raw) * f,
      low: (q.low ?? raw) * f,
      close,
      volume: q.volume ?? 0,
    });
  }
  return bars;
}

/**
 * Fetch + align the LIVE strategy universe for a daily run. Defaults to PRODUCTION_UNIVERSE (lean —
 * only what the registered sleeves trade/read) and a higher concurrency so the Vercel cron finishes
 * well inside maxDuration. `equityCoverage` lets the caller HOLD (skip the rebalance) rather than
 * trade a degraded, re-ranked liquid-200 if too many equities failed to load.
 */
export async function loadAlignedUniverse(
  symbols: string[] = PRODUCTION_UNIVERSE,
  years = 11,
  concurrency = 10
): Promise<{ data: AlignedData; loaded: number; failed: string[]; equityCoverage: number }> {
  const series = new Map<string, Bar[]>();
  const failed: string[] = [];
  for (let i = 0; i < symbols.length; i += concurrency) {
    const batch = symbols.slice(i, i + concurrency);
    const results = await Promise.allSettled(batch.map((s) => getDailyBars(s, years)));
    results.forEach((r, j) => {
      if (r.status === "fulfilled" && r.value.length > 0) series.set(batch[j], r.value);
      else failed.push(batch[j]);
    });
    if (i + concurrency < symbols.length) await new Promise((r) => setTimeout(r, 120));
  }
  if (!series.has("SPY")) throw new Error("SPY failed to load — cannot build calendar");
  const data = buildAligned(series, { vixSymbol: "^VIX", vix9dSymbol: "^VIX9D" });
  const equityCoverage = symbols.length ? series.size / symbols.length : 0;
  return { data, loaded: series.size, failed, equityCoverage };
}
