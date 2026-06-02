/**
 * Tradable universes for the strategy engine. Equities for cross-sectional strategies;
 * ETFs for trend/rotation; macro tickers for regime only (never traded).
 * Superset of PutStrike's SCREENER_SYMBOLS plus the full SPDR sector set and a
 * multi-asset ETF sleeve (the brief explicitly allows adding free/daily data).
 */

export const EQUITY_UNIVERSE: string[] = [
  // Mega-cap tech
  "AAPL", "MSFT", "GOOGL", "AMZN", "NVDA", "META", "TSLA", "AVGO", "ORCL", "CRM",
  "ADBE", "AMD", "INTC", "CSCO", "IBM",
  // Financials
  "JPM", "V", "MA", "GS", "BAC", "WFC", "MS", "BLK", "AXP", "C",
  // Healthcare
  "UNH", "JNJ", "MRK", "ABBV", "LLY", "PFE", "ABT", "TMO", "AMGN", "MDT",
  // Staples
  "PG", "KO", "PEP", "COST", "WMT", "MO", "PM", "CL", "MDLZ",
  // Discretionary
  "HD", "MCD", "NKE", "SBUX", "TGT", "LOW",
  // Energy
  "XOM", "CVX", "COP", "SLB", "EOG",
  // Industrials
  "CAT", "HON", "UPS", "BA", "GE", "DE", "RTX", "LMT",
  // Utilities / REIT-ish defensives
  "NEE", "DUK", "SO", "D",
  // Materials
  "LIN", "APD", "FCX",
  // Communication
  "DIS", "NFLX", "CMCSA", "T", "VZ",
  // ── Expanded diverse optionable universe (Sharpe-2 push: more sectors/sizes/IV) ──
  // Semis / hardware
  "QCOM", "TXN", "AMAT", "MU", "LRCX", "KLAC", "ADI", "MRVL", "ON", "MCHP", "SMCI", "ARM", "DELL",
  // Software / internet infra
  "NOW", "PANW", "CRWD", "FTNT", "SNOW", "NET", "DDOG", "PLTR", "SHOP", "INTU", "SNPS", "CDNS",
  // Consumer internet
  "UBER", "ABNB", "BKNG", "PINS", "SNAP", "RBLX", "ROKU", "SPOT", "MELI",
  // Fintech / crypto-linked
  "COIN", "HOOD", "PYPL", "SQ", "AFRM", "SOFI", "MSTR",
  // Healthcare (higher event vol)
  "ISRG", "VRTX", "REGN", "GILD", "BSX", "SYK", "ZTS", "CI", "CVS", "ELV", "MRNA", "DXCM",
  // Financials
  "SCHW", "SPGI", "ICE", "CME", "CB", "PGR", "MMC", "COF", "USB", "PNC", "MET",
  // Consumer discretionary
  "CMG", "ORLY", "AZO", "MAR", "ROST", "TJX", "DG", "LULU", "RCL", "F", "GM",
  // Consumer staples
  "MNST", "KDP", "KHC", "STZ",
  // Industrials
  "CSX", "EMR", "ETN", "ITW", "GD", "NOC", "FDX", "CMI",
  // Energy
  "MPC", "PSX", "VLO", "OXY", "OKE", "HAL", "FANG",
  // Materials
  "NUE", "NEM", "SHW", "ALB",
  // Communication / media
  "TMUS", "CHTR", "EA", "TTWO",
  // High-IV growth / theme
  "ENPH", "FSLR", "RIVN", "CVNA", "DKNG",
];

/** GICS sector SPDRs — for sector-momentum rotation. */
export const SECTOR_ETFS: string[] = [
  "XLK", "XLF", "XLV", "XLE", "XLI", "XLY", "XLP", "XLB", "XLU", "XLC", "XLRE",
];

/** Multi-asset sleeve for time-series trend / dual momentum (equity, bonds, gold, commodities, RE, intl). */
export const TREND_ETFS: string[] = [
  "SPY", "QQQ", "IWM", "EEM", "EFA", "TLT", "IEF", "LQD", "GLD", "DBC", "VNQ",
];

/**
 * Cross-asset NON-(US-large-cap-equity) sleeve for managed-futures-style trend — the genuinely
 * orthogonal, positive-skew "crisis alpha" diversifier (bonds, gold, silver, broad commodities,
 * oil, the US dollar, REITs, intl equity). Added per the advanced-fleet brief + user scope expansion.
 */
export const CROSS_ASSET_ETFS: string[] = [
  "TLT", "IEF", "SHY", "GLD", "SLV", "DBC", "USO", "UUP", "VNQ", "EEM", "EFA",
];

/**
 * Long-only factor ETFs for factor-momentum rotation (added per fleet recommendation).
 * MTUM momentum, QUAL quality, USMV min-vol, VLUE value, SIZE size, IWF growth, IWD value.
 */
export const FACTOR_ETFS: string[] = ["MTUM", "QUAL", "USMV", "VLUE", "SIZE", "IWF", "IWD"];

/** Composition-anchored pairs for market-neutral style/sector reversion (narrow, by design). */
export const STYLE_PAIRS: [string, string][] = [
  ["IWF", "IWD"], // growth vs value (both Russell 1000 subsets)
  ["XLY", "XLP"], // cyclical vs defensive (both S&P 500 sectors)
];

/** Broad ETFs that are also tradable in reversal/rotation. */
export const BROAD_ETFS: string[] = ["SPY", "QQQ", "IWM", "DIA", "SMH", "GLD", "EEM"];

/** Vol / credit / commodity / theme ETPs for the vol-carry, dispersion, and credit sleeves. */
export const VOL_CREDIT_ETPS: string[] = ["VXX", "SVXY", "VIXY", "HYG", "GDX", "XBI", "UNG", "SMH"];

/** Regime-only tickers — fetched for context, never traded. */
export const MACRO_TICKERS: string[] = ["^VIX", "^VIX9D", "^VIX3M"];

/** Everything the local backtest should fetch. */
export const ALL_BACKTEST_SYMBOLS: string[] = Array.from(
  new Set([
    ...EQUITY_UNIVERSE,
    ...SECTOR_ETFS,
    ...TREND_ETFS,
    ...CROSS_ASSET_ETFS,
    ...FACTOR_ETFS,
    ...VOL_CREDIT_ETPS,
    ...BROAD_ETFS,
    ...MACRO_TICKERS,
  ])
);

const EQ = new Set(EQUITY_UNIVERSE);
const SECT = new Set(SECTOR_ETFS);
const TREND = new Set(TREND_ETFS);
const BROAD = new Set(BROAD_ETFS);
const CROSS = new Set(CROSS_ASSET_ETFS);
const FACTOR = new Set(FACTOR_ETFS);

export const isEquity = (s: string): boolean => EQ.has(s);
export const isSectorETF = (s: string): boolean => SECT.has(s);
export const isTrendETF = (s: string): boolean => TREND.has(s);
export const isBroadETF = (s: string): boolean => BROAD.has(s);
export const isCrossAssetETF = (s: string): boolean => CROSS.has(s);
export const isFactorETF = (s: string): boolean => FACTOR.has(s);
