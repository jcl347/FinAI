import { NextRequest, NextResponse } from "next/server";
import {
  getOptionsChain,
  getStockQuote,
  getHistoricalVolatility,
  getVIX,
  getStockContext,
} from "@/lib/yahoo-finance";
import { putGreeks, impliedVolatility as computeIV } from "@/lib/black-scholes";
import {
  type PutCandidate,
  type CompanyStability,
  rankPuts,
  classifyMarketRegime,
  scoreCompanyStability,
} from "@/lib/scoring";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

export async function GET(request: NextRequest) {
  const symbol = request.nextUrl.searchParams.get("symbol");
  if (!symbol) {
    return NextResponse.json({ error: "Symbol is required" }, { status: 400 });
  }

  const upperSymbol = symbol.toUpperCase();

  if (!/^[A-Z]{1,5}(\.[A-Z]{1,2})?$/.test(upperSymbol)) {
    return NextResponse.json({ error: "Invalid symbol format" }, { status: 400 });
  }

  // DTE range from query params (defaults: 14-75 for fetching, 7-90 for filtering)
  const minDteParam = request.nextUrl.searchParams.get("minDte");
  const maxDteParam = request.nextUrl.searchParams.get("maxDte");
  const minDte = minDteParam ? Math.max(1, parseInt(minDteParam, 10)) : 14;
  const maxDte = maxDteParam ? Math.min(365, parseInt(maxDteParam, 10)) : 75;
  // Widen the fetch window slightly to ensure edge candidates aren't missed
  const fetchMinDte = Math.max(1, minDte - 7);
  const fetchMaxDte = maxDte + 15;

  try {
    const [quoteResult, hvResult, vixResult] = await Promise.allSettled([
      getStockQuote(upperSymbol),
      getHistoricalVolatility(upperSymbol),
      getVIX(),
    ]);

    if (quoteResult.status === "rejected") {
      throw new Error(`Failed to fetch quote for ${upperSymbol}: ${quoteResult.reason?.message ?? quoteResult.reason}`);
    }
    if (hvResult.status === "rejected") {
      throw new Error(`Failed to fetch historical data for ${upperSymbol}: ${hvResult.reason?.message ?? hvResult.reason}`);
    }

    const quote = quoteResult.value;
    const hv = hvResult.value;
    const vix = vixResult.status === "fulfilled" ? vixResult.value : 20;
    const marketRegime = classifyMarketRegime(vix);

    // Build company stability profile
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

    // Fetch stock context and initial options chain in parallel
    const [contextResult, initialChain] = await Promise.all([
      getStockContext(upperSymbol, quote.price).catch(() => null),
      getOptionsChain(upperSymbol),
    ]);
    const stockContext = contextResult;

    // Fetch chains for expirations in the requested DTE window
    const now = new Date();
    const relevantExpirations = initialChain.expirationDates.filter((d) => {
      const dte = Math.ceil(
        (new Date(d).getTime() - now.getTime()) / (1000 * 60 * 60 * 24)
      );
      return dte >= fetchMinDte && dte <= fetchMaxDte;
    });

    // Fetch more expirations to cover the full 1-120d DTE range
    const maxExpirations = 10;
    const expirationsToFetch = relevantExpirations.slice(0, maxExpirations);

    const chainResults = await Promise.allSettled(
      expirationsToFetch.map((exp) => getOptionsChain(upperSymbol, exp))
    );

    const allPuts: PutCandidate[] = [];
    const riskFreeRate = 0.045;

    const allChains = [initialChain];
    for (const result of chainResults) {
      if (result.status === "fulfilled") {
        allChains.push(result.value);
      }
    }

    const seen = new Set<string>();

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
        const q = (quote.dividendYield || 0) / 100;

        // Use Yahoo's IV when available; otherwise recover IV from market price
        // This prevents ~50% delta errors from a blind 30% fallback
        let sigma = p.impliedVolatility > 0 ? p.impliedVolatility : 0;
        if (sigma <= 0) {
          const midPrice = (effectiveBid + effectiveAsk) / 2;
          if (midPrice > 0 && T > 0) {
            sigma = computeIV(midPrice, quote.price, p.strike, T, riskFreeRate, q);
          }
          if (sigma <= 0.01) sigma = 0.3; // last resort fallback
        }

        const greeks = putGreeks({
          S: quote.price,
          K: p.strike,
          T,
          r: riskFreeRate,
          sigma,
          q,
        });

        allPuts.push({
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
          impliedVolatility: sigma * 100,
          delta: greeks.delta,
          gamma: greeks.gamma,
          theta: greeks.theta,
          vega: greeks.vega,
        });
      }
    }

    const scored = rankPuts(allPuts, hv.hvRank, marketRegime, 50, companyStability);

    // Group by expiration for the UI
    const byExpiration: Record<string, typeof scored> = {};
    for (const s of scored) {
      if (!byExpiration[s.expiration]) byExpiration[s.expiration] = [];
      byExpiration[s.expiration].push(s);
    }

    return NextResponse.json({
      symbol: upperSymbol,
      quote,
      historicalVolatility: hv,
      marketRegime,
      stability: stabilityResult,
      context: stockContext,
      expirationDates: initialChain.expirationDates,
      scoredPuts: scored,
      putsByExpiration: byExpiration,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Analysis failed";
    const stack = error instanceof Error ? error.stack : undefined;
    console.error("[/api/analyze] Error:", message, stack);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
