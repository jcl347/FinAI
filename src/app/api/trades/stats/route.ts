import { NextResponse } from "next/server";
import { getDb, ensureSchema } from "@/lib/db";

export const dynamic = "force-dynamic";

/**
 * GET /api/trades/stats — Aggregate statistics for simulated trades
 * Includes tastytrade-aligned metrics: profit factor, avg holding period, max drawdown
 */
export async function GET() {
  const db = getDb();
  if (!db) {
    return NextResponse.json({ error: "DATABASE_URL not configured" }, { status: 503 });
  }

  try {
    await ensureSchema();

    // Overall stats
    const overall = await db`
      SELECT
        COUNT(*)::int AS total_trades,
        COUNT(*) FILTER (WHERE status = 'OPEN')::int AS open_trades,
        COUNT(*) FILTER (WHERE status != 'OPEN')::int AS closed_trades,
        COUNT(*) FILTER (WHERE pnl > 0)::int AS winning_trades,
        COUNT(*) FILTER (WHERE pnl <= 0 AND status != 'OPEN')::int AS losing_trades,
        COALESCE(SUM(pnl) FILTER (WHERE status != 'OPEN'), 0)::float AS total_pnl,
        COALESCE(AVG(pnl) FILTER (WHERE status != 'OPEN'), 0)::float AS avg_pnl,
        COALESCE(AVG(pnl_percent) FILTER (WHERE status != 'OPEN'), 0)::float AS avg_pnl_percent,
        COALESCE(MAX(pnl), 0)::float AS best_trade_pnl,
        COALESCE(MIN(pnl) FILTER (WHERE status != 'OPEN'), 0)::float AS worst_trade_pnl,
        COALESCE(SUM(collateral) FILTER (WHERE status = 'OPEN'), 0)::float AS total_capital_at_risk,
        COALESCE(AVG(score_at_entry) FILTER (WHERE status != 'OPEN' AND pnl > 0), 0)::float AS avg_winning_score,
        COALESCE(AVG(score_at_entry) FILTER (WHERE status != 'OPEN' AND pnl <= 0), 0)::float AS avg_losing_score,
        COALESCE(SUM(pnl) FILTER (WHERE pnl > 0 AND status != 'OPEN'), 0)::float AS gross_wins,
        COALESCE(ABS(SUM(pnl) FILTER (WHERE pnl < 0 AND status != 'OPEN')), 0)::float AS gross_losses,
        COALESCE(AVG(EXTRACT(DAY FROM (closed_at - created_at))) FILTER (WHERE status != 'OPEN'), 0)::float AS avg_holding_days,
        COALESCE(AVG(EXTRACT(DAY FROM (closed_at - created_at))) FILTER (WHERE pnl > 0 AND status != 'OPEN'), 0)::float AS avg_win_holding_days,
        COALESCE(AVG(EXTRACT(DAY FROM (closed_at - created_at))) FILTER (WHERE pnl <= 0 AND status != 'OPEN'), 0)::float AS avg_loss_holding_days,
        COALESCE(SUM(COALESCE(total_premium, premium_received * COALESCE(quantity, 1) * COALESCE(contract_size, 100))), 0)::float AS total_premium_collected,
        COALESCE(SUM(COALESCE(total_premium, premium_received * COALESCE(quantity, 1) * COALESCE(contract_size, 100))) FILTER (WHERE status = 'OPEN'), 0)::float AS open_premium
      FROM simulated_trades
    `;

    // Monthly P&L for chart
    const monthlyPnl = await db`
      SELECT
        TO_CHAR(COALESCE(closed_at, created_at), 'YYYY-MM') AS month,
        SUM(pnl)::float AS pnl,
        COUNT(*)::int AS trades,
        COUNT(*) FILTER (WHERE pnl > 0)::int AS wins
      FROM simulated_trades
      WHERE status != 'OPEN'
      GROUP BY month
      ORDER BY month
    `;

    // Cumulative P&L timeline (per closed trade) — for equity curve + drawdown calc
    const pnlTimeline = await db`
      SELECT
        id,
        symbol,
        pnl::float,
        pnl_percent::float,
        closed_at,
        SUM(pnl) OVER (ORDER BY closed_at, id)::float AS cumulative_pnl
      FROM simulated_trades
      WHERE status != 'OPEN'
      ORDER BY closed_at, id
    `;

    // Per-symbol breakdown
    const bySymbol = await db`
      SELECT
        symbol,
        COUNT(*)::int AS trades,
        COUNT(*) FILTER (WHERE pnl > 0)::int AS wins,
        COALESCE(SUM(pnl), 0)::float AS total_pnl,
        COALESCE(AVG(pnl_percent), 0)::float AS avg_return
      FROM simulated_trades
      WHERE status != 'OPEN'
      GROUP BY symbol
      ORDER BY total_pnl DESC
    `;

    const stats = overall[0];
    const closedTrades = stats.closed_trades || 0;
    const winRate = closedTrades > 0 ? ((stats.winning_trades / closedTrades) * 100) : 0;

    // Profit factor = gross wins / gross losses (tastytrade key metric)
    const profitFactor = stats.gross_losses > 0 ? stats.gross_wins / stats.gross_losses : stats.gross_wins > 0 ? Infinity : 0;

    // Max drawdown from equity curve
    let maxDrawdown = 0;
    let peak = 0;
    for (const point of pnlTimeline) {
      if (point.cumulative_pnl > peak) peak = point.cumulative_pnl;
      const dd = peak - point.cumulative_pnl;
      if (dd > maxDrawdown) maxDrawdown = dd;
    }

    return NextResponse.json({
      summary: {
        ...stats,
        win_rate: winRate,
        profit_factor: profitFactor === Infinity ? 999 : profitFactor,
        max_drawdown: maxDrawdown,
        total_premium_collected: stats.total_premium_collected,
        open_premium: stats.open_premium,
      },
      monthlyPnl,
      pnlTimeline,
      bySymbol,
    });
  } catch (err) {
    console.error("[trades/stats] error:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to compute stats" },
      { status: 500 }
    );
  }
}
