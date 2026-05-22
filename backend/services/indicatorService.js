/**
 * Technical Indicators Service
 * Calculates RSI, MACD, EMA, SMA, Bollinger Bands, Stochastic from candlestick data
 */

const calculateRSIValue = (avgGain, avgLoss) => {
  if (avgGain === 0 && avgLoss === 0) return 50;
  if (avgLoss === 0) return 100;
  if (avgGain === 0) return 0;

  const rs = avgGain / avgLoss;
  return 100 - 100 / (1 + rs);
};

/**
 * Smooth a series of {time, value} objects using a simple moving average.
 * @param {Array<{time: number|string, value: number}>} values
 * @param {number} period
 * @returns {Array<{time: number|string, value: number}>}
 */
const smoothSeries = (values, period) => {
  if (!values || values.length < period || period <= 0) {
    return [];
  }

  const smoothed = [];

  for (let i = period - 1; i < values.length; i++) {
    const slice = values.slice(i - period + 1, i + 1);
    const avg = slice.reduce((acc, val) => acc + val.value, 0) / period;

    smoothed.push({
      time: values[i].time,
      value: avg,
    });
  }

  return smoothed;
};

const toSafeNumber = (value) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};

const toPercent = (numerator, denominator) => {
  if (
    !Number.isFinite(numerator) ||
    !Number.isFinite(denominator) ||
    denominator === 0
  ) {
    return null;
  }

  return (numerator / denominator) * 100;
};

const calculateATRLatest = (data, period = 14) => {
  if (!data || data.length < period + 1) {
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

  let atr =
    trueRanges.slice(0, period).reduce((sum, value) => sum + value, 0) / period;
  for (let i = period; i < trueRanges.length; i += 1) {
    atr = (atr * (period - 1) + trueRanges[i]) / period;
  }

  return atr;
};

const findLatestSwingLevel = (data, swingLength = 10, type = "high") => {
  if (!data || data.length < swingLength * 2 + 1) {
    return null;
  }

  for (let i = data.length - 1 - swingLength; i >= swingLength; i -= 1) {
    const candidate = toSafeNumber(data[i][type]);
    if (!Number.isFinite(candidate)) {
      continue;
    }

    let isPivot = true;
    for (let offset = i - swingLength; offset <= i + swingLength; offset += 1) {
      if (offset === i) {
        continue;
      }

      const comparison = toSafeNumber(data[offset][type]);
      if (!Number.isFinite(comparison)) {
        continue;
      }

      if (type === "high" && comparison >= candidate) {
        isPivot = false;
        break;
      }

      if (type === "low" && comparison <= candidate) {
        isPivot = false;
        break;
      }
    }

    if (isPivot) {
      return {
        price: candidate,
        openTime: data[i].openTime,
        index: i,
      };
    }
  }

  return null;
};

const calculateSupplyDemandZones = (
  data,
  swingLength = 10,
  atrPeriod = 50,
  boxWidth = 5,
) => {
  if (!data || data.length < Math.max(26, swingLength * 2 + 1)) {
    return null;
  }

  const latestClose = toSafeNumber(data[data.length - 1].close);
  const atr = calculateATRLatest(data, atrPeriod);
  const buffer = Number.isFinite(atr) ? atr * (boxWidth / 10) : 0;
  const latestSupplyPivot = findLatestSwingLevel(data, swingLength, "high");
  const latestDemandPivot = findLatestSwingLevel(data, swingLength, "low");

  const supply = latestSupplyPivot
    ? {
        top: latestSupplyPivot.price,
        bottom: latestSupplyPivot.price - buffer,
        poi: latestSupplyPivot.price - buffer / 2,
        openTime: latestSupplyPivot.openTime,
      }
    : null;

  const demand = latestDemandPivot
    ? {
        top: latestDemandPivot.price + buffer,
        bottom: latestDemandPivot.price,
        poi: latestDemandPivot.price + buffer / 2,
        openTime: latestDemandPivot.openTime,
      }
    : null;

  const distanceToSupplyPct =
    supply && Number.isFinite(latestClose)
      ? toPercent(supply.poi - latestClose, latestClose)
      : null;
  const distanceToDemandPct =
    demand && Number.isFinite(latestClose)
      ? toPercent(latestClose - demand.poi, latestClose)
      : null;

  let bias = "NONE";
  if (
    supply &&
    demand &&
    Number.isFinite(distanceToSupplyPct) &&
    Number.isFinite(distanceToDemandPct)
  ) {
    bias =
      Math.abs(distanceToDemandPct) <= Math.abs(distanceToSupplyPct)
        ? "DEMAND"
        : "SUPPLY";
  } else if (demand) {
    bias = "DEMAND";
  } else if (supply) {
    bias = "SUPPLY";
  }

  return {
    atr,
    bias,
    supply: supply
      ? {
          ...supply,
          distancePct: distanceToSupplyPct,
        }
      : null,
    demand: demand
      ? {
          ...demand,
          distancePct: distanceToDemandPct,
        }
      : null,
  };
};

const isBullishCandle = (candle) =>
  toSafeNumber(candle.close) >= toSafeNumber(candle.open);

/**
 * Find the most recent active Fair Value Gap in the given direction.
 *
 * FIX: Removed the non-standard `sameType` (all-same-color) requirement.
 * Standard ICT FVG only requires the 3-candle gap condition; requiring all
 * three candles to share the same direction significantly under-detects real gaps.
 *
 * FIX: Bear FVG sizePct now uses firstLow (max) as denominator, consistent
 * with the Python feature_builder.
 */
const findActiveFairValueGap = (data, direction = "bull") => {
  if (!data || data.length < 3) {
    return null;
  }

  for (let i = data.length - 1; i >= 2; i -= 1) {
    const current = data[i];
    const middle = data[i - 1];
    const first = data[i - 2];

    const currentLow = toSafeNumber(current.low);
    const currentHigh = toSafeNumber(current.high);
    const middleClose = toSafeNumber(middle.close);
    const firstHigh = toSafeNumber(first.high);
    const firstLow = toSafeNumber(first.low);

    if (
      ![currentLow, currentHigh, middleClose, firstHigh, firstLow].every(
        Number.isFinite,
      )
    ) {
      continue;
    }

    if (direction === "bull") {
      // Bull FVG: gap between first candle's high and current candle's low
      const isGap = currentLow > firstHigh && middleClose > firstHigh;
      if (!isGap) {
        continue;
      }

      const min = firstHigh;
      const max = currentLow;
      let invalidated = false;
      for (let j = i + 1; j < data.length; j += 1) {
        const close = toSafeNumber(data[j].close);
        if (Number.isFinite(close) && close < min) {
          invalidated = true;
          break;
        }
      }

      if (!invalidated) {
        return {
          min,
          max,
          startTime: first.openTime,
          endTime: current.openTime,
          sizePct: toPercent(max - min, min),
        };
      }
    } else {
      // Bear FVG: gap between first candle's low and current candle's high
      const isGap = currentHigh < firstLow && middleClose < firstLow;
      if (!isGap) {
        continue;
      }

      const min = currentHigh;
      const max = firstLow;
      let invalidated = false;
      for (let j = i + 1; j < data.length; j += 1) {
        const close = toSafeNumber(data[j].close);
        if (Number.isFinite(close) && close > max) {
          invalidated = true;
          break;
        }
      }

      if (!invalidated) {
        return {
          min,
          max,
          startTime: first.openTime,
          endTime: current.openTime,
          sizePct: toPercent(max - min, max),
        };
      }
    }
  }

  return null;
};

const calculateFairValueGaps = (data) => {
  if (!data || data.length < 3) {
    return null;
  }

  const latestClose = toSafeNumber(data[data.length - 1].close);
  const bullish = findActiveFairValueGap(data, "bull");
  const bearish = findActiveFairValueGap(data, "bear");

  const bullishDistancePct =
    bullish && Number.isFinite(latestClose)
      ? toPercent(latestClose - (bullish.min + bullish.max) / 2, latestClose)
      : null;
  const bearishDistancePct =
    bearish && Number.isFinite(latestClose)
      ? toPercent((bearish.min + bearish.max) / 2 - latestClose, latestClose)
      : null;

  let bias = "NONE";
  if (
    bullish &&
    bearish &&
    Number.isFinite(bullishDistancePct) &&
    Number.isFinite(bearishDistancePct)
  ) {
    bias =
      Math.abs(bullishDistancePct) <= Math.abs(bearishDistancePct)
        ? "BULLISH"
        : "BEARISH";
  } else if (bullish) {
    bias = "BULLISH";
  } else if (bearish) {
    bias = "BEARISH";
  }

  return {
    bias,
    bullish: bullish
      ? {
          ...bullish,
          distancePct: bullishDistancePct,
        }
      : null,
    bearish: bearish
      ? {
          ...bearish,
          distancePct: bearishDistancePct,
        }
      : null,
  };
};

// Calculate Simple Moving Average (SMA)
const calculateSMA = (data, period) => {
  if (!data || data.length < period || period <= 0) {
    return [];
  }

  const sma = [];
  for (let i = period - 1; i < data.length; i++) {
    const sum = data
      .slice(i - period + 1, i + 1)
      .reduce((acc, val) => acc + val.close, 0);
    sma.push({
      time: data[i].openTime,
      value: sum / period,
    });
  }
  return sma;
};

// Calculate Exponential Moving Average (EMA)
const calculateEMA = (data, period) => {
  if (!data || data.length < period || period <= 0) {
    return [];
  }

  const multiplier = 2 / (period + 1);
  const ema = [];

  // First EMA value uses SMA as the seed
  const sma =
    data.slice(0, period).reduce((acc, val) => acc + val.close, 0) / period;
  ema.push({ time: data[period - 1].openTime, value: sma });

  for (let i = period; i < data.length; i++) {
    const prevEma = ema[ema.length - 1].value;
    const currentPrice = data[i].close;
    const currentEma = (currentPrice - prevEma) * multiplier + prevEma;
    ema.push({ time: data[i].openTime, value: currentEma });
  }

  return ema;
};

// Calculate Relative Strength Index (RSI)
const calculateRSI = (data, period = 14) => {
  if (!data || data.length <= period || period <= 0) {
    return [];
  }

  const rsi = [];
  const changes = [];

  for (let i = 1; i < data.length; i++) {
    changes.push(data[i].close - data[i - 1].close);
  }

  let avgGain = 0;
  let avgLoss = 0;

  for (let i = 0; i < period; i++) {
    if (changes[i] > 0) {
      avgGain += changes[i];
    } else {
      avgLoss += Math.abs(changes[i]);
    }
  }

  avgGain /= period;
  avgLoss /= period;

  rsi.push({
    time: data[period].openTime,
    value: calculateRSIValue(avgGain, avgLoss),
  });

  for (let i = period + 1; i < data.length; i++) {
    const change = changes[i - 1];
    const gain = change > 0 ? change : 0;
    const loss = change < 0 ? Math.abs(change) : 0;

    avgGain = (avgGain * (period - 1) + gain) / period;
    avgLoss = (avgLoss * (period - 1) + loss) / period;

    rsi.push({
      time: data[i].openTime,
      value: calculateRSIValue(avgGain, avgLoss),
    });
  }

  return rsi;
};

/**
 * Calculate MACD (Moving Average Convergence Divergence)
 *
 * FIX: Replaced O(n²) Array.find() time-matching with O(1) Map lookups.
 * The previous approach could silently drop MACD/signal points if timestamps
 * had any coercion mismatch. Map lookup is both faster and more robust.
 */
const calculateMACD = (
  data,
  fastPeriod = 12,
  slowPeriod = 26,
  signalPeriod = 9,
) => {
  const fastEMA = calculateEMA(data, fastPeriod);
  const slowEMA = calculateEMA(data, slowPeriod);

  if (fastEMA.length === 0 || slowEMA.length === 0) {
    return { macdLine: [], signalLine: [], histogram: [] };
  }

  // Build a time → value map for O(1) lookup instead of O(n) find()
  const slowEmaMap = new Map(slowEMA.map((item) => [item.time, item.value]));

  const macdLine = [];
  for (const fastItem of fastEMA) {
    const slowValue = slowEmaMap.get(fastItem.time);
    if (slowValue !== undefined) {
      macdLine.push({
        time: fastItem.time,
        value: fastItem.value - slowValue,
      });
    }
  }

  // Calculate signal line (EMA of MACD line)
  const macdValues = macdLine.map((item) => ({
    close: item.value,
    openTime: item.time,
  }));
  const signalLine = calculateEMA(macdValues, signalPeriod);

  // Build signal Map for O(1) histogram lookup
  const signalMap = new Map(signalLine.map((item) => [item.time, item.value]));

  const histogram = [];
  for (const macdItem of macdLine) {
    const signalValue = signalMap.get(macdItem.time);
    if (signalValue !== undefined) {
      histogram.push({
        time: macdItem.time,
        value: macdItem.value - signalValue,
      });
    }
  }

  return { macdLine, signalLine, histogram };
};

// Calculate Bollinger Bands
const calculateBollingerBands = (data, period = 20, multiplier = 2) => {
  if (!data || data.length < period || period <= 0) {
    return { upper: [], middle: [], lower: [] };
  }

  const sma = calculateSMA(data, period);
  const upperBand = [];
  const lowerBand = [];
  const middleBand = [...sma];

  for (let i = period - 1; i < data.length; i++) {
    const slice = data.slice(i - period + 1, i + 1);
    const avg = slice.reduce((acc, val) => acc + val.close, 0) / period;

    const squaredDiffs = slice.map((val) => Math.pow(val.close - avg, 2));
    const variance = squaredDiffs.reduce((acc, val) => acc + val, 0) / period;
    const stdDev = Math.sqrt(variance);

    const time = data[i].openTime;
    upperBand.push({ time, value: avg + multiplier * stdDev });
    lowerBand.push({ time, value: avg - multiplier * stdDev });
  }

  return { upper: upperBand, middle: middleBand, lower: lowerBand };
};

// Calculate Stochastic Oscillator
const calculateStochastic = (data, period = 14, smoothK = 3, smoothD = 3) => {
  if (
    !data ||
    data.length < period ||
    period <= 0 ||
    smoothK <= 0 ||
    smoothD <= 0
  ) {
    return { percentK: [], percentD: [] };
  }

  const rawPercentKValues = [];
  for (let i = period - 1; i < data.length; i++) {
    const slice = data.slice(i - period + 1, i + 1);
    const highestHigh = Math.max(...slice.map((d) => d.high));
    const lowestLow = Math.min(...slice.map((d) => d.low));
    const currentClose = data[i].close;
    const range = highestHigh - lowestLow;

    rawPercentKValues.push({
      time: data[i].openTime,
      value: range === 0 ? 50 : ((currentClose - lowestLow) / range) * 100,
    });
  }

  const smoothedPercentK =
    smoothK === 1
      ? rawPercentKValues
      : smoothSeries(rawPercentKValues, smoothK);
  const percentDValues =
    smoothD === 1 ? smoothedPercentK : smoothSeries(smoothedPercentK, smoothD);
  const alignedK = smoothedPercentK.slice(
    smoothedPercentK.length - percentDValues.length,
  );

  return { percentK: alignedK, percentD: percentDValues };
};

/**
 * Get all indicator series + properly populated latest snapshot.
 *
 * FIX: The previous version returned a `latest` object with all null values.
 * Now computes series once and extracts latest values from the same results,
 * avoiding both the null bug and redundant double computation.
 */
const calculateAllIndicators = (klineData) => {
  if (!klineData || klineData.length < 26) {
    throw new Error(
      "Insufficient data. Need at least 26 candles for MACD calculation.",
    );
  }

  const sma20 = calculateSMA(klineData, 20);
  const sma200 = klineData.length >= 200 ? calculateSMA(klineData, 200) : [];
  const ema20 = calculateEMA(klineData, 20);
  const rsi14 = calculateRSI(klineData, 14);
  const macd = calculateMACD(klineData, 12, 26, 9);
  const bollinger = calculateBollingerBands(klineData, 20, 2);
  const stochastic = calculateStochastic(klineData, 14, 3, 3);
  const supplyDemand = calculateSupplyDemandZones(klineData);
  const fvg = calculateFairValueGaps(klineData);

  return {
    sma20,
    sma200,
    ema20,
    rsi14,
    macd,
    bollinger,
    stochastic,
    supplyDemand,
    fvg,
    latest: {
      price: klineData[klineData.length - 1].close,
      sma20: sma20.length > 0 ? sma20[sma20.length - 1].value : null,
      sma200: sma200.length > 0 ? sma200[sma200.length - 1].value : null,
      ema20: ema20.length > 0 ? ema20[ema20.length - 1].value : null,
      rsi14: rsi14.length > 0 ? rsi14[rsi14.length - 1].value : null,
      macd: {
        macdLine:
          macd.macdLine.length > 0
            ? macd.macdLine[macd.macdLine.length - 1].value
            : null,
        signalLine:
          macd.signalLine.length > 0
            ? macd.signalLine[macd.signalLine.length - 1].value
            : null,
        histogram:
          macd.histogram.length > 0
            ? macd.histogram[macd.histogram.length - 1].value
            : null,
      },
      bollinger: {
        upper:
          bollinger.upper.length > 0
            ? bollinger.upper[bollinger.upper.length - 1].value
            : null,
        middle:
          bollinger.middle.length > 0
            ? bollinger.middle[bollinger.middle.length - 1].value
            : null,
        lower:
          bollinger.lower.length > 0
            ? bollinger.lower[bollinger.lower.length - 1].value
            : null,
      },
      stochastic: {
        percentK:
          stochastic.percentK.length > 0
            ? stochastic.percentK[stochastic.percentK.length - 1].value
            : null,
        percentD:
          stochastic.percentD.length > 0
            ? stochastic.percentD[stochastic.percentD.length - 1].value
            : null,
      },
      supplyDemand,
      fvg,
    },
  };
};

// Get latest indicator values (lightweight — no full series returned)
const getLatestIndicators = (klineData) => {
  if (!klineData || klineData.length < 26) {
    return null;
  }

  const {
    sma20,
    sma200,
    ema20,
    rsi14,
    macd,
    bollinger,
    stochastic,
    supplyDemand,
    fvg,
  } = calculateAllIndicators(klineData);

  return {
    price: klineData[klineData.length - 1].close,
    sma20: sma20.length > 0 ? sma20[sma20.length - 1].value : null,
    sma200: sma200.length > 0 ? sma200[sma200.length - 1].value : null,
    ema20: ema20.length > 0 ? ema20[ema20.length - 1].value : null,
    rsi14: rsi14.length > 0 ? rsi14[rsi14.length - 1].value : null,
    macd: {
      macdLine:
        macd.macdLine.length > 0
          ? macd.macdLine[macd.macdLine.length - 1].value
          : null,
      signalLine:
        macd.signalLine.length > 0
          ? macd.signalLine[macd.signalLine.length - 1].value
          : null,
      histogram:
        macd.histogram.length > 0
          ? macd.histogram[macd.histogram.length - 1].value
          : null,
    },
    bollinger: {
      upper:
        bollinger.upper.length > 0
          ? bollinger.upper[bollinger.upper.length - 1].value
          : null,
      middle:
        bollinger.middle.length > 0
          ? bollinger.middle[bollinger.middle.length - 1].value
          : null,
      lower:
        bollinger.lower.length > 0
          ? bollinger.lower[bollinger.lower.length - 1].value
          : null,
    },
    stochastic: {
      percentK:
        stochastic.percentK.length > 0
          ? stochastic.percentK[stochastic.percentK.length - 1].value
          : null,
      percentD:
        stochastic.percentD.length > 0
          ? stochastic.percentD[stochastic.percentD.length - 1].value
          : null,
    },
    supplyDemand,
    fvg,
  };
};

/**
 * Calculate WaveTrend Oscillator (WT1 and WT2 lines).
 * Adapted from LazyBear's implementation, used in the Lorentzian Classification.
 *
 * @param {Array} data - Candlestick data with high, low, close
 * @param {number} channelLen - Channel length for ESA (default: 10)
 * @param {number} avgLen - Average length for smoothing (default: 11)
 * @returns {{ wt1: number|null, wt2: number|null, cross: number }}
 */
const calculateWaveTrend = (data, channelLen = 10, avgLen = 11) => {
  if (!data || data.length < channelLen + avgLen + 4) {
    return { wt1: null, wt2: null, cross: 0 };
  }

  // HLC3 series
  const hlc3 = data.map((d) => (d.high + d.low + d.close) / 3);

  // ESA = EMA(hlc3, channelLen)
  const emaMultiplier = 2 / (channelLen + 1);
  const esa = [hlc3.slice(0, channelLen).reduce((s, v) => s + v, 0) / channelLen];
  for (let i = channelLen; i < hlc3.length; i++) {
    esa.push((hlc3[i] - esa[esa.length - 1]) * emaMultiplier + esa[esa.length - 1]);
  }

  // d = EMA(|hlc3 - esa|, channelLen)
  const absDevs = [];
  for (let i = 0; i < esa.length; i++) {
    absDevs.push(Math.abs(hlc3[i + (hlc3.length - esa.length)] - esa[i]));
  }
  const dEsa = [absDevs.slice(0, channelLen).reduce((s, v) => s + v, 0) / channelLen];
  for (let i = channelLen; i < absDevs.length; i++) {
    dEsa.push((absDevs[i] - dEsa[dEsa.length - 1]) * emaMultiplier + dEsa[dEsa.length - 1]);
  }

  // ci = (hlc3 - esa) / (0.015 * d)
  const ci = [];
  const esaOffset = esa.length - dEsa.length;
  const hlc3Offset = hlc3.length - dEsa.length;
  for (let i = 0; i < dEsa.length; i++) {
    const dVal = dEsa[i] === 0 ? 1 : dEsa[i];
    ci.push((hlc3[i + hlc3Offset] - esa[i + esaOffset]) / (0.015 * dVal));
  }

  // wt1 = EMA(ci, avgLen)
  const avgMultiplier = 2 / (avgLen + 1);
  if (ci.length < avgLen) return { wt1: null, wt2: null, cross: 0 };
  const wt1Arr = [ci.slice(0, avgLen).reduce((s, v) => s + v, 0) / avgLen];
  for (let i = avgLen; i < ci.length; i++) {
    wt1Arr.push((ci[i] - wt1Arr[wt1Arr.length - 1]) * avgMultiplier + wt1Arr[wt1Arr.length - 1]);
  }

  // wt2 = SMA(wt1, 4)
  if (wt1Arr.length < 4) return { wt1: null, wt2: null, cross: 0 };
  const wt2Arr = [];
  for (let i = 3; i < wt1Arr.length; i++) {
    wt2Arr.push((wt1Arr[i] + wt1Arr[i - 1] + wt1Arr[i - 2] + wt1Arr[i - 3]) / 4);
  }

  const wt1 = wt1Arr[wt1Arr.length - 1];
  const wt2 = wt2Arr[wt2Arr.length - 1];

  // Crossover detection
  let cross = 0;
  if (wt1Arr.length >= 2 && wt2Arr.length >= 2) {
    const prevWt1 = wt1Arr[wt1Arr.length - 2];
    const prevWt2 = wt2Arr[wt2Arr.length - 2];
    if (prevWt1 <= prevWt2 && wt1 > wt2) cross = 1;       // bullish
    else if (prevWt1 >= prevWt2 && wt1 < wt2) cross = -1; // bearish
  }

  return { wt1, wt2, cross };
};

export {
  calculateSMA,
  calculateEMA,
  calculateRSI,
  calculateMACD,
  calculateBollingerBands,
  calculateStochastic,
  calculateSupplyDemandZones,
  calculateFairValueGaps,
  calculateAllIndicators,
  getLatestIndicators,
  calculateWaveTrend,
};
