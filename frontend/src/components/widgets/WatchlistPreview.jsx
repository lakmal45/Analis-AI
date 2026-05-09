import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import GlassCard from "../GlassCard";
import api from "../../api/api";

const WatchlistPreview = () => {
  const [watchlist, setWatchlist] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchWatchlist();
  }, []);

  const fetchWatchlist = async () => {
    try {
      const response = await api.get("/watchlist");
      setWatchlist(response.data.assets || []);
    } catch (error) {
      console.error("Error fetching watchlist:", error);
    } finally {
      setLoading(false);
    }
  };

  return (
    <GlassCard className="p-6">
      <div className="flex justify-between items-center mb-4">
        <h3 className="text-lg font-semibold text-white">👁️ Watchlist</h3>
        <Link
          to="/watchlist"
          className="text-sm text-blue-400 hover:text-blue-300 transition-colors"
        >
          View All →
        </Link>
      </div>

      {loading ? (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="animate-pulse flex justify-between">
              <div className="h-4 bg-white/10 rounded w-20"></div>
              <div className="h-4 bg-white/10 rounded w-16"></div>
            </div>
          ))}
        </div>
      ) : (
        <div className="space-y-3">
          {watchlist.slice(0, 5).map((item) => (
            <div
              key={item.symbol}
              className="flex justify-between items-center p-2 rounded hover:bg-white/5 transition-colors"
            >
              <div>
                <p className="text-white font-medium text-sm">{item.symbol}</p>
              </div>
              <div className="text-right">
                <p className="text-white font-bold text-sm">
                  ${item.price?.toFixed(2) || "N/A"}
                </p>
                <p
                  className={`text-xs ${
                    item.change24h >= 0 ? "text-green-400" : "text-red-400"
                  }`}
                >
                  {item.change24h >= 0 ? "+" : ""}
                  {item.change24h?.toFixed(2) || 0}%
                </p>
              </div>
            </div>
          ))}

          {watchlist.length === 0 && (
            <div className="text-center py-4">
              <p className="text-gray-400 text-sm mb-2">No assets yet</p>
              <Link
                to="/watchlist"
                className="text-blue-400 hover:text-blue-300 text-sm"
              >
                Add your first asset →
              </Link>
            </div>
          )}
        </div>
      )}
    </GlassCard>
  );
};

export default WatchlistPreview;
