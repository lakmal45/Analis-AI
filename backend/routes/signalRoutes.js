import express from "express";
import BacktestRun from "../models/BacktestRun.js";
import Signal from "../models/Signal.js";
import { protect } from "../middleware/authMiddleware.js";
import {
  DEFAULT_FUTURES_LEVERAGE,
  generateSignalWithMl,
  saveSignal,
  getActiveSignals,
  getSignalHistory,
  getMlMonitoringSummary,
  getSignalPerformanceSummary,
  resolveSignal,
  updateSignalStatus,
} from "../services/signalService.js";
import {
  runSignalBacktest,
  saveSignalBacktest,
} from "../services/backtestService.js";
import { getKlines, resolveToMarketSymbol } from "../services/marketService.js";

const router = express.Router();

const parseLeverage = (value, fallback = DEFAULT_FUTURES_LEVERAGE) => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    return fallback;
  }

  return Math.min(Math.max(parsed, 1), 125);
};

const TRUSTED_EXIT_REASONS = new Set([
  "take_profit_gap",
  "take_profit_intrabar",
  "stop_loss_gap",
  "stop_loss_intrabar",
  "time_expiry",
]);

const getClosedKlines = async (symbol, timeframe, limit = 210) => {
  const requestLimit = limit + 1;
  const klineData = await getKlines(symbol, timeframe, requestLimit);
  const now = Date.now();

  return (klineData || [])
    .filter((candle) => Number(candle.closeTime) <= now)
    .slice(-limit);
};

/**
 * @route   GET /api/signals
 * @desc    Get signals with optional status and symbol filtering
 * @access  Public (or Private with protect)
 */
router.get("/", protect, async (req, res) => {
  try {
    const { symbol, status, outcome, limit = 50 } = req.query;

    // Build query based on filters
    const query = {};
    if (symbol) query.symbol = symbol.toUpperCase();
    if (status && status !== "ALL") {
      query.status = status.toUpperCase();
    } else if (!status) {
      // Default to active signals when no status filter specified
      query.status = "ACTIVE";
    }
    if (outcome && outcome !== "ALL") {
      query.outcome = outcome.toUpperCase();
    }
    
    // Ensure signals are user-specific
    query.userId = req.user.id;

    const signals = await Signal.find(query)
      .sort({ createdAt: -1 })
      .limit(parseInt(limit));

    res.json({
      success: true,
      count: signals.length,
      data: signals,
    });
  } catch (error) {
    console.error("Error fetching signals:", error);
    res.status(500).json({
      success: false,
      message: "Server error",
      error: error.message,
    });
  }
});

/**
 * @route   GET /api/signals/history
 * @desc    Get signal history
 * @access  Private
 */
router.get("/history", protect, async (req, res) => {
  try {
    const { symbol, limit = 210 } = req.query;
    const signals = await getSignalHistory(req.user.id, symbol, parseInt(limit));

    res.json({
      success: true,
      count: signals.length,
      data: signals,
    });
  } catch (error) {
    console.error("Error fetching signal history:", error);
    res.status(500).json({
      success: false,
      message: "Server error",
      error: error.message,
    });
  }
});

/**
 * @route   GET /api/signals/analyze/:symbol
 * @desc    Analyze a symbol and return signal without saving
 * @access  Private
 * NOTE: This route MUST be defined BEFORE /:id to prevent route collision
 */
router.get("/analyze/:symbol", protect, async (req, res) => {
  try {
    const { symbol } = req.params;
    const { timeframe = "1h", leverage } = req.query;
    const marketSymbol = await resolveToMarketSymbol(symbol);

    if (!marketSymbol) {
      return res.status(400).json({
        success: false,
        message: `Unsupported or unknown futures symbol: ${symbol}`,
      });
    }

    // Fetch only closed candles so live indicators do not repaint.
    const klineData = await getClosedKlines(marketSymbol, timeframe, 210);

    if (!klineData || klineData.length < 26) {
      return res.status(400).json({
        success: false,
        message: "Insufficient data to analyze",
      });
    }

    // Generate signal (without saving)
    const signalData = await generateSignalWithMl(marketSymbol, klineData, {
      timeframe,
      leverage: parseLeverage(leverage),
    });

    if (!signalData) {
      return res.status(400).json({
        success: false,
        message: "Could not generate analysis",
      });
    }

    res.json({
      success: true,
      data: signalData,
    });
  } catch (error) {
    console.error("Error analyzing symbol:", error);
    res.status(500).json({
      success: false,
      message: "Server error",
      error: error.message,
    });
  }
});

/**
 * @route   POST /api/signals/generate
 * @desc    Generate a new signal for a symbol
 * @access  Private
 */
router.post("/generate", protect, async (req, res) => {
  try {
    const { symbol, timeframe = "1h", leverage } = req.body;

    if (!symbol) {
      return res.status(400).json({
        success: false,
        message: "Symbol is required",
      });
    }

    const marketSymbol = await resolveToMarketSymbol(symbol);
    if (!marketSymbol) {
      return res.status(400).json({
        success: false,
        message: `Unsupported or unknown futures symbol: ${symbol}`,
      });
    }

    // Fetch only closed candles so live indicators do not repaint.
    const klineData = await getClosedKlines(marketSymbol, timeframe, 210);

    if (!klineData || klineData.length < 26) {
      return res.status(400).json({
        success: false,
        message: "Insufficient data to generate signal",
      });
    }

    // Generate signal
    const signalData = await generateSignalWithMl(marketSymbol, klineData, {
      timeframe,
      leverage: parseLeverage(leverage),
    });

    if (!signalData) {
      return res.status(400).json({
        success: false,
        message: "Could not generate signal",
      });
    }

    // Save signal to database, or return the existing active one for this setup.
    const savedSignal = await saveSignal(signalData, req.user.id);

    if (!savedSignal) {
      return res.status(500).json({
        success: false,
        message: "Failed to save signal",
      });
    }

    res.status(savedSignal.wasDuplicate ? 200 : 201).json({
      success: true,
      duplicateActiveSignal: Boolean(savedSignal.wasDuplicate),
      data: savedSignal,
    });
  } catch (error) {
    console.error("Error generating signal:", error);
    res.status(500).json({
      success: false,
      message: "Server error",
      error: error.message,
    });
  }
});

/**
 * @route   PUT /api/signals/:id/status
 * @desc    Update signal status (COMPLETED, CANCELLED)
 * @access  Private
 */
router.put("/:id/status", protect, async (req, res) => {
  try {
    const { status } = req.body;

    if (!["COMPLETED", "CANCELLED"].includes(status)) {
      return res.status(400).json({
        success: false,
        message: "Invalid status. Use COMPLETED or CANCELLED",
      });
    }

    const signal = await updateSignalStatus(req.params.id, status, req.user.id);

    if (!signal) {
      return res.status(404).json({
        success: false,
        message: "Signal not found or not authorized",
      });
    }

    res.json({
      success: true,
      data: signal,
    });
  } catch (error) {
    console.error("Error updating signal status:", error);
    res.status(500).json({
      success: false,
      message: "Server error",
      error: error.message,
    });
  }
});

/**
 * @route   PUT /api/signals/:id/resolve
 * @desc    Resolve a signal with the later observed price
 * @access  Private
 */
router.put("/:id/resolve", protect, async (req, res) => {
  try {
    const {
      resolutionPrice,
      resolvedAt,
      resolutionSource,
      resolutionNotes,
      exitReason,
      feesPerTradePct,
      status = "COMPLETED",
    } = req.body;

    if (!["COMPLETED", "CANCELLED"].includes(status)) {
      return res.status(400).json({
        success: false,
        message: "Invalid status. Use COMPLETED or CANCELLED",
      });
    }

    if (status === "COMPLETED" && resolutionPrice === undefined) {
      return res.status(400).json({
        success: false,
        message: "Resolution price is required when completing a signal",
      });
    }

    if (status === "COMPLETED" && !TRUSTED_EXIT_REASONS.has(exitReason)) {
      return res.status(400).json({
        success: false,
        message:
          "A trusted exitReason is required: take_profit_gap, take_profit_intrabar, stop_loss_gap, stop_loss_intrabar, or time_expiry",
      });
    }

    const signal = await resolveSignal(
      req.params.id,
      {
        resolutionPrice,
        resolvedAt,
        exitReason,
        feesPerTradePct,
        resolutionSource: resolutionSource || exitReason,
        resolutionNotes,
        status,
      },
      req.user.id,
    );

    if (!signal) {
      return res.status(404).json({
        success: false,
        message: "Signal not found, not authorized, or cannot be resolved",
      });
    }

    res.json({
      success: true,
      data: signal,
    });
  } catch (error) {
    console.error("Error resolving signal:", error);
    res.status(500).json({
      success: false,
      message: "Server error",
      error: error.message,
    });
  }
});

/**
 * @route   POST /api/signals/backtest
 * @desc    Run a historical backtest for signal generation logic
 * @access  Private
 */
router.post("/backtest", protect, async (req, res) => {
  try {
    const result = await runSignalBacktest(req.body || {});
    const savedBacktest = await saveSignalBacktest(result, req.user.id);
    const { trades, ...responseResult } = result;

    res.json({
      success: true,
      data: {
        ...responseResult,
        backtestRunId: savedBacktest._id,
        savedAt: savedBacktest.createdAt,
        tradeCount: trades.length,
      },
    });
  } catch (error) {
    console.error("Error running signal backtest:", error);
    res.status(400).json({
      success: false,
      message: error.message || "Failed to run backtest",
    });
  }
});

/**
 * @route   GET /api/signals/backtest/history
 * @desc    Get saved backtest runs for the authenticated user
 * @access  Private
 */
router.get("/backtest/history", protect, async (req, res) => {
  try {
    const { symbol, limit = 10 } = req.query;
    const parsedLimit = Math.min(Math.max(parseInt(limit, 10) || 10, 1), 50);
    const query = { userId: req.user.id };

    if (symbol) {
      query.symbol = symbol.toString().trim().toUpperCase();
    }

    const backtests = await BacktestRun.find(query)
      .sort({ createdAt: -1 })
      .limit(parsedLimit)
      .lean();

    const historyItems = backtests.map(({ trades, ...backtest }) => ({
      ...backtest,
      tradeCount: Array.isArray(trades)
        ? trades.length
        : Array.isArray(backtest.recentTrades)
          ? backtest.recentTrades.length
          : 0,
    }));

    res.json({
      success: true,
      count: historyItems.length,
      data: historyItems,
    });
  } catch (error) {
    console.error("Error fetching backtest history:", error);
    res.status(500).json({
      success: false,
      message: "Server error",
      error: error.message,
    });
  }
});

/**
 * @route   DELETE /api/signals/backtest/history/:id
 * @desc    Delete a saved backtest run for the authenticated user
 * @access  Private
 */
router.delete("/backtest/history/:id", protect, async (req, res) => {
  try {
    const deletedBacktest = await BacktestRun.findOneAndDelete({
      _id: req.params.id,
      userId: req.user.id,
    });

    if (!deletedBacktest) {
      return res.status(404).json({
        success: false,
        message: "Backtest run not found",
      });
    }

    res.json({
      success: true,
      message: "Backtest run deleted successfully",
      data: {
        backtestRunId: deletedBacktest._id,
      },
    });
  } catch (error) {
    console.error("Error deleting backtest run:", error);
    res.status(500).json({
      success: false,
      message: "Server error",
      error: error.message,
    });
  }
});

/**
 * @route   GET /api/signals/stats/summary
 * @desc    Get resolved signal performance summary
 * @access  Public
 */
router.get("/stats/summary", protect, async (req, res) => {
  try {
    const { symbol, timeframe } = req.query;
    const summary = await getSignalPerformanceSummary({ symbol, timeframe, userId: req.user.id });

    res.json({
      success: true,
      data: summary,
    });
  } catch (error) {
    console.error("Error fetching signal performance summary:", error);
    res.status(500).json({
      success: false,
      message: "Server error",
      error: error.message,
    });
  }
});

/**
 * @route   GET /api/signals/stats/ml-summary
 * @desc    Get ML monitoring summary and calibration metrics
 * @access  Public
 */
router.get("/stats/ml-summary", protect, async (req, res) => {
  try {
    const { symbol, timeframe } = req.query;
    const summary = await getMlMonitoringSummary({ symbol, timeframe, userId: req.user.id });

    res.json({
      success: true,
      data: summary,
    });
  } catch (error) {
    console.error("Error fetching ML monitoring summary:", error);
    res.status(500).json({
      success: false,
      message: "Server error",
      error: error.message,
    });
  }
});

/**
 * @route   GET /api/signals/:id
 * @desc    Get single signal by ID
 * @access  Public
 * NOTE: This route MUST be defined AFTER all literal-path GET routes
 *       to prevent /:id from matching paths like /stats/summary
 */
router.get("/:id", protect, async (req, res) => {
  try {
    const signal = await Signal.findById(req.params.id);

    if (!signal) {
      return res.status(404).json({
        success: false,
        message: "Signal not found",
      });
    }

    if (signal.userId && signal.userId.toString() !== req.user.id) {
      return res.status(403).json({
        success: false,
        message: "Not authorized to view this signal",
      });
    }

    res.json({
      success: true,
      data: signal,
    });
  } catch (error) {
    console.error("Error fetching signal:", error);
    res.status(500).json({
      success: false,
      message: "Server error",
      error: error.message,
    });
  }
});

/**
 * @route   DELETE /api/signals/:id
 * @desc    Delete a signal
 * @access  Private
 */
router.delete("/:id", protect, async (req, res) => {
  try {
    const signal = await Signal.findById(req.params.id);

    if (!signal) {
      return res.status(404).json({
        success: false,
        message: "Signal not found",
      });
    }

    // Check if user owns this signal or is admin
    if (signal.userId && signal.userId.toString() !== req.user.id) {
      return res.status(403).json({
        success: false,
        message: "Not authorized to delete this signal",
      });
    }

    await signal.deleteOne();

    res.json({
      success: true,
      message: "Signal deleted successfully",
    });
  } catch (error) {
    console.error("Error deleting signal:", error);
    res.status(500).json({
      success: false,
      message: "Server error",
      error: error.message,
    });
  }
});

export default router;
