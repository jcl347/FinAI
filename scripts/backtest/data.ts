/**
 * Local historical-data loader for the backtest harness.
 *
 * Uses Node's built-in fetch against Yahoo's public chart API — NO npm dependency,
 * NO node_modules. Run with `node --use-system-ca` so the corporate proxy cert is
 * trusted. Results are cached to scripts/backtest/.cache/<symbol>.json so re-runs are
 * instant and reproducible.
 *
 * NOTE: this is the LOCAL/offline data path (this sandbox can't `npm install`). The
 * production Vercel runtime uses the repo's yahoo-finance2 layer instead; both produce
 * the same Bar[] shape, so strategies + engine are identical in sim and in prod.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { Bar } from "../../src/lib/strategies/types";
import type { AlignedData } from "../../src/lib/backtest/engine";

const __dirname = dirname(fileURLToPath(import.meta.url));
const CACHE_DIR = join(__dirname, ".cache");

function isoDay(unixSec: number): string {
  return new Date(unixSec * 1000).toISOString().split("T")[0];
}

async function fetchChart(symbol: string, years: number): Promise<Bar[]> {
  const period2 = Math.floor(Date.now() / 1000);
  const period1 = period2 - Math.floor(years * 365.25 * 86400);
  const url =
    `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}` +
    `?period1=${period1}&period2=${period2}&interval=1d&events=div%2Csplit`;

  let lastErr: unknown = null;
  for (let attempt = 0; attempt < 4; attempt++) {
    try {
      const res = await fetch(url, {
        headers: { "User-Agent": "Mozilla/5.0 (FinAI backtest)" },
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const j: any = await res.json();
      const r = j?.chart?.result?.[0];
      if (!r?.timestamp) throw new Error("no timestamps");
      const ts: number[] = r.timestamp;
      const q = r.indicators?.quote?.[0] ?? {};
      const adj = r.indicators?.adjclose?.[0]?.adjclose ?? q.close ?? [];
      const bars: Bar[] = [];
      for (let i = 0; i < ts.length; i++) {
        const close = adj[i] ?? q.close?.[i];
        const rawClose = q.close?.[i];
        if (close == null || rawClose == null) continue;
        // Scale OHL by the adjustment factor so the whole bar is total-return consistent.
        const f = rawClose > 0 ? close / rawClose : 1;
        bars.push({
          date: isoDay(ts[i]),
          open: (q.open?.[i] ?? rawClose) * f,
          high: (q.high?.[i] ?? rawClose) * f,
          low: (q.low?.[i] ?? rawClose) * f,
          close,
          volume: q.volume?.[i] ?? 0,
        });
      }
      return bars;
    } catch (err) {
      lastErr = err;
      await new Promise((r) => setTimeout(r, 400 * 2 ** attempt));
    }
  }
  throw new Error(`fetchChart(${symbol}) failed: ${lastErr instanceof Error ? lastErr.message : lastErr}`);
}

/** Load bars for a symbol, using the on-disk cache when fresh (< maxAgeHours). */
export async function loadSymbol(symbol: string, years = 11, maxAgeHours = 18): Promise<Bar[]> {
  if (!existsSync(CACHE_DIR)) mkdirSync(CACHE_DIR, { recursive: true });
  const file = join(CACHE_DIR, `${symbol.replace(/[^A-Za-z0-9._^-]/g, "_")}.json`);
  if (existsSync(file)) {
    try {
      const cached = JSON.parse(readFileSync(file, "utf8"));
      const ageH = (Date.now() - cached.fetchedAt) / 3600000;
      if (ageH < maxAgeHours && Array.isArray(cached.bars) && cached.bars.length > 0) {
        return cached.bars;
      }
    } catch {
      /* fall through to refetch */
    }
  }
  const bars = await fetchChart(symbol, years);
  writeFileSync(file, JSON.stringify({ symbol, fetchedAt: Date.now(), bars }));
  return bars;
}

/** Load many symbols with bounded concurrency (be kind to Yahoo). */
export async function loadUniverse(
  symbols: string[],
  years = 11,
  concurrency = 4
): Promise<Map<string, Bar[]>> {
  const out = new Map<string, Bar[]>();
  for (let i = 0; i < symbols.length; i += concurrency) {
    const batch = symbols.slice(i, i + concurrency);
    const results = await Promise.allSettled(batch.map((s) => loadSymbol(s, years)));
    for (let j = 0; j < batch.length; j++) {
      const r = results[j];
      if (r.status === "fulfilled" && r.value.length > 0) out.set(batch[j], r.value);
      else process.stderr.write(`  [data] ${batch[j]} failed: ${r.status === "rejected" ? r.reason?.message : "empty"}\n`);
    }
    if (i + concurrency < symbols.length) await new Promise((r) => setTimeout(r, 250));
  }
  return out;
}

/**
 * Align all symbols to a master calendar (default SPY's trading days) into the
 * AlignedData shape the engine consumes. Missing days are null (no forward-fill —
 * the engine's no-look-ahead accessors skip nulls).
 */
export function buildAligned(
  series: Map<string, Bar[]>,
  opts: { calendarSymbol?: string; vixSymbol?: string; vix9dSymbol?: string } = {}
): AlignedData {
  const calSym = opts.calendarSymbol ?? "SPY";
  const calBars = series.get(calSym);
  if (!calBars) throw new Error(`calendar symbol ${calSym} not loaded`);
  const calendar = calBars.map((b) => b.date);
  const calIndex = new Map(calendar.map((d, i) => [d, i]));

  const closes = new Map<string, (number | null)[]>();
  const bars = new Map<string, (Bar | null)[]>();

  for (const [sym, arr] of series) {
    const c: (number | null)[] = new Array(calendar.length).fill(null);
    const b: (Bar | null)[] = new Array(calendar.length).fill(null);
    for (const bar of arr) {
      const idx = calIndex.get(bar.date);
      if (idx !== undefined) {
        c[idx] = bar.close;
        b[idx] = bar;
      }
    }
    closes.set(sym, c);
    bars.set(sym, b);
  }

  const vixArr = opts.vixSymbol && closes.get(opts.vixSymbol) ? closes.get(opts.vixSymbol)! : undefined;
  const vix9dArr = opts.vix9dSymbol && closes.get(opts.vix9dSymbol) ? closes.get(opts.vix9dSymbol)! : undefined;

  return { calendar, closes, bars, vix: vixArr, vix9d: vix9dArr };
}
