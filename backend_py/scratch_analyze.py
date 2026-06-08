import pandas as pd
import sys

# Load the Excel file
df = pd.read_excel(r"c:\Users\LAKMAL\Desktop\github\Analis-AI\firts 100 rows.xlsx")

print(f"Total rows: {len(df)}")
print(f"Total columns: {len(df.columns)}")
print("=" * 80)

# Feature columns from feature_schema.py
FEATURE_COLUMNS = [
    "momentum.rsi14", "momentum.macdLine", "momentum.macdSignal",
    "momentum.macdHistogram", "momentum.macdCrossoverDirection",
    "momentum.macdCrossoverStrength", "momentum.stochasticK",
    "momentum.stochasticD", "momentum.cci20", "momentum.roc10",
    "momentum.williamsR14", "momentum.awesomeOscillator",
    "momentum.ultimateOscillator", "momentum.trix15",
    "momentum.ppoLine", "momentum.ppoHistogram",
    "momentum.waveTrend1", "momentum.waveTrend2", "momentum.waveTrendCross",
    "trend.ema20", "trend.ema50", "trend.sma20", "trend.sma50", "trend.sma200",
    "trend.emaSmaSpreadPct", "trend.priceVsEmaPct", "trend.priceVsSmaPct",
    "trend.priceVsSma200Pct", "trend.trendDirection", "trend.trendStrength",
    "trend.adx14", "trend.dmiPlus14", "trend.dmiMinus14",
    "trend.hma20", "trend.dema20", "trend.priceVsHmaPct", "trend.priceVsDemaPct",
    "trend.psarDirection", "trend.psarDistancePct", "trend.linregValue",
    "trend.kernelRqEstimate", "trend.kernelGaussianEstimate",
    "trend.kernelRateOfChange", "trend.kernelCrossoverSignal", "trend.priceVsKernelPct",
    "volatility.atr14", "volatility.atrPct", "volatility.candleRangePct",
    "volatility.bollingerBandWidthPct", "volatility.bollingerPercentB",
    "volatility.natr14", "volatility.volatilityPct",
    "volatility.donchianPositionPct", "volatility.donchianWidthPct",
    "volatility.keltnerPositionPct", "volatility.squeezeOn", "volatility.zscore20",
    "volume.volume", "volume.volumeSma20", "volume.relativeVolume",
    "volume.mfi14", "volume.obv", "volume.obvSlope5", "volume.cmf20",
    "volume.adLine", "volume.adSlope5", "volume.efi13",
    "structure.activeZoneBias", "structure.nearestSupplyTop",
    "structure.nearestSupplyBottom", "structure.nearestSupplyPoi",
    "structure.nearestSupplyDistancePct", "structure.nearestDemandTop",
    "structure.nearestDemandBottom", "structure.nearestDemandPoi",
    "structure.nearestDemandDistancePct", "structure.nearestFvgBias",
    "structure.bullishFvgTop", "structure.bullishFvgBottom",
    "structure.bullishFvgDistancePct", "structure.bullishFvgSizePct",
    "structure.bearishFvgTop", "structure.bearishFvgBottom",
    "structure.bearishFvgDistancePct", "structure.bearishFvgSizePct",
    "candle.bodyPct", "candle.upperWickPct", "candle.lowerWickPct",
    "candle.bullishStrength", "candle.bearishStrength", "candle.isBullish",
    "context.signalType", "context.timeframe", "context.leverage",
    "context.marketRegime", "context.closePrice", "context.openPrice",
    "context.highPrice", "context.lowPrice",
    "lorentzian.distanceAvgK8", "lorentzian.neighborLabelSum",
    "lorentzian.bullishNeighborPct", "lorentzian.distanceTrend",
]

CATEGORICAL_IN_CODE = {"candle.isBullish", "context.signalType", "context.timeframe", "context.marketRegime"}
FEATURE_SET = set(FEATURE_COLUMNS)

# Find non-numerical columns
non_numeric_cols = []
numeric_cols = []
for col in df.columns:
    # Try converting to numeric
    converted = pd.to_numeric(df[col], errors="coerce")
    non_numeric_count = df[col].notna().sum() - converted.notna().sum()
    
    if non_numeric_count > 0:
        # This column has values that can't be converted to numbers
        unique_vals = df[col].dropna().unique()
        sample_vals = unique_vals[:10]  # Show up to 10 unique values
        non_numeric_cols.append({
            "column": col,
            "dtype": str(df[col].dtype),
            "non_numeric_count": non_numeric_count,
            "total_non_null": int(df[col].notna().sum()),
            "unique_values": len(unique_vals),
            "sample_values": [str(v) for v in sample_vals],
            "in_feature_schema": col in FEATURE_SET,
            "in_categorical_set": col in CATEGORICAL_IN_CODE,
        })
    else:
        numeric_cols.append(col)

# Also check for columns that are object dtype but might be all numeric strings
for col in df.columns:
    if df[col].dtype == object:
        already_found = any(nc["column"] == col for nc in non_numeric_cols)
        if not already_found:
            unique_vals = df[col].dropna().unique()
            non_numeric_cols.append({
                "column": col,
                "dtype": str(df[col].dtype),
                "non_numeric_count": 0,
                "total_non_null": int(df[col].notna().sum()),
                "unique_values": len(unique_vals),
                "sample_values": [str(v) for v in unique_vals[:10]],
                "in_feature_schema": col in FEATURE_SET,
                "in_categorical_set": col in CATEGORICAL_IN_CODE,
                "note": "object dtype but all values parseable as numeric"
            })

# Also check bool columns
for col in df.columns:
    if df[col].dtype == bool:
        already_found = any(nc["column"] == col for nc in non_numeric_cols)
        if not already_found:
            unique_vals = df[col].dropna().unique()
            non_numeric_cols.append({
                "column": col,
                "dtype": str(df[col].dtype),
                "non_numeric_count": int(df[col].notna().sum()),
                "total_non_null": int(df[col].notna().sum()),
                "unique_values": len(unique_vals),
                "sample_values": [str(v) for v in unique_vals[:10]],
                "in_feature_schema": col in FEATURE_SET,
                "in_categorical_set": col in CATEGORICAL_IN_CODE,
            })

print(f"\n{'='*80}")
print(f"NON-NUMERICAL COLUMNS FOUND: {len(non_numeric_cols)}")
print(f"{'='*80}")

# Categorize
in_feature_and_categorical = []
in_feature_not_categorical = []
not_in_feature = []

for nc in non_numeric_cols:
    if nc["in_feature_schema"] and nc["in_categorical_set"]:
        in_feature_and_categorical.append(nc)
    elif nc["in_feature_schema"] and not nc["in_categorical_set"]:
        in_feature_not_categorical.append(nc)
    else:
        not_in_feature.append(nc)

print(f"\n{'─'*80}")
print("CATEGORY 1: In FEATURE_COLUMNS AND recognized as categorical (HANDLED CORRECTLY)")
print(f"{'─'*80}")
for nc in in_feature_and_categorical:
    print(f"  ✅ {nc['column']}")
    print(f"     dtype: {nc['dtype']} | non-null: {nc['total_non_null']} | unique: {nc['unique_values']}")
    print(f"     samples: {nc['sample_values']}")
    print(f"     → OneHotEncoded in pipeline")
    print()

print(f"\n{'─'*80}")
print("CATEGORY 2: In FEATURE_COLUMNS but NOT recognized as categorical (⚠️ PROBLEM)")
print(f"{'─'*80}")
for nc in in_feature_not_categorical:
    print(f"  ⚠️  {nc['column']}")
    print(f"     dtype: {nc['dtype']} | non-null: {nc['total_non_null']} | unique: {nc['unique_values']}")
    print(f"     samples: {nc['sample_values']}")
    print(f"     → pd.to_numeric(errors='coerce') → NaN → imputed to 0 → INFO LOST!")
    print()

print(f"\n{'─'*80}")
print("CATEGORY 3: NOT in FEATURE_COLUMNS (ignored by training pipeline)")
print(f"{'─'*80}")
for nc in not_in_feature:
    print(f"  🔇 {nc['column']}")
    print(f"     dtype: {nc['dtype']} | non-null: {nc['total_non_null']} | unique: {nc['unique_values']}")
    print(f"     samples: {nc['sample_values']}")
    print(f"     → Not used in training at all")
    print()

# Summary
print(f"\n{'='*80}")
print("SUMMARY")
print(f"{'='*80}")
print(f"  Total columns in dataset:                   {len(df.columns)}")
print(f"  Total non-numerical columns:                {len(non_numeric_cols)}")
print(f"  ✅ Correctly handled categorical (in feature set): {len(in_feature_and_categorical)}")
print(f"  ⚠️  In feature set but NOT categorical (DATA LOSS): {len(in_feature_not_categorical)}")
print(f"  🔇 Not in feature set (ignored):                   {len(not_in_feature)}")

# Also list all columns NOT in feature schema at all (including numeric ones)
print(f"\n{'─'*80}")
print("ALL COLUMNS NOT IN FEATURE_COLUMNS (ignored entirely):")
print(f"{'─'*80}")
all_non_feature = [c for c in df.columns if c not in FEATURE_SET]
for c in all_non_feature:
    dtype = str(df[c].dtype)
    is_numeric = dtype in ('int64', 'float64', 'int32', 'float32')
    marker = "NUM" if is_numeric else "NON-NUM"
    print(f"  [{marker:7s}] {c}  (dtype: {dtype})")
