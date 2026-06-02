"use client";

interface MarketRegimeProps {
  regime: {
    vix: number;
    regime: string;
    favorsPutSelling: boolean;
    description: string;
  } | null;
}

const regimeColors: Record<string, { bg: string; text: string; border: string }> = {
  LOW_VOL: { bg: "bg-blue-900/30", text: "text-blue-300", border: "border-blue-500/50" },
  NORMAL: { bg: "bg-green-900/30", text: "text-green-300", border: "border-green-500/50" },
  HIGH_VOL: { bg: "bg-yellow-900/30", text: "text-yellow-300", border: "border-yellow-500/50" },
  CRISIS: { bg: "bg-red-900/30", text: "text-red-300", border: "border-red-500/50" },
};

const regimeLabels: Record<string, string> = {
  LOW_VOL: "Low Volatility",
  NORMAL: "Normal",
  HIGH_VOL: "Elevated",
  CRISIS: "Crisis",
};

export default function MarketRegime({ regime }: MarketRegimeProps) {
  if (!regime) return null;

  const colors = regimeColors[regime.regime] ?? regimeColors.NORMAL;

  return (
    <div className={`rounded-lg border p-4 ${colors.bg} ${colors.border}`}>
      <div className="flex items-center justify-between mb-2">
        <h3 className="text-sm font-medium text-gray-400">Market Regime</h3>
        <div className="flex items-center gap-2">
          <span className={`text-2xl font-bold ${colors.text}`}>
            VIX {regime.vix.toFixed(1)}
          </span>
          <span
            className={`px-2 py-0.5 rounded text-xs font-semibold ${colors.bg} ${colors.text} border ${colors.border}`}
          >
            {regimeLabels[regime.regime] ?? regime.regime}
          </span>
        </div>
      </div>
      <p className="text-sm text-gray-400">{regime.description}</p>
      <div className="mt-2 flex items-center gap-1">
        <span
          className={`w-2 h-2 rounded-full ${
            regime.favorsPutSelling ? "bg-green-400" : "bg-red-400"
          }`}
        />
        <span className="text-xs text-gray-500">
          {regime.favorsPutSelling
            ? "Conditions favor put selling"
            : "Caution: conditions unfavorable for put selling"}
        </span>
      </div>
    </div>
  );
}
