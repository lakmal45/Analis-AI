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

  // First EMA uses SMA as starting point
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

  // Calculate price changes
  for (let i = 1; i < data.length; i++) {
    changes.push(data[i].close - data[i - 1].close);
  }

  // Calculate initial average gain and loss
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

  // Calculate RSI for first point
  rsi.push({
    time: data[period].openTime,
    value: calculateRSIValue(avgGain, avgLoss),
  });

  // Calculate RSI for remaining points
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

// Calculate MACD (Moving Average Convergence Divergence)
const calculateMACD = (
  data,
  fastPeriod = 12,
  slowPeriod = 26,
  signalPeriod = 9,
) => {
  // Calculate fast and slow EMAs
  const fastEMA = calculateEMA(data, fastPeriod);
  const slowEMA = calculateEMA(data, slowPeriod);

  if (fastEMA.length === 0 || slowEMA.length === 0) {
    return {
      macdLine: [],
      signalLine: [],
      histogram: [],
    };
  }

  // Calculate MACD line (fast EMA - slow EMA)
  const macdLine = [];

  for (let i = 0; i < fastEMA.length; i++) {
    // Find corresponding slow EMA value
    const fastItem = fastEMA[i];
    const slowItem = slowEMA.find((item) => item.time === fastItem.time);

    if (slowItem) {
      macdLine.push({
        time: fastItem.time,
        value: fastItem.value - slowItem.value,
      });
    }
  }

  // Calculate signal line (EMA of MACD line)
  const macdValues = macdLine.map((item) => ({
    close: item.value,
    openTime: item.time,
  }));
  const signalLine = calculateEMA(macdValues, signalPeriod);

  // Calculate histogram (MACD - Signal)
  const histogram = [];
  for (const macdItem of macdLine) {
    const signalItem = signalLine.find((item) => item.time === macdItem.time);
    if (signalItem) {
      histogram.push({
        time: macdItem.time,
        value: macdItem.value - signalItem.value,
      });
    }
  }

  return {
    macdLine,
    signalLine,
    histogram,
  };
};

// Calculate Bollinger Bands
const calculateBollingerBands = (data, period = 20, multiplier = 2) => {
  if (!data || data.length < period || period <= 0) {
    return {
      upper: [],
      middle: [],
      lower: [],
    };
  }

  const sma = calculateSMA(data, period);
  const upperBand = [];
  const lowerBand = [];
  const middleBand = [...sma]; // Middle band is just the SMA

  for (let i = period - 1; i < data.length; i++) {
    const slice = data.slice(i - period + 1, i + 1);
    const avg = slice.reduce((acc, val) => acc + val.close, 0) / period;

    // Calculate standard deviation
    const squaredDiffs = slice.map((val) => Math.pow(val.close - avg, 2));
    const variance = squaredDiffs.reduce((acc, val) => acc + val, 0) / period;
    const stdDev = Math.sqrt(variance);

    const time = data[i].openTime;
    upperBand.push({
      time: time,
      value: avg + multiplier * stdDev,
    });
    lowerBand.push({
      time: time,
      value: avg - multiplier * stdDev,
    });
  }

  return {
    upper: upperBand,
    middle: middleBand,
    lower: lowerBand,
  };
};

// Calculate Stochastic Oscillator
const calculateStochastic = (data, period = 14, smoothK = 3, smoothD = 3) => {
  if (!data || data.length < period || period <= 0 || smoothK <= 0 || smoothD <= 0) {
    return {
      percentK: [],
      percentD: [],
    };
  }

  // Calculate raw %K values
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
    smoothK === 1 ? rawPercentKValues : smoothSeries(rawPercentKValues, smoothK);
  const percentDValues =
    smoothD === 1 ? smoothedPercentK : smoothSeries(smoothedPercentK, smoothD);
  const alignedK = smoothedPercentK.slice(smoothedPercentK.length - percentDValues.length);

  return {
    percentK: alignedK,
    percentD: percentDValues,
  };
};

// Get all indicators for a given candlestick data
const calculateAllIndicators = (klineData) => {
  if (!klineData || klineData.length < 26) {
    throw new Error(
      "Insufficient data. Need at least 26 candles for MACD calculation.",
    );
  }

  return {
    sma20: calculateSMA(klineData, 20),
    sma200: calculateSMA(klineData, 200),
    ema20: calculateEMA(klineData, 20),
    rsi14: calculateRSI(klineData, 14),
    macd: calculateMACD(klineData, 12, 26, 9),
    bollinger: calculateBollingerBands(klineData, 20, 2),
    stochastic: calculateStochastic(klineData, 14, 3, 3),
    latest: {
      price: klineData[klineData.length - 1].close,
      sma20: null,
      sma200: null,
      ema20: null,
      rsi14: null,
      macd: null,
      bollinger: null,
      stochastic: null,
    },
  };
};

// Get latest indicator values
const getLatestIndicators = (klineData) => {
  if (!klineData || klineData.length < 26) {
    return null;
  }

  const sma20 = calculateSMA(klineData, 20);
  const sma200 = klineData.length >= 200 ? calculateSMA(klineData, 200) : [];
  const ema20 = calculateEMA(klineData, 20);
  const rsi14 = calculateRSI(klineData, 14);
  const macd = calculateMACD(klineData, 12, 26, 9);
  const bollinger = calculateBollingerBands(klineData, 20, 2);
  const stochastic = calculateStochastic(klineData, 14, 3, 3);

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
  };
};

export {
  calculateSMA,
  calculateEMA,
  calculateRSI,
  calculateMACD,
  calculateBollingerBands,
  calculateStochastic,
  calculateAllIndicators,
  getLatestIndicators,
};
