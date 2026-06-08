import { useCallback, useEffect, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import GlassCard from "../components/GlassCard";
import api from "../api/api";

const DEFAULT_LEVERAGE = 10;
const DEFAULT_VISIBLE_HISTORY_COUNT = 3;
const DEFAULT_TRADE_AMOUNT_USD = 10;
const TIMEFRAMES = ["1m", "5m", "15m", "1h", "4h", "1d"];
const DEFAULT_ATR_TARGET_MULTIPLIER = 3;
const DEFAULT_ATR_STOP_MULTIPLIER = 1.5;
const TIMEFRAME_TO_MS = {
  "1m": 60 * 1000,
  "5m": 5 * 60 * 1000,
  "15m": 15 * 60 * 1000,
  "1h": 60 * 60 * 1000,
  "4h": 4 * 60 * 60 * 1000,
  "1d": 24 * 60 * 60 * 1000,
};

const formatSymbolLabel = (symbol) => symbol.replace("USDT", "");

const getLeveragedReturnPct = (performance) =>
  performance?.netLeveragedReturnPct ??
  performance?.leveragedReturnPct ??
  performance?.priceChangePct ??
  0;

const formatUsd = (value) =>
  `$${(value || 0).toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;

const getTradeAmountUsd = (resultOrTrade) =>
  resultOrTrade?.position?.tradeAmountUsd ??
  resultOrTrade?.summary?.tradeAmountUsd ??
  resultOrTrade?.config?.tradeAmountUsd ??
  DEFAULT_TRADE_AMOUNT_USD;

const getTradePnlUsd = (
  trade,
  fallbackTradeAmountUsd = DEFAULT_TRADE_AMOUNT_USD,
) =>
  trade?.position?.pnlUsd ??
  (fallbackTradeAmountUsd * getLeveragedReturnPct(trade?.performance)) / 100;

const getUtcDateRangeCandleCount = (startDate, endDate, timeframe) => {
  if (!startDate || !endDate) {
    return null;
  }

  const timeframeMs = TIMEFRAME_TO_MS[timeframe];
  if (!timeframeMs) {
    return null;
  }

  const start = new Date(`${startDate}T00:00:00.000Z`);
  const end = new Date(`${endDate}T23:59:59.999Z`);

  if (
    Number.isNaN(start.getTime()) ||
    Number.isNaN(end.getTime()) ||
    start > end
  ) {
    return null;
  }

  return Math.floor((end.getTime() - start.getTime()) / timeframeMs) + 1;
};

const Backtesting = () => {
  const [searchParams] = useSearchParams();
  const [backtestResult, setBacktestResult] = useState(null);
  const [backtestHistory, setBacktestHistory] = useState([]);
  const [backtestLoading, setBacktestLoading] = useState(false);
  const [backtestHistoryLoading, setBacktestHistoryLoading] = useState(false);
  const [deletingBacktestRunId, setDeletingBacktestRunId] = useState(null);
  const [pendingDeleteBacktest, setPendingDeleteBacktest] = useState(null);
  const [isHistoryExpanded, setIsHistoryExpanded] = useState(false);
  const [backtestError, setBacktestError] = useState(null);
  const [selectedSymbol, setSelectedSymbol] = useState("");
  const [watchlistAssets, setWatchlistAssets] = useState([]);
  const [watchlistLoading, setWatchlistLoading] = useState(true);
  const [mlLifecycle, setMlLifecycle] = useState(null);
  const [mlLifecycleLoading, setMlLifecycleLoading] = useState(true);
  const [signalConfig, setSignalConfig] = useState(null);
  const historyRef = useRef(null);
  const resultRef = useRef(null);
  const [backtestConfig, setBacktestConfig] = useState({
    timeframe: "1h",
    limit: 300,
    analysisWindow: 210,
    resolutionCandles: 1,
    sampleSize: 12,
    leverage: DEFAULT_LEVERAGE,
    tradeAmountUsd: DEFAULT_TRADE_AMOUNT_USD,
    atrTargetMultiplier: DEFAULT_ATR_TARGET_MULTIPLIER,
    atrStopMultiplier: DEFAULT_ATR_STOP_MULTIPLIER,
    startDate: "",
    endDate: "",
    intrabarPolicy: "conservative",
    backtestMlModel: "off",
    applyAccuracyGuardrails: false,
    preset: "balanced",
    validationMode: "rules_only",
  });

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

  const fetchMlLifecycle = useCallback(async () => {
    try {
      setMlLifecycleLoading(true);
      const response = await api.get("/ai/ml/lifecycle");
      const lifecycle = response.data?.data || null;
      const normalizedLifecycle = lifecycle
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
        : null;
      setMlLifecycle(normalizedLifecycle);

      const activeModelVersion =
        normalizedLifecycle?.registry?.activeModelVersion || "off";
      setBacktestConfig((current) => ({
        ...current,
        backtestMlModel:
          current.backtestMlModel === "off"
            ? activeModelVersion
            : current.backtestMlModel,
      }));
    } catch (err) {
      console.error("Error fetching ML lifecycle:", err);
      setMlLifecycle(null);
    } finally {
      setMlLifecycleLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchMlLifecycle();
  }, [fetchMlLifecycle]);

  useEffect(() => {
    const fetchSignalConfig = async () => {
      try {
        const response = await api.get("/signals/config");
        const config = response.data?.data || null;
        setSignalConfig(config);
      } catch (err) {
        console.error("Error fetching signal config:", err);
      }
    };

    fetchSignalConfig();
  }, []);

  const fetchBacktestHistory = useCallback(
    async (symbolOverride, options = {}) => {
      const { hydrateLatest = true } = options;
      const historySymbol =
        symbolOverride || selectedSymbol || watchlistAssets[0]?.symbol;

      if (!historySymbol) {
        setBacktestHistory([]);
        if (hydrateLatest) {
          setBacktestResult(null);
        }
        return [];
      }

      try {
        setBacktestHistoryLoading(true);
        const response = await api.get("/backtest/history", {
          params: {
            symbol: historySymbol,
            limit: 10,
            t: Date.now(),
          },
        });

        const historyItems = response.data?.data || [];
        setBacktestHistory(historyItems);

        if (hydrateLatest) {
          setBacktestResult(historyItems[0] || null);
        }

        return historyItems;
      } catch (err) {
        console.error("Error fetching backtest history:", err);
        setBacktestHistory([]);
        if (hydrateLatest) {
          setBacktestResult(null);
        }
        return [];
      } finally {
        setBacktestHistoryLoading(false);
      }
    },
    [selectedSymbol, watchlistAssets],
  );

  useEffect(() => {
    if (watchlistLoading) {
      return;
    }

    setIsHistoryExpanded(false);
    setBacktestResult(null);
    setBacktestError(null);
    fetchBacktestHistory(selectedSymbol, { hydrateLatest: false });
  }, [selectedSymbol, watchlistLoading, fetchBacktestHistory]);

  const runBacktest = async () => {
    const symbolToTest =
      selectedSymbol || watchlistAssets[0]?.symbol || "BTCUSDT";

    try {
      setBacktestLoading(true);
      setBacktestError(null);

      if (
        (backtestConfig.startDate && !backtestConfig.endDate) ||
        (!backtestConfig.startDate && backtestConfig.endDate)
      ) {
        setBacktestError("Choose both a start date and an end date.");
        return;
      }

      const response = await api.post("/backtest", {
        symbol: symbolToTest,
        ...backtestConfig,
      });

      const nextBacktestResult = response.data?.data || null;
      setBacktestResult(nextBacktestResult);
      await fetchBacktestHistory(symbolToTest, { hydrateLatest: false });
      window.requestAnimationFrame(() => {
        resultRef.current?.scrollIntoView({
          behavior: "smooth",
          block: "start",
        });
      });
    } catch (err) {
      console.error("Error running backtest:", err);
      setBacktestError(
        err.response?.data?.message || err.message || "Failed to run backtest",
      );
    } finally {
      setBacktestLoading(false);
    }
  };

  const requestDeleteBacktestHistoryItem = (historyItem) => {
    setPendingDeleteBacktest(historyItem);
  };

  const closeDeleteBacktestDialog = () => {
    if (deletingBacktestRunId) {
      return;
    }

    setPendingDeleteBacktest(null);
  };

  const deleteBacktestHistoryItem = async () => {
    const historyItem = pendingDeleteBacktest;
    const historyRunId = historyItem?.backtestRunId || historyItem?.id || historyItem?._id;

    if (!historyRunId) {
      return;
    }

    try {
      setDeletingBacktestRunId(historyRunId);
      setBacktestError(null);

      await api.delete(`/backtest/history/${historyRunId}`);

      setBacktestHistory((currentHistory) => {
        const nextHistory = currentHistory.filter((item) => {
          const itemRunId = item.backtestRunId || item.id || item._id;
          return itemRunId !== historyRunId;
        });

        if (
          nextHistory.length <= DEFAULT_VISIBLE_HISTORY_COUNT &&
          isHistoryExpanded
        ) {
          setIsHistoryExpanded(false);
        }

        setBacktestResult((currentResult) => {
          const currentRunId =
            currentResult?.backtestRunId || currentResult?.id || currentResult?._id || null;

          if (currentRunId !== historyRunId) {
            return currentResult;
          }

          return nextHistory[0] || null;
        });

        return nextHistory;
      });
    } catch (err) {
      console.error("Error deleting backtest run:", err);
      setBacktestError(
        err.response?.data?.message ||
          err.message ||
          "Failed to delete backtest",
      );
    } finally {
      setDeletingBacktestRunId(null);
      setPendingDeleteBacktest(null);
    }
  };

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
      label: "Total PnL",
      value: `${(backtestResult?.summary?.totalPnlUsd || 0) >= 0 ? "+" : ""}${formatUsd(backtestResult?.summary?.totalPnlUsd || 0)}`,
      tone:
        (backtestResult?.summary?.totalPnlUsd || 0) >= 0
          ? "text-emerald-400"
          : "text-red-400",
    },
    {
      label: "Avg Return / Trade",
      value: `${backtestResult?.summary?.avgReturnPct >= 0 ? "+" : ""}${(backtestResult?.summary?.avgReturnPct || 0).toFixed(2)}%`,
      tone:
        (backtestResult?.summary?.avgReturnPct || 0) >= 0
          ? "text-emerald-400"
          : "text-red-400",
    },
    {
      label: "Trade Amount",
      value: formatUsd(getTradeAmountUsd(backtestResult)),
      tone: "text-cyan-400",
    },
    {
      label: "Configured Leverage",
      value: `${(backtestResult?.config?.leverage || backtestResult?.summary?.avgLeverage || 0).toFixed(1)}x`,
      tone: "text-cyan-400",
    },
  ];

  const backtestTrades = backtestResult?.recentTrades || [];
  const currentSymbolLabel = formatSymbolLabel(
    selectedSymbol || watchlistAssets[0]?.symbol || "BTCUSDT",
  );
  const selectedBacktestRunId =
    backtestResult?.backtestRunId || backtestResult?.id || backtestResult?._id || null;
  const availableMlModels = mlLifecycle?.registry?.models || [];
  const activeMlModelVersion =
    mlLifecycle?.registry?.activeModelVersion || null;
  const hasMoreHistory = backtestHistory.length > DEFAULT_VISIBLE_HISTORY_COUNT;
  const visibleBacktestHistory = isHistoryExpanded
    ? backtestHistory
    : backtestHistory.slice(0, DEFAULT_VISIBLE_HISTORY_COUNT);
  const signalPageHref = selectedSymbol
    ? `/app/signals?symbol=${selectedSymbol}`
    : "/app/signals";
  const pendingDeleteBacktestRunId =
    pendingDeleteBacktest?.backtestRunId || pendingDeleteBacktest?.id || pendingDeleteBacktest?._id || null;
  const pendingDeleteSymbolLabel = formatSymbolLabel(
    pendingDeleteBacktest?.symbol || "BTCUSDT",
  );
  const pendingDeleteTimeframe =
    pendingDeleteBacktest?.config?.timeframe || "n/a";
  const dateRangeHistoryCandles = getUtcDateRangeCandleCount(
    backtestConfig.startDate,
    backtestConfig.endDate,
    backtestConfig.timeframe,
  );
  const displayedHistoryCandles =
    dateRangeHistoryCandles ?? backtestConfig.limit;

  const selectedModel = availableMlModels.find(
    (m) => m.modelVersion === backtestConfig.backtestMlModel
  );
  const availablePresets = Object.values(signalConfig?.presets || {});
  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <h1 className="text-3xl font-bold text-white">Futures Backtesting</h1>
          <p className="mt-1 text-gray-400">
            Replay historical futures candles and inspect how the current
            trading logic performs across saved runs.
          </p>
        </div>

        <Link
          to={signalPageHref}
          className="inline-flex items-center justify-center rounded-lg border border-white/15 bg-white/5 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-white/10"
        >
          Back to Signals
        </Link>
      </div>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-3">
        <GlassCard className="p-6 xl:col-span-2">
          <div className="mb-5">
            <h2 className="text-xl font-semibold text-white">
              Futures Backtest Runner
            </h2>
            <p className="mt-1 text-sm text-gray-400">
              Replay historical futures candles with stop-loss, take-profit, and
              intrabar resolution handling.
            </p>
          </div>

          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-6">
            <label className="block">
              <span className="mb-2 block text-sm text-gray-400">
                Timeframe
              </span>
              <select
                value={backtestConfig.timeframe}
                onChange={(e) =>
                  setBacktestConfig((current) => ({
                    ...current,
                    timeframe: e.target.value,
                  }))
                }
                className="w-full rounded-lg border border-white/20 bg-gray-800 px-4 py-2 text-white focus:outline-none focus:ring-2 focus:ring-violet-500"
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

            <label className="block">
              <span className="mb-2 block text-sm text-gray-400">
                History Candles
              </span>
              <input
                type="number"
                min="60"
                max="1000"
                value={displayedHistoryCandles}
                disabled={Boolean(
                  backtestConfig.startDate || backtestConfig.endDate,
                )}
                onChange={(e) =>
                  setBacktestConfig((current) => ({
                    ...current,
                    limit: Number(e.target.value),
                  }))
                }
                className="w-full rounded-lg border border-white/20 bg-gray-800 px-4 py-2 text-white focus:outline-none focus:ring-2 focus:ring-violet-500 disabled:opacity-50"
              />
            </label>

            <label className="block">
              <span className="mb-2 block text-sm text-gray-400">
                Start Date
              </span>
              <input
                type="date"
                value={backtestConfig.startDate}
                onChange={(e) =>
                  setBacktestConfig((current) => ({
                    ...current,
                    startDate: e.target.value,
                  }))
                }
                className="w-full rounded-lg border border-white/20 bg-gray-800 px-4 py-2 text-white focus:outline-none focus:ring-2 focus:ring-violet-500"
              />
            </label>

            <label className="block">
              <span className="mb-2 block text-sm text-gray-400">End Date</span>
              <input
                type="date"
                value={backtestConfig.endDate}
                min={backtestConfig.startDate || undefined}
                onChange={(e) =>
                  setBacktestConfig((current) => ({
                    ...current,
                    endDate: e.target.value,
                  }))
                }
                className="w-full rounded-lg border border-white/20 bg-gray-800 px-4 py-2 text-white focus:outline-none focus:ring-2 focus:ring-violet-500"
              />
            </label>

            <label className="block">
              <span className="mb-2 block text-sm text-gray-400">
                Analysis Window
              </span>
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
                className="w-full rounded-lg border border-white/20 bg-gray-800 px-4 py-2 text-white focus:outline-none focus:ring-2 focus:ring-violet-500"
              />
            </label>

            <label className="block">
              <span className="mb-2 block text-sm text-gray-400">
                Resolution Candles
              </span>
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
                className="w-full rounded-lg border border-white/20 bg-gray-800 px-4 py-2 text-white focus:outline-none focus:ring-2 focus:ring-violet-500"
              />
            </label>

            <label className="block">
              <span className="mb-2 block text-sm text-gray-400">
                Intrabar Policy
              </span>
              <select
                value={backtestConfig.intrabarPolicy}
                onChange={(e) =>
                  setBacktestConfig((current) => ({
                    ...current,
                    intrabarPolicy: e.target.value,
                  }))
                }
                className="w-full rounded-lg border border-white/20 bg-gray-800 px-4 py-2 text-white focus:outline-none focus:ring-2 focus:ring-violet-500"
              >
                <option value="conservative" className="bg-gray-800 text-white">
                  Conservative
                </option>
                <option value="optimistic" className="bg-gray-800 text-white">
                  Optimistic
                </option>
              </select>
            </label>

            <label className="block">
              <span className="mb-2 block text-sm text-gray-400">Leverage</span>
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
                      Math.max(1, Number(e.target.value) || DEFAULT_LEVERAGE),
                    ),
                  }))
                }
                className="w-full rounded-lg border border-white/20 bg-gray-800 px-4 py-2 text-white focus:outline-none focus:ring-2 focus:ring-violet-500"
              />
            </label>

            <label className="block">
              <span className="mb-2 block text-sm text-gray-400">
                Trade Amount (USD)
              </span>
              <input
                type="number"
                min="1"
                step="1"
                value={backtestConfig.tradeAmountUsd}
                onChange={(e) =>
                  setBacktestConfig((current) => ({
                    ...current,
                    tradeAmountUsd: Math.max(
                      1,
                      Number(e.target.value) || DEFAULT_TRADE_AMOUNT_USD,
                    ),
                  }))
                }
                className="w-full rounded-lg border border-white/20 bg-gray-800 px-4 py-2 text-white focus:outline-none focus:ring-2 focus:ring-violet-500"
              />
            </label>

            <label className="block" title="Calculated dynamically by the backtesting engine based on market regime">
              <span className="mb-2 block text-sm text-gray-400">
                ATR Target
              </span>
              <input
                type="number"
                min="0.1"
                max="20"
                step="0.1"
                value={backtestConfig.atrTargetMultiplier}
                onChange={(e) =>
                  setBacktestConfig((current) => ({
                    ...current,
                    atrTargetMultiplier:
                      Number(e.target.value) || DEFAULT_ATR_TARGET_MULTIPLIER,
                  }))
                }
                disabled
                className="w-full rounded-lg border border-white/20 bg-gray-800 px-4 py-2 text-white focus:outline-none focus:ring-2 focus:ring-violet-500 disabled:opacity-50 disabled:cursor-not-allowed"
              />
            </label>

            <label className="block" title="Calculated dynamically by the backtesting engine based on market regime">
              <span className="mb-2 block text-sm text-gray-400">ATR Stop</span>
              <input
                type="number"
                min="0.1"
                max="20"
                step="0.1"
                value={backtestConfig.atrStopMultiplier}
                onChange={(e) =>
                  setBacktestConfig((current) => ({
                    ...current,
                    atrStopMultiplier:
                      Number(e.target.value) || DEFAULT_ATR_STOP_MULTIPLIER,
                  }))
                }
                disabled
                className="w-full rounded-lg border border-white/20 bg-gray-800 px-4 py-2 text-white focus:outline-none focus:ring-2 focus:ring-violet-500 disabled:opacity-50 disabled:cursor-not-allowed"
              />
            </label>

            <label className="block">
              <span className="mb-2 block text-sm text-gray-400">ML Model</span>
              <select
                value={backtestConfig.backtestMlModel}
                onChange={(e) =>
                  setBacktestConfig((current) => ({
                    ...current,
                    backtestMlModel: e.target.value,
                  }))
                }
                disabled={mlLifecycleLoading}
                className="w-full rounded-lg border border-white/20 bg-gray-800 px-4 py-2 text-white focus:outline-none focus:ring-2 focus:ring-violet-500 disabled:opacity-50"
              >
                <option value="off" className="bg-gray-800 text-white">
                  Off
                </option>
                {availableMlModels.map((model) => (
                  <option
                    key={model.modelVersion}
                    value={model.modelVersion}
                    className="bg-gray-800 text-white"
                  >
                    {model.modelVersion}
                    {model.modelVersion === activeMlModelVersion
                      ? " (Active)"
                      : ""}
                  </option>
                ))}
              </select>
            </label>

            <label className="block">
              <span className="mb-2 block text-sm text-gray-400">Rule Preset</span>
              <select
                value={backtestConfig.preset}
                onChange={(e) =>
                  setBacktestConfig((current) => ({
                    ...current,
                    preset: e.target.value,
                  }))
                }
                className="w-full rounded-lg border border-white/20 bg-gray-800 px-4 py-2 text-white focus:outline-none focus:ring-2 focus:ring-violet-500"
              >
                {availablePresets.length === 0 ? (
                  <option value="balanced" className="bg-gray-800 text-white">
                    Balanced
                  </option>
                ) : (
                  availablePresets.map((preset) => (
                    <option
                      key={preset.id}
                      value={preset.id}
                      className="bg-gray-800 text-white"
                    >
                      {preset.label}
                    </option>
                  ))
                )}
              </select>
            </label>


            <label className="block">
              <span className="mb-2 block text-sm text-gray-400">
                Guardrails
              </span>
              <div className="flex h-[42px] items-center rounded-lg border border-white/20 bg-gray-800 px-4">
                <input
                  type="checkbox"
                  checked={backtestConfig.applyAccuracyGuardrails}
                  onChange={(e) =>
                    setBacktestConfig((current) => ({
                      ...current,
                      applyAccuracyGuardrails: e.target.checked,
                    }))
                  }
                  className="h-4 w-4 cursor-pointer rounded border-white/20 bg-gray-900 text-violet-600 focus:ring-violet-500 focus:ring-offset-gray-800"
                />
                <span className="ml-2 text-sm text-white cursor-pointer" onClick={() => setBacktestConfig(c => ({...c, applyAccuracyGuardrails: !c.applyAccuracyGuardrails}))}>
                  Apply Limits
                </span>
              </div>
            </label>

            <label className="block">
              <span className="mb-2 block text-sm text-gray-400">
                Sample Trades
              </span>
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
                className="w-full rounded-lg border border-white/20 bg-gray-800 px-4 py-2 text-white focus:outline-none focus:ring-2 focus:ring-violet-500"
              />
            </label>
          </div>

          <div className="mt-4 text-sm text-gray-400">
            Running on futures market{" "}
            <span className="font-medium text-white">
              {currentSymbolLabel}/USDT
            </span>{" "}
            at{" "}
            <span className="font-medium text-white">
              {backtestConfig.leverage}x
            </span>{" "}
            with{" "}
            <span className="font-medium text-white">
              {formatUsd(backtestConfig.tradeAmountUsd)}
            </span>{" "}
            per trade,{" "}
            with{" "}
            <span className="font-medium text-white">
              {backtestConfig.backtestMlModel || "off"}
            </span>{" "}
            with{" "}
            <span className="font-medium text-white">
              {backtestConfig.preset.replaceAll("_", " ")}
            </span>{" "}
            preset,{" "}
            using{" "}
            <span className="font-medium text-white">
              {backtestConfig.atrTargetMultiplier}/
              {backtestConfig.atrStopMultiplier}
            </span>{" "}
            ATR
            {backtestConfig.startDate && backtestConfig.endDate ? (
              <>
                {" "}
                from{" "}
                <span className="font-medium text-white">
                  {backtestConfig.startDate}
                </span>{" "}
                to{" "}
                <span className="font-medium text-white">
                  {backtestConfig.endDate}
                </span>
              </>
            ) : null}
          </div>

          {selectedModel && (
            <div className="mt-6 border-t border-white/10 pt-4">
              <h3 className="text-sm font-semibold text-white mb-3">Selected Model Health (Guardrails)</h3>
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm text-gray-400">
                  <thead className="text-xs uppercase text-gray-500 bg-gray-800/50">
                    <tr>
                      <th className="px-3 py-2 rounded-tl-lg">Metric</th>
                      <th className="px-3 py-2">Value</th>
                      <th className="px-3 py-2">Required</th>
                      <th className="px-3 py-2 rounded-tr-lg">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr className="border-b border-white/5">
                      <td className="px-3 py-2">ROC AUC (Holdout)</td>
                      <td className="px-3 py-2">{(selectedModel.metrics?.rocAuc || 0).toFixed(4)}</td>
                      <td className="px-3 py-2">&gt;= 0.58</td>
                      <td className="px-3 py-2">
                        {(selectedModel.metrics?.rocAuc || 0) >= 0.58 ? "✅ PASS" : "❌ FAILING"}
                      </td>
                    </tr>
                    <tr className="border-b border-white/5">
                      <td className="px-3 py-2">ROC AUC (Walk-Forward)</td>
                      <td className="px-3 py-2">{(selectedModel.metrics?.walkForward?.rocAucMean || 0).toFixed(4)}</td>
                      <td className="px-3 py-2">&gt;= 0.56</td>
                      <td className="px-3 py-2">
                        {(selectedModel.metrics?.walkForward?.rocAucMean || 0) >= 0.56 ? "✅ PASS" : "❌ FAILING"}
                      </td>
                    </tr>
                    <tr className="border-b border-white/5">
                      <td className="px-3 py-2">Brier Score</td>
                      <td className="px-3 py-2">{(selectedModel.metrics?.brierScore || 0).toFixed(4)}</td>
                      <td className="px-3 py-2">&lt;= 0.25</td>
                      <td className="px-3 py-2">
                        {(selectedModel.metrics?.brierScore || 0) <= 0.25 ? "✅ PASS" : "❌ FAILING"}
                      </td>
                    </tr>
                    <tr>
                      <td className="px-3 py-2">Promotion Eligible</td>
                      <td className="px-3 py-2">{selectedModel.promotion?.eligible ? "true" : "false"}</td>
                      <td className="px-3 py-2">true</td>
                      <td className="px-3 py-2">
                        {selectedModel.promotion?.eligible ? "✅ PASS" : "❌ FAILING"}
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {backtestError && (
            <div className="mt-4 rounded-lg border border-red-400/30 bg-red-400/10 px-4 py-3 text-sm text-red-300">
              {backtestError}
            </div>
          )}
        </GlassCard>

        <GlassCard className="p-6">
          <div className="mb-5 flex flex-col gap-4">
            <div>
              <h2 className="text-xl font-semibold text-white">
                Futures Backtest Detail
              </h2>
              <p className="mt-1 text-sm text-gray-400">
                Choose the market and ML behavior, then launch the simulation
                from here.
              </p>
            </div>
            <select
              value={selectedSymbol}
              onChange={(e) => setSelectedSymbol(e.target.value)}
              disabled={watchlistLoading || watchlistAssets.length === 0}
              className="w-full rounded-lg border border-white/20 bg-gray-800 px-4 py-2 text-white focus:outline-none focus:ring-2 focus:ring-violet-500 disabled:opacity-50"
            >
              {watchlistAssets.length === 0 ? (
                <option value="" className="bg-gray-800 text-white">
                  {watchlistLoading
                    ? "Loading watchlist..."
                    : "No watchlist coins found"}
                </option>
              ) : (
                watchlistAssets.map((asset) => (
                  <option
                    key={asset.symbol}
                    value={asset.symbol}
                    className="bg-gray-800 text-white"
                  >
                    {formatSymbolLabel(asset.symbol)}/USDT
                  </option>
                ))
              )}
            </select>
            <button
              onClick={runBacktest}
              disabled={
                backtestLoading ||
                watchlistLoading ||
                watchlistAssets.length === 0
              }
              className="w-full rounded-lg bg-violet-600 px-4 py-2 font-medium text-white transition-colors hover:bg-violet-700 disabled:bg-violet-900/60"
            >
              {backtestLoading
                ? "Running Futures Backtest..."
                : "Run Futures Backtest"}
            </button>
          </div>

          <h2 className="mb-5 text-xl font-semibold text-white">
            Futures Backtest Dataset
          </h2>
          {backtestResult ? (
            <div className="space-y-4 text-sm">
              <div className="rounded-xl border border-white/10 bg-white/[0.04] p-4">
                <p className="mb-1 text-gray-500">Candle Range</p>
                <p className="font-medium text-white">
                  {new Date(
                    backtestResult.dataset.firstCandleAt,
                  ).toLocaleDateString()}{" "}
                  -{" "}
                  {new Date(
                    backtestResult.dataset.lastCandleAt,
                  ).toLocaleDateString()}
                </p>
              </div>
              <div className="rounded-xl border border-white/10 bg-white/[0.04] p-4">
                <p className="mb-1 text-gray-500">Total Candles</p>
                <p className="font-medium text-white">
                  {backtestResult.dataset.totalCandles.toLocaleString()}
                </p>
              </div>
              <div className="rounded-xl border border-white/10 bg-white/[0.04] p-4">
                <p className="mb-1 text-gray-500">Skipped HOLD Signals</p>
                <p className="font-medium text-white">
                  {(
                    backtestResult.dataset.skippedHoldSignals || 0
                  ).toLocaleString()}
                </p>
              </div>
              <div className="rounded-xl border border-white/10 bg-white/[0.04] p-4">
                <p className="mb-1 text-gray-500">Max Holding Horizon</p>
                <p className="font-medium text-white">
                  {backtestResult.config.resolutionCandles} candle(s)
                </p>
              </div>
              <div className="rounded-xl border border-white/10 bg-white/[0.04] p-4">
                <p className="mb-1 text-gray-500">Simulation Model</p>
                <p className="font-medium text-white">
                  {backtestResult.config.mlEnabled
                    ? backtestResult.config.simulationModel
                    : "None"}
                </p>
              </div>
              <div className="rounded-xl border border-white/10 bg-white/[0.04] p-4">
                <p className="mb-1 text-gray-500">ML Model for Backtesting</p>
                <p className="font-medium text-white">
                  {backtestResult.config.mlModel || "off"}
                </p>
              </div>
              <div className="rounded-xl border border-white/10 bg-white/[0.04] p-4">
                <p className="mb-1 text-gray-500">Rule Preset</p>
                <p className="font-medium capitalize text-white">
                  {(backtestResult.config.preset || "balanced").replaceAll("_", " ")}
                </p>
              </div>
              <div className="rounded-xl border border-white/10 bg-white/[0.04] p-4">
                <p className="mb-1 text-gray-500">Validation Mode</p>
                <p className="font-medium capitalize text-white">
                  {(backtestResult.config.validationMode || "rules_only").replaceAll("_", " ")}
                </p>
              </div>
              <div className="rounded-xl border border-white/10 bg-white/[0.04] p-4">
                <p className="mb-1 text-gray-500">Trade Amount</p>
                <p className="font-medium text-white">
                  {formatUsd(getTradeAmountUsd(backtestResult))}
                </p>
              </div>
              <div className="rounded-xl border border-white/10 bg-white/[0.04] p-4">
                <p className="mb-1 text-gray-500">Leverage</p>
                <p className="font-medium text-white">
                  {backtestResult.config.leverage}x
                </p>
              </div>
              <div className="rounded-xl border border-white/10 bg-white/[0.04] p-4">
                <p className="mb-1 text-gray-500">ATR TP / SL</p>
                <p className="font-medium text-white">
                  {backtestResult.config.atrTargetMultiplier}/
                  {backtestResult.config.atrStopMultiplier}
                </p>
              </div>
              <div className="rounded-xl border border-white/10 bg-white/[0.04] p-4">
                <p className="mb-1 text-gray-500">Analysis Window</p>
                <p className="font-medium text-white">
                  {backtestResult.config.analysisWindow} candles
                </p>
              </div>
              <div className="rounded-xl border border-white/10 bg-white/[0.04] p-4">
                <p className="mb-1 text-gray-500">Requested Range</p>
                <p className="font-medium text-white">
                  {backtestResult.config.startDate &&
                  backtestResult.config.endDate
                    ? `${new Date(backtestResult.config.startDate).toLocaleDateString()} - ${new Date(backtestResult.config.endDate).toLocaleDateString()}`
                    : "Latest candles"}
                </p>
              </div>
              <div className="rounded-xl border border-white/10 bg-white/[0.04] p-4">
                <p className="mb-1 text-gray-500">Intrabar Policy</p>
                <p className="font-medium capitalize text-white">
                  {backtestResult.config.intrabarPolicy}
                </p>
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="rounded-xl border border-white/10 bg-white/[0.04] p-4">
                <p className="mb-1 text-gray-500">Selected Market</p>
                <p className="font-medium text-white">
                  {currentSymbolLabel}/USDT
                </p>
              </div>
              <div className="rounded-xl border border-white/10 bg-white/[0.04] p-4">
                <p className="mb-1 text-gray-500">ML Model for Backtesting</p>
                <p className="font-medium text-white">
                  {backtestConfig.backtestMlModel || "off"}
                </p>
              </div>
              <div className="rounded-xl border border-white/10 bg-white/[0.04] p-4">
                <p className="mb-1 text-gray-500">Trade Amount</p>
                <p className="font-medium text-white">
                  {formatUsd(backtestConfig.tradeAmountUsd)}
                </p>
              </div>
              <div className="rounded-xl border border-white/10 bg-white/[0.04] p-4">
                <p className="mb-1 text-gray-500">ATR TP / SL</p>
                <p className="font-medium text-white">
                  {backtestConfig.atrTargetMultiplier}/
                  {backtestConfig.atrStopMultiplier}
                </p>
              </div>
              <p className="text-sm text-gray-500">
                Run a futures backtest to inspect the historical dataset and
                simulation settings.
              </p>
            </div>
          )}
        </GlassCard>
      </div>

      <GlassCard ref={historyRef} className="p-6">
        <div className="mb-5 flex items-center justify-between gap-4">
          <div>
            <h2 className="text-xl font-semibold text-white">
              Saved Backtest History
            </h2>
            <p className="mt-1 text-sm text-gray-400">
              Open any previously saved futures backtest for this coin.
            </p>
          </div>
          {backtestHistoryLoading && (
            <span className="text-sm text-gray-500">Refreshing...</span>
          )}
        </div>

        <div className="space-y-3">
          {visibleBacktestHistory.map((item) => {
            const historyRunId = item.backtestRunId || item.id || item._id;
            const isSelected = historyRunId === selectedBacktestRunId;
            const symbolLabel = formatSymbolLabel(item.symbol || "BTCUSDT");
            const isDeleting = deletingBacktestRunId === historyRunId;

            return (
              <div
                key={historyRunId}
                className={`w-full rounded-xl border px-4 py-3 text-left transition-colors ${
                  isSelected
                    ? "border-violet-400/60 bg-violet-500/10"
                    : "border-white/10 bg-white/[0.04] hover:bg-white/[0.08]"
                }`}
              >
                <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                  <button
                    type="button"
                    onClick={() => {
                      setBacktestResult(item);
                      window.requestAnimationFrame(() => {
                        resultRef.current?.scrollIntoView({
                          behavior: "smooth",
                          block: "start",
                        });
                      });
                    }}
                    className="flex-1 text-left"
                  >
                    <div>
                      <p className="font-medium text-white">
                        {symbolLabel}/USDT | {item.config?.timeframe || "n/a"}
                      </p>
                      <p className="mt-1 text-xs text-gray-400">
                        {new Date(
                          item.createdAt || item.savedAt,
                        ).toLocaleString()}
                      </p>
                      <p className="mt-1 text-xs text-gray-500">
                        {item.config?.startDate && item.config?.endDate
                          ? `${new Date(item.config.startDate).toLocaleDateString()} - ${new Date(item.config.endDate).toLocaleDateString()}`
                          : "Latest candles"}
                      </p>
                    </div>
                  </button>

                  <div className="flex items-start gap-3">
                    <div className="grid grid-cols-2 gap-3 text-sm md:grid-cols-5">
                      <div>
                        <p className="text-gray-500">Signals</p>
                        <p className="font-medium text-white">
                          {(item.summary?.totalSignals || 0).toLocaleString()}
                        </p>
                      </div>
                      <div>
                        <p className="text-gray-500">Win Rate</p>
                        <p className="font-medium text-green-400">
                          {(item.summary?.winRate || 0).toFixed(1)}%
                        </p>
                      </div>
                      <div>
                        <p className="text-gray-500">Avg Return</p>
                        <p
                          className={`font-medium ${
                            (item.summary?.avgReturnPct || 0) >= 0
                              ? "text-emerald-400"
                              : "text-red-400"
                          }`}
                        >
                          {(item.summary?.avgReturnPct || 0) >= 0 ? "+" : ""}
                          {(item.summary?.avgReturnPct || 0).toFixed(2)}%
                        </p>
                      </div>
                      <div>
                        <p className="text-gray-500">Trade Amount</p>
                        <p className="font-medium text-cyan-400">
                          {formatUsd(getTradeAmountUsd(item))}
                        </p>
                      </div>
                      <div>
                        <p className="text-gray-500">Leverage</p>
                        <p className="font-medium text-cyan-400">
                          {item.config?.leverage || 0}x
                        </p>
                      </div>
                    </div>

                    <button
                      type="button"
                      onClick={() => requestDeleteBacktestHistoryItem(item)}
                      disabled={isDeleting}
                      className="rounded-lg border border-red-400/30 bg-red-500/10 px-3 py-2 text-xs font-medium text-red-200 transition-colors hover:bg-red-500/20 disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      {isDeleting ? "Deleting..." : "Delete"}
                    </button>
                  </div>
                </div>
              </div>
            );
          })}

          {!backtestHistoryLoading && backtestHistory.length === 0 && (
            <div className="rounded-xl border border-white/10 bg-white/[0.04] px-4 py-6 text-sm text-gray-500">
              No saved backtests yet for {currentSymbolLabel}/USDT.
            </div>
          )}

          {hasMoreHistory && (
            <button
              type="button"
              onClick={() => setIsHistoryExpanded((current) => !current)}
              className="w-full rounded-xl border border-white/10 bg-white/[0.03] px-4 py-3 text-sm font-medium text-cyan-300 transition-colors hover:bg-white/[0.07] hover:text-cyan-200"
            >
              {isHistoryExpanded
                ? "Show fewer backtests"
                : `Show all ${backtestHistory.length} backtests`}
            </button>
          )}
        </div>
      </GlassCard>

      {backtestResult && (
        <div ref={resultRef} className="grid grid-cols-1 gap-6 xl:grid-cols-3">
          <GlassCard className="p-6 xl:col-span-2">
            <h2 className="mb-5 text-xl font-semibold text-white">
              Futures Backtest Summary
            </h2>
            <div className="grid grid-cols-2 gap-4 lg:grid-cols-5">
              {backtestSummaryCards.map((card) => (
                <div
                  key={card.label}
                  className="rounded-xl border border-white/10 bg-white/[0.04] p-4"
                >
                  <p className="mb-2 text-sm text-gray-400">{card.label}</p>
                  <p className={`text-2xl font-bold ${card.tone}`}>
                    {card.value}
                  </p>
                </div>
              ))}
            </div>
            <div className="mt-5 grid grid-cols-1 gap-4 md:grid-cols-2">
              {(backtestResult.summary.byType || []).map((item) => (
                <div
                  key={item.type}
                  className="rounded-xl border border-white/10 bg-white/[0.04] p-4"
                >
                  <div className="mb-2 flex items-center justify-between">
                    <p className="font-medium text-white">{item.type}</p>
                    <p className="text-sm text-gray-400">
                      {item.total} signals
                    </p>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-500">Win Rate</span>
                    <span className="text-green-400">
                      {item.winRate.toFixed(1)}%
                    </span>
                  </div>
                  <div className="mt-1 flex justify-between text-sm">
                    <span className="text-gray-500">Avg Leveraged Return</span>
                    <span
                      className={
                        item.avgReturnPct >= 0
                          ? "text-emerald-400"
                          : "text-red-400"
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
            <h2 className="mb-5 text-xl font-semibold text-white">
              Futures Backtest Outcomes
            </h2>
            <div className="space-y-4">
              {(backtestResult.summary.byOutcome || []).map((item) => (
                <div key={item.outcome}>
                  <div className="mb-1 flex justify-between text-sm">
                    <span className="text-gray-300">{item.outcome}</span>
                    <span className="text-gray-400">
                      {item.total} | {item.rate.toFixed(1)}%
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
            </div>
          </GlassCard>
        </div>
      )}

      {backtestResult && (
        <GlassCard className="p-6">
          <h2 className="mb-5 text-xl font-semibold text-white">
            Exit Breakdown
          </h2>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
            {(backtestResult.summary.byExitReason || []).map((item) => (
              <div
                key={item.exitReason}
                className="rounded-xl border border-white/10 bg-white/[0.04] p-4"
              >
                <p className="mb-2 text-sm text-gray-500">
                  {item.exitReason.replaceAll("_", " ")}
                </p>
                <p className="text-2xl font-bold text-white">{item.total}</p>
                <p className="mt-2 text-xs text-gray-400">
                  {item.rate.toFixed(1)}% of trades
                </p>
                <p className="mt-1 text-xs text-green-400">
                  {item.winRate.toFixed(1)}% win rate
                </p>
              </div>
            ))}
          </div>
        </GlassCard>
      )}

      {backtestResult && (
        <GlassCard className="p-6">
          <div className="mb-4">
            <h2 className="text-xl font-semibold text-white">
              Recent Simulated Futures Trades
            </h2>
            <p className="mt-1 text-sm text-gray-400">
              Sample results from the most recent backtested futures entries.
            </p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-white/10 text-left text-gray-400">
                  <th className="py-3 pr-4 font-medium">Opened</th>
                  <th className="py-3 pr-4 font-medium">Type</th>
                  <th className="py-3 pr-4 font-medium">Outcome</th>
                  <th className="py-3 pr-4 font-medium">Exit</th>
                  <th className="py-3 pr-4 font-medium">Entry</th>
                  <th className="py-3 pr-4 font-medium">Resolved</th>
                  <th className="py-3 pr-4 font-medium">Leverage</th>
                  <th className="py-3 pr-4 font-medium">PnL (USD)</th>
                  <th className="py-3 pr-4 font-medium">Return</th>
                  <th className="py-3 font-medium">Confidence</th>
                </tr>
              </thead>
              <tbody>
                {backtestTrades.map((trade) => {
                  const leveragedReturnPct = getLeveragedReturnPct(
                    trade.performance,
                  );
                  const tradeAmountUsd = getTradeAmountUsd(trade);
                  const tradePnlUsd = getTradePnlUsd(trade, tradeAmountUsd);

                  return (
                    <tr
                      key={`${trade.createdAt}-${trade.type}`}
                      className="border-b border-white/5"
                    >
                      <td className="py-3 pr-4 text-gray-300">
                        {new Date(trade.createdAt).toLocaleString()}
                      </td>
                      <td className="py-3 pr-4 font-medium text-white">
                        {trade.type}
                      </td>
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
                      <td className="py-3 pr-4 capitalize text-gray-300">
                        {(trade.simulation?.exitReason || "n/a").replaceAll(
                          "_",
                          " ",
                        )}
                      </td>
                      <td className="py-3 pr-4 text-gray-300">
                        ${trade.price.entry.toFixed(2)}
                      </td>
                      <td className="py-3 pr-4 text-gray-300">
                        ${trade.price.resolution.toFixed(2)}
                      </td>
                      <td className="py-3 pr-4 text-gray-300">
                        {trade.leverage}x
                      </td>
                      <td
                        className={`py-3 pr-4 font-medium ${
                          tradePnlUsd >= 0 ? "text-emerald-400" : "text-red-400"
                        }`}
                      >
                        {tradePnlUsd >= 0 ? "+" : ""}
                        {formatUsd(tradePnlUsd)}
                      </td>
                      <td
                        className={`py-3 pr-4 font-medium ${
                          leveragedReturnPct >= 0
                            ? "text-emerald-400"
                            : "text-red-400"
                        }`}
                      >
                        {leveragedReturnPct >= 0 ? "+" : ""}
                        {leveragedReturnPct.toFixed(2)}%
                      </td>
                      <td className="py-3 text-gray-300">{trade.confidence}%</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </GlassCard>
      )}

      {pendingDeleteBacktest && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 px-4 backdrop-blur-sm">
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="delete-backtest-title"
            className="w-full max-w-md rounded-2xl border border-red-400/20 bg-slate-900/95 p-6 shadow-2xl shadow-black/40"
          >
            <div className="mb-4 inline-flex rounded-full border border-red-400/25 bg-red-500/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.2em] text-red-200">
              Confirm Delete
            </div>
            <h3
              id="delete-backtest-title"
              className="text-xl font-semibold text-white"
            >
              Remove saved backtest?
            </h3>
            <p className="mt-3 text-sm leading-6 text-gray-300">
              This will permanently delete the saved{" "}
              <span className="font-medium text-white">
                {pendingDeleteSymbolLabel}/USDT
              </span>{" "}
              backtest for the{" "}
              <span className="font-medium text-white">
                {pendingDeleteTimeframe}
              </span>{" "}
              timeframe from your history.
            </p>
            <p className="mt-2 text-xs text-gray-500">
              You won&apos;t be able to open this run again after deletion.
            </p>

            <div className="mt-6 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
              <button
                type="button"
                onClick={closeDeleteBacktestDialog}
                disabled={Boolean(deletingBacktestRunId)}
                className="rounded-lg border border-white/15 bg-white/5 px-4 py-2 text-sm font-medium text-gray-200 transition-colors hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-60"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={deleteBacktestHistoryItem}
                disabled={deletingBacktestRunId === pendingDeleteBacktestRunId}
                className="rounded-lg border border-red-400/30 bg-red-500/90 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-red-500 disabled:cursor-not-allowed disabled:opacity-70"
              >
                {deletingBacktestRunId === pendingDeleteBacktestRunId
                  ? "Deleting..."
                  : "Delete Backtest"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Backtesting;
