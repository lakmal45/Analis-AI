import express from "express";
import axios from "axios";
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
import {
  getAIResponse,
  analyzeMarket,
  getChatResponse,
  generateMarketAnalysisPrompt,
  generateChatPrompt,
} from "../services/aiService.js";

// @route   POST /api/ai/analyze
// @desc    Get AI analysis for a symbol
// @access  Public
router.post("/analyze", async (req, res) => {
  try {
    const { symbol = "BTCUSDT", interval = "1h", limit = 100 } = req.body;

    // Fetch market data
    const marketData = await get24hTicker(symbol);

    // Fetch candlestick data for indicators
    const klineData = await getKlines(
      symbol,
      interval,
      parseInt(limit),
    );

    // Calculate indicators
    const indicators = getLatestIndicators(klineData);

    // Get AI analysis
    const analysis = await analyzeMarket(marketData, indicators);

    res.json({
      symbol: symbol.toUpperCase(),
      timestamp: Date.now(),
      marketData: {
        price: parseFloat(marketData.lastPrice),
        change24h: parseFloat(marketData.priceChangePercent),
        high24h: parseFloat(marketData.highPrice),
        low24h: parseFloat(marketData.lowPrice),
        volume24h: parseFloat(marketData.volume),
      },
      indicators: {
        rsi14: indicators.rsi14,
        macd: indicators.macd,
        ema20: indicators.ema20,
        sma20: indicators.sma20,
      },
      analysis,
    });
  } catch (error) {
    console.error("Error in AI analysis:", error);
    res.status(500).json({
      message: error.message || "Failed to generate AI analysis",
    });
  }
});

// @route   POST /api/ai/chat
// @desc    Get AI chat response
// @access  Public
router.post("/chat", async (req, res) => {
  try {
    const { message, history = [], marketContext = null } = req.body;

    if (!message) {
      return res.status(400).json({ message: "Message is required" });
    }

    // Get AI response
    const response = await getChatResponse(
      message,
      history,
      marketContext,
    );

    res.json({
      timestamp: Date.now(),
      message: response,
    });
  } catch (error) {
    console.error("Error in AI chat:", error);
    res.status(500).json({
      message: error.message || "Failed to get AI response",
    });
  }
});

// @route   GET /api/ai/models
// @desc    Get available AI models (OpenRouter)
// @access  Public
router.get("/models", async (req, res) => {
  try {
    const response = await axios.get("https://openrouter.ai/api/v1/models", {
      headers: {
        Authorization: `Bearer ${process.env.OPENROUTER_API_KEY}`,
      },
    });

    res.json({
      models: response.data.data.map((model) => ({
        id: model.id,
        name: model.name,
        description: model.description,
        context_length: model.context_length,
      })),
    });
  } catch (error) {
    console.error("Error fetching models:", error);
    res.status(500).json({ message: "Failed to fetch models" });
  }
});

export default router;
