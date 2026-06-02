"use client";

interface DTERange {
  label: string;
  shortLabel: string;
  min: number;
  max: number;
  description: string;
}

export const DTE_PRESETS: DTERange[] = [
  { label: "Weekly", shortLabel: "7-14d", min: 7, max: 14, description: "Near-term, high theta decay" },
  { label: "Short", shortLabel: "14-30d", min: 14, max: 30, description: "Quick trades, higher gamma risk" },
  { label: "Optimal", shortLabel: "30-45d", min: 30, max: 45, description: "Tastytrade sweet spot" },
  { label: "Standard", shortLabel: "14-75d", min: 14, max: 75, description: "Default full range" },
  { label: "Medium", shortLabel: "30-60d", min: 30, max: 60, description: "Balanced theta/gamma" },
  { label: "Long", shortLabel: "45-90d", min: 45, max: 90, description: "More time, lower theta" },
  { label: "Extended", shortLabel: "60-120d", min: 60, max: 120, description: "LEAPS-adjacent, slower decay" },
];

export const DEFAULT_DTE = DTE_PRESETS[3]; // Standard 14-75d

interface DTESelectorProps {
  selected: DTERange;
  onChange: (range: DTERange) => void;
  compact?: boolean;
}

export default function DTESelector({ selected, onChange, compact }: DTESelectorProps) {
  return (
    <div className={compact ? "flex items-center gap-1.5" : "flex flex-col gap-1.5"}>
      {!compact && (
        <div className="flex items-center justify-between">
          <span className="text-xs text-gray-500 font-medium uppercase">DTE Range</span>
          <span className="text-xs text-gray-600">{selected.description}</span>
        </div>
      )}
      <div className="flex flex-wrap gap-1">
        {DTE_PRESETS.map((preset) => {
          const isSelected = preset.min === selected.min && preset.max === selected.max;
          return (
            <button
              key={preset.label}
              onClick={() => onChange(preset)}
              className={`px-2 py-1 rounded text-xs font-medium transition-colors ${
                isSelected
                  ? "bg-blue-600 text-white"
                  : "bg-gray-800 text-gray-400 hover:text-white hover:bg-gray-700 border border-gray-700"
              }`}
              title={preset.description}
            >
              {compact ? preset.shortLabel : `${preset.label} (${preset.shortLabel})`}
            </button>
          );
        })}
      </div>
    </div>
  );
}

export type { DTERange };
