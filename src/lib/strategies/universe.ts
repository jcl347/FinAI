/**
 * Tradable universes for the strategy engine. Equities for cross-sectional strategies;
 * ETFs for trend/rotation; macro tickers for regime only (never traded).
 * Superset of PutStrike's SCREENER_SYMBOLS plus the full SPDR sector set and a
 * multi-asset ETF sleeve (the brief explicitly allows adding free/daily data).
 */

export const EQUITY_UNIVERSE: string[] = [
  // ── Mega-cap tech / core ──
  "AAPL", "MSFT", "GOOGL", "GOOG", "AMZN", "NVDA", "META", "TSLA", "AVGO", "ORCL", "CRM",
  "ADBE", "AMD", "INTC", "CSCO", "IBM", "TXN", "QCOM", "NOW", "INTU",
  // ── Semis / hardware ──
  "AMAT", "MU", "LRCX", "KLAC", "ADI", "MRVL", "ON", "MCHP", "NXPI", "SWKS", "QRVO",
  "MPWR", "ENTG", "TER", "LSCC", "ARM", "SMCI", "DELL", "HPQ", "HPE", "NTAP", "WDC",
  "STX", "GLW", "APH", "TEL", "KEYS", "GRMN", "ZBRA", "TRMB",
  // ── Software / internet infra ──
  "PANW", "CRWD", "FTNT", "SNPS", "CDNS", "ADSK", "ROP", "FICO", "IT", "GPN",
  "JKHY", "AKAM", "TYL", "PTC", "SNOW", "NET", "DDOG", "ZS", "OKTA", "MDB",
  "DOCU", "TWLO", "WDAY", "TEAM", "HUBS", "PLTR", "SHOP", "CDW",
  // ── Consumer internet ──
  "UBER", "ABNB", "BKNG", "PINS", "SNAP", "RBLX", "ROKU", "SPOT", "MELI", "DASH", "MTCH",
  // ── Fintech / crypto-linked ──
  "COIN", "HOOD", "PYPL", "XYZ", "AFRM", "SOFI", "MSTR",
  // ── Financials: banks ──
  "JPM", "BAC", "WFC", "C", "USB", "TFC", "PNC", "FITB", "HBAN", "RF", "KEY", "CFG",
  "MTB", "NTRS", "STT", "BK",
  // ── Financials: capital markets / payments / asset mgrs ──
  "GS", "MS", "V", "MA", "AXP", "SCHW", "SPGI", "ICE", "CME", "MCO", "NDAQ", "CBOE",
  "MKTX", "AMP", "RJF", "TROW", "BEN", "BLK", "BX", "KKR", "APO", "ALLY", "SYF", "COF",
  // ── Insurers ──
  "BRK-B", "PGR", "TRV", "CB", "AIG", "MET", "PRU", "AFL", "HIG", "ALL", "CINF", "AON",
  "AJG", "BRO", "WTW", "ACGL",
  // ── Healthcare ──
  "UNH", "JNJ", "LLY", "ABBV", "MRK", "PFE", "ABT", "TMO", "AMGN", "MDT", "BMY", "DHR",
  "ISRG", "SYK", "BSX", "ZTS", "VRTX", "REGN", "GILD", "BIIB", "CI", "CVS", "HUM", "CNC",
  "HCA", "ELV", "MOH", "DVA", "LH", "DGX", "IQV", "RMD", "STE", "WST", "MTD", "WAT", "BIO",
  "TECH", "BDX", "EW", "ZBH", "ALGN", "HOLX", "IDXX", "COO", "PODD", "INCY", "MRNA", "DXCM",
  // ── Staples ──
  "PG", "KO", "PEP", "COST", "WMT", "MO", "PM", "CL", "MDLZ", "GIS", "HSY", "SJM",
  "CAG", "CPB", "HRL", "TSN", "TAP", "KMB", "CLX", "CHD", "EL", "KVUE", "SYY", "ADM", "KR",
  "DLTR", "DG", "MNST", "KDP", "KHC", "STZ",
  // ── Discretionary ──
  "HD", "MCD", "NKE", "SBUX", "TGT", "LOW", "CMG", "ORLY", "AZO", "MAR", "ROST", "TJX",
  "LULU", "RCL", "CCL", "NCLH", "F", "GM", "YUM", "DRI", "DPZ", "EXPE", "HLT", "MGM",
  "WYNN", "APTV", "LKQ", "GPC", "ULTA", "BBY", "TSCO", "POOL", "DHI", "LEN", "NVR", "PHM",
  "HAS", "RL", "TPR", "DECK",
  // ── Industrials ──
  "CAT", "HON", "UPS", "BA", "GE", "DE", "RTX", "LMT", "MMM", "GD", "NOC", "LHX", "TDG",
  "TXT", "HWM", "AME", "ROK", "DOV", "IR", "XYL", "PH", "IEX", "CARR", "OTIS", "JCI", "TT",
  "WAB", "PCAR", "CMI", "URI", "FAST", "GWW", "WM", "RSG", "ODFL", "JBHT", "CHRW", "EXPD",
  "NSC", "UNP", "LUV", "DAL", "UAL", "EMR", "ETN", "ITW", "CSX", "FDX",
  // ── Energy ──
  "XOM", "CVX", "COP", "SLB", "EOG", "MPC", "PSX", "VLO", "OXY", "OKE", "HAL", "FANG",
  "WMB", "KMI", "ET", "EPD", "TRGP", "LNG", "DVN", "CTRA", "EQT", "BKR",
  // ── Utilities ──
  "NEE", "DUK", "SO", "D", "AEP", "EXC", "XEL", "SRE", "PEG", "ED", "EIX", "WEC", "ES",
  "AEE", "CMS", "DTE", "PPL", "ATO", "NI", "LNT", "EVRG", "AES",
  // ── Materials ──
  "LIN", "APD", "FCX", "ECL", "SHW", "IFF", "PPG", "DD", "DOW", "CE", "EMN", "CF", "MOS",
  "FMC", "VMC", "MLM", "NUE", "STLD", "RS", "PKG", "IP", "AMCR", "BALL", "AVY", "NEM", "ALB",
  // ── Real estate (REITs) ──
  "AMT", "PLD", "CCI", "EQIX", "PSA", "O", "SPG", "WELL", "VICI", "DLR", "SBAC", "AVB",
  "EQR", "EXR", "MAA", "INVH", "VTR", "IRM", "KIM",
  // ── Communication / media ──
  "DIS", "NFLX", "CMCSA", "T", "VZ", "TMUS", "CHTR", "EA", "TTWO", "OMC", "WBD",
  "PSKY", "LYV", "FOXA",
  // ── High-IV growth / theme + recent large-cap listings ──
  "ENPH", "FSLR", "RIVN", "CVNA", "DKNG", "CART", "GEHC", "CEG", "VLTO", "SOLV", "VST",
];

/**
 * Crypto sleeve (Yahoo `*-USD` pairs). 24/7 assets sampled onto the SPY calendar (the Monday
 * bar reflects the weekend move). A genuinely new, partly-decorrelated return stream for trend
 * and cross-sectional-crypto sleeves. Ordered by history length / liquidity. Added per the
 * "all instrument types" scope expansion.
 */
export const CRYPTO_UNIVERSE: string[] = [
  "BTC-USD", "ETH-USD", "SOL-USD", "BNB-USD", "XRP-USD", "ADA-USD", "DOGE-USD", "LTC-USD",
  "LINK-USD", "AVAX-USD", "DOT-USD",
];

/** International equity ETFs (regional decorrelation for cross-asset trend/carry). */
export const INTL_ETFS: string[] = ["EFA", "EEM", "VGK", "EWJ", "FXI", "INDA", "EWZ", "EWY", "EWT", "ACWX"];

/** Fixed-income / rates ETFs (duration + curve sleeves). */
export const RATES_ETFS: string[] = ["SHY", "IEF", "TLT", "GOVT", "TIP", "BIL", "AGG"];

/** Credit ETFs (credit-spread / carry sleeves). */
export const CREDIT_ETFS: string[] = ["LQD", "HYG", "EMB", "BKLN", "JNK"];

/** Commodity ETFs (real-asset trend / inflation sleeves). */
export const COMMODITY_ETFS: string[] = ["DBC", "GLD", "SLV", "USO", "UNG", "DBA", "CPER", "PDBC"];

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

/**
 * Regime-only / "unique data source" tickers — fetched for context & signals, never traded.
 * All are FREE, DAILY, Yahoo-fetchable index quotes, so the same signal works in backtest AND live:
 *  - VIX complex (term structure): ^VIX (30d), ^VIX9D (9d), ^VIX3M (93d), ^VVIX (vol-of-vol)
 *  - CBOE SKEW (^SKEW): tail-risk / crash-fear premium — a genuinely orthogonal sentiment gauge
 *  - Cross-asset implied vol: ^OVX (oil), ^GVZ (gold) — stress that leads equity vol
 *  - US Treasury curve: ^IRX (13w), ^FVX (5y), ^TNX (10y), ^TYX (30y) → level + 2s10s slope regime
 *  - US Dollar index: DX-Y.NYB — the macro factor that drove the 2022 stocks-and-bonds-down regime
 * (Validated for availability in scripts/backtest/probe-altdata.ts; any that 404 are dropped at load.)
 */
export const MACRO_TICKERS: string[] = [
  "^VIX", "^VIX9D", "^VIX3M", "^VVIX", "^SKEW", "^OVX", "^GVZ",
  "^IRX", "^FVX", "^TNX", "^TYX", "DX-Y.NYB",
];

/** Everything the local backtest should fetch (incl. the expanded multi-asset + crypto + alt-data). */
export const ALL_BACKTEST_SYMBOLS: string[] = Array.from(
  new Set([
    ...EQUITY_UNIVERSE,
    ...SECTOR_ETFS,
    ...TREND_ETFS,
    ...CROSS_ASSET_ETFS,
    ...FACTOR_ETFS,
    ...VOL_CREDIT_ETPS,
    ...BROAD_ETFS,
    ...INTL_ETFS,
    ...RATES_ETFS,
    ...CREDIT_ETFS,
    ...COMMODITY_ETFS,
    ...CRYPTO_UNIVERSE,
    ...MACRO_TICKERS,
  ])
);

/**
 * Lean LIVE universe — ONLY the symbols the REGISTERED production sleeves actually need. Excludes
 * crypto (no funded crypto sleeve) and the unused alt-data macro tickers (^SKEW/^VVIX/^OVX/^GVZ/the
 * Treasury curve) whose sleeves were cut — keeping only ^VIX/^VIX9D (regime + tail_hedge) and
 * DX-Y.NYB (commodity_trend's dollar gate). This keeps the Vercel daily fetch fast and avoids fetching
 * data the book never trades or reads. (The offline backtest still uses the full ALL_BACKTEST_SYMBOLS.)
 */
export const PRODUCTION_UNIVERSE: string[] = Array.from(
  new Set([
    ...EQUITY_UNIVERSE,
    ...SECTOR_ETFS,
    ...TREND_ETFS,
    ...CROSS_ASSET_ETFS,
    ...FACTOR_ETFS,
    ...COMMODITY_ETFS,
    ...BROAD_ETFS,
    ...VOL_CREDIT_ETPS,
    "^VIX", "^VIX9D", "DX-Y.NYB",
  ])
);

const EQ = new Set(EQUITY_UNIVERSE);
const SECT = new Set(SECTOR_ETFS);
const TREND = new Set(TREND_ETFS);
const BROAD = new Set(BROAD_ETFS);
const CROSS = new Set(CROSS_ASSET_ETFS);
const FACTOR = new Set(FACTOR_ETFS);
const CRYPTO = new Set(CRYPTO_UNIVERSE);
const MACRO = new Set(MACRO_TICKERS);

export const isEquity = (s: string): boolean => EQ.has(s);
export const isSectorETF = (s: string): boolean => SECT.has(s);
export const isTrendETF = (s: string): boolean => TREND.has(s);
export const isBroadETF = (s: string): boolean => BROAD.has(s);
export const isCrossAssetETF = (s: string): boolean => CROSS.has(s);
export const isFactorETF = (s: string): boolean => FACTOR.has(s);
export const isCrypto = (s: string): boolean => CRYPTO.has(s);
/** Macro/alt-data context tickers are NEVER traded — guard execution against them. */
export const isMacroTicker = (s: string): boolean => MACRO.has(s);
