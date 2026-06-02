"use client";

import { useState } from "react";

interface TradeData {
  symbol: string;
  companyName?: string;
  strikePrice: number;
  expiration: string;
  dteAtEntry: number;
  premiumReceived: number;
  stockPriceAtEntry: number;
  deltaAtEntry?: number;
  scoreAtEntry?: number;
  stabilityScoreAtEntry?: number;
  ivRankAtEntry?: number;
  vixAtEntry?: number;
  marketRegimeAtEntry?: string;
}

interface SimulateTradeModalProps {
  prefill?: Partial<TradeData>;
  onClose: () => void;
  onSuccess: () => void;
}

export default function SimulateTradeModal({ prefill, onClose, onSuccess }: SimulateTradeModalProps) {
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notes, setNotes] = useState("");
  const [quantity, setQuantity] = useState(1);
  const [contractSize, setContractSize] = useState(100);

  const symbol = prefill?.symbol ?? "";
  const strikePrice = prefill?.strikePrice ?? 0;
  const expiration = prefill?.expiration ?? "";
  const premium = prefill?.premiumReceived ?? 0;
  const stockPrice = prefill?.stockPriceAtEntry ?? 0;
  const collateral = strikePrice * contractSize * quantity;
  const yieldPct = collateral > 0 ? ((premium * contractSize * quantity) / collateral * 100).toFixed(2) : "0";

  // Management targets (research-backed defaults, not rigid rules)
  // - 50% profit: tastytrade validated; 25% also viable for faster capital turnover
  // - 2x credit stop (3x premium): tastytrade guideline, contested by SJ Options backtests;
  //   21 DTE management is the primary risk-reduction mechanism
  const profitTarget = premium * 0.5;
  const stopLoss = premium * 3;

  const handleSubmit = async () => {
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/trades", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          symbol: prefill?.symbol,
          companyName: prefill?.companyName,
          strikePrice: prefill?.strikePrice,
          expiration: prefill?.expiration,
          dteAtEntry: prefill?.dteAtEntry,
          premiumReceived: prefill?.premiumReceived,
          stockPriceAtEntry: prefill?.stockPriceAtEntry,
          deltaAtEntry: prefill?.deltaAtEntry,
          scoreAtEntry: prefill?.scoreAtEntry,
          stabilityScoreAtEntry: prefill?.stabilityScoreAtEntry,
          ivRankAtEntry: prefill?.ivRankAtEntry,
          vixAtEntry: prefill?.vixAtEntry,
          marketRegimeAtEntry: prefill?.marketRegimeAtEntry,
          quantity,
          contractSize,
          notes: notes || null,
        }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({ error: `HTTP ${res.status}` }));
        throw new Error(data.error || `Failed (HTTP ${res.status})`);
      }

      onSuccess();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save trade");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm" onClick={onClose}>
      <div
        className="bg-gray-900 border border-gray-700 rounded-xl p-6 w-full max-w-md mx-4 shadow-2xl max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold text-white">Simulate Put Sale</h3>
          <button onClick={onClose} className="text-gray-500 hover:text-white text-xl leading-none">&times;</button>
        </div>

        {/* Trade Summary */}
        <div className="bg-gray-800/70 rounded-lg p-4 mb-4 space-y-2">
          <div className="flex justify-between text-sm">
            <span className="text-gray-400">Symbol</span>
            <span className="text-white font-bold">{symbol}</span>
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-gray-400">Stock Price</span>
            <span className="text-white">${stockPrice.toFixed(2)}</span>
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-gray-400">Strike</span>
            <span className="text-white">${strikePrice.toFixed(2)} put</span>
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-gray-400">Expiration</span>
            <span className="text-white">{expiration} ({prefill?.dteAtEntry ?? 0}d)</span>
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-gray-400">Premium (per share)</span>
            <span className="text-green-400 font-medium">${premium.toFixed(2)}</span>
          </div>
          {prefill?.scoreAtEntry != null && (
            <div className="flex justify-between text-sm">
              <span className="text-gray-400">Score</span>
              <span className="text-blue-400">{prefill.scoreAtEntry.toFixed(0)}</span>
            </div>
          )}
          {prefill?.deltaAtEntry != null && (
            <div className="flex justify-between text-sm">
              <span className="text-gray-400">Delta</span>
              <span className="text-gray-300">{prefill.deltaAtEntry.toFixed(3)}</span>
            </div>
          )}
        </div>

        {/* Quantity & Contract Size */}
        <div className="mb-4 space-y-2">
          <div>
            <label className="block text-sm text-gray-400 mb-1">Contracts</label>
            <div className="flex items-center gap-2">
              <button onClick={() => setQuantity(Math.max(1, quantity - 1))} className="w-8 h-8 bg-gray-800 border border-gray-700 rounded text-gray-300 hover:bg-gray-700">-</button>
              <input
                type="number"
                min={1}
                value={quantity}
                onChange={(e) => setQuantity(Math.max(1, parseInt(e.target.value) || 1))}
                className="w-16 bg-gray-800 border border-gray-700 rounded px-2 py-1 text-center text-white text-sm focus:outline-none focus:border-blue-500"
              />
              <button onClick={() => setQuantity(quantity + 1)} className="w-8 h-8 bg-gray-800 border border-gray-700 rounded text-gray-300 hover:bg-gray-700">+</button>
              <span className="text-xs text-gray-500 ml-2">x {contractSize} shares each</span>
            </div>
          </div>
          <div>
            <label className="block text-sm text-gray-400 mb-1">Shares per Contract</label>
            <select
              value={contractSize}
              onChange={(e) => setContractSize(Number(e.target.value))}
              className="bg-gray-800 border border-gray-700 rounded px-2 py-1 text-white text-sm focus:outline-none focus:border-blue-500"
            >
              <option value={100}>100 (Standard US Equity)</option>
              <option value={10}>10 (Mini)</option>
              <option value={1}>1 (Micro / Custom)</option>
            </select>
          </div>
        </div>

        {/* Position Summary */}
        <div className="bg-gray-800/70 rounded-lg p-3 mb-4 space-y-1.5">
          <div className="flex justify-between text-sm">
            <span className="text-gray-400">Collateral Required</span>
            <span className="text-white font-medium">${collateral.toLocaleString()}</span>
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-gray-400">Premium Gain</span>
            <span className="text-green-400">${(premium * contractSize * quantity).toFixed(0)} ({yieldPct}%)</span>
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-gray-400">Max Loss</span>
            <span className="text-red-400">${((strikePrice - premium) * contractSize * quantity).toFixed(0)}</span>
          </div>
        </div>

        {/* Management Guidelines */}
        <div className="bg-blue-900/15 border border-blue-800/30 rounded-lg p-3 mb-4">
          <div className="text-[10px] text-blue-400 font-medium uppercase tracking-wide mb-1.5">Management Guidelines (Research-Backed Defaults)</div>
          <div className="space-y-1 text-xs">
            <div className="flex justify-between">
              <span className="text-gray-400">Take profit at 50%</span>
              <span className="text-green-400">Buy back at ${profitTarget.toFixed(2)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-400">Stop at 2x credit loss</span>
              <span className="text-red-400">Buy back at ${stopLoss.toFixed(2)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-400">Manage at 21 DTE</span>
              <span className="text-yellow-400">Roll or close (reduces gamma risk)</span>
            </div>
          </div>
          <div className="mt-2 text-[10px] text-gray-600 leading-snug">
            Sources: tastytrade, DataDrivenOptions, Spintwig. Profit target and 21 DTE are strongly validated. Stop loss is a starting guideline — some studies show wider stops (3-4x) or no fixed stop with mechanical 21 DTE management can perform better.
          </div>
        </div>

        {/* Contract sizing note */}
        <div className="text-[10px] text-gray-600 mb-4 leading-snug">
          Standard US equity options = 100 shares/contract (OCC). Collateral = strike x shares/contract x contracts. Small accounts may consider vertical spreads for lower capital requirements.
        </div>

        {/* Notes */}
        <div className="mb-4">
          <label className="block text-sm text-gray-400 mb-1">Notes (optional)</label>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-blue-500"
            rows={2}
            placeholder="e.g., Earnings in 50d, below support at $340..."
          />
        </div>

        {error && (
          <div className="mb-3 text-sm text-red-400 bg-red-900/20 border border-red-700/30 rounded px-3 py-2">
            {error}
          </div>
        )}

        <div className="flex gap-3">
          <button
            onClick={onClose}
            className="flex-1 px-4 py-2 bg-gray-800 text-gray-400 rounded-lg hover:bg-gray-700 transition-colors text-sm"
          >
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            disabled={saving}
            className="flex-1 px-4 py-2 bg-green-600 hover:bg-green-700 disabled:bg-green-800 disabled:text-green-400 text-white font-medium rounded-lg transition-colors text-sm"
          >
            {saving ? "Saving..." : `Open Trade (${quantity} contract${quantity > 1 ? "s" : ""})`}
          </button>
        </div>
      </div>
    </div>
  );
}
