import mongoose from "mongoose";

const SignalSchema = new mongoose.Schema({
  symbol: {
    type: String,
    required: true,
    uppercase: true,
  },
  type: {
    type: String,
    enum: ["BUY", "SELL", "HOLD"],
    required: true,
  },
  confidence: {
    type: Number,
    required: true,
    min: 0,
    max: 100,
  },
  expectedDirection: {
    type: String,
    enum: ["UP", "DOWN", "NEUTRAL"],
    required: true,
  },
  marketType: {
    type: String,
    enum: ["FUTURES"],
    default: "FUTURES",
  },
  leverage: {
    type: Number,
    min: 1,
    max: 125,
    default: 10,
  },
  indicators: {
    rsi: { type: Number },
    macd: {
      macdLine: { type: Number },
      signalLine: { type: Number },
      histogram: { type: Number },
    },
    ema: { type: Number },
    sma: { type: Number },
  },
  price: {
    entry: { type: Number, required: true },
    current: { type: Number, required: true },
    target: { type: Number },
    stopLoss: { type: Number },
    resolution: { type: Number, default: null },
  },
  outcome: {
    type: String,
    enum: ["PENDING", "WIN", "LOSS", "NEUTRAL", "CANCELLED"],
    default: "PENDING",
  },
  actualDirection: {
    type: String,
    enum: ["UP", "DOWN", "NEUTRAL"],
    default: null,
  },
  resolvedAt: {
    type: Date,
    default: null,
  },
  resolutionSource: {
    type: String,
    trim: true,
    default: null,
  },
  resolutionNotes: {
    type: String,
    trim: true,
    default: null,
  },
  performance: {
    priceChange: { type: Number, default: null },
    priceChangePct: { type: Number, default: null },
    marketPriceChangePct: { type: Number, default: null },
    leveragedReturnPct: { type: Number, default: null },
  },
  reasoning: {
    type: String,
    required: true,
  },
  timeframe: {
    type: String,
    enum: ["1m", "5m", "15m", "1h", "4h", "1d"],
    default: "1h",
  },
  status: {
    type: String,
    enum: ["ACTIVE", "COMPLETED", "CANCELLED"],
    default: "ACTIVE",
  },
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
  },
  createdAt: {
    type: Date,
    default: Date.now,
  },
  expiresAt: {
    type: Date,
    default: () => new Date(Date.now() + 24 * 60 * 60 * 1000), // 24 hours
  },
});

// Index for faster queries
SignalSchema.index({ symbol: 1, createdAt: -1 });
SignalSchema.index({ status: 1, createdAt: -1 });
SignalSchema.index({ outcome: 1, resolvedAt: -1 });
SignalSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 }); // TTL index

export default mongoose.model("Signal", SignalSchema);
