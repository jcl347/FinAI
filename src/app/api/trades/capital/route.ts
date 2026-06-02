import { NextRequest, NextResponse } from "next/server";
import { getDb, ensureSchema } from "@/lib/db";

export const dynamic = "force-dynamic";

/**
 * GET /api/trades/capital — Get capital summary
 * Returns: total deposits, total withdrawals, net capital, realized P&L, portfolio value
 */
export async function GET() {
  const db = getDb();
  if (!db) {
    return NextResponse.json({ error: "DATABASE_URL not configured" }, { status: 503 });
  }

  try {
    await ensureSchema();

    // Sum deposits and withdrawals
    const capitalResult = await db`
      SELECT
        COALESCE(SUM(amount) FILTER (WHERE type = 'DEPOSIT'), 0)::float AS total_deposits,
        COALESCE(SUM(amount) FILTER (WHERE type = 'WITHDRAWAL'), 0)::float AS total_withdrawals
      FROM capital_events
    `;

    // Get realized P&L from closed trades
    const pnlResult = await db`
      SELECT
        COALESCE(SUM(pnl), 0)::float AS realized_pnl,
        COALESCE(SUM(collateral) FILTER (WHERE status = 'OPEN'), 0)::float AS capital_deployed,
        COALESCE(SUM(premium_received * COALESCE(quantity, 1) * COALESCE(contract_size, 100)) FILTER (WHERE status = 'OPEN'), 0)::float AS unrealized_premium
      FROM simulated_trades
    `;

    // Get event history
    const events = await db`
      SELECT * FROM capital_events ORDER BY created_at DESC
    `;

    const deposits = capitalResult[0].total_deposits;
    const withdrawals = capitalResult[0].total_withdrawals;
    const netCapital = deposits - withdrawals;
    const realizedPnl = pnlResult[0].realized_pnl;
    const capitalDeployed = pnlResult[0].capital_deployed;
    const unrealizedPremium = pnlResult[0].unrealized_premium;

    // Portfolio value = net capital deposited + realized P&L
    // Capital available = portfolio value - capital deployed in open positions
    const portfolioValue = netCapital + realizedPnl;
    const availableCapital = portfolioValue - capitalDeployed;

    return NextResponse.json({
      totalDeposits: deposits,
      totalWithdrawals: withdrawals,
      netCapital,
      realizedPnl,
      portfolioValue,
      capitalDeployed,
      availableCapital,
      unrealizedPremium,
      returnOnCapital: netCapital > 0 ? (realizedPnl / netCapital) * 100 : 0,
      events,
    });
  } catch (err) {
    console.error("[capital] GET error:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to fetch capital data" },
      { status: 500 }
    );
  }
}

/**
 * POST /api/trades/capital — Add a deposit or withdrawal
 * Body: { type: "DEPOSIT" | "WITHDRAWAL", amount: number, notes?: string }
 */
export async function POST(request: NextRequest) {
  const db = getDb();
  if (!db) {
    return NextResponse.json({ error: "DATABASE_URL not configured" }, { status: 503 });
  }

  try {
    await ensureSchema();
    const body = await request.json();
    const { type, amount, notes } = body;

    if (!type || !amount || !["DEPOSIT", "WITHDRAWAL"].includes(type)) {
      return NextResponse.json(
        { error: "Required: type (DEPOSIT|WITHDRAWAL), amount (number)" },
        { status: 400 }
      );
    }

    if (amount <= 0) {
      return NextResponse.json({ error: "Amount must be positive" }, { status: 400 });
    }

    const rows = await db`
      INSERT INTO capital_events (type, amount, notes)
      VALUES (${type}, ${amount}, ${notes ?? null})
      RETURNING *
    `;

    return NextResponse.json({ event: rows[0] }, { status: 201 });
  } catch (err) {
    console.error("[capital] POST error:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to add capital event" },
      { status: 500 }
    );
  }
}
