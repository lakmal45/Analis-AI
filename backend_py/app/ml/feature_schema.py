FEATURE_COLUMNS = [
    # ── Momentum ──────────────────────────────────────────────
    "momentum.rsi14",
    "momentum.macdCrossoverDirection",
    "momentum.stochasticK",
    "momentum.stochasticD",
    "momentum.cci20",
    "momentum.roc10",
    "momentum.williamsR14",
    "momentum.ultimateOscillator",
    "momentum.trix15",
    "momentum.ppoLine",
    "momentum.ppoHistogram",
    # ── Momentum — WaveTrend (Lorentzian Classification) ─────
    "momentum.waveTrend1",
    "momentum.waveTrend2",
    "momentum.waveTrendCross",
    # ── Trend ─────────────────────────────────────────────────
    "trend.emaSmaSpreadPct",
    "trend.priceVsEmaPct",
    "trend.priceVsSmaPct",
    "trend.priceVsSma200Pct",
    "trend.trendDirection",
    "trend.trendStrength",
    "trend.adx14",
    "trend.dmiPlus14",
    "trend.dmiMinus14",
    "trend.priceVsHmaPct",
    "trend.priceVsDemaPct",
    "trend.psarDirection",
    "trend.psarDistancePct",
    # ── Trend — Kernel Regression (Lorentzian Classification) ─
    "trend.kernelRateOfChange",
    "trend.kernelCrossoverSignal",
    "trend.priceVsKernelPct",
    # ── Volatility ────────────────────────────────────────────
    "volatility.atrPct",
    "volatility.candleRangePct",
    "volatility.bollingerBandWidthPct",
    "volatility.bollingerPercentB",
    "volatility.natr14",
    "volatility.volatilityPct",
    "volatility.donchianPositionPct",
    "volatility.donchianWidthPct",
    "volatility.keltnerPositionPct",
    "volatility.squeezeOn",
    "volatility.zscore20",
    # ── Volume ────────────────────────────────────────────────
    "volume.relativeVolume",
    "volume.mfi14",
    "volume.cmf20",
    "structure.activeZoneBias",
    "structure.nearestSupplyDistancePct",
    "structure.nearestDemandDistancePct",
    "structure.nearestFvgBias",
    "structure.bullishFvgDistancePct",
    "structure.bullishFvgSizePct",
    "structure.bearishFvgDistancePct",
    "structure.bearishFvgSizePct",
    # ── Candle ────────────────────────────────────────────────
    "candle.bodyPct",
    "candle.upperWickPct",
    "candle.lowerWickPct",
    "candle.bullishStrength",
    "candle.bearishStrength",
    "candle.isBullish",
    # ── Context ───────────────────────────────────────────────
    "context.signalType",
    "context.timeframe",
    "context.marketRegime",
    "context.preset",
    # ── Lorentzian (KNN-based pattern similarity) ─────────────
    "lorentzian.distanceAvgK8",
    "lorentzian.neighborLabelSum",
    "lorentzian.bullishNeighborPct",
    "lorentzian.distanceTrend",
    # ── Trade metadata ────────────────────────────────────────
]

# Columns that contain string/categorical values and must be
# OneHotEncoded instead of treated as numeric.
CATEGORICAL_FEATURES: set[str] = {
    # ── Previously handled ────────────────────────────────────
    "candle.isBullish",
    "context.signalType",
    "context.timeframe",
    "context.marketRegime",
    "context.preset",
    # ── Newly added (were silently coerced to 0 before) ───────
    "momentum.macdCrossoverDirection",
    "trend.trendDirection",
    "trend.psarDirection",
    "structure.activeZoneBias",
    "structure.nearestFvgBias",
    # ── Signals & Crossovers (Discrete Values) ────────────────
    "momentum.waveTrendCross",
    "trend.kernelRateOfChange",
    "trend.kernelCrossoverSignal",
    "lorentzian.distanceTrend",
    "volatility.squeezeOn",
}
