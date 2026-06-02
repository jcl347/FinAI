"use client";

import { useState, useEffect, useCallback } from "react";

/* eslint-disable @typescript-eslint/no-explicit-any */
interface QuantState {
  configured: boolean;
  initialized?: boolean;
  book?: { initialCapital: number; cash: number; holdings: Record<string, number>; lastRebalanceDate?: string | null };
  latestDate?: string | null;
  equityCurve?: { date: string; equity: number; deployedPct: number; regime: string }[];
  allocations?: { strategyKey: string; weight: number; benched: boolean; trailingSharpe: number | null; priorSharpe: number | null; reason: string }[];
  holdings?: { symbol: string; shares: number }[];
  recentTrades?: { date: string; symbol: string; side: string; shares: number; price: number; notional: number; cost: number; reason: string }[];
  stats?: { equity: number; totalReturnPct: number; cagrPct: number; sharpe: number; maxDrawdownPct: number; volPct: number; days: number };
}

const SLEEVE_LABELS: Record<string, string> = {
  xs_momentum: "Cross-Sectional Momentum",
  low_vol: "Low-Volatility Defensive",
  factor_momentum: "Factor-ETF Momentum",
  sector_rotation: "Sector Rotation",
  cross_asset_trend: "Cross-Asset Trend",
  tail_hedge: "Tail Hedge (VIX term)",
  ts_trend: "Time-Series Trend",
  st_reversal: "Short-Term Reversal",
};

const SLEEVE_COLOR: Record<string, string> = {
  xs_momentum: "#60a5fa", low_vol: "#34d399", factor_momentum: "#a78bfa", sector_rotation: "#fbbf24",
  cross_asset_trend: "#f472b6", tail_hedge: "#f87171", ts_trend: "#22d3ee", st_reversal: "#9ca3af",
};

function fmtUSD(n: number) {
  return "$" + Math.round(n).toLocaleString();
}

function EquityCurve({ curve, initial }: { curve: { date: string; equity: number }[]; initial: number }) {
  if (curve.length < 2) return <div className="text-gray-500 text-sm">Not enough data for a curve yet.</div>;
  const W = 720, H = 200, pad = 4;
  const eqs = curve.map((c) => c.equity);
  const min = Math.min(...eqs, initial), max = Math.max(...eqs, initial);
  const range = max - min || 1;
  const x = (i: number) => pad + (i / (curve.length - 1)) * (W - 2 * pad);
  const y = (v: number) => H - pad - ((v - min) / range) * (H - 2 * pad);
  const path = curve.map((c, i) => `${i === 0 ? "M" : "L"}${x(i).toFixed(1)},${y(c.equity).toFixed(1)}`).join(" ");
  const baseY = y(initial);
  const last = curve[curve.length - 1].equity;
  const up = last >= initial;
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full" preserveAspectRatio="none" style={{ height: 200 }}>
      <line x1={pad} y1={baseY} x2={W - pad} y2={baseY} stroke="#4b5563" strokeDasharray="4 4" strokeWidth={1} />
      <path d={`${path} L${x(curve.length - 1)},${H - pad} L${x(0)},${H - pad} Z`} fill={up ? "#10b98122" : "#ef444422"} />
      <path d={path} fill="none" stroke={up ? "#10b981" : "#ef4444"} strokeWidth={1.5} />
    </svg>
  );
}

export default function QuantDashboard() {
  const [state, setState] = useState<QuantState | null>(null);
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/quant/state");
      if (!res.ok) {
        setState({ configured: false });
        return;
      }
      setState(await res.json());
    } catch {
      setState({ configured: false });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const runDaily = useCallback(async () => {
    setRunning(true);
    setMsg(null);
    try {
      const res = await fetch("/api/quant/run?force=1", { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "run failed");
      setMsg(`Ran ${data.date}: ${data.status === "already-ran" ? "already recorded" : `${data.trades} trades, equity ${fmtUSD(data.equity ?? 0)}, regime ${data.regime}`}`);
      await load();
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "run failed");
    } finally {
      setRunning(false);
    }
  }, [load]);

  const reset = useCallback(async () => {
    if (!confirm("Reset the automated book to $100,000 and wipe all sim history?")) return;
    setRunning(true);
    try {
      const res = await fetch("/api/quant/reset", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ initialCapital: 100000 }) });
      if (!res.ok) throw new Error("reset failed");
      setMsg("Book reset to $100,000.");
      await load();
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "reset failed");
    } finally {
      setRunning(false);
    }
  }, [load]);

  if (loading) {
    return <div className="text-center py-16 text-gray-400">Loading automated strategy book…</div>;
  }

  if (!state?.configured) {
    return (
      <div className="bg-gray-800/50 border border-gray-700 rounded-lg p-6 space-y-3">
        <h3 className="text-white font-semibold">Automated Multi-Strategy Engine — not yet connected</h3>
        <p className="text-gray-400 text-sm">
          Set <code className="text-blue-300">DATABASE_URL</code> (Neon Postgres, same as the simulation trading setup), then a
          Vercel Cron runs the strategy daily. The system paper-trades a self-tracking portfolio of 8 sleeves and adapts
          allocations to what is working.
        </p>
        <ul className="text-gray-400 text-sm list-disc list-inside space-y-1">
          <li>Daily cron: <code className="text-blue-300">/api/quant/run</code> (configured in <code>vercel.json</code>, weekdays 21:30 UTC)</li>
          <li>Once connected, click <span className="text-white">Run Daily Now</span> to seed the first run.</li>
        </ul>
      </div>
    );
  }

  const s = state.stats;
  const alloc = (state.allocations ?? []).filter((a) => a.weight > 0 || a.benched);

  return (
    <div className="space-y-6">
      {/* Header + actions */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="text-white font-semibold text-lg">Automated Multi-Strategy Book</h3>
          <p className="text-gray-500 text-xs">
            Self-tracking adaptive allocator · 8 sleeves · daily sim {state.latestDate ? `· last run ${state.latestDate}` : ""}
          </p>
        </div>
        <div className="flex gap-2">
          <button onClick={runDaily} disabled={running} className="px-3 py-2 rounded-lg text-sm font-medium bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white">
            {running ? "Running…" : "Run Daily Now"}
          </button>
          <button onClick={load} className="px-3 py-2 rounded-lg text-sm bg-gray-700 hover:bg-gray-600 text-gray-200">Refresh</button>
          <button onClick={reset} disabled={running} className="px-3 py-2 rounded-lg text-sm bg-gray-800 hover:bg-red-900/40 text-gray-400 border border-gray-700">Reset</button>
        </div>
      </div>
      {msg && <div className="text-xs text-blue-300 bg-blue-900/20 border border-blue-700/30 rounded px-3 py-2">{msg}</div>}

      {!state.initialized || !s ? (
        <div className="text-center py-12 text-gray-400">
          Book initialized — no runs yet. Click <span className="text-white">Run Daily Now</span> to record the first day.
        </div>
      ) : (
        <>
          {/* KPI cards */}
          <div className="grid grid-cols-2 md:grid-cols-6 gap-3">
            {[
              { label: "Portfolio Value", value: fmtUSD(s.equity), tone: s.equity >= (state.book?.initialCapital ?? 0) ? "text-green-400" : "text-red-400" },
              { label: "Total Return", value: `${s.totalReturnPct >= 0 ? "+" : ""}${s.totalReturnPct}%`, tone: s.totalReturnPct >= 0 ? "text-green-400" : "text-red-400" },
              { label: "Sharpe", value: s.sharpe.toFixed(2), tone: "text-white" },
              { label: "Max Drawdown", value: `${s.maxDrawdownPct}%`, tone: "text-yellow-400" },
              { label: "Volatility", value: `${s.volPct}%`, tone: "text-white" },
              { label: "Days Live", value: String(s.days), tone: "text-gray-300" },
            ].map((k) => (
              <div key={k.label} className="bg-gray-800/50 border border-gray-700 rounded-lg p-3">
                <div className="text-[11px] text-gray-500">{k.label}</div>
                <div className={`text-lg font-bold ${k.tone}`}>{k.value}</div>
              </div>
            ))}
          </div>

          {/* Equity curve */}
          <div className="bg-gray-800/50 border border-gray-700 rounded-lg p-4">
            <div className="flex items-center justify-between mb-2">
              <h4 className="text-sm font-medium text-gray-400">Equity Curve (simulated)</h4>
              <span className="text-xs text-gray-500">start {fmtUSD(state.book?.initialCapital ?? 0)} · cash {fmtUSD(state.book?.cash ?? 0)}</span>
            </div>
            <EquityCurve curve={(state.equityCurve ?? []).map((c) => ({ date: c.date, equity: c.equity }))} initial={state.book?.initialCapital ?? 100000} />
          </div>

          {/* Allocations (self-tracking) */}
          <div className="bg-gray-800/50 border border-gray-700 rounded-lg p-4">
            <h4 className="text-sm font-medium text-gray-400 mb-1">Today&apos;s Allocation — adaptive (what the system is enacting)</h4>
            <p className="text-[11px] text-gray-600 mb-3">Each sleeve&apos;s capital share is driven by its realized rolling Sharpe (shrunk to a backtest prior), risk-balanced and regime-tilted. Benched sleeves are starved automatically.</p>
            <div className="space-y-2">
              {alloc.map((a) => (
                <div key={a.strategyKey} className="flex items-center gap-3">
                  <div className="w-44 text-xs text-gray-300 truncate">{SLEEVE_LABELS[a.strategyKey] ?? a.strategyKey}</div>
                  <div className="flex-1 h-5 bg-gray-900/60 rounded overflow-hidden relative">
                    <div className="h-full rounded" style={{ width: `${Math.min(100, a.weight * 100 * 2.5)}%`, background: a.benched ? "#4b5563" : (SLEEVE_COLOR[a.strategyKey] ?? "#60a5fa") }} />
                    <span className="absolute inset-0 flex items-center px-2 text-[11px] text-white/90">{(a.weight * 100).toFixed(1)}%{a.benched ? " · benched" : ""}</span>
                  </div>
                  <div className="w-28 text-[11px] text-gray-500 text-right">
                    Sh {a.trailingSharpe != null ? a.trailingSharpe.toFixed(2) : "—"}<span className="text-gray-700"> / prior {a.priorSharpe != null ? a.priorSharpe.toFixed(2) : "—"}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Holdings + recent trades */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <div className="bg-gray-800/50 border border-gray-700 rounded-lg p-4">
              <h4 className="text-sm font-medium text-gray-400 mb-3">Current Positions ({state.holdings?.length ?? 0})</h4>
              <div className="max-h-64 overflow-y-auto text-sm">
                <table className="w-full">
                  <thead className="text-[11px] text-gray-500 sticky top-0 bg-gray-800/90"><tr><th className="text-left py-1">Symbol</th><th className="text-right">Shares</th></tr></thead>
                  <tbody>
                    {(state.holdings ?? []).map((h) => (
                      <tr key={h.symbol} className="border-t border-gray-700/40"><td className="py-1 text-gray-200">{h.symbol}</td><td className="text-right text-gray-400">{h.shares.toFixed(2)}</td></tr>
                    ))}
                    {(state.holdings ?? []).length === 0 && <tr><td colSpan={2} className="py-3 text-gray-600 text-center">All cash</td></tr>}
                  </tbody>
                </table>
              </div>
            </div>
            <div className="bg-gray-800/50 border border-gray-700 rounded-lg p-4">
              <h4 className="text-sm font-medium text-gray-400 mb-3">Recent Simulated Trades</h4>
              <div className="max-h-64 overflow-y-auto text-xs space-y-1">
                {(state.recentTrades ?? []).map((t, i) => (
                  <div key={i} className="flex items-center gap-2 border-t border-gray-700/40 py-1">
                    <span className="text-gray-600 w-20">{t.date}</span>
                    <span className={`w-12 font-medium ${t.side === "BUY" ? "text-green-400" : t.side === "SELL" ? "text-yellow-400" : t.side === "SHORT" ? "text-red-400" : "text-blue-400"}`}>{t.side}</span>
                    <span className="text-gray-200 w-14">{t.symbol}</span>
                    <span className="text-gray-500 flex-1 truncate">{t.shares.toFixed(1)} @ ${t.price}</span>
                  </div>
                ))}
                {(state.recentTrades ?? []).length === 0 && <div className="py-3 text-gray-600 text-center">No trades yet</div>}
              </div>
            </div>
          </div>

          <p className="text-[10px] text-gray-600">
            Simulation only — no real orders. Sleeves, allocator, and costs are identical to the walk-forward backtest
            (research/results.md). The allocator adapts daily to realized rolling performance and de-risks in crises.
          </p>
        </>
      )}
    </div>
  );
}
