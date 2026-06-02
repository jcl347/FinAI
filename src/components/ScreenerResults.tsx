"use client";

import { useState } from "react";
import PutTable from "./PutTable";
import { getChecklistSummary, type ChecklistInput, type StockContext } from "@/lib/checklist";

interface ScreenerStock {
  symbol: string;
  quote: {
    symbol: string;
    name: string;
    price: number;
    change: number;
    changePercent: number;
    beta?: number;
    marketCap?: number;
    dividendYield?: number;
    trailingPE?: number;
    fiftyTwoWeekLow?: number;
    fiftyTwoWeekHigh?: number;
    volume?: number;
    avgVolume?: number;
  };
  ivRank: number;
  stability: {
    score: number;
    signals: { name: string; value: string; sentiment: string; weight: number }[];
  };
  context?: StockContext | null;
  vix?: number;
  topPuts: Array<{
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
    stabilityScore: number;
    recommendation: string;
    signals: { name: string; value: string; sentiment: string; weight: number }[];
  }>;
}

interface ScreenProgress {
  total: number;
  completed: number;
  currentSymbol: string;
  failedSymbols: { symbol: string; error: string }[];
}

interface ScreenerResultsProps {
  results: ScreenerStock[];
  loading: boolean;
  progress?: ScreenProgress | null;
  onAnalyze: (symbol: string) => void;
  globalVix?: number;
}

const flagColors = {
  pass: "bg-green-900/40 text-green-400 border-green-700/30",
  warn: "bg-yellow-900/40 text-yellow-400 border-yellow-700/30",
  fail: "bg-red-900/40 text-red-400 border-red-700/30",
};

const verdictConfig = {
  "SELL PUT": { color: "text-green-400", bg: "bg-green-900/30", border: "border-green-700/40", icon: "\u2713" },
  "CAUTION": { color: "text-yellow-400", bg: "bg-yellow-900/30", border: "border-yellow-700/40", icon: "!" },
  "AVOID": { color: "text-red-400", bg: "bg-red-900/30", border: "border-red-700/40", icon: "\u2717" },
};

export default function ScreenerResults({
  results,
  loading,
  progress,
  onAnalyze,
  globalVix,
}: ScreenerResultsProps) {
  const [expandedSymbol, setExpandedSymbol] = useState<string | null>(null);

  if (loading) {
    const pct = progress ? Math.round((progress.completed / progress.total) * 100) : 0;

    return (
      <div className="text-center py-12">
        <div className="w-8 h-8 border-2 border-gray-600 border-t-blue-400 rounded-full animate-spin mx-auto mb-3" />
        <p className="text-gray-400">
          Screening stocks for put selling opportunities...
        </p>
        {progress && (
          <div className="mt-4 max-w-md mx-auto">
            {/* Progress bar */}
            <div className="w-full bg-gray-800 rounded-full h-2 mb-2">
              <div
                className="bg-blue-500 h-2 rounded-full transition-all duration-300"
                style={{ width: `${pct}%` }}
              />
            </div>
            <p className="text-gray-500 text-sm">
              {progress.completed} of {progress.total} stocks analyzed ({pct}%)
            </p>
            {progress.currentSymbol && (
              <p className="text-blue-400 text-sm mt-1">
                Analyzing {progress.currentSymbol}...
              </p>
            )}
            {progress.failedSymbols.length > 0 && (
              <p className="text-yellow-500 text-xs mt-1">
                {progress.failedSymbols.length} failed: {progress.failedSymbols.map(f => f.symbol).join(", ")}
              </p>
            )}
          </div>
        )}
      </div>
    );
  }

  if (results.length === 0) {
    return (
      <div className="text-center py-12">
        <div className="text-4xl mb-3">&#128269;</div>
        <h3 className="text-lg font-medium text-white mb-2">
          No put selling opportunities found
        </h3>
        <p className="text-gray-400 text-sm max-w-md mx-auto">
          This can happen when markets are closed (weekends / after hours) and option pricing data is unavailable.
          Try again during regular market hours: Mon-Fri, 9:30 AM - 4:00 PM ET.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <h2 className="text-lg font-semibold text-white mb-4">
        All Screened Stocks ({results.length})
      </h2>
      {results.map((stock) => {
        const topPut = stock.topPuts[0];
        const isExpanded = expandedSymbol === stock.symbol;
        const isUp = stock.quote.change >= 0;

        // Build checklist input from stock data
        const checklistInput: ChecklistInput = {
          symbol: stock.symbol,
          price: stock.quote.price,
          ivRank: stock.ivRank ?? 50,
          beta: stock.quote.beta ?? 1,
          marketCap: stock.quote.marketCap ?? 0,
          dividendYield: stock.quote.dividendYield ?? 0,
          stabilityScore: stock.stability?.score ?? 50,
          vix: stock.vix ?? globalVix ?? 20,
          context: stock.context ?? null,
          trailingPE: stock.quote.trailingPE,
          fiftyTwoWeekLow: stock.quote.fiftyTwoWeekLow,
          fiftyTwoWeekHigh: stock.quote.fiftyTwoWeekHigh,
          volume: stock.quote.volume,
          avgVolume: stock.quote.avgVolume,
        };
        const summary = getChecklistSummary(checklistInput);
        const vc = verdictConfig[summary.verdict];

        return (
          <div
            key={stock.symbol}
            className="bg-gray-800/50 border border-gray-700 rounded-lg overflow-hidden"
          >
            <div
              className="p-3 cursor-pointer hover:bg-gray-800/80 transition-colors"
              onClick={() =>
                setExpandedSymbol(isExpanded ? null : stock.symbol)
              }
            >
              {/* Row 1: Symbol, name, price, expand arrow */}
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2 sm:gap-4 min-w-0">
                  <div className={`w-7 h-7 rounded-full flex items-center justify-center text-sm font-bold ${vc.bg} ${vc.color} border ${vc.border} shrink-0`}>
                    {vc.icon}
                  </div>
                  <div className="min-w-0">
                    <div className="flex items-center gap-1 sm:gap-2 flex-wrap">
                      <span className="text-white font-bold text-base sm:text-lg">
                        {stock.symbol}
                      </span>
                      <span className="text-gray-400 text-xs sm:text-sm truncate hidden sm:inline">
                        {stock.quote.name}
                      </span>
                      <span className={`text-xs sm:text-sm whitespace-nowrap ${isUp ? "text-green-400" : "text-red-400"}`}>
                        ${stock.quote.price.toFixed(2)} ({isUp ? "+" : ""}{stock.quote.changePercent.toFixed(2)}%)
                      </span>
                    </div>
                  </div>
                </div>
                <span className="text-gray-500 shrink-0">{isExpanded ? "\u25B2" : "\u25BC"}</span>
              </div>

              {/* Row 2: Stats + flags + analyze button */}
              <div className="flex items-center justify-between gap-2 mt-2 pl-9 sm:pl-11">
                <div className="flex items-center gap-1.5 flex-wrap">
                  <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium border ${flagColors[summary.verdict === "SELL PUT" ? "pass" : summary.verdict === "AVOID" ? "fail" : "warn"]}`}>
                    {summary.passes}/{summary.items.length} pass
                  </span>
                  {summary.flags.map((flag, fi) => (
                    <span key={fi} className={`px-1.5 py-0.5 rounded text-[10px] font-medium border ${flagColors[flag.status]}`}>
                      {flag.short}
                    </span>
                  ))}
                </div>

                <div className="flex items-center gap-2 sm:gap-4 shrink-0">
                  <div className="text-right hidden sm:block">
                    <div className="text-xs text-gray-500">Score</div>
                    <div className={`font-bold ${topPut.score >= 75 ? "text-green-400" : topPut.score >= 55 ? "text-blue-400" : "text-yellow-400"}`}>
                      {topPut.score.toFixed(0)}
                    </div>
                  </div>
                  <div className="text-right hidden sm:block">
                    <div className="text-xs text-gray-500">Stability</div>
                    <div className={`font-medium ${stock.stability.score >= 70 ? "text-green-400" : stock.stability.score >= 50 ? "text-yellow-400" : "text-red-400"}`}>
                      {stock.stability.score.toFixed(0)}
                    </div>
                  </div>
                  <div className="text-right hidden md:block">
                    <div className="text-xs text-gray-500">HV Rank</div>
                    <div className={`font-medium ${stock.ivRank >= 50 ? "text-green-400" : stock.ivRank >= 30 ? "text-yellow-400" : "text-gray-400"}`}>
                      {stock.ivRank.toFixed(0)}%
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="text-xs text-gray-500">Return</div>
                    <div className="text-green-400 font-medium">
                      {topPut.annualizedReturn.toFixed(1)}%
                    </div>
                  </div>
                  {/* Mobile: show score inline */}
                  <span className={`sm:hidden text-sm font-bold ${topPut.score >= 75 ? "text-green-400" : topPut.score >= 55 ? "text-blue-400" : "text-yellow-400"}`}>
                    {topPut.score.toFixed(0)}
                  </span>
                  <button
                    onClick={(e) => { e.stopPropagation(); onAnalyze(stock.symbol); }}
                    className="px-2 sm:px-3 py-1 text-xs bg-blue-600 hover:bg-blue-700 text-white rounded transition-colors"
                  >
                    <span className="hidden sm:inline">Full Analysis</span>
                    <span className="sm:hidden">Analyze</span>
                  </button>
                </div>
              </div>
            </div>

            {isExpanded && (
              <div className="border-t border-gray-700 p-3">
                {/* Expanded checklist summary */}
                <div className="mb-3 p-2 bg-gray-900/50 rounded-lg border border-gray-700/50">
                  <div className="flex items-center gap-2 mb-2">
                    <span className={`font-bold text-sm ${vc.color}`}>{summary.verdict}</span>
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
                <PutTable puts={stock.topPuts} />
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
