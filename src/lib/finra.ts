/**
 * FINRA Short Volume Data — Institutional Sentiment Proxy
 *
 * Fetches daily short sale volume data from FINRA.
 * Short volume ratio (short volume / total volume) is a key institutional
 * sentiment indicator — high short volume signals bearish institutional positioning.
 *
 * Data source: FINRA Reg SHO Daily Short Sale Volume files
 * - Free, no authentication required
 * - Updated daily (next business day)
 * - Per-stock data for all NMS securities
 * - Available via downloadable CSV files
 *
 * Note: FINRA short volume != short interest. Short volume measures daily
 * short selling activity, while short interest is bi-monthly outstanding positions.
 */

// Cache short volume data
let shortVolumeCache: Record<string, { data: Record<string, number>; time: number }> = {};
const SHORT_CACHE_TTL = 60 * 60 * 1000; // 1 hour

/**
 * Fetch recent short volume ratio data for a stock from FINRA.
 * Uses the FINRA Query API to get daily short volume / total volume.
 * Returns date -> short_volume_ratio map.
 */
export async function fetchShortVolumeRatio(
  symbol: string
): Promise<Record<string, number> | null> {
  const upperSymbol = symbol.toUpperCase();
  const cached = shortVolumeCache[upperSymbol];
  if (cached && Date.now() - cached.time < SHORT_CACHE_TTL) {
    return cached.data;
  }

  try {
    // FINRA provides daily short sale volume files as text/CSV
    // We'll use the FINRA Query API (developer.finra.org) for structured data
    // The API is free and doesn't require authentication for basic queries
    const end = new Date();
    const start = new Date();
    start.setMonth(start.getMonth() - 14); // 14 months of data

    const startStr = start.toISOString().split("T")[0];
    const endStr = end.toISOString().split("T")[0];

    // FINRA Query API endpoint for Reg SHO daily short sale volume
    const url = `https://api.finra.org/data/group/otcMarket/name/regShoDaily?filter=symbolCode=${upperSymbol}&compareFilters=tradeReportDate>=${startStr},tradeReportDate<=${endStr}&limit=500&sortFields=-tradeReportDate`;

    const res = await fetch(url, {
      headers: {
        "Accept": "application/json",
        "User-Agent": "PutStrike/1.0",
      },
      signal: AbortSignal.timeout(15000),
    });

    if (!res.ok) {
      // Fallback: try the consolidated short interest approach
      console.warn(`[FINRA] API returned ${res.status} for ${upperSymbol}, skipping`);
      return null;
    }

    const data = await res.json();
    const dateMap: Record<string, number> = {};

    for (const record of data ?? []) {
      const date = record.tradeReportDate;
      const shortVol = record.shortVolume ?? 0;
      const totalVol = record.totalVolume ?? 0;
      if (date && totalVol > 0) {
        dateMap[date] = shortVol / totalVol;
      }
    }

    if (Object.keys(dateMap).length > 0) {
      shortVolumeCache[upperSymbol] = { data: dateMap, time: Date.now() };
    }
    return Object.keys(dateMap).length > 0 ? dateMap : null;
  } catch (error) {
    console.warn(`[FINRA] Error fetching short volume for ${upperSymbol}:`, error);
    return null;
  }
}
