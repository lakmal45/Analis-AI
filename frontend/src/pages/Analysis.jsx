import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import CandleChart from "../components/charts/CandleChart";
import RSIChart from "../components/charts/RSIChart";
import MACDChart from "../components/charts/MACDChart";
import BollingerChart from "../components/charts/BollingerChart";
import StochasticChart from "../components/charts/StochasticChart";
import api from "../api/api";
import { useSocket } from "../hooks/useSocket";

const Analysis = () => {
  const [selectedSymbol, setSelectedSymbol] = useState("");
  const [watchlistAssets, setWatchlistAssets] = useState([]);
  const [watchlistLoading, setWatchlistLoading] = useState(true);
  const [marketData, setMarketData] = useState(null);
  const [indicators, setIndicators] = useState(null);
  const [loading, setLoading] = useState(true);
  const [indicatorsLoading, setIndicatorsLoading] = useState(false);
  const [aiAnalysis, setAiAnalysis] = useState(null);
  const [aiLoading, setAiLoading] = useState(false);
  const { isConnected, priceUpdates, subscribeToTicker } = useSocket();

  const fetchWatchlist = async () => {
    try {
      setWatchlistLoading(true);
      const response = await api.get("/watchlist");
      const assets = response.data.assets || [];
      setWatchlistAssets(assets);

      if (assets.length === 0) {
        setSelectedSymbol("");
        return;
      }

      setSelectedSymbol((currentSymbol) => {
        if (currentSymbol && assets.some((asset) => asset.symbol === currentSymbol)) {
          return currentSymbol;
        }
        return assets[0].symbol;
      });
    } catch (error) {
      console.error("Error fetching watchlist:", error);
      setWatchlistAssets([]);
      setSelectedSymbol("");
    } finally {
      setWatchlistLoading(false);
    }
  };

  const fetchIndicators = async () => {
    if (!selectedSymbol) return;

    try {
      setIndicatorsLoading(true);
      const response = await api.get(`/indicators/${selectedSymbol}`);
      setIndicators(response.data.indicators);
    } catch (error) {
      console.error("Error fetching indicators:", error);
    } finally {
      setIndicatorsLoading(false);
    }
  };

  useEffect(() => {
    fetchWatchlist();
  }, []);

  useEffect(() => {
    if (!selectedSymbol) {
      setMarketData(null);
      setIndicators(null);
      setAiAnalysis(null);
      setLoading(false);
      setIndicatorsLoading(false);
      return;
    }

    let isMounted = true;

    const loadAnalysisData = async () => {
      try {
        setLoading(true);
        const marketResponse = await api.get(`/market/ticker/${selectedSymbol}`);
        if (isMounted) {
          setMarketData(marketResponse.data);
        }
      } catch (error) {
        console.error("Error fetching market data:", error);
      } finally {
        if (isMounted) {
          setLoading(false);
        }
      }

      try {
        setIndicatorsLoading(true);
        const indicatorsResponse = await api.get(
          `/indicators/${selectedSymbol}`,
        );
        if (isMounted) {
          setIndicators(indicatorsResponse.data.indicators);
        }
      } catch (error) {
        console.error("Error fetching indicators:", error);
      } finally {
        if (isMounted) {
          setIndicatorsLoading(false);
        }
      }
    };

    loadAnalysisData();
    setAiAnalysis(null);

    return () => {
      isMounted = false;
    };
  }, [selectedSymbol]);

  useEffect(() => {
    if (isConnected && selectedSymbol) {
      subscribeToTicker(selectedSymbol);
    }
  }, [isConnected, selectedSymbol, subscribeToTicker]);

  const liveMarketData = useMemo(() => {
    const update = priceUpdates[selectedSymbol];
    if (!marketData || !update) {
      return marketData;
    }

    return {
      ...marketData,
      lastPrice: update.price.toString(),
      priceChangePercent: update.priceChangePercent.toString(),
      highPrice: update.high24h.toString(),
      lowPrice: update.low24h.toString(),
      volume: update.volume24h.toString(),
    };
  }, [marketData, priceUpdates, selectedSymbol]);

  const selectedAsset = useMemo(
    () => watchlistAssets.find((asset) => asset.symbol === selectedSymbol) || null,
    [selectedSymbol, watchlistAssets],
  );

  const getAIAnalysis = async () => {
    if (!liveMarketData || !indicators) {
      alert("Please wait for market data and indicators to load");
      return;
    }

    try {
      setAiLoading(true);
      setAiAnalysis(null);

      const response = await api.post("/ai/analyze", {
        symbol: selectedSymbol,
        interval: "1h",
        limit: 100,
      });

      setAiAnalysis(response.data.analysis);
    } catch (error) {
      console.error("Error getting AI analysis:", error);
      alert("Failed to get AI analysis. Please check your AI provider configuration.");
    } finally {
      setAiLoading(false);
    }
  };

  const getIndicatorColor = (value, type) => {
    if (value === null || value === undefined) return "text-gray-400";

    if (type === "rsi") {
      if (value > 70) return "text-red-400";
      if (value < 30) return "text-green-400";
      return "text-yellow-400";
    }

    if (type === "macd") {
      return value >= 0 ? "text-green-400" : "text-red-400";
    }

    return "text-blue-400";
  };

  const formatIndicatorValue = (value) => {
    if (value === null || value === undefined) return "--";
    return value.toFixed(2);
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div className="flex items-center space-x-3">
          <h2 className="text-2xl font-bold">Asset Analysis</h2>
          <div
            className={`w-2 h-2 rounded-full ${isConnected ? "bg-green-400" : "bg-red-400"}`}
          ></div>
          <span className="text-sm text-gray-400">
            {isConnected ? "Live" : "Disconnected"}
          </span>
        </div>
        <div className="flex items-center gap-3">
          <div className="min-w-[240px]">
            <select
              value={selectedSymbol}
              onChange={(e) => setSelectedSymbol(e.target.value)}
              disabled={watchlistLoading || watchlistAssets.length === 0}
              className="w-full bg-gray-700 border border-gray-600 rounded-lg px-4 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50"
            >
              {watchlistAssets.length === 0 ? (
                <option value="">
                  {watchlistLoading ? "Loading watchlist..." : "No watchlist coins found"}
                </option>
              ) : (
                watchlistAssets.map((asset) => (
                  <option key={asset.symbol} value={asset.symbol}>
                    {asset.symbol.replace("USDT", "")}/USDT
                  </option>
                ))
              )}
            </select>
          </div>
          <Link
            to="/app/watchlist"
            className="bg-blue-600 hover:bg-blue-700 px-4 py-2 rounded-lg text-sm font-medium whitespace-nowrap transition-colors"
          >
            + Add New Coin
          </Link>
          {selectedSymbol && (
            <Link
              to={`/app/signals?symbol=${encodeURIComponent(selectedSymbol)}`}
              className="bg-purple-600 hover:bg-purple-700 px-4 py-2 rounded-lg text-sm font-medium whitespace-nowrap transition-colors"
            >
              View Signals
            </Link>
          )}
        </div>
      </div>

      {!watchlistLoading && watchlistAssets.length === 0 && (
        <div className="bg-gray-800 rounded-xl p-6 shadow-lg border border-gray-700">
          <p className="text-gray-300">
            Your research page uses the coins saved in your watchlist. Add a coin to
            start exploring live charts, indicators, and AI market insight here.
          </p>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-6">
          {selectedSymbol ? (
            <>
              <CandleChart symbol={selectedSymbol} interval="1h" height={500} />
              <RSIChart symbol={selectedSymbol} interval="1h" height={200} />
              <MACDChart symbol={selectedSymbol} interval="1h" height={300} />
              <BollingerChart symbol={selectedSymbol} interval="1h" height={300} />
              <StochasticChart symbol={selectedSymbol} interval="1h" height={200} />
            </>
          ) : (
            <div className="bg-gray-800 rounded-xl p-8 text-center text-gray-400 border border-gray-700">
              Select a watchlist coin to load market research charts.
            </div>
          )}
        </div>

        <div className="space-y-6">
          <div className="bg-gray-800 rounded-xl p-6 shadow-lg border border-gray-700">
            <h3 className="text-lg font-semibold mb-4">Market Data</h3>
            {selectedAsset && (
              <p className="text-sm text-gray-400 mb-4">
                Showing analysis for {selectedAsset.symbol.replace("USDT", "")}/USDT
              </p>
            )}
            {loading ? (
              <div className="text-gray-400">Loading...</div>
            ) : liveMarketData ? (
              <div className="space-y-3">
                <div className="flex justify-between">
                  <span className="text-gray-400">Price</span>
                  <span className="font-medium">
                    ${parseFloat(liveMarketData.lastPrice).toFixed(2)}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-400">24h Change</span>
                  <span
                    className={`font-medium ${parseFloat(liveMarketData.priceChangePercent) >= 0 ? "text-green-400" : "text-red-400"}`}
                  >
                    {liveMarketData.priceChangePercent}%
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-400">24h High</span>
                  <span className="font-medium">
                    ${parseFloat(liveMarketData.highPrice).toFixed(2)}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-400">24h Low</span>
                  <span className="font-medium">
                    ${parseFloat(liveMarketData.lowPrice).toFixed(2)}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-400">24h Volume</span>
                  <span className="font-medium">
                    ${parseFloat(liveMarketData.volume).toFixed(2)}
                  </span>
                </div>
              </div>
            ) : (
              <div className="text-red-400">Error loading data</div>
            )}
          </div>

          <div className="bg-gray-800 rounded-xl p-6 shadow-lg border border-gray-700">
            <h3 className="text-lg font-semibold mb-4">Technical Indicators</h3>
            {indicatorsLoading ? (
              <div className="text-gray-400">Calculating...</div>
            ) : indicators ? (
              <div className="space-y-3">
                <div className="flex justify-between">
                  <span className="text-gray-400">RSI (14)</span>
                  <span
                    className={`font-medium ${getIndicatorColor(indicators.rsi14, "rsi")}`}
                  >
                    {formatIndicatorValue(indicators.rsi14)}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-400">MACD</span>
                  <span
                    className={`font-medium ${getIndicatorColor(indicators.macd?.macdLine, "macd")}`}
                  >
                    {formatIndicatorValue(indicators.macd?.macdLine)}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-400">Signal</span>
                  <span className="font-medium text-gray-300">
                    {formatIndicatorValue(indicators.macd?.signalLine)}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-400">EMA 20</span>
                  <span className="font-medium text-blue-400">
                    {indicators.ema20 ? `$${indicators.ema20.toFixed(2)}` : "--"}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-400">SMA 20</span>
                  <span className="font-medium text-blue-400">
                    {indicators.sma20 ? `$${indicators.sma20.toFixed(2)}` : "--"}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-400">SMA 200</span>
                  <span className="font-medium text-purple-400">
                    {indicators.sma200 ? `$${indicators.sma200.toFixed(2)}` : "--"}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-400">Bollinger Upper</span>
                  <span className="font-medium text-red-400">
                    {indicators.bollinger?.upper
                      ? `$${indicators.bollinger.upper.toFixed(2)}`
                      : "--"}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-400">Bollinger Lower</span>
                  <span className="font-medium text-green-400">
                    {indicators.bollinger?.lower
                      ? `$${indicators.bollinger.lower.toFixed(2)}`
                      : "--"}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-400">Stoch %K</span>
                  <span className="font-medium text-blue-400">
                    {indicators.stochastic?.percentK
                      ? indicators.stochastic.percentK.toFixed(2)
                      : "--"}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-400">Stoch %D</span>
                  <span className="font-medium text-red-400">
                    {indicators.stochastic?.percentD
                      ? indicators.stochastic.percentD.toFixed(2)
                      : "--"}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-400">S/D Bias</span>
                  <span
                    className={`font-medium ${
                      indicators.supplyDemand?.bias === "DEMAND"
                        ? "text-green-400"
                        : indicators.supplyDemand?.bias === "SUPPLY"
                          ? "text-red-400"
                          : "text-gray-300"
                    }`}
                  >
                    {indicators.supplyDemand?.bias || "--"}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-400">Demand POI</span>
                  <span className="font-medium text-cyan-400">
                    {indicators.supplyDemand?.demand?.poi
                      ? `$${indicators.supplyDemand.demand.poi.toFixed(2)}`
                      : "--"}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-400">Supply POI</span>
                  <span className="font-medium text-rose-400">
                    {indicators.supplyDemand?.supply?.poi
                      ? `$${indicators.supplyDemand.supply.poi.toFixed(2)}`
                      : "--"}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-400">FVG Bias</span>
                  <span
                    className={`font-medium ${
                      indicators.fvg?.bias === "BULLISH"
                        ? "text-green-400"
                        : indicators.fvg?.bias === "BEARISH"
                          ? "text-red-400"
                          : "text-gray-300"
                    }`}
                  >
                    {indicators.fvg?.bias || "--"}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-400">Bullish FVG</span>
                  <span className="font-medium text-emerald-400">
                    {indicators.fvg?.bullish?.bottom && indicators.fvg?.bullish?.top
                      ? `$${indicators.fvg.bullish.bottom.toFixed(2)} - $${indicators.fvg.bullish.top.toFixed(2)}`
                      : "--"}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-400">Bearish FVG</span>
                  <span className="font-medium text-orange-400">
                    {indicators.fvg?.bearish?.bottom && indicators.fvg?.bearish?.top
                      ? `$${indicators.fvg.bearish.bottom.toFixed(2)} - $${indicators.fvg.bearish.top.toFixed(2)}`
                      : "--"}
                  </span>
                </div>
              </div>
            ) : (
              <div className="text-gray-400">No data available</div>
            )}
            <button
              onClick={fetchIndicators}
              className="w-full mt-4 bg-blue-600 hover:bg-blue-700 py-2 rounded-lg text-sm"
            >
              Refresh Indicators
            </button>
          </div>

          <div className="bg-gray-800 rounded-xl p-6 shadow-lg border border-gray-700">
            <h3 className="text-lg font-semibold mb-2">AI Market Insight</h3>
            <p className="text-sm text-gray-400 mb-4">
              This insight explains current market conditions for the selected asset.
            </p>
            {aiLoading ? (
              <div className="text-gray-400">Generating market insight...</div>
            ) : aiAnalysis ? (
              <div className="space-y-3">
                <div className="flex justify-between">
                  <span className="text-gray-400">Trend</span>
                  <span
                    className={`font-medium ${
                      aiAnalysis.trend === "Bullish"
                        ? "text-green-400"
                        : aiAnalysis.trend === "Bearish"
                          ? "text-red-400"
                          : "text-yellow-400"
                    }`}
                  >
                    {aiAnalysis.trend}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-400">Confidence</span>
                  <span className="font-medium text-blue-400">
                    {aiAnalysis.confidence}%
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-400">Recommendation</span>
                  <span
                    className={`font-medium ${
                      aiAnalysis.recommendation.includes("Buy")
                        ? "text-green-400"
                        : aiAnalysis.recommendation.includes("Sell")
                          ? "text-red-400"
                          : "text-yellow-400"
                    }`}
                  >
                    {aiAnalysis.recommendation}
                  </span>
                </div>
                {aiAnalysis.support > 0 && (
                  <div className="flex justify-between">
                    <span className="text-gray-400">Support</span>
                    <span className="font-medium text-green-400">
                      ${aiAnalysis.support.toFixed(2)}
                    </span>
                  </div>
                )}
                {aiAnalysis.resistance > 0 && (
                  <div className="flex justify-between">
                    <span className="text-gray-400">Resistance</span>
                    <span className="font-medium text-red-400">
                      ${aiAnalysis.resistance.toFixed(2)}
                    </span>
                  </div>
                )}
                <div className="mt-3 p-3 bg-gray-700 rounded-lg">
                  <p className="text-sm text-gray-300">
                    {aiAnalysis.explanation}
                  </p>
                </div>
              </div>
            ) : (
              <div className="text-gray-400">
                Generate an AI insight to review the current market setup.
              </div>
            )}
            <div className="mt-4 space-y-3">
              <button
                onClick={getAIAnalysis}
                disabled={aiLoading || !liveMarketData || !indicators}
                className="w-full bg-purple-600 hover:bg-purple-700 py-2 rounded-lg text-sm disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {aiLoading ? "Analyzing Market..." : "Generate Insight"}
              </button>
              {selectedSymbol && (
                <Link
                  to={`/app/signals?symbol=${encodeURIComponent(selectedSymbol)}`}
                  className="block w-full text-center bg-gray-700 hover:bg-gray-600 py-2 rounded-lg text-sm transition-colors"
                >
                  Create or Review Signals for This Coin
                </Link>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Analysis;
