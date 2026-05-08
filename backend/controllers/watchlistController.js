const Watchlist = require("../models/Watchlist");

exports.getWatchlists = async (req, res) => {
  try {
    const { userId } = req.query;
    const lists = await Watchlist.find(userId ? { userId } : {});
    res.json(lists);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Failed to fetch watchlists" });
  }
};

exports.createWatchlist = async (req, res) => {
  try {
    const { userId, assets } = req.body;
    const wl = new Watchlist({ userId, assets });
    await wl.save();
    res.json(wl);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Failed to create watchlist" });
  }
};

exports.updateWatchlist = async (req, res) => {
  try {
    const { id } = req.params;
    const updated = await Watchlist.findByIdAndUpdate(id, req.body, {
      new: true,
    });
    res.json(updated);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Failed to update" });
  }
};

exports.deleteWatchlist = async (req, res) => {
  try {
    const { id } = req.params;
    await Watchlist.findByIdAndDelete(id);
    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Failed to delete" });
  }
};
