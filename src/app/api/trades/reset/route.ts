import { NextResponse } from "next/server";
import { getDb, ensureSchema } from "@/lib/db";

export const dynamic = "force-dynamic";

/**
 * DELETE /api/trades/reset — Delete ALL trades and capital events (factory reset)
 */
export async function DELETE() {
  const db = getDb();
  if (!db) {
    return NextResponse.json({ error: "DATABASE_URL not configured" }, { status: 503 });
  }

  try {
    await ensureSchema();

    const tradeResult = await db`DELETE FROM simulated_trades RETURNING id`;
    const capitalResult = await db`DELETE FROM capital_events RETURNING id`;

    return NextResponse.json({
      deleted: true,
      tradesDeleted: tradeResult.length,
      capitalEventsDeleted: capitalResult.length,
    });
  } catch (err) {
    console.error("[trades/reset] error:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to reset data" },
      { status: 500 }
    );
  }
}
