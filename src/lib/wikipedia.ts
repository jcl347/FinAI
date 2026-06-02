/**
 * Wikipedia Pageviews API — Retail Attention Proxy
 *
 * Fetches daily Wikipedia pageview counts for company articles.
 * High pageview spikes correlate with retail investor attention events
 * (earnings, news, meme stock activity, controversy).
 *
 * API: https://wikimedia.org/api/rest_v1/metrics/pageviews/per-article/
 * - Free, no authentication required
 * - Data available since July 2015
 * - Rate limit: 100 req/s (generous)
 * - Returns daily pageview counts per article
 */

// Cache to avoid refetching within a session
let wikiCache: Record<string, { data: Record<string, number>; time: number }> = {};
const WIKI_CACHE_TTL = 60 * 60 * 1000; // 1 hour

/**
 * Maps stock tickers to their Wikipedia article titles.
 * Uses company names as they appear on Wikipedia.
 */
const TICKER_TO_WIKI: Record<string, string> = {
  AAPL: "Apple_Inc.", MSFT: "Microsoft", NVDA: "Nvidia", GOOGL: "Alphabet_Inc.",
  AMZN: "Amazon_(company)", META: "Meta_Platforms", TSLA: "Tesla,_Inc.",
  AVGO: "Broadcom_Inc.", JPM: "JPMorgan_Chase", V: "Visa_Inc.",
  MA: "Mastercard", UNH: "UnitedHealth_Group", LLY: "Eli_Lilly_and_Company",
  JNJ: "Johnson_%26_Johnson", HD: "The_Home_Depot", PG: "Procter_%26_Gamble",
  COST: "Costco", NFLX: "Netflix", ABBV: "AbbVie", CRM: "Salesforce",
  AMD: "Advanced_Micro_Devices", ORCL: "Oracle_Corporation", MRK: "Merck_%26_Co.",
  PFE: "Pfizer", KO: "The_Coca-Cola_Company", PEP: "PepsiCo", TMO: "Thermo_Fisher_Scientific",
  ABT: "Abbott_Laboratories", MCD: "McDonald%27s", DIS: "The_Walt_Disney_Company",
  CSCO: "Cisco", ADBE: "Adobe_Inc.", INTC: "Intel", IBM: "IBM",
  QCOM: "Qualcomm", TXN: "Texas_Instruments", NOW: "ServiceNow",
  BA: "Boeing", GE: "GE_Aerospace", CAT: "Caterpillar_Inc.",
  DE: "John_Deere", HON: "Honeywell", RTX: "RTX_Corporation",
  LMT: "Lockheed_Martin", UNP: "Union_Pacific_Corporation",
  SBUX: "Starbucks", NKE: "Nike,_Inc.", TGT: "Target_Corporation",
  LOW: "Lowe%27s", WMT: "Walmart", XOM: "ExxonMobil",
  CVX: "Chevron_Corporation", COP: "ConocoPhillips", SLB: "Schlumberger",
  EOG: "EOG_Resources", BAC: "Bank_of_America", WFC: "Wells_Fargo",
  GS: "Goldman_Sachs", MS: "Morgan_Stanley", C: "Citigroup",
  SCHW: "Charles_Schwab_Corporation", AXP: "American_Express",
  BLK: "BlackRock", PYPL: "PayPal", SQ: "Block,_Inc.",
  COIN: "Coinbase", PANW: "Palo_Alto_Networks", CRWD: "CrowdStrike",
  FTNT: "Fortinet", ABNB: "Airbnb", UBER: "Uber",
  MMM: "3M", AMAT: "Applied_Materials", MU: "Micron_Technology",
  LRCX: "Lam_Research", KLAC: "KLA_Corporation",
  SNPS: "Synopsys", CDNS: "Cadence_Design_Systems",
  BMY: "Bristol-Myers_Squibb", AMGN: "Amgen", DHR: "Danaher_Corporation",
  // ETFs don't have meaningful Wikipedia pageviews
};

/**
 * Fetch daily Wikipedia pageviews for a stock's company article.
 * Returns a date->count map for the last 14 months.
 */
export async function fetchWikiPageviews(
  symbol: string
): Promise<Record<string, number> | null> {
  const articleTitle = TICKER_TO_WIKI[symbol.toUpperCase()];
  if (!articleTitle) return null;

  const cacheKey = symbol.toUpperCase();
  const cached = wikiCache[cacheKey];
  if (cached && Date.now() - cached.time < WIKI_CACHE_TTL) {
    return cached.data;
  }

  try {
    const end = new Date();
    const start = new Date();
    start.setMonth(start.getMonth() - 14); // 14 months for z-score warmup

    const startStr = start.toISOString().slice(0, 10).replace(/-/g, "");
    const endStr = end.toISOString().slice(0, 10).replace(/-/g, "");

    const url = `https://wikimedia.org/api/rest_v1/metrics/pageviews/per-article/en.wikipedia.org/all-access/user/${articleTitle}/daily/${startStr}00/${endStr}00`;

    const res = await fetch(url, {
      headers: { "User-Agent": "PutStrike/1.0 (stock analysis tool)" },
      signal: AbortSignal.timeout(10000),
    });

    if (!res.ok) {
      console.warn(`[Wikipedia] Failed for ${symbol}: ${res.status}`);
      return null;
    }

    const data = await res.json();
    const dateMap: Record<string, number> = {};

    for (const item of data.items ?? []) {
      // Wikipedia returns timestamps like "2024010100"
      const dateStr = `${item.timestamp.slice(0, 4)}-${item.timestamp.slice(4, 6)}-${item.timestamp.slice(6, 8)}`;
      dateMap[dateStr] = item.views ?? 0;
    }

    wikiCache[cacheKey] = { data: dateMap, time: Date.now() };
    return dateMap;
  } catch (error) {
    console.warn(`[Wikipedia] Error fetching pageviews for ${symbol}:`, error);
    return null;
  }
}

export { TICKER_TO_WIKI };
