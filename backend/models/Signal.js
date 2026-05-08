const mongoose = require("mongoose");

const SignalSchema = new mongoose.Schema({
  asset: { type: String, required: true },
  timeframe: { type: String, required: true },
  direction: {
    type: String,
    enum: ["bullish", "bearish", "neutral"],
    required: true,
  },
  confidence: { type: Number, min: 0, max: 100 },
  entryZone: { type: Object },
  stopLoss: { type: Object },
  risk: { type: String },
  createdAt: { type: Date, default: Date.now },
});

module.exports = mongoose.model("Signal", SignalSchema);
