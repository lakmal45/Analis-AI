import { useState, useEffect } from "react";
import api from "../api/api";
import { useSocket } from "../hooks/useSocket";
import { useAuth } from "../context/AuthContext";

const Watchlist = () => {
  const [assets, setAssets] = useState([]);
  const [loading, setLoading] = useState(true);
  const [adding, setAdding] = useState(false);
  const [newSymbol, setNewSymbol] = useState("");
  const { isConnected, priceUpdates, subscribeToWatchlist } = useSocket();
  const { user } = useAuth();

  useEffect(() => {
    fetchWatchlistData();

    // Subscribe to real-time updates via Socket.IO
    if (isConnected) {
      console.log("Subscribing to watchlist via Socket.IO");
      subscribeToWatchlist(["BTCUSDT", "ETHUSDT", "BNBUSDT"]); // Default symbols
    }
  }, [isConnected, subscribeToWatchlist]);

  // Update assets when we receive real-time price updates
  useEffect(() => {
    if (Object.keys(priceUpdates).length > 0) {
      setAssets((prevAssets) =>
        prevAssets.map((asset) => {
          const update = priceUpdates[asset.symbol];
          if (update) {
            return {
              ...asset,
              price: update.price,
              change24h: update.priceChangePercent,
              volume24h: update.volume24h,
              high24h: update.high24h,
              low24h: update.low24h,
            };
          }
          return asset;
        }),
      );
    }
  }, [priceUpdates]);

  const fetchWatchlistData = async () => {
    try {
      setLoading(true);
      const response = await api.get("/watchlist");
      setAssets(response.data.assets || []);
      setLoading(false);
    } catch (error) {
      console.error("Error fetching watchlist data:", error);
      // Fallback to market overview if API fails
      fetchMarketOverview();
    }
  };

  const fetchMarketOverview = async () => {
    try {
      const response = await api.get("/market/overview");
      setAssets(response.data);
      setLoading(false);
    } catch (error) {
      console.error("Error fetching market overview:", error);
      setLoading(false);
    }
  };

  const handleAddAsset = async (e) => {
    e.preventDefault();
    if (!newSymbol.trim()) return;

    try {
      setAdding(true);
      await api.post("/watchlist/add", { symbol: newSymbol.toUpperCase() });

      setNewSymbol("");
      fetchWatchlistData(); // Refresh list
    } catch (error) {
      console.error("Error adding asset:", error);
      alert("Failed to add asset. Make sure you're logged in.");
    } finally {
      setAdding(false);
    }
  };

  const handleRemoveAsset = async (symbol) => {
    try {
      await api.delete(`/watchlist/remove/${symbol}`);

      fetchWatchlistData(); // Refresh list
    } catch (error) {
      console.error("Error removing asset:", error);
    }
  };

  const formatPrice = (price) => {
    if (!price) return "--";
    if (price >= 1000) {
      return `$${price.toLocaleString("en-US", {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      })}`;
    }
    return `$${price.toFixed(4)}`;
  };

  const formatVolume = (volume) => {
    if (!volume) return "--";
    if (volume >= 1e9) {
      return `$${(volume / 1e9).toFixed(2)}B`;
    } else if (volume >= 1e6) {
      return `$${(volume / 1e6).toFixed(2)}M`;
    }
    return `$${volume.toFixed(2)}`;
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h2 className="text-2xl font-bold">Watchlist</h2>
        <div className="flex items-center space-x-3">
          <div
            className={`w-2 h-2 rounded-full ${isConnected ? "bg-green-400" : "bg-red-400"}`}
          ></div>
          <span className="text-sm text-gray-400">
            {isConnected ? "Live" : "Disconnected"}
          </span>
          <form onSubmit={handleAddAsset} className="flex space-x-2">
            <input
              type="text"
              value={newSymbol}
              onChange={(e) => setNewSymbol(e.target.value)}
              placeholder="Add symbol (e.g., BTC)"
              className="bg-gray-700 border border-gray-600 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              disabled={adding}
            />
            <button
              type="submit"
              disabled={adding || !newSymbol.trim()}
              className="bg-blue-600 hover:bg-blue-700 px-4 py-2 rounded-lg text-sm disabled:opacity-50"
            >
              {adding ? "Adding..." : "+ Add"}
            </button>
          </form>
        </div>
      </div>

      <div className="bg-gray-800 rounded-xl shadow-lg border border-gray-700 overflow-hidden">
        {/* Table Header */}
        <div className="grid grid-cols-5 gap-4 p-4 bg-gray-700 font-semibold">
          <div>Asset</div>
          <div className="text-right">Price</div>
          <div className="text-right">24h Change</div>
          <div className="text-right">24h Volume</div>
          <div className="text-right">Action</div>
        </div>

        {loading ? (
          <div className="p-8 text-center text-gray-400">
            Loading watchlist...
          </div>
        ) : assets.length > 0 ? (
          assets.map((asset) => {
            const symbolName = asset.symbol
              ? asset.symbol.replace("USDT", "")
              : "";
            const isPositive = asset.change24h >= 0;

            return (
              <div
                key={asset.symbol}
                className="grid grid-cols-5 gap-4 p-4 border-t border-gray-700 hover:bg-gray-700/50 transition-colors"
              >
                <div className="flex items-center space-x-3">
                  <div className="w-8 h-8 bg-blue-600 rounded-full flex items-center justify-center font-bold">
                    {symbolName[0]}
                  </div>
                  <div>
                    <p className="font-medium">{symbolName}</p>
                    <p className="text-sm text-gray-400">{asset.symbol}</p>
                  </div>
                </div>
                <div className="text-right flex items-center justify-end font-medium text-white">
                  {formatPrice(asset.price)}
                </div>
                <div
                  className={`text-right flex items-center justify-end font-medium ${
                    isPositive ? "text-green-400" : "text-red-400"
                  }`}
                >
                  {isPositive ? "+" : ""}
                  {asset.change24h ? asset.change24h.toFixed(2) : "--"}%
                </div>
                <div className="text-right flex items-center justify-end text-gray-300">
                  {formatVolume(asset.volume24h)}
                </div>
                <div className="text-right">
                  <button
                    onClick={() => handleRemoveAsset(asset.symbol)}
                    className="text-red-400 hover:text-red-300 text-sm"
                  >
                    Remove
                  </button>
                </div>
              </div>
            );
          })
        ) : (
          <div className="p-8 text-center text-gray-400">
            No assets in watchlist. Add some assets to get started!
          </div>
        )}
      </div>
    </div>
  );
};

export default Watchlist;
