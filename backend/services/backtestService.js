import {
  DEFAULT_FUTURES_LEVERAGE,
  calculateFuturesPerformance,
  generateSignal,
} from "./signalService.js";
import { getKlines, resolveToMarketSymbol } from "./marketService.js";

const SUPPORTED_TIMEFRAMES = new Set(["1m", "5m", "15m", "1h", "4h", "1d"]);

const toPositiveInt = (value, fallback) => {
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
};

const toBoundedInt = (value, fallback, min, max) => {
  const parsed = toPositiveInt(value, fallback);
  return Math.min(Math.max(parsed, min), max);
};

const evaluateDirectionalOutcome = (
  signalType,
  expectedDirection,
  entryPrice,
  resolutionPrice,
  leverage,
) => {
  const actualDirection =
    resolutionPrice > entryPrice
      ? "UP"
      : resolutionPrice < entryPrice
        ? "DOWN"
        : "NEUTRAL";

  let outcome = "NEUTRAL";
  if (expectedDirection === "UP" && actualDirection === "UP") {
    outcome = "WIN";
  } else if (expectedDirection === "DOWN" && actualDirection === "DOWN") {
    outcome = "WIN";
  } else if (expectedDirection === "NEUTRAL" || actualDirection === "NEUTRAL") {
    outcome = "NEUTRAL";
  } else {
    outcome = "LOSS";
  }

  const performance = calculateFuturesPerformance(
    signalType,
    entryPrice,
    resolutionPrice,
    leverage,
  );

  return {
    actualDirection,
    outcome,
    performance,
  };
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
    (trade) => trade.performance.leveragedReturnPct ?? trade.performance.priceChangePct ?? 0,
  );
  const avgUnderlyingMovePct = avg(
    trades,
    (trade) => trade.performance.marketPriceChangePct ?? 0,
  );
  const avgLeverage = avg(trades, (trade) => trade.leverage ?? DEFAULT_FUTURES_LEVERAGE);
  const avgConfidence = avg(trades, (trade) => trade.confidence);

  const byTypeMap = new Map();
  const byOutcomeMap = new Map();

  for (const trade of trades) {
    const typeBucket = byTypeMap.get(trade.type) || [];
    typeBucket.push(trade);
    byTypeMap.set(trade.type, typeBucket);

    const outcomeBucket = byOutcomeMap.get(trade.outcome) || [];
    outcomeBucket.push(trade);
    byOutcomeMap.set(trade.outcome, outcomeBucket);
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
        (trade) => trade.performance.leveragedReturnPct ?? trade.performance.priceChangePct ?? 0,
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
    byType,
    byOutcome,
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

  const limit = toBoundedInt(input.limit, 300, 60, 1000);
  const resolutionCandles = toBoundedInt(input.resolutionCandles, 1, 1, 50);
  const analysisWindow = toBoundedInt(input.analysisWindow, 210, 26, 300);
  const warmupCandles = Math.max(
    toBoundedInt(input.warmupCandles, analysisWindow, 26, 400),
    26,
  );
  const sampleSize = toBoundedInt(input.sampleSize, 20, 1, 100);
  const leverage = toBoundedInt(input.leverage, DEFAULT_FUTURES_LEVERAGE, 1, 125);

  const klineData = await getKlines(symbol, timeframe, limit);

  if (!klineData || klineData.length < warmupCandles + resolutionCandles + 1) {
    throw new Error(
      `Insufficient historical data. Need at least ${warmupCandles + resolutionCandles + 1} candles for this backtest configuration.`,
    );
  }

  const trades = [];
  let skippedHoldSignals = 0;
  const lastEligibleIndex = klineData.length - 1 - resolutionCandles;

  for (let currentIndex = warmupCandles - 1; currentIndex <= lastEligibleIndex; currentIndex++) {
    const startIndex = Math.max(0, currentIndex + 1 - analysisWindow);
    const analysisCandles = klineData.slice(startIndex, currentIndex + 1);

    const signal = generateSignal(symbol, analysisCandles, { timeframe, leverage });
    if (!signal) {
      continue;
    }

    if (signal.type === "HOLD") {
      skippedHoldSignals += 1;
      continue;
    }

    const resolutionCandle = klineData[currentIndex + resolutionCandles];
    const entryCandle = klineData[currentIndex];
    const evaluation = evaluateDirectionalOutcome(
      signal.type,
      signal.expectedDirection,
      signal.price.entry,
      resolutionCandle.close,
      signal.leverage,
    );

    trades.push({
      symbol,
      marketType: "FUTURES",
      leverage: signal.leverage,
      timeframe,
      type: signal.type,
      confidence: signal.confidence,
      expectedDirection: signal.expectedDirection,
      actualDirection: evaluation.actualDirection,
      outcome: evaluation.outcome,
      reasoning: signal.reasoning,
      createdAt: new Date(entryCandle.closeTime).toISOString(),
      resolvedAt: new Date(resolutionCandle.closeTime).toISOString(),
      price: {
        entry: signal.price.entry,
        resolution: resolutionCandle.close,
        target: signal.price.target,
        stopLoss: signal.price.stopLoss,
      },
      performance: {
        priceChange: Number(evaluation.performance.priceChange.toFixed(8)),
        priceChangePct: Number(evaluation.performance.leveragedReturnPct.toFixed(4)),
        marketPriceChangePct: Number(evaluation.performance.marketPriceChangePct.toFixed(4)),
        leveragedReturnPct: Number(evaluation.performance.leveragedReturnPct.toFixed(4)),
      },
      indicators: signal.indicators,
    });
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
    },
    dataset: {
      totalCandles: klineData.length,
      evaluatedSetups: Math.max(0, lastEligibleIndex - (warmupCandles - 1) + 1),
      skippedHoldSignals,
      firstCandleAt: new Date(klineData[0].openTime).toISOString(),
      lastCandleAt: new Date(klineData[klineData.length - 1].closeTime).toISOString(),
    },
    summary,
    recentTrades,
  };
};
