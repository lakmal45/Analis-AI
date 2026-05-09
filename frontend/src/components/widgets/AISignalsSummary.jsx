import { useEffect, useState } from "react";
import GlassCard from "../GlassCard";
import api from "../../api/api";

const AISignalsSummary = () => {
  const [signals, setSignals] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchSignals();
  }, []);

  const fetchSignals = async () => {
    try {
      const response = await api.get("/signals?limit=5");
      setSignals(response.data.data || []);
    } catch (error) {
      console.error("Error fetching signals:", error);
    } finally {
      setLoading(false);
    }
  };

  const getSignalIcon = (type) => {
    switch (type) {
      case "BUY":
        return "📈";
      case "SELL":
        return "📉";
      case "HOLD":
        return "⏸️";
      default:
        return "📊";
    }
  };

  const getSignalColor = (type) => {
    switch (type) {
      case "BUY":
        return "text-green-400";
      case "SELL":
        return "text-red-400";
      case "HOLD":
        return "text-yellow-400";
      default:
        return "text-gray-400";
    }
  };

  return (
    <GlassCard className="p-6">
      <h3 className="text-lg font-semibold text-white mb-4">🤖 AI Signals</h3>

      {loading ? (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="animate-pulse flex justify-between">
              <div className="h-4 bg-white/10 rounded w-24"></div>
              <div className="h-4 bg-white/10 rounded w-16"></div>
            </div>
          ))}
        </div>
      ) : (
        <div className="space-y-3">
          {signals.slice(0, 5).map((signal) => (
            <div
              key={signal._id}
              className="flex justify-between items-center p-2 rounded hover:bg-white/5 transition-colors"
            >
              <div className="flex items-center gap-2">
                <span className="text-xl">{getSignalIcon(signal.type)}</span>
                <div>
                  <p className="text-white font-medium text-sm">
                    {signal.symbol}
                  </p>
                  <p className={`text-xs ${getSignalColor(signal.type)}`}>
                    {signal.type}
                  </p>
                </div>
              </div>
              <div className="text-right">
                <p className="text-white font-bold text-sm">
                  {signal.confidence}%
                </p>
                <p className="text-xs text-gray-400">
                  {new Date(signal.createdAt).toLocaleDateString()}
                </p>
              </div>
            </div>
          ))}

          {signals.length === 0 && (
            <p className="text-gray-400 text-sm text-center py-4">
              No active signals
            </p>
          )}

          {signals.length > 0 && (
            <div className="pt-3 border-t border-white/10">
              <div className="grid grid-cols-3 gap-2 text-center">
                <div>
                  <p className="text-xl font-bold text-green-400">
                    {signals.filter((s) => s.type === "BUY").length}
                  </p>
                  <p className="text-xs text-gray-400">BUY</p>
                </div>
                <div>
                  <p className="text-xl font-bold text-red-400">
                    {signals.filter((s) => s.type === "SELL").length}
                  </p>
                  <p className="text-xs text-gray-400">SELL</p>
                </div>
                <div>
                  <p className="text-xl font-bold text-yellow-400">
                    {signals.filter((s) => s.type === "HOLD").length}
                  </p>
                  <p className="text-xs text-gray-400">HOLD</p>
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </GlassCard>
  );
};

export default AISignalsSummary;
