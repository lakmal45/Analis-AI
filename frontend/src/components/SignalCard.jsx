import React from "react";
import GlassCard from "./GlassCard";

const SignalCard = ({ signal, onUpdateStatus, showActions = true }) => {
  const {
    symbol,
    type,
    confidence,
    price,
    indicators,
    reasoning,
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

  // Format price
  const formatPrice = (price) => {
    if (!price) return "N/A";
    return price >= 1 ? `$${price.toFixed(2)}` : `$${price.toFixed(6)}`;
  };

  // Format percentage
  const formatPercent = (value) => {
    if (!value && value !== 0) return "N/A";
    return `${value.toFixed(2)}%`;
  };

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
    <GlassCard className="p-6 hover:scale-[1.02] transition-transform">
      {/* Header */}
      <div className="flex justify-between items-start mb-4">
        <div>
          <h3 className="text-xl font-bold text-white">{symbol}</h3>
          <span className="text-sm text-gray-400">{timeframe} timeframe</span>
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
          <span className="text-sm text-gray-400">Confidence</span>
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
          <p className="text-xs text-gray-400 mb-1">Current</p>
          <p className="text-sm font-semibold text-white">
            {formatPrice(price?.current)}
          </p>
        </div>
      </div>

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
};

export default SignalCard;
