import { useEffect, useState } from "react";
import GlassCard from "../GlassCard";
import api from "../../api/api";

const TopGainers = ({ limit = 5 }) => {
  const [gainers, setGainers] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let isMounted = true;

    const fetchTopGainers = async () => {
      try {
        const response = await api.get("/market/overview");
        const data = response.data;
        const sorted = (Array.isArray(data) ? data : data.data || [])
          .sort((a, b) => b.change24h - a.change24h)
          .slice(0, limit);

        if (isMounted) {
          setGainers(sorted);
        }
      } catch (error) {
        console.error("Error fetching top gainers:", error);
      } finally {
        if (isMounted) {
          setLoading(false);
        }
      }
    };

    fetchTopGainers();

    return () => {
      isMounted = false;
    };
  }, [limit]);

  return (
    <GlassCard className="p-6">
      <h3 className="text-lg font-semibold text-white mb-4">Top Gainers</h3>

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
          {gainers.map((item) => (
            <div
              key={item.symbol}
              className="flex justify-between items-center"
            >
              <div>
                <p className="text-white font-medium">{item.symbol}</p>
                <p className="text-sm text-gray-400">
                  ${item.price?.toFixed(2) || "N/A"}
                </p>
              </div>
              <div className="text-right">
                <span className="text-green-400 font-bold">
                  +{item.change24h?.toFixed(2) || 0}%
                </span>
              </div>
            </div>
          ))}
          {gainers.length === 0 && (
            <p className="text-gray-400 text-sm">No data available</p>
          )}
        </div>
      )}
    </GlassCard>
  );
};

export default TopGainers;
