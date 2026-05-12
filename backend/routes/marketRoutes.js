import express from "express";
const router = express.Router();
import {
  getPrice,
  get24hTicker,
  getKlines,
  getMultiplePrices,
  getMarketOverview,
  getSearchableSymbols,
} from "../services/marketService.js";

// @route   GET /api/market/price/:symbol
// @desc    Get current price for a symbol
// @access  Public
router.get("/price/:symbol", async (req, res) => {
  try {
    const data = await getPrice(req.params.symbol);
    res.json(data);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// @route   GET /api/market/ticker/:symbol
// @desc    Get 24h ticker data
// @access  Public
router.get("/ticker/:symbol", async (req, res) => {
  try {
    const data = await get24hTicker(req.params.symbol);
    res.json(data);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// @route   GET /api/market/klines/:symbol
// @desc    Get candlestick data
// @access  Public
router.get("/klines/:symbol", async (req, res) => {
  try {
    const { interval = "1h", limit = 210 } = req.query;
    const data = await getKlines(req.params.symbol, interval, parseInt(limit));
    res.json(data);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// @route   GET /api/market/overview
// @desc    Get market overview (top cryptos)
// @access  Public
router.get("/overview", async (req, res) => {
  try {
    const data = await getMarketOverview();
    res.json(data);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// @route   GET /api/market/symbols
// @desc    Get searchable trading symbols
// @access  Public
router.get("/symbols", async (req, res) => {
  try {
    const data = await getSearchableSymbols();
    res.json(data);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// @route   GET /api/market/prices
// @desc    Get multiple prices
// @access  Public
router.post("/prices", async (req, res) => {
  try {
    const { symbols } = req.body;
    const data = await getMultiplePrices(symbols);
    res.json(data);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

export default router;
