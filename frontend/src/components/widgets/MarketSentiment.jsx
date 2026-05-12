import { useEffect, useState } from "react";
import GlassCard from "../GlassCard";
import api from "../../api/api";

const MarketSentiment = () => {
  const [sentiment, setSentiment] = useState({
    overall: "Neutral",
    score: 50,
    fearGreed: 50,
    btcDominance: 0,
    totalMarketCap: 0,
    volume24h: 0,
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let isMounted = true;

    const fetchMarketSentiment = async () => {
      try {
        const response = await api.get("/market/overview");
        const rawData = response.data;
        const data = Array.isArray(rawData) ? rawData : rawData.data || [];

        if (data.length > 0 && isMounted) {
          const avgChange =
            data.reduce((sum, item) => sum + item.change24h, 0) / data.length;

          let overall = "Neutral";
          let score = 50;

          if (avgChange > 3) {
            overall = "Bullish";
            score = Math.min(90, 50 + avgChange * 5);
          } else if (avgChange > 0) {
            overall = "Slightly Bullish";
            score = 50 + avgChange * 5;
          } else if (avgChange < -3) {
            overall = "Bearish";
            score = Math.max(10, 50 + avgChange * 5);
          } else if (avgChange < 0) {
            overall = "Slightly Bearish";
            score = 50 + avgChange * 5;
          }

          setSentiment({
            overall,
            score: Math.round(score),
            fearGreed: Math.round(score),
            btcDominance: 0,
            totalMarketCap: 0,
            volume24h: data.reduce((sum, item) => sum + item.volume24h, 0),
          });
        }
      } catch (error) {
        console.error("Error fetching market sentiment:", error);
      } finally {
        if (isMounted) {
          setLoading(false);
        }
      }
    };

    fetchMarketSentiment();

    return () => {
      isMounted = false;
    };
  }, []);

  const getSentimentColor = (score) => {
    if (score >= 70) return "text-green-400";
    if (score >= 50) return "text-yellow-400";
    return "text-red-400";
  };

  const getBarColor = (score) => {
    if (score >= 70) return "bg-green-400";
    if (score >= 50) return "bg-yellow-400";
    return "bg-red-400";
  };

  return (
    <GlassCard className="p-6">
      <h3 className="text-lg font-semibold text-white mb-4">
        Market Sentiment
      </h3>

      {loading ? (
        <div className="animate-pulse space-y-4">
          <div className="h-8 bg-white/10 rounded"></div>
          <div className="h-4 bg-white/10 rounded w-3/4"></div>
        </div>
      ) : (
        <div className="space-y-4">
          <div className="text-center">
            <p
              className={`text-4xl font-bold ${getSentimentColor(sentiment.score)}`}
            >
              {sentiment.score}
            </p>
            <p className="text-white font-medium mt-1">{sentiment.overall}</p>
          </div>

          <div>
            <div className="flex justify-between text-xs text-gray-400 mb-1">
              <span>Extreme Fear</span>
              <span>Neutral</span>
              <span>Extreme Greed</span>
            </div>
            <div className="w-full bg-gray-700/50 rounded-full h-3">
              <div
                className={`h-3 rounded-full transition-all duration-500 ${getBarColor(sentiment.score)}`}
                style={{ width: `${sentiment.score}%` }}
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3 pt-4 border-t border-white/10">
            <div>
              <p className="text-xs text-gray-400">24h Volume</p>
              <p className="text-sm font-semibold text-white">
                ${(sentiment.volume24h / 1e9).toFixed(2)}B
              </p>
            </div>
            <div>
              <p className="text-xs text-gray-400">BTC Dominance</p>
              <p className="text-sm font-semibold text-white">
                {sentiment.btcDominance.toFixed(1)}%
              </p>
            </div>
          </div>
        </div>
      )}
    </GlassCard>
  );
};

export default MarketSentiment;
