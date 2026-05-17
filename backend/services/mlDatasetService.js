const FEATURE_KEYS = [
  // ── Momentum ──────────────────────────────────────────────
  "momentum.rsi14",
  "momentum.macdLine",
  "momentum.macdSignal",
  "momentum.macdHistogram",
  "momentum.macdCrossoverDirection",
  "momentum.macdCrossoverStrength",
  "momentum.stochasticK",
  "momentum.stochasticD",
  "momentum.cci20",
  "momentum.roc10",
  "momentum.williamsR14",
  "momentum.awesomeOscillator",
  "momentum.ultimateOscillator",
  "momentum.trix15",
  "momentum.ppoLine",
  "momentum.ppoHistogram",
  // ── Trend ─────────────────────────────────────────────────
  "trend.ema20",
  "trend.ema50",
  "trend.sma20",
  "trend.sma50",
  "trend.sma200",
  "trend.emaSmaSpreadPct",
  "trend.priceVsEmaPct",
  "trend.priceVsSmaPct",
  "trend.priceVsSma200Pct",
  "trend.trendDirection",
  "trend.trendStrength",
  "trend.adx14",
  "trend.dmiPlus14",
  "trend.dmiMinus14",
  "trend.hma20",
  "trend.dema20",
  "trend.priceVsHmaPct",
  "trend.priceVsDemaPct",
  "trend.psarDirection",
  "trend.psarDistancePct",
  "trend.linregValue",
  // ── Volatility ────────────────────────────────────────────
  "volatility.atr14",
  "volatility.atrPct",
  "volatility.candleRangePct",
  "volatility.bollingerBandWidthPct",
  "volatility.bollingerPercentB",
  "volatility.natr14",
  "volatility.volatilityPct",
  "volatility.donchianPositionPct",
  "volatility.donchianWidthPct",
  "volatility.keltnerPositionPct",
  "volatility.squeezeOn",
  "volatility.zscore20",
  // ── Volume ────────────────────────────────────────────────
  "volume.volume",
  "volume.volumeSma20",
  "volume.relativeVolume",
  "volume.mfi14",
  "volume.obv",
  "volume.obvSlope5",
  "volume.cmf20",
  "volume.adLine",
  "volume.adSlope5",
  "volume.efi13",
  "structure.activeZoneBias",
  "structure.nearestSupplyTop",
  "structure.nearestSupplyBottom",
  "structure.nearestSupplyPoi",
  "structure.nearestSupplyDistancePct",
  "structure.nearestDemandTop",
  "structure.nearestDemandBottom",
  "structure.nearestDemandPoi",
  "structure.nearestDemandDistancePct",
  "structure.nearestFvgBias",
  "structure.bullishFvgTop",
  "structure.bullishFvgBottom",
  "structure.bullishFvgDistancePct",
  "structure.bullishFvgSizePct",
  "structure.bearishFvgTop",
  "structure.bearishFvgBottom",
  "structure.bearishFvgDistancePct",
  "structure.bearishFvgSizePct",
  // ── Candle ────────────────────────────────────────────────
  "candle.bodyPct",
  "candle.upperWickPct",
  "candle.lowerWickPct",
  "candle.bullishStrength",
  "candle.bearishStrength",
  "candle.isBullish",
  // ── Context ───────────────────────────────────────────────
  "context.signalType",
  "context.timeframe",
  "context.leverage",
  "context.marketRegime",
  "context.closePrice",
  "context.openPrice",
  "context.highPrice",
  "context.lowPrice",
];

const CATEGORICAL_ENCODINGS = {
  "momentum.macdCrossoverDirection": {
    UNKNOWN: -1,
    NONE: 0,
    BULLISH: 1,
    BEARISH: 2,
  },
  "trend.trendDirection": {
    UNKNOWN: -1,
    SIDEWAYS: 0,
    BULLISH: 1,
    STRONG_BULLISH: 2,
    BEARISH: -2,
    STRONG_BEARISH: -3,
  },
  "trend.psarDirection": {
    UNKNOWN: -1,
    BULLISH: 1,
    BEARISH: -1,
  },
  "structure.activeZoneBias": {
    NONE: 0,
    DEMAND: 1,
    SUPPLY: -1,
  },
  "structure.nearestFvgBias": {
    NONE: 0,
    BULLISH: 1,
    BEARISH: -1,
  },
  "context.signalType": {
    UNKNOWN: -1,
    HOLD: 0,
    BUY: 1,
    SELL: -1,
  },
  "context.timeframe": {
    "1m": 1,
    "5m": 5,
    "15m": 15,
    "1h": 60,
    "4h": 240,
    "1d": 1440,
  },
  "context.marketRegime": {
    RANGING: 0,
    RANGING_VOLATILE: 1,
    TRENDING: 2,
    TRENDING_VOLATILE: 3,
  },
};

const safeNumber = (value, fallback = 0) => {
  if (value === null || value === undefined || value === "") {
    return fallback;
  }

  if (typeof value === "boolean") {
    return value ? 1 : 0;
  }

  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const getValueAtPath = (object, path) => {
  return path.split(".").reduce((current, key) => current?.[key], object);
};

export const flattenFeatureSnapshot = (featureSnapshot = {}) => {
  const flattened = {};

  for (const key of FEATURE_KEYS) {
    const rawValue = getValueAtPath(featureSnapshot, key);
    const encoding = CATEGORICAL_ENCODINGS[key];

    if (encoding) {
      flattened[key] =
        encoding[rawValue] ?? (typeof rawValue === "string" ? -999 : safeNumber(rawValue));
      continue;
    }

    flattened[key] = safeNumber(rawValue);
  }

  return flattened;
};

export const buildTrainingSampleFromSignal = (signal) => {
  if (!signal?.features || !["WIN", "LOSS"].includes(signal.outcome)) {
    return null;
  }

  const flattenedFeatures = flattenFeatureSnapshot(signal.features);
  const ruleConfidence = safeNumber(signal.ml?.ruleConfidence ?? signal.confidence);
  const finalConfidence = safeNumber(signal.ml?.finalConfidence ?? signal.confidence);
  const probability = signal.ml?.probability;
  const sampleId =
    signal.sampleId ||
    signal._id?.toString?.() ||
    signal.id?.toString?.() ||
    null;
  const source = signal.sampleSource || signal.source || "signal";

  return {
    signalId: sampleId,
    source,
    symbol: signal.symbol,
    type: signal.type,
    timeframe: signal.timeframe,
    leverage: safeNumber(signal.leverage),
    outcome: signal.outcome,
    label: signal.outcome === "WIN" ? 1 : 0,
    confidence: safeNumber(signal.confidence),
    ruleConfidence,
    finalConfidence,
    mlProbability:
      probability === null || probability === undefined ? null : safeNumber(probability),
    featureVersion: signal.features.featureVersion || signal.ml?.featureVersion || "v1",
    modelVersion: signal.ml?.modelVersion || null,
    createdAt: signal.createdAt ? new Date(signal.createdAt).toISOString() : null,
    resolvedAt: signal.resolvedAt ? new Date(signal.resolvedAt).toISOString() : null,
    marketPriceChangePct: safeNumber(signal.performance?.marketPriceChangePct),
    leveragedReturnPct: safeNumber(signal.performance?.leveragedReturnPct),
    exitReason: signal.simulation?.exitReason || signal.resolutionSource || null,
    features: flattenedFeatures,
  };
};

export const toTrainingRow = (sample) => {
  if (!sample) {
    return null;
  }

  return {
    signalId: sample.signalId,
    source: sample.source || "signal",
    symbol: sample.symbol,
    type: sample.type,
    timeframe: sample.timeframe,
    leverage: sample.leverage,
    label: sample.label,
    confidence: sample.confidence,
    ruleConfidence: sample.ruleConfidence,
    finalConfidence: sample.finalConfidence,
    marketPriceChangePct: sample.marketPriceChangePct,
    leveragedReturnPct: sample.leveragedReturnPct,
    ...sample.features,
  };
};

export default {
  FEATURE_KEYS,
  flattenFeatureSnapshot,
  buildTrainingSampleFromSignal,
  toTrainingRow,
};
