import { useCallback, useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import SignalCard from "../components/SignalCard";
import GlassCard from "../components/GlassCard";
import api from "../api/api";

const Signals = () => {
  const defaultLeverage = 10;
  const [signals, setSignals] = useState([]);
  const [completedSignals, setCompletedSignals] = useState([]);
  const [summary, setSummary] = useState(null);
  const [backtestResult, setBacktestResult] = useState(null);
  const [loading, setLoading] = useState(true);
  const [summaryLoading, setSummaryLoading] = useState(true);
  const [backtestLoading, setBacktestLoading] = useState(false);
  const [error, setError] = useState(null);
  const [backtestError, setBacktestError] = useState(null);
  const [activeTab, setActiveTab] = useState("signals");
  const [filter, setFilter] = useState("ACTIVE");
  const [selectedSymbol, setSelectedSymbol] = useState("");
  const [watchlistAssets, setWatchlistAssets] = useState([]);
  const [watchlistLoading, setWatchlistLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [signalLeverage, setSignalLeverage] = useState(defaultLeverage);
  const [searchParams] = useSearchParams();
  const [backtestConfig, setBacktestConfig] = useState({
    timeframe: "1h",
    limit: 300,
    analysisWindow: 210,
    resolutionCandles: 1,
    sampleSize: 12,
    leverage: defaultLeverage,
  });

  const getLeveragedReturnPct = (performance) =>
    performance?.leveragedReturnPct ?? performance?.priceChangePct ?? 0;

  useEffect(() => {
    const symbolFromQuery = searchParams.get("symbol");
    if (symbolFromQuery) {
      setSelectedSymbol(symbolFromQuery.toUpperCase());
    }
  }, [searchParams]);

  const fetchWatchlist = useCallback(async () => {
    try {
      setWatchlistLoading(true);
      const response = await api.get("/watchlist");
      const assets = response.data.assets || [];
      setWatchlistAssets(assets);

      setSelectedSymbol((currentSymbol) => {
        if (!assets.length) {
          return currentSymbol;
        }

        if (currentSymbol && assets.some((asset) => asset.symbol === currentSymbol)) {
          return currentSymbol;
        }

        return currentSymbol || assets[0].symbol;
      });
    } catch (err) {
      console.error("Error fetching watchlist:", err);
      setWatchlistAssets([]);
    } finally {
      setWatchlistLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchWatchlist();
  }, [fetchWatchlist]);

  const fetchSignalSummary = useCallback(async () => {
    try {
      setSummaryLoading(true);
      const params = new URLSearchParams();
      if (selectedSymbol) params.append("symbol", selectedSymbol);
      const query = params.toString();
      const [summaryResponse, completedResponse] = await Promise.all([
        api.get(`/signals/stats/summary${query ? `?${query}` : ""}`),
        api.get(
          `/signals?status=COMPLETED&limit=24${selectedSymbol ? `&symbol=${selectedSymbol}` : ""}`,
        ),
      ]);

      setSummary(summaryResponse.data?.data || null);
      setCompletedSignals(completedResponse.data?.data || []);
    } catch (err) {
      console.error("Error fetching signal summary:", err);
    } finally {
      setSummaryLoading(false);
    }
  }, [selectedSymbol]);

  const fetchSignals = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const params = new URLSearchParams();
      if (filter !== "ALL") params.append("status", filter);
      else params.append("status", "ALL");
      if (selectedSymbol) params.append("symbol", selectedSymbol);

      const response = await api.get(`/signals?${params.toString()}`);
      setSignals(response.data.data || []);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [filter, selectedSymbol]);

  useEffect(() => {
    fetchSignals();
  }, [fetchSignals]);

  useEffect(() => {
    fetchSignalSummary();
  }, [fetchSignalSummary]);

  const generateSignal = async (symbol) => {
    if (!symbol) return;
    try {
      setGenerating(true);
      const response = await api.post("/signals/generate", {
        symbol: symbol.toUpperCase(),
        leverage: signalLeverage,
      });
      alert(
        `Futures signal generated: ${response.data.data.type} at ${response.data.data.leverage}x with ${response.data.data.confidence}% confidence`,
      );
      await fetchSignals();
      await fetchSignalSummary();
    } catch (err) {
      alert(`Error: ${err.message}`);
    } finally {
      setGenerating(false);
    }
  };

  const updateSignalStatus = async (signalId, status) => {
    try {
      await api.put(`/signals/${signalId}/status`, { status });
      await fetchSignals();
      await fetchSignalSummary();
    } catch (err) {
      alert(`Error: ${err.message}`);
    }
  };

  const runBacktest = async () => {
    const symbolToTest = selectedSymbol || watchlistAssets[0]?.symbol || "BTCUSDT";

    try {
      setBacktestLoading(true);
      setBacktestError(null);

      const response = await api.post("/signals/backtest", {
        symbol: symbolToTest,
        ...backtestConfig,
      });

      setBacktestResult(response.data?.data || null);
    } catch (err) {
      console.error("Error running backtest:", err);
      setBacktestError(
        err.response?.data?.message || err.message || "Failed to run backtest",
      );
    } finally {
      setBacktestLoading(false);
    }
  };

  const chartSignals = completedSignals
    .filter((signal) => ["WIN", "LOSS", "NEUTRAL"].includes(signal.outcome))
    .slice(0, 12);

  const summaryCards = [
    {
      label: "Resolved Signals",
      value: summary?.totalResolved?.toLocaleString() || "0",
      tone: "text-blue-400",
    },
    {
      label: "Win Rate",
      value: `${(summary?.winRate || 0).toFixed(1)}%`,
      tone: "text-green-400",
    },
    {
      label: "Avg Leveraged Return",
      value: `${summary?.avgReturnPct >= 0 ? "+" : ""}${(summary?.avgReturnPct || 0).toFixed(2)}%`,
      tone:
        (summary?.avgReturnPct || 0) >= 0 ? "text-emerald-400" : "text-red-400",
    },
    {
      label: "Avg Leverage",
      value: `${(summary?.avgLeverage || 0).toFixed(1)}x`,
      tone: "text-cyan-400",
    },
  ];

  const backtestSummaryCards = [
    {
      label: "Backtested Signals",
      value: backtestResult?.summary?.totalSignals?.toLocaleString() || "0",
      tone: "text-blue-400",
    },
    {
      label: "Backtest Win Rate",
      value: `${(backtestResult?.summary?.winRate || 0).toFixed(1)}%`,
      tone: "text-green-400",
    },
    {
      label: "Avg Leveraged Return",
      value: `${backtestResult?.summary?.avgReturnPct >= 0 ? "+" : ""}${(backtestResult?.summary?.avgReturnPct || 0).toFixed(2)}%`,
      tone:
        (backtestResult?.summary?.avgReturnPct || 0) >= 0
          ? "text-emerald-400"
          : "text-red-400",
    },
    {
      label: "Configured Leverage",
      value: `${(backtestResult?.config?.leverage || backtestResult?.summary?.avgLeverage || 0).toFixed(1)}x`,
      tone: "text-cyan-400",
    },
  ];

  const backtestTrades = backtestResult?.recentTrades || [];
  const currentSymbolLabel = (
    selectedSymbol || watchlistAssets[0]?.symbol || "BTCUSDT"
  ).replace("USDT", "");

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h1 className="text-3xl font-bold text-white">Futures Trading</h1>
          <p className="text-gray-400 mt-1">
            {activeTab === "signals"
              ? "Generate, monitor, and review AI futures trade signals across perpetual markets."
              : "Replay historical futures candles and inspect how the current futures logic performs."}
          </p>
        </div>
        <div className="flex flex-wrap gap-2 w-full md:w-auto">
          <select
            value={selectedSymbol}
            onChange={(e) => setSelectedSymbol(e.target.value)}
            disabled={watchlistLoading || watchlistAssets.length === 0}
            className="min-w-[220px] px-4 py-2 bg-gray-800 border border-white/20 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50"
          >
            {watchlistAssets.length === 0 ? (
              <option value="" className="bg-gray-800 text-white">
                {watchlistLoading ? "Loading watchlist..." : "No watchlist coins found"}
              </option>
            ) : (
              <>
                <option value="" className="bg-gray-800 text-white">
                  All watchlist coins
                </option>
                {watchlistAssets.map((asset) => (
                  <option
                    key={asset.symbol}
                    value={asset.symbol}
                    className="bg-gray-800 text-white"
                  >
                    {asset.symbol.replace("USDT", "")}/USDT
                  </option>
                ))}
              </>
            )}
          </select>
          <input
            type="number"
            min="1"
            max="125"
            value={signalLeverage}
            onChange={(e) =>
              setSignalLeverage(
                Math.min(125, Math.max(1, Number(e.target.value) || defaultLeverage)),
              )
            }
            className="w-28 px-4 py-2 bg-gray-800 border border-white/20 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
            aria-label="Signal leverage"
            title="Signal leverage"
          />
          <button
            onClick={() =>
              activeTab === "signals"
                ? generateSignal(selectedSymbol || "BTCUSDT")
                : runBacktest()
            }
            disabled={
              activeTab === "signals"
                ? generating || watchlistAssets.length === 0
                : backtestLoading || watchlistLoading
            }
            className={`px-4 py-2 text-white rounded-lg font-medium transition-colors ${
              activeTab === "signals"
                ? "bg-blue-600 hover:bg-blue-700 disabled:bg-blue-800"
                : "bg-violet-600 hover:bg-violet-700 disabled:bg-violet-900/60"
            }`}
          >
            {activeTab === "signals"
              ? generating
                ? "Generating..."
                : "Generate Futures Signal"
              : backtestLoading
                ? "Running Futures Backtest..."
                : "Run Futures Backtest"}
          </button>
        </div>
      </div>

      <GlassCard className="p-3">
        <div className="flex flex-wrap gap-2">
          {[
            { key: "signals", label: "Futures Signals" },
            { key: "backtesting", label: "Futures Backtesting" },
          ].map((tab) => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                activeTab === tab.key
                  ? "bg-white text-gray-900"
                  : "bg-white/10 text-gray-300 hover:bg-white/20"
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </GlassCard>

      {activeTab === "signals" && (
        <>
          <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
            <GlassCard className="p-6 xl:col-span-2">
              <div className="flex justify-between items-center mb-5">
                <div>
                  <h2 className="text-xl font-semibold text-white">Performance Snapshot</h2>
                  <p className="text-sm text-gray-400 mt-1">
                    Live view of resolved futures signal performance, leverage, and tracked outcomes.
                  </p>
                </div>
                {summaryLoading && <span className="text-sm text-gray-500">Refreshing...</span>}
              </div>
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                {summaryCards.map((card) => (
                  <div
                    key={card.label}
                    className="rounded-xl border border-white/10 bg-white/[0.04] p-4"
                  >
                    <p className="text-sm text-gray-400 mb-2">{card.label}</p>
                    <p className={`text-2xl font-bold ${card.tone}`}>{card.value}</p>
                  </div>
                ))}
              </div>
            </GlassCard>

            <GlassCard className="p-6">
              <h2 className="text-xl font-semibold text-white mb-5">Outcome Mix</h2>
              <div className="space-y-4">
                {(summary?.byOutcome || []).map((item) => (
                  <div key={item.outcome}>
                    <div className="flex justify-between text-sm mb-1">
                      <span className="text-gray-300">{item.outcome}</span>
                      <span className="text-gray-400">
                        {item.count} · {item.rate.toFixed(1)}%
                      </span>
                    </div>
                    <div className="h-2 rounded-full bg-white/10 overflow-hidden">
                      <div
                        className={`h-full rounded-full ${
                          item.outcome === "WIN"
                            ? "bg-green-400"
                            : item.outcome === "LOSS"
                              ? "bg-red-400"
                              : "bg-yellow-400"
                        }`}
                        style={{ width: `${item.rate}%` }}
                      />
                    </div>
                  </div>
                ))}
                {(!summary?.byOutcome || summary.byOutcome.length === 0) && (
                  <p className="text-sm text-gray-500">No resolved outcome data yet.</p>
                )}
              </div>
            </GlassCard>
          </div>

          <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
            <GlassCard className="p-6">
              <h2 className="text-xl font-semibold text-white mb-2">Win/Loss History</h2>
              <p className="text-sm text-gray-400 mb-5">
                Recent resolved futures trade signals, ordered from newest to oldest by leveraged return.
              </p>
              <div className="flex items-end gap-3 h-56">
                {chartSignals.map((signal) => {
                  const leveragedReturn = getLeveragedReturnPct(signal.performance);
                  const magnitude = Math.max(
                    16,
                    Math.min(100, Math.abs(leveragedReturn) * 4),
                  );

                  return (
                    <div key={signal._id} className="flex-1 flex flex-col items-center gap-2">
                      <span className="text-[11px] text-gray-500">
                        {leveragedReturn.toFixed(1)}%
                      </span>
                      <div className="w-full h-40 flex items-end">
                        <div
                          className={`w-full rounded-t-md ${
                            signal.outcome === "WIN"
                              ? "bg-green-400/80"
                              : signal.outcome === "LOSS"
                                ? "bg-red-400/80"
                                : "bg-yellow-400/80"
                          }`}
                          style={{ height: `${magnitude}%` }}
                          title={`${signal.symbol} ${signal.outcome}`}
                        />
                      </div>
                      <span className="text-[11px] text-gray-400">
                        {signal.symbol.replace("USDT", "")}
                      </span>
                    </div>
                  );
                })}
                {chartSignals.length === 0 && (
                  <div className="w-full h-full flex items-center justify-center text-gray-500 text-sm">
                    No resolved signal history available yet.
                  </div>
                )}
              </div>
            </GlassCard>

            <GlassCard className="p-6">
              <h2 className="text-xl font-semibold text-white mb-2">By Timeframe</h2>
              <p className="text-sm text-gray-400 mb-5">
                Breakdown of resolved futures signals, win rate, and average leveraged return by timeframe.
              </p>
              <div className="space-y-4">
                {(summary?.byTimeframe || []).map((item) => (
                  <div
                    key={item.timeframe}
                    className="rounded-xl border border-white/10 bg-white/[0.04] p-4"
                  >
                    <div className="flex justify-between items-center mb-3">
                      <div>
                        <p className="text-white font-medium">{item.timeframe}</p>
                        <p className="text-xs text-gray-500">{item.total} resolved signals</p>
                      </div>
                      <div className="text-right">
                        <p className="text-green-400 font-semibold">{item.winRate.toFixed(1)}%</p>
                        <p className="text-xs text-gray-500">Win rate</p>
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-3 text-sm">
                      <div className="rounded-lg bg-white/[0.03] p-3">
                        <p className="text-gray-500 mb-1">Wins</p>
                        <p className="text-white font-semibold">{item.wins}</p>
                      </div>
                      <div className="rounded-lg bg-white/[0.03] p-3">
                        <p className="text-gray-500 mb-1">Avg Leveraged Return</p>
                        <p
                          className={`font-semibold ${
                            item.avgReturnPct >= 0 ? "text-emerald-400" : "text-red-400"
                          }`}
                        >
                          {item.avgReturnPct >= 0 ? "+" : ""}
                          {item.avgReturnPct.toFixed(2)}%
                        </p>
                      </div>
                    </div>
                  </div>
                ))}
                {(!summary?.byTimeframe || summary.byTimeframe.length === 0) && (
                  <p className="text-sm text-gray-500">No timeframe performance data yet.</p>
                )}
              </div>
            </GlassCard>
          </div>

          <GlassCard className="p-4">
            <div className="flex flex-wrap gap-2">
              {["ACTIVE", "ALL", "COMPLETED", "CANCELLED"].map((status) => (
                <button
                  key={status}
                  onClick={() => setFilter(status)}
                  className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                    filter === status
                      ? "bg-blue-600 text-white"
                      : "bg-white/10 text-gray-300 hover:bg-white/20"
                  }`}
                >
                  {status}
                </button>
              ))}
            </div>
          </GlassCard>

          {error && (
            <GlassCard className="p-4 border-red-400/30 bg-red-400/10">
              <p className="text-red-400">{error}</p>
            </GlassCard>
          )}

          {loading && (
            <div className="text-center py-12">
              <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500"></div>
              <p className="text-gray-400 mt-4">Loading signals...</p>
            </div>
          )}

          {!loading && signals.length === 0 && (
            <GlassCard className="p-12 text-center">
              <div className="text-6xl mb-4">ðŸ“Š</div>
              <h3 className="text-xl font-semibold text-white mb-2">
                No signals found
              </h3>
              <p className="text-gray-400 mb-6">
                {filter === "ACTIVE"
                  ? "No active futures signals. Generate a new futures signal to get started."
                  : "No signals match your current filters."}
              </p>
              <button
                onClick={() => generateSignal("BTCUSDT")}
                className="px-6 py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium transition-colors"
              >
                Generate First Futures Signal
              </button>
            </GlassCard>
          )}

          {!loading && signals.length > 0 && (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {signals.map((signal) => (
                <SignalCard
                  key={signal._id}
                  signal={signal}
                  onUpdateStatus={updateSignalStatus}
                  showActions={true}
                />
              ))}
            </div>
          )}

          {!loading && signals.length > 0 && (
            <GlassCard className="p-6">
              <h3 className="text-lg font-semibold text-white mb-4">Current Futures Signal Mix</h3>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div className="text-center">
                  <p className="text-3xl font-bold text-green-400">
                    {signals.filter((s) => s.type === "BUY").length}
                  </p>
                  <p className="text-sm text-gray-400">BUY Signals</p>
                </div>
                <div className="text-center">
                  <p className="text-3xl font-bold text-red-400">
                    {signals.filter((s) => s.type === "SELL").length}
                  </p>
                  <p className="text-sm text-gray-400">SELL Signals</p>
                </div>
                <div className="text-center">
                  <p className="text-3xl font-bold text-yellow-400">
                    {signals.filter((s) => s.type === "HOLD").length}
                  </p>
                  <p className="text-sm text-gray-400">HOLD Signals</p>
                </div>
                <div className="text-center">
                  <p className="text-3xl font-bold text-blue-400">
                    {signals.length}
                  </p>
                  <p className="text-sm text-gray-400">Total Signals</p>
                </div>
              </div>
            </GlassCard>
          )}
        </>
      )}

      {activeTab === "backtesting" && (
        <>
          <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
            <GlassCard className="p-6 xl:col-span-2">
              <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4 mb-5">
                <div>
                  <h2 className="text-xl font-semibold text-white">Futures Backtest Runner</h2>
                  <p className="text-sm text-gray-400 mt-1">
                    Replay historical futures candles for the selected contract using the current signal logic.
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-5 gap-4">
                <label className="block">
                  <span className="text-sm text-gray-400 mb-2 block">Timeframe</span>
                  <select
                    value={backtestConfig.timeframe}
                    onChange={(e) =>
                      setBacktestConfig((current) => ({
                        ...current,
                        timeframe: e.target.value,
                      }))
                    }
                    className="w-full px-4 py-2 bg-gray-800 border border-white/20 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-violet-500"
                  >
                    {["1m", "5m", "15m", "1h", "4h", "1d"].map((timeframe) => (
                      <option key={timeframe} value={timeframe} className="bg-gray-800 text-white">
                        {timeframe}
                      </option>
                    ))}
                  </select>
                </label>

                <label className="block">
                  <span className="text-sm text-gray-400 mb-2 block">History Candles</span>
                  <input
                    type="number"
                    min="60"
                    max="1000"
                    value={backtestConfig.limit}
                    onChange={(e) =>
                      setBacktestConfig((current) => ({
                        ...current,
                        limit: Number(e.target.value),
                      }))
                    }
                    className="w-full px-4 py-2 bg-gray-800 border border-white/20 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-violet-500"
                  />
                </label>

                <label className="block">
                  <span className="text-sm text-gray-400 mb-2 block">Analysis Window</span>
                  <input
                    type="number"
                    min="26"
                    max="300"
                    value={backtestConfig.analysisWindow}
                    onChange={(e) =>
                      setBacktestConfig((current) => ({
                        ...current,
                        analysisWindow: Number(e.target.value),
                      }))
                    }
                    className="w-full px-4 py-2 bg-gray-800 border border-white/20 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-violet-500"
                  />
                </label>

                <label className="block">
                  <span className="text-sm text-gray-400 mb-2 block">Resolution Candles</span>
                  <input
                    type="number"
                    min="1"
                    max="50"
                    value={backtestConfig.resolutionCandles}
                    onChange={(e) =>
                      setBacktestConfig((current) => ({
                        ...current,
                        resolutionCandles: Number(e.target.value),
                      }))
                    }
                    className="w-full px-4 py-2 bg-gray-800 border border-white/20 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-violet-500"
                  />
                </label>

                <label className="block">
                  <span className="text-sm text-gray-400 mb-2 block">Leverage</span>
                  <input
                    type="number"
                    min="1"
                    max="125"
                    value={backtestConfig.leverage}
                    onChange={(e) =>
                      setBacktestConfig((current) => ({
                        ...current,
                        leverage: Math.min(
                          125,
                          Math.max(1, Number(e.target.value) || defaultLeverage),
                        ),
                      }))
                    }
                    className="w-full px-4 py-2 bg-gray-800 border border-white/20 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-violet-500"
                  />
                </label>

                <label className="block">
                  <span className="text-sm text-gray-400 mb-2 block">Sample Trades</span>
                  <input
                    type="number"
                    min="5"
                    max="100"
                    value={backtestConfig.sampleSize}
                    onChange={(e) =>
                      setBacktestConfig((current) => ({
                        ...current,
                        sampleSize: Number(e.target.value),
                      }))
                    }
                    className="w-full px-4 py-2 bg-gray-800 border border-white/20 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-violet-500"
                  />
                </label>
              </div>

              <div className="mt-4 text-sm text-gray-400">
                Running on futures market:{" "}
                <span className="text-white font-medium">{currentSymbolLabel}/USDT</span>
                {" "}at{" "}
                <span className="text-white font-medium">{backtestConfig.leverage}x</span>
              </div>

              {backtestError && (
                <div className="mt-4 rounded-lg border border-red-400/30 bg-red-400/10 px-4 py-3 text-sm text-red-300">
                  {backtestError}
                </div>
              )}
            </GlassCard>

            <GlassCard className="p-6">
              <h2 className="text-xl font-semibold text-white mb-5">Futures Backtest Dataset</h2>
              {backtestResult ? (
                <div className="space-y-4 text-sm">
                  <div className="rounded-xl border border-white/10 bg-white/[0.04] p-4">
                    <p className="text-gray-500 mb-1">Candle Range</p>
                    <p className="text-white font-medium">
                      {new Date(backtestResult.dataset.firstCandleAt).toLocaleDateString()} -{" "}
                      {new Date(backtestResult.dataset.lastCandleAt).toLocaleDateString()}
                    </p>
                  </div>
                  <div className="rounded-xl border border-white/10 bg-white/[0.04] p-4">
                    <p className="text-gray-500 mb-1">Total Candles</p>
                    <p className="text-white font-medium">
                      {backtestResult.dataset.totalCandles.toLocaleString()}
                    </p>
                  </div>
                  <div className="rounded-xl border border-white/10 bg-white/[0.04] p-4">
                    <p className="text-gray-500 mb-1">Skipped HOLD Signals</p>
                    <p className="text-white font-medium">
                      {(backtestResult.dataset.skippedHoldSignals || 0).toLocaleString()}
                    </p>
                  </div>
                  <div className="rounded-xl border border-white/10 bg-white/[0.04] p-4">
                    <p className="text-gray-500 mb-1">Resolution Horizon</p>
                    <p className="text-white font-medium">
                      {backtestResult.config.resolutionCandles} candle(s)
                    </p>
                  </div>
                  <div className="rounded-xl border border-white/10 bg-white/[0.04] p-4">
                    <p className="text-gray-500 mb-1">Leverage</p>
                    <p className="text-white font-medium">
                      {backtestResult.config.leverage}x
                    </p>
                  </div>
                  <div className="rounded-xl border border-white/10 bg-white/[0.04] p-4">
                    <p className="text-gray-500 mb-1">Analysis Window</p>
                    <p className="text-white font-medium">
                      {backtestResult.config.analysisWindow} candles
                    </p>
                  </div>
                </div>
              ) : (
                <p className="text-sm text-gray-500">
                  Run a futures backtest to inspect the historical dataset and simulation settings.
                </p>
              )}
            </GlassCard>
          </div>

          {backtestResult && (
            <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
              <GlassCard className="p-6 xl:col-span-2">
                <h2 className="text-xl font-semibold text-white mb-5">Futures Backtest Summary</h2>
                <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                  {backtestSummaryCards.map((card) => (
                    <div
                      key={card.label}
                      className="rounded-xl border border-white/10 bg-white/[0.04] p-4"
                    >
                      <p className="text-sm text-gray-400 mb-2">{card.label}</p>
                      <p className={`text-2xl font-bold ${card.tone}`}>{card.value}</p>
                    </div>
                  ))}
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-5">
                  {(backtestResult.summary.byType || []).map((item) => (
                    <div
                      key={item.type}
                      className="rounded-xl border border-white/10 bg-white/[0.04] p-4"
                    >
                      <div className="flex justify-between items-center mb-2">
                        <p className="text-white font-medium">{item.type}</p>
                        <p className="text-gray-400 text-sm">{item.total} signals</p>
                      </div>
                      <div className="flex justify-between text-sm">
                        <span className="text-gray-500">Win Rate</span>
                        <span className="text-green-400">{item.winRate.toFixed(1)}%</span>
                      </div>
                      <div className="flex justify-between text-sm mt-1">
                        <span className="text-gray-500">Avg Leveraged Return</span>
                        <span
                          className={
                            item.avgReturnPct >= 0 ? "text-emerald-400" : "text-red-400"
                          }
                        >
                          {item.avgReturnPct >= 0 ? "+" : ""}
                          {item.avgReturnPct.toFixed(2)}%
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </GlassCard>

              <GlassCard className="p-6">
                <h2 className="text-xl font-semibold text-white mb-5">Futures Backtest Outcomes</h2>
                <div className="space-y-4">
                  {(backtestResult.summary.byOutcome || []).map((item) => (
                    <div key={item.outcome}>
                      <div className="flex justify-between text-sm mb-1">
                        <span className="text-gray-300">{item.outcome}</span>
                        <span className="text-gray-400">
                          {item.total} · {item.rate.toFixed(1)}%
                        </span>
                      </div>
                      <div className="h-2 rounded-full bg-white/10 overflow-hidden">
                        <div
                          className={`h-full rounded-full ${
                            item.outcome === "WIN"
                              ? "bg-green-400"
                              : item.outcome === "LOSS"
                                ? "bg-red-400"
                                : "bg-yellow-400"
                          }`}
                          style={{ width: `${item.rate}%` }}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              </GlassCard>
            </div>
          )}

          {backtestResult && (
            <GlassCard className="p-6">
              <div className="flex justify-between items-center mb-4">
                <div>
                  <h2 className="text-xl font-semibold text-white">Recent Simulated Futures Trades</h2>
                  <p className="text-sm text-gray-400 mt-1">
                    Sample results from the most recent backtested futures entries.
                  </p>
                </div>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-gray-400 border-b border-white/10">
                      <th className="py-3 pr-4 font-medium">Opened</th>
                      <th className="py-3 pr-4 font-medium">Type</th>
                      <th className="py-3 pr-4 font-medium">Outcome</th>
                      <th className="py-3 pr-4 font-medium">Entry</th>
                      <th className="py-3 pr-4 font-medium">Resolved</th>
                      <th className="py-3 pr-4 font-medium">Leverage</th>
                      <th className="py-3 pr-4 font-medium">PnL</th>
                      <th className="py-3 font-medium">Confidence</th>
                    </tr>
                  </thead>
                  <tbody>
                    {backtestTrades.map((trade) => (
                      <tr key={`${trade.createdAt}-${trade.type}`} className="border-b border-white/5">
                        <td className="py-3 pr-4 text-gray-300">
                          {new Date(trade.createdAt).toLocaleString()}
                        </td>
                        <td className="py-3 pr-4 text-white font-medium">{trade.type}</td>
                        <td
                          className={`py-3 pr-4 font-medium ${
                            trade.outcome === "WIN"
                              ? "text-green-400"
                              : trade.outcome === "LOSS"
                                ? "text-red-400"
                                : "text-yellow-400"
                          }`}
                        >
                          {trade.outcome}
                        </td>
                        <td className="py-3 pr-4 text-gray-300">${trade.price.entry.toFixed(2)}</td>
                        <td className="py-3 pr-4 text-gray-300">
                          ${trade.price.resolution.toFixed(2)}
                        </td>
                        <td className="py-3 pr-4 text-gray-300">{trade.leverage}x</td>
                        <td
                          className={`py-3 pr-4 font-medium ${
                            getLeveragedReturnPct(trade.performance) >= 0
                              ? "text-emerald-400"
                              : "text-red-400"
                          }`}
                        >
                          {getLeveragedReturnPct(trade.performance) >= 0 ? "+" : ""}
                          {getLeveragedReturnPct(trade.performance).toFixed(2)}%
                        </td>
                        <td className="py-3 text-gray-300">{trade.confidence}%</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </GlassCard>
          )}
        </>
      )}
    </div>
  );
};

export default Signals;
