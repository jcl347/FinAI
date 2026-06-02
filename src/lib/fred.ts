/**
 * FRED (Federal Reserve Economic Data) API client.
 *
 * Fetches macroeconomic time series from the St. Louis Fed FRED API.
 * Used for 8 iTransformer features:
 *   - BAMLH0A0HYM2: ICE BofA US High Yield OAS (credit spread)
 *   - T10Y2Y: 10-Year minus 2-Year Treasury yield curve
 *   - T10YIE: 10-Year Breakeven Inflation Rate
 *   - DGS2: 2-Year Treasury Constant Maturity Rate
 *   - ICSA: Initial Jobless Claims (weekly, national)
 *   - UMCSENT: University of Michigan Consumer Sentiment
 *   - STLFSI4: St. Louis Fed Financial Stress Index (weekly, replaced STLFSI2)
 *   - T10Y3M: 10-Year minus 3-Month Treasury spread (recession signal)
 *   - DFF: Daily Federal Funds Effective Rate (monetary policy stance)
 *   - DEXJPUS: JPY/USD Exchange Rate (carry trade proxy)
 *
 * Requires FRED_API_KEY environment variable.
 * Rate limit: 120 requests/minute (free tier).
 */

/* eslint-disable @typescript-eslint/no-explicit-any */

export interface FredSeries {
  dates: string[];   // YYYY-MM-DD
  values: number[];  // numeric values (NaN filtered out)
}

export interface FredMacroData {
  hySpread?: Record<string, number>;       // BAMLH0A0HYM2
  yieldCurve?: Record<string, number>;     // T10Y2Y
  breakeven?: Record<string, number>;      // T10YIE
  treasury2y?: Record<string, number>;     // DGS2
  joblessClaims?: Record<string, number>;  // ICSA
  consumerSentiment?: Record<string, number>; // UMCSENT
  financialStress?: Record<string, number>;   // STLFSI4
  t10y3mSpread?: Record<string, number>;     // T10Y3M
  fedFundsRate?: Record<string, number>;     // DFF
  jpyUsd?: Record<string, number>;           // DEXJPUS
}

// Cache to avoid hammering FRED API on every request
let fredCache: FredMacroData | null = null;
let fredCacheTime = 0;
const FRED_CACHE_TTL = 60 * 60 * 1000; // 1 hour (FRED data updates daily at most)

const FRED_SERIES = [
  { id: "BAMLH0A0HYM2", key: "hySpread" },
  { id: "T10Y2Y", key: "yieldCurve" },
  { id: "T10YIE", key: "breakeven" },
  { id: "DGS2", key: "treasury2y" },
  { id: "ICSA", key: "joblessClaims" },
  { id: "UMCSENT", key: "consumerSentiment" },
  { id: "STLFSI4", key: "financialStress" },
  { id: "T10Y3M", key: "t10y3mSpread" },
  { id: "DFF", key: "fedFundsRate" },
  { id: "DEXJPUS", key: "jpyUsd" },
] as const;

/**
 * Fetch a single FRED series as date→value map.
 */
async function fetchFredSeries(
  seriesId: string,
  apiKey: string,
  startDate: string
): Promise<Record<string, number>> {
  const url = new URL("https://api.stlouisfed.org/fred/series/observations");
  url.searchParams.set("series_id", seriesId);
  url.searchParams.set("api_key", apiKey);
  url.searchParams.set("file_type", "json");
  url.searchParams.set("observation_start", startDate);
  url.searchParams.set("sort_order", "asc");

  const res = await fetch(url.toString(), {
    signal: AbortSignal.timeout(10000),
  });

  if (!res.ok) {
    throw new Error(`FRED API error ${res.status} for ${seriesId}`);
  }

  const data = await res.json();
  const dateMap: Record<string, number> = {};

  for (const obs of data.observations ?? []) {
    const val = parseFloat(obs.value);
    if (!isNaN(val) && obs.value !== ".") {
      dateMap[obs.date] = val;
    }
  }

  return dateMap;
}

/**
 * Fetch all 6 FRED macro series. Returns cached data if fresh.
 * Gracefully returns partial data if some series fail.
 */
export async function fetchFredMacroData(): Promise<FredMacroData> {
  const apiKey = process.env.FRED_API_KEY;
  if (!apiKey) {
    console.warn("[FRED] No FRED_API_KEY set — skipping FRED features");
    return {};
  }

  const now = Date.now();
  if (fredCache && now - fredCacheTime < FRED_CACHE_TTL) {
    return fredCache;
  }

  // Fetch last ~14 months to ensure enough history for 20d lookback after alignment
  const startDate = new Date();
  startDate.setMonth(startDate.getMonth() - 14);
  const startStr = startDate.toISOString().split("T")[0];

  const result: FredMacroData = {};

  const results = await Promise.allSettled(
    FRED_SERIES.map(async ({ id, key }) => {
      const dateMap = await fetchFredSeries(id, apiKey, startStr);
      return { key, dateMap };
    })
  );

  for (const r of results) {
    if (r.status === "fulfilled") {
      (result as any)[r.value.key] = r.value.dateMap;
    } else {
      console.warn(`[FRED] Failed to fetch: ${r.reason}`);
    }
  }

  fredCache = result;
  fredCacheTime = now;

  const loadedCount = Object.keys(result).filter(
    k => (result as any)[k] && Object.keys((result as any)[k]).length > 0
  ).length;
  console.log(`[FRED] Loaded ${loadedCount}/${FRED_SERIES.length} series`);

  return result;
}
