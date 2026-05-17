import { memo } from "react";
import GlassCard from "./GlassCard";

const SignalCard = memo(({ signal, onUpdateStatus, showActions = true }) => {
  const {
    symbol,
    type,
    confidence,
    leverage,
    marketType,
    outcome,
    expectedDirection,
    actualDirection,
    performance,
    price,
    indicators,
    ml,
    reasoning,
    resolvedAt,
    resolutionSource,
    timeframe,
    status,
    createdAt,
  } = signal;

  // Determine colors based on signal type
  const getSignalColor = (type) => {
    switch (type) {
      case "BUY":
        return "text-green-400 bg-green-400/10 border-green-400/30";
      case "SELL":
        return "text-red-400 bg-red-400/10 border-red-400/30";
      case "HOLD":
        return "text-yellow-400 bg-yellow-400/10 border-yellow-400/30";
      default:
        return "text-gray-400 bg-gray-400/10 border-gray-400/30";
    }
  };

  const signalColorClass = getSignalColor(type);

  const getOutcomeColor = (value) => {
    switch (value) {
      case "WIN":
        return "text-green-400 bg-green-400/10 border-green-400/30";
      case "LOSS":
        return "text-red-400 bg-red-400/10 border-red-400/30";
      case "NEUTRAL":
        return "text-yellow-400 bg-yellow-400/10 border-yellow-400/30";
      case "CANCELLED":
        return "text-gray-400 bg-gray-400/10 border-gray-400/30";
      default:
        return "text-blue-400 bg-blue-400/10 border-blue-400/30";
    }
  };

  // Format price
  const formatPrice = (price) => {
    if (price === null || price === undefined) return "N/A";
    return price >= 1 ? `$${price.toFixed(2)}` : `$${price.toFixed(6)}`;
  };

  const formatPercent = (value) => {
    if (value === null || value === undefined) return "N/A";
    return `${value >= 0 ? "+" : ""}${value.toFixed(2)}%`;
  };

  const leveragedReturnPct =
    performance?.leveragedReturnPct ?? performance?.priceChangePct;
  const marketMovePct = performance?.marketPriceChangePct;
  const mlProbabilityPct =
    ml?.probability === null || ml?.probability === undefined
      ? null
      : ml.probability * 100;
  const isHoldSignal = type === "HOLD";
  const holdMlSkipped = isHoldSignal && ml?.predictionSource === "hold_signal_skipped";
  const mlProbabilityLabel = holdMlSkipped
    ? "Not used for HOLD"
    : mlProbabilityPct === null
      ? "N/A"
      : `${mlProbabilityPct.toFixed(1)}%`;
  const mlStatusLabel = holdMlSkipped
    ? "Not used for HOLD"
    : ml?.status || "PENDING";
  const modelVersionLabel = holdMlSkipped ? "Not used for HOLD" : ml?.modelVersion || "N/A";

  // Format date
  const formatDate = (date) => {
    return new Date(date).toLocaleString("en-US", {
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  return (
    <GlassCard className="p-6" hover={false}>
      {/* Header */}
      <div className="flex justify-between items-start mb-4">
        <div>
          <h3 className="text-xl font-bold text-white">{symbol}</h3>
          <span className="text-sm text-gray-400">
            {marketType || "FUTURES"} | {timeframe} | {leverage || 1}x
          </span>
        </div>
        <div className="text-right">
          <span
            className={`inline-block px-3 py-1 rounded-full text-sm font-bold border ${signalColorClass}`}
          >
            {type}
          </span>
          <p className="text-sm text-gray-400 mt-1">{formatDate(createdAt)}</p>
        </div>
      </div>

      {/* Confidence Bar */}
      <div className="mb-4">
        <div className="flex justify-between items-center mb-1">
          <span className="text-sm text-gray-400">Final Confidence</span>
          <span className="text-sm font-semibold text-white">
            {confidence}%
          </span>
        </div>
        <div className="w-full bg-gray-700/50 rounded-full h-2">
          <div
            className={`h-2 rounded-full transition-all duration-500 ${
              confidence >= 80
                ? "bg-green-400"
                : confidence >= 60
                  ? "bg-yellow-400"
                  : "bg-red-400"
            }`}
            style={{ width: `${confidence}%` }}
          />
        </div>
      </div>

      {ml && (
        <div className="grid grid-cols-2 gap-3 mb-4">
          <div className="bg-white/5 rounded-lg p-3">
            <p className="text-xs text-gray-400 mb-1">Rule Confidence</p>
            <p className="text-sm font-semibold text-white">
              {ml.ruleConfidence ?? confidence}%
            </p>
          </div>
          <div className="bg-white/5 rounded-lg p-3">
            <p className="text-xs text-gray-400 mb-1">ML Win Probability</p>
            <p className="text-sm font-semibold text-cyan-400">
              {mlProbabilityLabel}
            </p>
          </div>
          <div className="bg-white/5 rounded-lg p-3">
            <p className="text-xs text-gray-400 mb-1">ML Status</p>
            <p className="text-sm font-semibold text-white">
              {mlStatusLabel}
            </p>
          </div>
          <div className="bg-white/5 rounded-lg p-3">
            <p className="text-xs text-gray-400 mb-1">Model Version</p>
            <p className="text-sm font-semibold text-white">
              {modelVersionLabel}
            </p>
          </div>
        </div>
      )}

      {/* Price Info */}
      <div className="grid grid-cols-2 gap-3 mb-4">
        <div className="bg-white/5 rounded-lg p-3">
          <p className="text-xs text-gray-400 mb-1">Entry Price</p>
          <p className="text-sm font-semibold text-white">
            {formatPrice(price?.entry)}
          </p>
        </div>
        {price?.target && (
          <div className="bg-green-400/10 rounded-lg p-3">
            <p className="text-xs text-gray-400 mb-1">Target</p>
            <p className="text-sm font-semibold text-green-400">
              {formatPrice(price.target)}
            </p>
          </div>
        )}
        {price?.stopLoss && (
          <div className="bg-red-400/10 rounded-lg p-3">
            <p className="text-xs text-gray-400 mb-1">Stop Loss</p>
            <p className="text-sm font-semibold text-red-400">
              {formatPrice(price.stopLoss)}
            </p>
          </div>
        )}
        <div className="bg-white/5 rounded-lg p-3">
          <p className="text-xs text-gray-400 mb-1">Leverage</p>
          <p className="text-sm font-semibold text-cyan-400">
            {leverage || 1}x
          </p>
        </div>
        <div className="bg-white/5 rounded-lg p-3">
          <p className="text-xs text-gray-400 mb-1">Current</p>
          <p className="text-sm font-semibold text-white">
            {formatPrice(price?.current)}
          </p>
        </div>
        {status === "COMPLETED" && (
          <div className="bg-cyan-400/10 rounded-lg p-3">
            <p className="text-xs text-gray-400 mb-1">Resolved Price</p>
            <p className="text-sm font-semibold text-cyan-400">
              {formatPrice(price?.resolution)}
            </p>
          </div>
        )}
      </div>

      {(status === "COMPLETED" || outcome === "CANCELLED") && (
        <div className="mb-4 rounded-xl border border-white/10 bg-white/[0.04] p-4">
          <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
            <div>
              <p className="text-sm font-semibold text-white">Resolved Outcome</p>
              <p className="text-xs text-gray-400 mt-1">
                {resolvedAt ? `Resolved ${formatDate(resolvedAt)}` : "Awaiting resolution timestamp"}
              </p>
            </div>
            <span
              className={`inline-block px-3 py-1 rounded-full text-xs font-bold border ${getOutcomeColor(outcome)}`}
            >
              {outcome || "PENDING"}
            </span>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="rounded-lg bg-white/[0.03] p-3">
              <p className="text-xs text-gray-400 mb-1">Expected Direction</p>
              <p className="text-sm font-semibold text-white">
                {expectedDirection || "N/A"}
              </p>
            </div>
            <div className="rounded-lg bg-white/[0.03] p-3">
              <p className="text-xs text-gray-400 mb-1">Actual Direction</p>
              <p className="text-sm font-semibold text-white">
                {actualDirection || "N/A"}
              </p>
            </div>
            <div className="rounded-lg bg-white/[0.03] p-3">
              <p className="text-xs text-gray-400 mb-1">Leveraged PnL</p>
              <p
                className={`text-sm font-semibold ${
                  (leveragedReturnPct || 0) >= 0
                    ? "text-emerald-400"
                    : "text-red-400"
                }`}
              >
                {formatPercent(leveragedReturnPct)}
              </p>
            </div>
            <div className="rounded-lg bg-white/[0.03] p-3">
              <p className="text-xs text-gray-400 mb-1">Resolution Source</p>
              <p className="text-sm font-semibold text-white">
                {resolutionSource || "Manual"}
              </p>
            </div>
            <div className="rounded-lg bg-white/[0.03] p-3">
              <p className="text-xs text-gray-400 mb-1">Underlying Move</p>
              <p className="text-sm font-semibold text-white">
                {formatPercent(marketMovePct)}
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Indicators */}
      {indicators && (
        <div className="mb-4">
          <h4 className="text-sm font-semibold text-gray-300 mb-2">
            Indicators
          </h4>
          <div className="grid grid-cols-2 gap-2">
            {indicators.rsi && (
              <div className="bg-white/5 rounded p-2">
                <span className="text-xs text-gray-400">RSI</span>
                <p
                  className={`text-sm font-semibold ${
                    indicators.rsi < 30
                      ? "text-green-400"
                      : indicators.rsi > 70
                        ? "text-red-400"
                        : "text-white"
                  }`}
                >
                  {indicators.rsi.toFixed(2)}
                </p>
              </div>
            )}
            {indicators.macd && (
              <div className="bg-white/5 rounded p-2">
                <span className="text-xs text-gray-400">MACD</span>
                <p
                  className={`text-sm font-semibold ${
                    indicators.macd.histogram > 0
                      ? "text-green-400"
                      : "text-red-400"
                  }`}
                >
                  {indicators.macd.macdLine.toFixed(4)}
                </p>
              </div>
            )}
            {indicators.ema && (
              <div className="bg-white/5 rounded p-2">
                <span className="text-xs text-gray-400">EMA 20</span>
                <p className="text-sm font-semibold text-white">
                  {formatPrice(indicators.ema)}
                </p>
              </div>
            )}
            {indicators.sma && (
              <div className="bg-white/5 rounded p-2">
                <span className="text-xs text-gray-400">SMA 20</span>
                <p className="text-sm font-semibold text-white">
                  {formatPrice(indicators.sma)}
                </p>
              </div>
            )}
            {indicators.supplyDemand?.bias && indicators.supplyDemand.bias !== "NONE" && (
              <div className="bg-white/5 rounded p-2">
                <span className="text-xs text-gray-400">S/D Bias</span>
                <p
                  className={`text-sm font-semibold ${
                    indicators.supplyDemand.bias === "DEMAND"
                      ? "text-cyan-400"
                      : "text-red-400"
                  }`}
                >
                  {indicators.supplyDemand.bias}
                </p>
              </div>
            )}
            {indicators.fvg?.bias && indicators.fvg.bias !== "NONE" && (
              <div className="bg-white/5 rounded p-2">
                <span className="text-xs text-gray-400">FVG Bias</span>
                <p
                  className={`text-sm font-semibold ${
                    indicators.fvg.bias === "BULLISH"
                      ? "text-emerald-400"
                      : "text-orange-400"
                  }`}
                >
                  {indicators.fvg.bias}
                </p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Reasoning */}
      <div className="mb-4">
        <h4 className="text-sm font-semibold text-gray-300 mb-2">Analysis</h4>
        <p className="text-sm text-gray-300 leading-relaxed">{reasoning}</p>
      </div>

      {/* Status & Actions */}
      <div className="flex justify-between items-center pt-4 border-t border-white/10">
        <div className="flex flex-wrap items-center gap-2">
          <span
            className={`px-2 py-1 rounded text-xs font-medium ${
              status === "ACTIVE"
                ? "bg-blue-400/20 text-blue-400"
                : status === "COMPLETED"
                  ? "bg-green-400/20 text-green-400"
                  : "bg-gray-400/20 text-gray-400"
            }`}
          >
            {status}
          </span>
          {outcome && outcome !== "PENDING" && (
            <span
              className={`px-2 py-1 rounded text-xs font-medium border ${getOutcomeColor(outcome)}`}
            >
              {outcome}
            </span>
          )}
        </div>

        {showActions && status === "ACTIVE" && onUpdateStatus && (
          <div className="flex gap-2">
            <button
              onClick={() => onUpdateStatus(signal._id, "COMPLETED")}
              className="px-3 py-1 bg-green-400/20 text-green-400 rounded hover:bg-green-400/30 text-xs font-medium transition-colors"
            >
              Complete
            </button>
            <button
              onClick={() => onUpdateStatus(signal._id, "CANCELLED")}
              className="px-3 py-1 bg-red-400/20 text-red-400 rounded hover:bg-red-400/30 text-xs font-medium transition-colors"
            >
              Cancel
            </button>
          </div>
        )}
      </div>
    </GlassCard>
  );
});

export default SignalCard;
