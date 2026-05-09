import mongoose from "mongoose";

const HoldingSchema = new mongoose.Schema({
  symbol: {
    type: String,
    required: true,
    uppercase: true,
  },
  quantity: {
    type: Number,
    required: true,
    min: 0,
  },
  buyPrice: {
    type: Number,
    required: true,
    min: 0,
  },
  buyDate: {
    type: Date,
    default: Date.now,
  },
  notes: {
    type: String,
    trim: true,
  },
});

const PortfolioSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    required: true,
    unique: true,
  },
  holdings: [HoldingSchema],
  createdAt: {
    type: Date,
    default: Date.now,
  },
  updatedAt: {
    type: Date,
    default: Date.now,
  },
});

// Update the updatedAt timestamp before saving
PortfolioSchema.pre("save", function () {
  this.updatedAt = new Date();
});

// Add holding to portfolio
PortfolioSchema.methods.addHolding = async function (
  symbol,
  quantity,
  buyPrice,
) {
  // Check if holding already exists
  const existingIndex = this.holdings.findIndex(
    (h) => h.symbol === symbol.toUpperCase(),
  );

  if (existingIndex >= 0) {
    // Update existing holding (average price)
    const existing = this.holdings[existingIndex];
    const totalQuantity = existing.quantity + quantity;
    const totalCost =
      existing.buyPrice * existing.quantity + buyPrice * quantity;
    existing.quantity = totalQuantity;
    existing.buyPrice = totalCost / totalQuantity;
  } else {
    // Add new holding
    this.holdings.push({
      symbol: symbol.toUpperCase(),
      quantity,
      buyPrice,
      buyDate: new Date(),
    });
  }

  await this.save();
  return this;
};

// Remove holding from portfolio
PortfolioSchema.methods.removeHolding = async function (symbol) {
  this.holdings = this.holdings.filter(
    (h) => h.symbol !== symbol.toUpperCase(),
  );
  await this.save();
  return this;
};

// Static method to get or create portfolio for user
PortfolioSchema.statics.getOrCreatePortfolio = async function (userId) {
  let portfolio = await this.findOne({ userId });

  if (!portfolio) {
    portfolio = new this({
      userId,
      holdings: [],
    });
    await portfolio.save();
  }

  return portfolio;
};

export default mongoose.model("Portfolio", PortfolioSchema);
