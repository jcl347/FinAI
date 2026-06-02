/**
 * Backtest the SYNTHETIC options (VRP) sleeves and compare to SPY.
 *   node --use-system-ca --no-warnings --import ./scripts/register-ts.mjs scripts/backtest/options.ts
 * Honest: BS-priced from the real underlying path, IV = realized vol + a conservative VRP spread,
 * vol spikes raise the mark so the short-gamma crash tail shows up. See options-sim.ts header.
 */
import { writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { ALL_BACKTEST_SYMBOLS, EQUITY_UNIVERSE } from "../../src/lib/strategies/universe";
import { buildAligned } from "../../src/lib/backtest/align";
import { runOptionsSleeve, DEFAULT_OPTIONS_CONFIG, type OptionStructure } from "../../src/lib/backtest/options-sim";
import { computeMetrics, capmStats, curveCorrelation, type EquityPoint } from "../../src/lib/backtest/metrics";
import { loadUniverse } from "./data";

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT_DIR = join(__dirname, "..", "..", "research", "backtests");

// Stable, liquid large-caps suitable for systematic premium selling (the score model's preference).
const STABLE = ["AAPL","MSFT","JPM","JNJ","PG","KO","PEP","HD","MCD","WMT","COST","UNH","V","MA","ABBV","MRK","XOM","CVX","CAT","HON","LIN","TXN","QCOM","CSCO","IBM","DIS","NKE","LOW","SBUX","TJX","SPY","QQQ","IWM"];

function spyCurve(barsBySymbol: Map<string, any[]>, calendar: string[]): EquityPoint[] {
  const aligned = barsBySymbol.get("SPY")!;
  const out: EquityPoint[] = [];
  let eq = 1; let prev: number | null = null;
  for (let i = 0; i < calendar.length; i++) {
    const b = aligned[i];
    if (b) { if (prev != null && prev > 0) eq *= b.close / prev; prev = b.close; }
    out.push({ date: calendar[i], equity: eq });
  }
  return out;
}

async function main() {
  const series = await loadUniverse(ALL_BACKTEST_SYMBOLS, 11);
  const data = buildAligned(series, { vixSymbol: "^VIX", vix9dSymbol: "^VIX9D" });
  console.log(`Calendar: ${data.calendar[0]} → ${data.calendar[data.calendar.length - 1]} (${data.calendar.length} days)\n`);
  const bench = spyCurve(data.bars, data.calendar);

  const structures: { key: string; structure: OptionStructure; basket: string[]; note: string; cost?: number; vrp?: number; filter?: boolean }[] = [
    { key: "csp_index", structure: "csp", basket: ["SPY", "QQQ", "IWM", "DIA"], note: "INDEX CSP 16Δ (naive, every cycle)", cost: 0.03 },
    { key: "csp_index_filt", structure: "csp", basket: ["SPY", "QQQ", "IWM", "DIA"], note: "INDEX CSP 16Δ + 200d-uptrend filter", cost: 0.03, filter: true },
    { key: "csp_stable_filt", structure: "csp", basket: STABLE, note: "stable-basket CSP + 200d-uptrend filter", filter: true },
    { key: "csp_stable", structure: "csp", basket: STABLE, note: "16Δ 45-DTE CSP, stable basket (naive)" },
    { key: "condor_stable", structure: "iron_condor", basket: STABLE, note: "16Δ/6Δ iron condors (defined risk)" },
    { key: "strangle_stable", structure: "short_strangle", basket: STABLE, note: "16Δ short strangles" },
  ];

  console.log(["sleeve".padEnd(18), "CAGR%".padStart(7), "Vol%".padStart(7), "Sharpe".padStart(7), "MaxDD%".padStart(7), "Calmar".padStart(7), "ρSPY".padStart(6), "β".padStart(6), "netβSh".padStart(7)].join(" "));
  console.log("-".repeat(80));

  const out: any[] = [];
  for (const s of structures) {
    const cfg = { ...DEFAULT_OPTIONS_CONFIG, structure: s.structure, requireUptrend: !!s.filter, ...(s.cost != null ? { costFracOfPremium: s.cost } : {}), ...(s.vrp != null ? { vrpVolPoints: s.vrp } : {}) };
    const curve = runOptionsSleeve(data.calendar, data.bars, s.basket, cfg);
    if (curve.length < 100) { console.log(`${s.key}: insufficient data`); continue; }
    // Scale the index curve to $100k for metric readability.
    const scaled = curve.map((p) => ({ date: p.date, equity: p.equity * 100000 }));
    const m = computeMetrics(scaled);
    const rho = curveCorrelation(scaled, bench);
    const capm = capmStats(scaled, bench);
    console.log([s.key.padEnd(18), String(m.cagrPct).padStart(7), String(m.annVolPct).padStart(7), String(m.sharpe).padStart(7), String(m.maxDrawdownPct).padStart(7), String(m.calmar).padStart(7), String(rho).padStart(6), String(capm.beta).padStart(6), String(capm.netOfBetaSharpe).padStart(7)].join(" "));
    out.push({ key: s.key, note: s.note, metrics: m, correlationToSPY: rho, capm, equityCurveWeekly: curve.filter((_, i) => i % 5 === 0) });
  }

  mkdirSync(OUT_DIR, { recursive: true });
  writeFileSync(join(OUT_DIR, "options-summary.json"), JSON.stringify({ generatedAt: new Date().toISOString(), config: DEFAULT_OPTIONS_CONFIG, results: out }, null, 1));
  console.log(`\nWrote ${join(OUT_DIR, "options-summary.json")}`);
  console.log("Note: BS-synthetic (IV=RV+3.5vol-pts VRP), conservative option costs (6% of premium/side). Approximation — see options-sim.ts.");
}

main().catch((e) => { console.error(e); process.exit(1); });
