import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../context/useAuth";
import GlassCard from "../components/GlassCard";
import TopGainers from "../components/widgets/TopGainers";
import MarketSentiment from "../components/widgets/MarketSentiment";
import AISignalsSummary from "../components/widgets/AISignalsSummary";
import WatchlistPreview from "../components/widgets/WatchlistPreview";
import PortfolioTracker from "../components/PortfolioTracker";
import LoadingSkeleton from "../components/LoadingSkeleton";
import ErrorMessage from "../components/ErrorMessage";
import api from "../api/api";

const Dashboard = () => {
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [marketOverview, setMarketOverview] = useState(null);
  const [signalSummary, setSignalSummary] = useState(null);

  const buildMarketOverview = (data) => {
    const totalVolume = data.reduce(
      (sum, item) => sum + (item.volume24h || 0),
      0,
    );
    const avgChange =
      data.length > 0
        ? data.reduce((sum, item) => sum + (item.change24h || 0), 0) /
          data.length
        : 0;
    const btcItem = data.find((d) => d.symbol === "BTCUSDT");
    const btcDom =
      btcItem && totalVolume > 0
        ? ((btcItem.volume24h / totalVolume) * 100).toFixed(1)
        : "N/A";

    return { totalVolume, avgChange, btcDom, data };
  };

  const fetchMarketOverview = async () => {
    try {
      setLoading(true);
      const [marketResponse, summaryResponse] = await Promise.all([
        api.get("/market/overview"),
        api.get("/signals/stats/summary"),
      ]);
      const data = Array.isArray(marketResponse.data)
        ? marketResponse.data
        : marketResponse.data.data || [];
      setMarketOverview(buildMarketOverview(data));
      setSignalSummary(summaryResponse.data?.data || null);
      setError(null);
    } catch (err) {
      console.error("Error fetching market overview:", err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    let isMounted = true;

    const loadMarketOverview = async () => {
      try {
        const [marketResponse, summaryResponse] = await Promise.all([
          api.get("/market/overview"),
          api.get("/signals/stats/summary"),
        ]);
        const data = Array.isArray(marketResponse.data)
          ? marketResponse.data
          : marketResponse.data.data || [];

        if (isMounted) {
          setMarketOverview(buildMarketOverview(data));
          setSignalSummary(summaryResponse.data?.data || null);
          setError(null);
        }
      } catch (err) {
        console.error("Error fetching market overview:", err);
        if (isMounted) {
          setError(err.message);
        }
      } finally {
        if (isMounted) {
          setLoading(false);
        }
      }
    };

    loadMarketOverview();

    return () => {
      isMounted = false;
    };
  }, []);

  const formatVolume = (v) => {
    if (!v) return "$0";
    if (v >= 1e12) return `$${(v / 1e12).toFixed(2)}T`;
    if (v >= 1e9) return `$${(v / 1e9).toFixed(2)}B`;
    if (v >= 1e6) return `$${(v / 1e6).toFixed(2)}M`;
    return `$${v.toFixed(2)}`;
  };

  const performanceCards = [
    {
      label: "Resolved Signals",
      value: signalSummary?.totalResolved?.toLocaleString() || "0",
      tone: "text-blue-400",
    },
    {
      label: "Win Rate",
      value: `${(signalSummary?.winRate || 0).toFixed(1)}%`,
      tone: "text-green-400",
    },
    {
      label: "Avg Leveraged Return",
      value: `${signalSummary?.avgReturnPct >= 0 ? "+" : ""}${(signalSummary?.avgReturnPct || 0).toFixed(2)}%`,
      tone:
        (signalSummary?.avgReturnPct || 0) >= 0 ? "text-emerald-400" : "text-red-400",
    },
    {
      label: "Avg Leverage",
      value: `${(signalSummary?.avgLeverage || 0).toFixed(1)}x`,
      tone: "text-cyan-400",
    },
  ];

  if (loading) {
    return (
      <div className="max-w-7xl mx-auto py-6 px-4 sm:px-6 lg:px-8">
        <LoadingSkeleton type="widget" count={4} className="mb-6" />
        <LoadingSkeleton type="portfolio" className="mb-6" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center justify-center py-12">
        <ErrorMessage
          title="Dashboard Error"
          message="Failed to load dashboard data."
          onRetry={fetchMarketOverview}
          type="error"
        />
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <div>
        <h2 className="text-3xl font-bold mb-2">
          Welcome back, {user?.username}!
        </h2>
        <p className="text-gray-400">
          Here's your trading intelligence overview for today.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <TopGainers limit={5} />
        <MarketSentiment />
        <AISignalsSummary />
        <WatchlistPreview />
      </div>

      <GlassCard className="p-6">
        <div className="flex justify-between items-center mb-5">
          <div>
            <h3 className="text-xl font-bold text-white">Futures Signal Performance</h3>
            <p className="text-sm text-gray-400 mt-1">
              Real outcomes from resolved futures signals with leveraged PnL.
            </p>
          </div>
          <Link
            to="/app/signals"
            className="text-sm text-blue-400 hover:text-blue-300 transition-colors"
          >
            Open Signals Overview →
          </Link>
        </div>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {performanceCards.map((card) => (
            <div
              key={card.label}
              className="rounded-xl border border-white/10 bg-white/[0.03] p-4"
            >
              <p className="text-sm text-gray-400 mb-2">{card.label}</p>
              <p className={`text-2xl font-bold ${card.tone}`}>{card.value}</p>
            </div>
          ))}
        </div>
      </GlassCard>

      <div>
        <div className="flex justify-between items-center mb-4">
          <h3 className="text-xl font-bold text-white">Portfolio Tracker</h3>
          <Link
            to="/app/signals"
            className="text-sm text-blue-400 hover:text-blue-300 transition-colors"
          >
            View All Signals →
          </Link>
        </div>
        <PortfolioTracker />
      </div>

      <GlassCard className="p-6">
        <h3 className="text-xl font-bold text-white mb-4">Quick Actions</h3>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <Link
            to="/app/analysis"
            className="p-4 bg-blue-600/20 hover:bg-blue-600/30 rounded-lg text-center transition-colors"
          >
            <div className="text-3xl mb-2">📊</div>
            <p className="text-white font-medium">Market Analysis</p>
          </Link>
          <Link
            to="/app/signals"
            className="p-4 bg-green-600/20 hover:bg-green-600/30 rounded-lg text-center transition-colors"
          >
            <div className="text-3xl mb-2">📈</div>
            <p className="text-white font-medium">Futures Signals</p>
          </Link>
          <Link
            to="/app/watchlist"
            className="p-4 bg-purple-600/20 hover:bg-purple-600/30 rounded-lg text-center transition-colors"
          >
            <div className="text-3xl mb-2">👁️</div>
            <p className="text-white font-medium">Watchlist</p>
          </Link>
          <Link
            to="/app/chat"
            className="p-4 bg-yellow-600/20 hover:bg-yellow-600/30 rounded-lg text-center transition-colors"
          >
            <div className="text-3xl mb-2">🤖</div>
            <p className="text-white font-medium">AI Assistant</p>
          </Link>
        </div>
      </GlassCard>

      <div>
        <h3 className="text-xl font-bold text-white mb-4">Market Overview</h3>
        <GlassCard className="p-6">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="text-center">
              <p className="text-gray-400 text-sm mb-1">24h Total Volume</p>
              <p className="text-2xl font-bold text-white">
                {formatVolume(marketOverview?.totalVolume)}
              </p>
            </div>
            <div className="text-center">
              <p className="text-gray-400 text-sm mb-1">Avg 24h Change</p>
              <p
                className={`text-2xl font-bold ${
                  marketOverview?.avgChange >= 0
                    ? "text-green-400"
                    : "text-red-400"
                }`}
              >
                {marketOverview?.avgChange >= 0 ? "+" : ""}
                {marketOverview?.avgChange?.toFixed(2)}%
              </p>
            </div>
            <div className="text-center">
              <p className="text-gray-400 text-sm mb-1">BTC Volume Dominance</p>
              <p className="text-2xl font-bold text-white">
                {marketOverview?.btcDom}%
              </p>
            </div>
          </div>
        </GlassCard>
      </div>
    </div>
  );
};

export default Dashboard;
