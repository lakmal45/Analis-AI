import { useEffect, useMemo, useRef, useState } from "react";
import api from "../api/api";
import { useSocket } from "../hooks/useSocket";

const Watchlist = () => {
  const [assets, setAssets] = useState([]);
  const [availableCoins, setAvailableCoins] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadingCoins, setLoadingCoins] = useState(true);
  const [adding, setAdding] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedCoin, setSelectedCoin] = useState(null);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const { isConnected, priceUpdates, subscribeToWatchlist } = useSocket();
  const searchContainerRef = useRef(null);

  const fetchWatchlistData = async () => {
    try {
      setLoading(true);
      const response = await api.get("/watchlist");
      setAssets(response.data.assets || []);
    } catch (error) {
      console.error("Error fetching watchlist data:", error);
      try {
        const response = await api.get("/market/overview");
        setAssets(response.data);
      } catch (fallbackError) {
        console.error("Error fetching market overview:", fallbackError);
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchWatchlistData();
  }, []);

  useEffect(() => {
    let isMounted = true;

    const loadAvailableCoins = async () => {
      try {
        const response = await api.get("/market/symbols");
        if (isMounted) {
          setAvailableCoins(response.data || []);
        }
      } catch (error) {
        console.error("Error fetching searchable coins:", error);
        if (isMounted) {
          try {
            const response = await api.get("/market/overview");
            const fallbackCoins = (response.data || []).map((asset) => ({
              symbol: asset.symbol,
              baseAsset: asset.symbol.replace("USDT", ""),
              quoteAsset: "USDT",
            }));
            setAvailableCoins(fallbackCoins);
          } catch (fallbackError) {
            console.error("Error fetching market overview:", fallbackError);
          }
        }
      } finally {
        if (isMounted) {
          setLoadingCoins(false);
        }
      }
    };

    loadAvailableCoins();

    return () => {
      isMounted = false;
    };
  }, []);

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (
        searchContainerRef.current &&
        !searchContainerRef.current.contains(event.target)
      ) {
        setShowSuggestions(false);
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, []);

  useEffect(() => {
    if (isConnected && assets.length > 0) {
      subscribeToWatchlist(assets.map((asset) => asset.symbol));
    }
  }, [assets, isConnected, subscribeToWatchlist]);

  const liveAssets = useMemo(
    () =>
      assets.map((asset) => {
        const update = priceUpdates[asset.symbol];
        if (!update) {
          return asset;
        }

        return {
          ...asset,
          price: update.price,
          change24h: update.priceChangePercent,
          volume24h: update.volume24h,
          high24h: update.high24h,
          low24h: update.low24h,
        };
      }),
    [assets, priceUpdates],
  );

  const watchlistSymbols = useMemo(
    () => new Set(assets.map((asset) => asset.symbol)),
    [assets],
  );

  const filteredCoins = useMemo(() => {
    const normalizedSearch = searchTerm.trim().toUpperCase();

    if (!normalizedSearch) {
      return availableCoins
        .filter((coin) => !watchlistSymbols.has(coin.symbol))
        .slice(0, 8);
    }

    return availableCoins
      .filter((coin) => {
        const matchesSymbol = coin.symbol.includes(normalizedSearch);
        const matchesBase = coin.baseAsset.includes(normalizedSearch);
        return (matchesSymbol || matchesBase) && !watchlistSymbols.has(coin.symbol);
      })
      .slice(0, 8);
  }, [availableCoins, searchTerm, watchlistSymbols]);

  const resetSearch = () => {
    setSearchTerm("");
    setSelectedCoin(null);
    setShowSuggestions(false);
  };

  const selectCoin = (coin) => {
    setSelectedCoin(coin);
    setSearchTerm(coin.symbol);
    setShowSuggestions(false);
    setErrorMessage("");
  };

  const handleAddAsset = async (e) => {
    e.preventDefault();

    const coinToAdd =
      selectedCoin ||
      availableCoins.find(
        (coin) => coin.symbol === searchTerm.trim().toUpperCase(),
      );

    if (!coinToAdd) {
      setErrorMessage("Select a valid coin from the list.");
      return;
    }

    if (watchlistSymbols.has(coinToAdd.symbol)) {
      setErrorMessage("This coin is already in your watchlist.");
      return;
    }

    try {
      setAdding(true);
      setErrorMessage("");
      await api.post("/watchlist/add", { symbol: coinToAdd.symbol });
      resetSearch();
      await fetchWatchlistData();
    } catch (error) {
      console.error("Error adding asset:", error);
      setErrorMessage("Failed to add asset. Make sure you're logged in.");
    } finally {
      setAdding(false);
    }
  };

  const handleRemoveAsset = async (symbol) => {
    try {
      await api.delete(`/watchlist/remove/${symbol}`);
      await fetchWatchlistData();
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
    }
    if (volume >= 1e6) {
      return `$${(volume / 1e6).toFixed(2)}M`;
    }
    return `$${volume.toFixed(2)}`;
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h2 className="text-2xl font-bold">Watchlist</h2>
        <div className="flex items-start space-x-3">
          <div
            className={`w-2 h-2 rounded-full mt-3 ${isConnected ? "bg-green-400" : "bg-red-400"}`}
          ></div>
          <span className="text-sm text-gray-400 mt-2.5">
            {isConnected ? "Live" : "Disconnected"}
          </span>
          <form onSubmit={handleAddAsset} className="space-y-2">
            <div
              ref={searchContainerRef}
              className="relative flex flex-col sm:flex-row gap-2"
            >
              <input
                type="text"
                value={searchTerm}
                onChange={(e) => {
                  setSearchTerm(e.target.value);
                  setSelectedCoin(null);
                  setShowSuggestions(true);
                  setErrorMessage("");
                }}
                onFocus={() => setShowSuggestions(true)}
                placeholder={
                  loadingCoins ? "Loading coins..." : "Search coins (e.g., BTC, ETH, SOL)"
                }
                className="bg-gray-700 border border-gray-600 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 min-w-[280px]"
                disabled={adding || loadingCoins}
                autoComplete="off"
              />
              {showSuggestions && filteredCoins.length > 0 && (
                <div className="absolute top-full left-0 right-0 mt-1 bg-gray-800 border border-gray-600 rounded-lg shadow-xl overflow-hidden z-20">
                  {filteredCoins.map((coin) => (
                    <button
                      key={coin.symbol}
                      type="button"
                      onClick={() => selectCoin(coin)}
                      className="w-full px-3 py-2 text-left hover:bg-gray-700 transition-colors flex items-center justify-between"
                    >
                      <span className="font-medium text-white">{coin.baseAsset}</span>
                      <span className="text-sm text-gray-400">{coin.symbol}</span>
                    </button>
                  ))}
                </div>
              )}
              {showSuggestions &&
                !loadingCoins &&
                searchTerm.trim() &&
                filteredCoins.length === 0 && (
                  <div className="absolute top-full left-0 right-0 mt-1 bg-gray-800 border border-gray-600 rounded-lg px-3 py-3 text-sm text-gray-400 shadow-xl z-20">
                    No matching coins found.
                  </div>
                )}
              <button
                type="submit"
                disabled={adding || !searchTerm.trim()}
                className="bg-blue-600 hover:bg-blue-700 px-4 py-2 rounded-lg text-sm disabled:opacity-50"
              >
                {adding ? "Adding..." : "+ Add"}
              </button>
            </div>
            {selectedCoin && (
              <p className="text-xs text-gray-400">
                Selected: {selectedCoin.baseAsset} ({selectedCoin.symbol})
              </p>
            )}
            {errorMessage && <p className="text-sm text-red-400">{errorMessage}</p>}
            <p className="text-xs text-gray-500">
              Search by coin name or trading pair and add it to your saved watchlist.
            </p>
          </form>
        </div>
      </div>

      <div className="bg-gray-800 rounded-xl shadow-lg border border-gray-700 overflow-hidden">
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
        ) : liveAssets.length > 0 ? (
          liveAssets.map((asset) => {
            const symbolName = asset.symbol ? asset.symbol.replace("USDT", "") : "";
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
