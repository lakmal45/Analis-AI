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
SignalSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 }); // TTL index

export default mongoose.model("Signal", SignalSchema);
