const trendEngine = require("./trendEngine");

exports.analyze = async (req, res) => {
  try {
    const { asset, timeframe, prices } = req.body;
    // prices: optional array of close prices. If not provided, return sample analysis.
    const inputPrices =
      Array.isArray(prices) && prices.length > 0
        ? prices
        : [
            1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19,
            20,
          ];
    const result = trendEngine.analyze({ prices: inputPrices });
    // add a simple confidence heuristic
    const confidence = Math.min(
      95,
      Math.max(30, Math.abs(result.score - 50) + 45),
    );
    res.json({
      asset: asset || "unknown",
      timeframe: timeframe || "1h",
      analysis: result,
      confidence,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "AI analysis failed" });
  }
};
