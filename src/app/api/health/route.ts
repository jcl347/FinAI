import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

/**
 * Health check endpoint that tests yahoo-finance2 connectivity.
 * Hit /api/health to see exactly what's working and what's not.
 */
export async function GET() {
  const checks: Record<string, unknown> = {
    timestamp: new Date().toISOString(),
    node_version: process.version,
  };

  // 1. Check if yahoo-finance2 can be imported
  try {
    /* eslint-disable @typescript-eslint/no-explicit-any */
    const mod = await import("yahoo-finance2");
    checks.yf2_import = "ok";
    checks.yf2_type = typeof mod.default;
    checks.yf2_keys = Object.keys(mod).slice(0, 5);

    // 2. Check if constructor works
    let yf: any;
    try {
      yf = new (mod.default as any)({ suppressNotices: ["yahooSurvey"] });
      checks.yf2_constructor = "ok";
    } catch (e1: any) {
      checks.yf2_constructor_error = e1.message;
      // Try fallback
      try {
        const Ctor = (mod as any)?.default?.default ?? mod.default;
        yf = new Ctor({ suppressNotices: ["yahooSurvey"] });
        checks.yf2_constructor_fallback = "ok";
      } catch (e2: any) {
        checks.yf2_constructor_fallback_error = e2.message;
      }
    }

    // 3. Check if quote works
    if (yf) {
      try {
        const vix = await yf.quote("^VIX");
        checks.yf2_vix_quote = vix?.regularMarketPrice ?? "null";
        checks.yf2_api = "ok";
      } catch (e: any) {
        checks.yf2_api_error = e.message;
      }
    }
  } catch (e: any) {
    checks.yf2_import_error = e.message;
    checks.yf2_import_stack = e.stack?.split("\n").slice(0, 3);
  }

  const allOk =
    checks.yf2_import === "ok" &&
    (checks.yf2_constructor === "ok" || checks.yf2_constructor_fallback === "ok") &&
    checks.yf2_api === "ok";

  return NextResponse.json(
    { status: allOk ? "healthy" : "unhealthy", checks },
    { status: allOk ? 200 : 503 }
  );
}
