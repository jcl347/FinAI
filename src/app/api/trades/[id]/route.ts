import { NextRequest, NextResponse } from "next/server";
import { getDb, ensureSchema } from "@/lib/db";

export const dynamic = "force-dynamic";

/**
 * PUT /api/trades/[id] — Close or update a simulated trade
 *
 * Body fields:
 *   status: CLOSED_PROFIT | CLOSED_LOSS | ASSIGNED | EXPIRED
 *   closePrice: price at which put was bought back (optional for EXPIRED)
 *   stockPriceAtClose: stock price when closing
 *   notes: optional notes
 */
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const db = getDb();
  if (!db) {
    return NextResponse.json({ error: "DATABASE_URL not configured" }, { status: 503 });
  }

  try {
    await ensureSchema();
    const { id } = await params;
    const body = await request.json();
    const { status, closePrice, stockPriceAtClose, notes } = body;

    // Fetch current trade
    const existing = await db`SELECT * FROM simulated_trades WHERE id = ${id}`;
    if (existing.length === 0) {
      return NextResponse.json({ error: "Trade not found" }, { status: 404 });
    }

    const trade = existing[0];
    const premiumReceived = Number(trade.premium_received);
    const collateral = Number(trade.collateral);
    const cSize = Number(trade.contract_size) || 100;
    const qty = Number(trade.quantity) || 1;

    // Calculate P&L using stored contract_size and quantity
    let pnl: number;
    if (status === "EXPIRED") {
      // Put expired worthless — keep full premium
      pnl = premiumReceived * cSize * qty;
    } else if (status === "ASSIGNED") {
      // Assigned — P&L = premium received - (strike - stock price at close) per share * contract_size
      const assignmentLoss = (Number(trade.strike_price) - (stockPriceAtClose ?? 0)) * cSize * qty;
      pnl = premiumReceived * cSize * qty - assignmentLoss;
    } else {
      // Closed — P&L = (premium received - close price) * contract_size
      pnl = (premiumReceived - (closePrice ?? 0)) * cSize * qty;
    }

    const pnlPercent = collateral > 0 ? (pnl / collateral) * 100 : 0;

    const finalStatus =
      status ?? (pnl >= 0 ? "CLOSED_PROFIT" : "CLOSED_LOSS");

    const rows = await db`
      UPDATE simulated_trades SET
        status = ${finalStatus},
        close_price = ${closePrice ?? null},
        stock_price_at_close = ${stockPriceAtClose ?? null},
        pnl = ${pnl},
        pnl_percent = ${pnlPercent},
        closed_at = NOW(),
        notes = COALESCE(${notes ?? null}, notes),
        updated_at = NOW()
      WHERE id = ${id}
      RETURNING *
    `;

    return NextResponse.json({ trade: rows[0] });
  } catch (err) {
    console.error("[trades] PUT error:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to update trade" },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/trades/[id] — Delete a simulated trade
 */
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const db = getDb();
  if (!db) {
    return NextResponse.json({ error: "DATABASE_URL not configured" }, { status: 503 });
  }

  try {
    await ensureSchema();
    const { id } = await params;

    const rows = await db`DELETE FROM simulated_trades WHERE id = ${id} RETURNING id`;
    if (rows.length === 0) {
      return NextResponse.json({ error: "Trade not found" }, { status: 404 });
    }

    return NextResponse.json({ deleted: true });
  } catch (err) {
    console.error("[trades] DELETE error:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to delete trade" },
      { status: 500 }
    );
  }
}
