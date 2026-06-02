"use client";

import { useState, useCallback, useRef, useMemo } from "react";
import SymbolSearch from "@/components/SymbolSearch";
import MarketRegime from "@/components/MarketRegime";
import StockQuoteCard from "@/components/StockQuoteCard";
import PutTable from "@/components/PutTable";
import ScreenerResults from "@/components/ScreenerResults";
import Top10Puts from "@/components/Top10Puts";
import ErrorToast from "@/components/ErrorToast";
import PutDecisionAssistant from "@/components/PutDecisionAssistant";
import DTESelector, { DEFAULT_DTE, type DTERange } from "@/components/DTESelector";
import { DeltaSelector, AnnReturnSelector, DEFAULT_DELTA, DEFAULT_ANN_RETURN, type DeltaRange, type AnnReturnRange } from "@/components/PutFilters";
import TradesDashboard from "@/components/TradesDashboard";
import QuantDashboard from "@/components/QuantDashboard";

interface AnalysisData {
  symbol: string;
  quote: {
    symbol: string;
    name: string;
    price: number;
    previousClose: number;
    change: number;
    changePercent: number;
    volume: number;
    avgVolume: number;
    marketCap: number;
    fiftyTwoWeekLow: number;
    fiftyTwoWeekHigh: number;
    dividendYield: number;
    beta: number;
    trailingPE: number;
  };
  historicalVolatility: { currentHV: number; hvHigh: number; hvLow: number; hvRank: number };
  stability: { score: number; signals: { name: string; value: string; sentiment: string; weight: number }[] };
  marketRegime: { vix: number; regime: string; favorsPutSelling: boolean; description: string };
  scoredPuts: Array<{
    symbol: string; stockPrice: number; strikePrice: number; expiration: string; dte: number;
    bid: number; ask: number; lastPrice: number; volume: number; openInterest: number;
    impliedVolatility: number; delta: number; theta: number; score: number; premiumYield: number;
    annualizedReturn: number; distanceOTM: number; bidAskSpread: number; stabilityScore: number;
    recommendation: string; signals: { name: string; value: string; sentiment: string; weight: number }[];
  }>;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type ScreenerData = any;

// High-liquidity optionable stocks across sectors + major ETFs (the put screener universe).
const SCREENER_SYMBOLS = [
  "AAPL", "MSFT", "GOOGL", "AMZN", "NVDA", "META", "TSLA", "AVGO", "ORCL", "CRM", "ADBE", "AMD", "INTC", "CSCO", "IBM",
  "JPM", "V", "MA", "GS", "BAC", "WFC", "MS", "BLK", "AXP", "C",
  "UNH", "JNJ", "MRK", "ABBV", "LLY", "PFE", "ABT", "TMO", "AMGN", "MDT",
  "PG", "KO", "PEP", "COST", "WMT", "MO", "PM", "CL", "MDLZ",
  "HD", "MCD", "NKE", "SBUX", "TGT", "LOW",
  "XOM", "CVX", "COP", "SLB", "EOG",
  "CAT", "HON", "UPS", "BA", "GE", "DE", "RTX", "LMT",
  "NEE", "DUK", "SO", "D", "LIN", "APD", "FCX",
  "DIS", "NFLX", "CMCSA", "T", "VZ",
  "SPY", "QQQ", "IWM", "DIA", "SMH", "XLF", "XLE", "XLK", "XLV", "GLD", "EEM",
];

interface ScreenProgress {
  total: number;
  completed: number;
  currentSymbol: string;
  failedSymbols: { symbol: string; error: string }[];
}

export default function Home() {
  const [analysis, setAnalysis] = useState<AnalysisData | null>(null);
  const [screenerData, setScreenerData] = useState<ScreenerData | null>(null);
  const [loading, setLoading] = useState(false);
  const [screenLoading, setScreenLoading] = useState(false);
  const [screenProgress, setScreenProgress] = useState<ScreenProgress | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [errorDetails, setErrorDetails] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<"engine" | "analyze" | "screen" | "trades">("engine");
  const [tradeRefreshKey, setTradeRefreshKey] = useState(0);
  const [dataSourceStatus, setDataSourceStatus] = useState<"connected" | "degraded" | "down" | null>(null);
  const abortRef = useRef(false);
  const [dteRange, setDteRange] = useState<DTERange>(DEFAULT_DTE);
  const [deltaRange, setDeltaRange] = useState<DeltaRange>(DEFAULT_DELTA);
  const [annReturnRange, setAnnReturnRange] = useState<AnnReturnRange>(DEFAULT_ANN_RETURN);

  const safeParseResponse = async (res: Response): Promise<{ data: Record<string, unknown> | null; rawText: string }> => {
    const rawText = await res.text();
    try {
      return { data: JSON.parse(rawText), rawText };
    } catch {
      return { data: null, rawText };
    }
  };

  const analyzeSymbol = useCallback(async (symbol: string) => {
    setLoading(true);
    setError(null);
    setErrorDetails(null);
    setActiveTab("analyze");
    setDataSourceStatus(null);
    try {
      const res = await fetch(`/api/analyze?symbol=${encodeURIComponent(symbol)}&minDte=1&maxDte=120`);
      const { data, rawText } = await safeParseResponse(res);
      if (!res.ok) {
        const serverError = data?.error as string | undefined;
        setErrorDetails(`Status: ${res.status}\n${serverError ?? rawText.slice(0, 500)}`);
        if (serverError?.includes("fetch failed") || serverError?.includes("429")) {
          setDataSourceStatus("down");
          throw new Error("Yahoo Finance is currently unavailable (rate limited or unreachable). Please try again in a few minutes.");
        }
        throw new Error(serverError || `Server returned ${res.status}: ${rawText.slice(0, 200)}`);
      }
      if (!data) throw new Error("Server returned invalid response (not JSON)");
      setAnalysis(data as unknown as AnalysisData);
      setDataSourceStatus("connected");
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Analysis failed";
      if (msg.includes("fetch failed") || msg.includes("Failed to fetch")) {
        setDataSourceStatus("down");
        setError("Yahoo Finance is currently unavailable. Please try again shortly.");
      } else {
        setError(msg);
      }
      setAnalysis(null);
    } finally {
      setLoading(false);
    }
  }, []);

  const runScreener = useCallback(async () => {
    setScreenLoading(true);
    setError(null);
    setErrorDetails(null);
    setActiveTab("screen");
    setDataSourceStatus(null);
    setScreenerData(null);
    abortRef.current = false;

    const symbols = SCREENER_SYMBOLS;
    const progress: ScreenProgress = { total: symbols.length, completed: 0, currentSymbol: "", failedSymbols: [] };
    setScreenProgress({ ...progress });

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const successfulResults: any[] = [];
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let marketRegime: any = null;
    let vix: number | null = null;
    const noPutsSymbols: string[] = [];

    try {
      const concurrency = 2;
      for (let i = 0; i < symbols.length; i += concurrency) {
        if (abortRef.current) break;
        const batch = symbols.slice(i, i + concurrency);
        progress.currentSymbol = batch.join(", ");
        setScreenProgress({ ...progress });

        const batchResults = await Promise.allSettled(
          batch.map(async (sym) => {
            const dteParams = `&minDte=1&maxDte=120`;
            const url = vix != null
              ? `/api/screen-single?symbol=${encodeURIComponent(sym)}&vix=${vix}${dteParams}`
              : `/api/screen-single?symbol=${encodeURIComponent(sym)}${dteParams}`;
            const res = await fetch(url);
            const { data } = await safeParseResponse(res);
            if (!res.ok || !data) throw new Error((data?.error as string) || `HTTP ${res.status}`);
            return { symbol: sym, data };
          })
        );

        for (let j = 0; j < batchResults.length; j++) {
          const r = batchResults[j];
          if (r.status === "fulfilled") {
            const { data } = r.value;
            if (vix === null && data.vix) vix = data.vix as number;
            if (!marketRegime && data.marketRegime) marketRegime = data.marketRegime;
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            if ((data.topPuts as any[])?.length > 0) successfulResults.push(data);
            else noPutsSymbols.push(batch[j]);
          } else {
            progress.failedSymbols.push({ symbol: batch[j], error: r.reason?.message ?? "Failed" });
          }
          progress.completed++;
        }
        setScreenProgress({ ...progress });
        if (i + concurrency < symbols.length && !abortRef.current) await new Promise((r) => setTimeout(r, 500));
      }

      successfulResults.sort((a, b) => (b.topPuts?.[0]?.score ?? 0) - (a.topPuts?.[0]?.score ?? 0));

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const bestPerStock = new Map<string, any>();
      for (const stock of successfulResults) {
        for (const put of stock.topPuts ?? []) {
          const enriched = {
            ...put,
            stabilityScore: stock.stability?.score ?? 0,
            companyName: stock.quote?.name ?? stock.symbol,
            _checklistInput: {
              symbol: stock.symbol, price: stock.quote?.price ?? 0, ivRank: stock.ivRank ?? 50,
              beta: stock.quote?.beta ?? 1, marketCap: stock.quote?.marketCap ?? 0,
              dividendYield: stock.quote?.dividendYield ?? 0, stabilityScore: stock.stability?.score ?? 50,
              vix: vix ?? 20, context: stock.context ?? null, trailingPE: stock.quote?.trailingPE,
              fiftyTwoWeekLow: stock.quote?.fiftyTwoWeekLow, fiftyTwoWeekHigh: stock.quote?.fiftyTwoWeekHigh,
              volume: stock.quote?.volume, avgVolume: stock.quote?.avgVolume,
            },
          };
          const existing = bestPerStock.get(put.symbol);
          if (!existing || put.score > existing.score) bestPerStock.set(put.symbol, enriched);
        }
      }
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const top10 = Array.from(bestPerStock.values()).sort((a: any, b: any) => b.score - a.score).slice(0, 10);

      setScreenerData({
        marketRegime, timestamp: new Date().toISOString(), top10, results: successfulResults,
        failedSymbols: progress.failedSymbols, noPutsSymbols,
      });

      const totalFailed = progress.failedSymbols.length;
      if (totalFailed > 0 && successfulResults.length > 0) setDataSourceStatus("degraded");
      else if (successfulResults.length === 0 && totalFailed > 0) {
        setDataSourceStatus("down");
        setError("Could not fetch data for any stocks. Yahoo Finance may be down or rate limiting.");
      } else if (successfulResults.length === 0 && noPutsSymbols.length > 0) {
        setDataSourceStatus("degraded");
        setError("Data loaded but no put candidates found. Try again during market hours.");
      } else setDataSourceStatus("connected");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Screening failed");
      setDataSourceStatus("down");
    } finally {
      setScreenLoading(false);
      setScreenProgress(null);
    }
  }, []);

  const marketRegime = analysis?.marketRegime ?? screenerData?.marketRegime ?? null;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const matchesFilters = useCallback((p: any) => {
    const absDelta = Math.abs(p.delta ?? 0);
    const annReturn = p.annualizedReturn ?? 0;
    return p.dte >= dteRange.min && p.dte <= dteRange.max && absDelta >= deltaRange.min && absDelta <= deltaRange.max && annReturn >= annReturnRange.min && annReturn <= annReturnRange.max;
  }, [dteRange, deltaRange, annReturnRange]);

  const filteredAnalysisPuts = useMemo(() => (analysis?.scoredPuts ?? []).filter(matchesFilters), [analysis?.scoredPuts, matchesFilters]);
  const filteredTop10 = useMemo(() => (screenerData?.top10 ?? []).filter(matchesFilters), [screenerData?.top10, matchesFilters]);
  const filteredScreenerResults = useMemo(() => {
    if (!screenerData?.results) return [];
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return screenerData.results.map((stock: any) => ({ ...stock, topPuts: stock.topPuts?.filter(matchesFilters) ?? [] }))
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .filter((stock: any) => stock.topPuts.length > 0);
  }, [screenerData?.results, matchesFilters]);

  const tabBtn = (key: typeof activeTab, label: string, color: string) => (
    <button
      onClick={() => { if (key === "screen" && !screenerData && !screenLoading) runScreener(); else setActiveTab(key); }}
      className={`flex-1 sm:flex-none px-2 sm:px-4 py-2 rounded-lg text-xs sm:text-sm font-medium transition-colors ${activeTab === key ? `${color} text-white` : "bg-gray-800 text-gray-400 hover:text-white"}`}
    >
      {label}
    </button>
  );

  return (
    <div className="max-w-7xl mx-auto px-4 py-6">
      <div className="mb-4 px-3 py-1.5 bg-yellow-900/10 border border-yellow-700/20 rounded text-[11px] text-yellow-600/80 leading-tight">
        Simulation only — no real orders are placed. Stock and options trading carry substantial risk. Consult a financial advisor before investing.
      </div>

      <header className="mb-6">
        <div className="flex items-center gap-3 mb-2">
          <h1 className="text-2xl sm:text-3xl font-bold text-white">PutStrike</h1>
          <span className="text-xs bg-purple-600/20 text-purple-300 px-2 py-0.5 rounded-full border border-purple-500/30">Adaptive Multi-Strategy</span>
        </div>
        <p className="text-gray-400 max-w-2xl text-sm sm:text-base">
          An automated, self-tracking multi-strategy engine (ARMS) plus research-backed cash-secured put analysis — live market data, daily adaptive allocation, simulated trade tracking.
        </p>
      </header>

      {dataSourceStatus && (
        <div className={`mb-4 px-4 py-2 rounded-lg border flex items-center gap-2 text-sm ${dataSourceStatus === "connected" ? "bg-green-900/10 border-green-500/30 text-green-400" : dataSourceStatus === "degraded" ? "bg-yellow-900/10 border-yellow-500/30 text-yellow-400" : "bg-red-900/10 border-red-500/30 text-red-400"}`}>
          <span className={`w-2 h-2 rounded-full ${dataSourceStatus === "connected" ? "bg-green-400" : dataSourceStatus === "degraded" ? "bg-yellow-400 animate-pulse" : "bg-red-400 animate-pulse"}`} />
          {dataSourceStatus === "connected" && <span>Yahoo Finance: Connected — live data as of {new Date().toLocaleTimeString()}</span>}
          {dataSourceStatus === "degraded" && <span>Yahoo Finance: Partial data — some symbols failed to load</span>}
          {dataSourceStatus === "down" && <span>Yahoo Finance: Unavailable — data source is down or rate limiting.</span>}
        </div>
      )}

      <div className="mb-6"><MarketRegime regime={marketRegime} /></div>

      <div className="mb-6 space-y-3">
        <SymbolSearch onSelect={analyzeSymbol} isLoading={loading} />
        <div className="flex gap-1 sm:gap-2">
          {tabBtn("engine", "Strategy Engine", "bg-purple-600")}
          {tabBtn("analyze", "Analyze", "bg-blue-600")}
          <button
            onClick={() => { if (screenLoading || screenerData) setActiveTab("screen"); else runScreener(); }}
            className={`flex-1 sm:flex-none px-2 sm:px-4 py-2 rounded-lg text-xs sm:text-sm font-medium transition-colors ${activeTab === "screen" ? "bg-blue-600 text-white" : "bg-gray-800 text-gray-400 hover:text-white"}`}
          >
            {screenLoading ? "Screening..." : "Screen Puts"}
          </button>
          {tabBtn("trades", "Put Trades", "bg-green-600")}
        </div>
      </div>

      <ErrorToast message={error} details={errorDetails} onDismiss={() => { setError(null); setErrorDetails(null); }} />

      {/* Strategy Engine (ARMS) — the headline automated multi-strategy system */}
      {activeTab === "engine" && <QuantDashboard />}

      {loading && (
        <div className="text-center py-16">
          <div className="w-10 h-10 border-2 border-gray-600 border-t-blue-400 rounded-full animate-spin mx-auto mb-4" />
          <p className="text-gray-400">Fetching live options data and computing scores...</p>
        </div>
      )}

      {activeTab === "analyze" && analysis && !loading && (
        <div className="space-y-6">
          <StockQuoteCard quote={analysis.quote} hv={analysis.historicalVolatility} />
          <PutDecisionAssistant data={{
            symbol: analysis.symbol, price: analysis.quote.price, ivRank: analysis.historicalVolatility.hvRank,
            beta: analysis.quote.beta, marketCap: analysis.quote.marketCap, dividendYield: analysis.quote.dividendYield,
            stabilityScore: analysis.stability?.score ?? 50, vix: analysis.marketRegime?.vix ?? 20,
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            context: (analysis as any).context ?? null, trailingPE: analysis.quote.trailingPE,
            fiftyTwoWeekLow: analysis.quote.fiftyTwoWeekLow, fiftyTwoWeekHigh: analysis.quote.fiftyTwoWeekHigh,
            volume: analysis.quote.volume, avgVolume: analysis.quote.avgVolume,
          }} />

          {analysis.stability && (
            <div className="bg-gray-800/50 border border-gray-700 rounded-lg p-4">
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-sm font-medium text-gray-400">Company Stability Assessment</h3>
                <div className="flex items-center gap-2">
                  <span className={`text-xl font-bold ${analysis.stability.score >= 70 ? "text-green-400" : analysis.stability.score >= 50 ? "text-yellow-400" : "text-red-400"}`}>{analysis.stability.score.toFixed(0)}/100</span>
                  <span className="text-xs text-gray-500">{analysis.stability.score >= 70 ? "Stable — Safe for CSP" : analysis.stability.score >= 50 ? "Moderate" : "Risky"}</span>
                </div>
              </div>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                {analysis.stability.signals.map((signal) => (
                  <div key={signal.name} className="text-sm">
                    <div className="text-gray-500">{signal.name}</div>
                    <div className="flex items-center gap-1.5">
                      <span className="text-white">{signal.value}</span>
                      <span className={`w-2 h-2 rounded-full ${signal.sentiment === "bullish" ? "bg-green-400" : signal.sentiment === "bearish" ? "bg-red-400" : "bg-yellow-400"}`} />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="space-y-2">
            <div className="flex items-center gap-3">
              <DTESelector selected={dteRange} onChange={setDteRange} />
              {analysis.scoredPuts.length > 0 && (
                <span className="text-xs text-gray-500 whitespace-nowrap">
                  {filteredAnalysisPuts.length === analysis.scoredPuts.length ? `${filteredAnalysisPuts.length} puts` : `${filteredAnalysisPuts.length} of ${analysis.scoredPuts.length} puts`}
                </span>
              )}
            </div>
            <DeltaSelector selected={deltaRange} onChange={setDeltaRange} />
            <AnnReturnSelector selected={annReturnRange} onChange={setAnnReturnRange} />
          </div>

          <div className="bg-gray-800/50 border border-gray-700 rounded-lg p-4">
            <PutTable puts={filteredAnalysisPuts} title={`Top Put Selling Opportunities for ${analysis.symbol}`} />
          </div>
        </div>
      )}

      {activeTab === "screen" && (
        <div className="space-y-6">
          {screenerData && !screenLoading && (
            <div className="space-y-2">
              <div className="flex items-center gap-3">
                <DTESelector selected={dteRange} onChange={setDteRange} />
                {screenerData?.top10?.length > 0 && (
                  <span className="text-xs text-gray-500 whitespace-nowrap">
                    {filteredTop10.length === screenerData.top10.length ? `${filteredTop10.length} top puts` : `${filteredTop10.length} of ${screenerData.top10.length} top puts`}
                  </span>
                )}
              </div>
              <DeltaSelector selected={deltaRange} onChange={setDeltaRange} />
              <AnnReturnSelector selected={annReturnRange} onChange={setAnnReturnRange} />
            </div>
          )}

          {filteredTop10.length > 0 && !screenLoading && (
            <Top10Puts puts={filteredTop10} onTradeSimulated={() => setTradeRefreshKey((k) => k + 1)} />
          )}

          {screenerData?.results?.length > 0 && !screenLoading && (
            <div className="space-y-2">
              <h3 className="text-sm font-medium text-gray-400">Decision Checklist (Top {Math.min(5, screenerData.results.length)} Stocks)</h3>
              {screenerData.results.slice(0, 5).map((stock: ScreenerData) => (
                <PutDecisionAssistant key={stock.symbol} data={{
                  symbol: stock.symbol, price: stock.quote?.price ?? 0, ivRank: stock.ivRank ?? 50,
                  beta: stock.quote?.beta ?? 1, marketCap: stock.quote?.marketCap ?? 0, dividendYield: stock.quote?.dividendYield ?? 0,
                  stabilityScore: stock.stability?.score ?? 50, vix: screenerData.marketRegime?.vix ?? 20, context: stock.context ?? null,
                  trailingPE: stock.quote?.trailingPE, fiftyTwoWeekLow: stock.quote?.fiftyTwoWeekLow, fiftyTwoWeekHigh: stock.quote?.fiftyTwoWeekHigh,
                  volume: stock.quote?.volume, avgVolume: stock.quote?.avgVolume,
                }} />
              ))}
            </div>
          )}

          <ScreenerResults
            results={screenLoading ? (screenerData?.results ?? []) : filteredScreenerResults}
            loading={screenLoading} progress={screenProgress} onAnalyze={analyzeSymbol}
            globalVix={screenerData?.marketRegime?.vix ?? 20}
          />
        </div>
      )}

      {activeTab === "trades" && <TradesDashboard refreshKey={tradeRefreshKey} />}

      <footer className="mt-12 pt-6 border-t border-gray-800 text-center text-xs text-gray-600">
        <p>PutStrike is a research/education tool. Simulation only — no real orders. Past performance does not guarantee future results.</p>
      </footer>
    </div>
  );
}
