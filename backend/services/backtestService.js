import BacktestRun from "../models/BacktestRun.js";
import {
  DEFAULT_FUTURES_LEVERAGE,
  calculateFuturesPerformance,
  generateSignal,
  generateSignalWithMl,
} from "./signalService.js";
import { getKlines, resolveToMarketSymbol } from "./marketService.js";

const SUPPORTED_TIMEFRAMES = new Set(["1m", "5m", "15m", "1h", "4h", "1d"]);
const SUPPORTED_INTRABAR_POLICIES = new Set(["conservative", "optimistic"]);

const toPositiveInt = (value, fallback) => {
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
};

const toBoundedInt = (value, fallback, min, max) => {
  const parsed = toPositiveInt(value, fallback);
  return Math.min(Math.max(parsed, min), max);
};

const toPolicy = (value, fallback = "conservative") => {
  const normalized = value?.toString().trim().toLowerCase();
  return SUPPORTED_INTRABAR_POLICIES.has(normalized) ? normalized : fallback;
};

const toBacktestMlModel = (value) => {
  if (value === undefined || value === null || value === "") {
    return null;
  }

  const normalized = value.toString().trim();
  if (!normalized || normalized.toLowerCase() === "off") {
    return null;
  }

  return normalized;
};

const getActualDirection = (entryPrice, resolutionPrice) => {
  if (resolutionPrice > entryPrice) return "UP";
  if (resolutionPrice < entryPrice) return "DOWN";
  return "NEUTRAL";
};

const getDirectionalOutcome = (expectedDirection, actualDirection) => {
  if (expectedDirection === "NEUTRAL" || actualDirection === "NEUTRAL") {
    return "NEUTRAL";
  }

  return expectedDirection === actualDirection ? "WIN" : "LOSS";
};

const getExitReasonOutcome = (exitReason, expectedDirection, actualDirection) => {
  if (
    exitReason.startsWith("take_profit") ||
    exitReason === "signal_target_hit"
  ) {
    return "WIN";
  }

  if (
    exitReason.startsWith("stop_loss") ||
    exitReason === "signal_stop_loss_hit"
  ) {
    return "LOSS";
  }

  return getDirectionalOutcome(expectedDirection, actualDirection);
};

const toFixedNumber = (value, decimals = 4) => {
  return Number.isFinite(value) ? Number(value.toFixed(decimals)) : null;
};

const buildAggregateSummary = (trades) => {
  const totalSignals = trades.length;
  const wins = trades.filter((trade) => trade.outcome === "WIN").length;
  const losses = trades.filter((trade) => trade.outcome === "LOSS").length;
  const neutrals = trades.filter((trade) => trade.outcome === "NEUTRAL").length;

  const avg = (items, selector) => {
    if (items.length === 0) return 0;
    const total = items.reduce((sum, item) => sum + selector(item), 0);
    return total / items.length;
  };

  const avgReturnPct = avg(
    trades,
    (trade) =>
      trade.performance.leveragedReturnPct ?? trade.performance.priceChangePct ?? 0,
  );
  const avgUnderlyingMovePct = avg(
    trades,
    (trade) => trade.performance.marketPriceChangePct ?? 0,
  );
  const avgLeverage = avg(
    trades,
    (trade) => trade.leverage ?? DEFAULT_FUTURES_LEVERAGE,
  );
  const avgConfidence = avg(trades, (trade) => trade.confidence);
  const avgHoldingCandles = avg(
    trades,
    (trade) => trade.simulation?.holdingCandles ?? 0,
  );

  const byTypeMap = new Map();
  const byOutcomeMap = new Map();
  const byExitReasonMap = new Map();

  for (const trade of trades) {
    const typeBucket = byTypeMap.get(trade.type) || [];
    typeBucket.push(trade);
    byTypeMap.set(trade.type, typeBucket);

    const outcomeBucket = byOutcomeMap.get(trade.outcome) || [];
    outcomeBucket.push(trade);
    byOutcomeMap.set(trade.outcome, outcomeBucket);

    const exitReason = trade.simulation?.exitReason || "unknown";
    const exitReasonBucket = byExitReasonMap.get(exitReason) || [];
    exitReasonBucket.push(trade);
    byExitReasonMap.set(exitReason, exitReasonBucket);
  }

  const toRate = (count) =>
    totalSignals > 0 ? Number(((count / totalSignals) * 100).toFixed(2)) : 0;

  const byType = Array.from(byTypeMap.entries()).map(([type, typeTrades]) => ({
    type,
    total: typeTrades.length,
    winRate: toRate(typeTrades.filter((trade) => trade.outcome === "WIN").length),
    avgReturnPct: Number(
      avg(
        typeTrades,
        (trade) =>
          trade.performance.leveragedReturnPct ??
          trade.performance.priceChangePct ??
          0,
      ).toFixed(2),
    ),
  }));

  const byOutcome = Array.from(byOutcomeMap.entries()).map(
    ([outcome, outcomeTrades]) => ({
      outcome,
      total: outcomeTrades.length,
      rate: toRate(outcomeTrades.length),
    }),
  );

  const byExitReason = Array.from(byExitReasonMap.entries()).map(
    ([exitReason, exitTrades]) => ({
      exitReason,
      total: exitTrades.length,
      rate: toRate(exitTrades.length),
      winRate: toRate(exitTrades.filter((trade) => trade.outcome === "WIN").length),
    }),
  );

  return {
    totalSignals,
    wins,
    losses,
    neutrals,
    winRate: toRate(wins),
    lossRate: toRate(losses),
    neutralRate: toRate(neutrals),
    avgReturnPct: Number(avgReturnPct.toFixed(2)),
    avgUnderlyingMovePct: Number(avgUnderlyingMovePct.toFixed(2)),
    avgLeverage: Number(avgLeverage.toFixed(2)),
    avgConfidence: Number(avgConfidence.toFixed(2)),
    avgHoldingCandles: Number(avgHoldingCandles.toFixed(2)),
    byType,
    byOutcome,
    byExitReason,
    ...buildEquityMetrics(trades),
  };
};

const buildEquityMetrics = (trades) => {
  if (trades.length === 0) {
    return {
      totalReturnPct: 0,
      maxDrawdownPct: 0,
      profitFactor: 0,
      equityCurve: [],
    };
  }

  let cumulativePnl = 0;
  let peak = 0;
  let maxDrawdownPct = 0;
  let grossWins = 0;
  let grossLosses = 0;

  const equityCurve = trades.map((trade, index) => {
    const returnPct =
      trade.performance.leveragedReturnPct ??
      trade.performance.priceChangePct ??
      0;
    cumulativePnl += returnPct;

    if (cumulativePnl > peak) {
      peak = cumulativePnl;
    }

    const drawdown = peak - cumulativePnl;
    if (drawdown > maxDrawdownPct) {
      maxDrawdownPct = drawdown;
    }

    if (returnPct > 0) grossWins += returnPct;
    if (returnPct < 0) grossLosses += Math.abs(returnPct);

    return {
      tradeIndex: index + 1,
      cumulativePnlPct: toFixedNumber(cumulativePnl, 4),
      drawdownPct: toFixedNumber(drawdown, 4),
    };
  });

  const profitFactor =
    grossLosses > 0
      ? grossWins / grossLosses
      : grossWins > 0
        ? Infinity
        : 0;

  return {
    totalReturnPct: toFixedNumber(cumulativePnl, 4),
    maxDrawdownPct: toFixedNumber(maxDrawdownPct, 4),
    profitFactor: Number.isFinite(profitFactor)
      ? toFixedNumber(profitFactor, 4)
      : null,
    equityCurve,
  };
};

const getSignalPriceTargets = (signal) => {
  const targetPrice = Number(signal?.price?.target);
  const stopLossPrice = Number(signal?.price?.stopLoss);

  return {
    targetPrice: Number.isFinite(targetPrice) ? targetPrice : null,
    stopLossPrice: Number.isFinite(stopLossPrice) ? stopLossPrice : null,
  };
};

const resolveGapExit = (signalType, candle, targetPrice, stopLossPrice) => {
  const openPrice = Number(candle.open);
  if (!Number.isFinite(openPrice)) {
    return null;
  }

  if (signalType === "BUY") {
    if (Number.isFinite(stopLossPrice) && openPrice <= stopLossPrice) {
      return {
        exitReason: "stop_loss_gap",
        resolutionPrice: openPrice,
        resolutionMode: "gap_open",
      };
    }

    if (Number.isFinite(targetPrice) && openPrice >= targetPrice) {
      return {
        exitReason: "take_profit_gap",
        resolutionPrice: openPrice,
        resolutionMode: "gap_open",
      };
    }
  }

  if (signalType === "SELL") {
    if (Number.isFinite(stopLossPrice) && openPrice >= stopLossPrice) {
      return {
        exitReason: "stop_loss_gap",
        resolutionPrice: openPrice,
        resolutionMode: "gap_open",
      };
    }

    if (Number.isFinite(targetPrice) && openPrice <= targetPrice) {
      return {
        exitReason: "take_profit_gap",
        resolutionPrice: openPrice,
        resolutionMode: "gap_open",
      };
    }
  }

  return null;
};

const resolveIntrabarExit = (
  signalType,
  candle,
  targetPrice,
  stopLossPrice,
  intrabarPolicy,
) => {
  const high = Number(candle.high);
  const low = Number(candle.low);

  if (!Number.isFinite(high) || !Number.isFinite(low)) {
    return null;
  }

  let targetHit = false;
  let stopHit = false;

  if (signalType === "BUY") {
    targetHit = Number.isFinite(targetPrice) && high >= targetPrice;
    stopHit = Number.isFinite(stopLossPrice) && low <= stopLossPrice;
  } else if (signalType === "SELL") {
    targetHit = Number.isFinite(targetPrice) && low <= targetPrice;
    stopHit = Number.isFinite(stopLossPrice) && high >= stopLossPrice;
  }

  if (!targetHit && !stopHit) {
    return null;
  }

  if (targetHit && stopHit) {
    const takeProfitFirst = intrabarPolicy === "optimistic";
    return {
      exitReason: takeProfitFirst ? "take_profit_intrabar" : "stop_loss_intrabar",
      resolutionPrice: takeProfitFirst ? targetPrice : stopLossPrice,
      resolutionMode: "intrabar_dual_hit",
      targetHit: true,
      stopHit: true,
    };
  }

  if (targetHit) {
    return {
      exitReason: "take_profit_intrabar",
      resolutionPrice: targetPrice,
      resolutionMode: "intrabar",
      targetHit: true,
      stopHit: false,
    };
  }

  return {
    exitReason: "stop_loss_intrabar",
    resolutionPrice: stopLossPrice,
    resolutionMode: "intrabar",
    targetHit: false,
    stopHit: true,
  };
};

const simulateTradeResolution = (
  signal,
  futureCandles,
  resolutionCandles,
  intrabarPolicy,
) => {
  const { targetPrice, stopLossPrice } = getSignalPriceTargets(signal);

  for (
    let offset = 0;
    offset < futureCandles.length && offset < resolutionCandles;
    offset += 1
  ) {
    const candle = futureCandles[offset];

    const gapResolution = resolveGapExit(
      signal.type,
      candle,
      targetPrice,
      stopLossPrice,
    );
    if (gapResolution) {
      return {
        ...gapResolution,
        resolvedAt: new Date(candle.openTime).toISOString(),
        resolvedCandle: candle,
        holdingCandles: offset + 1,
      };
    }

    const intrabarResolution = resolveIntrabarExit(
      signal.type,
      candle,
      targetPrice,
      stopLossPrice,
      intrabarPolicy,
    );
    if (intrabarResolution) {
      return {
        ...intrabarResolution,
        resolvedAt: new Date(candle.closeTime).toISOString(),
        resolvedCandle: candle,
        holdingCandles: offset + 1,
      };
    }
  }

  const expiryCandle =
    futureCandles[Math.min(resolutionCandles, futureCandles.length) - 1];
  if (!expiryCandle) {
    return null;
  }

  return {
    exitReason: "time_expiry",
    resolutionPrice: Number(expiryCandle.close),
    resolutionMode: "time_expiry",
    resolvedAt: new Date(expiryCandle.closeTime).toISOString(),
    resolvedCandle: expiryCandle,
    holdingCandles: Math.min(resolutionCandles, futureCandles.length),
    targetHit: false,
    stopHit: false,
  };
};

const buildTradeResult = (
  symbol,
  timeframe,
  signal,
  entryCandle,
  simulatedResolution,
  intrabarPolicy,
) => {
  const actualDirection = getActualDirection(
    signal.price.entry,
    simulatedResolution.resolutionPrice,
  );
  const outcome = getExitReasonOutcome(
    simulatedResolution.exitReason,
    signal.expectedDirection,
    actualDirection,
  );
  const performance = calculateFuturesPerformance(
    signal.type,
    signal.price.entry,
    simulatedResolution.resolutionPrice,
    signal.leverage,
  );

  return {
    symbol,
    marketType: "FUTURES",
    leverage: signal.leverage,
    timeframe,
    type: signal.type,
    confidence: signal.confidence,
    expectedDirection: signal.expectedDirection,
    actualDirection,
    outcome,
    reasoning: signal.reasoning,
    createdAt: new Date(entryCandle.closeTime).toISOString(),
    resolvedAt: simulatedResolution.resolvedAt,
    price: {
      entry: signal.price.entry,
      resolution: simulatedResolution.resolutionPrice,
      target: signal.price.target,
      stopLoss: signal.price.stopLoss,
    },
    performance: {
      priceChange: toFixedNumber(performance.priceChange, 8),
      priceChangePct: toFixedNumber(performance.leveragedReturnPct, 4),
      marketPriceChangePct: toFixedNumber(performance.marketPriceChangePct, 4),
      leveragedReturnPct: toFixedNumber(performance.leveragedReturnPct, 4),
    },
    indicators: signal.indicators,
    scoring: signal.scoring || null,
    features: signal.features,
    simulation: {
      exitReason: simulatedResolution.exitReason,
      resolutionMode: simulatedResolution.resolutionMode,
      intrabarPolicy,
      holdingCandles: simulatedResolution.holdingCandles,
      targetHit: simulatedResolution.targetHit ?? false,
      stopLossHit: simulatedResolution.stopHit ?? false,
      resolvedCandleTime: simulatedResolution.resolvedCandle
        ? new Date(simulatedResolution.resolvedCandle.closeTime).toISOString()
        : simulatedResolution.resolvedAt,
    },
  };
};

export const runSignalBacktest = async (input = {}) => {
  const rawSymbol = input.symbol?.toString().trim();
  if (!rawSymbol) {
    throw new Error("Symbol is required");
  }

  const symbol = await resolveToMarketSymbol(rawSymbol);
  if (!symbol) {
    throw new Error(`Unsupported or unknown symbol: ${rawSymbol}`);
  }

  const timeframe = input.timeframe || "1h";
  if (!SUPPORTED_TIMEFRAMES.has(timeframe)) {
    throw new Error(`Unsupported timeframe: ${timeframe}`);
  }

  const defaultResolutionCandles = {
    "1m": 10, "5m": 8, "15m": 6, "1h": 5, "4h": 3, "1d": 3,
  };

  const limit = toBoundedInt(input.limit, 300, 60, 1000);
  const resolutionCandles = toBoundedInt(
    input.resolutionCandles,
    defaultResolutionCandles[timeframe] || 5,
    1,
    50,
  );
  const analysisWindow = toBoundedInt(input.analysisWindow, 210, 26, 300);
  const warmupCandles = Math.max(
    toBoundedInt(input.warmupCandles, analysisWindow, 26, 400),
    26,
  );
  const sampleSize = toBoundedInt(input.sampleSize, 20, 1, 100);
  const leverage = toBoundedInt(
    input.leverage,
    DEFAULT_FUTURES_LEVERAGE,
    1,
    125,
  );
  const cooldownCandles = toBoundedInt(
    input.cooldownCandles,
    resolutionCandles,
    0,
    100,
  );
  const intrabarPolicy = toPolicy(input.intrabarPolicy, "conservative");
  const backtestMlModel = toBacktestMlModel(input.backtestMlModel);

  const klineData = await getKlines(symbol, timeframe, limit);

  if (!klineData || klineData.length < warmupCandles + resolutionCandles + 1) {
    throw new Error(
      `Insufficient historical data. Need at least ${
        warmupCandles + resolutionCandles + 1
      } candles for this backtest configuration.`,
    );
  }

  const trades = [];
  let skippedHoldSignals = 0;
  let cooldownUntilIndex = -1;
  const lastEligibleIndex = klineData.length - 1 - resolutionCandles;

  for (
    let currentIndex = warmupCandles - 1;
    currentIndex <= lastEligibleIndex;
    currentIndex += 1
  ) {
    // Skip candles still in cooldown from previous trade
    if (currentIndex < cooldownUntilIndex) {
      continue;
    }

    const startIndex = Math.max(0, currentIndex + 1 - analysisWindow);
    const analysisCandles = klineData.slice(startIndex, currentIndex + 1);

    const signalOptions = {
      timeframe,
      leverage,
      atrTargetMultiplier: input.atrTargetMultiplier,
      atrStopMultiplier: input.atrStopMultiplier,
    };
    const signal = backtestMlModel
      ? await generateSignalWithMl(symbol, analysisCandles, {
          ...signalOptions,
          mlModelVersion: backtestMlModel,
        })
      : await generateSignal(symbol, analysisCandles, signalOptions);
    if (!signal) {
      continue;
    }

    if (signal.type === "HOLD") {
      skippedHoldSignals += 1;
      continue;
    }

    const entryCandle = klineData[currentIndex];
    const futureCandles = klineData.slice(
      currentIndex + 1,
      currentIndex + 1 + resolutionCandles,
    );
    const simulatedResolution = simulateTradeResolution(
      signal,
      futureCandles,
      resolutionCandles,
      intrabarPolicy,
    );

    if (!simulatedResolution) {
      continue;
    }

    trades.push(
      buildTradeResult(
        symbol,
        timeframe,
        signal,
        entryCandle,
        simulatedResolution,
        intrabarPolicy,
      ),
    );

    // Apply cooldown — skip ahead to avoid overlapping trades
    cooldownUntilIndex = currentIndex + 1 + cooldownCandles;
  }

  const summary = buildAggregateSummary(trades);
  const recentTrades = trades.slice(-sampleSize).reverse();

  return {
    config: {
      symbol,
      timeframe,
      limit,
      analysisWindow,
      warmupCandles,
      resolutionCandles,
      sampleSize,
      leverage,
      cooldownCandles,
      intrabarPolicy,
      mlModel: backtestMlModel || "off",
      mlEnabled: Boolean(backtestMlModel),
      simulationModel: "tp_sl_intrabar_v1",
    },
    dataset: {
      totalCandles: klineData.length,
      evaluatedSetups: Math.max(0, lastEligibleIndex - (warmupCandles - 1) + 1),
      skippedHoldSignals,
      firstCandleAt: new Date(klineData[0].openTime).toISOString(),
      lastCandleAt: new Date(
        klineData[klineData.length - 1].closeTime,
      ).toISOString(),
    },
    summary,
    trades,
    recentTrades,
  };
};

export const saveSignalBacktest = async (result, userId) => {
  if (!result || !userId) {
    throw new Error("Backtest result and userId are required");
  }

  return BacktestRun.create({
    userId,
    symbol: result.config.symbol,
    marketType: "FUTURES",
    config: result.config,
    dataset: result.dataset,
    summary: result.summary,
    trades: result.trades,
    recentTrades: result.recentTrades,
  });
};
