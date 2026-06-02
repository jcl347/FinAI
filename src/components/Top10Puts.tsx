"use client";

import { useState } from "react";
import { getChecklistSummary, type ChecklistInput, type StockContext } from "@/lib/checklist";
import SimulateTradeModal from "./SimulateTradeModal";

interface Top10Put {
  symbol: string;
  companyName: string;
  stockPrice: number;
  strikePrice: number;
  expiration: string;
  dte: number;
  bid: number;
  ask: number;
  delta: number;
  theta: number;
  score: number;
  stabilityScore: number;
  annualizedReturn: number;
  distanceOTM: number;
  premiumYield: number;
  openInterest: number;
  recommendation: string;
  signals: { name: string; value: string; sentiment: string; weight: number }[];
  // Checklist context (passed through from screener)
  _checklistInput?: ChecklistInput;
}

interface Top10PutsProps {
  puts: Top10Put[];
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

const flagColors = {
  pass: "bg-green-900/40 text-green-400 border-green-700/30",
  warn: "bg-yellow-900/40 text-yellow-400 border-yellow-700/30",
  fail: "bg-red-900/40 text-red-400 border-red-700/30",
};

const verdictIcons = {
  "SELL PUT": { icon: "\u2713", color: "text-green-400" },
  "CAUTION": { icon: "!", color: "text-yellow-400" },
  "AVOID": { icon: "\u2717", color: "text-red-400" },
};

function ReadingGuide() {
  return (
    <div className="bg-gray-900/60 border border-gray-700/50 rounded-lg p-4 mb-4 text-xs">
      <h3 className="text-sm font-medium text-white mb-2">How to Read This Table</h3>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-x-6 gap-y-2 text-gray-400">
        <div>
          <span className="text-blue-400 font-medium">Score (0-100):</span>{" "}
          Composite rank combining premium yield, delta quality, DTE, liquidity, distance OTM, IV rank, and company stability.
          Higher = better risk-adjusted opportunity.{" "}
          <span className="text-white">75+ is strong, 55-74 is good, below 55 is marginal.</span>
        </div>
        <div>
          <span className="text-green-400 font-medium">Premium & Annualized %:</span>{" "}
          Cash you collect per share upfront. Annualized return normalizes across different DTEs for direct comparison.
          {" "}<span className="text-white">Compare annualized return, not raw premium.</span>
        </div>
        <div>
          <span className="text-yellow-400 font-medium">Stability & Delta:</span>{" "}
          Stability (0-100) rates the company as a stock you&apos;d want to own if assigned.
          Delta is your approximate probability of assignment.{" "}
          <span className="text-white">Sweet spot: stability 70+, |delta| 0.15-0.25.</span>
        </div>
      </div>
      <div className="mt-2 pt-2 border-t border-gray-700/30 text-gray-500">
        <span className="text-purple-400 font-medium">Best pick:</span>{" "}
        One entry per stock showing its highest-scoring put. The best trade balances high annualized return + high stability + moderate delta.
        Flags show IV rank, trend, and market conditions at a glance.
        Click any row to expand full trade details and scoring breakdown.
      </div>
    </div>
  );
}

function CrossComparisonGuide() {
  return (
    <div className="bg-gray-900/70 border border-gray-700/50 rounded-lg p-4 mb-4 text-xs space-y-3">
      <h3 className="text-sm font-medium text-white mb-2">How to Evaluate & Cross-Compare</h3>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <div>
          <div className="text-blue-400 font-medium mb-1">Score (0-100)</div>
          <p className="text-gray-400">
            Composite rank combining premium yield, delta, DTE, liquidity, distance OTM, IV environment, and company stability.
            <span className="text-white"> Compare scores at similar DTE ranges</span> — a 78 at 31d DTE
            is not directly comparable to a 78 at 60d DTE since theta decay differs.
          </p>
        </div>

        <div>
          <div className="text-green-400 font-medium mb-1">Premium ($)</div>
          <p className="text-gray-400">
            Mid-price per share you collect upfront. Higher premium = more income but usually means closer to the money.
            <span className="text-white"> Compare premium relative to collateral</span> (strike x 100) — $7.70 on a $360 strike
            is 2.1% yield vs $15.88 on $760 is also 2.1%.
          </p>
        </div>

        <div>
          <div className="text-green-400 font-medium mb-1">Annualized Return (%)</div>
          <p className="text-gray-400">
            Premium yield scaled to 365 days for apples-to-apples comparison across different DTEs.
            <span className="text-white"> This is the primary cross-comparison metric.</span>
            {" "}25% annualized at 31d DTE is better risk-adjusted than 25% at 60d DTE (same return, less time at risk).
          </p>
        </div>

        <div>
          <div className="text-yellow-400 font-medium mb-1">Stability (0-100)</div>
          <p className="text-gray-400">
            Company quality: market cap (30%), beta (30%), 52-week range position (25%), dividend yield (15%).
            <span className="text-white"> If assigned, you own this stock.</span>
            {" "}Stability 85+ = blue-chip, 60-84 = solid, below 60 = speculative.
          </p>
        </div>

        <div>
          <div className="text-gray-300 font-medium mb-1">Delta</div>
          <p className="text-gray-400">
            Approximate probability of being assigned (ITM at expiration). -0.20 delta = 80% chance of profit.
            <span className="text-white"> Lower |delta| = safer but less premium.</span>
            {" "}Sweet spot: -0.15 to -0.25 (tastytrade/DataDrivenOptions research).
          </p>
        </div>

        <div>
          <div className="text-purple-400 font-medium mb-1">Cross-Comparison Tips</div>
          <p className="text-gray-400">
            <span className="text-white">Best trade:</span> highest annualized return + stability &ge;70 + |delta| &le; 0.25.
            {" "}Watch for traps: high annualized return with low stability or high |delta| means the premium
            compensates for elevated assignment risk.
          </p>
        </div>
      </div>
    </div>
  );
}

export default function Top10Puts({ puts, onTradeSimulated }: Top10PutsProps) {
  const [expandedRow, setExpandedRow] = useState<number | null>(null);
  const [showGuide, setShowGuide] = useState(false);
  const [simulatingPut, setSimulatingPut] = useState<Top10Put | null>(null);

  // Already deduplicated upstream (1 best per stock, sorted by score)
  const displayPuts = puts.slice(0, 10);

  if (displayPuts.length === 0) return null;

  return (
    <div className="bg-gray-800/50 border border-gray-700 rounded-lg p-4">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <h2 className="text-lg font-semibold text-white">
            Top 10 Put Sales Today
          </h2>
          <button
            onClick={(e) => { e.stopPropagation(); setShowGuide(!showGuide); }}
            className="w-5 h-5 rounded-full bg-gray-700 hover:bg-gray-600 text-gray-400 hover:text-white text-xs flex items-center justify-center transition-colors"
            title="How to evaluate these numbers"
          >
            ?
          </button>
        </div>
        <span className="text-xs text-gray-500">
          Best put per stock across {displayPuts.length} companies, ranked by score
        </span>
      </div>

      {/* Always show the reading guide */}
      <ReadingGuide />

      {showGuide && <CrossComparisonGuide />}

      <div className="space-y-1">
        {displayPuts.map((put, i) => {
          const colors = recColors[put.recommendation] ?? recColors.NEUTRAL;
          const isExpanded = expandedRow === i;
          const midPrice = (put.bid + put.ask) / 2;

          // Evaluate checklist if context is available
          const summary = put._checklistInput
            ? getChecklistSummary(put._checklistInput)
            : null;

          return (
            <div
              key={`${put.symbol}-${put.strikePrice}-${put.expiration}`}
              className={`rounded-lg border transition-colors cursor-pointer ${
                isExpanded
                  ? "border-blue-500/40 bg-gray-800/60"
                  : "border-gray-700/50 hover:bg-gray-800/40"
              }`}
              onClick={() => setExpandedRow(isExpanded ? null : i)}
            >
              {/* Main row — desktop: single flex row; mobile: stacked compact layout */}
              <div className="p-3">
                {/* Desktop layout (md+) */}
                <div className="hidden md:flex items-center gap-3">
                  {/* Rank */}
                  <div className="w-8 text-center">
                    <span className={`text-lg font-bold ${i < 3 ? "text-yellow-400" : "text-gray-500"}`}>
                      {i + 1}
                    </span>
                  </div>

                  {/* Score */}
                  <div className="w-16">
                    <div className={`text-2xl font-bold ${put.score >= 75 ? "text-green-400" : put.score >= 55 ? "text-blue-400" : "text-yellow-400"}`}>
                      {put.score.toFixed(0)}
                    </div>
                    <div className="text-[10px] text-gray-600">score</div>
                  </div>

                  {/* Symbol & Company */}
                  <div className="w-36 min-w-0">
                    <div className="flex items-center gap-1.5">
                      <span className="text-white font-bold">{put.symbol}</span>
                      {summary && (
                        <span className={`text-xs font-bold ${verdictIcons[summary.verdict].color}`} title={`${summary.passes}/${summary.items.length} checks pass`}>
                          {verdictIcons[summary.verdict].icon}
                        </span>
                      )}
                    </div>
                    <div className="text-xs text-gray-500 truncate">{put.companyName}</div>
                  </div>

                  {/* Recommendation */}
                  <div className="w-28">
                    <span className={`px-2 py-0.5 rounded text-xs font-medium ${colors.bg} ${colors.text}`}>
                      {recLabels[put.recommendation] ?? put.recommendation}
                    </span>
                  </div>

                  {/* Key checklist flags */}
                  <div className="w-40 hidden lg:flex items-center gap-1 flex-wrap">
                    {summary?.flags.slice(0, 3).map((flag, fi) => (
                      <span key={fi} className={`px-1.5 py-0.5 rounded text-[10px] font-medium border ${flagColors[flag.status]}`}>
                        {flag.short}
                      </span>
                    ))}
                    {!summary && <span className="text-[10px] text-gray-600">No context</span>}
                  </div>

                  {/* Strike & Exp */}
                  <div className="w-28 text-sm">
                    <div className="text-white font-medium">${put.strikePrice.toFixed(0)} put</div>
                    <div className="text-gray-500 text-xs">{put.expiration} ({put.dte}d)</div>
                  </div>

                  {/* Premium */}
                  <div className="w-20 text-sm">
                    <div className="text-green-400 font-medium">${midPrice.toFixed(2)}</div>
                    <div className="text-gray-500 text-xs">premium</div>
                  </div>

                  {/* Annualized Return */}
                  <div className="w-20 text-sm">
                    <div className={`font-medium ${put.annualizedReturn >= 10 ? "text-green-400" : "text-yellow-400"}`}>
                      {put.annualizedReturn.toFixed(1)}%
                    </div>
                    <div className="text-gray-500 text-xs">annualized</div>
                  </div>

                  {/* Stability */}
                  <div className="w-20 text-sm">
                    <div className={`font-medium ${put.stabilityScore >= 70 ? "text-green-400" : put.stabilityScore >= 50 ? "text-yellow-400" : "text-red-400"}`}>
                      {put.stabilityScore.toFixed(0)}/100
                    </div>
                    <div className="text-gray-500 text-xs">stability</div>
                  </div>

                  {/* Delta */}
                  <div className="w-16 text-sm hidden lg:block">
                    <div className="text-gray-400">{Math.abs(put.delta).toFixed(2)}</div>
                    <div className="text-gray-600 text-[10px]">delta</div>
                  </div>

                  {/* Expand */}
                  <div className="w-6 text-gray-500 text-sm ml-auto">
                    {isExpanded ? "\u25B2" : "\u25BC"}
                  </div>
                </div>

                {/* Mobile layout (<md) */}
                <div className="md:hidden">
                  {/* Row 1: Rank + Score + Symbol + Rec + Expand */}
                  <div className="flex items-center gap-2 mb-1.5">
                    <span className={`text-sm font-bold ${i < 3 ? "text-yellow-400" : "text-gray-500"}`}>
                      {i + 1}
                    </span>
                    <span className={`text-xl font-bold ${put.score >= 75 ? "text-green-400" : put.score >= 55 ? "text-blue-400" : "text-yellow-400"}`}>
                      {put.score.toFixed(0)}
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1">
                        <span className="text-white font-bold text-sm">{put.symbol}</span>
                        {summary && (
                          <span className={`text-xs font-bold ${verdictIcons[summary.verdict].color}`}>
                            {verdictIcons[summary.verdict].icon}
                          </span>
                        )}
                        <span className={`ml-1 px-1.5 py-0.5 rounded text-[10px] font-medium ${colors.bg} ${colors.text}`}>
                          {recLabels[put.recommendation] ?? put.recommendation}
                        </span>
                      </div>
                      <div className="text-[11px] text-gray-500 truncate">{put.companyName}</div>
                    </div>
                    <span className="text-gray-500 text-sm">{isExpanded ? "\u25B2" : "\u25BC"}</span>
                  </div>

                  {/* Row 2: Key metrics in flex-wrap */}
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-gray-400 pl-6">
                    <span><span className="text-white font-medium">${put.strikePrice.toFixed(0)}</span> put</span>
                    <span><span className="text-green-400 font-medium">${midPrice.toFixed(2)}</span> prem</span>
                    <span><span className={`font-medium ${put.annualizedReturn >= 10 ? "text-green-400" : "text-yellow-400"}`}>{put.annualizedReturn.toFixed(1)}%</span> ann</span>
                    <span><span className={`font-medium ${put.stabilityScore >= 70 ? "text-green-400" : put.stabilityScore >= 50 ? "text-yellow-400" : "text-red-400"}`}>{put.stabilityScore.toFixed(0)}</span> stab</span>
                    <span>{put.dte}d · δ{Math.abs(put.delta).toFixed(2)}</span>
                  </div>
                </div>
              </div>

              {/* Expanded details */}
              {isExpanded && (
                <div className="px-4 pb-4 pt-1 border-t border-gray-700/50">
                  {/* Checklist summary when expanded */}
                  {summary && (
                    <div className="mb-3 p-2 bg-gray-900/50 rounded-lg border border-gray-700/50">
                      <div className="flex items-center gap-2 mb-2">
                        <span className={`font-bold text-sm ${verdictIcons[summary.verdict].color}`}>
                          {summary.verdict}
                        </span>
                        <span className="text-xs text-gray-500">
                          {summary.passes} pass, {summary.warns} caution, {summary.fails} fail
                        </span>
                      </div>
                      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-1.5">
                        {summary.items.map((item, idx) => (
                          <div key={idx} className="flex items-center gap-1.5 text-xs">
                            <span className={`font-bold ${
                              item.status === "pass" ? "text-green-400" :
                              item.status === "warn" ? "text-yellow-400" : "text-red-400"
                            }`}>
                              {item.status === "pass" ? "\u2713" : item.status === "warn" ? "!" : "\u2717"}
                            </span>
                            <span className="text-gray-300">{item.label}</span>
                            <span className="text-gray-600 truncate">{item.detail}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    {/* Trade Details */}
                    <div>
                      <h4 className="text-xs font-medium text-gray-500 uppercase mb-2">
                        Trade Details
                      </h4>
                      <div className="space-y-1 text-sm">
                        <div className="flex justify-between">
                          <span className="text-gray-400">Stock Price</span>
                          <span className="text-white">
                            ${put.stockPrice.toFixed(2)}
                          </span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-gray-400">Collateral</span>
                          <span className="text-white">
                            ${(put.strikePrice * 100).toLocaleString()}
                          </span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-gray-400">Premium</span>
                          <span className="text-green-400">
                            ${(midPrice * 100).toFixed(0)}
                          </span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-gray-400">Breakeven</span>
                          <span className="text-white">
                            ${(put.strikePrice - midPrice).toFixed(2)}
                          </span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-gray-400">Distance OTM</span>
                          <span className="text-white">
                            {put.distanceOTM.toFixed(1)}%
                          </span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-gray-400">Delta</span>
                          <span className="text-white">
                            {put.delta.toFixed(3)}
                          </span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-gray-400">Theta/day</span>
                          <span className="text-green-400">
                            ${(Math.abs(put.theta) * 100).toFixed(2)}
                          </span>
                        </div>
                      </div>
                    </div>

                    {/* Scoring Signals */}
                    <div className="md:col-span-2">
                      <h4 className="text-xs font-medium text-gray-500 uppercase mb-2">
                        Scoring Breakdown
                      </h4>
                      <div className="grid grid-cols-2 gap-x-4 gap-y-1.5">
                        {put.signals.map((signal) => (
                          <div
                            key={signal.name}
                            className="flex items-center justify-between text-sm"
                          >
                            <span className="text-gray-400">{signal.name}</span>
                            <div className="flex items-center gap-1.5">
                              <span className="text-white text-xs">
                                {signal.value}
                              </span>
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
                  <div className="mt-3 pt-3 border-t border-gray-700/50 flex items-center flex-wrap gap-2 text-xs">
                    <span className="px-2 py-1 bg-gray-700/50 rounded text-gray-300" title="Strongly validated by tastytrade, DataDrivenOptions. 25% also viable for faster capital turnover.">
                      Take profit ~50% (${(midPrice * 50).toFixed(0)} gain)
                    </span>
                    <span className="px-2 py-1 bg-gray-700/50 rounded text-gray-300" title="Tastytrade guideline. Contested — some studies show wider stops or mechanical 21 DTE management works better.">
                      Stop ~2x credit (${(midPrice * 100).toFixed(0)} loss)
                    </span>
                    <span className="px-2 py-1 bg-blue-900/30 rounded text-blue-300" title="Most validated rule. Gamma risk accelerates near expiration. Roll or close to manage risk.">
                      Manage at 21 DTE
                    </span>
                    <button
                      onClick={(e) => { e.stopPropagation(); setSimulatingPut(put); }}
                      className="ml-auto px-3 py-1.5 bg-green-600 hover:bg-green-700 text-white rounded-lg font-medium transition-colors"
                    >
                      Simulate Trade
                    </button>
                  </div>
                </div>
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
            companyName: simulatingPut.companyName,
            strikePrice: simulatingPut.strikePrice,
            expiration: simulatingPut.expiration,
            dteAtEntry: simulatingPut.dte,
            premiumReceived: (simulatingPut.bid + simulatingPut.ask) / 2,
            stockPriceAtEntry: simulatingPut.stockPrice,
            deltaAtEntry: simulatingPut.delta,
            scoreAtEntry: simulatingPut.score,
            stabilityScoreAtEntry: simulatingPut.stabilityScore,
            ivRankAtEntry: simulatingPut._checklistInput?.ivRank,
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
