import { NextRequest, NextResponse } from "next/server";
import { loadAlignedUniverse } from "@/lib/quant-data";
import { runDay } from "@/lib/daily/engine";
import { getQuantBook, initQuantBook, persistDailyRun, hasRunFor } from "@/lib/quant-db";

export const dynamic = "force-dynamic";
export const maxDuration = 300; // fetching ~165 symbols + 8 sleeve backtests each rebalance — needs Vercel Pro (Hobby caps at 60s; reduce the universe if on Hobby)

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
    const { data, loaded, failed } = await loadAlignedUniverse();
    const latestDate = data.calendar[data.calendar.length - 1];

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
