/**
 * Finnhub Insider Sentiment — Smart Money Proxy
 *
 * Fetches monthly insider trading sentiment (MSPR) from Finnhub's free API.
 * The Monthly Share Purchase Ratio (MSPR) measures whether insider transactions
 * are dominated by buying (+100) or selling (-100) in a given month.
 *
 * Research shows insider buying is a stronger signal than selling:
 * - Insiders buy for one reason (they think stock will go up)
 * - Insiders sell for many reasons (diversification, taxes, liquidity)
 *
 * API: https://finnhub.io/docs/api/insider-sentiment
 * - Free tier: 60 calls/minute (no cost)
 * - Historical data: 10+ years per stock
 * - Monthly granularity (forward-filled to daily)
 * - Requires FINNHUB_API_KEY environment variable
 */

// Cache insider sentiment data
let insiderCache: Record<string, { data: Record<string, number>; time: number }> = {};
const INSIDER_CACHE_TTL = 6 * 60 * 60 * 1000; // 6 hours (monthly data, slow-moving)

/**
 * Fetch insider sentiment MSPR from Finnhub.
 * Returns a date (YYYY-MM) -> MSPR value map.
 * MSPR ranges from -100 (all selling) to +100 (all buying).
 */
export async function fetchInsiderSentiment(
  symbol: string
): Promise<Record<string, number> | null> {
  const apiKey = process.env.FINNHUB_API_KEY;
  if (!apiKey) {
    // Gracefully skip if no API key configured
    return null;
  }

  const upperSymbol = symbol.toUpperCase();
  const cached = insiderCache[upperSymbol];
  if (cached && Date.now() - cached.time < INSIDER_CACHE_TTL) {
    return cached.data;
  }

  try {
    const end = new Date();
    const start = new Date();
    start.setFullYear(start.getFullYear() - 2); // 2 years of monthly data

    const startStr = start.toISOString().split("T")[0];
    const endStr = end.toISOString().split("T")[0];

    const url = `https://finnhub.io/api/v1/stock/insider-sentiment?symbol=${upperSymbol}&from=${startStr}&to=${endStr}&token=${apiKey}`;

    const res = await fetch(url, {
      signal: AbortSignal.timeout(10000),
    });

    if (!res.ok) {
      console.warn(`[Finnhub] Insider sentiment failed for ${upperSymbol}: ${res.status}`);
      return null;
    }

    const data = await res.json();
    const dateMap: Record<string, number> = {};

    for (const record of data?.data ?? []) {
      // Finnhub returns {year, month, mspr, change}
      const year = record.year;
      const month = String(record.month).padStart(2, "0");
      const mspr = record.mspr ?? 0;

      // Create date keys for each day of the month (forward-fill)
      const daysInMonth = new Date(year, parseInt(month), 0).getDate();
      for (let day = 1; day <= daysInMonth; day++) {
        const dateStr = `${year}-${month}-${String(day).padStart(2, "0")}`;
        dateMap[dateStr] = mspr;
      }
    }

    if (Object.keys(dateMap).length > 0) {
      insiderCache[upperSymbol] = { data: dateMap, time: Date.now() };
    }
    return Object.keys(dateMap).length > 0 ? dateMap : null;
  } catch (error) {
    console.warn(`[Finnhub] Error fetching insider sentiment for ${upperSymbol}:`, error);
    return null;
  }
}
