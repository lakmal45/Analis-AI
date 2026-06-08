from __future__ import annotations

from dataclasses import asdict, dataclass
from typing import Any, Literal

from app.ml.feature_schema import FEATURE_COLUMNS

FeatureSource = Literal["pandas_ta", "derived", "raw", "custom"]
FeatureUsage = Literal["rule_engine", "ml_only"]
FeatureValueType = Literal["number", "boolean", "category", "string"]

FEATURE_COUNT = 103

PANDAS_TA_FEATURES = {
    "momentum.rsi14",
    "momentum.macdLine",
    "momentum.macdSignal",
    "momentum.macdHistogram",
    "momentum.stochasticK",
    "momentum.stochasticD",
    "momentum.cci20",
    "momentum.roc10",
    "momentum.williamsR14",
    "momentum.awesomeOscillator",
    "momentum.ultimateOscillator",
    "momentum.trix15",
    "momentum.ppoLine",
    "momentum.ppoHistogram",
    "trend.ema20",
    "trend.ema50",
    "trend.sma20",
    "trend.sma50",
    "trend.sma200",
    "trend.adx14",
    "trend.dmiPlus14",
    "trend.dmiMinus14",
    "trend.hma20",
    "trend.dema20",
    "trend.linregValue",
    "volatility.atr14",
    "volatility.bollingerPercentB",
    "volatility.zscore20",
    "volume.mfi14",
    "volume.obv",
    "volume.cmf20",
    "volume.adLine",
    "volume.efi13",
}

RAW_FEATURES = {
    "volume.volume",
    "context.closePrice",
    "context.openPrice",
    "context.highPrice",
    "context.lowPrice",
}

CUSTOM_FEATURES = {
    "momentum.waveTrend1",
    "momentum.waveTrend2",
    "momentum.waveTrendCross",
    "trend.kernelRqEstimate",
    "trend.kernelGaussianEstimate",
    "trend.kernelRateOfChange",
    "trend.kernelCrossoverSignal",
    "trend.priceVsKernelPct",
    "structure.activeZoneBias",
    "structure.nearestSupplyTop",
    "structure.nearestSupplyBottom",
    "structure.nearestSupplyPoi",
    "structure.nearestSupplyDistancePct",
    "structure.nearestDemandTop",
    "structure.nearestDemandBottom",
    "structure.nearestDemandPoi",
    "structure.nearestDemandDistancePct",
    "structure.nearestFvgBias",
    "structure.bullishFvgTop",
    "structure.bullishFvgBottom",
    "structure.bullishFvgDistancePct",
    "structure.bullishFvgSizePct",
    "structure.bearishFvgTop",
    "structure.bearishFvgBottom",
    "structure.bearishFvgDistancePct",
    "structure.bearishFvgSizePct",
    "lorentzian.distanceAvgK8",
    "lorentzian.neighborLabelSum",
    "lorentzian.bullishNeighborPct",
    "lorentzian.distanceTrend",
}

RULE_ENGINE_FEATURES = {
    "momentum.rsi14",
    "momentum.macdLine",
    "momentum.macdSignal",
    "momentum.macdHistogram",
    "momentum.macdCrossoverDirection",
    "momentum.stochasticK",
    "momentum.cci20",
    "momentum.roc10",
    "momentum.williamsR14",
    "momentum.awesomeOscillator",
    "momentum.ultimateOscillator",
    "momentum.waveTrend1",
    "momentum.waveTrend2",
    "momentum.ppoLine",
    "momentum.ppoHistogram",
    "momentum.trix15",
    "trend.ema20",
    "trend.adx14",
    "trend.dmiPlus14",
    "trend.dmiMinus14",
    "trend.psarDirection",
    "trend.kernelCrossoverSignal",
    "trend.priceVsKernelPct",
    "volatility.bollingerPercentB",
    "volatility.squeezeOn",
    "volatility.zscore20",
    "volatility.donchianPositionPct",
    "volatility.keltnerPositionPct",
    "volume.relativeVolume",
    "volume.mfi14",
    "volume.obvSlope5",
    "volume.cmf20",
    "volume.efi13",
    "structure.activeZoneBias",
    "structure.nearestSupplyDistancePct",
    "structure.nearestDemandDistancePct",
    "structure.nearestFvgBias",
    "structure.bullishFvgDistancePct",
    "structure.bullishFvgSizePct",
    "structure.bearishFvgDistancePct",
    "structure.bearishFvgSizePct",
    "context.marketRegime",
    "context.closePrice",
    "candle.bullishStrength",
    "candle.bearishStrength",
    "candle.bodyPct",
    "candle.lowerWickPct",
    "candle.upperWickPct",
    "lorentzian.distanceAvgK8",
    "lorentzian.bullishNeighborPct",
    "lorentzian.distanceTrend",
}

BOOLEAN_FEATURES = {
    "volatility.squeezeOn",
    "candle.isBullish",
}

CATEGORY_FEATURES = {
    "momentum.macdCrossoverDirection",
    "trend.trendDirection",
    "trend.psarDirection",
    "structure.activeZoneBias",
    "structure.nearestFvgBias",
    "context.signalType",
    "context.marketRegime",
    "context.preset",
}

STRING_FEATURES = {
    "context.timeframe",
}

NORMALIZED_FEATURES = {
    column
    for column in FEATURE_COLUMNS
    if column.endswith("Pct")
    or column.endswith("PercentB")
    or column.endswith("Ratio")
    or column.endswith("Strength")
    or column.endswith("Slope5")
    or column in {"volatility.zscore20", "volume.relativeVolume"}
}


@dataclass(frozen=True)
class FeatureDefinition:
    path: str
    category: str
    source: FeatureSource
    rule_usage: FeatureUsage
    ml_usage: bool
    value_type: FeatureValueType
    normalized: bool
    description: str

    def to_dict(self) -> dict[str, Any]:
        return asdict(self)


def _source_for(path: str) -> FeatureSource:
    if path in PANDAS_TA_FEATURES:
        return "pandas_ta"
    if path in RAW_FEATURES:
        return "raw"
    if path in CUSTOM_FEATURES:
        return "custom"
    return "derived"


def _value_type_for(path: str) -> FeatureValueType:
    if path in BOOLEAN_FEATURES:
        return "boolean"
    if path in CATEGORY_FEATURES:
        return "category"
    if path in STRING_FEATURES:
        return "string"
    return "number"


def _description_for(path: str) -> str:
    if "." in path:
        category, name = path.split(".", 1)
    else:
        category, name = "metadata", path
    readable = "".join(f" {char.lower()}" if char.isupper() else char for char in name)
    return f"{category.title()} feature: {readable.replace('_', ' ')}."


def _definition_for(path: str) -> FeatureDefinition:
    category = path.split(".", 1)[0] if "." in path else "metadata"
    return FeatureDefinition(
        path=path,
        category=category,
        source=_source_for(path),
        rule_usage="rule_engine" if path in RULE_ENGINE_FEATURES else "ml_only",
        ml_usage=True,
        value_type=_value_type_for(path),
        normalized=path in NORMALIZED_FEATURES,
        description=_description_for(path),
    )


FEATURE_REGISTRY = [_definition_for(column) for column in FEATURE_COLUMNS]
FEATURE_REGISTRY_BY_PATH = {definition.path: definition for definition in FEATURE_REGISTRY}


def flatten_feature_snapshot(features: dict[str, Any] | None) -> dict[str, Any]:
    """Return a flat FEATURE_COLUMNS keyed row from nested or already-flat features."""
    features = features or {}
    row: dict[str, Any] = {}
    for column in FEATURE_COLUMNS:
        if column in features:
            row[column] = features[column]
            continue

        current: Any = features
        missing = False
        for part in column.split("."):
            if not isinstance(current, dict) or part not in current:
                missing = True
                break
            current = current[part]
        if missing or current is None:
            if "FvgDistancePct" in column:
                row[column] = 100.0
            elif "FvgSizePct" in column:
                row[column] = 0.0
            else:
                row[column] = None
        else:
            row[column] = current
    return row


def feature_inventory() -> list[dict[str, Any]]:
    return [definition.to_dict() for definition in FEATURE_REGISTRY]

