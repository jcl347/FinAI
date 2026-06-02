"use client";

import { useState } from "react";
import SimulateTradeModal from "./SimulateTradeModal";

interface ScoredPut {
  symbol: string;
  stockPrice: number;
  strikePrice: number;
  expiration: string;
  dte: number;
  bid: number;
  ask: number;
  lastPrice: number;
  volume: number;
  openInterest: number;
  impliedVolatility: number;
  delta: number;
  theta: number;
  score: number;
  premiumYield: number;
  annualizedReturn: number;
  distanceOTM: number;
  bidAskSpread: number;
  recommendation: string;
  signals: { name: string; value: string; sentiment: string; weight: number }[];
}

interface PutTableProps {
  puts: ScoredPut[];
  title?: string;
  onTradeSimulated?: () => void;
}

const recColors: Record<string, { bg: string; text: string }> = {
  STRONG_SELL: { bg: "bg-green-900/40", text: "text-green-300" },
  SELL: { bg: "bg-green-900/20", text: "text-green-400" },
  NEUTRAL: { bg: "bg-yellow-900/20", text: "text-yellow-400" },
  AVOID: { bg: "bg-red-900/20", text: "text-red-400" },
};

const recLabels: Record<string, string> = {
  STRONG_SELL: "Strong Sell Put",
  SELL: "Sell Put",
  NEUTRAL: "Neutral",
  AVOID: "Avoid",
};

function scoreColor(score: number) {
  return score >= 75
    ? "text-green-400"
    : score >= 55
    ? "text-blue-400"
    : score >= 40
    ? "text-yellow-400"
    : "text-red-400";
}

function annReturnColor(annReturn: number) {
  return annReturn >= 10
    ? "text-green-400"
    : annReturn >= 5
    ? "text-yellow-400"
    : "text-gray-400";
}

function ExpandedDetails({ put, onSimulate }: { put: ScoredPut; onSimulate: () => void }) {
  const midPrice = (put.bid + put.ask) / 2;
  return (
    <div className="px-4 pb-3 pt-1 border-t border-gray-700/50">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Trade Details */}
        <div>
          <h4 className="text-xs font-medium text-gray-500 uppercase mb-2">
            Trade Details
          </h4>
          <div className="space-y-1 text-sm">
            <div className="flex justify-between">
              <span className="text-gray-400">Collateral Required</span>
              <span className="text-white">${(put.strikePrice * 100).toLocaleString()}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-400">Premium Received</span>
              <span className="text-green-400">${(midPrice * 100).toFixed(0)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-400">Breakeven Price</span>
              <span className="text-white">${(put.strikePrice - midPrice).toFixed(2)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-400">Max Profit</span>
              <span className="text-green-400">
                ${(midPrice * 100).toFixed(0)} ({put.premiumYield.toFixed(2)}%)
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-400">Max Loss</span>
              <span className="text-red-400">
                ${((put.strikePrice - midPrice) * 100).toFixed(0)}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-400">Theta (daily decay)</span>
              <span className="text-green-400">${(Math.abs(put.theta) * 100).toFixed(2)}/day</span>
            </div>
          </div>
        </div>

        {/* Scoring Signals */}
        <div>
          <h4 className="text-xs font-medium text-gray-500 uppercase mb-2">
            Scoring Signals
          </h4>
          <div className="space-y-1.5">
            {put.signals.map((signal) => (
              <div
                key={signal.name}
                className="flex items-center justify-between text-sm"
              >
                <span className="text-gray-400">{signal.name}</span>
                <div className="flex items-center gap-2">
                  <span className="text-white">{signal.value}</span>
                  <span
                    className={`w-2 h-2 rounded-full ${
                      signal.sentiment === "bullish"
                        ? "bg-green-400"
                        : signal.sentiment === "bearish"
                        ? "bg-red-400"
                        : "bg-yellow-400"
                    }`}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Management Guidelines */}
      <div className="mt-3 pt-3 border-t border-gray-700/50">
        <h4 className="text-xs font-medium text-gray-500 uppercase mb-1">
          Management Guidelines (Research-Backed Defaults)
        </h4>
        <div className="flex items-center flex-wrap gap-2 text-xs">
          <span className="px-2 py-1 bg-gray-700/50 rounded text-gray-300" title="Strongly validated by tastytrade research. 25% also viable for faster capital turnover.">
            Take profit ~50% (${(midPrice * 50).toFixed(0)} gain)
          </span>
          <span className="px-2 py-1 bg-gray-700/50 rounded text-gray-300" title="Tastytrade guideline, contested by independent backtests. Consider wider stops or mechanical 21 DTE management.">
            Stop ~2x credit (${(midPrice * 100).toFixed(0)} loss)
          </span>
          <span className="px-2 py-1 bg-blue-900/30 rounded text-blue-300" title="Most validated rule — reduces gamma risk near expiration.">
            Manage at 21 DTE
          </span>
          <button
            onClick={(e) => { e.stopPropagation(); onSimulate(); }}
            className="ml-auto px-3 py-1.5 bg-green-600 hover:bg-green-700 text-white rounded-lg font-medium transition-colors"
          >
            Simulate Trade
          </button>
        </div>
      </div>
    </div>
  );
}

export default function PutTable({ puts, title, onTradeSimulated }: PutTableProps) {
  const [expandedRow, setExpandedRow] = useState<number | null>(null);
  const [simulatingPut, setSimulatingPut] = useState<ScoredPut | null>(null);

  if (puts.length === 0) {
    return (
      <div className="text-center py-8 text-gray-500">
        No put options match the criteria for this stock.
      </div>
    );
  }

  return (
    <div>
      {title && (
        <h3 className="text-lg font-semibold text-white mb-3">{title}</h3>
      )}

      {/* Desktop table layout (md+) */}
      <div className="hidden md:block overflow-x-auto">
        <div className="min-w-[800px]">
          {/* Header row */}
          <div className="flex items-center py-2 px-1 gap-3 text-sm border-b border-gray-700 text-gray-400">
            <div className="w-12 shrink-0">Score</div>
            <div className="w-28 shrink-0">Rec.</div>
            <div className="w-20 shrink-0">Strike</div>
            <div className="w-24 shrink-0">Exp</div>
            <div className="w-12 shrink-0">DTE</div>
            <div className="w-16 shrink-0">Bid</div>
            <div className="w-16 shrink-0">Ask</div>
            <div className="w-16 shrink-0">Delta</div>
            <div className="w-24 shrink-0">Ann. Return</div>
            <div className="w-20 shrink-0">Dist. OTM</div>
            <div className="w-16 shrink-0">OI</div>
            <div className="w-6 shrink-0"></div>
          </div>

          {/* Desktop data rows */}
          {puts.map((put, i) => {
            const colors = recColors[put.recommendation] ?? recColors.NEUTRAL;
            const isExpanded = expandedRow === i;

            return (
              <div key={`${put.strikePrice}-${put.expiration}`}>
                <div
                  className={`border-b border-gray-800 hover:bg-gray-800/50 cursor-pointer transition-colors ${
                    isExpanded ? "bg-gray-800/30" : ""
                  }`}
                  onClick={() => setExpandedRow(isExpanded ? null : i)}
                >
                  <div className="flex items-center py-2 px-1 gap-3 text-sm">
                    <div className="w-12 shrink-0">
                      <span className={`font-bold text-base ${scoreColor(put.score)}`}>
                        {put.score.toFixed(0)}
                      </span>
                    </div>
                    <div className="w-28 shrink-0">
                      <span className={`px-2 py-0.5 rounded text-xs font-medium ${colors.bg} ${colors.text}`}>
                        {recLabels[put.recommendation] ?? put.recommendation}
                      </span>
                    </div>
                    <div className="w-20 shrink-0 text-white font-medium">
                      ${put.strikePrice.toFixed(2)}
                    </div>
                    <div className="w-24 shrink-0 text-gray-300">
                      {put.expiration}
                    </div>
                    <div className="w-12 shrink-0 text-gray-300">
                      {put.dte}d
                    </div>
                    <div className="w-16 shrink-0 text-green-400">
                      ${put.bid.toFixed(2)}
                    </div>
                    <div className="w-16 shrink-0 text-gray-300">
                      ${put.ask.toFixed(2)}
                    </div>
                    <div className="w-16 shrink-0 text-gray-300">
                      {Math.abs(put.delta).toFixed(2)}
                    </div>
                    <div className={`w-24 shrink-0 font-medium ${annReturnColor(put.annualizedReturn)}`}>
                      {put.annualizedReturn.toFixed(1)}%
                    </div>
                    <div className="w-20 shrink-0 text-gray-300">
                      {put.distanceOTM.toFixed(1)}%
                    </div>
                    <div className="w-16 shrink-0 text-gray-400">
                      {put.openInterest.toLocaleString()}
                    </div>
                    <div className="w-6 shrink-0 text-gray-500">
                      {isExpanded ? "▲" : "▼"}
                    </div>
                  </div>

                  {isExpanded && (
                    <ExpandedDetails put={put} onSimulate={() => setSimulatingPut(put)} />
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Mobile card layout (<md) */}
      <div className="md:hidden space-y-2">
        {puts.map((put, i) => {
          const colors = recColors[put.recommendation] ?? recColors.NEUTRAL;
          const isExpanded = expandedRow === i;

          return (
            <div
              key={`m-${put.strikePrice}-${put.expiration}`}
              className={`rounded-lg border transition-colors cursor-pointer ${
                isExpanded
                  ? "border-blue-500/40 bg-gray-800/60"
                  : "border-gray-700/50 hover:bg-gray-800/40"
              }`}
              onClick={() => setExpandedRow(isExpanded ? null : i)}
            >
              {/* Mobile card summary */}
              <div className="p-3">
                {/* Row 1: Score + Rec + Strike + Expand */}
                <div className="flex items-center justify-between mb-1.5">
                  <div className="flex items-center gap-2">
                    <span className={`font-bold text-lg ${scoreColor(put.score)}`}>
                      {put.score.toFixed(0)}
                    </span>
                    <span className={`px-2 py-0.5 rounded text-xs font-medium ${colors.bg} ${colors.text}`}>
                      {recLabels[put.recommendation] ?? put.recommendation}
                    </span>
                  </div>
                  <span className="text-gray-500 text-sm">{isExpanded ? "▲" : "▼"}</span>
                </div>

                {/* Row 2: Key metrics */}
                <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
                  <div>
                    <span className="text-gray-500 text-xs">Strike </span>
                    <span className="text-white font-medium">${put.strikePrice.toFixed(2)}</span>
                  </div>
                  <div>
                    <span className="text-gray-500 text-xs">Delta </span>
                    <span className="text-gray-300">{Math.abs(put.delta).toFixed(2)}</span>
                  </div>
                  <div>
                    <span className="text-gray-500 text-xs">Return </span>
                    <span className={`font-medium ${annReturnColor(put.annualizedReturn)}`}>
                      {put.annualizedReturn.toFixed(1)}%
                    </span>
                  </div>
                  <div>
                    <span className="text-gray-500 text-xs">Bid </span>
                    <span className="text-green-400">${put.bid.toFixed(2)}</span>
                  </div>
                  <div>
                    <span className="text-gray-500 text-xs">{put.dte}d</span>
                    <span className="text-gray-500 text-xs"> · {put.expiration}</span>
                  </div>
                </div>
              </div>

              {/* Expanded details (reuses same component) */}
              {isExpanded && (
                <ExpandedDetails put={put} onSimulate={() => setSimulatingPut(put)} />
              )}
            </div>
          );
        })}
      </div>

      {/* Simulate Trade Modal */}
      {simulatingPut && (
        <SimulateTradeModal
          prefill={{
            symbol: simulatingPut.symbol,
            strikePrice: simulatingPut.strikePrice,
            expiration: simulatingPut.expiration,
            dteAtEntry: simulatingPut.dte,
            premiumReceived: (simulatingPut.bid + simulatingPut.ask) / 2,
            stockPriceAtEntry: simulatingPut.stockPrice,
            deltaAtEntry: simulatingPut.delta,
            scoreAtEntry: simulatingPut.score,
          }}
          onClose={() => setSimulatingPut(null)}
          onSuccess={() => {
            setSimulatingPut(null);
            onTradeSimulated?.();
          }}
        />
      )}
    </div>
  );
}
