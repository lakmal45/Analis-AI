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
import { getPrice } from "./marketService.js";

let signalResolutionInterval = null;
let isResolvingSignals = false;
export const DEFAULT_FUTURES_LEVERAGE = 10;

const getExpectedDirection = (signalType) => {
  if (signalType === "BUY") return "UP";
  if (signalType === "SELL") return "DOWN";
  return "NEUTRAL";
};

const getActualDirection = (entryPrice, resolutionPrice) => {
  if (resolutionPrice > entryPrice) return "UP";
  if (resolutionPrice < entryPrice) return "DOWN";
  return "NEUTRAL";
};

const getOutcomeFromDirections = (expectedDirection, actualDirection, status) => {
  if (status === "CANCELLED") {
    return "CANCELLED";
  }

  if (expectedDirection === "NEUTRAL" || actualDirection === "NEUTRAL") {
    return "NEUTRAL";
  }

  return expectedDirection === actualDirection ? "WIN" : "LOSS";
};

const normalizeLeverage = (value, fallback = DEFAULT_FUTURES_LEVERAGE) => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    return fallback;
  }

  return Math.min(Math.max(parsed, 1), 125);
};

export const calculateFuturesPerformance = (
  signalType,
  entryPrice,
  resolutionPrice,
  leverage = DEFAULT_FUTURES_LEVERAGE,
) => {
  const safeLeverage = normalizeLeverage(leverage);
  const marketPriceChange = resolutionPrice - entryPrice;
  const marketPriceChangePct =
    entryPrice > 0 ? (marketPriceChange / entryPrice) * 100 : null;

  let directionalReturnPct = 0;
  if (signalType === "BUY") {
    directionalReturnPct = marketPriceChangePct ?? 0;
  } else if (signalType === "SELL") {
    directionalReturnPct = (marketPriceChangePct ?? 0) * -1;
  }

  const leveragedReturnPct = directionalReturnPct * safeLeverage;

  return {
    leverage: safeLeverage,
    priceChange: marketPriceChange,
    marketPriceChangePct,
    directionalReturnPct,
    leveragedReturnPct,
  };
};

const timeframeToMs = (timeframe) => {
  const timeframeMap = {
    "1m": 60 * 1000,
    "5m": 5 * 60 * 1000,
    "15m": 15 * 60 * 1000,
    "1h": 60 * 60 * 1000,
    "4h": 4 * 60 * 60 * 1000,
    "1d": 24 * 60 * 60 * 1000,
  };

  return timeframeMap[timeframe] || timeframeMap["1h"];
};

const isSignalDueForResolution = (signal, now = Date.now()) => {
  const createdAt = new Date(signal.createdAt).getTime();
  return createdAt + timeframeToMs(signal.timeframe) <= now;
};

const applyResolutionToSignal = async (signal, resolutionData) => {
  const status = resolutionData.status || "COMPLETED";

  if (status === "CANCELLED") {
    signal.status = "CANCELLED";
    signal.outcome = "CANCELLED";
    signal.resolvedAt = resolutionData.resolvedAt
      ? new Date(resolutionData.resolvedAt)
      : new Date();
    signal.resolutionSource = resolutionData.resolutionSource || null;
    signal.resolutionNotes = resolutionData.resolutionNotes || null;

    await signal.save();
    return signal;
  }

  const resolutionPrice = Number(resolutionData.resolutionPrice);
  if (!Number.isFinite(resolutionPrice) || resolutionPrice <= 0) {
    throw new Error("Resolution price must be a positive number");
  }

  const entryPrice = signal.price.entry;
  const actualDirection = getActualDirection(entryPrice, resolutionPrice);
  const performance = calculateFuturesPerformance(
    signal.type,
    entryPrice,
    resolutionPrice,
    signal.leverage,
  );

  signal.status = "COMPLETED";
  signal.price.current = resolutionPrice;
  signal.price.resolution = resolutionPrice;
  signal.actualDirection = actualDirection;
  signal.outcome = getOutcomeFromDirections(
    signal.expectedDirection,
    actualDirection,
    "COMPLETED",
  );
  signal.resolvedAt = resolutionData.resolvedAt
    ? new Date(resolutionData.resolvedAt)
    : new Date();
  signal.resolutionSource = resolutionData.resolutionSource || null;
  signal.resolutionNotes = resolutionData.resolutionNotes || null;
  signal.performance = {
    priceChange: performance.priceChange,
    priceChangePct: performance.leveragedReturnPct,
    marketPriceChangePct: performance.marketPriceChangePct,
    leveragedReturnPct: performance.leveragedReturnPct,
  };

  await signal.save();
  return signal;
};

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
  const leverage = normalizeLeverage(options.leverage);

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
    marketType: "FUTURES",
    leverage,
    type: signalType,
    confidence,
    expectedDirection: getExpectedDirection(signalType),
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
      resolution: null,
    },
    reasoning,
    timeframe: options.timeframe || "1h",
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
      marketType: signalData.marketType || "FUTURES",
      leverage: normalizeLeverage(signalData.leverage),
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
export const getSignalHistory = async (userId, symbol = null, limit = 100) => {
  try {
    const query = { userId };
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
 * Get aggregated performance summary for resolved signals
 * @param {object} filters - Optional filters
 * @returns {object} - Summary metrics
 */
export const getSignalPerformanceSummary = async (filters = {}) => {
  try {
    const match = {
      status: "COMPLETED",
      outcome: { $in: ["WIN", "LOSS", "NEUTRAL"] },
      resolvedAt: { $ne: null },
    };

    if (filters.userId) {
      match.userId = filters.userId;
    }

    if (filters.symbol) {
      match.symbol = filters.symbol.toUpperCase();
    }

    if (filters.timeframe) {
      match.timeframe = filters.timeframe;
    }

    const [summary = null, byOutcome = [], byTimeframe = []] = await Promise.all([
      Signal.aggregate([
        { $match: match },
        {
          $group: {
            _id: null,
            totalResolved: { $sum: 1 },
            wins: {
              $sum: { $cond: [{ $eq: ["$outcome", "WIN"] }, 1, 0] },
            },
            losses: {
              $sum: { $cond: [{ $eq: ["$outcome", "LOSS"] }, 1, 0] },
            },
            neutrals: {
              $sum: { $cond: [{ $eq: ["$outcome", "NEUTRAL"] }, 1, 0] },
            },
            avgConfidence: { $avg: "$confidence" },
            avgReturnPct: { $avg: "$performance.leveragedReturnPct" },
            avgReturnAbs: { $avg: "$performance.priceChange" },
            avgUnderlyingMovePct: { $avg: "$performance.marketPriceChangePct" },
            avgLeverage: { $avg: "$leverage" },
            bestReturnPct: { $max: "$performance.leveragedReturnPct" },
            worstReturnPct: { $min: "$performance.leveragedReturnPct" },
          },
        },
      ]),
      Signal.aggregate([
        { $match: match },
        {
          $group: {
            _id: "$outcome",
            count: { $sum: 1 },
          },
        },
      ]),
      Signal.aggregate([
        { $match: match },
        {
          $group: {
            _id: "$timeframe",
            total: { $sum: 1 },
            wins: {
              $sum: { $cond: [{ $eq: ["$outcome", "WIN"] }, 1, 0] },
            },
            avgReturnPct: { $avg: "$performance.leveragedReturnPct" },
          },
        },
        { $sort: { total: -1, _id: 1 } },
      ]),
    ]);

    const totalResolved = summary?.totalResolved || 0;
    const wins = summary?.wins || 0;
    const losses = summary?.losses || 0;
    const neutrals = summary?.neutrals || 0;

    const toRate = (count) =>
      totalResolved > 0 ? Number(((count / totalResolved) * 100).toFixed(2)) : 0;

    return {
      totalResolved,
      wins,
      losses,
      neutrals,
      winRate: toRate(wins),
      lossRate: toRate(losses),
      neutralRate: toRate(neutrals),
      avgConfidence: summary?.avgConfidence
        ? Number(summary.avgConfidence.toFixed(2))
        : 0,
      avgReturnPct: summary?.avgReturnPct
        ? Number(summary.avgReturnPct.toFixed(2))
        : 0,
      avgReturnAbs: summary?.avgReturnAbs
        ? Number(summary.avgReturnAbs.toFixed(4))
        : 0,
      avgUnderlyingMovePct: summary?.avgUnderlyingMovePct
        ? Number(summary.avgUnderlyingMovePct.toFixed(2))
        : 0,
      avgLeverage: summary?.avgLeverage
        ? Number(summary.avgLeverage.toFixed(2))
        : 0,
      bestReturnPct: summary?.bestReturnPct
        ? Number(summary.bestReturnPct.toFixed(2))
        : 0,
      worstReturnPct: summary?.worstReturnPct
        ? Number(summary.worstReturnPct.toFixed(2))
        : 0,
      byOutcome: byOutcome.map((item) => ({
        outcome: item._id,
        count: item.count,
        rate: toRate(item.count),
      })),
      byTimeframe: byTimeframe.map((item) => ({
        timeframe: item._id,
        total: item.total,
        wins: item.wins,
        winRate:
          item.total > 0 ? Number(((item.wins / item.total) * 100).toFixed(2)) : 0,
        avgReturnPct: item.avgReturnPct
          ? Number(item.avgReturnPct.toFixed(2))
          : 0,
      })),
    };
  } catch (error) {
    console.error("Error getting signal performance summary:", error.message);
    throw error;
  }
};

/**
 * Resolve a signal with the observed market outcome
 * @param {string} signalId - Signal ID
 * @param {object} resolutionData - Resolution details
 * @param {string} userId - User ID
 * @returns {Object|null} - Updated signal
 */
export const resolveSignal = async (signalId, resolutionData, userId) => {
  try {
    const signal = await Signal.findOne({ _id: signalId, userId });

    if (!signal || signal.status === "CANCELLED") {
      return null;
    }

    return await applyResolutionToSignal(signal, resolutionData);
  } catch (error) {
    console.error("Error resolving signal:", error.message);
    throw error;
  }
};

/**
 * Resolve due active signals using current market prices
 * @param {number} batchSize - Max signals to process per run
 * @returns {object} - Resolution summary
 */
export const resolveExpiredSignals = async (batchSize = 100) => {
  if (isResolvingSignals) {
    return { processed: 0, resolved: 0, skipped: 0, reason: "already_running" };
  }

  isResolvingSignals = true;

  try {
    const now = Date.now();
    const activeSignals = await Signal.find({
      status: "ACTIVE",
      outcome: "PENDING",
    })
      .sort({ createdAt: 1 })
      .limit(batchSize);

    const dueSignals = activeSignals.filter((signal) =>
      isSignalDueForResolution(signal, now),
    );

    if (dueSignals.length === 0) {
      return { processed: activeSignals.length, resolved: 0, skipped: 0 };
    }

    const priceCache = new Map();
    let resolved = 0;
    let skipped = 0;

    for (const signal of dueSignals) {
      try {
        const symbol = signal.symbol.toUpperCase();
        let latestPrice = priceCache.get(symbol);

        if (!latestPrice) {
          const priceData = await getPrice(symbol);
          latestPrice = Number(priceData.price);
          priceCache.set(symbol, latestPrice);
        }

        if (!Number.isFinite(latestPrice) || latestPrice <= 0) {
          skipped += 1;
          continue;
        }

        await applyResolutionToSignal(signal, {
          resolutionPrice: latestPrice,
          resolvedAt: new Date(),
          resolutionSource: "binance_ticker_price",
          resolutionNotes: `Auto-resolved after ${signal.timeframe} horizon elapsed.`,
          status: "COMPLETED",
        });

        resolved += 1;
      } catch (error) {
        skipped += 1;
        console.error(
          `Error auto-resolving signal ${signal._id} (${signal.symbol}):`,
          error.message,
        );
      }
    }

    return {
      processed: activeSignals.length,
      resolved,
      skipped,
    };
  } catch (error) {
    console.error("Error resolving expired signals:", error.message);
    throw error;
  } finally {
    isResolvingSignals = false;
  }
};

/**
 * Start background job that auto-resolves expired signals
 * @param {number} intervalMinutes - Polling interval in minutes
 */
export const startSignalResolutionJob = (intervalMinutes = 5) => {
  if (signalResolutionInterval) {
    console.log("Signal resolution job already running");
    return;
  }

  console.log(
    `Starting signal resolution job (every ${intervalMinutes} minute(s))`,
  );

  resolveExpiredSignals().catch((error) => {
    console.error("Initial signal resolution run failed:", error.message);
  });

  signalResolutionInterval = setInterval(() => {
    resolveExpiredSignals().catch((error) => {
      console.error("Scheduled signal resolution run failed:", error.message);
    });
  }, intervalMinutes * 60 * 1000);
};

/**
 * Stop background signal auto-resolution job
 */
export const stopSignalResolutionJob = () => {
  if (signalResolutionInterval) {
    clearInterval(signalResolutionInterval);
    signalResolutionInterval = null;
    console.log("Signal resolution job stopped");
  }
};

/**
 * Update signal status
 * @param {string} signalId - Signal ID
 * @param {string} status - New status (COMPLETED, CANCELLED)
 * @returns {Object|null} - Updated signal
 */
export const updateSignalStatus = async (signalId, status, userId) => {
  try {
    const updates = { status };

    if (status === "CANCELLED") {
      updates.outcome = "CANCELLED";
      updates.resolvedAt = new Date();
    }

    const signal = await Signal.findOneAndUpdate(
      { _id: signalId, userId },
      updates,
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

