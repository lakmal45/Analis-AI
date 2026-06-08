import { useCallback, useEffect, useState } from "react";
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
  const [mlSummary, setMlSummary] = useState(null);
  const [mlHealth, setMlHealth] = useState(null);
  const [mlLifecycle, setMlLifecycle] = useState(null);
  const [mlActionLoading, setMlActionLoading] = useState(false);

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

  const getSettledValue = (result, fallback = null) =>
    result.status === "fulfilled" ? result.value : fallback;

  const logOptionalFailure = (label, result) => {
    if (result.status === "rejected") {
      console.error(`Error fetching ${label}:`, result.reason);
    }
  };

  const fetchMarketOverview = useCallback(async () => {
    try {
      setLoading(true);
      const [
        marketResult,
        summaryResult,
        mlSummaryResult,
        mlHealthResult,
        mlLifecycleResult,
      ] = await Promise.allSettled([
        api.get("/market/overview"),
        api.get("/signals/stats/summary"),
        api.get("/signals/stats/ml-summary"),
        api.get("/ai/ml/health"),
        api.get("/ai/ml/lifecycle"),
      ]);

      if (marketResult.status === "rejected") {
        throw marketResult.reason;
      }

      if (summaryResult.status === "rejected") {
        throw summaryResult.reason;
      }

      logOptionalFailure("ML summary", mlSummaryResult);
      logOptionalFailure("ML health", mlHealthResult);
      logOptionalFailure("ML lifecycle", mlLifecycleResult);

      const marketResponse = marketResult.value;
      const summaryResponse = summaryResult.value;
      const mlSummaryResponse = getSettledValue(mlSummaryResult);
      const mlHealthResponse = getSettledValue(mlHealthResult);
      const mlLifecycleResponse = getSettledValue(mlLifecycleResult);

      const data = Array.isArray(marketResponse.data)
        ? marketResponse.data
        : marketResponse.data.data || [];
      setMarketOverview(buildMarketOverview(data));
      setSignalSummary(summaryResponse.data?.data || null);
      setMlSummary(mlSummaryResponse?.data?.data || null);
      setMlHealth(mlHealthResponse?.data?.data || null);
      const lifecycle = mlLifecycleResponse?.data?.data || null;
      setMlLifecycle(
        lifecycle
          ? {
              ...lifecycle,
              registry: lifecycle.registry || {
                activeModelVersion: lifecycle.activeModelVersion,
                models: lifecycle.models || [],
              },
              latestTraining:
                lifecycle.latestTraining ||
                (lifecycle.lastTrainingRun
                  ? { latestTraining: lifecycle.lastTrainingRun }
                  : null),
            }
          : null,
      );
      setError(null);
    } catch (err) {
      console.error("Error fetching market overview:", err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchMarketOverview();
  }, [fetchMarketOverview]);

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

  const formatDateTime = (value) => {
    if (!value) return "N/A";
    return new Date(value).toLocaleString();
  };

  const triggerMlRetrain = async () => {
    try {
      setMlActionLoading(true);
      await api.post("/ml/retrain");
      await fetchMarketOverview();
    } catch (err) {
      console.error("Error retraining ML model:", err);
      alert(err.response?.data?.message || err.message || "Failed to retrain model");
    } finally {
      setMlActionLoading(false);
    }
  };

  const activateModelVersion = async (modelVersion) => {
    try {
      setMlActionLoading(true);
      await api.post("/ml/models/activate", { version: modelVersion });
      await fetchMarketOverview();
    } catch (err) {
      console.error("Error activating ML model:", err);
      alert(err.response?.data?.message || err.message || "Failed to activate model");
    } finally {
      setMlActionLoading(false);
    }
  };

  const mlMonitoringCards = [
    {
      label: "ML Coverage",
      value: `${(mlSummary?.mlCoverageRate || 0).toFixed(1)}%`,
      tone: "text-cyan-400",
    },
    {
      label: "Ready Predictions",
      value: `${(mlSummary?.mlCoverageRate || 0).toFixed(1)}%`,
      tone: "text-blue-400",
    },
    {
      label: "Avg ML Win Prob.",
      value: `${(mlSummary?.avgMlProbabilityPct || 0).toFixed(1)}%`,
      tone: "text-emerald-400",
    },
    {
      label: "Resolved ML Signals",
      value: `${mlSummary?.totalSignals?.toLocaleString() || "0"}`,
      tone: "text-white",
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

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
        <GlassCard className="p-6 xl:col-span-2">
          <div className="flex justify-between items-center mb-5">
            <div>
              <h3 className="text-xl font-bold text-white">ML Monitoring</h3>
              <p className="text-sm text-gray-400 mt-1">
                Prediction coverage, average model confidence, and validation readiness.
              </p>
            </div>
            <span
              className={`text-xs font-semibold px-3 py-1 rounded-full ${
                mlHealth?.status === "healthy" || mlHealth?.status === "degraded"
                  ? "bg-green-400/20 text-green-400"
                  : "bg-yellow-400/20 text-yellow-400"
              }`}
            >
              {mlHealth?.activeModelVersion ? "Model Loaded" : "Model Not Loaded"}
            </span>
          </div>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-5">
            {mlMonitoringCards.map((card) => (
              <div
                key={card.label}
                className="rounded-xl border border-white/10 bg-white/[0.03] p-4"
              >
                <p className="text-sm text-gray-400 mb-2">{card.label}</p>
                <p className={`text-2xl font-bold ${card.tone}`}>{card.value}</p>
              </div>
            ))}
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm">
            {(mlSummary?.calibration || []).map((bucket) => (
              <div
                key={bucket.bucket}
                className="rounded-xl border border-white/10 bg-white/[0.03] p-4"
              >
                <p className="text-white font-medium mb-2">{bucket.bucket}</p>
                <p className="text-gray-400">
                  Signals: <span className="text-white">{bucket.count}</span>
                </p>
                <p className="text-gray-400 mt-1">
                  Avg Prob: <span className="text-cyan-400">{bucket.avgProbabilityPct.toFixed(1)}%</span>
                </p>
                <p className="text-gray-400 mt-1">
                  Actual Win Rate: <span className="text-green-400">{bucket.actualWinRatePct.toFixed(1)}%</span>
                </p>
                <p className="text-gray-400 mt-1">
                  Gap:{" "}
                  <span
                    className={
                      Math.abs(bucket.calibrationGapPct) <= 5
                        ? "text-emerald-400"
                        : "text-yellow-400"
                    }
                  >
                    {bucket.calibrationGapPct >= 0 ? "+" : ""}
                    {bucket.calibrationGapPct.toFixed(1)}%
                  </span>
                </p>
              </div>
            ))}
          </div>
        </GlassCard>

        <GlassCard className="p-6">
          <h3 className="text-xl font-bold text-white mb-5">ML Service Health</h3>
          <div className="space-y-4 text-sm">
            <div className="rounded-xl border border-white/10 bg-white/[0.03] p-4">
              <p className="text-gray-500 mb-1">Service Status</p>
              <p
                className={`font-semibold ${
                  mlHealth?.status === "healthy" ? "text-green-400" : "text-yellow-400"
                }`}
              >
                {mlHealth?.status || "unknown"}
              </p>
            </div>
            <div className="rounded-xl border border-white/10 bg-white/[0.03] p-4">
              <p className="text-gray-500 mb-1">Loaded Model</p>
              <p className="text-white font-semibold">
                {mlHealth?.activeModelVersion || "N/A"}
              </p>
            </div>
            <div className="rounded-xl border border-white/10 bg-white/[0.03] p-4">
              <p className="text-gray-500 mb-1">Feature Version</p>
              <p className="text-white font-semibold">
                {mlHealth?.featureVersion || "N/A"}
              </p>
            </div>
            <div className="rounded-xl border border-white/10 bg-white/[0.03] p-4">
              <p className="text-gray-500 mb-1">Model Count</p>
              <p className="text-white font-semibold">
                {mlHealth?.modelCount ?? 0}
              </p>
            </div>
            <div className="rounded-xl border border-white/10 bg-white/[0.03] p-4">
              <p className="text-gray-500 mb-1">Prediction Sources</p>
              <div className="space-y-2 mt-2">
                {(mlSummary?.predictionSources || []).slice(0, 4).map((source) => (
                  <div key={source.source} className="flex justify-between">
                    <span className="text-gray-300">{source.source}</span>
                    <span className="text-white">{source.count}</span>
                  </div>
                ))}
                {(!mlSummary?.predictionSources || mlSummary.predictionSources.length === 0) && (
                  <p className="text-gray-500">No ML-tracked signals yet.</p>
                )}
              </div>
            </div>
          </div>
        </GlassCard>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
        <GlassCard className="p-6 xl:col-span-2">
          <div className="flex justify-between items-center mb-5 gap-4">
            <div>
              <h3 className="text-xl font-bold text-white">Model Lifecycle</h3>
              <p className="text-sm text-gray-400 mt-1">
                Latest training run, active model, and version promotion controls.
              </p>
            </div>
            <button
              onClick={triggerMlRetrain}
              disabled={mlActionLoading || mlLifecycle?.retrainingInProgress}
              className="px-4 py-2 bg-cyan-600 hover:bg-cyan-700 disabled:bg-cyan-900/60 text-white rounded-lg text-sm font-medium transition-colors"
            >
              {mlActionLoading || mlLifecycle?.retrainingInProgress
                ? "Retraining..."
                : "Retrain Model"}
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-5">
            <div className="rounded-xl border border-white/10 bg-white/[0.03] p-4">
              <p className="text-sm text-gray-400 mb-2">Active Model</p>
              <p className="text-white font-semibold">
                {mlLifecycle?.registry?.activeModelVersion || "N/A"}
              </p>
            </div>
            <div className="rounded-xl border border-white/10 bg-white/[0.03] p-4">
              <p className="text-sm text-gray-400 mb-2">Latest Training</p>
              <p className="text-white font-semibold">
                {formatDateTime(mlLifecycle?.latestTraining?.latestTraining?.trainedAt)}
              </p>
            </div>
            <div className="rounded-xl border border-white/10 bg-white/[0.03] p-4">
              <p className="text-sm text-gray-400 mb-2">Exported Samples</p>
              <p className="text-white font-semibold">
                {mlLifecycle?.lastRetrainingRun?.exportedSamples?.toLocaleString?.() || "N/A"}
              </p>
            </div>
          </div>

          <div className="rounded-xl border border-white/10 bg-white/[0.03] p-4 mb-5">
            <p className="text-sm text-gray-400 mb-2">Latest Metrics</p>
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4 text-sm">
              <div>
                <p className="text-gray-500">ROC-AUC</p>
                <p className="text-white font-semibold">
                  {mlLifecycle?.latestTraining?.latestTraining?.metrics?.rocAuc?.toFixed?.(4) || "N/A"}
                </p>
              </div>
              <div>
                <p className="text-gray-500">Log Loss</p>
                <p className="text-white font-semibold">
                  {mlLifecycle?.latestTraining?.latestTraining?.metrics?.logLoss?.toFixed?.(4) || "N/A"}
                </p>
              </div>
              <div>
                <p className="text-gray-500">Brier Score</p>
                <p className="text-white font-semibold">
                  {mlLifecycle?.latestTraining?.latestTraining?.metrics?.brierScore?.toFixed?.(4) || "N/A"}
                </p>
              </div>
              <div>
                <p className="text-gray-500">Walk-Forward ROC</p>
                <p className="text-white font-semibold">
                  {mlLifecycle?.latestTraining?.latestTraining?.metrics?.walkForward?.rocAucMean?.toFixed?.(4) || "N/A"}
                </p>
              </div>
              <div>
                <p className="text-gray-500">Train Rows</p>
                <p className="text-white font-semibold">
                  {mlLifecycle?.latestTraining?.latestTraining?.metrics?.trainRows?.toLocaleString?.() || "N/A"}
                </p>
              </div>
              <div>
                <p className="text-gray-500">Calibration Rows</p>
                <p className="text-white font-semibold">
                  {mlLifecycle?.latestTraining?.latestTraining?.metrics?.calibrationRows?.toLocaleString?.() || "N/A"}
                </p>
              </div>
              <div>
                <p className="text-gray-500">Test Rows</p>
                <p className="text-white font-semibold">
                  {mlLifecycle?.latestTraining?.latestTraining?.metrics?.testRows?.toLocaleString?.() || "N/A"}
                </p>
              </div>
            </div>
          </div>

          <div className="rounded-xl border border-white/10 bg-white/[0.03] p-4 mb-5">
            <p className="text-sm text-gray-400 mb-2">Promotion Status</p>
            <p
              className={`font-semibold ${
                mlLifecycle?.latestTraining?.latestTraining?.promotion?.eligible
                  ? "text-green-400"
                  : "text-yellow-400"
              }`}
            >
              {mlLifecycle?.latestTraining?.latestTraining?.promotion?.eligible
                ? "Eligible for activation"
                : "Blocked from auto-activation"}
            </p>
            {!mlLifecycle?.latestTraining?.latestTraining?.promotion?.eligible &&
              (mlLifecycle?.latestTraining?.latestTraining?.promotion?.reasons || []).length > 0 && (
                <div className="mt-3 space-y-1 text-sm text-gray-400">
                  {(mlLifecycle?.latestTraining?.latestTraining?.promotion?.reasons || []).map((reason) => (
                    <p key={reason}>{reason}</p>
                  ))}
                </div>
              )}
          </div>

          <div className="space-y-3">
            {(mlLifecycle?.registry?.models || []).slice(0, 6).map((model) => {
              const isActive =
                model.modelVersion === mlLifecycle?.registry?.activeModelVersion;

              return (
                <div
                  key={model.modelVersion}
                  className="rounded-xl border border-white/10 bg-white/[0.03] p-4 flex flex-col md:flex-row md:items-center md:justify-between gap-4"
                >
                  <div>
                    <p className="text-white font-medium">{model.modelVersion}</p>
                    <p className="text-xs text-gray-500 mt-1">
                      Trained {formatDateTime(model.trainedAt)}
                    </p>
                    <p className="text-xs text-gray-400 mt-2">
                      ROC-AUC: {model.metrics?.rocAuc?.toFixed?.(4) || "N/A"} | Log Loss:{" "}
                      {model.metrics?.logLoss?.toFixed?.(4) || "N/A"}
                    </p>
                  </div>
                  <div className="flex items-center gap-3">
                    {isActive && (
                      <span className="px-3 py-1 rounded-full bg-green-400/20 text-green-400 text-xs font-semibold">
                        Active
                      </span>
                    )}
                    {!isActive && (
                      <button
                        onClick={() => activateModelVersion(model.modelVersion)}
                        disabled={mlActionLoading}
                        className="px-3 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-900/60 text-white rounded-lg text-xs font-medium transition-colors"
                      >
                        Activate
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
            {(!mlLifecycle?.registry?.models || mlLifecycle.registry.models.length === 0) && (
              <p className="text-sm text-gray-500">No trained model versions recorded yet.</p>
            )}
          </div>
        </GlassCard>

        <GlassCard className="p-6">
          <h3 className="text-xl font-bold text-white mb-5">Retraining Status</h3>
          <div className="space-y-4 text-sm">
            <div className="rounded-xl border border-white/10 bg-white/[0.03] p-4">
              <p className="text-gray-500 mb-1">Job State</p>
              <p
                className={`font-semibold ${
                  mlLifecycle?.retrainingInProgress
                    ? "text-yellow-400"
                    : "text-green-400"
                }`}
              >
                {mlLifecycle?.retrainingInProgress ? "Running" : "Idle"}
              </p>
            </div>
            <div className="rounded-xl border border-white/10 bg-white/[0.03] p-4">
              <p className="text-gray-500 mb-1">Last Backend Retrain</p>
              <p className="text-white font-semibold">
                {formatDateTime(mlLifecycle?.lastRetrainingRun?.executedAt)}
              </p>
            </div>
            <div className="rounded-xl border border-white/10 bg-white/[0.03] p-4">
              <p className="text-gray-500 mb-1">Latest Notes</p>
              <p className="text-white font-semibold">
                {mlLifecycle?.latestTraining?.latestTraining?.notes || "N/A"}
              </p>
            </div>
            <div className="rounded-xl border border-white/10 bg-white/[0.03] p-4">
              <p className="text-gray-500 mb-1">Dataset Path</p>
              <p className="text-white font-semibold break-all">
                {mlLifecycle?.latestTraining?.latestTraining?.datasetPath || "N/A"}
              </p>
            </div>
          </div>
        </GlassCard>
      </div>

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
