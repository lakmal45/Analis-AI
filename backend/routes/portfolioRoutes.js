import express from "express";
import Portfolio from "../models/Portfolio.js";
import { protect } from "../middleware/authMiddleware.js";
import marketService from "../services/marketService.js";

const router = express.Router();

/**
 * @route   GET /api/portfolio
 * @desc    Get user's portfolio with live prices and P&L
 * @access  Private
 */
router.get("/", protect, async (req, res) => {
  try {
    const portfolio = await Portfolio.getOrCreatePortfolio(req.user.id);

    // Fetch live prices for all holdings
    const holdingsWithPrices = await Promise.all(
      portfolio.holdings.map(async (holding) => {
        try {
          const ticker = await marketService.get24hTicker(holding.symbol);
          const currentPrice = parseFloat(ticker.lastPrice);
          const value = currentPrice * holding.quantity;
          const cost = holding.buyPrice * holding.quantity;
          const pnl = value - cost;
          const pnlPercentage = cost > 0 ? (pnl / cost) * 100 : 0;

          return {
            symbol: holding.symbol,
            quantity: holding.quantity,
            buyPrice: holding.buyPrice,
            buyDate: holding.buyDate,
            currentPrice,
            value,
            cost,
            pnl,
            pnlPercentage,
            notes: holding.notes,
          };
        } catch (error) {
          // If can't fetch price, use buy price
          const value = holding.buyPrice * holding.quantity;
          return {
            symbol: holding.symbol,
            quantity: holding.quantity,
            buyPrice: holding.buyPrice,
            buyDate: holding.buyDate,
            currentPrice: holding.buyPrice,
            value,
            cost: value,
            pnl: 0,
            pnlPercentage: 0,
            notes: holding.notes,
            error: "Price unavailable",
          };
        }
      }),
    );

    // Calculate totals
    const totalValue = holdingsWithPrices.reduce((sum, h) => sum + h.value, 0);
    const totalCost = holdingsWithPrices.reduce((sum, h) => sum + h.cost, 0);
    const totalPnl = totalValue - totalCost;
    const totalPnlPercentage = totalCost > 0 ? (totalPnl / totalCost) * 100 : 0;

    res.json({
      success: true,
      data: {
        holdings: holdingsWithPrices,
        summary: {
          totalValue,
          totalCost,
          totalPnl,
          totalPnlPercentage,
          holdingsCount: portfolio.holdings.length,
        },
      },
    });
  } catch (error) {
    console.error("Error fetching portfolio:", error);
    res.status(500).json({
      success: false,
      message: "Server error",
      error: error.message,
    });
  }
});

/**
 * @route   POST /api/portfolio/holdings
 * @desc    Add holding to portfolio
 * @access  Private
 */
router.post("/holdings", protect, async (req, res) => {
  try {
    const { symbol, quantity, buyPrice, buyDate, notes } = req.body;

    if (!symbol || !quantity || !buyPrice) {
      return res.status(400).json({
        success: false,
        message: "Symbol, quantity, and buyPrice are required",
      });
    }

    const portfolio = await Portfolio.getOrCreatePortfolio(req.user.id);
    await portfolio.addHolding(
      symbol.toUpperCase(),
      parseFloat(quantity),
      parseFloat(buyPrice),
    );

    // Fetch updated portfolio
    const updatedPortfolio = await Portfolio.getOrCreatePortfolio(req.user.id);

    res.status(201).json({
      success: true,
      message: "Holding added to portfolio",
      data: updatedPortfolio,
    });
  } catch (error) {
    console.error("Error adding holding:", error);
    res.status(500).json({
      success: false,
      message: "Server error",
      error: error.message,
    });
  }
});

/**
 * @route   DELETE /api/portfolio/holdings/:symbol
 * @desc    Remove holding from portfolio
 * @access  Private
 */
router.delete("/holdings/:symbol", protect, async (req, res) => {
  try {
    const { symbol } = req.params;

    const portfolio = await Portfolio.getOrCreatePortfolio(req.user.id);
    await portfolio.removeHolding(symbol.toUpperCase());

    res.json({
      success: true,
      message: "Holding removed from portfolio",
    });
  } catch (error) {
    console.error("Error removing holding:", error);
    res.status(500).json({
      success: false,
      message: "Server error",
      error: error.message,
    });
  }
});

/**
 * @route   PUT /api/portfolio/holdings/:symbol
 * @desc    Update holding notes
 * @access  Private
 */
router.put("/holdings/:symbol", protect, async (req, res) => {
  try {
    const { symbol } = req.params;
    const { notes } = req.body;

    const portfolio = await Portfolio.getOrCreatePortfolio(req.user.id);
    const holding = portfolio.holdings.find(
      (h) => h.symbol === symbol.toUpperCase(),
    );

    if (!holding) {
      return res.status(404).json({
        success: false,
        message: "Holding not found",
      });
    }

    holding.notes = notes;
    await portfolio.save();

    res.json({
      success: true,
      message: "Holding updated",
      data: portfolio,
    });
  } catch (error) {
    console.error("Error updating holding:", error);
    res.status(500).json({
      success: false,
      message: "Server error",
      error: error.message,
    });
  }
});

export default router;
