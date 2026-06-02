"use client";

import { useState, useEffect, useCallback } from "react";

/* eslint-disable @typescript-eslint/no-explicit-any */

interface TradeStats {
  summary: {
    total_trades: number;
    open_trades: number;
    closed_trades: number;
    winning_trades: number;
    losing_trades: number;
    total_pnl: number;
    avg_pnl: number;
    avg_pnl_percent: number;
    best_trade_pnl: number;
    worst_trade_pnl: number;
    total_capital_at_risk: number;
    avg_winning_score: number;
    avg_losing_score: number;
    win_rate: number;
    profit_factor: number;
    max_drawdown: number;
    gross_wins: number;
    gross_losses: number;
    avg_holding_days: number;
    avg_win_holding_days: number;
    avg_loss_holding_days: number;
    total_premium_collected: number;
    open_premium: number;
  };
  monthlyPnl: { month: string; pnl: number; trades: number; wins: number }[];
  pnlTimeline: { id: number; symbol: string; pnl: number; pnl_percent: number; closed_at: string; cumulative_pnl: number }[];
  bySymbol: { symbol: string; trades: number; wins: number; total_pnl: number; avg_return: number }[];
}

interface CapitalData {
  totalDeposits: number;
  totalWithdrawals: number;
  netCapital: number;
  realizedPnl: number;
  portfolioValue: number;
  capitalDeployed: number;
  availableCapital: number;
  unrealizedPremium: number;
  returnOnCapital: number;
  events: { id: number; type: string; amount: string; notes: string | null; created_at: string }[];
}

interface Trade {
  id: number;
  symbol: string;
  company_name: string;
  strike_price: string;
  expiration: string;
  dte_at_entry: number;
  premium_received: string;
  stock_price_at_entry: string;
  delta_at_entry: string | null;
  score_at_entry: string | null;
  stability_score_at_entry: string | null;
  iv_rank_at_entry: string | null;
  collateral: string;
  status: string;
  close_price: string | null;
  stock_price_at_close: string | null;
  pnl: string | null;
  pnl_percent: string | null;
  closed_at: string | null;
  notes: string | null;
  created_at: string;
  profit_target_price: string | null;
  stop_loss_price: string | null;
  management_date: string | null;
  quantity: number | null;
  contract_size: number | null;
}

interface LivePrice {
  stockPrice: number;
  putBid: number | null;
  putAsk: number | null;
  putLast: number | null;
  putMid: number | null;
  unrealizedPnl: number;
  unrealizedPnlPct: number;
  profitPct: number;
}

interface LiveAlert {
  tradeId: number;
  symbol: string;
  type: "PROFIT_TARGET" | "STOP_LOSS" | "DTE_21" | "DTE_7" | "EXPIRING" | "ITM";
  urgency: "high" | "medium" | "low";
  message: string;
  currentPutPrice: number | null;
  stockPrice: number;
}

interface TradesDashboardProps {
  refreshKey: number;
}

// ─── SVG Mini Charts ───────────────────────────────────────────────

function WinRateDonut({ winRate, wins, losses }: { winRate: number; wins: number; losses: number }) {
  const total = wins + losses;
  if (total === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-4">
        <div className="text-gray-600 text-sm">No closed trades yet</div>
      </div>
    );
  }

  const r = 40;
  const cx = 50;
  const cy = 50;
  const circumference = 2 * Math.PI * r;
  const winArc = (winRate / 100) * circumference;
  const lossArc = circumference - winArc;

  return (
    <div className="flex flex-col items-center">
      <svg viewBox="0 0 100 100" className="w-32 h-32">
        <circle cx={cx} cy={cy} r={r} fill="none" stroke="#7f1d1d" strokeWidth={8} strokeDasharray={`${circumference}`} transform={`rotate(-90 ${cx} ${cy})`} />
        <circle cx={cx} cy={cy} r={r} fill="none" stroke="#22c55e" strokeWidth={8} strokeDasharray={`${winArc} ${lossArc}`} strokeLinecap="round" transform={`rotate(-90 ${cx} ${cy})`} />
        <text x={cx} y={cy - 4} textAnchor="middle" fill="white" fontSize={14} fontWeight="bold">{winRate.toFixed(0)}%</text>
        <text x={cx} y={cy + 10} textAnchor="middle" fill="#9ca3af" fontSize={7}>win rate</text>
      </svg>
      <div className="flex gap-4 text-xs mt-1">
        <span className="text-green-400">{wins}W</span>
        <span className="text-red-400">{losses}L</span>
      </div>
    </div>
  );
}

function CumulativePnLChart({ timeline }: { timeline: TradeStats["pnlTimeline"] }) {
  if (timeline.length === 0) return null;

  const W = 500, H = 160, PAD_L = 50, PAD_R = 10, PAD_T = 10, PAD_B = 25;
  const plotW = W - PAD_L - PAD_R, plotH = H - PAD_T - PAD_B;

  const values = [0, ...timeline.map((t) => t.cumulative_pnl)];
  const minV = Math.min(0, ...values);
  const maxV = Math.max(0, ...values);
  const range = maxV - minV || 1;

  const xScale = (i: number) => PAD_L + (i / (values.length - 1)) * plotW;
  const yScale = (v: number) => PAD_T + plotH - ((v - minV) / range) * plotH;

  const linePath = values.map((v, i) => `${i === 0 ? "M" : "L"}${xScale(i).toFixed(1)},${yScale(v).toFixed(1)}`).join(" ");
  const areaPath = `${linePath} L${xScale(values.length - 1).toFixed(1)},${yScale(0).toFixed(1)} L${xScale(0).toFixed(1)},${yScale(0).toFixed(1)} Z`;
  const finalPnl = values[values.length - 1];
  const isPositive = finalPnl >= 0;

  const yTicks = Array.from({ length: 5 }, (_, i) => {
    const v = minV + (range * i) / 4;
    return { value: v, y: yScale(v) };
  });

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full" style={{ maxHeight: 180 }}>
      <defs>
        <linearGradient id="pnlGrad" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={isPositive ? "#22c55e" : "#ef4444"} stopOpacity={0.3} />
          <stop offset="100%" stopColor={isPositive ? "#22c55e" : "#ef4444"} stopOpacity={0.02} />
        </linearGradient>
      </defs>
      {yTicks.map((t, i) => (
        <g key={i}>
          <line x1={PAD_L} x2={W - PAD_R} y1={t.y} y2={t.y} stroke="#374151" strokeWidth={0.5} />
          <text x={PAD_L - 5} y={t.y + 3} textAnchor="end" fill="#6b7280" fontSize={8}>${t.value.toFixed(0)}</text>
        </g>
      ))}
      <line x1={PAD_L} x2={W - PAD_R} y1={yScale(0)} y2={yScale(0)} stroke="#6b7280" strokeWidth={1} strokeDasharray="4,3" />
      <path d={areaPath} fill="url(#pnlGrad)" />
      <path d={linePath} fill="none" stroke={isPositive ? "#22c55e" : "#ef4444"} strokeWidth={2} />
      {timeline.map((t, i) => (
        <circle key={t.id} cx={xScale(i + 1)} cy={yScale(t.cumulative_pnl)} r={3} fill={t.pnl >= 0 ? "#22c55e" : "#ef4444"} stroke="#1f2937" strokeWidth={1}>
          <title>{t.symbol}: ${t.pnl.toFixed(0)} (cumulative: ${t.cumulative_pnl.toFixed(0)})</title>
        </circle>
      ))}
      <text x={PAD_L} y={H - 5} fill="#6b7280" fontSize={8}>Trade 1</text>
      <text x={W - PAD_R} y={H - 5} textAnchor="end" fill="#6b7280" fontSize={8}>Trade {timeline.length}</text>
    </svg>
  );
}

function MonthlyBarChart({ data }: { data: TradeStats["monthlyPnl"] }) {
  if (data.length === 0) return null;

  const W = 500, H = 140, PAD_L = 50, PAD_R = 10, PAD_T = 10, PAD_B = 30;
  const plotW = W - PAD_L - PAD_R, plotH = H - PAD_T - PAD_B;

  const values = data.map((d) => d.pnl);
  const minV = Math.min(0, ...values);
  const maxV = Math.max(0, ...values);
  const range = maxV - minV || 1;

  const barW = Math.min(40, (plotW / data.length) * 0.7);
  const gap = (plotW - barW * data.length) / (data.length + 1);
  const yScale = (v: number) => PAD_T + plotH - ((v - minV) / range) * plotH;
  const zeroY = yScale(0);

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full" style={{ maxHeight: 160 }}>
      <line x1={PAD_L} x2={W - PAD_R} y1={zeroY} y2={zeroY} stroke="#6b7280" strokeWidth={1} strokeDasharray="4,3" />
      {data.map((d, i) => {
        const x = PAD_L + gap + i * (barW + gap);
        const y = yScale(d.pnl);
        const barH = Math.abs(y - zeroY);
        const isPos = d.pnl >= 0;
        return (
          <g key={d.month}>
            <rect x={x} y={isPos ? y : zeroY} width={barW} height={Math.max(1, barH)} rx={2} fill={isPos ? "#22c55e" : "#ef4444"} opacity={0.8}>
              <title>{d.month}: ${d.pnl.toFixed(0)} ({d.wins}/{d.trades} wins)</title>
            </rect>
            <text x={x + barW / 2} y={H - PAD_B + 12} textAnchor="middle" fill="#6b7280" fontSize={7}>{d.month.slice(5)}</text>
            <text x={x + barW / 2} y={(isPos ? y : zeroY + barH) + (isPos ? -4 : 12)} textAnchor="middle" fill={isPos ? "#4ade80" : "#f87171"} fontSize={7}>${Math.abs(d.pnl).toFixed(0)}</text>
          </g>
        );
      })}
      <text x={PAD_L - 5} y={PAD_T + 5} textAnchor="end" fill="#6b7280" fontSize={8}>${maxV.toFixed(0)}</text>
      <text x={PAD_L - 5} y={H - PAD_B} textAnchor="end" fill="#6b7280" fontSize={8}>${minV.toFixed(0)}</text>
    </svg>
  );
}

function SymbolBreakdown({ data }: { data: TradeStats["bySymbol"] }) {
  if (data.length === 0) return null;
  const maxPnl = Math.max(...data.map((d) => Math.abs(d.total_pnl)), 1);

  return (
    <div className="space-y-1.5">
      {data.slice(0, 10).map((d) => {
        const isPos = d.total_pnl >= 0;
        const barPct = Math.min(100, (Math.abs(d.total_pnl) / maxPnl) * 100);
        const winRate = d.trades > 0 ? (d.wins / d.trades) * 100 : 0;
        return (
          <div key={d.symbol} className="flex items-center gap-2 text-sm">
            <span className="w-12 text-white font-medium text-xs">{d.symbol}</span>
            <div className="flex-1 h-5 bg-gray-800 rounded-full overflow-hidden relative">
              <div className={`h-full rounded-full transition-all ${isPos ? "bg-green-600/60" : "bg-red-600/60"}`} style={{ width: `${barPct}%` }} />
              <span className={`absolute inset-0 flex items-center px-2 text-[10px] font-medium ${isPos ? "text-green-300" : "text-red-300"}`}>
                {isPos ? "+" : ""}${d.total_pnl.toFixed(0)}
              </span>
            </div>
            <span className="w-16 text-[10px] text-gray-500 text-right">{d.wins}/{d.trades} ({winRate.toFixed(0)}%)</span>
          </div>
        );
      })}
    </div>
  );
}

// ─── Capital Management ────────────────────────────────────────────

function CapitalSection({ capital, onRefresh }: { capital: CapitalData | null; onRefresh: () => void }) {
  const [showAdd, setShowAdd] = useState(false);
  const [type, setType] = useState<"DEPOSIT" | "WITHDRAWAL">("DEPOSIT");
  const [amount, setAmount] = useState("");
  const [capNotes, setCapNotes] = useState("");
  const [saving, setSaving] = useState(false);

  const handleAdd = async () => {
    if (!amount || Number(amount) <= 0) return;
    setSaving(true);
    try {
      await fetch("/api/trades/capital", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type, amount: Number(amount), notes: capNotes || null }),
      });
      setAmount("");
      setCapNotes("");
      setShowAdd(false);
      onRefresh();
    } finally {
      setSaving(false);
    }
  };

  if (!capital) return null;

  const hasCapital = capital.netCapital > 0;
  const pctReturn = capital.returnOnCapital;
  const deployedPct = capital.netCapital > 0 ? (capital.capitalDeployed / capital.portfolioValue) * 100 : 0;

  return (
    <div className="bg-gray-800/50 border border-gray-700 rounded-lg p-4">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-medium text-gray-400">Portfolio Capital</h3>
        <button
          onClick={() => setShowAdd(!showAdd)}
          className="px-3 py-1 text-xs bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors"
        >
          {showAdd ? "Cancel" : "Add / Withdraw"}
        </button>
      </div>

      {!hasCapital && !showAdd && (
        <div className="text-center py-4">
          <p className="text-gray-500 text-sm mb-2">No capital allocated yet.</p>
          <p className="text-gray-600 text-xs">Click &quot;Add / Withdraw&quot; to deposit starting capital for your simulation.</p>
        </div>
      )}

      {hasCapital && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-3">
          <div>
            <div className="text-xs text-gray-500">Portfolio Value</div>
            <div className={`text-lg font-bold ${capital.portfolioValue >= capital.netCapital ? "text-green-400" : "text-red-400"}`}>
              ${capital.portfolioValue.toLocaleString(undefined, { maximumFractionDigits: 0 })}
            </div>
          </div>
          <div>
            <div className="text-xs text-gray-500">Available Capital</div>
            <div className="text-lg font-bold text-white">
              ${capital.availableCapital.toLocaleString(undefined, { maximumFractionDigits: 0 })}
            </div>
          </div>
          <div>
            <div className="text-xs text-gray-500">Return on Capital</div>
            <div className={`text-lg font-bold ${pctReturn >= 0 ? "text-green-400" : "text-red-400"}`}>
              {pctReturn >= 0 ? "+" : ""}{pctReturn.toFixed(2)}%
            </div>
          </div>
          <div>
            <div className="text-xs text-gray-500">Deployed</div>
            <div className="text-lg font-bold text-blue-400">
              {deployedPct.toFixed(0)}%
            </div>
            <div className="w-full h-1.5 bg-gray-700 rounded-full mt-1">
              <div className="h-full bg-blue-500 rounded-full" style={{ width: `${Math.min(100, deployedPct)}%` }} />
            </div>
          </div>
        </div>
      )}

      {/* Capital history */}
      {hasCapital && capital.events.length > 0 && (
        <div className="border-t border-gray-700/50 pt-2 mt-2">
          <div className="text-[10px] text-gray-600 mb-1">Recent transactions</div>
          <div className="space-y-0.5 max-h-20 overflow-y-auto">
            {capital.events.slice(0, 5).map((e) => (
              <div key={e.id} className="flex justify-between text-[11px]">
                <span className={e.type === "DEPOSIT" ? "text-green-500" : "text-red-500"}>
                  {e.type === "DEPOSIT" ? "+" : "-"}${Number(e.amount).toLocaleString()}
                </span>
                <span className="text-gray-600">{new Date(e.created_at).toLocaleDateString()}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Add/Withdraw form */}
      {showAdd && (
        <div className="border-t border-gray-700/50 pt-3 mt-3 space-y-2">
          <div className="flex gap-2">
            <button onClick={() => setType("DEPOSIT")} className={`flex-1 py-1.5 rounded text-xs font-medium ${type === "DEPOSIT" ? "bg-green-600 text-white" : "bg-gray-700 text-gray-400"}`}>Deposit</button>
            <button onClick={() => setType("WITHDRAWAL")} className={`flex-1 py-1.5 rounded text-xs font-medium ${type === "WITHDRAWAL" ? "bg-red-600 text-white" : "bg-gray-700 text-gray-400"}`}>Withdraw</button>
          </div>
          <input type="number" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="Amount ($)" className="w-full bg-gray-800 border border-gray-700 rounded px-3 py-1.5 text-sm text-white focus:outline-none focus:border-blue-500" />
          <input type="text" value={capNotes} onChange={(e) => setCapNotes(e.target.value)} placeholder="Notes (optional)" className="w-full bg-gray-800 border border-gray-700 rounded px-3 py-1.5 text-sm text-white focus:outline-none focus:border-blue-500" />
          <button onClick={handleAdd} disabled={saving || !amount} className="w-full py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-700 text-white rounded text-sm font-medium">{saving ? "Saving..." : `${type === "DEPOSIT" ? "Deposit" : "Withdraw"} $${amount || "0"}`}</button>
        </div>
      )}
    </div>
  );
}

// ─── Tastytrade Management Actions ────────────────────────────────

type ManagementAction = "close_profit" | "close_stop" | "close_custom" | "roll" | "expire";

interface AlertItem {
  trade: Trade;
  type: string;
  urgency: "high" | "medium" | "low";
  message: string;
  suggestedAction?: ManagementAction;
}

function ManagementAlerts({ trades, liveAlerts, onAction }: { trades: Trade[]; liveAlerts: LiveAlert[]; onAction: (trade: Trade, action: ManagementAction) => void }) {
  const openTrades = trades.filter((t) => t.status === "OPEN");
  if (openTrades.length === 0) return null;

  const tradeMap = new Map(openTrades.map((t) => [t.id, t]));

  // Build combined alerts: live (price-based, auto-detected) + time-based
  const alerts: AlertItem[] = [];
  const seenTradeTypes = new Set<string>(); // prevent duplicate alert types per trade

  // Live price-based alerts (from /api/trades/prices)
  for (const la of liveAlerts) {
    const trade = tradeMap.get(la.tradeId);
    if (!trade) continue;

    const key = `${la.tradeId}-${la.type}`;
    if (seenTradeTypes.has(key)) continue;
    seenTradeTypes.add(key);

    const actionMap: Record<string, ManagementAction> = {
      PROFIT_TARGET: "close_profit",
      STOP_LOSS: "close_stop",
      DTE_21: "roll",
      DTE_7: "close_custom",
      EXPIRING: "expire",
      ITM: "close_custom",
    };

    alerts.push({
      trade,
      type: la.type === "PROFIT_TARGET" ? "50% HIT" :
            la.type === "STOP_LOSS" ? "STOP HIT" :
            la.type === "DTE_21" ? "21 DTE" :
            la.type === "DTE_7" ? "7 DTE" :
            la.type === "ITM" ? "ITM" :
            la.type,
      urgency: la.urgency,
      message: la.message,
      suggestedAction: actionMap[la.type],
    });
  }

  // Fallback: time-based alerts for trades without live data
  const today = new Date();
  for (const trade of openTrades) {
    const expDate = new Date(trade.expiration);
    const daysToExp = Math.ceil((expDate.getTime() - today.getTime()) / 86400000);
    const mgmtDate = trade.management_date ? new Date(trade.management_date) : null;

    // Only add time-based alerts if no live alert of same type exists
    if (daysToExp <= 21 && !seenTradeTypes.has(`${trade.id}-DTE_21`) && !seenTradeTypes.has(`${trade.id}-DTE_7`)) {
      alerts.push({
        trade,
        type: "21 DTE",
        urgency: daysToExp <= 7 ? "high" : "medium",
        message: `${daysToExp}d to expiration — roll or close to reduce gamma risk`,
        suggestedAction: daysToExp <= 7 ? "close_custom" : "roll",
      });
    } else if (mgmtDate && today >= mgmtDate && !seenTradeTypes.has(`${trade.id}-DTE_21`)) {
      alerts.push({
        trade,
        type: "MGMT DATE",
        urgency: "medium",
        message: "Management date reached — review position",
        suggestedAction: "roll",
      });
    }
  }

  if (alerts.length === 0) return null;

  const urgencyColors = {
    high: "bg-red-900/30 border-red-700/40",
    medium: "bg-yellow-900/30 border-yellow-700/40",
    low: "bg-blue-900/30 border-blue-700/40",
  };

  const urgencyText = { high: "text-red-400", medium: "text-yellow-400", low: "text-blue-400" };

  const actionLabels: Record<ManagementAction, { label: string; color: string }> = {
    close_profit: { label: "Close at 50%", color: "bg-green-700 hover:bg-green-600 text-white" },
    close_stop: { label: "Close at Stop", color: "bg-red-700 hover:bg-red-600 text-white" },
    close_custom: { label: "Close", color: "bg-blue-700 hover:bg-blue-600 text-white" },
    roll: { label: "Roll", color: "bg-purple-700 hover:bg-purple-600 text-white" },
    expire: { label: "Let Expire", color: "bg-gray-700 hover:bg-gray-600 text-white" },
  };

  // Highlight if any alert was auto-detected from live prices
  const hasLiveAlerts = liveAlerts.length > 0;

  return (
    <div className={`border rounded-lg p-4 ${hasLiveAlerts ? "bg-gray-800/70 border-orange-700/50" : "bg-gray-800/50 border-gray-700"}`}>
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <h3 className="text-sm font-medium text-gray-400">Tastytrade Management Alerts</h3>
          {hasLiveAlerts && (
            <span className="px-1.5 py-0.5 rounded bg-orange-900/40 text-orange-400 text-[10px] font-medium animate-pulse">
              LIVE
            </span>
          )}
        </div>
        <span className="text-[10px] text-gray-600">Auto-detected from market prices</span>
      </div>
      <div className="space-y-1.5">
        {alerts.map((a, i) => (
          <div key={i} className={`px-3 py-2 rounded-lg border text-xs flex items-center gap-2 ${urgencyColors[a.urgency]}`}>
            <span className={`font-bold ${urgencyText[a.urgency]}`}>{a.trade.symbol}</span>
            <span className={`px-1.5 py-0.5 rounded bg-gray-800/50 text-[10px] font-medium ${urgencyText[a.urgency]}`}>{a.type}</span>
            <span className="text-gray-300 flex-1">{a.message}</span>
            {a.suggestedAction && (
              <button
                onClick={() => onAction(a.trade, a.suggestedAction!)}
                className={`px-2 py-1 rounded text-[10px] font-medium shrink-0 ${actionLabels[a.suggestedAction].color}`}
              >
                {actionLabels[a.suggestedAction].label}
              </button>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Roll Trade Modal ─────────────────────────────────────────────

function RollTradeModal({ trade, onClose, onSuccess }: { trade: Trade; onClose: () => void; onSuccess: () => void }) {
  const [rollType, setRollType] = useState<"OUT" | "DOWN" | "DOWN_AND_OUT">("OUT");
  const [closePrice, setClosePrice] = useState("");
  const [newStrike, setNewStrike] = useState(Number(trade.strike_price).toFixed(2));
  const [newExpiration, setNewExpiration] = useState("");
  const [newPremium, setNewPremium] = useState("");
  const [newDte, setNewDte] = useState("");
  const [stockPrice, setStockPrice] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const premium = Number(trade.premium_received);
  const cSize = trade.contract_size ?? 100;
  const qty = trade.quantity ?? 1;

  // Net credit calculation
  const closeCost = closePrice ? Number(closePrice) : 0;
  const newPrem = newPremium ? Number(newPremium) : 0;
  const netCredit = newPrem - closeCost;
  const isNetCredit = netCredit > 0;

  // P&L on closed leg
  const closePnl = closeCost > 0 ? (premium - closeCost) * cSize * qty : 0;

  // Set default expiration to 30 days from current expiration (typical roll)
  const getDefaultExpiration = () => {
    const exp = new Date(trade.expiration);
    exp.setDate(exp.getDate() + 30);
    return exp.toISOString().split("T")[0];
  };

  // When rollType changes, adjust new strike
  const handleRollTypeChange = (type: "OUT" | "DOWN" | "DOWN_AND_OUT") => {
    setRollType(type);
    if (type === "OUT") {
      setNewStrike(Number(trade.strike_price).toFixed(2));
    }
    if (!newExpiration) {
      setNewExpiration(getDefaultExpiration());
    }
  };

  const handleSubmit = async () => {
    if (!closePrice || !newStrike || !newExpiration || !newPremium || !stockPrice) {
      setError("All fields are required");
      return;
    }

    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/trades/roll", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tradeId: trade.id,
          closePrice: Number(closePrice),
          newStrikePrice: Number(newStrike),
          newExpiration,
          newPremium: Number(newPremium),
          newDte: newDte ? Number(newDte) : undefined,
          stockPriceAtRoll: Number(stockPrice),
          rollType,
        }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({ error: `HTTP ${res.status}` }));
        throw new Error(data.error || `Failed (${res.status})`);
      }

      onSuccess();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to roll trade");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm" onClick={onClose}>
      <div className="bg-gray-900 border border-gray-700 rounded-xl p-6 w-full max-w-md mx-4 shadow-2xl max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold text-white">Roll Trade: {trade.symbol}</h3>
          <button onClick={onClose} className="text-gray-500 hover:text-white text-xl leading-none">&times;</button>
        </div>

        {/* Current Position */}
        <div className="bg-gray-800/70 rounded-lg p-3 mb-4 text-sm space-y-1">
          <div className="text-[10px] text-gray-500 uppercase tracking-wide mb-1">Current Position</div>
          <div className="flex justify-between">
            <span className="text-gray-400">Strike</span>
            <span className="text-white">${Number(trade.strike_price).toFixed(2)} put x{qty}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-gray-400">Expiration</span>
            <span className="text-white">{trade.expiration}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-gray-400">Premium Received</span>
            <span className="text-green-400">${premium.toFixed(2)}/share</span>
          </div>
        </div>

        {/* Roll Type */}
        <div className="mb-4">
          <label className="block text-sm text-gray-400 mb-1">Roll Type</label>
          <div className="grid grid-cols-3 gap-1">
            {([["OUT", "Roll Out"], ["DOWN", "Roll Down"], ["DOWN_AND_OUT", "Down & Out"]] as const).map(([type, label]) => (
              <button
                key={type}
                onClick={() => handleRollTypeChange(type)}
                className={`py-1.5 rounded text-xs font-medium transition-colors ${rollType === type ? "bg-purple-600 text-white" : "bg-gray-700 text-gray-400 hover:text-white"}`}
              >
                {label}
              </button>
            ))}
          </div>
          <div className="text-[10px] text-gray-600 mt-1">
            {rollType === "OUT" && "Same strike, later expiration — collect more time premium"}
            {rollType === "DOWN" && "Lower strike, same/later exp — reduce assignment risk"}
            {rollType === "DOWN_AND_OUT" && "Lower strike + later exp — most defensive roll"}
          </div>
        </div>

        {/* Close Current */}
        <div className="space-y-3 mb-4">
          <div>
            <label className="block text-sm text-gray-400 mb-1">Buy Back Current Put At (per share)</label>
            <input
              type="number" step="0.01" value={closePrice} onChange={(e) => setClosePrice(e.target.value)}
              placeholder={`Stop: $${trade.stop_loss_price ? Number(trade.stop_loss_price).toFixed(2) : ""}`}
              className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-purple-500"
            />
          </div>

          <div>
            <label className="block text-sm text-gray-400 mb-1">Current Stock Price</label>
            <input
              type="number" step="0.01" value={stockPrice} onChange={(e) => setStockPrice(e.target.value)}
              placeholder="Stock price now"
              className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-purple-500"
            />
          </div>
        </div>

        {/* New Position */}
        <div className="bg-purple-900/15 border border-purple-800/30 rounded-lg p-3 mb-4">
          <div className="text-[10px] text-purple-400 font-medium uppercase tracking-wide mb-2">New Position</div>
          <div className="space-y-3">
            <div>
              <label className="block text-sm text-gray-400 mb-1">New Strike</label>
              <input
                type="number" step="0.01" value={newStrike} onChange={(e) => setNewStrike(e.target.value)}
                className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-purple-500"
              />
            </div>
            <div>
              <label className="block text-sm text-gray-400 mb-1">New Expiration</label>
              <input
                type="date" value={newExpiration} onChange={(e) => setNewExpiration(e.target.value)}
                min={trade.expiration}
                className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-purple-500"
              />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="block text-sm text-gray-400 mb-1">New Premium (per share)</label>
                <input
                  type="number" step="0.01" value={newPremium} onChange={(e) => setNewPremium(e.target.value)}
                  placeholder="Premium received"
                  className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-purple-500"
                />
              </div>
              <div>
                <label className="block text-sm text-gray-400 mb-1">New DTE</label>
                <input
                  type="number" value={newDte} onChange={(e) => setNewDte(e.target.value)}
                  placeholder="Days to exp"
                  className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-purple-500"
                />
              </div>
            </div>
          </div>
        </div>

        {/* Net Credit / Debit Summary */}
        {closePrice && newPremium && (
          <div className={`text-center p-3 rounded-lg mb-4 ${isNetCredit ? "bg-green-900/20 border border-green-700/30" : "bg-red-900/20 border border-red-700/30"}`}>
            <div className="text-xs text-gray-400">Net {isNetCredit ? "Credit" : "Debit"} per Share</div>
            <div className={`text-xl font-bold ${isNetCredit ? "text-green-400" : "text-red-400"}`}>
              {isNetCredit ? "+" : "-"}${Math.abs(netCredit).toFixed(2)}
            </div>
            <div className="text-xs text-gray-500">
              Total: {isNetCredit ? "+" : "-"}${(Math.abs(netCredit) * cSize * qty).toFixed(0)}
            </div>
            <div className="text-xs text-gray-500 mt-1">
              Closed leg P&L: {closePnl >= 0 ? "+" : ""}${closePnl.toFixed(0)}
            </div>
            {!isNetCredit && (
              <div className="text-[10px] text-orange-400 mt-1">
                Tastytrade recommends rolling only for a net credit when possible
              </div>
            )}
          </div>
        )}

        {/* Research note */}
        <div className="text-[10px] text-gray-600 mb-4 leading-snug">
          <span className="text-gray-500 font-medium">Tastytrade rolling rules:</span> Roll for a net credit when possible. Roll to 30-45 DTE for optimal theta. Rolling down reduces delta/assignment risk. The 21 DTE rule is the most universally validated management mechanism.
        </div>

        {error && <div className="mb-3 text-sm text-red-400 bg-red-900/20 border border-red-700/30 rounded px-3 py-2">{error}</div>}

        <div className="flex gap-3">
          <button onClick={onClose} className="flex-1 px-4 py-2 bg-gray-800 text-gray-400 rounded-lg hover:bg-gray-700 transition-colors text-sm">Cancel</button>
          <button
            onClick={handleSubmit}
            disabled={saving || !closePrice || !newPremium || !stockPrice || !newExpiration}
            className="flex-1 px-4 py-2 bg-purple-600 hover:bg-purple-700 disabled:bg-purple-800 disabled:text-purple-400 text-white font-medium rounded-lg transition-colors text-sm"
          >
            {saving ? "Rolling..." : "Roll Position"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Close Trade Modal ─────────────────────────────────────────────

function CloseTradeModal({ trade, onClose, onSuccess }: { trade: Trade; onClose: () => void; onSuccess: () => void }) {
  const [status, setStatus] = useState("EXPIRED");
  const [closePrice, setClosePrice] = useState("");
  const [stockPrice, setStockPrice] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const premium = Number(trade.premium_received);
  const collateral = Number(trade.collateral);
  const cSize = trade.contract_size ?? 100;

  let previewPnl = 0;
  if (status === "EXPIRED") {
    previewPnl = premium * cSize;
  } else if (status === "ASSIGNED" && stockPrice) {
    previewPnl = premium * cSize - (Number(trade.strike_price) - Number(stockPrice)) * cSize;
  } else if (closePrice) {
    previewPnl = (premium - Number(closePrice)) * cSize;
  }

  // Apply quantity
  const qty = trade.quantity ?? 1;
  previewPnl *= qty;

  const handleSubmit = async () => {
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(`/api/trades/${trade.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          status,
          closePrice: closePrice ? Number(closePrice) : null,
          stockPriceAtClose: stockPrice ? Number(stockPrice) : null,
        }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({ error: `HTTP ${res.status}` }));
        throw new Error(data.error || `Failed (${res.status})`);
      }
      onSuccess();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm" onClick={onClose}>
      <div className="bg-gray-900 border border-gray-700 rounded-xl p-6 w-full max-w-md mx-4 shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold text-white">Close Trade: {trade.symbol}</h3>
          <button onClick={onClose} className="text-gray-500 hover:text-white text-xl leading-none">&times;</button>
        </div>

        <div className="bg-gray-800/70 rounded-lg p-3 mb-4 text-sm space-y-1">
          <div className="flex justify-between">
            <span className="text-gray-400">Strike</span>
            <span className="text-white">${Number(trade.strike_price).toFixed(2)} put x{qty}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-gray-400">Premium Received</span>
            <span className="text-green-400">${premium.toFixed(2)}/share</span>
          </div>
          {trade.profit_target_price && (
            <div className="flex justify-between text-xs">
              <span className="text-gray-500">50% profit target</span>
              <span className="text-green-500">Buy back at ${Number(trade.profit_target_price).toFixed(2)}</span>
            </div>
          )}
          {trade.stop_loss_price && (
            <div className="flex justify-between text-xs">
              <span className="text-gray-500">2x credit stop</span>
              <span className="text-red-500">Buy back at ${Number(trade.stop_loss_price).toFixed(2)}</span>
            </div>
          )}
        </div>

        <div className="space-y-3 mb-4">
          <div>
            <label className="block text-sm text-gray-400 mb-1">Outcome</label>
            <select value={status} onChange={(e) => setStatus(e.target.value)} className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-blue-500">
              <option value="EXPIRED">Expired Worthless (full profit)</option>
              <option value="CLOSED_PROFIT">Bought Back at Profit (below entry)</option>
              <option value="CLOSED_LOSS">Bought Back at Loss (above entry)</option>
              <option value="ASSIGNED">Assigned (stock purchased at strike)</option>
            </select>
          </div>

          {(status === "CLOSED_PROFIT" || status === "CLOSED_LOSS") && (
            <div>
              <label className="block text-sm text-gray-400 mb-1">Close Price (per share)</label>
              <input type="number" step="0.01" value={closePrice} onChange={(e) => setClosePrice(e.target.value)} placeholder={`50% target: $${trade.profit_target_price ? Number(trade.profit_target_price).toFixed(2) : ""}`} className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-blue-500" />
              {/* Tastytrade quick-fill buttons */}
              <div className="flex gap-1.5 mt-1.5">
                {trade.profit_target_price && (
                  <button
                    type="button"
                    onClick={() => { setClosePrice(Number(trade.profit_target_price).toFixed(2)); setStatus("CLOSED_PROFIT"); }}
                    className="px-2 py-1 text-[10px] bg-green-900/40 text-green-400 border border-green-700/30 rounded hover:bg-green-900/60 transition-colors"
                  >
                    50% Profit (${Number(trade.profit_target_price).toFixed(2)})
                  </button>
                )}
                {trade.stop_loss_price && (
                  <button
                    type="button"
                    onClick={() => { setClosePrice(Number(trade.stop_loss_price).toFixed(2)); setStatus("CLOSED_LOSS"); }}
                    className="px-2 py-1 text-[10px] bg-red-900/40 text-red-400 border border-red-700/30 rounded hover:bg-red-900/60 transition-colors"
                  >
                    2x Stop (${Number(trade.stop_loss_price).toFixed(2)})
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => { setClosePrice((premium * 0.75).toFixed(2)); setStatus("CLOSED_PROFIT"); }}
                  className="px-2 py-1 text-[10px] bg-gray-700 text-gray-400 border border-gray-600/30 rounded hover:bg-gray-600 transition-colors"
                >
                  25% Profit (${(premium * 0.75).toFixed(2)})
                </button>
              </div>
            </div>
          )}

          {status === "ASSIGNED" && (
            <div>
              <label className="block text-sm text-gray-400 mb-1">Stock Price at Assignment</label>
              <input type="number" step="0.01" value={stockPrice} onChange={(e) => setStockPrice(e.target.value)} placeholder="Stock price when assigned" className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-blue-500" />
            </div>
          )}

          <div className={`text-center p-2 rounded-lg ${previewPnl >= 0 ? "bg-green-900/20 border border-green-700/30" : "bg-red-900/20 border border-red-700/30"}`}>
            <div className="text-xs text-gray-400">Estimated P&L</div>
            <div className={`text-xl font-bold ${previewPnl >= 0 ? "text-green-400" : "text-red-400"}`}>{previewPnl >= 0 ? "+" : ""}${previewPnl.toFixed(0)}</div>
            <div className="text-xs text-gray-500">{collateral > 0 ? `${((previewPnl / collateral) * 100).toFixed(2)}% of collateral` : ""}</div>
          </div>
        </div>

        {error && <div className="mb-3 text-sm text-red-400 bg-red-900/20 border border-red-700/30 rounded px-3 py-2">{error}</div>}

        <div className="flex gap-3">
          <button onClick={onClose} className="flex-1 px-4 py-2 bg-gray-800 text-gray-400 rounded-lg hover:bg-gray-700 transition-colors text-sm">Cancel</button>
          <button onClick={handleSubmit} disabled={saving} className="flex-1 px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-800 text-white font-medium rounded-lg transition-colors text-sm">{saving ? "Saving..." : "Close Trade"}</button>
        </div>
      </div>
    </div>
  );
}

// ─── Main Dashboard ────────────────────────────────────────────────

export default function TradesDashboard({ refreshKey }: TradesDashboardProps) {
  const [stats, setStats] = useState<TradeStats | null>(null);
  const [trades, setTrades] = useState<Trade[]>([]);
  const [capital, setCapital] = useState<CapitalData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [closingTrade, setClosingTrade] = useState<Trade | null>(null);
  const [rollingTrade, setRollingTrade] = useState<Trade | null>(null);
  const [deletingId, setDeletingId] = useState<number | null>(null);
  const [filter, setFilter] = useState<"all" | "OPEN" | "closed">("all");
  const [showResetConfirm, setShowResetConfirm] = useState(false);
  const [resetting, setResetting] = useState(false);
  const [livePrices, setLivePrices] = useState<Record<number, LivePrice>>({});
  const [liveAlerts, setLiveAlerts] = useState<LiveAlert[]>([]);
  const [pricesLoading, setPricesLoading] = useState(false);
  const [pricesLastUpdated, setPricesLastUpdated] = useState<Date | null>(null);
  const [showGuide, setShowGuide] = useState(false);

  // Handle tastytrade management actions from alerts
  const handleManagementAction = (trade: Trade, action: ManagementAction) => {
    switch (action) {
      case "close_profit":
      case "close_stop":
      case "close_custom":
      case "expire":
        setClosingTrade(trade);
        break;
      case "roll":
        setRollingTrade(trade);
        break;
    }
  };

  // Fetch live prices for open trades
  const fetchLivePrices = useCallback(async () => {
    setPricesLoading(true);
    try {
      const res = await fetch("/api/trades/prices");
      if (res.ok) {
        const data = await res.json();
        setLivePrices(data.prices ?? {});
        setLiveAlerts(data.alerts ?? []);
        setPricesLastUpdated(new Date());
      }
    } catch {
      // Silently fail — live prices are optional
    } finally {
      setPricesLoading(false);
    }
  }, []);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [statsRes, tradesRes, capitalRes] = await Promise.all([
        fetch("/api/trades/stats"),
        fetch("/api/trades"),
        fetch("/api/trades/capital"),
      ]);

      if (statsRes.status === 503 || tradesRes.status === 503) {
        setError("DATABASE_URL not configured. See README for Neon setup instructions.");
        return;
      }

      if (!statsRes.ok || !tradesRes.ok) throw new Error("Failed to load trade data");

      const [statsData, tradesData] = await Promise.all([statsRes.json(), tradesRes.json()]);
      setStats(statsData);
      setTrades(tradesData.trades);

      if (capitalRes.ok) {
        setCapital(await capitalRes.json());
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load trades");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchData(); }, [fetchData, refreshKey]);

  // Fetch live prices after trades are loaded (only if open trades exist)
  useEffect(() => {
    if (trades.some((t) => t.status === "OPEN")) {
      fetchLivePrices();
    }
  }, [trades, fetchLivePrices]);

  const handleDelete = async (id: number) => {
    setDeletingId(id);
    try {
      const res = await fetch(`/api/trades/${id}`, { method: "DELETE" });
      if (res.ok) fetchData();
    } finally {
      setDeletingId(null);
    }
  };

  const handleResetAll = async () => {
    setResetting(true);
    try {
      const res = await fetch("/api/trades/reset", { method: "DELETE" });
      if (res.ok) {
        setShowResetConfirm(false);
        fetchData();
      }
    } finally {
      setResetting(false);
    }
  };

  if (loading) {
    return (
      <div className="text-center py-16">
        <div className="w-10 h-10 border-2 border-gray-600 border-t-blue-400 rounded-full animate-spin mx-auto mb-4" />
        <p className="text-gray-400">Loading trade data...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="text-center py-16">
        <div className="text-4xl mb-3">&#128202;</div>
        <h3 className="text-lg font-medium text-white mb-2">Simulation Trading</h3>
        <p className="text-gray-400 text-sm max-w-md mx-auto mb-4">{error}</p>
        <div className="bg-gray-800/50 border border-gray-700 rounded-lg p-4 max-w-lg mx-auto text-left text-sm text-gray-400">
          <p className="font-medium text-white mb-2">Quick Setup:</p>
          <ol className="list-decimal list-inside space-y-1">
            <li>In Vercel: Storage tab &rarr; Connect your Neon database (or Create Database)</li>
            <li>Vercel auto-injects <code className="text-green-400">POSTGRES_URL</code> &mdash; no manual config needed</li>
            <li>For local dev: add <code className="text-green-400">DATABASE_URL=&quot;postgres://...&quot;</code> to <code>.env.local</code></li>
            <li>Restart the dev server</li>
          </ol>
        </div>
      </div>
    );
  }

  const s = stats?.summary;
  const filteredTrades = trades.filter((t) => {
    if (filter === "all") return true;
    if (filter === "OPEN") return t.status === "OPEN";
    return t.status !== "OPEN"; // includes CLOSED_PROFIT, CLOSED_LOSS, ASSIGNED, EXPIRED, ROLLED
  });

  return (
    <div className="space-y-6">
      {/* Capital Management */}
      <CapitalSection capital={capital} onRefresh={fetchData} />

      {/* Live Prices Status Bar */}
      {trades.some((t) => t.status === "OPEN") && (
        <div className="flex items-center justify-between bg-gray-800/50 border border-gray-700 rounded-lg px-4 py-2">
          <div className="flex items-center gap-3">
            <div className={`w-2 h-2 rounded-full ${pricesLoading ? "bg-yellow-400 animate-pulse" : pricesLastUpdated ? "bg-green-400" : "bg-gray-600"}`} />
            <span className="text-xs text-gray-400">
              {pricesLoading ? "Fetching live prices..." : pricesLastUpdated ? `Live prices updated ${pricesLastUpdated.toLocaleTimeString()}` : "Live prices not loaded"}
            </span>
            {liveAlerts.length > 0 && (
              <span className="px-2 py-0.5 bg-amber-900/40 text-amber-400 text-[10px] font-bold rounded-full">
                {liveAlerts.length} ALERT{liveAlerts.length > 1 ? "S" : ""}
              </span>
            )}
          </div>
          <div className="flex items-center gap-2">
            <button onClick={() => setShowGuide(!showGuide)} className="px-2 py-1 text-[10px] font-medium bg-gray-700 text-gray-300 hover:text-white rounded transition-colors">
              {showGuide ? "Hide" : "Show"} Guide
            </button>
            <button onClick={fetchLivePrices} disabled={pricesLoading} className="px-3 py-1 text-xs font-medium bg-blue-600/20 text-blue-400 hover:bg-blue-600/40 rounded transition-colors disabled:opacity-50">
              {pricesLoading ? "Refreshing..." : "Refresh Prices"}
            </button>
          </div>
        </div>
      )}

      {/* Tastytrade Management Guide */}
      {showGuide && (
        <div className="bg-gray-800/50 border border-indigo-800/50 rounded-lg p-4 space-y-3">
          <h3 className="text-sm font-semibold text-indigo-300">Tastytrade Management Guide</h3>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-xs">
            <div className="bg-gray-900/50 rounded-lg p-3 border border-green-900/30">
              <div className="font-semibold text-green-400 mb-1">50% Profit Target</div>
              <p className="text-gray-400 leading-relaxed">When the put price drops to 50% of your received premium, buy it back to lock in profits. This is the most validated management rule — tastytrade research shows managing winners consistently outperforms holding to expiration.</p>
              <p className="text-gray-500 mt-1 italic">Example: Sold put at $2.00 → buy back at $1.00</p>
            </div>
            <div className="bg-gray-900/50 rounded-lg p-3 border border-red-900/30">
              <div className="font-semibold text-red-400 mb-1">2x Credit Stop Loss</div>
              <p className="text-gray-400 leading-relaxed">If the put price rises to 3x your premium (2x loss), consider closing to limit damage. This is a starting guideline — some traders prefer wider stops or rely on the 21 DTE rule instead. Evaluate based on your thesis for the stock.</p>
              <p className="text-gray-500 mt-1 italic">Example: Sold at $2.00 → stop at $6.00 (loss = $4.00)</p>
            </div>
            <div className="bg-gray-900/50 rounded-lg p-3 border border-blue-900/30">
              <div className="font-semibold text-blue-400 mb-1">21 DTE Management</div>
              <p className="text-gray-400 leading-relaxed">The most universally validated rule. At 21 days to expiration, gamma risk accelerates — small stock moves cause large option price swings. Roll to a new expiration or close the position.</p>
              <p className="text-gray-500 mt-1 italic">Roll for a net credit when possible (new premium &gt; buyback cost)</p>
            </div>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-xs">
            <div className="bg-gray-900/50 rounded-lg p-3 border border-purple-900/30">
              <div className="font-semibold text-purple-400 mb-1">Rolling (Out / Down)</div>
              <p className="text-gray-400 leading-relaxed"><strong>Roll Out:</strong> Same strike, later expiration — collect more time premium. <strong>Roll Down:</strong> Lower strike, same/later date — reduce risk. <strong>Roll Down &amp; Out:</strong> Both — most defensive. Always aim for a net credit.</p>
            </div>
            <div className="bg-gray-900/50 rounded-lg p-3 border border-orange-900/30">
              <div className="font-semibold text-orange-400 mb-1">ITM Warning</div>
              <p className="text-gray-400 leading-relaxed">When the stock drops below your strike price, the put is in-the-money and assignment risk increases. Consider rolling down or closing. If you are comfortable owning the stock at that price, assignment can be acceptable.</p>
            </div>
            <div className="bg-gray-900/50 rounded-lg p-3 border border-gray-600/30">
              <div className="font-semibold text-gray-300 mb-1">Alert Priority</div>
              <p className="text-gray-400 leading-relaxed"><span className="text-red-400 font-bold">Red/High:</span> Immediate action needed (stop loss, ITM, expiring). <span className="text-amber-400 font-bold">Amber/Medium:</span> Evaluate soon (profit target, 21 DTE). Alerts are auto-detected from live option prices when available.</p>
            </div>
          </div>
        </div>
      )}

      {/* Tastytrade Management Alerts (live price-based + time-based) */}
      <ManagementAlerts trades={trades} liveAlerts={liveAlerts} onAction={handleManagementAction} />

      {/* KPI Cards */}
      {s && (
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-3">
          <KPICard label="Total P&L" value={`${s.total_pnl >= 0 ? "+" : ""}$${s.total_pnl.toFixed(0)}`} color={s.total_pnl >= 0 ? "green" : "red"} sub={`${s.closed_trades} closed trades`} />
          <KPICard label="Win Rate" value={`${s.win_rate.toFixed(1)}%`} color={s.win_rate >= 55 ? "green" : s.win_rate >= 45 ? "yellow" : "red"} sub={`${s.winning_trades}W / ${s.losing_trades}L`} />
          <KPICard label="Profit Factor" value={s.profit_factor >= 999 ? "\u221e" : s.profit_factor.toFixed(2)} color={s.profit_factor >= 1.5 ? "green" : s.profit_factor >= 1 ? "yellow" : "red"} sub="gross wins / gross losses" />
          <KPICard label="Open Trades" value={String(s.open_trades)} color="blue" sub={`$${s.total_capital_at_risk.toLocaleString()} at risk`} />
          <KPICard label="Max Drawdown" value={`$${s.max_drawdown.toFixed(0)}`} color={s.max_drawdown > 0 ? "red" : "green"} sub="peak to trough" />
          <KPICard label="Avg Holding" value={`${s.avg_holding_days.toFixed(0)}d`} color="blue" sub={`W:${s.avg_win_holding_days.toFixed(0)}d L:${s.avg_loss_holding_days.toFixed(0)}d`} />
          <KPICard label="Premium Collected" value={`$${(s.total_premium_collected ?? 0).toLocaleString(undefined, { maximumFractionDigits: 0 })}`} color="green" sub={`$${(s.open_premium ?? 0).toFixed(0)} in open trades`} />
        </div>
      )}

      {/* Score Analysis */}
      {s && s.closed_trades > 0 && (
        <div className="bg-gray-800/50 border border-gray-700 rounded-lg p-4">
          <h3 className="text-sm font-medium text-gray-400 mb-3">Score vs Outcome (Scoring Model Validation)</h3>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="text-center">
              <div className="text-2xl font-bold text-green-400">{s.avg_winning_score.toFixed(0)}</div>
              <div className="text-xs text-gray-500">Avg Score (Winners)</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold text-red-400">{s.avg_losing_score.toFixed(0)}</div>
              <div className="text-xs text-gray-500">Avg Score (Losers)</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold text-green-400">${s.gross_wins.toFixed(0)}</div>
              <div className="text-xs text-gray-500">Gross Wins</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold text-red-400">-${s.gross_losses.toFixed(0)}</div>
              <div className="text-xs text-gray-500">Gross Losses</div>
            </div>
          </div>
          {s.avg_winning_score > s.avg_losing_score && s.avg_losing_score > 0 && (
            <p className="text-xs text-gray-500 text-center mt-2">Higher-scored trades win more — the scoring model has predictive edge.</p>
          )}
        </div>
      )}

      {/* Charts Row */}
      {stats && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          <div className="bg-gray-800/50 border border-gray-700 rounded-lg p-4">
            <h3 className="text-sm font-medium text-gray-400 mb-2">Win Rate</h3>
            <WinRateDonut winRate={s?.win_rate ?? 0} wins={s?.winning_trades ?? 0} losses={s?.losing_trades ?? 0} />
          </div>
          <div className="bg-gray-800/50 border border-gray-700 rounded-lg p-4 lg:col-span-2">
            <h3 className="text-sm font-medium text-gray-400 mb-2">Cumulative P&L</h3>
            {stats.pnlTimeline.length > 0 ? <CumulativePnLChart timeline={stats.pnlTimeline} /> : <div className="text-gray-600 text-sm text-center py-8">Close some trades to see the P&L curve</div>}
          </div>
        </div>
      )}

      {/* Monthly & Symbol Breakdown */}
      {stats && (stats.monthlyPnl.length > 0 || stats.bySymbol.length > 0) && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {stats.monthlyPnl.length > 0 && (
            <div className="bg-gray-800/50 border border-gray-700 rounded-lg p-4">
              <h3 className="text-sm font-medium text-gray-400 mb-2">Monthly P&L</h3>
              <MonthlyBarChart data={stats.monthlyPnl} />
            </div>
          )}
          {stats.bySymbol.length > 0 && (
            <div className="bg-gray-800/50 border border-gray-700 rounded-lg p-4">
              <h3 className="text-sm font-medium text-gray-400 mb-2">P&L by Symbol</h3>
              <SymbolBreakdown data={stats.bySymbol} />
            </div>
          )}
        </div>
      )}

      {/* Trade List */}
      <div className="bg-gray-800/50 border border-gray-700 rounded-lg p-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-3">
          <h3 className="text-sm font-medium text-gray-400">Trade History</h3>
          <div className="flex items-center gap-2">
            <div className="flex gap-1">
              {(["all", "OPEN", "closed"] as const).map((f) => (
                <button key={f} onClick={() => setFilter(f)} className={`px-3 py-1.5 rounded text-xs font-medium transition-colors ${filter === f ? "bg-blue-600 text-white" : "bg-gray-700 text-gray-400 hover:text-white"}`}>
                  {f === "all" ? "All" : f === "OPEN" ? "Open" : "Closed"}
                </button>
              ))}
            </div>
            {trades.length > 0 && (
              <button
                onClick={() => setShowResetConfirm(true)}
                className="px-3 py-1.5 rounded text-xs font-medium bg-gray-700 text-red-400 hover:bg-red-900/40 hover:text-red-300 transition-colors"
                title="Delete all trades and capital events"
              >
                Reset All
              </button>
            )}
          </div>
        </div>

        {filteredTrades.length === 0 ? (
          <div className="text-center py-8 text-gray-600 text-sm">
            {trades.length === 0 ? 'No trades yet. Use the screener to find puts and click "Simulate Trade" to get started.' : "No trades match this filter."}
          </div>
        ) : (
          <div className="space-y-2">
            {filteredTrades.map((trade) => (
              <TradeCard key={trade.id} trade={trade} onClose={() => setClosingTrade(trade)} onRoll={() => setRollingTrade(trade)} onDelete={() => handleDelete(trade.id)} deleting={deletingId === trade.id} livePrice={livePrices[trade.id]} />
            ))}
          </div>
        )}
      </div>

      {closingTrade && <CloseTradeModal trade={closingTrade} onClose={() => setClosingTrade(null)} onSuccess={() => { setClosingTrade(null); fetchData(); }} />}
      {rollingTrade && <RollTradeModal trade={rollingTrade} onClose={() => setRollingTrade(null)} onSuccess={() => { setRollingTrade(null); fetchData(); }} />}

      {/* Reset Confirmation Modal */}
      {showResetConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm" onClick={() => setShowResetConfirm(false)}>
          <div className="bg-gray-900 border border-red-700/50 rounded-xl p-6 w-full max-w-sm mx-4 shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center gap-3 mb-3">
              <div className="w-10 h-10 rounded-full bg-red-900/40 flex items-center justify-center text-red-400 text-lg shrink-0">!</div>
              <h3 className="text-lg font-semibold text-white">Reset All Data?</h3>
            </div>
            <p className="text-sm text-gray-400 mb-1">
              This will permanently delete:
            </p>
            <ul className="text-sm text-gray-400 mb-4 list-disc list-inside space-y-0.5">
              <li><span className="text-white font-medium">{trades.length}</span> trade{trades.length !== 1 ? "s" : ""} (open and closed)</li>
              <li>All capital deposits and withdrawals</li>
              <li>All P&L history and statistics</li>
            </ul>
            <p className="text-xs text-red-400/80 mb-4">This action cannot be undone.</p>
            <div className="flex gap-3">
              <button
                onClick={() => setShowResetConfirm(false)}
                className="flex-1 px-4 py-2 bg-gray-800 text-gray-400 rounded-lg hover:bg-gray-700 transition-colors text-sm"
              >
                Cancel
              </button>
              <button
                onClick={handleResetAll}
                disabled={resetting}
                className="flex-1 px-4 py-2 bg-red-600 hover:bg-red-700 disabled:bg-red-800 text-white font-medium rounded-lg transition-colors text-sm"
              >
                {resetting ? "Deleting..." : "Delete Everything"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Sub-components ────────────────────────────────────────────────

function KPICard({ label, value, color, sub }: { label: string; value: string; color: string; sub: string }) {
  const colorMap: Record<string, string> = { green: "text-green-400", red: "text-red-400", yellow: "text-yellow-400", blue: "text-blue-400" };
  return (
    <div className="bg-gray-800/50 border border-gray-700 rounded-lg p-3">
      <div className="text-xs text-gray-500 mb-1">{label}</div>
      <div className={`text-xl font-bold ${colorMap[color] ?? "text-white"}`}>{value}</div>
      <div className="text-[10px] text-gray-600 mt-0.5">{sub}</div>
    </div>
  );
}

const statusConfig: Record<string, { label: string; color: string; bg: string }> = {
  OPEN: { label: "Open", color: "text-blue-400", bg: "bg-blue-900/30 border-blue-700/30" },
  CLOSED_PROFIT: { label: "Profit", color: "text-green-400", bg: "bg-green-900/30 border-green-700/30" },
  CLOSED_LOSS: { label: "Loss", color: "text-red-400", bg: "bg-red-900/30 border-red-700/30" },
  ASSIGNED: { label: "Assigned", color: "text-yellow-400", bg: "bg-yellow-900/30 border-yellow-700/30" },
  EXPIRED: { label: "Expired", color: "text-green-400", bg: "bg-green-900/30 border-green-700/30" },
  ROLLED: { label: "Rolled", color: "text-purple-400", bg: "bg-purple-900/30 border-purple-700/30" },
};

function TradeCard({ trade, onClose, onRoll, onDelete, deleting, livePrice }: { trade: Trade; onClose: () => void; onRoll: () => void; onDelete: () => void; deleting: boolean; livePrice?: LivePrice }) {
  const sc = statusConfig[trade.status] ?? statusConfig.OPEN;
  const premium = Number(trade.premium_received);
  const pnl = trade.pnl ? Number(trade.pnl) : null;
  const qty = trade.quantity ?? 1;
  const daysOpen = trade.closed_at
    ? Math.ceil((new Date(trade.closed_at).getTime() - new Date(trade.created_at).getTime()) / 86400000)
    : Math.ceil((Date.now() - new Date(trade.created_at).getTime()) / 86400000);

  // Days to expiration for open trades
  const daysToExp = trade.status === "OPEN"
    ? Math.ceil((new Date(trade.expiration).getTime() - Date.now()) / 86400000)
    : null;

  const isOpen = trade.status === "OPEN";
  const strike = Number(trade.strike_price);

  // Determine profit progress bar for open trades with live data
  const profitPct = livePrice?.profitPct ?? null;
  const profitTarget = trade.profit_target_price ? Number(trade.profit_target_price) : null;
  const stopLoss = trade.stop_loss_price ? Number(trade.stop_loss_price) : null;
  const currentPut = livePrice?.putMid ?? livePrice?.putLast ?? null;

  // Detect if target/stop hit
  const targetHit = currentPut != null && profitTarget != null && currentPut <= profitTarget;
  const stopHit = currentPut != null && stopLoss != null && currentPut >= stopLoss;
  const isItm = livePrice != null && livePrice.stockPrice < strike;

  return (
    <div className={`rounded-lg border p-3 ${targetHit ? "bg-green-900/30 border-green-700/40" : stopHit ? "bg-red-900/30 border-red-700/40" : sc.bg}`}>
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-white font-bold">{trade.symbol}</span>
            <span className={`px-2 py-0.5 rounded text-[10px] font-medium border ${sc.bg} ${sc.color}`}>{sc.label}</span>
            {qty > 1 && <span className="text-xs text-gray-500">x{qty}</span>}
            {trade.score_at_entry && <span className="text-xs text-gray-500">Score: {Number(trade.score_at_entry).toFixed(0)}</span>}
            {daysToExp !== null && daysToExp <= 21 && (
              <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${daysToExp <= 7 ? "bg-red-900/40 text-red-400" : "bg-yellow-900/40 text-yellow-400"}`}>
                {daysToExp}d to exp
              </span>
            )}
            {targetHit && <span className="text-[10px] px-1.5 py-0.5 rounded font-medium bg-green-900/60 text-green-300 animate-pulse">50% TARGET HIT</span>}
            {stopHit && <span className="text-[10px] px-1.5 py-0.5 rounded font-medium bg-red-900/60 text-red-300 animate-pulse">STOP HIT</span>}
            {isItm && !stopHit && <span className="text-[10px] px-1.5 py-0.5 rounded font-medium bg-orange-900/40 text-orange-400">ITM</span>}
          </div>
          <div className="text-xs text-gray-500 mt-0.5">
            ${strike.toFixed(0)} put &middot; exp {trade.expiration} &middot; Sold at ${premium.toFixed(2)} &middot; {daysOpen}d {isOpen ? "open" : "held"}
          </div>

          {/* Live prices for open trades */}
          {isOpen && livePrice && (
            <div className="flex items-center gap-2 sm:gap-4 flex-wrap mt-1.5">
              <div className="flex items-center gap-1.5">
                <span className="text-[10px] text-gray-600">Stock:</span>
                <span className={`text-xs font-medium ${isItm ? "text-orange-400" : "text-white"}`}>${livePrice.stockPrice.toFixed(2)}</span>
              </div>
              {currentPut != null && (
                <div className="flex items-center gap-1.5">
                  <span className="text-[10px] text-gray-600">Put:</span>
                  <span className={`text-xs font-medium ${targetHit ? "text-green-400" : stopHit ? "text-red-400" : "text-white"}`}>${currentPut.toFixed(2)}</span>
                  {livePrice.putBid != null && livePrice.putAsk != null && (
                    <span className="text-[10px] text-gray-600">(${livePrice.putBid.toFixed(2)}-${livePrice.putAsk.toFixed(2)})</span>
                  )}
                </div>
              )}
              <div className="flex items-center gap-1.5">
                <span className="text-[10px] text-gray-600">P&L:</span>
                <span className={`text-xs font-bold ${livePrice.unrealizedPnl >= 0 ? "text-green-400" : "text-red-400"}`}>
                  {livePrice.unrealizedPnl >= 0 ? "+" : ""}${livePrice.unrealizedPnl.toFixed(0)}
                </span>
              </div>
            </div>
          )}

          {/* Profit progress bar for open trades */}
          {isOpen && profitPct !== null && (
            <div className="mt-1.5">
              <div className="flex items-center gap-2">
                <div className="flex-1 h-1.5 bg-gray-700 rounded-full overflow-hidden relative">
                  {/* Stop loss zone (right side, red) */}
                  <div className="absolute right-0 top-0 h-full bg-red-900/40 rounded-r-full" style={{ width: "33%" }} />
                  {/* Profit target marker at 50% */}
                  <div className="absolute top-0 h-full w-px bg-green-500/60" style={{ left: "50%" }} />
                  {/* Current position */}
                  <div
                    className={`h-full rounded-full transition-all ${profitPct >= 50 ? "bg-green-500" : profitPct >= 0 ? "bg-blue-500" : "bg-red-500"}`}
                    style={{ width: `${Math.min(100, Math.max(0, profitPct))}%` }}
                  />
                </div>
                <span className={`text-[10px] font-medium w-10 text-right ${profitPct >= 50 ? "text-green-400" : profitPct >= 0 ? "text-blue-400" : "text-red-400"}`}>
                  {profitPct.toFixed(0)}%
                </span>
              </div>
              <div className="flex justify-between text-[9px] text-gray-600 mt-0.5">
                <span>Entry</span>
                {profitTarget != null && <span className="text-green-600">50% @ ${profitTarget.toFixed(2)}</span>}
                {stopLoss != null && <span className="text-red-600">Stop @ ${stopLoss.toFixed(2)}</span>}
              </div>
            </div>
          )}

          {/* Targets for open trades without live data */}
          {isOpen && profitPct === null && trade.profit_target_price && (
            <div className="flex items-center gap-3 mt-1">
              <span className="text-[10px] text-green-500">50% target: ${Number(trade.profit_target_price).toFixed(2)}</span>
              <span className="text-[10px] text-red-500">Stop: ${Number(trade.stop_loss_price).toFixed(2)}</span>
              {trade.management_date && (
                <span className="text-[10px] text-yellow-500">Manage by: {trade.management_date}</span>
              )}
            </div>
          )}
        </div>

        <div className="flex items-center gap-2 sm:ml-3 shrink-0">
          {pnl !== null && (
            <div className="text-right mr-1">
              <div className={`font-bold ${pnl >= 0 ? "text-green-400" : "text-red-400"}`}>{pnl >= 0 ? "+" : ""}${pnl.toFixed(0)}</div>
              <div className="text-[10px] text-gray-500">{trade.pnl_percent ? `${Number(trade.pnl_percent).toFixed(2)}%` : ""}</div>
            </div>
          )}
          {isOpen && (
            <>
              <button onClick={onClose} className="px-2.5 py-1.5 text-[10px] bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors font-medium">Close</button>
              <button onClick={onRoll} className="px-2.5 py-1.5 text-[10px] bg-purple-600 hover:bg-purple-700 text-white rounded-lg transition-colors font-medium">Roll</button>
            </>
          )}
          <button onClick={onDelete} disabled={deleting} className="px-2 py-1.5 text-xs bg-gray-700 hover:bg-red-900/50 text-gray-500 hover:text-red-400 rounded-lg transition-colors" title="Delete trade">{deleting ? "..." : "\u2715"}</button>
        </div>
      </div>
    </div>
  );
}
