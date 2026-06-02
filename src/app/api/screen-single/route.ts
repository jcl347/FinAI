import { NextRequest, NextResponse } from "next/server";
import {
  getOptionsChain,
  getStockQuote,
  getHistoricalVolatility,
  getVIX,
  getStockContext,
} from "@/lib/yahoo-finance";
import { putGreeks } from "@/lib/black-scholes";
import {
  type PutCandidate,
  type CompanyStability,
  rankPuts,
  classifyMarketRegime,
  scoreCompanyStability,
} from "@/lib/scoring";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

/**
 * Lightweight single-stock screener endpoint.
 * Called by the frontend for each stock individually during screening.
 * Fetches up to 3 expirations in the 14-75 DTE window for full coverage.
 *
 * Query params:
 *   symbol: stock ticker (required)
 *   vix: pre-fetched VIX value (optional, avoids redundant VIX fetches)
 */
export async function GET(request: NextRequest) {
  const symbol = request.nextUrl.searchParams.get("symbol");
  if (!symbol) {
    return NextResponse.json({ error: "Symbol is required" }, { status: 400 });
  }

  const upperSymbol = symbol.toUpperCase();
  if (!/^[A-Z]{1,5}(\.[A-Z]{1,2})?$/.test(upperSymbol)) {
    return NextResponse.json({ error: "Invalid symbol format" }, { status: 400 });
  }

  // Use pre-fetched VIX if provided (avoids N redundant VIX fetches during screening)
  const vixParam = request.nextUrl.searchParams.get("vix");
  const preVix = vixParam ? parseFloat(vixParam) : null;

  // DTE range from query params (defaults: 14-75)
  const minDteParam = request.nextUrl.searchParams.get("minDte");
  const maxDteParam = request.nextUrl.searchParams.get("maxDte");
  const minDte = minDteParam ? Math.max(1, parseInt(minDteParam, 10)) : 14;
  const maxDte = maxDteParam ? Math.min(365, parseInt(maxDteParam, 10)) : 75;
  const fetchMinDte = Math.max(1, minDte - 7);
  const fetchMaxDte = maxDte + 15;

  try {
    // Fetch quote, options, HV, and VIX (if not provided) in parallel
    const promises: [
      Promise<Awaited<ReturnType<typeof getStockQuote>>>,
      Promise<Awaited<ReturnType<typeof getOptionsChain>>>,
      Promise<Awaited<ReturnType<typeof getHistoricalVolatility>>>,
      Promise<number>,
    ] = [
      getStockQuote(upperSymbol),
      getOptionsChain(upperSymbol),
      getHistoricalVolatility(upperSymbol),
      preVix != null && !isNaN(preVix)
        ? Promise.resolve(preVix)
        : getVIX().catch(() => 20),
    ];

    const [quote, initialChain, hv, vix] = await Promise.all(promises);
    const marketRegime = classifyMarketRegime(vix);

    // Fetch stock context (earnings, trend, support/resistance) in parallel
    // This is non-blocking — if it fails, we proceed without it
    let stockContext = null;
    try {
      stockContext = await getStockContext(upperSymbol, quote.price);
    } catch {
      // Non-critical — proceed without context
    }

    // Fetch additional expirations in the requested DTE window
    // The initial chain only returns the nearest expiration which may be outside the range
    const now = new Date();
    const relevantExpirations = initialChain.expirationDates.filter((d) => {
      const dte = Math.ceil(
        (new Date(d).getTime() - now.getTime()) / (1000 * 60 * 60 * 24)
      );
      return dte >= fetchMinDte && dte <= fetchMaxDte;
    });

    // Fetch additional expirations to cover the full 1-120d DTE range
    const maxExpirations = 8;
    const expirationsToFetch = relevantExpirations.slice(0, maxExpirations);
    const additionalChains = await Promise.allSettled(
      expirationsToFetch.map((exp) => getOptionsChain(upperSymbol, exp))
    );

    const allChains = [initialChain];
    for (const result of additionalChains) {
      if (result.status === "fulfilled") {
        allChains.push(result.value);
      }
    }

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

    // Deduplicate and build candidates from all expirations
    // Use lastPrice as fallback when bid is 0 (markets closed / after hours)
    const seen = new Set<string>();
    const candidates: PutCandidate[] = [];

    for (const chain of allChains) {
      const puts = chain.options.filter((o) => o.type === "put");
      for (const p of puts) {
        const key = `${p.strike}-${p.expiration}`;
        if (seen.has(key)) continue;
        seen.add(key);

        if (p.dte < minDte || p.dte > maxDte || (p.bid <= 0 && p.lastPrice <= 0)) continue;

        const effectiveBid = p.bid > 0 ? p.bid : p.lastPrice;
        const effectiveAsk = p.ask > 0 ? p.ask : p.lastPrice;
        const T = p.dte / 365;
        const greeks = putGreeks({
          S: quote.price,
          K: p.strike,
          T,
          r: riskFreeRate,
          sigma: p.impliedVolatility > 0 ? p.impliedVolatility : 0.3,
          q: (quote.dividendYield || 0) / 100,
        });

        candidates.push({
          symbol: upperSymbol,
          stockPrice: quote.price,
          strikePrice: p.strike,
          expiration: p.expiration,
          dte: p.dte,
          bid: effectiveBid,
          ask: effectiveAsk,
          lastPrice: p.lastPrice,
          volume: p.volume,
          openInterest: p.openInterest,
          impliedVolatility: p.impliedVolatility > 0 ? p.impliedVolatility * 100 : 30,
          delta: greeks.delta,
          gamma: greeks.gamma,
          theta: greeks.theta,
          vega: greeks.vega,
        });
      }
    }

    const ivRank = hv.hvRank;
    const scored = rankPuts(candidates, ivRank, marketRegime, 20, companyStability);

    return NextResponse.json({
      symbol: upperSymbol,
      quote,
      ivRank,
      hv,
      stability: stabilityResult,
      topPuts: scored,
      marketRegime,
      vix,
      context: stockContext,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Analysis failed";
    console.error(`[/api/screen-single] ${upperSymbol} error:`, message);
    return NextResponse.json({ error: message, symbol: upperSymbol }, { status: 500 });
  }
}
