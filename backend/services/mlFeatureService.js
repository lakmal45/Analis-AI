import {
  calculateBollingerBands,
  calculateEMA,
  calculateFairValueGaps,
  calculateMACD,
  calculateRSI,
  calculateSMA,
  calculateSupplyDemandZones,
  calculateStochastic,
} from "./indicatorService.js";
import { requestFeatureSnapshot } from "./mlInferenceService.js";

const toSafeNumber = (value, fallback = null) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const toPct = (numerator, denominator) => {
  if (!Number.isFinite(numerator) || !Number.isFinite(denominator) || denominator === 0) {
    return null;
  }

  return (numerator / denominator) * 100;
};

const getLastValue = (series) => {
  if (!Array.isArray(series) || series.length === 0) {
    return null;
  }

  return series[series.length - 1]?.value ?? null;
};

const getPrevValue = (series) => {
  if (!Array.isArray(series) || series.length < 2) {
    return null;
  }

  return series[series.length - 2]?.value ?? null;
};

export const calculateATRValue = (data, period = 14) => {
  if (!Array.isArray(data) || data.length < period + 1) {
    return null;
  }

  const trueRanges = [];

  for (let i = 1; i < data.length; i += 1) {
    const high = toSafeNumber(data[i].high);
    const low = toSafeNumber(data[i].low);
    const prevClose = toSafeNumber(data[i - 1].close);

    if (![high, low, prevClose].every(Number.isFinite)) {
      continue;
    }

    trueRanges.push(
      Math.max(
        high - low,
        Math.abs(high - prevClose),
        Math.abs(low - prevClose),
      ),
    );
  }

  if (trueRanges.length < period) {
    return null;
  }

  let atr = trueRanges.slice(0, period).reduce((sum, value) => sum + value, 0) / period;

  for (let i = period; i < trueRanges.length; i += 1) {
    atr = (atr * (period - 1) + trueRanges[i]) / period;
  }

  return atr;
};

const getTrendDirection = (price, ema20, sma20, sma200) => {
  if (![price, ema20, sma20].every(Number.isFinite)) {
    return "UNKNOWN";
  }

  if (Number.isFinite(sma200)) {
    if (price > ema20 && ema20 > sma20 && sma20 > sma200) return "STRONG_BULLISH";
    if (price < ema20 && ema20 < sma20 && sma20 < sma200) return "STRONG_BEARISH";
  }

  if (price > ema20 && ema20 >= sma20) return "BULLISH";
  if (price < ema20 && ema20 <= sma20) return "BEARISH";

  return "SIDEWAYS";
};

const getMarketRegime = (trendDirection, atrPct, bollingerWidthPct) => {
  const volatility = Math.max(atrPct ?? 0, bollingerWidthPct ?? 0);

  if (trendDirection.includes("BULLISH") || trendDirection.includes("BEARISH")) {
    return volatility >= 3 ? "TRENDING_VOLATILE" : "TRENDING";
  }

  return volatility >= 3 ? "RANGING_VOLATILE" : "RANGING";
};

const getSignalTypeName = (signalType) => {
  if (signalType === "BUY" || signalType === "SELL" || signalType === "HOLD") {
    return signalType;
  }

  return "UNKNOWN";
};

const calculateCCI = (data, period = 20) => {
  if (!Array.isArray(data) || data.length < period) return null;
  const slice = data.slice(-period);
  const typicalPrices = slice.map((d) => {
    const h = toSafeNumber(d.high);
    const l = toSafeNumber(d.low);
    const c = toSafeNumber(d.close);
    return h !== null && l !== null && c !== null ? (h + l + c) / 3 : null;
  });
  if (typicalPrices.some((v) => v === null)) return null;
  const tpMean = typicalPrices.reduce((s, v) => s + v, 0) / period;
  const meanDev = typicalPrices.reduce((s, v) => s + Math.abs(v - tpMean), 0) / period;
  if (meanDev === 0) return 0;
  return (typicalPrices[typicalPrices.length - 1] - tpMean) / (0.015 * meanDev);
};

const calculateROC = (data, period = 10) => {
  if (!Array.isArray(data) || data.length <= period) return null;
  const currentClose = toSafeNumber(data[data.length - 1].close);
  const pastClose = toSafeNumber(data[data.length - 1 - period].close);
  if (currentClose === null || pastClose === null || pastClose === 0) return null;
  return ((currentClose - pastClose) / pastClose) * 100;
};

const calculateMFI = (data, period = 14) => {
  if (!Array.isArray(data) || data.length < period + 1) return null;
  const slice = data.slice(-(period + 1));
  let positiveFlow = 0;
  let negativeFlow = 0;
  for (let i = 1; i < slice.length; i += 1) {
    const h = toSafeNumber(slice[i].high);
    const l = toSafeNumber(slice[i].low);
    const c = toSafeNumber(slice[i].close);
    const ph = toSafeNumber(slice[i - 1].high);
    const pl = toSafeNumber(slice[i - 1].low);
    const pc = toSafeNumber(slice[i - 1].close);
    const vol = toSafeNumber(slice[i].volume, 0);
    if ([h, l, c, ph, pl, pc].some((v) => v === null)) continue;
    const tp = (h + l + c) / 3;
    const prevTp = (ph + pl + pc) / 3;
    const rawFlow = tp * vol;
    if (tp > prevTp) positiveFlow += rawFlow;
    else if (tp < prevTp) negativeFlow += rawFlow;
  }
  if (negativeFlow === 0) return positiveFlow > 0 ? 100 : 50;
  return 100 - 100 / (1 + positiveFlow / negativeFlow);
};

const calculateOBVValues = (data) => {
  if (!Array.isArray(data) || data.length < 2) return { obv: null, obvSlope5: null };
  let obv = 0;
  const obvSeries = [0];
  for (let i = 1; i < data.length; i += 1) {
    const c = toSafeNumber(data[i].close);
    const pc = toSafeNumber(data[i - 1].close);
    const vol = toSafeNumber(data[i].volume, 0);
    if (c !== null && pc !== null) {
      if (c > pc) obv += vol;
      else if (c < pc) obv -= vol;
    }
    obvSeries.push(obv);
  }
  const slope5 =
    obvSeries.length >= 6
      ? obvSeries[obvSeries.length - 1] - obvSeries[obvSeries.length - 6]
      : null;
  return { obv, obvSlope5: slope5 };
};

export const buildMlFeatureSnapshot = (klineData, options = {}) => {
  if (!Array.isArray(klineData) || klineData.length < 26) {
    return null;
  }

  const latest = klineData[klineData.length - 1];
  const latestOpen = toSafeNumber(latest.open);
  const latestHigh = toSafeNumber(latest.high);
  const latestLow = toSafeNumber(latest.low);
  const latestClose = toSafeNumber(latest.close);
  const latestVolume = toSafeNumber(latest.volume, 0);
  const timeframe = options.timeframe || "1h";
  const leverage = toSafeNumber(options.leverage, 10);
  const signalType = getSignalTypeName(options.signalType);

  const rsiSeries = calculateRSI(klineData, 14);
  const macdSeries = calculateMACD(klineData, 12, 26, 9);
  const ema20Series = calculateEMA(klineData, 20);
  const sma20Series = calculateSMA(klineData, 20);
  const sma200Series = klineData.length >= 200 ? calculateSMA(klineData, 200) : [];
  const bollingerSeries = calculateBollingerBands(klineData, 20, 2);
  const stochasticSeries = calculateStochastic(klineData, 14, 3, 3);
  const atr14 = calculateATRValue(klineData, 14);
  const supplyDemand = calculateSupplyDemandZones(klineData, 10, 50, 5);
  const fvg = calculateFairValueGaps(klineData);

  const rsi14 = getLastValue(rsiSeries);
  const macdLine = getLastValue(macdSeries.macdLine);
  const macdSignal = getLastValue(macdSeries.signalLine);
  const macdHistogram = getLastValue(macdSeries.histogram);
  const prevMacdLine = getPrevValue(macdSeries.macdLine);
  const prevMacdSignal = getPrevValue(macdSeries.signalLine);
  const ema20 = getLastValue(ema20Series);
  const sma20 = getLastValue(sma20Series);
  const sma200 = getLastValue(sma200Series);
  const bollingerUpper = getLastValue(bollingerSeries.upper);
  const bollingerLower = getLastValue(bollingerSeries.lower);
  const stochasticK = getLastValue(stochasticSeries.percentK);
  const stochasticD = getLastValue(stochasticSeries.percentD);

  // --- Additional fallback indicators ---
  const cci20 = calculateCCI(klineData, 20);
  const roc10 = calculateROC(klineData, 10);
  const mfi14 = calculateMFI(klineData, 14);
  const { obv, obvSlope5 } = calculateOBVValues(klineData);
  const bollingerPercentB =
    Number.isFinite(bollingerUpper) &&
    Number.isFinite(bollingerLower) &&
    bollingerUpper !== bollingerLower
      ? (latestClose - bollingerLower) / (bollingerUpper - bollingerLower)
      : null;

  const priceVsEmaPct = toPct(latestClose - ema20, ema20);
  const priceVsSmaPct = toPct(latestClose - sma20, sma20);
  const priceVsSma200Pct = toPct(latestClose - sma200, sma200);
  const emaSmaSpreadPct = toPct(ema20 - sma20, sma20);
  const atrPct = toPct(atr14, latestClose);
  const candleRangePct = toPct(latestHigh - latestLow, latestClose);
  const candleBodyPct = toPct(Math.abs(latestClose - latestOpen), latestClose);
  const upperWickPct = toPct(latestHigh - Math.max(latestOpen, latestClose), latestClose);
  const lowerWickPct = toPct(Math.min(latestOpen, latestClose) - latestLow, latestClose);
  const bullishStrength = latestClose >= latestOpen ? candleBodyPct : 0;
  const bearishStrength = latestClose < latestOpen ? candleBodyPct : 0;
  const volumeSma20 =
    klineData.length >= 20
      ? klineData
          .slice(-20)
          .reduce((sum, candle) => sum + toSafeNumber(candle.volume, 0), 0) / 20
      : null;
  const relativeVolume =
    Number.isFinite(volumeSma20) && volumeSma20 !== 0 ? latestVolume / volumeSma20 : null;
  const macdCrossoverDirection =
    Number.isFinite(prevMacdLine) &&
    Number.isFinite(prevMacdSignal) &&
    Number.isFinite(macdLine) &&
    Number.isFinite(macdSignal)
      ? prevMacdLine <= prevMacdSignal && macdLine > macdSignal
        ? "BULLISH"
        : prevMacdLine >= prevMacdSignal && macdLine < macdSignal
          ? "BEARISH"
          : "NONE"
      : "UNKNOWN";
  const macdCrossoverStrength =
    Number.isFinite(macdLine) && Number.isFinite(macdSignal) ? Math.abs(macdLine - macdSignal) : null;
  const bollingerBandWidthPct =
    Number.isFinite(bollingerUpper) && Number.isFinite(bollingerLower)
      ? toPct(bollingerUpper - bollingerLower, latestClose)
      : null;
  const trendDirection = getTrendDirection(latestClose, ema20, sma20, sma200);
  const trendStrength = Math.max(
    Math.abs(priceVsEmaPct ?? 0),
    Math.abs(priceVsSmaPct ?? 0),
    Math.abs(emaSmaSpreadPct ?? 0),
  );
  const marketRegime = getMarketRegime(
    trendDirection,
    atrPct,
    bollingerBandWidthPct,
  );

  return {
    featureVersion: "v1",
    generatedAt: new Date().toISOString(),
    source: "manual_indicator_service",
    momentum: {
      rsi14,
      macdLine,
      macdSignal,
      macdHistogram,
      macdCrossoverDirection,
      macdCrossoverStrength,
      stochasticK,
      stochasticD,
      cci20,
      roc10,
    },
    trend: {
      ema20,
      ema50: null,
      sma20,
      sma50: null,
      sma200,
      emaSmaSpreadPct,
      priceVsEmaPct,
      priceVsSmaPct,
      priceVsSma200Pct,
      trendDirection,
      trendStrength,
      adx14: null,
      dmiPlus14: null,
      dmiMinus14: null,
    },
    volatility: {
      atr14,
      atrPct,
      candleRangePct,
      bollingerBandWidthPct,
      bollingerPercentB,
      natr14: atrPct,
      volatilityPct: Math.max(atrPct ?? 0, candleRangePct ?? 0, bollingerBandWidthPct ?? 0),
    },
    volume: {
      volume: latestVolume,
      volumeSma20,
      relativeVolume,
      mfi14,
      obv,
      obvSlope5,
    },
    structure: {
      activeZoneBias: supplyDemand?.bias || "NONE",
      nearestSupplyTop: supplyDemand?.supply?.top ?? null,
      nearestSupplyBottom: supplyDemand?.supply?.bottom ?? null,
      nearestSupplyPoi: supplyDemand?.supply?.poi ?? null,
      nearestSupplyDistancePct: supplyDemand?.supply?.distancePct ?? null,
      nearestDemandTop: supplyDemand?.demand?.top ?? null,
      nearestDemandBottom: supplyDemand?.demand?.bottom ?? null,
      nearestDemandPoi: supplyDemand?.demand?.poi ?? null,
      nearestDemandDistancePct: supplyDemand?.demand?.distancePct ?? null,
      nearestFvgBias: fvg?.bias || "NONE",
      bullishFvgTop: fvg?.bullish?.max ?? null,
      bullishFvgBottom: fvg?.bullish?.min ?? null,
      bullishFvgDistancePct: fvg?.bullish?.distancePct ?? null,
      bullishFvgSizePct: fvg?.bullish?.sizePct ?? null,
      bearishFvgTop: fvg?.bearish?.max ?? null,
      bearishFvgBottom: fvg?.bearish?.min ?? null,
      bearishFvgDistancePct: fvg?.bearish?.distancePct ?? null,
      bearishFvgSizePct: fvg?.bearish?.sizePct ?? null,
    },
    candle: {
      bodyPct: candleBodyPct,
      upperWickPct,
      lowerWickPct,
      bullishStrength,
      bearishStrength,
      isBullish: latestClose >= latestOpen,
    },
    context: {
      signalType,
      timeframe,
      leverage,
      marketRegime,
      closePrice: latestClose,
      openPrice: latestOpen,
      highPrice: latestHigh,
      lowPrice: latestLow,
    },
  };
};

export const buildMlFeatureSnapshotWithFallback = async (
  klineData,
  options = {},
) => {
  const manualSnapshot = buildMlFeatureSnapshot(klineData, options);
  if (!manualSnapshot) {
    return null;
  }

  try {
    const response = await requestFeatureSnapshot(klineData, options);
    if (response?.featureSnapshot) {
      return response.featureSnapshot;
    }
  } catch (error) {
    console.warn(
      "ML feature service unavailable, falling back to manual indicator snapshot:",
      error.response?.data?.detail || error.message,
    );
  }

  return manualSnapshot;
};

export default {
  buildMlFeatureSnapshot,
  buildMlFeatureSnapshotWithFallback,
  calculateATRValue,
};
