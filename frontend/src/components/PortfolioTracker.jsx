import { useEffect, useState } from "react";
import GlassCard from "./GlassCard";
import api from "../api/api";

const emptyHolding = () => ({
  symbol: "",
  quantity: "",
  buyPrice: "",
  buyDate: new Date().toISOString().split("T")[0],
  notes: "",
});

const PortfolioTracker = () => {
  const [portfolio, setPortfolio] = useState(null);
  const [loading, setLoading] = useState(true);
  const [showAddForm, setShowAddForm] = useState(false);
  const [newHolding, setNewHolding] = useState(emptyHolding);

  const fetchPortfolio = async () => {
    try {
      setLoading(true);
      const response = await api.get("/portfolio");
      setPortfolio(response.data.data);
    } catch (error) {
      console.error("Error fetching portfolio:", error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    let isMounted = true;

    const loadPortfolio = async () => {
      try {
        const response = await api.get("/portfolio");
        if (isMounted) {
          setPortfolio(response.data.data);
        }
      } catch (error) {
        console.error("Error fetching portfolio:", error);
      } finally {
        if (isMounted) {
          setLoading(false);
        }
      }
    };

    loadPortfolio();

    return () => {
      isMounted = false;
    };
  }, []);

  const handleAddHolding = async (e) => {
    e.preventDefault();
    try {
      await api.post("/portfolio/holdings", newHolding);
      setNewHolding(emptyHolding());
      setShowAddForm(false);
      await fetchPortfolio();
    } catch (error) {
      alert(`Error: ${error.message}`);
    }
  };

  const handleRemoveHolding = async (symbol) => {
    if (!window.confirm(`Remove ${symbol} from portfolio?`)) return;
    try {
      await api.delete(`/portfolio/holdings/${symbol}`);
      await fetchPortfolio();
    } catch (error) {
      alert(`Error: ${error.message}`);
    }
  };

  const fmt = (v) => {
    if (!v && v !== 0) return "N/A";
    return v >= 1 ? `$${v.toFixed(2)}` : `$${v.toFixed(6)}`;
  };

  if (loading) {
    return (
      <GlassCard className="p-6">
        <div className="animate-pulse space-y-4">
          <div className="h-6 bg-white/10 rounded w-1/3"></div>
          <div className="h-20 bg-white/10 rounded"></div>
        </div>
      </GlassCard>
    );
  }

  const summary = portfolio?.summary || {};

  return (
    <GlassCard className="p-6">
      <div className="flex justify-between items-center mb-6">
        <h3 className="text-lg font-semibold text-white">Portfolio Tracker</h3>
        <button
          onClick={() => setShowAddForm(!showAddForm)}
          className="px-3 py-1 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-medium transition-colors"
        >
          {showAddForm ? "Cancel" : "+ Add Asset"}
        </button>
      </div>
      {portfolio && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
          <div className="bg-white/5 rounded-lg p-3">
            <p className="text-xs text-gray-400 mb-1">Total Value</p>
            <p className="text-lg font-bold text-white">{fmt(summary.totalValue)}</p>
          </div>
          <div className="bg-white/5 rounded-lg p-3">
            <p className="text-xs text-gray-400 mb-1">Total Cost</p>
            <p className="text-lg font-bold text-white">{fmt(summary.totalCost)}</p>
          </div>
          <div className="bg-white/5 rounded-lg p-3">
            <p className="text-xs text-gray-400 mb-1">P&amp;L</p>
            <p
              className={`text-lg font-bold ${summary.totalPnl >= 0 ? "text-green-400" : "text-red-400"}`}
            >
              {summary.totalPnl >= 0 ? "+" : ""}
              {fmt(summary.totalPnl)}
            </p>
          </div>
          <div className="bg-white/5 rounded-lg p-3">
            <p className="text-xs text-gray-400 mb-1">P&amp;L %</p>
            <p
              className={`text-lg font-bold ${summary.totalPnlPercentage >= 0 ? "text-green-400" : "text-red-400"}`}
            >
              {summary.totalPnlPercentage >= 0 ? "+" : ""}
              {summary.totalPnlPercentage?.toFixed(2)}%
            </p>
          </div>
        </div>
      )}
      {showAddForm && (
        <form
          onSubmit={handleAddHolding}
          className="mb-6 p-4 bg-white/5 rounded-lg space-y-4"
        >
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm text-gray-400 mb-1">Symbol</label>
              <input
                type="text"
                required
                placeholder="BTCUSDT"
                value={newHolding.symbol}
                onChange={(e) =>
                  setNewHolding({
                    ...newHolding,
                    symbol: e.target.value.toUpperCase(),
                  })
                }
                className="w-full px-3 py-2 bg-white/10 border border-white/20 rounded-lg text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div>
              <label className="block text-sm text-gray-400 mb-1">Quantity</label>
              <input
                type="number"
                required
                step="any"
                placeholder="0.5"
                value={newHolding.quantity}
                onChange={(e) =>
                  setNewHolding({ ...newHolding, quantity: e.target.value })
                }
                className="w-full px-3 py-2 bg-white/10 border border-white/20 rounded-lg text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div>
              <label className="block text-sm text-gray-400 mb-1">Buy Price</label>
              <input
                type="number"
                required
                step="any"
                placeholder="50000"
                value={newHolding.buyPrice}
                onChange={(e) =>
                  setNewHolding({ ...newHolding, buyPrice: e.target.value })
                }
                className="w-full px-3 py-2 bg-white/10 border border-white/20 rounded-lg text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div>
              <label className="block text-sm text-gray-400 mb-1">Buy Date</label>
              <input
                type="date"
                value={newHolding.buyDate}
                onChange={(e) =>
                  setNewHolding({ ...newHolding, buyDate: e.target.value })
                }
                className="w-full px-3 py-2 bg-white/10 border border-white/20 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
          </div>
          <div>
            <label className="block text-sm text-gray-400 mb-1">Notes</label>
            <textarea
              value={newHolding.notes}
              onChange={(e) =>
                setNewHolding({ ...newHolding, notes: e.target.value })
              }
              rows={3}
              className="w-full px-3 py-2 bg-white/10 border border-white/20 rounded-lg text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="Optional trade notes"
            />
          </div>
          <button
            type="submit"
            className="w-full py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium transition-colors"
          >
            Add to Portfolio
          </button>
        </form>
      )}
      {portfolio && portfolio.holdings.length > 0 ? (
        <div className="space-y-3">
          {portfolio.holdings.map((h) => (
            <div
              key={h.symbol}
              className="p-4 bg-white/5 rounded-lg hover:bg-white/10 transition-colors"
            >
              <div className="flex justify-between items-start">
                <div>
                  <h4 className="text-white font-bold">{h.symbol}</h4>
                  <p className="text-sm text-gray-400">
                    {h.quantity} @ {fmt(h.buyPrice)}
                  </p>
                  <p className="text-xs text-gray-500 mt-1">
                    Bought: {new Date(h.buyDate).toLocaleDateString()}
                  </p>
                  {h.notes && (
                    <p className="text-xs text-gray-500 mt-1">{h.notes}</p>
                  )}
                </div>
                <div className="text-right">
                  <p className="text-white font-bold">{fmt(h.value)}</p>
                  <p
                    className={`text-sm font-medium ${h.pnl >= 0 ? "text-green-400" : "text-red-400"}`}
                  >
                    {h.pnl >= 0 ? "+" : ""}
                    {fmt(h.pnl)} ({h.pnlPercentage?.toFixed(2)}%)
                  </p>
                </div>
              </div>
              <div className="mt-3 flex justify-between items-center">
                <p className="text-xs text-gray-400">
                  Current: {fmt(h.currentPrice)}
                </p>
                <button
                  onClick={() => handleRemoveHolding(h.symbol)}
                  className="text-xs text-red-400 hover:text-red-300 transition-colors"
                >
                  Remove
                </button>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="text-center py-8">
          <p className="text-gray-400 mb-4">No assets in your portfolio yet</p>
          {!showAddForm && (
            <button
              onClick={() => setShowAddForm(true)}
              className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-medium transition-colors"
            >
              Add Your First Asset
            </button>
          )}
        </div>
      )}
    </GlassCard>
  );
};

export default PortfolioTracker;
