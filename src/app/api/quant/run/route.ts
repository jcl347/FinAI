import { NextRequest, NextResponse } from "next/server";
import { loadAlignedUniverse } from "@/lib/quant-data";
import { runDay } from "@/lib/daily/engine";
import { getQuantBook, initQuantBook, persistDailyRun, hasRunFor } from "@/lib/quant-db";

export const dynamic = "force-dynamic";
// Fetches the lean PRODUCTION_UNIVERSE (~470: 432 equities + the ETF classes the sleeves trade +
// ^VIX/^VIX9D/DX-Y.NYB) at concurrency 10, then runs 12 sleeve backtests on a rebalance day. Needs
// Vercel Pro (Hobby caps at 60s; trim EQUITY_UNIVERSE or raise minTradeFraction if on Hobby).
export const maxDuration = 300;

/**
 * Daily automated run — the Vercel Cron target.
 *
 *   - GET/POST /api/quant/run            → run for the latest trading day (idempotent)
 *   - GET/POST /api/quant/run?force=1    → re-run even if today already recorded
 *
 * Security: if CRON_SECRET is set, requires `Authorization: Bearer <CRON_SECRET>`
 * (Vercel Cron sends exactly this header). Open in local dev when no secret is configured.
 */
async function handle(request: NextRequest) {
  // Auth (Vercel Cron sends Authorization: Bearer <CRON_SECRET>).
  const secret = process.env.CRON_SECRET;
  if (secret) {
    const auth = request.headers.get("authorization");
    const qs = request.nextUrl.searchParams.get("secret");
    if (auth !== `Bearer ${secret}` && qs !== secret) {
      return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    }
  }

  const book0 = await getQuantBook();
  if (book0 === null) {
    // DB unconfigured → 503; otherwise initialize a fresh book.
    const initialized = await initQuantBook(Number(process.env.QUANT_INITIAL_CAPITAL ?? 100000));
    if (!initialized) {
      return NextResponse.json({ error: "DATABASE_URL not configured" }, { status: 503 });
    }
  }

  const force = request.nextUrl.searchParams.get("force") === "1";

  try {
    const { data, loaded, failed, equityCoverage } = await loadAlignedUniverse();
    const latestDate = data.calendar[data.calendar.length - 1];

    // Coverage guard: if too many symbols failed to load, the liquidity screen would re-rank a
    // degraded pool and trade a different book than was validated. HOLD instead (skip the rebalance).
    if (equityCoverage < 0.7) {
      return NextResponse.json({
        status: "degraded-hold",
        date: latestDate,
        equityCoverage: Math.round(equityCoverage * 1000) / 10,
        loaded,
        failed: failed.length,
        message: `Only ${(equityCoverage * 100).toFixed(0)}% of the universe loaded — holding (no trades) to avoid trading a degraded pool.`,
      });
    }

    if (!force && (await hasRunFor(latestDate))) {
      return NextResponse.json({
        status: "already-ran",
        date: latestDate,
        message: `Daily run for ${latestDate} already recorded. Use ?force=1 to re-run.`,
      });
    }

    const book = (await getQuantBook())!;
    const res = runDay(data, book);
    await persistDailyRun(res);

    return NextResponse.json({
      status: "ok",
      date: res.date,
      regime: res.regime.regime,
      rebalanced: res.trades.length > 0 || res.decision !== null,
      equity: res.equityAfter,
      deployedPct: res.deployedPct,
      volScale: res.volScale,
      trades: res.trades.length,
      tradeDetail: res.trades,
      allocations: res.decision?.detail.filter((d) => d.weight > 0 || d.benched) ?? [],
      opportunities: res.opportunities.slice(0, 20),
      dataLoaded: loaded,
      dataFailed: failed,
      notes: res.notes,
    });
  } catch (err) {
    console.error("[quant/run] error:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "daily run failed" },
      { status: 500 }
    );
  }
}

export async function GET(request: NextRequest) {
  return handle(request);
}
export async function POST(request: NextRequest) {
  return handle(request);
}
