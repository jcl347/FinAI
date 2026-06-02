/**
 * Pure data-alignment: turn per-symbol Bar[] series into the AlignedData the engine consumes
 * (a master calendar + per-symbol arrays with nulls for missing days). Shared by the offline
 * backtest loader (scripts/backtest/data.ts) and the live Yahoo adapter (quant-data.ts) so the
 * sim and production see data in exactly the same shape.
 */
import type { Bar } from "../strategies/types";
import type { AlignedData } from "./engine";

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
