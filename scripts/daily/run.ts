/**
 * LOCAL test harness for the daily automated sim (matches the Vercel cron logic).
 *
 *   node --use-system-ca --no-warnings --import ./scripts/register-ts.mjs scripts/daily/run.ts            # one day
 *   node --use-system-ca --no-warnings --import ./scripts/register-ts.mjs scripts/daily/run.ts --seed 180 # replay 180d
 *
 * Uses a JSON file as the sim book (the Vercel route uses Neon instead). Replaying validates
 * that the daily loop reproduces the meta-backtest and seeds an equity curve for the UI.
 */
import { writeFileSync, readFileSync, existsSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { AlignedData } from "../../src/lib/backtest/engine";
import { runDay, type SimBook } from "../../src/lib/daily/engine";
import { ALL_BACKTEST_SYMBOLS } from "../../src/lib/strategies/universe";
import { loadUniverse, buildAligned } from "../backtest/data";

const __dirname = dirname(fileURLToPath(import.meta.url));
const BOOK_FILE = join(__dirname, ".book.json");
const EQUITY_FILE = join(__dirname, "..", "..", "research", "backtests", "live-sim-equity.json");
const INITIAL = 100000;

function sliceAligned(data: AlignedData, end: number): AlignedData {
  const cut = end + 1;
  const closes = new Map<string, (number | null)[]>();
  const bars = new Map<string, (typeof data.bars extends Map<string, infer V> ? V : never)>();
  for (const [k, v] of data.closes) closes.set(k, v.slice(0, cut));
  for (const [k, v] of data.bars) bars.set(k, v.slice(0, cut) as never);
  return {
    calendar: data.calendar.slice(0, cut),
    closes,
    bars: bars as AlignedData["bars"],
    vix: data.vix?.slice(0, cut),
    vix9d: data.vix9d?.slice(0, cut),
  };
}

async function main() {
  const seedArg = process.argv.indexOf("--seed");
  const seedDays = seedArg >= 0 ? parseInt(process.argv[seedArg + 1] ?? "180", 10) : 0;

  const series = await loadUniverse(ALL_BACKTEST_SYMBOLS, 11);
  const data = buildAligned(series, { vixSymbol: "^VIX", vix9dSymbol: "^VIX9D" });
  const last = data.calendar.length - 1;

  if (seedDays > 0) {
    console.log(`Seeding: replaying the last ${seedDays} trading days from scratch...`);
    let book: SimBook = { initialCapital: INITIAL, cash: INITIAL, holdings: {}, lastRebalanceDate: null };
    const equity: any[] = [];
    const startIdx = Math.max(300, last - seedDays);
    for (let t = startIdx; t <= last; t++) {
      const sub = sliceAligned(data, t);
      const res = runDay(sub, book);
      book = res.book;
      equity.push({ date: res.date, equity: res.equityAfter, deployedPct: res.deployedPct, regime: res.regime.regime, trades: res.trades.length });
      if (res.trades.length) console.log(`  ${res.date}  eq $${res.equityAfter.toLocaleString()}  ${res.trades.length} trades  [${res.regime.regime}]  ${res.notes}`);
    }
    mkdirSync(dirname(EQUITY_FILE), { recursive: true });
    writeFileSync(EQUITY_FILE, JSON.stringify({ generatedAt: new Date().toISOString(), initialCapital: INITIAL, equity }, null, 1));
    writeFileSync(BOOK_FILE, JSON.stringify(book, null, 1));
    const start = equity[0]?.equity ?? INITIAL;
    const end = equity[equity.length - 1]?.equity ?? INITIAL;
    console.log(`\nSeeded ${equity.length} days. Equity ${start.toLocaleString()} → ${end.toLocaleString()} (${(((end / start) - 1) * 100).toFixed(1)}%).`);
    console.log(`Book → ${BOOK_FILE}\nEquity → ${EQUITY_FILE}`);
    return;
  }

  // Single day (incremental): load book, run today, persist.
  let book: SimBook = existsSync(BOOK_FILE)
    ? JSON.parse(readFileSync(BOOK_FILE, "utf8"))
    : { initialCapital: INITIAL, cash: INITIAL, holdings: {}, lastRebalanceDate: null };

  const res = runDay(data, book);
  console.log(`\n=== Daily run ${res.date} [${res.regime.regime}] ===`);
  console.log(`Equity: $${res.equityAfter.toLocaleString()}  | deployed ${res.deployedPct}% | volScale ${res.volScale} | ${res.notes}`);
  if (res.decision) {
    console.log("\nAllocation (self-tracking):");
    for (const d of res.decision.detail.filter((x) => x.weight > 0 || x.benched)) {
      console.log(`  ${d.key.padEnd(18)} ${(d.weight * 100).toFixed(1).padStart(5)}%  ${d.benched ? "[BENCHED] " : ""}${d.reason}`);
    }
  }
  if (res.trades.length) {
    console.log(`\nTrades (${res.trades.length}):`);
    for (const t of res.trades.slice(0, 20)) console.log(`  ${t.side.padEnd(5)} ${t.symbol.padEnd(6)} ${t.shares} @ ${t.price}  (${t.reason})`);
  } else console.log("\nNo trades (hold).");
  writeFileSync(BOOK_FILE, JSON.stringify(res.book, null, 1));
  console.log(`\nBook saved → ${BOOK_FILE}`);
}

main().catch((e) => { console.error(e); process.exit(1); });
