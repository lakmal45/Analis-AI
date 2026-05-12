import express from "express";
import Watchlist from "../models/Watchlist.js";
import { protect } from "../middleware/authMiddleware.js";
import marketService from "../services/marketService.js";

const router = express.Router();

const normalizeWatchlistAssets = async (watchlist) => {
  const normalizedSymbols = [];
  const seenSymbols = new Set();

  for (const asset of watchlist.assets) {
    const resolvedSymbol = await marketService.resolveToMarketSymbol(asset.symbol);
    if (resolvedSymbol && !seenSymbols.has(resolvedSymbol)) {
      normalizedSymbols.push({
        symbol: resolvedSymbol,
        addedAt: asset.addedAt || new Date(),
      });
      seenSymbols.add(resolvedSymbol);
    }
  }

  const hasChanges =
    normalizedSymbols.length !== watchlist.assets.length ||
    normalizedSymbols.some(
      (asset, index) =>
        asset.symbol !== watchlist.assets[index]?.symbol,
    );

  if (hasChanges) {
    watchlist.assets = normalizedSymbols;
    await watchlist.save();
  }

  return normalizedSymbols.map((asset) => asset.symbol);
};

// @route   GET /api/watchlist
// @desc    Get user's watchlist with live market data
// @access  Private
router.get("/", protect, async (req, res) => {
  try {
    const watchlist = await Watchlist.getOrCreateWatchlist(req.user.id);

    const symbols = await normalizeWatchlistAssets(watchlist);

    if (symbols.length === 0) {
      return res.json({ assets: [] });
    }

    // Fetch live market data for each symbol individually
    const tickers = await marketService.getMultiple24hTickers(symbols);
    const tickerMap = new Map(tickers.map((ticker) => [ticker.symbol, ticker]));
    const watchlistData = symbols.map((symbol) => {
      const ticker = tickerMap.get(symbol);
      if (!ticker) {
        return {
          symbol,
          price: null,
          change24h: null,
          volume24h: null,
          high24h: null,
          low24h: null,
          error: "Price unavailable",
        };
      }

      return {
        symbol: ticker.symbol,
        price: parseFloat(ticker.lastPrice),
        change24h: parseFloat(ticker.priceChangePercent),
        volume24h: parseFloat(ticker.volume),
        high24h: parseFloat(ticker.highPrice),
        low24h: parseFloat(ticker.lowPrice),
      };
    });

    res.json({
      _id: watchlist._id,
      assets: watchlistData,
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

    const resolvedSymbol = await marketService.resolveToMarketSymbol(symbol);
    if (!resolvedSymbol) {
      return res.status(400).json({ message: "Invalid or unsupported symbol" });
    }

    const watchlist = await Watchlist.getOrCreateWatchlist(req.user.id);
    await watchlist.addAsset(resolvedSymbol);

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
    const resolvedSymbol =
      (await marketService.resolveToMarketSymbol(symbol)) || symbol.toUpperCase();

    const watchlist = await Watchlist.getOrCreateWatchlist(req.user.id);
    await watchlist.removeAsset(resolvedSymbol);

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

export default router;
