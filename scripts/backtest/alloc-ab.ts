/**
 * A/B of FOUNDATIONAL diversification allocators on the real 12-sleeve return streams.
 * Combines each sleeve's standalone return stream under {equal, inverse-vol, min-variance, risk-parity,
 * max-diversification, HRP}, no-look-ahead (weights from a TRAILING window, applied to NEXT returns),
 * vol-targeted to 10%, with an allocation-turnover cost. Answers: does a foundational diversification
 * method beat the current inverse-vol base on the 12-sleeve menu? (We found naive HRP/MinVar lost on 5.)
 *
 *   node --use-system-ca --no-warnings --import ./scripts/register-ts.mjs scripts/backtest/alloc-ab.ts
 */
import { ALL_BACKTEST_SYMBOLS } from "../../src/lib/strategies/universe";
import { PRODUCTION_SLEEVES } from "../../src/lib/strategies/production";
import { buildAligned } from "../../src/lib/backtest/align";
import { runBacktest } from "../../src/lib/backtest/engine";
import { computeMetrics, capmStats, type EquityPoint } from "../../src/lib/backtest/metrics";
import { loadUniverse } from "./data";
import { allocate, covMatrix, diversificationRatio, type AllocMethod } from "../../src/lib/strategies/diversification";

const W = 126;          // trailing window for covariance / weights
const REBAL = 5;        // weekly
const VOL_TARGET = 0.10;
const ALLOC_COST = 0.0010; // 10 bps on L1 weight change at each rebalance

function dailyRetByDate(curve: EquityPoint[]): Map<string, number> {
  const m = new Map<string, number>();
  for (let i = 1; i < curve.length; i++) {
    if (curve[i - 1].equity > 0) m.set(curve[i].date, curve[i].equity / curve[i - 1].equity - 1);
  }
  return m;
}

async function main() {
  const series = await loadUniverse(ALL_BACKTEST_SYMBOLS, 11);
  const data = buildAligned(series, { vixSymbol: "^VIX", vix9dSymbol: "^VIX9D" });
  const cal = data.calendar;

  // Per-sleeve daily-return series aligned to the master calendar (null before the sleeve starts).
  const keys = PRODUCTION_SLEEVES.map((s) => s.key);
  const rets: Record<string, (number | null)[]> = {};
  for (const s of PRODUCTION_SLEEVES) {
    const r = runBacktest(s, data, { initialCapital: 100000, maxGross: s.longOnly === false ? 2.0 : 1.0 });
    const byDate = dailyRetByDate(r.equityCurve);
    rets[s.key] = cal.map((d) => (byDate.has(d) ? byDate.get(d)! : null));
  }

  const spy = (() => {
    const c = data.closes.get("SPY")!; const out: EquityPoint[] = []; let e = 100000, prev: number | null = null;
    for (let i = 0; i < cal.length; i++) { const v = c[i]; if (v != null) { if (prev != null && prev > 0) e *= v / prev; prev = v; } out.push({ date: cal[i], equity: e }); }
    return out;
  })();

  const startIdx = cal.findIndex((d) => d >= "2016-09-01"); // after the 800-bar warmup of the LT sleeves
  function runMethod(method: AllocMethod): EquityPoint[] {
    let equity = 100000;
    const curve: EquityPoint[] = [];
    let weights: Map<string, number> = new Map();
    for (let i = startIdx; i < cal.length; i++) {
      if ((i - startIdx) % REBAL === 0) {
        // eligible sleeves: have a full trailing window ending at i-1 (no look-ahead)
        const elig: string[] = [];
        const mat: number[][] = [];
        for (const k of keys) {
          const win: number[] = [];
          for (let t = i - W; t < i; t++) { const v = rets[k][t]; if (v != null) win.push(v); }
          if (win.length >= W * 0.8) { elig.push(k); mat.push(win); }
        }
        if (elig.length >= 2) {
          // align matrix to common length
          const L = Math.min(...mat.map((r) => r.length));
          const m2 = mat.map((r) => r.slice(-L));
          const raw = allocate(method, m2);
          // vol-target: scale to 10% ex-ante (from the trailing cov), cap gross 1.0
          const cov = covMatrix(m2);
          let pv = 0;
          for (let a = 0; a < raw.length; a++) for (let b = 0; b < raw.length; b++) pv += raw[a] * raw[b] * cov[a][b];
          const annVol = Math.sqrt(Math.max(1e-12, pv)) * Math.sqrt(252);
          const scale = Math.min(1, VOL_TARGET / Math.max(1e-6, annVol));
          const nw = new Map<string, number>();
          elig.forEach((k, idx) => nw.set(k, raw[idx] * scale));
          // allocation-turnover cost
          let l1 = 0; const allK = new Set([...weights.keys(), ...nw.keys()]);
          for (const k of allK) l1 += Math.abs((nw.get(k) ?? 0) - (weights.get(k) ?? 0));
          equity *= 1 - l1 * ALLOC_COST;
          weights = nw;
        }
      }
      // earn the day's weighted sleeve returns
      let pr = 0;
      for (const [k, w] of weights) { const v = rets[k][i]; if (v != null) pr += w * v; }
      equity *= 1 + pr;
      curve.push({ date: cal[i], equity });
    }
    return curve;
  }

  const methods: AllocMethod[] = ["equal", "inverse_vol", "risk_parity", "min_variance", "max_diversification", "hrp", "corr_penalty"];
  const sub = (c: EquityPoint[], from: string) => c.filter((p) => p.date > from);
  console.log("method".padEnd(20), "full Sh", "OOS Sh", "MaxDD", "Calmar", "net-β", "divRatio");
  console.log("-".repeat(72));
  for (const method of methods) {
    const curve = runMethod(method);
    const full = computeMetrics(curve, { rfAnnual: 0.02 });
    const oos = computeMetrics(sub(curve, "2021-06-30"), { rfAnnual: 0.02 });
    const capm = capmStats(curve, spy, 0.02);
    // average realized diversification ratio over the curve (sampled)
    console.log(
      method.padEnd(20),
      String(full.sharpe).padStart(6), String(oos.sharpe).padStart(6),
      `${full.maxDrawdownPct}%`.padStart(7), String(full.calmar).padStart(6),
      String(capm.netOfBetaSharpe).padStart(6)
    );
  }
  console.log("\n(return-level combiner; relative comparison across methods is the signal, not the absolute level.)");
}
main().catch((e) => { console.error(e); process.exit(1); });
