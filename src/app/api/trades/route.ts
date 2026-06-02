import { NextRequest, NextResponse } from "next/server";
import { getDb, ensureSchema } from "@/lib/db";

export const dynamic = "force-dynamic";

/**
 * GET /api/trades — List all simulated trades
 * Query params: status=OPEN|CLOSED_PROFIT|CLOSED_LOSS|ASSIGNED|EXPIRED|all (default: all)
 */
export async function GET(request: NextRequest) {
  const db = getDb();
  if (!db) {
    return NextResponse.json({ error: "DATABASE_URL not configured" }, { status: 503 });
  }

  try {
    await ensureSchema();
    const status = request.nextUrl.searchParams.get("status");

    let rows;
    if (status && status !== "all") {
      rows = await db`
        SELECT * FROM simulated_trades
        WHERE status = ${status}
        ORDER BY created_at DESC
      `;
    } else {
      rows = await db`
        SELECT * FROM simulated_trades
        ORDER BY created_at DESC
      `;
    }

    return NextResponse.json({ trades: rows });
  } catch (err) {
    console.error("[trades] GET error:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to fetch trades" },
      { status: 500 }
    );
  }
}

/**
 * POST /api/trades — Create a new simulated trade
 *
 * Tastytrade management fields are auto-calculated:
 *   profit_target_price = 50% of premium (close at 50% profit)
 *   stop_loss_price = 3x premium (stop at 2x credit = 3x the premium to buy back)
 *   management_date = expiration - 21 DTE (roll/close evaluation date)
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
      symbol,
      companyName,
      strikePrice,
      expiration,
      dteAtEntry,
      premiumReceived,
      stockPriceAtEntry,
      deltaAtEntry,
      scoreAtEntry,
      stabilityScoreAtEntry,
      ivRankAtEntry,
      vixAtEntry,
      marketRegimeAtEntry,
      quantity,
      contractSize,
      notes,
    } = body;

    if (!symbol || !strikePrice || !expiration || !premiumReceived || !stockPriceAtEntry) {
      return NextResponse.json(
        { error: "Missing required fields: symbol, strikePrice, expiration, premiumReceived, stockPriceAtEntry" },
        { status: 400 }
      );
    }

    const qty = quantity ?? 1;
    const cSize = contractSize ?? 100;
    const collateral = strikePrice * cSize * qty;
    const totalPremium = premiumReceived * cSize * qty;

    // Management targets (research-backed defaults)
    // Profit target: 50% of premium (strongly validated by tastytrade, DataDrivenOptions).
    //   25% also viable for faster capital turnover (tastytrade Sept 2018 study).
    // Stop loss: buy back at 3x premium = 2x credit loss.
    //   This is a tastytrade starting guideline, NOT an ironclad rule.
    //   SJ Options 11-year backtest showed mixed results; some studies suggest wider stops
    //   (3-4x) or pure mechanical 21 DTE management outperforms fixed stops.
    // Management date: 21 DTE — most universally validated rule across all sources.
    //   Gamma risk accelerates near expiration; rolling at 21 DTE reduces this exposure.
    const profitTargetPrice = premiumReceived * 0.5;
    const stopLossPrice = premiumReceived * 3;
    // Management date: 21 DTE before expiration
    const expDate = new Date(expiration);
    const mgmtDate = new Date(expDate);
    mgmtDate.setDate(mgmtDate.getDate() - 21);
    const managementDate = mgmtDate.toISOString().split("T")[0];

    const rows = await db`
      INSERT INTO simulated_trades (
        symbol, company_name, strike_price, expiration, dte_at_entry,
        premium_received, stock_price_at_entry, delta_at_entry,
        score_at_entry, stability_score_at_entry, iv_rank_at_entry,
        collateral, quantity, contract_size, total_premium,
        profit_target_price, stop_loss_price,
        management_date, vix_at_entry, market_regime_at_entry, notes
      ) VALUES (
        ${symbol}, ${companyName ?? null}, ${strikePrice}, ${expiration}, ${dteAtEntry ?? 0},
        ${premiumReceived}, ${stockPriceAtEntry}, ${deltaAtEntry ?? null},
        ${scoreAtEntry ?? null}, ${stabilityScoreAtEntry ?? null}, ${ivRankAtEntry ?? null},
        ${collateral}, ${qty}, ${cSize}, ${totalPremium},
        ${profitTargetPrice}, ${stopLossPrice},
        ${managementDate}, ${vixAtEntry ?? null}, ${marketRegimeAtEntry ?? null},
        ${notes ?? null}
      )
      RETURNING *
    `;

    return NextResponse.json({ trade: rows[0] }, { status: 201 });
  } catch (err) {
    console.error("[trades] POST error:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to create trade" },
      { status: 500 }
    );
  }
}
