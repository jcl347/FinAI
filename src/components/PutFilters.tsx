"use client";

// ─── Delta Filter ────────────────────────────────────────────────

export interface DeltaRange {
  label: string;
  shortLabel: string;
  min: number;
  max: number;
  description: string;
}

export const DELTA_PRESETS: DeltaRange[] = [
  { label: "All", shortLabel: "All", min: 0, max: 1, description: "No delta filter" },
  { label: "Conservative", shortLabel: "5-15Δ", min: 0.05, max: 0.15, description: "Low probability of assignment" },
  { label: "Sweet Spot", shortLabel: "14-22Δ", min: 0.14, max: 0.22, description: "Optimal range (tastytrade + DDO)" },
  { label: "Moderate", shortLabel: "15-30Δ", min: 0.15, max: 0.30, description: "Balanced premium vs safety" },
  { label: "Aggressive", shortLabel: "25-40Δ", min: 0.25, max: 0.40, description: "Higher premium, higher risk" },
];

export const DEFAULT_DELTA = DELTA_PRESETS[0]; // All

// ─── Annualized Return Filter ────────────────────────────────────

export interface AnnReturnRange {
  label: string;
  shortLabel: string;
  min: number;
  max: number;
  description: string;
}

export const ANN_RETURN_PRESETS: AnnReturnRange[] = [
  { label: "All", shortLabel: "All", min: 0, max: Infinity, description: "No return filter" },
  { label: "Conservative", shortLabel: "5-15%", min: 5, max: 15, description: "Lower premium, safer plays" },
  { label: "Moderate", shortLabel: "10-25%", min: 10, max: 25, description: "Balanced risk/reward" },
  { label: "Target", shortLabel: "15-40%", min: 15, max: 40, description: "Optimal yield range" },
  { label: "High Yield", shortLabel: "30%+", min: 30, max: Infinity, description: "Rich premium — check IV & risk" },
];

export const DEFAULT_ANN_RETURN = ANN_RETURN_PRESETS[0]; // All

// ─── Shared Preset Button Row ────────────────────────────────────

interface PresetSelectorProps<T> {
  label: string;
  presets: T[];
  selected: T;
  onChange: (preset: T) => void;
  getKey: (preset: T) => string;
  getLabel: (preset: T) => string;
  getShortLabel: (preset: T) => string;
  getDescription: (preset: T) => string;
}

function PresetSelector<T>({ label, presets, selected, onChange, getKey, getLabel, getShortLabel, getDescription }: PresetSelectorProps<T>) {
  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-center justify-between">
        <span className="text-xs text-gray-500 font-medium uppercase">{label}</span>
        <span className="text-xs text-gray-600">{getDescription(selected)}</span>
      </div>
      <div className="flex flex-wrap gap-1">
        {presets.map((preset) => {
          const isSelected = getKey(preset) === getKey(selected);
          return (
            <button
              key={getKey(preset)}
              onClick={() => onChange(preset)}
              className={`px-2 py-1 rounded text-xs font-medium transition-colors ${
                isSelected
                  ? "bg-blue-600 text-white"
                  : "bg-gray-800 text-gray-400 hover:text-white hover:bg-gray-700 border border-gray-700"
              }`}
              title={getDescription(preset)}
            >
              {getLabel(preset)} ({getShortLabel(preset)})
            </button>
          );
        })}
      </div>
    </div>
  );
}

// ─── Exported Components ─────────────────────────────────────────

export function DeltaSelector({ selected, onChange }: { selected: DeltaRange; onChange: (r: DeltaRange) => void }) {
  return (
    <PresetSelector
      label="Delta"
      presets={DELTA_PRESETS}
      selected={selected}
      onChange={onChange}
      getKey={(p) => p.label}
      getLabel={(p) => p.label}
      getShortLabel={(p) => p.shortLabel}
      getDescription={(p) => p.description}
    />
  );
}

export function AnnReturnSelector({ selected, onChange }: { selected: AnnReturnRange; onChange: (r: AnnReturnRange) => void }) {
  return (
    <PresetSelector
      label="Ann. Return"
      presets={ANN_RETURN_PRESETS}
      selected={selected}
      onChange={onChange}
      getKey={(p) => p.label}
      getLabel={(p) => p.label}
      getShortLabel={(p) => p.shortLabel}
      getDescription={(p) => p.description}
    />
  );
}
