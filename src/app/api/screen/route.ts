import { NextRequest, NextResponse } from "next/server";
import {
  getOptionsChain,
  getStockQuote,
  getHistoricalVolatility,
  getVIX,
  type StockQuote,
} from "@/lib/yahoo-finance";
import { putGreeks, impliedVolatility as computeIV } from "@/lib/black-scholes";
import {
  type PutCandidate,
  type CompanyStability,
  type ScoredPut,
  rankPuts,
  classifyMarketRegime,
  scoreCompanyStability,
} from "@/lib/scoring";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

// Default watchlist: 10 high-liquidity, fundamentally strong stocks for CSP
// Reduced from 18 to fit within Vercel function timeouts reliably
const DEFAULT_SYMBOLS = [
  "AAPL", "MSFT", "GOOGL", "AMZN", "NVDA",
  "JPM", "SPY", "QQQ", "META", "V",
];

interface ScreenResult {
  symbol: string;
  quote: StockQuote;
  ivRank: number;
  hv: { currentHV: number; hvHigh: number; hvLow: number; hvRank: number };
  stability: { score: number; signals: { name: string; value: string; sentiment: string; weight: number }[] };
  topPuts: ScoredPut[];
}

async function processSymbol(
  symbol: string,
  marketRegime: ReturnType<typeof classifyMarketRegime>
): Promise<ScreenResult> {
  const [chain, quote, hv] = await Promise.all([
    getOptionsChain(symbol),
    getStockQuote(symbol),
    getHistoricalVolatility(symbol),
  ]);

  const puts = chain.options.filter((o) => o.type === "put");
  const riskFreeRate = 0.045;

  const companyStability: CompanyStability = {
    marketCap: quote.marketCap,
    beta: quote.beta,
    dividendYield: quote.dividendYield,
    fiftyTwoWeekLow: quote.fiftyTwoWeekLow,
    fiftyTwoWeekHigh: quote.fiftyTwoWeekHigh,
    currentPrice: quote.price,
    trailingPE: quote.trailingPE,
  };

  const stabilityResult = scoreCompanyStability(companyStability);

  const candidates: PutCandidate[] = puts
    .filter((p) => p.dte >= 14 && p.dte <= 75 && (p.bid > 0 || p.lastPrice > 0))
    .map((p) => {
      const effectiveBid = p.bid > 0 ? p.bid : p.lastPrice;
      const effectiveAsk = p.ask > 0 ? p.ask : p.lastPrice;
      const T = p.dte / 365;
      const q = (quote.dividendYield || 0) / 100;

      // Use Yahoo's IV when available; otherwise recover IV from market price
      let sigma = p.impliedVolatility > 0 ? p.impliedVolatility : 0;
      if (sigma <= 0) {
        const midPrice = (effectiveBid + effectiveAsk) / 2;
        if (midPrice > 0 && T > 0) {
          sigma = computeIV(midPrice, quote.price, p.strike, T, riskFreeRate, q);
        }
        if (sigma <= 0.01) sigma = 0.3;
      }

      const greeks = putGreeks({
        S: quote.price,
        K: p.strike,
        T,
        r: riskFreeRate,
        sigma,
        q,
      });

      return {
        symbol,
        stockPrice: quote.price,
        strikePrice: p.strike,
        expiration: p.expiration,
        dte: p.dte,
        bid: effectiveBid,
        ask: effectiveAsk,
        lastPrice: p.lastPrice,
        volume: p.volume,
        openInterest: p.openInterest,
        impliedVolatility: sigma * 100,
        delta: greeks.delta,
        gamma: greeks.gamma,
        theta: greeks.theta,
        vega: greeks.vega,
      };
    });

  const ivRank = hv.hvRank;
  const scored = rankPuts(candidates, ivRank, marketRegime, 5, companyStability);

  return {
    symbol,
    quote,
    ivRank,
    hv,
    stability: stabilityResult,
    topPuts: scored,
  };
}

export async function GET(request: NextRequest) {
  const symbolsParam = request.nextUrl.searchParams.get("symbols");
  const symbols = symbolsParam
    ? symbolsParam.split(",").map((s) => s.trim().toUpperCase()).filter(Boolean)
    : DEFAULT_SYMBOLS;

  const selectedSymbols = symbols.slice(0, 15);
  const startTime = Date.now();

  try {
    // VIX fetch should not crash the entire screener
    let vix = 20;
    try {
      vix = await getVIX();
    } catch (vixErr) {
      console.warn("[/api/screen] VIX fetch failed, using default:", vixErr instanceof Error ? vixErr.message : vixErr);
    }
    const marketRegime = classifyMarketRegime(vix);

    // Process symbols in small batches of 2 with NO delay between batches.
    // Each symbol makes 3 parallel Yahoo requests (quote + options + history).
    // Batch of 2 = 6 concurrent Yahoo requests, which stays under rate limits.
    // Previous approach: batch of 3 with 1s delay = wasted 5+ seconds on delays.
    const batchSize = 2;
    const results: { symbol: string; result: ScreenResult | null; error?: string }[] = [];
    let timedOut = false;

    for (let i = 0; i < selectedSymbols.length; i += batchSize) {
      // Safety: if we've used > 50s, return what we have
      if (Date.now() - startTime > 50000) {
        console.warn(`[/api/screen] Timeout guard: processed ${results.length}/${selectedSymbols.length} symbols in ${Date.now() - startTime}ms`);
        timedOut = true;
        // Mark remaining as failed
        for (let j = i; j < selectedSymbols.length; j++) {
          results.push({ symbol: selectedSymbols[j], result: null, error: "Timeout - partial results returned" });
        }
        break;
      }

      const batch = selectedSymbols.slice(i, i + batchSize);
      const batchResults = await Promise.allSettled(
        batch.map((sym) => processSymbol(sym, marketRegime))
      );

      for (let j = 0; j < batchResults.length; j++) {
        const r = batchResults[j];
        if (r.status === "fulfilled") {
          results.push({ symbol: batch[j], result: r.value });
        } else {
          const errMsg = r.reason?.message ?? "Failed";
          console.warn(`[/api/screen] ${batch[j]} failed:`, errMsg);
          results.push({ symbol: batch[j], result: null, error: errMsg });
        }
      }
    }

    const successful = results
      .filter((r) => r.result !== null && r.result.topPuts.length > 0)
      .map((r) => r.result!);

    successful.sort((a, b) => {
      const aTop = a.topPuts[0]?.score ?? 0;
      const bTop = b.topPuts[0]?.score ?? 0;
      return bTop - aTop;
    });

    // Build global Top 10 picks across all stocks
    const allScoredPuts: (ScoredPut & { stabilityScore: number; companyName: string })[] = [];
    for (const stock of successful) {
      for (const put of stock.topPuts) {
        allScoredPuts.push({
          ...put,
          stabilityScore: stock.stability.score,
          companyName: stock.quote.name,
        });
      }
    }
    allScoredPuts.sort((a, b) => b.score - a.score);
    const top10 = allScoredPuts.slice(0, 10);

    const failedSymbols = results
      .filter((r) => r.result === null)
      .map((r) => ({ symbol: r.symbol, error: r.error }));

    const elapsed = Date.now() - startTime;
    console.log(`[/api/screen] Completed: ${successful.length} successful, ${failedSymbols.length} failed, ${elapsed}ms`);

    return NextResponse.json({
      marketRegime,
      timestamp: new Date().toISOString(),
      top10,
      results: successful,
      failedSymbols,
      timedOut,
      processingTimeMs: elapsed,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Screening failed";
    const stack = error instanceof Error ? error.stack : undefined;
    console.error("[/api/screen] Error:", message, stack);
    return NextResponse.json({ error: message, processingTimeMs: Date.now() - startTime }, { status: 500 });
  }
}
