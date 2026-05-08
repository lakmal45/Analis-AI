import { useState, useEffect } from "react";
import CandleChart from "../components/charts/CandleChart";
import RSIChart from "../components/charts/RSIChart";
import MACDChart from "../components/charts/MACDChart";
import BollingerChart from "../components/charts/BollingerChart";
import StochasticChart from "../components/charts/StochasticChart";
import axios from "axios";
import { useSocket } from "../hooks/useSocket";

const Analysis = () => {
  const [selectedSymbol, setSelectedSymbol] = useState("BTCUSDT");
  const [marketData, setMarketData] = useState(null);
  const [indicators, setIndicators] = useState(null);
  const [loading, setLoading] = useState(true);
  const [indicatorsLoading, setIndicatorsLoading] = useState(false);
  const [aiAnalysis, setAiAnalysis] = useState(null);
  const [aiLoading, setAiLoading] = useState(false);
  const { isConnected, priceUpdates, subscribeToTicker } = useSocket();

  const symbols = ["BTCUSDT", "ETHUSDT", "BNBUSDT", "SOLUSDT"];

  useEffect(() => {
    fetchMarketData();
    fetchIndicators();

    // Subscribe to real-time updates via Socket.IO
    if (isConnected) {
      subscribeToTicker(selectedSymbol);
    }
  }, [selectedSymbol, isConnected, subscribeToTicker]);

  // Update market data when we receive real-time price updates
  useEffect(() => {
    const update = priceUpdates[selectedSymbol];
    if (update) {
      setMarketData((prev) => ({
        ...prev,
        lastPrice: update.price.toString(),
        priceChangePercent: update.priceChangePercent.toString(),
        highPrice: update.high24h.toString(),
        lowPrice: update.low24h.toString(),
        volume: update.volume24h.toString(),
      }));
    }
  }, [priceUpdates, selectedSymbol]);

  const fetchMarketData = async () => {
    try {
      setLoading(true);
      const response = await axios.get(
        `http://localhost:5000/api/market/ticker/${selectedSymbol}`,
      );
      setMarketData(response.data);
      setLoading(false);
    } catch (error) {
      console.error("Error fetching market data:", error);
      setLoading(false);
    }
  };

  const fetchIndicators = async () => {
    try {
      setIndicatorsLoading(true);
      const response = await axios.get(
        `http://localhost:5000/api/indicators/${selectedSymbol}`,
      );
      setIndicators(response.data.indicators);
      setIndicatorsLoading(false);
    } catch (error) {
      console.error("Error fetching indicators:", error);
      setIndicatorsLoading(false);
    }
  };

  const getAIAnalysis = async () => {
    if (!marketData || !indicators) {
      alert("Please wait for market data and indicators to load");
      return;
    }

    try {
      setAiLoading(true);
      setAiAnalysis(null);

      const response = await axios.post(
        "http://localhost:5000/api/ai/analyze",
        {
          symbol: selectedSymbol,
          interval: "1h",
          limit: 100,
        },
      );

      setAiAnalysis(response.data.analysis);
    } catch (error) {
      console.error("Error getting AI analysis:", error);
      alert("Failed to get AI analysis. Please check your OpenRouter API key.");
    } finally {
      setAiLoading(false);
    }
  };

  const getIndicatorColor = (value, type) => {
    if (value === null || value === undefined) return "text-gray-400";

    if (type === "rsi") {
      if (value > 70) return "text-red-400"; // Overbought
      if (value < 30) return "text-green-400"; // Oversold
      return "text-yellow-400"; // Neutral
    }

    if (type === "macd") {
      return value >= 0 ? "text-green-400" : "text-red-400";
    }

    return "text-blue-400";
  };

  const formatIndicatorValue = (value, type) => {
    if (value === null || value === undefined) return "--";

    if (type === "rsi") {
      return value.toFixed(2);
    }

    return value.toFixed(2);
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div className="flex items-center space-x-3">
          <h2 className="text-2xl font-bold">Market Analysis</h2>
          <div
            className={`w-2 h-2 rounded-full ${isConnected ? "bg-green-400" : "bg-red-400"}`}
          ></div>
          <span className="text-sm text-gray-400">
            {isConnected ? "Live" : "Disconnected"}
          </span>
        </div>
        <div className="flex space-x-2">
          {symbols.map((sym) => (
            <button
              key={sym}
              onClick={() => setSelectedSymbol(sym)}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                selectedSymbol === sym
                  ? "bg-blue-600 text-white"
                  : "bg-gray-700 text-gray-300 hover:bg-gray-600"
              }`}
            >
              {sym.replace("USDT", "")}/USDT
            </button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Chart - Takes 2 columns */}
        <div className="lg:col-span-2 space-y-6">
          <CandleChart symbol={selectedSymbol} interval="1h" height={500} />
          <RSIChart symbol={selectedSymbol} interval="1h" height={200} />
          <MACDChart symbol={selectedSymbol} interval="1h" height={300} />
          <BollingerChart symbol={selectedSymbol} interval="1h" height={300} />
          <StochasticChart symbol={selectedSymbol} interval="1h" height={200} />
        </div>

        {/* Side Panel */}
        <div className="space-y-6">
          {/* Market Info */}
          <div className="bg-gray-800 rounded-xl p-6 shadow-lg border border-gray-700">
            <h3 className="text-lg font-semibold mb-4">Market Data</h3>
            {loading ? (
              <div className="text-gray-400">Loading...</div>
            ) : marketData ? (
              <div className="space-y-3">
                <div className="flex justify-between">
                  <span className="text-gray-400">Price</span>
                  <span className="font-medium">
                    ${parseFloat(marketData.lastPrice).toFixed(2)}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-400">24h Change</span>
                  <span
                    className={`font-medium ${parseFloat(marketData.priceChangePercent) >= 0 ? "text-green-400" : "text-red-400"}`}
                  >
                    {marketData.priceChangePercent}%
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-400">24h High</span>
                  <span className="font-medium">
                    ${parseFloat(marketData.highPrice).toFixed(2)}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-400">24h Low</span>
                  <span className="font-medium">
                    ${parseFloat(marketData.lowPrice).toFixed(2)}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-400">24h Volume</span>
                  <span className="font-medium">
                    ${parseFloat(marketData.volume).toFixed(2)}
                  </span>
                </div>
              </div>
            ) : (
              <div className="text-red-400">Error loading data</div>
            )}
          </div>

          {/* Technical Indicators */}
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
                    {formatIndicatorValue(indicators.rsi14, "rsi")}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-400">MACD</span>
                  <span
                    className={`font-medium ${getIndicatorColor(indicators.macd?.macdLine, "macd")}`}
                  >
                    {formatIndicatorValue(indicators.macd?.macdLine, "macd")}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-400">Signal</span>
                  <span className="font-medium text-gray-300">
                    {formatIndicatorValue(indicators.macd?.signalLine, "macd")}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-400">EMA 20</span>
                  <span className="font-medium text-blue-400">
                    {indicators.ema20
                      ? `$${indicators.ema20.toFixed(2)}`
                      : "--"}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-400">SMA 20</span>
                  <span className="font-medium text-blue-400">
                    {indicators.sma20
                      ? `$${indicators.sma20.toFixed(2)}`
                      : "--"}
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
                      ? `${indicators.stochastic.percentK.toFixed(2)}`
                      : "--"}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-400">Stoch %D</span>
                  <span className="font-medium text-red-400">
                    {indicators.stochastic?.percentD
                      ? `${indicators.stochastic.percentD.toFixed(2)}`
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

          {/* AI Analysis */}
          <div className="bg-gray-800 rounded-xl p-6 shadow-lg border border-gray-700">
            <h3 className="text-lg font-semibold mb-4">AI Analysis</h3>
            {aiLoading ? (
              <div className="text-gray-400">Getting AI analysis...</div>
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
                Click button to get AI analysis
              </div>
            )}
            <button
              onClick={getAIAnalysis}
              disabled={aiLoading || !marketData || !indicators}
              className="w-full mt-4 bg-purple-600 hover:bg-purple-700 py-2 rounded-lg text-sm disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {aiLoading ? "Analyzing..." : "Get AI Analysis"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Analysis;
