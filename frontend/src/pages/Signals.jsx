import { useCallback, useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import SignalCard from "../components/SignalCard";
import GlassCard from "../components/GlassCard";
import api from "../api/api";

const DEFAULT_LEVERAGE = 10;
const TIMEFRAMES = ["1m", "5m", "15m", "1h", "4h", "1d"];
const STATUS_FILTERS = ["ACTIVE", "ALL", "COMPLETED", "CANCELLED"];

const formatSymbolLabel = (symbol) => symbol.replace("USDT", "");

const getLeveragedReturnPct = (performance) =>
  performance?.leveragedReturnPct ?? performance?.priceChangePct ?? 0;

const Signals = () => {
  const [signals, setSignals] = useState([]);
  const [completedSignals, setCompletedSignals] = useState([]);
  const [summary, setSummary] = useState(null);
  const [loading, setLoading] = useState(true);
  const [summaryLoading, setSummaryLoading] = useState(true);
  const [error, setError] = useState(null);
  const [filter, setFilter] = useState("ACTIVE");
  const [selectedSymbol, setSelectedSymbol] = useState("");
  const [watchlistAssets, setWatchlistAssets] = useState([]);
  const [watchlistLoading, setWatchlistLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [signalTimeframe, setSignalTimeframe] = useState("1h");
  const [signalLeverage, setSignalLeverage] = useState(DEFAULT_LEVERAGE);
  const [searchParams] = useSearchParams();

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

        if (
          currentSymbol &&
          assets.some((asset) => asset.symbol === currentSymbol)
        ) {
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
      if (selectedSymbol) {
        params.append("symbol", selectedSymbol);
      }

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
      params.append("status", filter === "ALL" ? "ALL" : filter);
      if (selectedSymbol) {
        params.append("symbol", selectedSymbol);
      }

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
    if (!symbol) {
      return;
    }

    try {
      setGenerating(true);
      const response = await api.post("/signals/generate", {
        symbol: symbol.toUpperCase(),
        timeframe: signalTimeframe,
        leverage: signalLeverage,
      });
      const generatedSignal = response.data.data;
      alert(
        `Futures signal generated: ${generatedSignal.signal_type || generatedSignal.type} at ${generatedSignal.leverage}x with ${generatedSignal.confidence}% final confidence${generatedSignal.ml?.probability !== null && generatedSignal.ml?.probability !== undefined ? ` (${(generatedSignal.ml.probability * 100).toFixed(1)}% ML win probability)` : ""}`,
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

  const backtestingHref = selectedSymbol
    ? `/app/backtesting?symbol=${selectedSymbol}`
    : "/app/backtesting";

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <h1 className="text-3xl font-bold text-white">Futures Signals</h1>
          <p className="mt-1 text-gray-400">
            Generate, monitor, and review accuracy-focused futures trade
            signals across perpetual markets.
          </p>
        </div>

        <Link
          to={backtestingHref}
          className="inline-flex items-center justify-center rounded-lg bg-violet-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-violet-700"
        >
          Open Backtesting
        </Link>
      </div>

      <GlassCard className="p-4">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end">
          <label className="block flex-1">
            <span className="mb-2 block text-sm text-gray-400">Coin</span>
            <select
              value={selectedSymbol}
              onChange={(e) => setSelectedSymbol(e.target.value)}
              disabled={watchlistLoading || watchlistAssets.length === 0}
              className="w-full rounded-lg border border-white/20 bg-gray-800 px-4 py-2 text-white focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50"
            >
              {watchlistAssets.length === 0 ? (
                <option value="" className="bg-gray-800 text-white">
                  {watchlistLoading
                    ? "Loading watchlist..."
                    : "No watchlist coins found"}
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
                      {formatSymbolLabel(asset.symbol)}/USDT
                    </option>
                  ))}
                </>
              )}
            </select>
          </label>

          <label className="block w-full lg:w-36">
            <span className="mb-2 block text-sm text-gray-400">Timeframe</span>
            <select
              value={signalTimeframe}
              onChange={(e) => setSignalTimeframe(e.target.value)}
              className="w-full rounded-lg border border-white/20 bg-gray-800 px-4 py-2 text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              {TIMEFRAMES.map((timeframe) => (
                <option
                  key={timeframe}
                  value={timeframe}
                  className="bg-gray-800 text-white"
                >
                  {timeframe}
                </option>
              ))}
            </select>
          </label>

          <label className="block w-full lg:w-32">
            <span className="mb-2 block text-sm text-gray-400">Leverage</span>
            <input
              type="number"
              min="1"
              max="125"
              value={signalLeverage}
              onChange={(e) =>
                setSignalLeverage(
                  Math.min(
                    125,
                    Math.max(1, Number(e.target.value) || DEFAULT_LEVERAGE),
                  ),
                )
              }
              className="w-full rounded-lg border border-white/20 bg-gray-800 px-4 py-2 text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
              aria-label="Signal leverage"
              title="Signal leverage"
            />
          </label>

          <button
            onClick={() => generateSignal(selectedSymbol || "BTCUSDT")}
            disabled={generating || watchlistAssets.length === 0}
            className="w-full rounded-lg bg-blue-600 px-4 py-2 font-medium text-white transition-colors hover:bg-blue-700 disabled:bg-blue-800 lg:w-auto"
          >
            {generating ? "Generating..." : "Generate Futures Signal"}
          </button>
        </div>
      </GlassCard>

      <GlassCard className="border-violet-400/20 bg-violet-500/10 p-5">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <h2 className="text-lg font-semibold text-white">
              Separate backtesting workspace
            </h2>
            <p className="mt-1 text-sm text-violet-100/80">
              Historical replay, dataset inspection, and saved backtest runs now
              live on their own page for a cleaner signal workflow.
            </p>
          </div>
          <Link
            to={backtestingHref}
            className="inline-flex items-center justify-center rounded-lg border border-violet-300/30 bg-violet-500/20 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-violet-500/30"
          >
            Go to Futures Backtesting
          </Link>
        </div>
      </GlassCard>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-3">
        <GlassCard className="p-6 xl:col-span-2">
          <div className="mb-5 flex items-center justify-between">
            <div>
              <h2 className="text-xl font-semibold text-white">
                Performance Snapshot
              </h2>
              <p className="mt-1 text-sm text-gray-400">
                Live view of resolved futures signal performance, leverage, and
                tracked outcomes.
              </p>
            </div>
            {summaryLoading && (
              <span className="text-sm text-gray-500">Refreshing...</span>
            )}
          </div>
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
            {summaryCards.map((card) => (
              <div
                key={card.label}
                className="rounded-xl border border-white/10 bg-white/[0.04] p-4"
              >
                <p className="mb-2 text-sm text-gray-400">{card.label}</p>
                <p className={`text-2xl font-bold ${card.tone}`}>{card.value}</p>
              </div>
            ))}
          </div>
        </GlassCard>

        <GlassCard className="p-6">
          <h2 className="mb-5 text-xl font-semibold text-white">Outcome Mix</h2>
          <div className="space-y-4">
            {(summary?.byOutcome || []).map((item) => (
              <div key={item.outcome}>
                <div className="mb-1 flex justify-between text-sm">
                  <span className="text-gray-300">{item.outcome}</span>
                  <span className="text-gray-400">
                    {item.count} | {item.rate.toFixed(1)}%
                  </span>
                </div>
                <div className="h-2 overflow-hidden rounded-full bg-white/10">
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
              <p className="text-sm text-gray-500">
                No resolved outcome data yet.
              </p>
            )}
          </div>
        </GlassCard>
      </div>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
        <GlassCard className="p-6">
          <h2 className="mb-2 text-xl font-semibold text-white">
            Win/Loss History
          </h2>
          <p className="mb-5 text-sm text-gray-400">
            Recent resolved futures trade signals, ordered from newest to oldest
            by leveraged return.
          </p>
          <div className="flex h-56 items-end gap-3">
            {chartSignals.map((signal) => {
              const leveragedReturn = getLeveragedReturnPct(signal.performance);
              const magnitude = Math.max(
                16,
                Math.min(100, Math.abs(leveragedReturn) * 4),
              );

              return (
                <div
                  key={signal.id || signal._id}
                  className="flex flex-1 flex-col items-center gap-2"
                >
                  <span className="text-[11px] text-gray-500">
                    {leveragedReturn.toFixed(1)}%
                  </span>
                  <div className="flex h-40 w-full items-end">
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
                    {formatSymbolLabel(signal.symbol)}
                  </span>
                </div>
              );
            })}
            {chartSignals.length === 0 && (
              <div className="flex h-full w-full items-center justify-center text-sm text-gray-500">
                No resolved signal history available yet.
              </div>
            )}
          </div>
        </GlassCard>

        <GlassCard className="p-6">
          <h2 className="mb-2 text-xl font-semibold text-white">
            By Timeframe
          </h2>
          <p className="mb-5 text-sm text-gray-400">
            Breakdown of resolved futures signals, win rate, and average
            leveraged return by timeframe.
          </p>
          <div className="space-y-4">
            {(summary?.byTimeframe || []).map((item) => (
              <div
                key={item.timeframe}
                className="rounded-xl border border-white/10 bg-white/[0.04] p-4"
              >
                <div className="mb-3 flex items-center justify-between">
                  <div>
                    <p className="font-medium text-white">{item.timeframe}</p>
                    <p className="text-xs text-gray-500">
                      {item.total} resolved signals
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="font-semibold text-green-400">
                      {item.winRate.toFixed(1)}%
                    </p>
                    <p className="text-xs text-gray-500">Win rate</p>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3 text-sm">
                  <div className="rounded-lg bg-white/[0.03] p-3">
                    <p className="mb-1 text-gray-500">Wins</p>
                    <p className="font-semibold text-white">{item.wins}</p>
                  </div>
                  <div className="rounded-lg bg-white/[0.03] p-3">
                    <p className="mb-1 text-gray-500">Avg Leveraged Return</p>
                    <p
                      className={`font-semibold ${
                        item.avgReturnPct >= 0
                          ? "text-emerald-400"
                          : "text-red-400"
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
              <p className="text-sm text-gray-500">
                No timeframe performance data yet.
              </p>
            )}
          </div>
        </GlassCard>
      </div>

      <GlassCard className="p-4">
        <div className="flex flex-wrap gap-2">
          {STATUS_FILTERS.map((status) => (
            <button
              key={status}
              onClick={() => setFilter(status)}
              className={`rounded-lg px-4 py-2 text-sm font-medium transition-colors ${
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
        <GlassCard className="border-red-400/30 bg-red-400/10 p-4">
          <p className="text-red-400">{error}</p>
        </GlassCard>
      )}

      {loading && (
        <div className="py-12 text-center">
          <div className="inline-block h-8 w-8 animate-spin rounded-full border-b-2 border-blue-500" />
          <p className="mt-4 text-gray-400">Loading signals...</p>
        </div>
      )}

      {!loading && signals.length === 0 && (
        <GlassCard className="p-12 text-center">
          <div className="mb-4 text-5xl text-blue-300">/ /</div>
          <h3 className="mb-2 text-xl font-semibold text-white">
            No signals found
          </h3>
          <p className="mb-6 text-gray-400">
            {filter === "ACTIVE"
              ? "No active futures signals. Generate a new futures signal to get started."
              : "No signals match your current filters."}
          </p>
          <button
            onClick={() => generateSignal("BTCUSDT")}
            className="rounded-lg bg-blue-600 px-6 py-3 font-medium text-white transition-colors hover:bg-blue-700"
          >
            Generate First Futures Signal
          </button>
        </GlassCard>
      )}

      {!loading && signals.length > 0 && (
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          {signals.map((signal) => (
            <SignalCard
              key={signal.id || signal._id}
              signal={signal}
              onUpdateStatus={updateSignalStatus}
              showActions={true}
            />
          ))}
        </div>
      )}

      {!loading && signals.length > 0 && (
        <GlassCard className="p-6">
          <h3 className="mb-4 text-lg font-semibold text-white">
            Current Futures Signal Mix
          </h3>
          <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
            <div className="text-center">
              <p className="text-3xl font-bold text-green-400">
                {signals.filter((signal) => (signal.signal_type || signal.type) === "BUY").length}
              </p>
              <p className="text-sm text-gray-400">BUY Signals</p>
            </div>
            <div className="text-center">
              <p className="text-3xl font-bold text-red-400">
                {signals.filter((signal) => (signal.signal_type || signal.type) === "SELL").length}
              </p>
              <p className="text-sm text-gray-400">SELL Signals</p>
            </div>
            <div className="text-center">
              <p className="text-3xl font-bold text-yellow-400">
                {signals.filter((signal) => (signal.signal_type || signal.type) === "HOLD").length}
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
    </div>
  );
};

export default Signals;
