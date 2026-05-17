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
    supplyDemand: {
      bias: {
        type: String,
        enum: ["SUPPLY", "DEMAND", "NONE"],
        default: "NONE",
      },
      supply: {
        top: { type: Number, default: null },
        bottom: { type: Number, default: null },
        poi: { type: Number, default: null },
        distancePct: { type: Number, default: null },
      },
      demand: {
        top: { type: Number, default: null },
        bottom: { type: Number, default: null },
        poi: { type: Number, default: null },
        distancePct: { type: Number, default: null },
      },
    },
    fvg: {
      bias: {
        type: String,
        enum: ["BULLISH", "BEARISH", "NONE"],
        default: "NONE",
      },
      bullish: {
        top: { type: Number, default: null },
        bottom: { type: Number, default: null },
        distancePct: { type: Number, default: null },
        sizePct: { type: Number, default: null },
      },
      bearish: {
        top: { type: Number, default: null },
        bottom: { type: Number, default: null },
        distancePct: { type: Number, default: null },
        sizePct: { type: Number, default: null },
      },
    },
  },
  ml: {
    status: {
      type: String,
      enum: ["PENDING", "READY", "UNAVAILABLE"],
      default: "PENDING",
    },
    ruleConfidence: { type: Number, min: 0, max: 100, default: null },
    probability: { type: Number, min: 0, max: 1, default: null },
    finalConfidence: { type: Number, min: 0, max: 100, default: null },
    featureVersion: { type: String, default: "v1" },
    modelVersion: { type: String, default: null },
    predictionSource: { type: String, default: null },
  },
  features: {
    featureVersion: { type: String, default: "v1" },
    generatedAt: { type: Date, default: null },
    momentum: {
      rsi14: { type: Number, default: null },
      macdLine: { type: Number, default: null },
      macdSignal: { type: Number, default: null },
      macdHistogram: { type: Number, default: null },
      macdCrossoverDirection: {
        type: String,
        enum: ["BULLISH", "BEARISH", "NONE", "UNKNOWN"],
        default: "UNKNOWN",
      },
      macdCrossoverStrength: { type: Number, default: null },
      stochasticK: { type: Number, default: null },
      stochasticD: { type: Number, default: null },
      cci20: { type: Number, default: null },
      roc10: { type: Number, default: null },
      // v3 expanded
      williamsR14: { type: Number, default: null },
      awesomeOscillator: { type: Number, default: null },
      ultimateOscillator: { type: Number, default: null },
      trix15: { type: Number, default: null },
      ppoLine: { type: Number, default: null },
      ppoHistogram: { type: Number, default: null },
    },
    trend: {
      ema20: { type: Number, default: null },
      ema50: { type: Number, default: null },
      sma20: { type: Number, default: null },
      sma50: { type: Number, default: null },
      sma200: { type: Number, default: null },
      emaSmaSpreadPct: { type: Number, default: null },
      priceVsEmaPct: { type: Number, default: null },
      priceVsSmaPct: { type: Number, default: null },
      priceVsSma200Pct: { type: Number, default: null },
      trendDirection: {
        type: String,
        enum: [
          "STRONG_BULLISH",
          "BULLISH",
          "SIDEWAYS",
          "BEARISH",
          "STRONG_BEARISH",
          "UNKNOWN",
        ],
        default: "UNKNOWN",
      },
      trendStrength: { type: Number, default: null },
      adx14: { type: Number, default: null },
      dmiPlus14: { type: Number, default: null },
      dmiMinus14: { type: Number, default: null },
      // v3 expanded
      hma20: { type: Number, default: null },
      dema20: { type: Number, default: null },
      priceVsHmaPct: { type: Number, default: null },
      priceVsDemaPct: { type: Number, default: null },
      psarDirection: {
        type: String,
        enum: ["BULLISH", "BEARISH", "UNKNOWN"],
        default: "UNKNOWN",
      },
      psarDistancePct: { type: Number, default: null },
      linregValue: { type: Number, default: null },
    },
    volatility: {
      atr14: { type: Number, default: null },
      atrPct: { type: Number, default: null },
      candleRangePct: { type: Number, default: null },
      bollingerBandWidthPct: { type: Number, default: null },
      bollingerPercentB: { type: Number, default: null },
      natr14: { type: Number, default: null },
      volatilityPct: { type: Number, default: null },
      // v3 expanded
      donchianPositionPct: { type: Number, default: null },
      donchianWidthPct: { type: Number, default: null },
      keltnerPositionPct: { type: Number, default: null },
      squeezeOn: { type: Boolean, default: null },
      zscore20: { type: Number, default: null },
    },
    volume: {
      volume: { type: Number, default: null },
      volumeSma20: { type: Number, default: null },
      relativeVolume: { type: Number, default: null },
      mfi14: { type: Number, default: null },
      obv: { type: Number, default: null },
      obvSlope5: { type: Number, default: null },
      // v3 expanded
      cmf20: { type: Number, default: null },
      adLine: { type: Number, default: null },
      adSlope5: { type: Number, default: null },
      efi13: { type: Number, default: null },
    },
    structure: {
      activeZoneBias: {
        type: String,
        enum: ["SUPPLY", "DEMAND", "NONE"],
        default: "NONE",
      },
      nearestSupplyTop: { type: Number, default: null },
      nearestSupplyBottom: { type: Number, default: null },
      nearestSupplyPoi: { type: Number, default: null },
      nearestSupplyDistancePct: { type: Number, default: null },
      nearestDemandTop: { type: Number, default: null },
      nearestDemandBottom: { type: Number, default: null },
      nearestDemandPoi: { type: Number, default: null },
      nearestDemandDistancePct: { type: Number, default: null },
      nearestFvgBias: {
        type: String,
        enum: ["BULLISH", "BEARISH", "NONE"],
        default: "NONE",
      },
      bullishFvgTop: { type: Number, default: null },
      bullishFvgBottom: { type: Number, default: null },
      bullishFvgDistancePct: { type: Number, default: null },
      bullishFvgSizePct: { type: Number, default: null },
      bearishFvgTop: { type: Number, default: null },
      bearishFvgBottom: { type: Number, default: null },
      bearishFvgDistancePct: { type: Number, default: null },
      bearishFvgSizePct: { type: Number, default: null },
    },
    candle: {
      bodyPct: { type: Number, default: null },
      upperWickPct: { type: Number, default: null },
      lowerWickPct: { type: Number, default: null },
      bullishStrength: { type: Number, default: null },
      bearishStrength: { type: Number, default: null },
      isBullish: { type: Boolean, default: null },
    },
    context: {
      signalType: {
        type: String,
        enum: ["BUY", "SELL", "HOLD", "UNKNOWN"],
        default: "UNKNOWN",
      },
      timeframe: {
        type: String,
        enum: ["1m", "5m", "15m", "1h", "4h", "1d"],
        default: "1h",
      },
      leverage: { type: Number, min: 1, max: 125, default: 10 },
      marketRegime: {
        type: String,
        enum: ["TRENDING", "TRENDING_VOLATILE", "RANGING", "RANGING_VOLATILE"],
        default: "RANGING",
      },
      closePrice: { type: Number, default: null },
      openPrice: { type: Number, default: null },
      highPrice: { type: Number, default: null },
      lowPrice: { type: Number, default: null },
    },
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
    default: null,
  },
});

SignalSchema.pre("save", function normalizeExpiry() {
  // Clear expiresAt for resolved signals to prevent any residual TTL behavior
  if (this.status !== "ACTIVE") {
    this.expiresAt = null;
  }
});

// Index for faster queries
SignalSchema.index({ symbol: 1, createdAt: -1 });
SignalSchema.index({ status: 1, createdAt: -1 });
SignalSchema.index({ outcome: 1, resolvedAt: -1 });
// NOTE: TTL index removed — signals are no longer auto-deleted.
// If the TTL index still exists in MongoDB, drop it manually:
//   db.signals.dropIndex("expiresAt_1")
SignalSchema.index({ expiresAt: 1 });

export default mongoose.model("Signal", SignalSchema);
