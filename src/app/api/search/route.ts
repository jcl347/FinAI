import { NextRequest, NextResponse } from "next/server";
import { searchSymbols } from "@/lib/yahoo-finance";

export const dynamic = "force-dynamic";
export const maxDuration = 10;

export async function GET(request: NextRequest) {
  const query = request.nextUrl.searchParams.get("q");

  if (!query || query.length < 1) {
    return NextResponse.json({ results: [] });
  }

  try {
    const results = await searchSymbols(query);
    return NextResponse.json({ results });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Search failed";
    const stack = error instanceof Error ? error.stack : undefined;
    console.error("[/api/search] Error:", message, stack);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
