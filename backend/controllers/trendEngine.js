// Minimal indicator implementations (for MVP)

function ema(values, period) {
  const k = 2 / (period + 1);
  let emaArray = [];
  let prev = values.slice(0, period).reduce((a, b) => a + b, 0) / period;
  emaArray[period - 1] = prev;
  for (let i = period; i < values.length; i++) {
    prev = values[i] * k + prev * (1 - k);
    emaArray[i] = prev;
  }
  return emaArray;
}

function rsi(values, period = 14) {
  if (values.length < period + 1) return null;
  let gains = 0;
  let losses = 0;
  for (let i = 1; i <= period; i++) {
    const change = values[i] - values[i - 1];
    if (change >= 0) gains += change;
    else losses += Math.abs(change);
  }
  let avgGain = gains / period;
  let avgLoss = losses / period;
  let rs = avgGain / (avgLoss || 1);
  let rsi = 100 - 100 / (1 + rs);
  return Math.round(rsi * 100) / 100;
}

function macd(values, fast = 12, slow = 26, signal = 9) {
  if (values.length < slow) return null;
  const emaFast = ema(values, fast);
  const emaSlow = ema(values, slow);
  const macdLine = [];
  for (let i = 0; i < values.length; i++) {
    if (emaFast[i] !== undefined && emaSlow[i] !== undefined) {
      macdLine[i] = emaFast[i] - emaSlow[i];
    }
  }
  // signal line (simple ema of macd)
  const validMacd = macdLine.filter((v) => v !== undefined);
  const signalLineArr = ema(validMacd, signal);
  const latestMacd = validMacd[validMacd.length - 1];
  const latestSignal = signalLineArr[signalLineArr.length - 1];
  return { macd: latestMacd || 0, signal: latestSignal || 0 };
}

exports.analyze = ({ prices = [] }) => {
  // prices: array of numbers (close prices)
  const close = prices;
  const latest = close[close.length - 1];
  const rsiVal = rsi(close) || 50;
  const macdVal = macd(close) || { macd: 0, signal: 0 };
  const ema12 = ema(close, 12);
  const ema26 = ema(close, 26);
  const latestEma12 = ema12[ema12.length - 1] || latest;
  const latestEma26 = ema26[ema26.length - 1] || latest;

  // Simple scoring
  let score = 50;
  if (rsiVal < 30) score += 10;
  else if (rsiVal > 70) score -= 10;

  if (macdVal.macd > macdVal.signal) score += 15;
  else score -= 15;

  if (latestEma12 > latestEma26) score += 10;
  else score -= 10;

  const bullish = score > 55;
  const bearish = score < 45;

  const reason = [];
  reason.push(`RSI: ${rsiVal}`);
  reason.push(`MACD: ${Math.round(macdVal.macd - macdVal.signal)}`);
  reason.push(`EMA12 vs EMA26: ${Math.round(latestEma12 - latestEma26)}`);

  return {
    latest,
    score: Math.min(100, Math.max(0, Math.round(score))),
    direction: bullish ? "bullish" : bearish ? "bearish" : "neutral",
    reasons: reason,
  };
};
