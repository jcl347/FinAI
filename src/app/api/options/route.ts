import { NextRequest, NextResponse } from "next/server";
import { getOptionsChain, getStockQuote, getVIX } from "@/lib/yahoo-finance";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const symbol = request.nextUrl.searchParams.get("symbol");
  const expiration = request.nextUrl.searchParams.get("expiration");

  if (!symbol) {
    return NextResponse.json({ error: "Symbol is required" }, { status: 400 });
  }

  // Validate symbol format
  if (!/^[A-Z]{1,5}(\.[A-Z]{1,2})?$/.test(symbol.toUpperCase())) {
    return NextResponse.json({ error: "Invalid symbol format" }, { status: 400 });
  }

  try {
    const [chain, quote, vix] = await Promise.all([
      getOptionsChain(symbol.toUpperCase(), expiration ?? undefined),
      getStockQuote(symbol.toUpperCase()),
      getVIX(),
    ]);

    return NextResponse.json({
      quote,
      chain,
      vix,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to fetch options data";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
