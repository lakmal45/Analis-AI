const Signal = require("../models/Signal");

exports.listSignals = async (req, res) => {
  try {
    const signals = await Signal.find().sort({ createdAt: -1 }).limit(100);
    res.json(signals);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Failed to list signals" });
  }
};

exports.createSignal = async (req, res) => {
  try {
    const payload = req.body;
    const s = new Signal(payload);
    await s.save();
    res.json(s);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Failed to create signal" });
  }
};

exports.deleteSignal = async (req, res) => {
  try {
    const { id } = req.params;
    await Signal.findByIdAndDelete(id);
    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Failed to delete" });
  }
};
