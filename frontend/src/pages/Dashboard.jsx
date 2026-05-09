import { useState, useEffect } from "react";
import { useAuth } from "../context/AuthContext";
import { Link } from "react-router-dom";
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

  useEffect(() => {
    fetchMarketOverview();
  }, []);

  const fetchMarketOverview = async () => {
    try {
      setLoading(true);
      const response = await api.get("/market/overview");
      const data = Array.isArray(response.data) ? response.data : response.data.data || [];
      
      const totalVolume = data.reduce((sum, item) => sum + (item.volume24h || 0), 0);
      const avgChange = data.length > 0
        ? data.reduce((sum, item) => sum + (item.change24h || 0), 0) / data.length
        : 0;
      
      // Find BTC dominance from BTC volume vs total
      const btcItem = data.find((d) => d.symbol === "BTCUSDT");
      const btcDom = btcItem && totalVolume > 0
        ? ((btcItem.volume24h / totalVolume) * 100).toFixed(1)
        : "N/A";

      setMarketOverview({ totalVolume, avgChange, btcDom, data });
      setLoading(false);
    } catch (err) {
      console.error("Error fetching market overview:", err);
      setError(err.message);
      setLoading(false);
    }
  };

  const formatVolume = (v) => {
    if (!v) return "$0";
    if (v >= 1e12) return `$${(v / 1e12).toFixed(2)}T`;
    if (v >= 1e9) return `$${(v / 1e9).toFixed(2)}B`;
    if (v >= 1e6) return `$${(v / 1e6).toFixed(2)}M`;
    return `$${v.toFixed(2)}`;
  };

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
        <ErrorMessage title="Dashboard Error" message="Failed to load dashboard data." onRetry={fetchMarketOverview} type="error" />
      </div>
    );
  }

  return (
    <div className="space-y-8">
      {/* Welcome Section */}
      <div>
        <h2 className="text-3xl font-bold mb-2">Welcome back, {user?.username}! 👋</h2>
        <p className="text-gray-400">Here's your trading intelligence overview for today.</p>
      </div>

      {/* Top Row - Key Widgets */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <TopGainers limit={5} />
        <MarketSentiment />
        <AISignalsSummary />
        <WatchlistPreview />
      </div>

      {/* Portfolio Tracker - Full Width */}
      <div>
        <div className="flex justify-between items-center mb-4">
          <h3 className="text-xl font-bold text-white">💼 Portfolio Tracker</h3>
          <Link to="/signals" className="text-sm text-blue-400 hover:text-blue-300 transition-colors">View All Signals →</Link>
        </div>
        <PortfolioTracker />
      </div>

      {/* Quick Actions */}
      <GlassCard className="p-6">
        <h3 className="text-xl font-bold text-white mb-4">⚡ Quick Actions</h3>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <Link to="/analysis" className="p-4 bg-blue-600/20 hover:bg-blue-600/30 rounded-lg text-center transition-colors"><div className="text-3xl mb-2">📊</div><p className="text-white font-medium">Market Analysis</p></Link>
          <Link to="/signals" className="p-4 bg-green-600/20 hover:bg-green-600/30 rounded-lg text-center transition-colors"><div className="text-3xl mb-2">📈</div><p className="text-white font-medium">Trading Signals</p></Link>
          <Link to="/watchlist" className="p-4 bg-purple-600/20 hover:bg-purple-600/30 rounded-lg text-center transition-colors"><div className="text-3xl mb-2">👁️</div><p className="text-white font-medium">Watchlist</p></Link>
          <Link to="/chat" className="p-4 bg-yellow-600/20 hover:bg-yellow-600/30 rounded-lg text-center transition-colors"><div className="text-3xl mb-2">🤖</div><p className="text-white font-medium">AI Assistant</p></Link>
        </div>
      </GlassCard>

      {/* Market Overview Section - LIVE DATA */}
      <div>
        <h3 className="text-xl font-bold text-white mb-4">🌍 Market Overview</h3>
        <GlassCard className="p-6">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="text-center">
              <p className="text-gray-400 text-sm mb-1">24h Total Volume</p>
              <p className="text-2xl font-bold text-white">{formatVolume(marketOverview?.totalVolume)}</p>
            </div>
            <div className="text-center">
              <p className="text-gray-400 text-sm mb-1">Avg 24h Change</p>
              <p className={`text-2xl font-bold ${marketOverview?.avgChange >= 0 ? "text-green-400" : "text-red-400"}`}>
                {marketOverview?.avgChange >= 0 ? "+" : ""}{marketOverview?.avgChange?.toFixed(2)}%
              </p>
            </div>
            <div className="text-center">
              <p className="text-gray-400 text-sm mb-1">BTC Volume Dominance</p>
              <p className="text-2xl font-bold text-white">{marketOverview?.btcDom}%</p>
            </div>
          </div>
        </GlassCard>
      </div>
    </div>
  );
};

export default Dashboard;
