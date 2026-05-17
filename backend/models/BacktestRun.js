import mongoose from "mongoose";

const BacktestBreakdownSchema = new mongoose.Schema(
  {
    type: { type: String, default: null },
    outcome: { type: String, default: null },
    exitReason: { type: String, default: null },
    total: { type: Number, default: 0 },
    rate: { type: Number, default: 0 },
    winRate: { type: Number, default: null },
    avgReturnPct: { type: Number, default: null },
  },
  { _id: false },
);

const BacktestRunSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    required: true,
    index: true,
  },
  symbol: {
    type: String,
    required: true,
    uppercase: true,
    trim: true,
  },
  marketType: {
    type: String,
    enum: ["FUTURES"],
    default: "FUTURES",
  },
  config: {
    timeframe: {
      type: String,
      enum: ["1m", "5m", "15m", "1h", "4h", "1d"],
      required: true,
    },
    limit: { type: Number, required: true },
    analysisWindow: { type: Number, required: true },
    warmupCandles: { type: Number, required: true },
    resolutionCandles: { type: Number, required: true },
    sampleSize: { type: Number, required: true },
    leverage: { type: Number, required: true },
    mlModel: { type: String, default: "off" },
    mlEnabled: { type: Boolean, default: false },
    intrabarPolicy: {
      type: String,
      enum: ["conservative", "optimistic"],
      required: true,
    },
    simulationModel: { type: String, required: true },
  },
  dataset: {
    totalCandles: { type: Number, required: true },
    evaluatedSetups: { type: Number, required: true },
    skippedHoldSignals: { type: Number, default: 0 },
    firstCandleAt: { type: Date, required: true },
    lastCandleAt: { type: Date, required: true },
  },
  summary: {
    totalSignals: { type: Number, default: 0 },
    wins: { type: Number, default: 0 },
    losses: { type: Number, default: 0 },
    neutrals: { type: Number, default: 0 },
    winRate: { type: Number, default: 0 },
    lossRate: { type: Number, default: 0 },
    neutralRate: { type: Number, default: 0 },
    avgReturnPct: { type: Number, default: 0 },
    avgUnderlyingMovePct: { type: Number, default: 0 },
    avgLeverage: { type: Number, default: 0 },
    avgConfidence: { type: Number, default: 0 },
    avgHoldingCandles: { type: Number, default: 0 },
    totalReturnPct: { type: Number, default: 0 },
    maxDrawdownPct: { type: Number, default: 0 },
    profitFactor: { type: Number, default: null },
    equityCurve: {
      type: [mongoose.Schema.Types.Mixed],
      default: [],
    },
    byType: {
      type: [BacktestBreakdownSchema],
      default: [],
    },
    byOutcome: {
      type: [BacktestBreakdownSchema],
      default: [],
    },
    byExitReason: {
      type: [BacktestBreakdownSchema],
      default: [],
    },
  },
  recentTrades: {
    type: [mongoose.Schema.Types.Mixed],
    default: [],
  },
  trades: {
    type: [mongoose.Schema.Types.Mixed],
    default: [],
  },
  createdAt: {
    type: Date,
    default: Date.now,
    index: true,
  },
});

BacktestRunSchema.index({ userId: 1, createdAt: -1 });
BacktestRunSchema.index({ userId: 1, symbol: 1, createdAt: -1 });

export default mongoose.model("BacktestRun", BacktestRunSchema);
