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
const MAX_RANGE_KLINES = 5000;
const DEFAULT_TRADE_AMOUNT_USD = 10;

const toPositiveInt = (value, fallback) => {
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
};

const toBoundedInt = (value, fallback, min, max) => {
  const parsed = toPositiveInt(value, fallback);
  return Math.min(Math.max(parsed, min), max);
};

const toBoundedNumber = (value, fallback, min, max) => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(Math.max(parsed, min), max);
};

const toPolicy = (value, fallback = "conservative") => {
  const normalized = value?.toString().trim().toLowerCase();
  return SUPPORTED_INTRABAR_POLICIES.has(normalized) ? normalized : fallback;
};

const toBacktestMlModel = (value) => {
  if (value === undefined || value === null || value === "") return null;
  const normalized = value.toString().trim();
  if (!normalized || normalized.toLowerCase() === "off") return null;
  return normalized;
};

const toBoolean = (value, fallback = false) => {
  if (value === undefined || value === null || value === "") return fallback;
  if (typeof value === "boolean") return value;
  const normalized = value.toString().trim().toLowerCase();
  if (["true", "1", "yes", "on"].includes(normalized)) return true;
  if (["false", "0", "no", "off"].includes(normalized)) return false;
  return fallback;
};

const parseDateInput = (value, fieldName) => {
  if (value === undefined || value === null || value === "") {
    return null;
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    throw new Error(`Invalid ${fieldName}`);
  }

  return parsed;
};

const getUtcDayBounds = (date, boundary = "start") => {
  if (!(date instanceof Date)) {
    return null;
  }

  if (boundary === "end") {
    return new Date(
      Date.UTC(
        date.getUTCFullYear(),
        date.getUTCMonth(),
        date.getUTCDate(),
        23,
        59,
        59,
        999,
      ),
    );
  }

  return new Date(
    Date.UTC(
      date.getUTCFullYear(),
      date.getUTCMonth(),
      date.getUTCDate(),
      0,
      0,
      0,
      0,
    ),
  );
};

const getActualDirection = (entryPrice, resolutionPrice) => {
  if (resolutionPrice > entryPrice) return "UP";
  if (resolutionPrice < entryPrice) return "DOWN";
  return "NEUTRAL";
};

const getDirectionalOutcome = (expectedDirection, actualDirection) => {
  if (expectedDirection === "NEUTRAL" || actualDirection === "NEUTRAL")
    return "NEUTRAL";
  return expectedDirection === actualDirection ? "WIN" : "LOSS";
};

const getExitReasonOutcome = (
  exitReason,
  expectedDirection,
  actualDirection,
) => {
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

const getTradeMarginUsd = (trade) => {
  const explicitAmount = Number(
    trade?.position?.tradeAmountUsd ?? trade?.config?.tradeAmountUsd,
  );
  return explicitAmount > 0 ? explicitAmount : DEFAULT_TRADE_AMOUNT_USD;
};

/**
 * Build the aggregate summary and risk-adjusted metrics for a set of trades.
 *
 * FIX: Equity curve now uses compounding (equity *= 1 + return) instead of
 * simple summation. Simple addition dramatically misrepresents multi-trade
 * P&L (e.g. +50% then -50% = 0% simple vs -25% compounded).
 *
 * FIX: Max drawdown is now computed as a percentage drawdown from the equity
 * peak (peak - equity) / peak, which is the standard definition.
 *
 * NEW: Added Sharpe ratio (per-trade, non-annualized), Calmar ratio
 * (totalReturn / maxDrawdown), and win/loss ratio (avgWin / avgLoss).
 */
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
      trade.performance.netLeveragedReturnPct ??
      trade.performance.leveragedReturnPct ??
      0,
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
  const totalPnlUsd = trades.reduce(
    (sum, trade) => sum + (trade.position?.pnlUsd ?? 0),
    0,
  );
  const avgPnlUsd = avg(trades, (trade) => trade.position?.pnlUsd ?? 0);
  const bestTradePnlUsd = trades.reduce(
    (best, trade) => Math.max(best, trade.position?.pnlUsd ?? -Infinity),
    -Infinity,
  );
  const worstTradePnlUsd = trades.reduce(
    (worst, trade) => Math.min(worst, trade.position?.pnlUsd ?? Infinity),
    Infinity,
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
    winRate: toRate(
      typeTrades.filter((trade) => trade.outcome === "WIN").length,
    ),
    avgReturnPct: Number(
      avg(
        typeTrades,
        (trade) =>
          trade.performance.netLeveragedReturnPct ??
          trade.performance.leveragedReturnPct ??
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
      winRate: toRate(
        exitTrades.filter((trade) => trade.outcome === "WIN").length,
      ),
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
    tradeAmountUsd: toFixedNumber(getTradeMarginUsd(trades[0]), 2),
    totalPnlUsd: toFixedNumber(totalPnlUsd, 2),
    avgPnlUsd: toFixedNumber(avgPnlUsd, 2),
    bestTradePnlUsd: Number.isFinite(bestTradePnlUsd)
      ? toFixedNumber(bestTradePnlUsd, 2)
      : 0,
    worstTradePnlUsd: Number.isFinite(worstTradePnlUsd)
      ? toFixedNumber(worstTradePnlUsd, 2)
      : 0,
    byType,
    byOutcome,
    byExitReason,
    ...buildEquityMetrics(trades),
  };
};

/**
 * Compute equity curve and risk-adjusted performance metrics.
 *
 * Uses net returns (after fees) from trade.performance.netLeveragedReturnPct.
 * Falls back to leveragedReturnPct if net is unavailable (e.g. older records).
 */
const buildEquityMetrics = (trades) => {
  if (trades.length === 0) {
    return {
      totalReturnPct: 0,
      maxDrawdownPct: 0,
      profitFactor: 0,
      sharpeRatio: null,
      calmarRatio: null,
      winLossRatio: null,
      equityCurve: [],
    };
  }

  // Compounding equity tracking (starts at 1.0 = 100% of initial margin)
  let equity = 1.0;
  let peak = 1.0;
  let maxDrawdownPct = 0;
  let grossWins = 0;
  let grossLosses = 0;

  const returns = [];

  const equityCurve = trades.map((trade, index) => {
    const returnPct =
      trade.performance.netLeveragedReturnPct ??
      trade.performance.leveragedReturnPct ??
      0;

    returns.push(returnPct);

    // Compound the return: equity grows/shrinks multiplicatively
    equity = equity * (1 + returnPct / 100);

    if (equity > peak) {
      peak = equity;
    }

    // Drawdown as percentage from equity peak — the standard definition
    const drawdownPct = peak > 0 ? ((peak - equity) / peak) * 100 : 0;
    if (drawdownPct > maxDrawdownPct) {
      maxDrawdownPct = drawdownPct;
    }

    if (returnPct > 0) grossWins += returnPct;
    if (returnPct < 0) grossLosses += Math.abs(returnPct);

    return {
      tradeIndex: index + 1,
      cumulativeReturnPct: toFixedNumber((equity - 1) * 100, 4),
      drawdownPct: toFixedNumber(drawdownPct, 4),
    };
  });

  const totalReturnPct = (equity - 1) * 100;

  const profitFactor =
    grossLosses > 0 ? grossWins / grossLosses : grossWins > 0 ? Infinity : 0;

  // Sharpe ratio (per-trade, not annualized)
  // Annualize externally if needed: sharpe * sqrt(trades_per_year)
  const meanReturn = returns.reduce((a, b) => a + b, 0) / returns.length;
  const variance =
    returns.reduce((sum, r) => sum + Math.pow(r - meanReturn, 2), 0) /
    returns.length;
  const stdDev = Math.sqrt(variance);
  const sharpeRatio = stdDev > 0 ? toFixedNumber(meanReturn / stdDev, 4) : null;

  // Calmar ratio: total return / max drawdown
  const calmarRatio =
    maxDrawdownPct > 0
      ? toFixedNumber(totalReturnPct / maxDrawdownPct, 4)
      : null;

  // Win/loss ratio: average winning return / average losing return magnitude
  const winReturns = returns.filter((r) => r > 0);
  const lossReturns = returns.filter((r) => r < 0).map(Math.abs);
  const avgWin =
    winReturns.length > 0
      ? winReturns.reduce((a, b) => a + b, 0) / winReturns.length
      : 0;
  const avgLoss =
    lossReturns.length > 0
      ? lossReturns.reduce((a, b) => a + b, 0) / lossReturns.length
      : 0;
  const winLossRatio = avgLoss > 0 ? toFixedNumber(avgWin / avgLoss, 4) : null;

  return {
    totalReturnPct: toFixedNumber(totalReturnPct, 4),
    maxDrawdownPct: toFixedNumber(maxDrawdownPct, 4),
    profitFactor: Number.isFinite(profitFactor)
      ? toFixedNumber(profitFactor, 4)
      : null,
    sharpeRatio,
    calmarRatio,
    winLossRatio,
    avgWinPct: toFixedNumber(avgWin, 4),
    avgLossPct: toFixedNumber(avgLoss, 4),
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
  if (!Number.isFinite(openPrice)) return null;

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
  if (!Number.isFinite(high) || !Number.isFinite(low)) return null;

  let targetHit = false;
  let stopHit = false;

  if (signalType === "BUY") {
    targetHit = Number.isFinite(targetPrice) && high >= targetPrice;
    stopHit = Number.isFinite(stopLossPrice) && low <= stopLossPrice;
  } else if (signalType === "SELL") {
    targetHit = Number.isFinite(targetPrice) && low <= targetPrice;
    stopHit = Number.isFinite(stopLossPrice) && high >= stopLossPrice;
  }

  if (!targetHit && !stopHit) return null;

  if (targetHit && stopHit) {
    // Both hit within same candle — order is unknowable from OHLC.
    // "optimistic" assumes TP first, "conservative" (default) assumes SL first.
    const takeProfitFirst = intrabarPolicy === "optimistic";
    return {
      exitReason: takeProfitFirst
        ? "take_profit_intrabar"
        : "stop_loss_intrabar",
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
  if (!expiryCandle) return null;

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

/**
 * Build a single trade result record.
 *
 * FIX: Added fee deduction via feesPerTradePct. Exchange fees are charged on the
 * position notional (not margin), so the margin impact = fee% × leverage.
 * e.g. 0.04% round-trip fee at 10x leverage = 0.4% deducted from leveraged return.
 *
 * The original gross return is preserved as leveragedReturnPct; the net
 * (after fees) is stored as netLeveragedReturnPct for equity curve calculations.
 */
const buildTradeResult = (
  symbol,
  timeframe,
  signal,
  entryCandle,
  simulatedResolution,
  intrabarPolicy,
  feesPerTradePct,
  tradeAmountUsd,
  slippagePct = 0.05,
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

  // Fee impact on margin = round-trip fee rate × leverage
  const feeImpactPct =
    feesPerTradePct * (signal.leverage ?? DEFAULT_FUTURES_LEVERAGE);
  // Slippage impact = slippage rate × leverage (same scaling as fees)
  const slippageImpactPct =
    slippagePct * (signal.leverage ?? DEFAULT_FUTURES_LEVERAGE);
  const netLeveragedReturnPct = toFixedNumber(
    Math.max(
      performance.leveragedReturnPct - feeImpactPct - slippageImpactPct,
      -100,
    ),
    4,
  );
  const safeTradeAmountUsd = toFixedNumber(
    toBoundedNumber(tradeAmountUsd, DEFAULT_TRADE_AMOUNT_USD, 1, 1_000_000),
    2,
  );
  const leverage = signal.leverage ?? DEFAULT_FUTURES_LEVERAGE;
  const positionNotionalUsd = toFixedNumber(safeTradeAmountUsd * leverage, 2);
  const pnlUsd = toFixedNumber(
    safeTradeAmountUsd * (netLeveragedReturnPct / 100),
    2,
  );

  return {
    symbol,
    marketType: "FUTURES",
    leverage,
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
      priceChangePct: toFixedNumber(performance.directionalReturnPct, 4),
      marketPriceChangePct: toFixedNumber(performance.marketPriceChangePct, 4),
      leveragedReturnPct: toFixedNumber(performance.leveragedReturnPct, 4),
      feeImpactPct: toFixedNumber(feeImpactPct, 4),
      slippageImpactPct: toFixedNumber(slippageImpactPct, 4),
      netLeveragedReturnPct,
    },
    position: {
      tradeAmountUsd: safeTradeAmountUsd,
      positionNotionalUsd,
      pnlUsd,
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

/**
 * Run a walk-forward signal backtest over historical kline data.
 *
 * Key parameters:
 *  - limit: total candles to fetch (60-1000)
 *  - analysisWindow: candles fed to the signal engine per step (26-300)
 *  - warmupCandles: minimum candles before first signal attempt (≥ analysisWindow)
 *  - resolutionCandles: candles to look ahead for TP/SL/expiry (1-50)
 *  - cooldownCandles: candles to skip after a trade to avoid overlap (0-100)
 *  - feesPerTradePct: round-trip exchange fee as % of position notional (default 0.04%)
 *  - intrabarPolicy: "conservative" (SL first on dual hit) | "optimistic" (TP first)
 *  - backtestMlModel: model version string, or null/"off" to disable ML layer
 */
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
    "1m": 10,
    "5m": 8,
    "15m": 6,
    "1h": 5,
    "4h": 3,
    "1d": 3,
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
  const tradeAmountUsd = toBoundedNumber(
    input.tradeAmountUsd,
    DEFAULT_TRADE_AMOUNT_USD,
    1,
    1_000_000,
  );
  const cooldownCandles = toBoundedInt(
    input.cooldownCandles,
    resolutionCandles,
    0,
    100,
  );
  const intrabarPolicy = toPolicy(input.intrabarPolicy, "conservative");
  const backtestMlModel = toBacktestMlModel(input.backtestMlModel);
  const applyAccuracyGuardrails = toBoolean(
    input.applyAccuracyGuardrails,
    Boolean(backtestMlModel),
  );
  const parsedStartDate = parseDateInput(input.startDate, "start date");
  const parsedEndDate = parseDateInput(input.endDate, "end date");
  const startDate = getUtcDayBounds(parsedStartDate, "start");
  const endDate = getUtcDayBounds(parsedEndDate, "end");

  if ((startDate && !endDate) || (!startDate && endDate)) {
    throw new Error("Start date and end date must both be provided");
  }

  if (startDate && endDate && startDate > endDate) {
    throw new Error("Start date must be on or before end date");
  }

  // Round-trip fee as % of notional (0.04% = 0.02% entry + 0.02% exit, Binance Futures typical)
  // At 10x leverage this equals 0.4% deducted from the leveraged return per trade.
  const feesPerTradePct = toBoundedNumber(input.feesPerTradePct, 0.04, 0, 1);
  // Slippage: estimated price impact from market orders and liquidity gaps
  // Default 0.05% is typical for liquid crypto futures (BTC, ETH).
  const slippagePct = toBoundedNumber(input.slippagePct, 0.05, 0, 1);
  const atrTargetMultiplier = toBoundedNumber(
    input.atrTargetMultiplier,
    3,
    0.1,
    20,
  );
  const atrStopMultiplier = toBoundedNumber(
    input.atrStopMultiplier,
    1.5,
    0.1,
    20,
  );

  const klineRequest = startDate && endDate
    ? {
        limit: MAX_RANGE_KLINES,
        startTime: startDate.getTime(),
        endTime: endDate.getTime(),
      }
    : limit;

  const klineData = await getKlines(symbol, timeframe, klineRequest);

  if (
    startDate &&
    endDate &&
    klineData.length === MAX_RANGE_KLINES &&
    klineData[klineData.length - 1]?.closeTime < endDate.getTime()
  ) {
    throw new Error(
      "Selected date range is too large for one backtest request. Please choose a shorter range.",
    );
  }

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
    if (currentIndex < cooldownUntilIndex) {
      continue;
    }

    const startIndex = Math.max(0, currentIndex + 1 - analysisWindow);
    const analysisCandles = klineData.slice(startIndex, currentIndex + 1);

    const signalOptions = {
      timeframe,
      leverage,
      atrTargetMultiplier,
      atrStopMultiplier,
      enableRegimeWeights: Boolean(backtestMlModel),
    };

    const signal = backtestMlModel
      ? await generateSignalWithMl(symbol, analysisCandles, {
          ...signalOptions,
          mlModelVersion: backtestMlModel,
          applyAccuracyGuardrails,
        })
      : await generateSignal(symbol, analysisCandles, signalOptions);

    if (!signal) continue;

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

    if (!simulatedResolution) continue;

    trades.push(
      buildTradeResult(
        symbol,
        timeframe,
        signal,
        entryCandle,
        simulatedResolution,
        intrabarPolicy,
        feesPerTradePct,
        tradeAmountUsd,
        slippagePct,
      ),
    );

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
      tradeAmountUsd: toFixedNumber(tradeAmountUsd, 2),
      atrTargetMultiplier,
      atrStopMultiplier,
      startDate: startDate ? startDate.toISOString() : null,
      endDate: endDate ? endDate.toISOString() : null,
      cooldownCandles,
      intrabarPolicy,
      feesPerTradePct,
      slippagePct,
      mlModel: backtestMlModel || "off",
      mlEnabled: Boolean(backtestMlModel),
      applyAccuracyGuardrails: Boolean(backtestMlModel)
        ? applyAccuracyGuardrails
        : false,
      simulationModel: "tp_sl_intrabar_v2",
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
