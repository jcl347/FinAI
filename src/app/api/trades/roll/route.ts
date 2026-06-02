import { NextRequest, NextResponse } from "next/server";
import { getDb, ensureSchema } from "@/lib/db";

export const dynamic = "force-dynamic";

/**
 * POST /api/trades/roll — Roll an existing trade (tastytrade management action)
 *
 * Rolling = close current position + open new position at a different strike/expiration.
 * This endpoint closes the old trade as ROLLED and creates a new OPEN trade.
 *
 * Tastytrade roll types:
 *   - Roll Out: Same strike, later expiration (collect more premium via time)
 *   - Roll Down: Lower strike, same or later expiration (reduce risk)
 *   - Roll Down & Out: Lower strike + later expiration (most defensive)
 *
 * Key tastytrade principle: Only roll for a NET CREDIT (new premium > buyback cost).
 *
 * Body fields:
 *   tradeId: number — ID of the trade to roll
 *   closePrice: number — price to buy back current put
 *   newStrikePrice: number — strike of the new put
 *   newExpiration: string — expiration date of the new put (YYYY-MM-DD)
 *   newPremium: number — premium received for the new put (per share)
 *   newDte: number — DTE of the new position
 *   newDelta?: number — delta of the new position
 *   stockPriceAtRoll: number — current stock price
 *   rollType: "OUT" | "DOWN" | "DOWN_AND_OUT"
 *   notes?: string
 */
export async function POST(request: NextRequest) {
  const db = getDb();
  if (!db) {
    return NextResponse.json({ error: "DATABASE_URL not configured" }, { status: 503 });
  }

  try {
    await ensureSchema();
    const body = await request.json();

    const {
      tradeId,
      closePrice,
      newStrikePrice,
      newExpiration,
      newPremium,
      newDte,
      newDelta,
      stockPriceAtRoll,
      rollType,
      notes,
    } = body;

    if (!tradeId || closePrice == null || !newStrikePrice || !newExpiration || !newPremium || !stockPriceAtRoll) {
      return NextResponse.json(
        { error: "Required: tradeId, closePrice, newStrikePrice, newExpiration, newPremium, stockPriceAtRoll" },
        { status: 400 }
      );
    }

    // Fetch existing trade
    const existing = await db`SELECT * FROM simulated_trades WHERE id = ${tradeId} AND status = 'OPEN'`;
    if (existing.length === 0) {
      return NextResponse.json({ error: "Open trade not found" }, { status: 404 });
    }

    const oldTrade = existing[0];
    const premiumReceived = Number(oldTrade.premium_received);
    const cSize = Number(oldTrade.contract_size) || 100;
    const qty = Number(oldTrade.quantity) || 1;
    const collateral = Number(oldTrade.collateral);

    // Calculate P&L on the closed leg
    const closePnl = (premiumReceived - closePrice) * cSize * qty;
    const pnlPercent = collateral > 0 ? (closePnl / collateral) * 100 : 0;

    // Net credit check (informational — we still allow net debit rolls)
    const netCredit = newPremium - closePrice;
    const isNetCredit = netCredit > 0;

    // Close the old trade as ROLLED
    const rollNote = `Rolled ${rollType ?? "OUT"} to $${newStrikePrice} ${newExpiration}${isNetCredit ? ` (net credit $${netCredit.toFixed(2)})` : ` (net debit $${Math.abs(netCredit).toFixed(2)})`}${notes ? ` — ${notes}` : ""}`;

    await db`
      UPDATE simulated_trades SET
        status = 'ROLLED',
        close_price = ${closePrice},
        stock_price_at_close = ${stockPriceAtRoll},
        pnl = ${closePnl},
        pnl_percent = ${pnlPercent},
        closed_at = NOW(),
        notes = ${rollNote},
        updated_at = NOW()
      WHERE id = ${tradeId}
    `;

    // Create the new rolled position
    const newCollateral = newStrikePrice * cSize * qty;
    const totalPremium = newPremium * cSize * qty;

    // Management targets for new position
    const profitTargetPrice = newPremium * 0.5;
    const stopLossPrice = newPremium * 3;
    const expDate = new Date(newExpiration);
    const mgmtDate = new Date(expDate);
    mgmtDate.setDate(mgmtDate.getDate() - 21);
    const managementDate = mgmtDate.toISOString().split("T")[0];

    const newRows = await db`
      INSERT INTO simulated_trades (
        symbol, company_name, strike_price, expiration, dte_at_entry,
        premium_received, stock_price_at_entry, delta_at_entry,
        score_at_entry, stability_score_at_entry, iv_rank_at_entry,
        collateral, quantity, contract_size, total_premium,
        profit_target_price, stop_loss_price, management_date,
        vix_at_entry, market_regime_at_entry, notes
      ) VALUES (
        ${oldTrade.symbol}, ${oldTrade.company_name}, ${newStrikePrice}, ${newExpiration}, ${newDte ?? 0},
        ${newPremium}, ${stockPriceAtRoll}, ${newDelta ?? null},
        ${oldTrade.score_at_entry}, ${oldTrade.stability_score_at_entry}, ${oldTrade.iv_rank_at_entry},
        ${newCollateral}, ${qty}, ${cSize}, ${totalPremium},
        ${profitTargetPrice}, ${stopLossPrice}, ${managementDate},
        ${oldTrade.vix_at_entry}, ${oldTrade.market_regime_at_entry},
        ${`Rolled from $${Number(oldTrade.strike_price).toFixed(0)} ${oldTrade.expiration} (${rollType ?? "OUT"})${notes ? ` — ${notes}` : ""}`}
      )
      RETURNING *
    `;

    return NextResponse.json({
      closedTrade: { id: tradeId, pnl: closePnl, status: "ROLLED" },
      newTrade: newRows[0],
      netCredit: isNetCredit,
      netCreditAmount: netCredit,
    }, { status: 201 });
  } catch (err) {
    console.error("[trades/roll] POST error:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to roll trade" },
      { status: 500 }
    );
  }
}
