/**
 * Signal Generator Service
 * Runs periodically to generate trading signals for active symbols
 */

import Signal from "../models/Signal.js";
import { DEFAULT_FUTURES_LEVERAGE, saveSignal } from "./signalService.js";
import marketService from "./marketService.js";
import binanceWS from "./binanceWS.js";
import { analyzeMarket } from "./aiService.js";
import { getLatestIndicators } from "./indicatorService.js";
import { getLatestNews } from "./newsService.js";

// Store active symbols being monitored for signals
let monitoredSymbols = new Set(["BTCUSDT", "ETHUSDT", "BNBUSDT"]);

// Interval reference for cleanup
let signalInterval = null;
let isGenerating = false;

/**
 * Start the signal generator
 * @param {number} intervalMinutes - How often to generate signals (default: 1 minute)
 */
export const startSignalGenerator = (intervalMinutes = 1) => {
  if (signalInterval) {
    console.log("Signal generator already running");
    return;
  }

  console.log(`Starting signal generator (every ${intervalMinutes} minute(s))`);

  // Run immediately on start
  generateSignalsForAllSymbols();

  // Then run at intervals
  signalInterval = setInterval(
    () => {
      generateSignalsForAllSymbols();
    },
    intervalMinutes * 60 * 1000,
  );

  // Also listen for new symbols from WebSocket
  setupWebSocketListeners();
};

/**
 * Stop the signal generator
 */
export const stopSignalGenerator = () => {
  if (signalInterval) {
    clearInterval(signalInterval);
    signalInterval = null;
    console.log("Signal generator stopped");
  }
};

/**
 * Add a symbol to monitoring
 * @param {string} symbol - Symbol to monitor (e.g., 'BTCUSDT')
 */
export const addMonitoredSymbol = (symbol) => {
  const upperSymbol = symbol.toUpperCase();
  if (!monitoredSymbols.has(upperSymbol)) {
    monitoredSymbols.add(upperSymbol);
    console.log(`Added ${upperSymbol} to signal monitoring`);
  }
};

/**
 * Remove a symbol from monitoring
 * @param {string} symbol - Symbol to remove
 */
export const removeMonitoredSymbol = (symbol) => {
  const upperSymbol = symbol.toUpperCase();
  monitoredSymbols.delete(upperSymbol);
  console.log(`Removed ${upperSymbol} from signal monitoring`);
};

/**
 * Get currently monitored symbols
 * @returns {Array} - List of monitored symbols
 */
export const getMonitoredSymbols = () => {
  return Array.from(monitoredSymbols);
};

/**
 * Generate signals for all monitored symbols
 */
const generateSignalsForAllSymbols = async () => {
  if (isGenerating) {
    console.log("Signal generation already in progress, skipping...");
    return;
  }

  isGenerating = true;
  console.log(`Generating signals for ${monitoredSymbols.size} symbols...`);

  const symbols = Array.from(monitoredSymbols);

  for (const symbol of symbols) {
    try {
      await generateSignalForSymbol(symbol);
      // Small delay between symbols to avoid rate limiting
      await sleep(500);
    } catch (error) {
      console.error(`Error generating signal for ${symbol}:`, error.message);
    }
  }

  isGenerating = false;
  console.log("Signal generation completed");
};

/**
 * Generate signal for a specific symbol
 * @param {string} symbol - Trading pair symbol
 */
const generateSignalForSymbol = async (symbol) => {
  try {
    // Check if we already have an active signal for this symbol
    const existingSignal = await Signal.findOne({
      symbol,
      status: "ACTIVE",
      createdAt: { $gt: new Date(Date.now() - 60 * 60 * 1000) }, // Within last 60 minutes
    });

    if (existingSignal) {
      console.log(`Active signal already exists for ${symbol}, skipping...`);
      return;
    }

    // Fetch data
    const marketData = await marketService.get24hTicker(symbol);
    const klineData = await marketService.getKlines(symbol, "1h", 210);

    if (!klineData || klineData.length < 26) {
      console.log(`Insufficient data for ${symbol}`);
      return;
    }

    const indicators = getLatestIndicators(klineData);
    const newsData = await getLatestNews(symbol);

    // AI Analysis
    const analysis = await analyzeMarket(marketData, indicators, newsData);

    if (!analysis) {
      console.log(`Could not generate AI analysis for ${symbol}`);
      return;
    }

    // Only save if it's a confident BUY or SELL
    if (
      analysis.confidence >= 70 && 
      (analysis.recommendation.includes("Buy") || analysis.recommendation.includes("Sell"))
    ) {
      const type = analysis.recommendation.includes("Buy") ? "BUY" : "SELL";
      const currentPrice = parseFloat(marketData.lastPrice);

      const signalData = {
        symbol,
        marketType: "FUTURES",
        leverage: DEFAULT_FUTURES_LEVERAGE,
        type,
        confidence: analysis.confidence,
        expectedDirection: type === "BUY" ? "UP" : "DOWN",
        indicators: {
          rsi: indicators.rsi14,
          macd: {
            macdLine: indicators.macd?.macdLine,
            signalLine: indicators.macd?.signalLine,
            histogram: indicators.macd?.histogram,
          },
          ema: indicators.ema20,
          sma: indicators.sma20,
        },
        price: {
          entry: currentPrice,
          current: currentPrice,
          target: type === "BUY" ? analysis.resistance : analysis.support,
          stopLoss: type === "BUY" ? analysis.support : analysis.resistance,
          resolution: null,
        },
        reasoning: `AI Analysis: ${analysis.explanation}`,
        timeframe: "1h",
        status: "ACTIVE",
        outcome: "PENDING",
        actualDirection: null,
        resolvedAt: null,
        resolutionSource: null,
        resolutionNotes: null,
        performance: {
          priceChange: null,
          priceChangePct: null,
          marketPriceChangePct: null,
          leveragedReturnPct: null,
        },
      };

      await saveSignal(signalData, null);
      console.log(`✅ System generated ${type} signal for ${symbol}`);
    } else {
      console.log(
        `Signal for ${symbol} is ${analysis.recommendation} with low confidence (${analysis.confidence}%), skipping save`,
      );
    }
  } catch (error) {
    console.error(`Error in generateSignalForSymbol for ${symbol}:`, error);
  }
};

/**
 * Setup WebSocket listeners to add new symbols dynamically
 */
const setupWebSocketListeners = () => {
  // Listen for ticker subscriptions to add symbols to monitoring
  // This integrates with your existing binanceWS service
  const originalSubscribe = binanceWS.subscribeToSymbol;

  if (originalSubscribe && typeof originalSubscribe === "function") {
    // Wrap the original function to also add to monitoring
    binanceWS.subscribeToSymbol = function (symbol, io) {
      addMonitoredSymbol(symbol);
      return originalSubscribe.call(this, symbol, io);
    };
  }
};

/**
 * Utility function to sleep
 * @param {number} ms - Milliseconds to sleep
 * @returns {Promise}
 */
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Get signal statistics
 * @returns {Object} - Statistics about generated signals
 */
export const getSignalStats = async () => {
  try {
    const totalSignals = await Signal.countDocuments();
    const activeSignals = await Signal.countDocuments({ status: "ACTIVE" });
    const completedSignals = await Signal.countDocuments({
      status: "COMPLETED",
    });
    const buySignals = await Signal.countDocuments({ type: "BUY" });
    const sellSignals = await Signal.countDocuments({ type: "SELL" });
    const holdSignals = await Signal.countDocuments({ type: "HOLD" });

    // Average confidence
    const avgConfidenceResult = await Signal.aggregate([
      { $group: { _id: null, avgConfidence: { $avg: "$confidence" } } },
    ]);
    const avgConfidence = avgConfidenceResult[0]?.avgConfidence || 0;

    return {
      total: totalSignals,
      active: activeSignals,
      completed: completedSignals,
      buy: buySignals,
      sell: sellSignals,
      hold: holdSignals,
      avgConfidence: avgConfidence.toFixed(2),
      monitoredSymbols: getMonitoredSymbols(),
    };
  } catch (error) {
    console.error("Error getting signal stats:", error);
    return null;
  }
};

// Handle graceful shutdown
process.on("SIGTERM", () => {
  console.log("SIGTERM received, stopping signal generator...");
  stopSignalGenerator();
});

process.on("SIGINT", () => {
  console.log("SIGINT received, stopping signal generator...");
  stopSignalGenerator();
});

export default {
  startSignalGenerator,
  stopSignalGenerator,
  addMonitoredSymbol,
  removeMonitoredSymbol,
  getMonitoredSymbols,
  getSignalStats,
};
