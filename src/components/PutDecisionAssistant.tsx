"use client";

import { useState } from "react";
import {
  evaluateChecklist,
  getVerdict,
  type ChecklistInput,
  type ChecklistItem,
} from "@/lib/checklist";

interface Props {
  data: ChecklistInput;
}

// ─── Severity-Weighted Verdict ──────────────────────────────────
// Not all rules are equal. A downtrend fail is far more dangerous than a missing dividend.
// Critical fails trigger CAUTION at minimum, and AVOID with compounding failures.
function getOverallVerdict(items: ChecklistItem[]): {
  verdict: "SELL PUT" | "CAUTION" | "AVOID";
  color: string;
  bg: string;
} {
  const verdict = getVerdict(items);
  if (verdict === "AVOID") return { verdict, color: "text-red-400", bg: "bg-red-900/30" };
  if (verdict === "CAUTION") return { verdict, color: "text-yellow-400", bg: "bg-yellow-900/30" };
  return { verdict, color: "text-green-400", bg: "bg-green-900/30" };
}

export default function PutDecisionAssistant({ data }: Props) {
  const [expanded, setExpanded] = useState(false);
  const items = evaluateChecklist(data);
  const verdict = getOverallVerdict(items);
  const categories = [...new Set(items.map(i => i.category))];

  const passes = items.filter(i => i.status === "pass").length;
  const warns = items.filter(i => i.status === "warn").length;
  const fails = items.filter(i => i.status === "fail").length;

  const ctx = data.context;

  return (
    <div className={`border rounded-lg overflow-hidden ${
      verdict.verdict === "SELL PUT" ? "border-green-700/50" :
      verdict.verdict === "CAUTION" ? "border-yellow-700/50" : "border-red-700/50"
    }`}>
      {/* Header - always visible */}
      <div
        className={`${verdict.bg} px-4 py-3 cursor-pointer flex items-center justify-between`}
        onClick={() => setExpanded(!expanded)}
      >
        <div className="flex items-center gap-3">
          <div className={`text-lg font-bold ${verdict.color}`}>
            {verdict.verdict === "SELL PUT" ? "\u2713" : verdict.verdict === "CAUTION" ? "!" : "\u2717"}
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className={`font-bold ${verdict.color}`}>{verdict.verdict}</span>
              <span className="text-gray-400 text-sm">{data.symbol}</span>
            </div>
            <div className="text-xs text-gray-500">
              {passes} pass, {warns} caution, {fails} fail
            </div>
          </div>
        </div>

        <div className="flex items-center gap-4">
          {/* Quick stats */}
          {ctx && (
            <div className="hidden md:flex items-center gap-3 text-xs">
              <span className={`px-2 py-0.5 rounded ${
                ctx.trendDirection === "up" ? "bg-green-900/40 text-green-400" :
                ctx.trendDirection === "down" ? "bg-red-900/40 text-red-400" :
                "bg-gray-700 text-gray-400"
              }`}>
                {ctx.trendDirection === "up" ? "\u25B2" : ctx.trendDirection === "down" ? "\u25BC" : "\u25C6"} {ctx.trendDirection}
              </span>
              {ctx.daysToEarnings != null && ctx.daysToEarnings >= 0 && ctx.daysToEarnings <= 45 && (
                <span className={`px-2 py-0.5 rounded ${
                  ctx.daysToEarnings <= 14
                    ? "bg-red-900/40 text-red-400"
                    : "bg-yellow-900/40 text-yellow-400"
                }`}>
                  Earnings {ctx.daysToEarnings}d
                </span>
              )}
            </div>
          )}
          <span className="text-gray-500 text-sm">{expanded ? "\u25B2" : "\u25BC"}</span>
        </div>
      </div>

      {/* Expanded checklist */}
      {expanded && (
        <div className="bg-gray-900/50 px-4 py-3">
          {/* Position Sizing Calculator */}
          <div className="mb-4 p-3 bg-gray-800/50 rounded-lg border border-gray-700/50">
            <h4 className="text-xs font-medium text-gray-400 uppercase mb-2">
              Schwab Cash-Secured Put Calculator
            </h4>
            <PositionSizer
              price={data.price}
              supportLevel={ctx?.supportLevel ?? data.price * 0.92}
              atr={ctx?.avgTrueRange ?? data.price * 0.02}
            />
          </div>

          {/* Checklist by category */}
          {categories.map(cat => (
            <div key={cat} className="mb-3">
              <h4 className="text-xs font-medium text-gray-500 uppercase mb-1.5">{cat}</h4>
              <div className="space-y-1">
                {items.filter(i => i.category === cat).map((item, idx) => (
                  <div key={idx} className="flex items-start gap-2 text-sm">
                    <span className={`mt-0.5 font-bold ${
                      item.status === "pass" ? "text-green-400" :
                      item.status === "warn" ? "text-yellow-400" : "text-red-400"
                    }`}>
                      {item.status === "pass" ? "\u2713" : item.status === "warn" ? "!" : "\u2717"}
                    </span>
                    <div className="flex-1">
                      <div className="flex items-center justify-between">
                        <span className="text-white">{item.label}</span>
                        <span className="text-gray-400 text-xs">{item.detail}</span>
                      </div>
                      <p className="text-xs text-gray-600 mt-0.5">{item.rule}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}

          {/* Strike Suggestions with Profit Scenarios */}
          {ctx && (
            <div className="mt-3 pt-3 border-t border-gray-700/50">
              <h4 className="text-xs font-medium text-gray-500 uppercase mb-2">
                Suggested Strike Targets
              </h4>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 text-sm">
                {[
                  {
                    label: "Conservative",
                    strike: Math.round(Math.min(ctx.supportLevel, data.price * 0.90)),
                    color: "text-gray-500",
                    border: "",
                    estPremium: 0.003,
                  },
                  {
                    label: "Optimal",
                    strike: Math.round(data.price * 0.92),
                    color: "text-blue-400",
                    border: "border border-blue-700/30",
                    estPremium: 0.006,
                  },
                  {
                    label: "Aggressive",
                    strike: Math.round(data.price * 0.95),
                    color: "text-gray-500",
                    border: "",
                    estPremium: 0.012,
                  },
                ].map(({ label, strike, color, border, estPremium }) => {
                  const otmPct = ((data.price - strike) / data.price * 100);
                  const estCredit = strike * estPremium;
                  const annReturn = estPremium * (365 / 35) * 100;
                  return (
                    <div key={label} className={`bg-gray-800/50 rounded p-2 text-center ${border}`}>
                      <div className={`${color} text-xs`}>{label}</div>
                      <div className="text-white font-medium">${strike}</div>
                      <div className="text-gray-600 text-xs">{otmPct.toFixed(1)}% OTM</div>
                      <div className="text-gray-500 text-xs mt-1">
                        ~${estCredit.toFixed(2)}/sh credit
                      </div>
                      <div className="text-gray-600 text-xs">
                        ~{annReturn.toFixed(0)}% ann.
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Profit/Loss Scenarios */}
              <div className="mt-3">
                <h4 className="text-xs font-medium text-gray-500 uppercase mb-2">
                  Scenario Analysis (Optimal Strike, 35 DTE)
                </h4>
                {(() => {
                  const strike = Math.round(data.price * 0.92);
                  const estCredit = strike * 0.006;
                  const collateral = strike * 100;
                  return (
                    <div className="grid grid-cols-3 gap-2 text-xs">
                      <div className="bg-green-900/20 border border-green-700/30 rounded p-2">
                        <div className="text-green-400 font-medium">Max Profit (OTM)</div>
                        <div className="text-white">${(estCredit * 100).toFixed(0)}/contract</div>
                        <div className="text-gray-500">
                          {(estCredit / strike * 100).toFixed(2)}% return in 35d
                        </div>
                        <div className="text-gray-600 mt-1">
                          Close at 50%: ${(estCredit * 50).toFixed(0)}
                        </div>
                      </div>
                      <div className="bg-yellow-900/20 border border-yellow-700/30 rounded p-2">
                        <div className="text-yellow-400 font-medium">Breakeven</div>
                        <div className="text-white">${(strike - estCredit).toFixed(2)}</div>
                        <div className="text-gray-500">
                          {((data.price - (strike - estCredit)) / data.price * 100).toFixed(1)}% below current
                        </div>
                        <div className="text-gray-600 mt-1">
                          Collateral: ${collateral.toLocaleString()}
                        </div>
                      </div>
                      <div className="bg-red-900/20 border border-red-700/30 rounded p-2">
                        <div className="text-red-400 font-medium">Stop Loss (2x)</div>
                        <div className="text-white">-${(estCredit * 100).toFixed(0)}/contract</div>
                        <div className="text-gray-500">
                          Close when loss = 2x credit
                        </div>
                        <div className="text-gray-600 mt-1">
                          Max risk: ${(estCredit * 200).toFixed(0)}
                        </div>
                      </div>
                    </div>
                  );
                })()}
              </div>
            </div>
          )}

          {/* Exit Rules */}
          <div className="mt-3 pt-3 border-t border-gray-700/50">
            <h4 className="text-xs font-medium text-gray-500 uppercase mb-2">
              Schwab Trade Management Rules
            </h4>
            <div className="flex flex-wrap gap-2 text-xs">
              <span className="px-2 py-1 bg-green-900/20 border border-green-700/30 rounded text-green-400">
                Close at 50% profit
              </span>
              <span className="px-2 py-1 bg-red-900/20 border border-red-700/30 rounded text-red-400">
                Stop at 2x premium loss
              </span>
              <span className="px-2 py-1 bg-blue-900/20 border border-blue-700/30 rounded text-blue-400">
                Roll at 21 DTE if profitable
              </span>
              <span className="px-2 py-1 bg-gray-800 border border-gray-700/50 rounded text-gray-400">
                Max 5-10% of capital per position
              </span>
              <span className="px-2 py-1 bg-gray-800 border border-gray-700/50 rounded text-gray-400">
                Cash-secured: full assignment capital reserved
              </span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Position Sizer Sub-component ─────────────────────────────

function PositionSizer({
  price,
  supportLevel,
  atr,
}: {
  price: number;
  supportLevel: number;
  atr: number;
}) {
  const [portfolioSize, setPortfolioSize] = useState(100000);
  const [riskPct, setRiskPct] = useState(5);

  const maxPosition = portfolioSize * (riskPct / 100);
  const suggestedStrike = Math.round(Math.min(price * 0.92, supportLevel));
  const collateral = suggestedStrike * 100; // per contract
  const maxContracts = Math.floor(maxPosition / collateral);
  const totalCollateral = maxContracts * collateral;

  return (
    <div className="space-y-2">
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="text-xs text-gray-500">Portfolio Size ($)</label>
          <input
            type="number"
            value={portfolioSize}
            onChange={e => setPortfolioSize(Number(e.target.value) || 0)}
            className="w-full bg-gray-900 border border-gray-700 rounded px-2 py-1 text-sm text-white"
          />
        </div>
        <div>
          <label className="text-xs text-gray-500">Max Risk per Position (%)</label>
          <input
            type="number"
            value={riskPct}
            min={1}
            max={20}
            onChange={e => setRiskPct(Number(e.target.value) || 5)}
            className="w-full bg-gray-900 border border-gray-700 rounded px-2 py-1 text-sm text-white"
          />
        </div>
      </div>
      <div className="grid grid-cols-4 gap-2 text-xs">
        <div>
          <div className="text-gray-500">Max Allocation</div>
          <div className="text-white font-medium">${maxPosition.toLocaleString()}</div>
        </div>
        <div>
          <div className="text-gray-500">Collateral/Contract</div>
          <div className="text-white font-medium">${collateral.toLocaleString()}</div>
        </div>
        <div>
          <div className="text-gray-500">Max Contracts</div>
          <div className="text-white font-medium">{maxContracts}</div>
        </div>
        <div>
          <div className="text-gray-500">Total Collateral</div>
          <div className="text-white font-medium">${totalCollateral.toLocaleString()}</div>
        </div>
      </div>
    </div>
  );
}
