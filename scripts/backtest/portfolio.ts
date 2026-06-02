/**
 * Returns-level portfolio combiner — measures the COMBINED Sharpe of equity sleeves + the options
 * VRP sleeve (the path to higher Sharpe). Options can't go through the weight-based position engine,
 * so sleeves are combined at the RETURN level (fund-of-sleeves): each day's portfolio return =
 * Σ weight_s × sleeve_return_s, weights re-set weekly by an equal-risk + light-tilt + regime +
 * vol-target rule that DE-RISKS the short-vol sleeve in crises (so the shared short-gamma tail is
 * managed). Honest caveat: return-level combination ignores cross-sleeve position netting (small
 * for diversified sleeves) and the options leg is BS-synthetic (see options-sim.ts).
 *
 *   node --use-system-ca --no-warnings --import ./scripts/register-ts.mjs scripts/backtest/portfolio.ts
 */
import { writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { ALL_BACKTEST_SYMBOLS } from "../../src/lib/strategies/universe";
import { STRATEGIES } from "../../src/lib/strategies/registry";
import { buildAligned } from "../../src/lib/backtest/align";
import { runBacktest, type AlignedData } from "../../src/lib/backtest/engine";
import { computeMetrics, capmStats, curveCorrelation, type EquityPoint } from "../../src/lib/backtest/metrics";
import { runOptionsSleeve, DEFAULT_OPTIONS_CONFIG } from "../../src/lib/backtest/options-sim";
import { loadUniverse } from "./data";

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT_DIR = join(__dirname, "..", "..", "research", "backtests");
const INITIAL = 100000;
const WINDOW = 126;
const VOL_TARGET = 0.10;

const STABLE = ["AAPL","MSFT","JPM","JNJ","PG","KO","PEP","HD","MCD","WMT","COST","UNH","V","MA","ABBV","MRK","XOM","CVX","CAT","HON","LIN","TXN","QCOM","CSCO","IBM","DIS","NKE","LOW","SBUX","TJX","SPY","QQQ","IWM"];

type Family = "offensive" | "defensive" | "hedge" | "vol_premium";
interface Sleeve { key: string; family: Family; prior: number; curve: EquityPoint[]; }

function alignedEquity(curve: EquityPoint[], calendar: string[]): number[] {
  const m = new Map(curve.map((p) => [p.date, p.equity]));
  const out: number[] = new Array(calendar.length).fill(NaN);
  let last = NaN;
  let started = false;
  for (let i = 0; i < calendar.length; i++) {
    const v = m.get(calendar[i]);
    if (v != null) { last = v; started = true; }
    out[i] = started ? last : NaN;
  }
  return out;
}

function dailyReturns(eq: number[]): number[] {
  const r: number[] = new Array(eq.length).fill(0);
  for (let i = 1; i < eq.length; i++) {
    if (Number.isFinite(eq[i]) && Number.isFinite(eq[i - 1]) && eq[i - 1] > 0) r[i] = eq[i] / eq[i - 1] - 1;
  }
  return r;
}

function trailingSharpeVol(rets: number[], end: number, window: number) {
  const s = rets.slice(Math.max(1, end - window + 1), end + 1).filter((x) => x !== 0 || true);
  const n = s.length;
  if (n < 20) return { sharpe: 0, vol: 0.15, n };
  const m = s.reduce((a, b) => a + b, 0) / n;
  const sd = Math.sqrt(s.reduce((a, b) => a + (b - m) ** 2, 0) / (n - 1));
  const vol = sd * Math.sqrt(252);
  return { sharpe: vol > 0 ? (m * 252) / vol : 0, vol: Math.max(0.02, vol), n };
}

function regimeMult(family: Family, riskOff: boolean, crisis: boolean): number {
  if (crisis) {
    if (family === "vol_premium") return 0.25; // cut short-vol HARD in a crisis
    if (family === "hedge") return 1.6;
    if (family === "defensive") return 1.3;
    return 0.5; // offensive
  }
  if (riskOff) {
    if (family === "vol_premium") return 0.6;
    if (family === "hedge") return 1.3;
    if (family === "defensive") return 1.2;
    return 0.8;
  }
  return 1;
}

async function main() {
  const series = await loadUniverse(ALL_BACKTEST_SYMBOLS, 11);
  const data: AlignedData = buildAligned(series, { vixSymbol: "^VIX", vix9dSymbol: "^VIX9D" });
  const N = data.calendar.length;
  console.log(`Calendar: ${data.calendar[0]} → ${data.calendar[N - 1]} (${N} days)\n`);

  // SPY benchmark + regime inputs.
  const spyEq = alignedEquity(
    (() => { const a = data.bars.get("SPY")!; const c: EquityPoint[] = []; let e = 1, prev: number | null = null; for (let i = 0; i < N; i++){ const b = a[i]; if (b){ if (prev!=null&&prev>0) e*=b.close/prev; prev=b.close;} c.push({date:data.calendar[i],equity:e}); } return c; })(),
    data.calendar
  );
  const spyClose = data.closes.get("SPY")!;
  const vix = data.vix ?? new Array(N).fill(null);

  // Build sleeve curves.
  const FAM: Record<string, Family> = { xs_momentum: "offensive", low_vol: "defensive", factor_momentum: "offensive", sector_rotation: "defensive", cross_asset_trend: "defensive", tail_hedge: "hedge", resid_momentum: "offensive", ts_trend: "defensive", st_reversal: "offensive" };
  const PRIOR: Record<string, number> = { xs_momentum: 1.04, low_vol: 0.91, factor_momentum: 0.9, sector_rotation: 0.66, cross_asset_trend: 0.57, tail_hedge: 0.06, resid_momentum: 0.4, csp_vrp: 1.0 };

  const sleeves: Sleeve[] = [];
  for (const s of STRATEGIES) {
    if (s.key === "st_reversal" || s.key === "ts_trend") continue; // drop the nulls from the funded set
    sleeves.push({ key: s.key, family: FAM[s.key] ?? "offensive", prior: PRIOR[s.key] ?? 0.5, curve: runBacktest(s, data, { initialCapital: INITIAL }).equityCurve });
  }
  // Options VRP sleeve (the high-Sharpe short-vol core).
  const cspCurve = runOptionsSleeve(data.calendar, data.bars, STABLE, { ...DEFAULT_OPTIONS_CONFIG, structure: "csp" });
  sleeves.push({ key: "csp_vrp", family: "vol_premium", prior: PRIOR.csp_vrp, curve: cspCurve });

  // Aligned returns per sleeve.
  const rets = new Map(sleeves.map((s) => [s.key, dailyReturns(alignedEquity(s.curve, data.calendar))]));

  // Combine at the return level, rebalancing weekly.
  const start = 300;
  let portEq = INITIAL;
  const portCurve: EquityPoint[] = [];
  let weights = new Map<string, number>();
  const sharpeFloor = -0.15;
  const maxW = 0.35;

  for (let i = start; i < N; i++) {
    if ((i - start) % 5 === 0) {
      // regime
      let sma200 = 0, c = 0;
      for (let k = i - 199; k <= i; k++) if (spyClose[k] != null) { sma200 += spyClose[k]!; c++; }
      const spyAbove200 = c > 150 ? (spyClose[i] ?? 0) > sma200 / c : true;
      const vnow = vix[i];
      const crisis = vnow != null && vnow >= 35;
      const riskOff = crisis || !spyAbove200;

      const raw = new Map<string, number>();
      for (const s of sleeves) {
        const st = trailingSharpeVol(rets.get(s.key)!, i, WINDOW);
        const sampleTrust = Math.min(1, st.n / 60);
        const blended = 0.3 * sampleTrust * st.sharpe + (1 - 0.3 * sampleTrust) * s.prior;
        let score = 0;
        if (!(st.n >= 40 && st.sharpe < sharpeFloor)) {
          const tilt = Math.max(0.2, 1 + 0.3 * (blended - 0.7));
          score = (tilt / st.vol) * regimeMult(s.family, riskOff, crisis);
        }
        raw.set(s.key, Math.max(0, score));
      }
      let sum = 0; for (const v of raw.values()) sum += v;
      const gross = crisis ? 0.5 : riskOff ? 0.85 : 1.0;
      weights = new Map();
      if (sum > 0) for (const [k, v] of raw) weights.set(k, Math.min(maxW, (v / sum) * gross));
      // vol-target via sleeve return covariance
      const active = [...weights.keys()].filter((k) => (weights.get(k) ?? 0) > 0);
      const pv = portVol(active, weights, rets, i, 60);
      const scale = pv > 0 ? Math.max(0.25, Math.min(1, VOL_TARGET / pv)) : Math.max(0.25, Math.min(1, VOL_TARGET / 0.12));
      for (const k of active) weights.set(k, (weights.get(k) ?? 0) * scale);
    }
    // apply
    let dayRet = 0;
    for (const [k, w] of weights) dayRet += w * (rets.get(k)![i] ?? 0);
    portEq *= 1 + dayRet;
    portCurve.push({ date: data.calendar[i], equity: Math.round(portEq * 100) / 100 });
  }

  // Report.
  const benchScaled = data.calendar.map((d, i) => ({ date: d, equity: spyEq[i] * INITIAL })).slice(start);
  const m = computeMetrics(portCurve);
  const capm = capmStats(portCurve, benchScaled);
  const rho = curveCorrelation(portCurve, benchScaled);
  const bm = computeMetrics(benchScaled);

  console.log("=== Combined portfolio (equity sleeves + options VRP), return-level, vol-targeted ===\n");
  console.log(["", "CAGR%".padStart(7), "Vol%".padStart(7), "Sharpe".padStart(7), "MaxDD%".padStart(7), "Calmar".padStart(7), "ρSPY".padStart(6), "netβSh".padStart(7)].join(" "));
  console.log(["SPY".padEnd(10), String(bm.cagrPct).padStart(7), String(bm.annVolPct).padStart(7), String(bm.sharpe).padStart(7), String(bm.maxDrawdownPct).padStart(7), String(bm.calmar).padStart(7), "1".padStart(6), "0".padStart(7)].join(" "));
  console.log(["PORTFOLIO".padEnd(10), String(m.cagrPct).padStart(7), String(m.annVolPct).padStart(7), String(m.sharpe).padStart(7), String(m.maxDrawdownPct).padStart(7), String(m.calmar).padStart(7), String(rho).padStart(6), String(capm.netOfBetaSharpe).padStart(7)].join(" "));

  // Sleeve correlation matrix (diversification check).
  console.log("\nSleeve standalone Sharpe + ρ to SPY:");
  for (const s of sleeves) {
    const sc = s.curve.map((p) => ({ date: p.date, equity: p.equity })).slice(start);
    const sm = computeMetrics(sc.map((p) => ({ date: p.date, equity: p.equity * INITIAL })));
    const scapm = capmStats(sc.map((p) => ({ date: p.date, equity: p.equity })), data.calendar.map((d, i) => ({ date: d, equity: spyEq[i] })).slice(start));
    console.log(`  ${s.key.padEnd(18)} Sharpe ${String(sm.sharpe).padStart(6)}  netβSh ${String(scapm.netOfBetaSharpe).padStart(6)}  ρSPY ${scapm.beta}`);
  }

  mkdirSync(OUT_DIR, { recursive: true });
  writeFileSync(join(OUT_DIR, "portfolio-summary.json"), JSON.stringify({ generatedAt: new Date().toISOString(), volTarget: VOL_TARGET, portfolio: { metrics: m, capm, correlationToSPY: rho }, equityCurveWeekly: portCurve.filter((_, i) => i % 5 === 0) }, null, 1));
  console.log(`\nWrote ${join(OUT_DIR, "portfolio-summary.json")}`);
}

function portVol(keys: string[], weights: Map<string, number>, rets: Map<string, number[]>, end: number, window: number): number {
  const series = keys.map((k) => ({ w: weights.get(k) ?? 0, r: rets.get(k)!.slice(end - window + 1, end + 1) })).filter((s) => s.r.length >= 20);
  if (series.length === 0) return 0;
  const wSum = series.reduce((a, s) => a + s.w, 0);
  if (wSum > 0) for (const s of series) s.w /= wSum;
  const L = Math.min(...series.map((s) => s.r.length));
  for (const s of series) s.r = s.r.slice(s.r.length - L);
  const means = series.map((s) => s.r.reduce((a, b) => a + b, 0) / L);
  let varD = 0;
  for (let a = 0; a < series.length; a++) for (let b = 0; b < series.length; b++) {
    let cov = 0; for (let t = 0; t < L; t++) cov += (series[a].r[t] - means[a]) * (series[b].r[t] - means[b]);
    cov /= L - 1; varD += series[a].w * series[b].w * cov;
  }
  return varD > 0 ? Math.sqrt(varD) * Math.sqrt(252) : 0;
}

main().catch((e) => { console.error(e); process.exit(1); });
