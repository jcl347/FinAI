import { NextResponse } from "next/server";
import { getDb, ensureSchema } from "@/lib/db";
import { getStockQuote, getOptionsChain } from "@/lib/yahoo-finance";

export const dynamic = "force-dynamic";

/**
 * GET /api/trades/prices — Fetch live stock + option prices for all open trades
 *
 * Returns current market data so the dashboard can:
 *   1. Show current stock price and put price for each open position
 *   2. Detect when tastytrade management targets are hit:
 *      - 50% profit target: current put price <= profit_target_price
 *      - 2x stop loss: current put price >= stop_loss_price
 *      - 21 DTE: days to expiration <= 21
 *
 * Groups by symbol to minimize Yahoo Finance API calls.
 */
export async function GET() {
  const db = getDb();
  if (!db) {
    return NextResponse.json({ error: "DATABASE_URL not configured" }, { status: 503 });
  }

  try {
    await ensureSchema();

    // Get all open trades
    const openTrades = await db`
      SELECT id, symbol, strike_price, expiration, premium_received,
             profit_target_price, stop_loss_price, management_date,
             quantity, contract_size
      FROM simulated_trades
      WHERE status = 'OPEN'
      ORDER BY symbol, expiration
    `;

    if (openTrades.length === 0) {
      return NextResponse.json({ prices: {}, alerts: [] });
    }

    // Group trades by symbol to batch API calls
    const bySymbol: Record<string, typeof openTrades> = {};
    for (const trade of openTrades) {
      if (!bySymbol[trade.symbol]) bySymbol[trade.symbol] = [];
      bySymbol[trade.symbol].push(trade);
    }

    const prices: Record<number, {
      stockPrice: number;
      putBid: number | null;
      putAsk: number | null;
      putLast: number | null;
      putMid: number | null;
      unrealizedPnl: number;
      unrealizedPnlPct: number;
      profitPct: number;
    }> = {};

    interface AutoAlert {
      tradeId: number;
      symbol: string;
      type: "PROFIT_TARGET" | "STOP_LOSS" | "DTE_21" | "DTE_7" | "EXPIRING" | "ITM";
      urgency: "high" | "medium" | "low";
      message: string;
      currentPutPrice: number | null;
      stockPrice: number;
    }

    const alerts: AutoAlert[] = [];

    // Fetch prices for each symbol (max 2 concurrent to avoid rate limiting)
    const symbols = Object.keys(bySymbol);
    for (let i = 0; i < symbols.length; i += 2) {
      const batch = symbols.slice(i, i + 2);
      const results = await Promise.allSettled(
        batch.map(async (symbol) => {
          const trades = bySymbol[symbol];
          let stockPrice = 0;

          try {
            const quote = await getStockQuote(symbol);
            stockPrice = quote.price;
          } catch {
            // Stock quote failed — skip this symbol
            return;
          }

          // Get unique expirations for this symbol's trades
          const expirations = [...new Set(trades.map((t) => t.expiration))];

          // Fetch options chains for each expiration
          const chainMap: Record<string, any[]> = {};
          for (const exp of expirations) {
            try {
              const expStr = typeof exp === "string" ? exp : new Date(exp).toISOString().split("T")[0];
              const chain = await getOptionsChain(symbol, expStr);
              chainMap[expStr] = chain.options;
            } catch {
              // Chain fetch failed for this expiration
            }
          }

          // Match each trade to its option price
          for (const trade of trades) {
            const strike = Number(trade.strike_price);
            const premium = Number(trade.premium_received);
            const cSize = Number(trade.contract_size) || 100;
            const qty = Number(trade.quantity) || 1;
            const profitTarget = trade.profit_target_price ? Number(trade.profit_target_price) : null;
            const stopLoss = trade.stop_loss_price ? Number(trade.stop_loss_price) : null;

            const expStr = typeof trade.expiration === "string"
              ? trade.expiration.split("T")[0]
              : new Date(trade.expiration).toISOString().split("T")[0];

            // Find matching put in options chain
            const options = chainMap[expStr] ?? [];
            const matchingPut = options.find(
              (opt: any) => opt.type === "put" && Math.abs(opt.strike - strike) < 0.01
            );

            const putBid = matchingPut?.bid ?? null;
            const putAsk = matchingPut?.ask ?? null;
            const putLast = matchingPut?.lastPrice ?? null;
            const putMid = putBid != null && putAsk != null ? (putBid + putAsk) / 2 : putLast;

            // Calculate unrealized P&L using mid price (or last)
            const currentPutPrice = putMid ?? putLast ?? putBid ?? null;
            let unrealizedPnl = 0;
            let unrealizedPnlPct = 0;
            let profitPct = 0;

            if (currentPutPrice != null) {
              unrealizedPnl = (premium - currentPutPrice) * cSize * qty;
              const collateral = strike * cSize * qty;
              unrealizedPnlPct = collateral > 0 ? (unrealizedPnl / collateral) * 100 : 0;
              // How much of max profit is realized (0% = entry, 100% = full profit)
              profitPct = premium > 0 ? ((premium - currentPutPrice) / premium) * 100 : 0;
            }

            prices[trade.id] = {
              stockPrice,
              putBid,
              putAsk,
              putLast,
              putMid,
              unrealizedPnl,
              unrealizedPnlPct,
              profitPct,
            };

            // Calculate DTE
            const expDate = new Date(trade.expiration);
            const daysToExp = Math.ceil((expDate.getTime() - Date.now()) / 86400000);

            // --- Automated tastytrade alert detection ---

            // 50% profit target hit
            if (currentPutPrice != null && profitTarget != null && currentPutPrice <= profitTarget) {
              alerts.push({
                tradeId: trade.id,
                symbol,
                type: "PROFIT_TARGET",
                urgency: "medium",
                message: `Put price $${currentPutPrice.toFixed(2)} hit 50% profit target ($${profitTarget.toFixed(2)}) — close to lock in ${profitPct.toFixed(0)}% of max profit`,
                currentPutPrice,
                stockPrice,
              });
            }

            // 2x stop loss hit
            if (currentPutPrice != null && stopLoss != null && currentPutPrice >= stopLoss) {
              alerts.push({
                tradeId: trade.id,
                symbol,
                type: "STOP_LOSS",
                urgency: "high",
                message: `Put price $${currentPutPrice.toFixed(2)} hit 2x stop ($${stopLoss.toFixed(2)}) — loss is ${Math.abs(profitPct).toFixed(0)}% of premium`,
                currentPutPrice,
                stockPrice,
              });
            }

            // 21 DTE
            if (daysToExp <= 21 && daysToExp > 7) {
              alerts.push({
                tradeId: trade.id,
                symbol,
                type: "DTE_21",
                urgency: "medium",
                message: `${daysToExp}d to expiration — evaluate roll or close (gamma risk increasing)`,
                currentPutPrice,
                stockPrice,
              });
            }

            // 7 DTE (critical)
            if (daysToExp <= 7 && daysToExp > 3) {
              alerts.push({
                tradeId: trade.id,
                symbol,
                type: "DTE_7",
                urgency: "high",
                message: `${daysToExp}d to expiration — close immediately or prepare for assignment`,
                currentPutPrice,
                stockPrice,
              });
            }

            // Expiring (3 days or less)
            if (daysToExp <= 3 && daysToExp > 0) {
              alerts.push({
                tradeId: trade.id,
                symbol,
                type: "EXPIRING",
                urgency: "high",
                message: `Expires in ${daysToExp}d — close or let expire`,
                currentPutPrice,
                stockPrice,
              });
            }

            // ITM warning (stock below strike)
            if (stockPrice < strike) {
              const itmPct = ((strike - stockPrice) / strike * 100).toFixed(1);
              alerts.push({
                tradeId: trade.id,
                symbol,
                type: "ITM",
                urgency: "high",
                message: `Put is in-the-money (stock $${stockPrice.toFixed(2)} below $${strike.toFixed(0)} strike by ${itmPct}%) — assignment risk elevated`,
                currentPutPrice,
                stockPrice,
              });
            }
          }
        })
      );

      // Log any failures
      for (const r of results) {
        if (r.status === "rejected") {
          console.error("[trades/prices] batch error:", r.reason);
        }
      }

      // Small delay between batches to avoid rate limiting
      if (i + 2 < symbols.length) {
        await new Promise((resolve) => setTimeout(resolve, 500));
      }
    }

    // Sort alerts by urgency (high first)
    const urgencyOrder = { high: 0, medium: 1, low: 2 };
    alerts.sort((a, b) => urgencyOrder[a.urgency] - urgencyOrder[b.urgency]);

    return NextResponse.json({ prices, alerts });
  } catch (err) {
    console.error("[trades/prices] error:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to fetch live prices" },
      { status: 500 }
    );
  }
}
