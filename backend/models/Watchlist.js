import mongoose from "mongoose";

const WatchlistSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    required: true,
  },
  assets: [
    {
      symbol: {
        type: String,
        required: true,
        uppercase: true,
      },
      addedAt: {
        type: Date,
        default: Date.now,
      },
    },
  ],
  createdAt: {
    type: Date,
    default: Date.now,
  },
});

// Method to add asset to watchlist
WatchlistSchema.methods.addAsset = async function (symbol) {
  // Check if asset already exists
  const exists = this.assets.some(
    (asset) => asset.symbol === symbol.toUpperCase(),
  );
  if (!exists) {
    this.assets.push({ symbol: symbol.toUpperCase() });
    await this.save();
  }
  return this;
};

// Method to remove asset from watchlist
WatchlistSchema.methods.removeAsset = async function (symbol) {
  this.assets = this.assets.filter(
    (asset) => asset.symbol !== symbol.toUpperCase(),
  );
  await this.save();
  return this;
};

// Static method to get or create watchlist for user
WatchlistSchema.statics.getOrCreateWatchlist = async function (userId) {
  let watchlist = await this.findOne({ userId });

  if (!watchlist) {
    watchlist = await this.create({ userId, assets: [] });
  }

  return watchlist;
};

export default mongoose.model("Watchlist", WatchlistSchema);
