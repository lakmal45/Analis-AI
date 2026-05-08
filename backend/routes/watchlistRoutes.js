const express = require("express");
const router = express.Router();
const Watchlist = require("../models/Watchlist");
const { protect } = require("../middleware/authMiddleware");
const marketService = require("../services/marketService");

// @route   GET /api/watchlist
// @desc    Get user's watchlist with live market data
// @access  Private
router.get("/", protect, async (req, res) => {
  try {
    const watchlist = await Watchlist.getOrCreateWatchlist(req.user.id);

    // Get symbols from watchlist
    const symbols = watchlist.assets.map((asset) => asset.symbol);

    if (symbols.length === 0) {
      return res.json({ assets: [] });
    }

    // Fetch live market data for all symbols
    const marketData = await marketService.getMarketOverview();
    const watchlistData = marketData.filter((item) =>
      symbols.includes(item.symbol),
    );

    res.json({
      _id: watchlist._id,
      assets: watchlistData.map((item) => ({
        symbol: item.symbol,
        price: item.price,
        change24h: item.change24h,
        volume24h: item.volume24h,
        high24h: item.high24h,
        low24h: item.low24h,
      })),
    });
  } catch (error) {
    console.error("Error fetching watchlist:", error);
    res.status(500).json({ message: error.message });
  }
});

// @route   POST /api/watchlist/add
// @desc    Add asset to watchlist
// @access  Private
router.post("/add", protect, async (req, res) => {
  try {
    const { symbol } = req.body;

    if (!symbol) {
      return res.status(400).json({ message: "Symbol is required" });
    }

    const watchlist = await Watchlist.getOrCreateWatchlist(req.user.id);
    await watchlist.addAsset(symbol.toUpperCase());

    res.json({
      message: "Asset added to watchlist",
      assets: watchlist.assets,
    });
  } catch (error) {
    console.error("Error adding to watchlist:", error);
    res.status(500).json({ message: error.message });
  }
});

// @route   DELETE /api/watchlist/remove/:symbol
// @desc    Remove asset from watchlist
// @access  Private
router.delete("/remove/:symbol", protect, async (req, res) => {
  try {
    const { symbol } = req.params;

    const watchlist = await Watchlist.getOrCreateWatchlist(req.user.id);
    await watchlist.removeAsset(symbol.toUpperCase());

    res.json({
      message: "Asset removed from watchlist",
      assets: watchlist.assets,
    });
  } catch (error) {
    console.error("Error removing from watchlist:", error);
    res.status(500).json({ message: error.message });
  }
});

// @route   DELETE /api/watchlist/clear
// @desc    Clear all assets from watchlist
// @access  Private
router.delete("/clear", protect, async (req, res) => {
  try {
    const watchlist = await Watchlist.getOrCreateWatchlist(req.user.id);
    watchlist.assets = [];
    await watchlist.save();

    res.json({
      message: "Watchlist cleared",
      assets: [],
    });
  } catch (error) {
    console.error("Error clearing watchlist:", error);
    res.status(500).json({ message: error.message });
  }
});

module.exports = router;
