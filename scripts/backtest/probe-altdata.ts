/**
 * Probe: confirm every symbol in the EXPANDED universe (equities + multi-asset ETFs + crypto +
 * the "unique data source" macro/vol/rates/dollar tickers) actually fetches from Yahoo, and report
 * coverage + history depth. Any ticker that 404s here is dropped from production loads.
 *
 *   node --use-system-ca --no-warnings --import ./scripts/register-ts.mjs scripts/backtest/probe-altdata.ts
 */
import { loadSymbol } from "./data.ts";
import {
  EQUITY_UNIVERSE, CRYPTO_UNIVERSE, INTL_ETFS, RATES_ETFS, CREDIT_ETFS,
  COMMODITY_ETFS, MACRO_TICKERS, ALL_BACKTEST_SYMBOLS,
} from "../../src/lib/strategies/universe.ts";

const groups: [string, string[]][] = [
  ["macro/alt-data", MACRO_TICKERS],
  ["crypto", CRYPTO_UNIVERSE],
  ["intl", INTL_ETFS],
  ["rates", RATES_ETFS],
  ["credit", CREDIT_ETFS],
  ["commodity", COMMODITY_ETFS],
];

console.log(`Universe sizes: equities=${EQUITY_UNIVERSE.length}  ALL_BACKTEST_SYMBOLS=${ALL_BACKTEST_SYMBOLS.length}\n`);

const failed: string[] = [];
for (const [name, syms] of groups) {
  console.log(`=== ${name} (${syms.length}) ===`);
  for (const s of syms) {
    try {
      const bars = await loadSymbol(s, 11, 6);
      const first = bars[0]?.date, last = bars[bars.length - 1]?.date;
      console.log(`  ${s.padEnd(11)} bars=${String(bars.length).padStart(5)}  ${first} -> ${last}`);
    } catch (e) {
      failed.push(s);
      console.log(`  ${s.padEnd(11)} FAILED ${(e as Error).message}`);
    }
  }
}

// Spot-check a random-ish slice of the equity expansion (every 25th name) to catch dead tickers.
console.log(`\n=== equity spot-check (every 25th of ${EQUITY_UNIVERSE.length}) ===`);
for (let i = 0; i < EQUITY_UNIVERSE.length; i += 25) {
  const s = EQUITY_UNIVERSE[i];
  try {
    const bars = await loadSymbol(s, 11, 6);
    console.log(`  ${s.padEnd(6)} bars=${String(bars.length).padStart(5)}  ${bars[0]?.date} -> ${bars[bars.length - 1]?.date}`);
  } catch (e) {
    failed.push(s);
    console.log(`  ${s.padEnd(6)} FAILED ${(e as Error).message}`);
  }
}

console.log(`\nFAILED (${failed.length}): ${failed.join(", ") || "none"}`);
