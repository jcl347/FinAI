"use client";

interface Quote {
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
}

interface VolatilityInfo {
  currentHV: number;
  hvHigh: number;
  hvLow: number;
  hvRank: number;
}

interface StockQuoteCardProps {
  quote: Quote;
  hv: VolatilityInfo;
}

function formatNumber(n: number): string {
  if (n >= 1e12) return `$${(n / 1e12).toFixed(2)}T`;
  if (n >= 1e9) return `$${(n / 1e9).toFixed(2)}B`;
  if (n >= 1e6) return `$${(n / 1e6).toFixed(2)}M`;
  return n.toLocaleString();
}

function formatVolume(n: number): string {
  if (n >= 1e6) return `${(n / 1e6).toFixed(1)}M`;
  if (n >= 1e3) return `${(n / 1e3).toFixed(0)}K`;
  return n.toString();
}

export default function StockQuoteCard({ quote, hv }: StockQuoteCardProps) {
  const isUp = quote.change >= 0;

  return (
    <div className="bg-gray-800/50 rounded-lg border border-gray-700 p-4">
      <div className="flex items-start justify-between mb-4">
        <div>
          <h2 className="text-xl sm:text-2xl font-bold text-white">{quote.symbol}</h2>
          <p className="text-sm text-gray-400">{quote.name}</p>
        </div>
        <div className="text-right">
          <div className="text-2xl sm:text-3xl font-bold text-white">
            ${quote.price.toFixed(2)}
          </div>
          <div
            className={`text-sm font-medium ${
              isUp ? "text-green-400" : "text-red-400"
            }`}
          >
            {isUp ? "+" : ""}
            {quote.change.toFixed(2)} ({isUp ? "+" : ""}
            {quote.changePercent.toFixed(2)}%)
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3 text-sm">
        <div>
          <span className="text-gray-500">Market Cap</span>
          <p className="text-white font-medium">{formatNumber(quote.marketCap)}</p>
        </div>
        <div>
          <span className="text-gray-500">Volume</span>
          <p className="text-white font-medium">
            {formatVolume(quote.volume)}
            <span className="text-gray-500 text-xs ml-1">
              (avg {formatVolume(quote.avgVolume)})
            </span>
          </p>
        </div>
        <div>
          <span className="text-gray-500">52wk Range</span>
          <p className="text-white font-medium">
            ${quote.fiftyTwoWeekLow.toFixed(2)} - ${quote.fiftyTwoWeekHigh.toFixed(2)}
          </p>
        </div>
        <div>
          <span className="text-gray-500">Div Yield</span>
          <p className="text-white font-medium">
            {quote.dividendYield > 0 ? `${quote.dividendYield.toFixed(2)}%` : "N/A"}
          </p>
        </div>
        <div>
          <span className="text-gray-500">Beta</span>
          <p className={`font-medium ${
            quote.beta <= 1.0 ? "text-green-400" : quote.beta <= 1.3 ? "text-yellow-400" : "text-red-400"
          }`}>
            {quote.beta.toFixed(2)}
            <span className="text-gray-500 text-xs ml-1">
              {quote.beta <= 0.8 ? "(Defensive)" : quote.beta <= 1.0 ? "(Stable)" : quote.beta <= 1.3 ? "(Moderate)" : "(Volatile)"}
            </span>
          </p>
        </div>
        <div>
          <span className="text-gray-500">P/E Ratio</span>
          <p className="text-white font-medium">
            {quote.trailingPE > 0 ? quote.trailingPE.toFixed(1) : "N/A"}
          </p>
        </div>
      </div>

      {/* Volatility Section */}
      <div className="mt-4 pt-4 border-t border-gray-700">
        <h3 className="text-sm font-medium text-gray-400 mb-2">
          Volatility Analysis
        </h3>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
          <div>
            <span className="text-gray-500">Current HV (20d)</span>
            <p className="text-white font-medium">{hv.currentHV.toFixed(1)}%</p>
          </div>
          <div>
            <span className="text-gray-500">52wk HV Range</span>
            <p className="text-white font-medium">
              {hv.hvLow.toFixed(1)}% - {hv.hvHigh.toFixed(1)}%
            </p>
          </div>
          <div>
            <span className="text-gray-500">HV Rank</span>
            <p
              className={`font-medium ${
                hv.hvRank >= 50
                  ? "text-green-400"
                  : hv.hvRank >= 30
                  ? "text-yellow-400"
                  : "text-red-400"
              }`}
            >
              {hv.hvRank.toFixed(0)}%
              <span className="text-gray-500 text-xs ml-1">
                {hv.hvRank >= 50
                  ? "(Elevated - Good for selling)"
                  : hv.hvRank >= 30
                  ? "(Normal)"
                  : "(Low - Thin premiums)"}
              </span>
            </p>
          </div>
          <div>
            <span className="text-gray-500">Premium Env.</span>
            <p
              className={`font-medium ${
                hv.hvRank >= 50 ? "text-green-400" : "text-gray-400"
              }`}
            >
              {hv.hvRank >= 50 ? "Rich" : hv.hvRank >= 30 ? "Normal" : "Lean"}
            </p>
          </div>
        </div>

        {/* HV Rank visual bar */}
        <div className="mt-3">
          <div className="flex justify-between text-xs text-gray-500 mb-1">
            <span>0%</span>
            <span>HV Rank</span>
            <span>100%</span>
          </div>
          <div className="h-2 bg-gray-700 rounded-full overflow-hidden">
            <div
              className={`h-full rounded-full transition-all ${
                hv.hvRank >= 50
                  ? "bg-green-500"
                  : hv.hvRank >= 30
                  ? "bg-yellow-500"
                  : "bg-red-500"
              }`}
              style={{ width: `${Math.min(100, Math.max(0, hv.hvRank))}%` }}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
