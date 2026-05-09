/**
 * Signal Generation Service
 * Generates BUY/SELL/HOLD signals based on technical indicators
 */

import Signal from "../models/Signal.js";
import {
  calculateSMA,
  calculateRSI,
  calculateMACD,
  calculateEMA,
} from "./indicatorService.js";

/**
 * Generate trading signal based on technical indicators
 * @param {string} symbol - Trading pair symbol (e.g., 'BTCUSDT')
 * @param {Array} klineData - Candlestick data
 * @param {Object} options - Additional options
 * @returns {Object|null} - Generated signal or null
 */
export const generateSignal = (symbol, klineData, options = {}) => {
  if (!klineData || klineData.length < 26) {
    console.log(`Insufficient data for ${symbol}, need at least 26 candles`);
    return null;
  }

  const currentTime = klineData[klineData.length - 1].openTime;
  const currentPrice = klineData[klineData.length - 1].close;

  // Calculate indicators
  const rsiValues = calculateRSI(klineData, 14);
  const macdResult = calculateMACD(klineData, 12, 26, 9);
  const ema20 = calculateEMA(klineData, 20);
  const sma20 = calculateSMA(klineData, 20);

  // Get latest values
  const latestRSI = rsiValues[rsiValues.length - 1]?.value;
  const latestMACD = macdResult.macdLine[macdResult.macdLine.length - 1];
  const latestSignal = macdResult.signalLine[macdResult.signalLine.length - 1];
  const latestHistogram = macdResult.histogram[macdResult.histogram.length - 1];
  const latestEMA20 = ema20[ema20.length - 1]?.value;
  const latestSMA20 = sma20[sma20.length - 1]?.value;

  // Check for bullish crossover (MACD crosses above signal line)
  const prevMACD = macdResult.macdLine[macdResult.macdLine.length - 2];
  const prevSignal = macdResult.signalLine[macdResult.signalLine.length - 2];
  const bullishCrossover =
    prevMACD &&
    prevSignal &&
    prevMACD.value <= prevSignal.value &&
    latestMACD.value > latestSignal.value;

  const bearishCrossover =
    prevMACD &&
    prevSignal &&
    prevMACD.value >= prevSignal.value &&
    latestMACD.value < latestSignal.value;

  // Signal generation logic
  let signalType = "HOLD";
  let confidence = 50;
  let reasoning = "";

  // BUY Signal Conditions
  if (latestRSI < 30 && bullishCrossover) {
    signalType = "BUY";
    confidence = 85;
    reasoning = `Strong BUY signal: RSI is oversold at ${latestRSI.toFixed(2)} (below 30) and MACD shows bullish crossover. `;
    reasoning += `MACD line (${latestMACD.value.toFixed(4)}) crossed above signal line (${latestSignal.value.toFixed(4)}). `;
    reasoning += `Price at $${currentPrice.toFixed(2)} is below EMA20 ($${latestEMA20?.toFixed(2)}), indicating potential reversal.`;
  }
  // Strong BUY: RSI oversold
  else if (latestRSI < 30) {
    signalType = "BUY";
    confidence = 70;
    reasoning = `BUY signal: RSI is oversold at ${latestRSI.toFixed(2)} (below 30), suggesting potential upward reversal. `;
    reasoning += `However, MACD hasn't confirmed bullish crossover yet.`;
  }
  // BUY: MACD bullish crossover
  else if (bullishCrossover && latestRSI < 50) {
    signalType = "BUY";
    confidence = 75;
    reasoning = `BUY signal: MACD bullish crossover detected with RSI at ${latestRSI.toFixed(2)}. `;
    reasoning += `MACD line (${latestMACD.value.toFixed(4)}) crossed above signal line (${latestSignal.value.toFixed(4)}). `;
    reasoning += `Price showing momentum shift.`;
  }

  // SELL Signal Conditions
  else if (latestRSI > 70 && bearishCrossover) {
    signalType = "SELL";
    confidence = 85;
    reasoning = `Strong SELL signal: RSI is overbought at ${latestRSI.toFixed(2)} (above 70) and MACD shows bearish crossover. `;
    reasoning += `MACD line (${latestMACD.value.toFixed(4)}) crossed below signal line (${latestSignal.value.toFixed(4)}). `;
    reasoning += `Price at $${currentPrice.toFixed(2)} is above EMA20 ($${latestEMA20?.toFixed(2)}), indicating potential reversal.`;
  }
  // Strong SELL: RSI overbought
  else if (latestRSI > 70) {
    signalType = "SELL";
    confidence = 70;
    reasoning = `SELL signal: RSI is overbought at ${latestRSI.toFixed(2)} (above 70), suggesting potential downward reversal. `;
    reasoning += `However, MACD hasn't confirmed bearish crossover yet.`;
  }
  // SELL: MACD bearish crossover
  else if (bearishCrossover && latestRSI > 50) {
    signalType = "SELL";
    confidence = 75;
    reasoning = `SELL signal: MACD bearish crossover detected with RSI at ${latestRSI.toFixed(2)}. `;
    reasoning += `MACD line (${latestMACD.value.toFixed(4)}) crossed below signal line (${latestSignal.value.toFixed(4)}). `;
    reasoning += `Price showing momentum shift.`;
  }

  // HOLD signal
  else {
    signalType = "HOLD";
    confidence = 60;
    reasoning = `HOLD signal: No clear buy or sell conditions detected. `;
    reasoning += `RSI at ${latestRSI.toFixed(2)} is in neutral zone. `;
    reasoning += `MACD histogram at ${latestHistogram.value.toFixed(4)} shows ${latestHistogram.value > 0 ? "positive" : "negative"} momentum. `;
    reasoning += `Wait for clearer signals before entering position.`;
  }

  // Calculate price targets
  const atr = calculateATR(klineData, 14);
  const targetMultiplier =
    signalType === "BUY" ? 2 : signalType === "SELL" ? -2 : 0;
  const stopMultiplier =
    signalType === "BUY" ? -1.5 : signalType === "SELL" ? 1.5 : 0;

  const target =
    signalType !== "HOLD" ? currentPrice + atr * targetMultiplier : null;
  const stopLoss =
    signalType !== "HOLD" ? currentPrice + atr * stopMultiplier : null;

  return {
    symbol,
    type: signalType,
    confidence,
    indicators: {
      rsi: latestRSI,
      macd: {
        macdLine: latestMACD.value,
        signalLine: latestSignal.value,
        histogram: latestHistogram.value,
      },
      ema: latestEMA20,
      sma: latestSMA20,
    },
    price: {
      entry: currentPrice,
      current: currentPrice,
      target,
      stopLoss,
    },
    reasoning,
    timeframe: options.timeframe || "1h",
    status: "ACTIVE",
  };
};

/**
 * Calculate Average True Range (ATR) for stop loss and target calculation
 * @param {Array} data - Candlestick data
 * @param {number} period - ATR period
 * @returns {number} - ATR value
 */
const calculateATR = (data, period = 14) => {
  if (data.length < period + 1) return 0;

  const trueRanges = [];

  for (let i = 1; i < data.length; i++) {
    const high = data[i].high;
    const low = data[i].low;
    const prevClose = data[i - 1].close;

    const tr = Math.max(
      high - low,
      Math.abs(high - prevClose),
      Math.abs(low - prevClose),
    );

    trueRanges.push(tr);
  }

  // Calculate initial ATR as simple average
  let atr =
    trueRanges.slice(0, period).reduce((sum, tr) => sum + tr, 0) / period;

  // Calculate subsequent ATR values using smoothing
  for (let i = period; i < trueRanges.length; i++) {
    atr = (atr * (period - 1) + trueRanges[i]) / period;
  }

  return atr;
};

/**
 * Save signal to database
 * @param {Object} signalData - Signal data
 * @param {string} userId - User ID (optional)
 * @returns {Object} - Saved signal
 */
export const saveSignal = async (signalData, userId = null) => {
  try {
    const signal = new Signal({
      ...signalData,
      userId,
    });

    await signal.save();
    console.log(
      `Signal saved for ${signalData.symbol}: ${signalData.type} (${signalData.confidence}%)`,
    );
    return signal;
  } catch (error) {
    console.error("Error saving signal:", error.message);
    return null;
  }
};

/**
 * Get active signals
 * @param {string} symbol - Filter by symbol (optional)
 * @param {number} limit - Number of signals to return
 * @returns {Array} - Active signals
 */
export const getActiveSignals = async (symbol = null, limit = 50) => {
  try {
    const query = { status: "ACTIVE" };
    if (symbol) query.symbol = symbol.toUpperCase();

    const signals = await Signal.find(query)
      .sort({ createdAt: -1 })
      .limit(limit);

    return signals;
  } catch (error) {
    console.error("Error fetching active signals:", error.message);
    return [];
  }
};

/**
 * Get signal history
 * @param {string} symbol - Filter by symbol (optional)
 * @param {number} limit - Number of signals to return
 * @returns {Array} - Signal history
 */
export const getSignalHistory = async (symbol = null, limit = 100) => {
  try {
    const query = {};
    if (symbol) query.symbol = symbol.toUpperCase();

    const signals = await Signal.find(query)
      .sort({ createdAt: -1 })
      .limit(limit);

    return signals;
  } catch (error) {
    console.error("Error fetching signal history:", error.message);
    return [];
  }
};

/**
 * Update signal status
 * @param {string} signalId - Signal ID
 * @param {string} status - New status (COMPLETED, CANCELLED)
 * @returns {Object|null} - Updated signal
 */
export const updateSignalStatus = async (signalId, status) => {
  try {
    const signal = await Signal.findByIdAndUpdate(
      signalId,
      { status },
      { new: true },
    );

    if (signal) {
      console.log(`Signal ${signalId} status updated to ${status}`);
    }

    return signal;
  } catch (error) {
    console.error("Error updating signal status:", error.message);
    return null;
  }
};

