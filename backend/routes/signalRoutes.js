import express from "express";
import Signal from "../models/Signal.js";
import { protect } from "../middleware/authMiddleware.js";
import {
  generateSignal,
  saveSignal,
  getActiveSignals,
  getSignalHistory,
  updateSignalStatus,
} from "../services/signalService.js";
import { getKlines } from "../services/marketService.js";

const router = express.Router();

/**
 * @route   GET /api/signals
 * @desc    Get signals with optional status and symbol filtering
 * @access  Public (or Private with protect)
 */
router.get("/", async (req, res) => {
  try {
    const { symbol, status, limit = 50 } = req.query;

    // Build query based on filters
    const query = {};
    if (symbol) query.symbol = symbol.toUpperCase();
    if (status && status !== "ALL") {
      query.status = status.toUpperCase();
    } else if (!status) {
      // Default to active signals when no status filter specified
      query.status = "ACTIVE";
    }

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
    const signals = await getSignalHistory(symbol, parseInt(limit));

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
 * @access  Public
 * NOTE: This route MUST be defined BEFORE /:id to prevent route collision
 */
router.get("/analyze/:symbol", async (req, res) => {
  try {
    const { symbol } = req.params;
    const { timeframe = "1h" } = req.query;

    // Fetch candlestick data
    const klineData = await getKlines(
      symbol.toUpperCase(),
      timeframe,
      100,
    );

    if (!klineData || klineData.length < 26) {
      return res.status(400).json({
        success: false,
        message: "Insufficient data to analyze",
      });
    }

    // Generate signal (without saving)
    const signalData = generateSignal(symbol.toUpperCase(), klineData, {
      timeframe,
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
 * @route   GET /api/signals/:id
 * @desc    Get single signal by ID
 * @access  Public
 */
router.get("/:id", async (req, res) => {
  try {
    const signal = await Signal.findById(req.params.id);

    if (!signal) {
      return res.status(404).json({
        success: false,
        message: "Signal not found",
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
 * @route   POST /api/signals/generate
 * @desc    Generate a new signal for a symbol
 * @access  Private
 */
router.post("/generate", protect, async (req, res) => {
  try {
    const { symbol, timeframe = "1h" } = req.body;

    if (!symbol) {
      return res.status(400).json({
        success: false,
        message: "Symbol is required",
      });
    }

    // Fetch candlestick data
    const klineData = await getKlines(symbol, timeframe, 100);

    if (!klineData || klineData.length < 26) {
      return res.status(400).json({
        success: false,
        message: "Insufficient data to generate signal",
      });
    }

    // Generate signal
    const signalData = generateSignal(symbol.toUpperCase(), klineData, {
      timeframe,
    });

    if (!signalData) {
      return res.status(400).json({
        success: false,
        message: "Could not generate signal",
      });
    }

    // Save signal to database
    const savedSignal = await saveSignal(signalData, req.user.id);

    if (!savedSignal) {
      return res.status(500).json({
        success: false,
        message: "Failed to save signal",
      });
    }

    res.status(201).json({
      success: true,
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

    const signal = await updateSignalStatus(req.params.id, status);

    if (!signal) {
      return res.status(404).json({
        success: false,
        message: "Signal not found",
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
