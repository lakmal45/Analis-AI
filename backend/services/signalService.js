/**
 * Signal Generation Service
 * Generates BUY/SELL/HOLD signals based on technical indicators
 */

import Signal from "../models/Signal.js";
import {
  calculateSMA,
  calculateRSI,
  calculateMACD,
  calculateEMA,
} from "./indicatorService.js";
import {
  buildMlFeatureSnapshotWithFallback,
  calculateATRValue,
} from "./mlFeatureService.js";
import { predictSignalWinProbability } from "./mlInferenceService.js";
import { getPrice } from "./marketService.js";

let signalResolutionInterval = null;
let isResolvingSignals = false;
export const DEFAULT_FUTURES_LEVERAGE = 10;
const DEFAULT_FEATURE_VERSION = "v1";
const RULE_CONFIDENCE_WEIGHT = Number(process.env.ML_RULE_CONFIDENCE_WEIGHT || 0.35);
const ML_PROBABILITY_WEIGHT = Number(process.env.ML_PROBABILITY_WEIGHT || 0.65);
const MIN_DIRECTIONAL_RULE_CONFIDENCE = Number(
  process.env.MIN_DIRECTIONAL_RULE_CONFIDENCE || 68,
);
const MIN_DIRECTIONAL_SCORE_GAP = Number(
  process.env.MIN_DIRECTIONAL_SCORE_GAP || 1.5,
);
const MIN_ML_PROBABILITY = Number(process.env.MIN_ML_PROBABILITY || 0.6);
const MIN_MODEL_ROC_AUC = Number(process.env.MIN_MODEL_ROC_AUC || 0.58);
const MIN_MODEL_DATASET_ROWS = Number(process.env.MIN_MODEL_DATASET_ROWS || 400);
const REQUIRE_HEALTHY_ML_FOR_DIRECTIONAL_SIGNALS =
  process.env.REQUIRE_HEALTHY_ML_FOR_DIRECTIONAL_SIGNALS !== "false";

const getExpectedDirection = (signalType) => {
  if (signalType === "BUY") return "UP";
  if (signalType === "SELL") return "DOWN";
  return "NEUTRAL";
};

const getActualDirection = (entryPrice, resolutionPrice) => {
  if (resolutionPrice > entryPrice) return "UP";
  if (resolutionPrice < entryPrice) return "DOWN";
  return "NEUTRAL";
};

const getOutcomeFromDirections = (expectedDirection, actualDirection, status) => {
  if (status === "CANCELLED") {
    return "CANCELLED";
  }

  if (expectedDirection === "NEUTRAL" || actualDirection === "NEUTRAL") {
    return "NEUTRAL";
  }

  return expectedDirection === actualDirection ? "WIN" : "LOSS";
};

const normalizeLeverage = (value, fallback = DEFAULT_FUTURES_LEVERAGE) => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    return fallback;
  }

  return Math.min(Math.max(parsed, 1), 125);
};

const clamp = (value, min, max) => Math.min(Math.max(value, min), max);

const calculateFinalConfidence = (ruleConfidence, probability) => {
  if (!Number.isFinite(probability)) {
    return clamp(Math.round(ruleConfidence), 0, 100);
  }

  const blended =
    ruleConfidence * RULE_CONFIDENCE_WEIGHT +
    probability * 100 * ML_PROBABILITY_WEIGHT;

  return clamp(Math.round(blended), 0, 100);
};

const toFiniteNumber = (value) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};

const buildAccuracyGuardrailDecision = (signalData, prediction) => {
  if (!signalData || signalData.type === "HOLD") {
    return {
      shouldAbstain: false,
      reasons: [],
      ruleConfidence: toFiniteNumber(
        signalData?.ml?.ruleConfidence ?? signalData?.confidence ?? 0,
      ) ?? 0,
    };
  }

  const reasons = [];
  const ruleConfidence =
    toFiniteNumber(signalData.ml?.ruleConfidence ?? signalData.confidence ?? 0) ?? 0;
  const buyScore = toFiniteNumber(signalData.scoring?.buyScore);
  const sellScore = toFiniteNumber(signalData.scoring?.sellScore);
  const scoreGap =
    buyScore !== null && sellScore !== null ? Math.abs(buyScore - sellScore) : null;

  if (ruleConfidence < MIN_DIRECTIONAL_RULE_CONFIDENCE) {
    reasons.push(
      `rule confidence ${ruleConfidence}% is below ${MIN_DIRECTIONAL_RULE_CONFIDENCE}%`,
    );
  }

  if (scoreGap !== null && scoreGap < MIN_DIRECTIONAL_SCORE_GAP) {
    reasons.push(
      `score gap ${scoreGap.toFixed(1)} is below ${MIN_DIRECTIONAL_SCORE_GAP.toFixed(1)}`,
    );
  }

  if (REQUIRE_HEALTHY_ML_FOR_DIRECTIONAL_SIGNALS) {
    if (!prediction.available) {
      reasons.push("ML validation is unavailable");
    } else {
      const probability = toFiniteNumber(prediction.probability);
      const rocAuc = toFiniteNumber(prediction.metrics?.rocAuc);
      const datasetRows = toFiniteNumber(prediction.metrics?.datasetRows);
      const promotionEligible = prediction.promotion?.eligible;

      if (probability === null || probability < MIN_ML_PROBABILITY) {
        reasons.push(
          `ML win probability ${
            probability === null ? "N/A" : `${(probability * 100).toFixed(1)}%`
          } is below ${(MIN_ML_PROBABILITY * 100).toFixed(1)}%`,
        );
      }

      if (rocAuc === null || rocAuc < MIN_MODEL_ROC_AUC) {
        reasons.push(
          `model ROC AUC ${rocAuc === null ? "N/A" : rocAuc.toFixed(3)} is below ${MIN_MODEL_ROC_AUC.toFixed(2)}`,
        );
      }

      if (datasetRows === null || datasetRows < MIN_MODEL_DATASET_ROWS) {
        reasons.push(
          `training dataset ${datasetRows === null ? "N/A" : datasetRows} rows is below ${MIN_MODEL_DATASET_ROWS}`,
        );
      }

      if (promotionEligible === false) {
        reasons.push("active model failed promotion-quality checks");
      }
    }
  }

  return {
    shouldAbstain: reasons.length > 0,
    reasons,
    ruleConfidence,
  };
};

const convertDirectionalSignalToHold = (
  signalData,
  prediction,
  ruleConfidence,
  reasons,
) => {
  const fallbackConfidence = clamp(Math.round(Math.min(ruleConfidence, 55)), 0, 100);

  return {
    ...signalData,
    type: "HOLD",
    confidence: fallbackConfidence,
    expectedDirection: "NEUTRAL",
    reasoning: `${signalData.reasoning} Accuracy guardrail forced HOLD: ${reasons.join(
      "; ",
    )}.`,
    price: {
      ...signalData.price,
      target: null,
      stopLoss: null,
    },
    ml: {
      ...signalData.ml,
      status: prediction.available ? "READY" : "UNAVAILABLE",
      probability: prediction.available ? prediction.probability : null,
      finalConfidence: fallbackConfidence,
      modelVersion: prediction.modelVersion || signalData.ml?.modelVersion || null,
      featureVersion:
        prediction.featureVersion ||
        signalData.ml?.featureVersion ||
        DEFAULT_FEATURE_VERSION,
      predictionSource: "accuracy_guardrail_hold",
    },
  };
};

export const calculateFuturesPerformance = (
  signalType,
  entryPrice,
  resolutionPrice,
  leverage = DEFAULT_FUTURES_LEVERAGE,
) => {
  const safeLeverage = normalizeLeverage(leverage);
  const marketPriceChange = resolutionPrice - entryPrice;
  const marketPriceChangePct =
    entryPrice > 0 ? (marketPriceChange / entryPrice) * 100 : null;

  let directionalReturnPct = 0;
  if (signalType === "BUY") {
    directionalReturnPct = marketPriceChangePct ?? 0;
  } else if (signalType === "SELL") {
    directionalReturnPct = (marketPriceChangePct ?? 0) * -1;
  }

  const leveragedReturnPct = directionalReturnPct * safeLeverage;

  return {
    leverage: safeLeverage,
    priceChange: marketPriceChange,
    marketPriceChangePct,
    directionalReturnPct,
    leveragedReturnPct,
  };
};

const timeframeToMs = (timeframe) => {
  const timeframeMap = {
    "1m": 60 * 1000,
    "5m": 5 * 60 * 1000,
    "15m": 15 * 60 * 1000,
    "1h": 60 * 60 * 1000,
    "4h": 4 * 60 * 60 * 1000,
    "1d": 24 * 60 * 60 * 1000,
  };

  return timeframeMap[timeframe] || timeframeMap["1h"];
};

const isSignalDueForResolution = (signal, now = Date.now()) => {
  const createdAt = new Date(signal.createdAt).getTime();
  return createdAt + timeframeToMs(signal.timeframe) <= now;
};

const applyResolutionToSignal = async (signal, resolutionData) => {
  const status = resolutionData.status || "COMPLETED";

  if (status === "CANCELLED") {
    signal.status = "CANCELLED";
    signal.outcome = "CANCELLED";
    signal.expiresAt = null;
    signal.resolvedAt = resolutionData.resolvedAt
      ? new Date(resolutionData.resolvedAt)
      : new Date();
    signal.resolutionSource = resolutionData.resolutionSource || null;
    signal.resolutionNotes = resolutionData.resolutionNotes || null;

    await signal.save();
    return signal;
  }

  const resolutionPrice = Number(resolutionData.resolutionPrice);
  if (!Number.isFinite(resolutionPrice) || resolutionPrice <= 0) {
    throw new Error("Resolution price must be a positive number");
  }

  const entryPrice = signal.price.entry;
  const actualDirection = getActualDirection(entryPrice, resolutionPrice);
  const performance = calculateFuturesPerformance(
    signal.type,
    entryPrice,
    resolutionPrice,
    signal.leverage,
  );

  signal.status = "COMPLETED";
  signal.expiresAt = null;
  signal.price.current = resolutionPrice;
  signal.price.resolution = resolutionPrice;
  signal.actualDirection = actualDirection;
  signal.outcome = getOutcomeFromDirections(
    signal.expectedDirection,
    actualDirection,
    "COMPLETED",
  );
  signal.resolvedAt = resolutionData.resolvedAt
    ? new Date(resolutionData.resolvedAt)
    : new Date();
  signal.resolutionSource = resolutionData.resolutionSource || null;
  signal.resolutionNotes = resolutionData.resolutionNotes || null;
  signal.performance = {
    priceChange: performance.priceChange,
    priceChangePct: performance.leveragedReturnPct,
    marketPriceChangePct: performance.marketPriceChangePct,
    leveragedReturnPct: performance.leveragedReturnPct,
  };

  await signal.save();
  return signal;
};

/**
 * Generate trading signal based on technical indicators
 * @param {string} symbol - Trading pair symbol (e.g., 'BTCUSDT')
 * @param {Array} klineData - Candlestick data
 * @param {Object} options - Additional options
 * @returns {Object|null} - Generated signal or null
 */
const getRuleSignalContext = (
  symbol,
  klineData,
  options = {},
  featureSnapshot = null,
) => {
  if (!klineData || klineData.length < 26) {
    console.log(`Insufficient data for ${symbol}, need at least 26 candles`);
    return null;
  }

  const currentPrice = klineData[klineData.length - 1].close;
  const currentOpen = klineData[klineData.length - 1].open;
  const leverage = normalizeLeverage(options.leverage);
  const snapshotMomentum = featureSnapshot?.momentum;
  const snapshotTrend = featureSnapshot?.trend;
  const snapshotVolatility = featureSnapshot?.volatility;
  const snapshotVolume = featureSnapshot?.volume;
  const snapshotStructure = featureSnapshot?.structure;

  // --- Primary indicators (with hardcoded fallback) ---
  let latestRSI = snapshotMomentum?.rsi14 ?? null;
  let latestMacdLine = snapshotMomentum?.macdLine ?? null;
  let latestSignalLine = snapshotMomentum?.macdSignal ?? null;
  let latestHistogramValue = snapshotMomentum?.macdHistogram ?? null;
  let latestEMA20 = snapshotTrend?.ema20 ?? null;
  let latestSMA20 = snapshotTrend?.sma20 ?? null;
  let atr = snapshotVolatility?.atr14 ?? null;
  let bullishCrossover = snapshotMomentum?.macdCrossoverDirection === "BULLISH";
  let bearishCrossover = snapshotMomentum?.macdCrossoverDirection === "BEARISH";

  // --- Advanced indicators from Pandas TA feature snapshot ---
  const stochasticK = snapshotMomentum?.stochasticK ?? null;
  const stochasticD = snapshotMomentum?.stochasticD ?? null;
  const cci20 = snapshotMomentum?.cci20 ?? null;
  const roc10 = snapshotMomentum?.roc10 ?? null;
  const mfi14 = snapshotVolume?.mfi14 ?? null;
  const obvSlope5 = snapshotVolume?.obvSlope5 ?? null;
  const relativeVolume = snapshotVolume?.relativeVolume ?? null;
  const bollingerPercentB = snapshotVolatility?.bollingerPercentB ?? null;
  const adx14 = snapshotTrend?.adx14 ?? null;
  const dmiPlus14 = snapshotTrend?.dmiPlus14 ?? null;
  const dmiMinus14 = snapshotTrend?.dmiMinus14 ?? null;

  // --- v3 expanded indicators from Pandas TA ---
  const williamsR14 = snapshotMomentum?.williamsR14 ?? null;
  const awesomeOscillator = snapshotMomentum?.awesomeOscillator ?? null;
  const ultimateOscillator = snapshotMomentum?.ultimateOscillator ?? null;
  const psarDirection = snapshotTrend?.psarDirection ?? null;
  const cmf20 = snapshotVolume?.cmf20 ?? null;
  const squeezeOn = snapshotVolatility?.squeezeOn ?? null;
  const zscore20 = snapshotVolatility?.zscore20 ?? null;
  const activeZoneBias = snapshotStructure?.activeZoneBias ?? "NONE";
  const nearestSupplyDistancePct = snapshotStructure?.nearestSupplyDistancePct ?? null;
  const nearestDemandDistancePct = snapshotStructure?.nearestDemandDistancePct ?? null;
  const nearestFvgBias = snapshotStructure?.nearestFvgBias ?? "NONE";
  const bullishFvgDistancePct = snapshotStructure?.bullishFvgDistancePct ?? null;
  const bearishFvgDistancePct = snapshotStructure?.bearishFvgDistancePct ?? null;
  const bullishFvgSizePct = snapshotStructure?.bullishFvgSizePct ?? null;
  const bearishFvgSizePct = snapshotStructure?.bearishFvgSizePct ?? null;

  if (
    ![
      latestRSI,
      latestMacdLine,
      latestSignalLine,
      latestHistogramValue,
      latestEMA20,
      latestSMA20,
    ].every(Number.isFinite)
  ) {
    const rsiValues = calculateRSI(klineData, 14);
    const macdResult = calculateMACD(klineData, 12, 26, 9);
    const ema20 = calculateEMA(klineData, 20);
    const sma20 = calculateSMA(klineData, 20);

    const latestMACD = macdResult.macdLine[macdResult.macdLine.length - 1];
    const latestSignal = macdResult.signalLine[macdResult.signalLine.length - 1];
    const latestHistogram = macdResult.histogram[macdResult.histogram.length - 1];
    const prevMACD = macdResult.macdLine[macdResult.macdLine.length - 2];
    const prevSignal = macdResult.signalLine[macdResult.signalLine.length - 2];

    latestRSI = rsiValues[rsiValues.length - 1]?.value;
    latestMacdLine = latestMACD?.value;
    latestSignalLine = latestSignal?.value;
    latestHistogramValue = latestHistogram?.value;
    latestEMA20 = ema20[ema20.length - 1]?.value;
    latestSMA20 = sma20[sma20.length - 1]?.value;
    atr = atr ?? calculateATRValue(klineData, 14) ?? 0;

    bullishCrossover =
      prevMACD &&
      prevSignal &&
      latestMACD &&
      latestSignal &&
      prevMACD.value <= prevSignal.value &&
      latestMACD.value > latestSignal.value;

    bearishCrossover =
      prevMACD &&
      prevSignal &&
      latestMACD &&
      latestSignal &&
      prevMACD.value >= prevSignal.value &&
      latestMACD.value < latestSignal.value;
  }

  // ──────────────────────────────────────────────────────────────
  // Multi-indicator scoring system
  // Each indicator contributes weighted points to buy/sell scores.
  // Signal is generated when dominant score reaches the threshold.
  // Threshold is dynamic — scales with the number of available indicators.
  // ──────────────────────────────────────────────────────────────
  const SIGNAL_THRESHOLD_RATIO = 0.35;
  let availableMaxScore = 0;
  let buyScore = 0;
  let sellScore = 0;
  const buyReasons = [];
  const sellReasons = [];

  const fmtNum = (v, decimals = 1) =>
    Number.isFinite(v) ? v.toFixed(decimals) : "N/A";

  // 1. RSI (weight: 2 strong, 1 moderate)
  if (Number.isFinite(latestRSI)) {
    availableMaxScore += 2;
    if (latestRSI < 30) {
      buyScore += 2;
      buyReasons.push(`RSI oversold (${fmtNum(latestRSI)})`);
    } else if (latestRSI < 40) {
      buyScore += 1;
      buyReasons.push(`RSI low (${fmtNum(latestRSI)})`);
    } else if (latestRSI > 70) {
      sellScore += 2;
      sellReasons.push(`RSI overbought (${fmtNum(latestRSI)})`);
    } else if (latestRSI > 60) {
      sellScore += 1;
      sellReasons.push(`RSI elevated (${fmtNum(latestRSI)})`);
    }
  }

  // 2. MACD crossover (weight: 2)
  if (Number.isFinite(latestMacdLine) && Number.isFinite(latestSignalLine)) {
    availableMaxScore += 2;
  }
  if (bullishCrossover) {
    buyScore += 2;
    buyReasons.push("MACD bullish crossover");
  }
  if (bearishCrossover) {
    sellScore += 2;
    sellReasons.push("MACD bearish crossover");
  }

  // 3. MACD histogram direction (weight: 1)
  if (Number.isFinite(latestHistogramValue)) {
    availableMaxScore += 1;
    if (latestHistogramValue > 0) {
      buyScore += 1;
      buyReasons.push("MACD histogram positive");
    } else if (latestHistogramValue < 0) {
      sellScore += 1;
      sellReasons.push("MACD histogram negative");
    }
  }

  // 4. Stochastic %K — oversold/overbought confirmation (weight: 1)
  if (Number.isFinite(stochasticK)) {
    availableMaxScore += 1;
    if (stochasticK < 20) {
      buyScore += 1;
      buyReasons.push(`Stochastic oversold (%K=${fmtNum(stochasticK)})`);
    } else if (stochasticK > 80) {
      sellScore += 1;
      sellReasons.push(`Stochastic overbought (%K=${fmtNum(stochasticK)})`);
    }
  }

  // 5. CCI — extreme momentum confirmation (weight: 1)
  if (Number.isFinite(cci20)) {
    availableMaxScore += 1;
    if (cci20 < -100) {
      buyScore += 1;
      buyReasons.push(`CCI oversold (${fmtNum(cci20)})`);
    } else if (cci20 > 100) {
      sellScore += 1;
      sellReasons.push(`CCI overbought (${fmtNum(cci20)})`);
    }
  }

  // 6. MFI — Money Flow Index (weight: 1.5 extreme, 0.5 moderate)
  if (Number.isFinite(mfi14)) {
    availableMaxScore += 1.5;
    if (mfi14 < 20) {
      buyScore += 1.5;
      buyReasons.push(`MFI oversold (${fmtNum(mfi14)})`);
    } else if (mfi14 < 40) {
      buyScore += 0.5;
      buyReasons.push(`MFI low (${fmtNum(mfi14)})`);
    } else if (mfi14 > 80) {
      sellScore += 1.5;
      sellReasons.push(`MFI overbought (${fmtNum(mfi14)})`);
    } else if (mfi14 > 60) {
      sellScore += 0.5;
      sellReasons.push(`MFI elevated (${fmtNum(mfi14)})`);
    }
  }

  // 7. Bollinger %B — price relative to bands (weight: 1)
  if (Number.isFinite(bollingerPercentB)) {
    availableMaxScore += 1;
    if (bollingerPercentB < 0.2) {
      buyScore += 1;
      buyReasons.push(`Near Bollinger lower band (%B=${fmtNum(bollingerPercentB, 2)})`);
    } else if (bollingerPercentB > 0.8) {
      sellScore += 1;
      sellReasons.push(`Near Bollinger upper band (%B=${fmtNum(bollingerPercentB, 2)})`);
    }
  }

  // 8. ADX + DMI — trend strength and direction (weight: 1)
  //    Uses DMI direction instead of running score to avoid circular dependency.
  if (Number.isFinite(adx14) && Number.isFinite(dmiPlus14) && Number.isFinite(dmiMinus14)) {
    availableMaxScore += 1;
    if (adx14 > 25) {
      if (dmiPlus14 > dmiMinus14) {
        buyScore += 1;
        buyReasons.push(`ADX strong trend + DMI bullish (ADX=${fmtNum(adx14)})`);
      } else if (dmiMinus14 > dmiPlus14) {
        sellScore += 1;
        sellReasons.push(`ADX strong trend + DMI bearish (ADX=${fmtNum(adx14)})`);
      }
    }
  }

  // 9. DMI — Directional Movement standalone (weight: 1)
  if (Number.isFinite(dmiPlus14) && Number.isFinite(dmiMinus14)) {
    availableMaxScore += 1;
    if (dmiPlus14 > dmiMinus14) {
      buyScore += 1;
      buyReasons.push("DMI+ > DMI- (bullish directional movement)");
    } else if (dmiMinus14 > dmiPlus14) {
      sellScore += 1;
      sellReasons.push("DMI- > DMI+ (bearish directional movement)");
    }
  }

  // 10. ROC — Rate of Change momentum extremes (weight: 1)
  if (Number.isFinite(roc10)) {
    availableMaxScore += 1;
    if (roc10 < -5) {
      buyScore += 1;
      buyReasons.push(`ROC deeply negative (${fmtNum(roc10)}%) — reversal potential`);
    } else if (roc10 > 5) {
      sellScore += 1;
      sellReasons.push(`ROC strongly positive (${fmtNum(roc10)}%) — reversal potential`);
    }
  }

  // 11. OBV slope — volume trend (weight: 0.5)
  if (Number.isFinite(obvSlope5)) {
    availableMaxScore += 0.5;
    if (obvSlope5 > 0) {
      buyScore += 0.5;
      buyReasons.push("OBV rising (buying pressure)");
    } else if (obvSlope5 < 0) {
      sellScore += 0.5;
      sellReasons.push("OBV falling (selling pressure)");
    }
  }

  // 12. Relative Volume — activity confirmation (weight: 0.5)
  //     Uses candle direction instead of running score to avoid circular dependency.
  if (Number.isFinite(relativeVolume) && relativeVolume > 1.5) {
    availableMaxScore += 0.5;
    const isBullishCandle = currentPrice >= currentOpen;
    if (isBullishCandle) {
      buyScore += 0.5;
      buyReasons.push(`High volume on bullish candle (${fmtNum(relativeVolume, 2)}x avg)`);
    } else {
      sellScore += 0.5;
      sellReasons.push(`High volume on bearish candle (${fmtNum(relativeVolume, 2)}x avg)`);
    }
  }

  // 13. Price vs EMA20 relationship (weight: 0.5)
  if (Number.isFinite(latestEMA20) && Number.isFinite(currentPrice)) {
    availableMaxScore += 0.5;
    if (currentPrice < latestEMA20) {
      buyScore += 0.5;
      buyReasons.push("Price below EMA20 (reversal zone)");
    } else if (currentPrice > latestEMA20) {
      sellScore += 0.5;
      sellReasons.push("Price above EMA20 (reversal zone)");
    }
  }

  // ──────────────────────────────────────────────────────────────
  // v3 expanded scoring rules — new indicators
  // ──────────────────────────────────────────────────────────────

  // 14. Williams %R — similar to RSI but inverted scale (weight: 1)
  if (Number.isFinite(williamsR14)) {
    availableMaxScore += 1;
    if (williamsR14 < -80) {
      buyScore += 1;
      buyReasons.push(`Williams %R oversold (${fmtNum(williamsR14)})`);
    } else if (williamsR14 > -20) {
      sellScore += 1;
      sellReasons.push(`Williams %R overbought (${fmtNum(williamsR14)})`);
    }
  }

  // 15. Parabolic SAR — trend direction confirmation (weight: 1)
  if (psarDirection === "BULLISH" || psarDirection === "BEARISH") {
    availableMaxScore += 1;
    if (psarDirection === "BULLISH") {
      buyScore += 1;
      buyReasons.push("PSAR below price (bullish trend)");
    } else {
      sellScore += 1;
      sellReasons.push("PSAR above price (bearish trend)");
    }
  }

  // 16. Chaikin Money Flow — institutional accumulation/distribution (weight: 1)
  if (Number.isFinite(cmf20)) {
    availableMaxScore += 1;
    if (cmf20 > 0.1) {
      buyScore += 1;
      buyReasons.push(`CMF positive accumulation (${fmtNum(cmf20, 2)})`);
    } else if (cmf20 < -0.1) {
      sellScore += 1;
      sellReasons.push(`CMF negative distribution (${fmtNum(cmf20, 2)})`);
    }
  }

  // 17. Squeeze detection — Bollinger inside Keltner = compression (weight: 0.5)
  //     Compression preceded by directional breakout amplifies signals.
  if (squeezeOn === true) {
    availableMaxScore += 0.5;
    // During squeeze, any existing directional bias gets amplified
    const isBullishCandle = currentPrice >= currentOpen;
    if (isBullishCandle) {
      buyScore += 0.5;
      buyReasons.push("Volatility squeeze + bullish pressure (breakout potential)");
    } else {
      sellScore += 0.5;
      sellReasons.push("Volatility squeeze + bearish pressure (breakout potential)");
    }
  }

  // 18. Awesome Oscillator — momentum confirmation (weight: 0.5)
  if (Number.isFinite(awesomeOscillator)) {
    availableMaxScore += 0.5;
    if (awesomeOscillator > 0) {
      buyScore += 0.5;
      buyReasons.push("Awesome Oscillator positive (bullish momentum)");
    } else if (awesomeOscillator < 0) {
      sellScore += 0.5;
      sellReasons.push("Awesome Oscillator negative (bearish momentum)");
    }
  }

  // 19. Ultimate Oscillator — multi-timeframe momentum (weight: 1)
  if (Number.isFinite(ultimateOscillator)) {
    availableMaxScore += 1;
    if (ultimateOscillator < 30) {
      buyScore += 1;
      buyReasons.push(`Ultimate Oscillator oversold (${fmtNum(ultimateOscillator)})`);
    } else if (ultimateOscillator > 70) {
      sellScore += 1;
      sellReasons.push(`Ultimate Oscillator overbought (${fmtNum(ultimateOscillator)})`);
    }
  }

  // 20. Z-score — statistical extreme detection (weight: 0.5)
  if (Number.isFinite(zscore20)) {
    availableMaxScore += 0.5;
    if (zscore20 < -2) {
      buyScore += 0.5;
      buyReasons.push(`Z-score extreme low (${fmtNum(zscore20, 2)}) — mean reversion likely`);
    } else if (zscore20 > 2) {
      sellScore += 0.5;
      sellReasons.push(`Z-score extreme high (${fmtNum(zscore20, 2)}) — mean reversion likely`);
    }
  }

  // 21. Supply/Demand zones — stronger market structure cue (weight: 2)
  if (activeZoneBias === "DEMAND" || activeZoneBias === "SUPPLY") {
    availableMaxScore += 2;
    if (activeZoneBias === "DEMAND") {
      const isNearDemand =
        Number.isFinite(nearestDemandDistancePct) &&
        Math.abs(nearestDemandDistancePct) <= 2.5;
      buyScore += isNearDemand ? 2 : 1;
      buyReasons.push(
        isNearDemand
          ? `Price sitting near demand zone (${fmtNum(nearestDemandDistancePct, 2)}% away)`
          : "Nearest structural zone is demand",
      );
    } else {
      const isNearSupply =
        Number.isFinite(nearestSupplyDistancePct) &&
        Math.abs(nearestSupplyDistancePct) <= 2.5;
      sellScore += isNearSupply ? 2 : 1;
      sellReasons.push(
        isNearSupply
          ? `Price sitting near supply zone (${fmtNum(nearestSupplyDistancePct, 2)}% away)`
          : "Nearest structural zone is supply",
      );
    }
  }

  // 22. Fair Value Gap — imbalance / magnet zone (weight: 1.5)
  if (nearestFvgBias === "BULLISH" || nearestFvgBias === "BEARISH") {
    availableMaxScore += 1.5;
    if (nearestFvgBias === "BULLISH") {
      const inRange =
        Number.isFinite(bullishFvgDistancePct) &&
        Math.abs(bullishFvgDistancePct) <= 2.5;
      buyScore += inRange ? 1.5 : 0.75;
      buyReasons.push(
        `Bullish FVG ${inRange ? "active nearby" : "present"} (${fmtNum(bullishFvgSizePct, 2)}% gap size)`,
      );
    } else {
      const inRange =
        Number.isFinite(bearishFvgDistancePct) &&
        Math.abs(bearishFvgDistancePct) <= 2.5;
      sellScore += inRange ? 1.5 : 0.75;
      sellReasons.push(
        `Bearish FVG ${inRange ? "active nearby" : "present"} (${fmtNum(bearishFvgSizePct, 2)}% gap size)`,
      );
    }
  }

  // ──────────────────────────────────────────────────────────────
  // Signal decision based on multi-indicator consensus
  // Dynamic threshold: 20% of available max score, minimum 2.5
  // ──────────────────────────────────────────────────────────────
  const dynamicThreshold = Math.max(2.5, availableMaxScore * SIGNAL_THRESHOLD_RATIO);
  let signalType = "HOLD";
  let ruleConfidence = 50;
  let reasoning = "";

  if (buyScore >= dynamicThreshold && buyScore > sellScore) {
    signalType = "BUY";
    ruleConfidence = Math.min(
      95,
      Math.round(55 + (buyScore / availableMaxScore) * 40),
    );
    reasoning = `BUY signal confirmed by ${buyReasons.length} indicator(s): ${buyReasons.join("; ")}. `;
    reasoning += `Buy score: ${buyScore.toFixed(1)} vs Sell score: ${sellScore.toFixed(1)} (threshold: ${dynamicThreshold.toFixed(1)}). `;
    if (sellReasons.length > 0) {
      reasoning += `Caution — opposing signals: ${sellReasons.join("; ")}.`;
    }
  } else if (sellScore >= dynamicThreshold && sellScore > buyScore) {
    signalType = "SELL";
    ruleConfidence = Math.min(
      95,
      Math.round(55 + (sellScore / availableMaxScore) * 40),
    );
    reasoning = `SELL signal confirmed by ${sellReasons.length} indicator(s): ${sellReasons.join("; ")}. `;
    reasoning += `Sell score: ${sellScore.toFixed(1)} vs Buy score: ${buyScore.toFixed(1)} (threshold: ${dynamicThreshold.toFixed(1)}). `;
    if (buyReasons.length > 0) {
      reasoning += `Caution — opposing signals: ${buyReasons.join("; ")}.`;
    }
  } else {
    signalType = "HOLD";
    ruleConfidence = 50;
    reasoning = `HOLD signal: No multi-indicator consensus reached. `;
    reasoning += `Buy score: ${buyScore.toFixed(1)}, Sell score: ${sellScore.toFixed(1)} (threshold: ${dynamicThreshold.toFixed(1)}). `;
    if (buyReasons.length > 0) {
      reasoning += `Bullish hints: ${buyReasons.join("; ")}. `;
    }
    if (sellReasons.length > 0) {
      reasoning += `Bearish hints: ${sellReasons.join("; ")}. `;
    }
    reasoning += `Wait for clearer multi-indicator agreement.`;
  }

  // Calculate price targets — ATR multipliers are configurable
  const resolvedAtr = Number.isFinite(atr) ? atr : calculateATRValue(klineData, 14) ?? 0;
  const tpMultiplier = options.atrTargetMultiplier ?? 2;
  const slMultiplier = options.atrStopMultiplier ?? 1.5;
  const targetMultiplier =
    signalType === "BUY" ? tpMultiplier : signalType === "SELL" ? -tpMultiplier : 0;
  const stopMultiplier =
    signalType === "BUY" ? -slMultiplier : signalType === "SELL" ? slMultiplier : 0;

  const target =
    signalType !== "HOLD" ? currentPrice + resolvedAtr * targetMultiplier : null;
  const stopLoss =
    signalType !== "HOLD" ? currentPrice + resolvedAtr * stopMultiplier : null;

  return {
    symbol,
    marketType: "FUTURES",
    leverage,
    signalType,
    ruleConfidence,
    expectedDirection: getExpectedDirection(signalType),
    indicators: {
      rsi: latestRSI,
      macd: {
        macdLine: latestMacdLine,
        signalLine: latestSignalLine,
        histogram: latestHistogramValue,
      },
      ema: latestEMA20,
      sma: latestSMA20,
      supplyDemand: {
        bias: activeZoneBias,
        supply: {
          top: snapshotStructure?.nearestSupplyTop ?? null,
          bottom: snapshotStructure?.nearestSupplyBottom ?? null,
          poi: snapshotStructure?.nearestSupplyPoi ?? null,
          distancePct: nearestSupplyDistancePct,
        },
        demand: {
          top: snapshotStructure?.nearestDemandTop ?? null,
          bottom: snapshotStructure?.nearestDemandBottom ?? null,
          poi: snapshotStructure?.nearestDemandPoi ?? null,
          distancePct: nearestDemandDistancePct,
        },
      },
      fvg: {
        bias: nearestFvgBias,
        bullish: {
          top: snapshotStructure?.bullishFvgTop ?? null,
          bottom: snapshotStructure?.bullishFvgBottom ?? null,
          distancePct: bullishFvgDistancePct,
          sizePct: bullishFvgSizePct,
        },
        bearish: {
          top: snapshotStructure?.bearishFvgTop ?? null,
          bottom: snapshotStructure?.bearishFvgBottom ?? null,
          distancePct: bearishFvgDistancePct,
          sizePct: bearishFvgSizePct,
        },
      },
    },
    scoring: {
      buyScore,
      sellScore,
      buyReasons,
      sellReasons,
      availableMaxScore,
      dynamicThreshold,
    },
    price: {
      entry: currentPrice,
      current: currentPrice,
      target,
      stopLoss,
      resolution: null,
    },
    reasoning,
    timeframe: options.timeframe || "1h",
  };
};

const attachMlMetadata = (baseSignal, featureSnapshot, mlOverrides = {}) => {
  const ruleConfidence = mlOverrides.ruleConfidence ?? baseSignal.ruleConfidence ?? 50;
  const finalConfidence = mlOverrides.finalConfidence ?? ruleConfidence;

  return {
    symbol: baseSignal.symbol,
    marketType: baseSignal.marketType || "FUTURES",
    leverage: baseSignal.leverage,
    type: baseSignal.signalType,
    confidence: finalConfidence,
    expectedDirection: baseSignal.expectedDirection,
    indicators: baseSignal.indicators,
    scoring: baseSignal.scoring || null,
    ml: {
      status: mlOverrides.status || "PENDING",
      ruleConfidence,
      probability: mlOverrides.probability ?? null,
      finalConfidence,
      featureVersion:
        mlOverrides.featureVersion ||
        featureSnapshot?.featureVersion ||
        DEFAULT_FEATURE_VERSION,
      modelVersion: mlOverrides.modelVersion ?? null,
      predictionSource: mlOverrides.predictionSource || null,
    },
    features: featureSnapshot
      ? {
          ...featureSnapshot,
          generatedAt: featureSnapshot.generatedAt
            ? new Date(featureSnapshot.generatedAt)
            : new Date(),
        }
      : null,
    price: baseSignal.price,
    reasoning: baseSignal.reasoning,
    timeframe: baseSignal.timeframe,
    status: "ACTIVE",
    outcome: "PENDING",
    actualDirection: null,
    resolvedAt: null,
    resolutionSource: null,
    resolutionNotes: null,
    performance: {
      priceChange: null,
      priceChangePct: null,
      marketPriceChangePct: null,
      leveragedReturnPct: null,
    },
  };
};

export const enrichSignalWithMlPrediction = async (
  signalData,
  metadata = {},
) => {
  if (!signalData?.features) {
    return signalData;
  }

  if (signalData.type === "HOLD") {
    return {
      ...signalData,
      ml: {
        ...signalData.ml,
        status: "UNAVAILABLE",
        probability: null,
        finalConfidence: signalData.ml?.ruleConfidence ?? signalData.confidence,
        predictionSource: "hold_signal_skipped",
      },
    };
  }

  const ruleConfidence = Number(
    signalData.ml?.ruleConfidence ?? signalData.confidence ?? 0,
  );
  const prediction = await predictSignalWinProbability(signalData.features, metadata);
  const guardrailDecision = buildAccuracyGuardrailDecision(signalData, prediction);

  if (guardrailDecision.shouldAbstain) {
    return convertDirectionalSignalToHold(
      signalData,
      prediction,
      guardrailDecision.ruleConfidence,
      guardrailDecision.reasons,
    );
  }

  if (!prediction.available) {
    return {
      ...signalData,
      ml: {
        ...signalData.ml,
        status: "UNAVAILABLE",
        probability: null,
        finalConfidence: ruleConfidence,
        predictionSource: "ml_service_unavailable",
      },
      confidence: ruleConfidence,
    };
  }

  const finalConfidence = calculateFinalConfidence(
    ruleConfidence,
    prediction.probability,
  );
  const mlProbabilityPct = (prediction.probability * 100).toFixed(1);
  const augmentedReasoning = `${signalData.reasoning} ML layer estimates a ${mlProbabilityPct}% win probability based on historical signal outcomes.`;

  return {
    ...signalData,
    confidence: finalConfidence,
    reasoning: augmentedReasoning,
    ml: {
      ...signalData.ml,
      status: "READY",
      probability: prediction.probability,
      finalConfidence,
      modelVersion: prediction.modelVersion,
      featureVersion:
        prediction.featureVersion ||
        signalData.ml?.featureVersion ||
        DEFAULT_FEATURE_VERSION,
      predictionSource: "ml_service_predict",
    },
  };
};

/**
 * Generate trading signal based on technical indicators and attach ML-ready features
 * @param {string} symbol - Trading pair symbol (e.g., 'BTCUSDT')
 * @param {Array} klineData - Candlestick data
 * @param {Object} options - Additional options
 * @returns {Object|null} - Generated signal or null
 */
export const generateSignal = async (symbol, klineData, options = {}) => {
  const featureSnapshot = await buildMlFeatureSnapshotWithFallback(klineData, {
    leverage: normalizeLeverage(options.leverage),
    timeframe: options.timeframe || "1h",
    signalType: options.signalType || "UNKNOWN",
  });
  const baseSignal = getRuleSignalContext(symbol, klineData, options, featureSnapshot);
  if (!baseSignal) {
    return null;
  }

  if (featureSnapshot?.context) {
    featureSnapshot.context.signalType = baseSignal.signalType;
    featureSnapshot.context.timeframe = baseSignal.timeframe;
    featureSnapshot.context.leverage = baseSignal.leverage;
  }

  return attachMlMetadata(baseSignal, featureSnapshot, {
    status: "PENDING",
    predictionSource: "rule_engine_baseline",
  });
};

export const generateSignalWithMl = async (symbol, klineData, options = {}) => {
  const signalData = await generateSignal(symbol, klineData, options);
  if (!signalData) {
    return null;
  }

  return enrichSignalWithMlPrediction(signalData, {
    symbol,
    timeframe: options.timeframe || signalData.timeframe,
    signalType: signalData.type,
    leverage: signalData.leverage,
    modelVersion: options.mlModelVersion || null,
  });
};

/**
 * Save signal to database
 * @param {Object} signalData - Signal data
 * @param {string} userId - User ID (optional)
 * @returns {Object} - Saved signal
 */
export const saveSignal = async (signalData, userId = null) => {
  try {
    const signal = new Signal({
      expiresAt:
        signalData.status && signalData.status !== "ACTIVE"
          ? null
          : signalData.expiresAt,
      marketType: signalData.marketType || "FUTURES",
      leverage: normalizeLeverage(signalData.leverage),
      ml: signalData.ml || undefined,
      features: signalData.features
        ? {
            ...signalData.features,
            generatedAt: signalData.features.generatedAt
              ? new Date(signalData.features.generatedAt)
              : new Date(),
          }
        : undefined,
      ...signalData,
      userId,
    });

    await signal.save();
    console.log(
      `Signal saved for ${signalData.symbol}: ${signalData.type} (${signalData.confidence}%)`,
    );
    return signal;
  } catch (error) {
    console.error("Error saving signal:", error.message);
    return null;
  }
};

/**
 * Get active signals
 * @param {string} symbol - Filter by symbol (optional)
 * @param {number} limit - Number of signals to return
 * @returns {Array} - Active signals
 */
export const getActiveSignals = async (symbol = null, limit = 50) => {
  try {
    const query = { status: "ACTIVE" };
    if (symbol) query.symbol = symbol.toUpperCase();

    const signals = await Signal.find(query)
      .sort({ createdAt: -1 })
      .limit(limit);

    return signals;
  } catch (error) {
    console.error("Error fetching active signals:", error.message);
    return [];
  }
};

/**
 * Get signal history
 * @param {string} symbol - Filter by symbol (optional)
 * @param {number} limit - Number of signals to return
 * @returns {Array} - Signal history
 */
export const getSignalHistory = async (userId, symbol = null, limit = 100) => {
  try {
    const query = { userId };
    if (symbol) query.symbol = symbol.toUpperCase();

    const signals = await Signal.find(query)
      .sort({ createdAt: -1 })
      .limit(limit);

    return signals;
  } catch (error) {
    console.error("Error fetching signal history:", error.message);
    return [];
  }
};

/**
 * Get aggregated performance summary for resolved signals
 * @param {object} filters - Optional filters
 * @returns {object} - Summary metrics
 */
export const getSignalPerformanceSummary = async (filters = {}) => {
  try {
    const match = {
      status: "COMPLETED",
      outcome: { $in: ["WIN", "LOSS", "NEUTRAL"] },
      resolvedAt: { $ne: null },
    };

    if (filters.userId) {
      match.userId = filters.userId;
    }

    if (filters.symbol) {
      match.symbol = filters.symbol.toUpperCase();
    }

    if (filters.timeframe) {
      match.timeframe = filters.timeframe;
    }

    const [summary = null, byOutcome = [], byTimeframe = []] = await Promise.all([
      Signal.aggregate([
        { $match: match },
        {
          $group: {
            _id: null,
            totalResolved: { $sum: 1 },
            wins: {
              $sum: { $cond: [{ $eq: ["$outcome", "WIN"] }, 1, 0] },
            },
            losses: {
              $sum: { $cond: [{ $eq: ["$outcome", "LOSS"] }, 1, 0] },
            },
            neutrals: {
              $sum: { $cond: [{ $eq: ["$outcome", "NEUTRAL"] }, 1, 0] },
            },
            avgConfidence: { $avg: "$confidence" },
            avgReturnPct: { $avg: "$performance.leveragedReturnPct" },
            avgReturnAbs: { $avg: "$performance.priceChange" },
            avgUnderlyingMovePct: { $avg: "$performance.marketPriceChangePct" },
            avgLeverage: { $avg: "$leverage" },
            bestReturnPct: { $max: "$performance.leveragedReturnPct" },
            worstReturnPct: { $min: "$performance.leveragedReturnPct" },
          },
        },
      ]),
      Signal.aggregate([
        { $match: match },
        {
          $group: {
            _id: "$outcome",
            count: { $sum: 1 },
          },
        },
      ]),
      Signal.aggregate([
        { $match: match },
        {
          $group: {
            _id: "$timeframe",
            total: { $sum: 1 },
            wins: {
              $sum: { $cond: [{ $eq: ["$outcome", "WIN"] }, 1, 0] },
            },
            avgReturnPct: { $avg: "$performance.leveragedReturnPct" },
          },
        },
        { $sort: { total: -1, _id: 1 } },
      ]),
    ]);

    const totalResolved = summary?.totalResolved || 0;
    const wins = summary?.wins || 0;
    const losses = summary?.losses || 0;
    const neutrals = summary?.neutrals || 0;

    const toRate = (count) =>
      totalResolved > 0 ? Number(((count / totalResolved) * 100).toFixed(2)) : 0;

    return {
      totalResolved,
      wins,
      losses,
      neutrals,
      winRate: toRate(wins),
      lossRate: toRate(losses),
      neutralRate: toRate(neutrals),
      avgConfidence: summary?.avgConfidence
        ? Number(summary.avgConfidence.toFixed(2))
        : 0,
      avgReturnPct: summary?.avgReturnPct
        ? Number(summary.avgReturnPct.toFixed(2))
        : 0,
      avgReturnAbs: summary?.avgReturnAbs
        ? Number(summary.avgReturnAbs.toFixed(4))
        : 0,
      avgUnderlyingMovePct: summary?.avgUnderlyingMovePct
        ? Number(summary.avgUnderlyingMovePct.toFixed(2))
        : 0,
      avgLeverage: summary?.avgLeverage
        ? Number(summary.avgLeverage.toFixed(2))
        : 0,
      bestReturnPct: summary?.bestReturnPct
        ? Number(summary.bestReturnPct.toFixed(2))
        : 0,
      worstReturnPct: summary?.worstReturnPct
        ? Number(summary.worstReturnPct.toFixed(2))
        : 0,
      byOutcome: byOutcome.map((item) => ({
        outcome: item._id,
        count: item.count,
        rate: toRate(item.count),
      })),
      byTimeframe: byTimeframe.map((item) => ({
        timeframe: item._id,
        total: item.total,
        wins: item.wins,
        winRate:
          item.total > 0 ? Number(((item.wins / item.total) * 100).toFixed(2)) : 0,
        avgReturnPct: item.avgReturnPct
          ? Number(item.avgReturnPct.toFixed(2))
          : 0,
      })),
    };
  } catch (error) {
    console.error("Error getting signal performance summary:", error.message);
    throw error;
  }
};

export const getMlMonitoringSummary = async (filters = {}) => {
  try {
    const match = {};

    if (filters.symbol) {
      match.symbol = filters.symbol.toUpperCase();
    }

    if (filters.timeframe) {
      match.timeframe = filters.timeframe;
    }

    const signals = await Signal.find(match).lean();

    const totalSignals = signals.length;
    const mlSignals = signals.filter((signal) => signal.ml);
    const readySignals = mlSignals.filter((signal) => signal.ml?.status === "READY");
    const unavailableSignals = mlSignals.filter(
      (signal) => signal.ml?.status === "UNAVAILABLE",
    );
    const pendingSignals = mlSignals.filter((signal) => signal.ml?.status === "PENDING");
    const resolvedReadySignals = readySignals.filter((signal) =>
      ["WIN", "LOSS"].includes(signal.outcome),
    );

    const avg = (items, selector) => {
      if (items.length === 0) return 0;
      const values = items
        .map(selector)
        .filter((value) => Number.isFinite(value));
      if (values.length === 0) return 0;
      return values.reduce((sum, value) => sum + value, 0) / values.length;
    };

    const toRate = (count, total) =>
      total > 0 ? Number(((count / total) * 100).toFixed(2)) : 0;

    const bucketRanges = [
      { min: 0, max: 0.2, label: "0-20%" },
      { min: 0.2, max: 0.4, label: "20-40%" },
      { min: 0.4, max: 0.6, label: "40-60%" },
      { min: 0.6, max: 0.8, label: "60-80%" },
      { min: 0.8, max: 1.01, label: "80-100%" },
    ];

    const calibration = bucketRanges.map((bucket) => {
      const bucketSignals = resolvedReadySignals.filter((signal) => {
        const probability = signal.ml?.probability;
        return (
          Number.isFinite(probability) &&
          probability >= bucket.min &&
          probability < bucket.max
        );
      });
      const wins = bucketSignals.filter((signal) => signal.outcome === "WIN").length;
      const avgProbability = avg(bucketSignals, (signal) => signal.ml?.probability ?? 0);

      return {
        bucket: bucket.label,
        count: bucketSignals.length,
        avgProbabilityPct: Number((avgProbability * 100).toFixed(2)),
        actualWinRatePct: toRate(wins, bucketSignals.length),
        calibrationGapPct: Number(
          (toRate(wins, bucketSignals.length) - avgProbability * 100).toFixed(2),
        ),
      };
    });

    const modelVersionMap = new Map();
    for (const signal of readySignals) {
      const version = signal.ml?.modelVersion || "unknown";
      modelVersionMap.set(version, (modelVersionMap.get(version) || 0) + 1);
    }

    const modelVersions = Array.from(modelVersionMap.entries())
      .map(([modelVersion, count]) => ({
        modelVersion,
        count,
        rate: toRate(count, readySignals.length),
      }))
      .sort((a, b) => b.count - a.count || a.modelVersion.localeCompare(b.modelVersion));

    const predictionSourcesMap = new Map();
    for (const signal of mlSignals) {
      const source = signal.ml?.predictionSource || "unknown";
      predictionSourcesMap.set(source, (predictionSourcesMap.get(source) || 0) + 1);
    }

    const predictionSources = Array.from(predictionSourcesMap.entries()).map(
      ([source, count]) => ({
        source,
        count,
        rate: toRate(count, mlSignals.length),
      }),
    );

    return {
      totalSignals,
      mlTrackedSignals: mlSignals.length,
      mlCoverageRate: toRate(mlSignals.length, totalSignals),
      readyPredictions: readySignals.length,
      readyPredictionRate: toRate(readySignals.length, mlSignals.length),
      unavailablePredictions: unavailableSignals.length,
      unavailablePredictionRate: toRate(unavailableSignals.length, mlSignals.length),
      pendingPredictions: pendingSignals.length,
      pendingPredictionRate: toRate(pendingSignals.length, mlSignals.length),
      resolvedMlSignals: resolvedReadySignals.length,
      avgMlProbabilityPct: Number(
        (avg(readySignals, (signal) => signal.ml?.probability ?? 0) * 100).toFixed(2),
      ),
      avgRuleConfidence: Number(
        avg(mlSignals, (signal) => signal.ml?.ruleConfidence ?? signal.confidence).toFixed(2),
      ),
      avgFinalConfidence: Number(
        avg(mlSignals, (signal) => signal.ml?.finalConfidence ?? signal.confidence).toFixed(2),
      ),
      avgResolvedMlReturnPct: Number(
        avg(
          resolvedReadySignals,
          (signal) => signal.performance?.leveragedReturnPct ?? 0,
        ).toFixed(2),
      ),
      avgResolvedMlWinProbabilityPct: Number(
        (avg(resolvedReadySignals, (signal) => signal.ml?.probability ?? 0) * 100).toFixed(2),
      ),
      calibration,
      modelVersions,
      predictionSources,
    };
  } catch (error) {
    console.error("Error getting ML monitoring summary:", error.message);
    throw error;
  }
};

/**
 * Resolve a signal with the observed market outcome
 * @param {string} signalId - Signal ID
 * @param {object} resolutionData - Resolution details
 * @param {string} userId - User ID
 * @returns {Object|null} - Updated signal
 */
export const resolveSignal = async (signalId, resolutionData, userId) => {
  try {
    const signal = await Signal.findOne({ _id: signalId, userId });

    if (!signal || signal.status === "CANCELLED") {
      return null;
    }

    return await applyResolutionToSignal(signal, resolutionData);
  } catch (error) {
    console.error("Error resolving signal:", error.message);
    throw error;
  }
};

/**
 * Resolve due active signals using current market prices
 * @param {number} batchSize - Max signals to process per run
 * @returns {object} - Resolution summary
 */
export const resolveExpiredSignals = async (batchSize = 100) => {
  if (isResolvingSignals) {
    return { processed: 0, resolved: 0, skipped: 0, reason: "already_running" };
  }

  isResolvingSignals = true;

  try {
    const now = Date.now();
    const activeSignals = await Signal.find({
      status: "ACTIVE",
      outcome: "PENDING",
    })
      .sort({ createdAt: 1 })
      .limit(batchSize);

    const dueSignals = activeSignals.filter((signal) =>
      isSignalDueForResolution(signal, now),
    );

    if (dueSignals.length === 0) {
      return { processed: activeSignals.length, resolved: 0, skipped: 0 };
    }

    const priceCache = new Map();
    let resolved = 0;
    let skipped = 0;

    for (const signal of dueSignals) {
      try {
        const symbol = signal.symbol.toUpperCase();
        let latestPrice = priceCache.get(symbol);

        if (!latestPrice) {
          const priceData = await getPrice(symbol);
          latestPrice = Number(priceData.price);
          priceCache.set(symbol, latestPrice);
        }

        if (!Number.isFinite(latestPrice) || latestPrice <= 0) {
          skipped += 1;
          continue;
        }

        await applyResolutionToSignal(signal, {
          resolutionPrice: latestPrice,
          resolvedAt: new Date(),
          resolutionSource: "binance_ticker_price",
          resolutionNotes: `Auto-resolved after ${signal.timeframe} horizon elapsed.`,
          status: "COMPLETED",
        });

        resolved += 1;
      } catch (error) {
        skipped += 1;
        console.error(
          `Error auto-resolving signal ${signal._id} (${signal.symbol}):`,
          error.message,
        );
      }
    }

    return {
      processed: activeSignals.length,
      resolved,
      skipped,
    };
  } catch (error) {
    console.error("Error resolving expired signals:", error.message);
    throw error;
  } finally {
    isResolvingSignals = false;
  }
};

/**
 * Start background job that auto-resolves expired signals
 * @param {number} intervalMinutes - Polling interval in minutes
 */
export const startSignalResolutionJob = (intervalMinutes = 5) => {
  if (signalResolutionInterval) {
    console.log("Signal resolution job already running");
    return;
  }

  console.log(
    `Starting signal resolution job (every ${intervalMinutes} minute(s))`,
  );

  resolveExpiredSignals().catch((error) => {
    console.error("Initial signal resolution run failed:", error.message);
  });

  signalResolutionInterval = setInterval(() => {
    resolveExpiredSignals().catch((error) => {
      console.error("Scheduled signal resolution run failed:", error.message);
    });
  }, intervalMinutes * 60 * 1000);
};

/**
 * Stop background signal auto-resolution job
 */
export const stopSignalResolutionJob = () => {
  if (signalResolutionInterval) {
    clearInterval(signalResolutionInterval);
    signalResolutionInterval = null;
    console.log("Signal resolution job stopped");
  }
};

/**
 * Update signal status
 * @param {string} signalId - Signal ID
 * @param {string} status - New status (COMPLETED, CANCELLED)
 * @returns {Object|null} - Updated signal
 */
export const updateSignalStatus = async (signalId, status, userId) => {
  try {
    const updates = { status };

    if (status === "CANCELLED") {
      updates.outcome = "CANCELLED";
      updates.resolvedAt = new Date();
      updates.expiresAt = null;
    }

    const signal = await Signal.findOneAndUpdate(
      { _id: signalId, userId },
      updates,
      { new: true },
    );

    if (signal) {
      console.log(`Signal ${signalId} status updated to ${status}`);
    }

    return signal;
  } catch (error) {
    console.error("Error updating signal status:", error.message);
    return null;
  }
};

