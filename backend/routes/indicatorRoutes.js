import express from "express";
const router = express.Router();
import {
  getPrice,
  get24hTicker,
  getKlines,
  getMultiplePrices,
  getMarketOverview,
} from "../services/marketService.js";
import {
  calculateSMA,
  calculateEMA,
  calculateRSI,
  calculateMACD,
  calculateBollingerBands,
  calculateStochastic,
  calculateAllIndicators,
  getLatestIndicators,
} from "../services/indicatorService.js";

// @route   GET /api/indicators/:symbol
// @desc    Get all indicators for a symbol
// @access  Public
router.get("/:symbol", async (req, res) => {
  try {
    const { symbol } = req.params;
    const { interval = "1h", limit = 210 } = req.query;

    // Fetch candlestick data
    const klineData = await getKlines(
      symbol,
      interval,
      parseInt(limit),
    );

    // Calculate indicators
    const indicators = getLatestIndicators(klineData);

    res.json({
      symbol: symbol.toUpperCase(),
      interval,
      timestamp: Date.now(),
      indicators,
    });
  } catch (error) {
    console.error("Error calculating indicators:", error);
    res.status(500).json({ message: error.message });
  }
});

// @route   GET /api/indicators/:symbol/all
// @desc    Get all indicator data points (for charting)
// @access  Public
router.get("/:symbol/all", async (req, res) => {
  try {
    const { symbol } = req.params;
    const { interval = "1h", limit = 210 } = req.query;

    // Fetch candlestick data
    const klineData = await getKlines(
      symbol,
      interval,
      parseInt(limit),
    );

    // Calculate all indicators
    const allIndicators = calculateAllIndicators(klineData);

    res.json({
      symbol: symbol.toUpperCase(),
      interval,
      timestamp: Date.now(),
      data: allIndicators,
    });
  } catch (error) {
    console.error("Error calculating all indicators:", error);
    res.status(500).json({ message: error.message });
  }
});

// @route   GET /api/indicators/:symbol/rsi
// @desc    Get RSI indicator
// @access  Public
router.get("/:symbol/rsi", async (req, res) => {
  try {
    const { symbol } = req.params;
    const { interval = "1h", limit = 210, period = 14 } = req.query;

    const klineData = await getKlines(
      symbol,
      interval,
      parseInt(limit),
    );
    const rsi = calculateRSI(klineData, parseInt(period));

    res.json({
      symbol: symbol.toUpperCase(),
      indicator: "RSI",
      period: parseInt(period),
      data: rsi,
    });
  } catch (error) {
    console.error("Error calculating RSI:", error);
    res.status(500).json({ message: error.message });
  }
});

// @route   GET /api/indicators/:symbol/macd
// @desc    Get MACD indicator
// @access  Public
router.get("/:symbol/macd", async (req, res) => {
  try {
    const { symbol } = req.params;
    const {
      interval = "1h",
      limit = 210,
      fast = 12,
      slow = 26,
      signal = 9,
    } = req.query;

    const klineData = await getKlines(
      symbol,
      interval,
      parseInt(limit),
    );
    const macd = calculateMACD(
      klineData,
      parseInt(fast),
      parseInt(slow),
      parseInt(signal),
    );

    res.json({
      symbol: symbol.toUpperCase(),
      indicator: "MACD",
      params: { fast, slow, signal },
      data: macd,
    });
  } catch (error) {
    console.error("Error calculating MACD:", error);
    res.status(500).json({ message: error.message });
  }
});

// @route   GET /api/indicators/:symbol/moving-averages
// @desc    Get SMA and EMA
// @access  Public
router.get("/:symbol/moving-averages", async (req, res) => {
  try {
    const { symbol } = req.params;
    const { interval = "1h", limit = 210, period = 20 } = req.query;

    const klineData = await getKlines(
      symbol,
      interval,
      parseInt(limit),
    );
    const sma = calculateSMA(klineData, parseInt(period));
    const ema = calculateEMA(klineData, parseInt(period));

    res.json({
      symbol: symbol.toUpperCase(),
      indicator: "Moving Averages",
      period: parseInt(period),
      data: { sma, ema },
    });
  } catch (error) {
    console.error("Error calculating moving averages:", error);
    res.status(500).json({ message: error.message });
  }
});

// @route   GET /api/indicators/:symbol/bollinger
// @desc    Get Bollinger Bands indicator
// @access  Public
router.get("/:symbol/bollinger", async (req, res) => {
  try {
    const { symbol } = req.params;
    const {
      interval = "1h",
      limit = 210,
      period = 20,
      multiplier = 2,
    } = req.query;

    const klineData = await getKlines(
      symbol,
      interval,
      parseInt(limit),
    );
    const bollinger = calculateBollingerBands(
      klineData,
      parseInt(period),
      parseFloat(multiplier),
    );

    res.json({
      symbol: symbol.toUpperCase(),
      indicator: "Bollinger Bands",
      params: { period: parseInt(period), multiplier: parseFloat(multiplier) },
      data: bollinger,
    });
  } catch (error) {
    console.error("Error calculating Bollinger Bands:", error);
    res.status(500).json({ message: error.message });
  }
});

// @route   GET /api/indicators/:symbol/stochastic
// @desc    Get Stochastic Oscillator
// @access  Public
router.get("/:symbol/stochastic", async (req, res) => {
  try {
    const { symbol } = req.params;
    const {
      interval = "1h",
      limit = 210,
      period = 14,
      smoothK = 3,
      smoothD = 3,
    } = req.query;

    const klineData = await getKlines(
      symbol,
      interval,
      parseInt(limit),
    );
    const stochastic = calculateStochastic(
      klineData,
      parseInt(period),
      parseInt(smoothK),
      parseInt(smoothD),
    );

    res.json({
      symbol: symbol.toUpperCase(),
      indicator: "Stochastic Oscillator",
      params: {
        period: parseInt(period),
        smoothK: parseInt(smoothK),
        smoothD: parseInt(smoothD),
      },
      data: stochastic,
    });
  } catch (error) {
    console.error("Error calculating Stochastic:", error);
    res.status(500).json({ message: error.message });
  }
});

export default router;
