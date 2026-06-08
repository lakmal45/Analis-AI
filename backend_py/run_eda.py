import pandas as pd
import numpy as np
df = pd.read_csv('c:/Users/LAKMAL/Desktop/github/Analis-AI/backend_py/training-data.csv')
print('Columns:', len(df.columns))
print('Label balance:', df['label'].value_counts(normalize=True).to_dict())

# Numeric columns
numeric_cols = df.select_dtypes(include=[np.number]).columns
if 'label' in numeric_cols:
    corrs = df[numeric_cols].corrwith(df['label']).abs().sort_values(ascending=False)
    print('\nTop 15 absolute correlations with label:')
    print(corrs.head(16))

print('\nMissing values check (top 10):')
print(df.isna().sum().sort_values(ascending=False).head(10))

# Try converting all categorical to numbers and see if there are better correlations
# e.g., if there's any strong predictor among categorical
categorical_features = set(["candle.isBullish", "context.signalType", "context.timeframe", "context.marketRegime", "context.preset", "momentum.macdCrossoverDirection", "trend.trendDirection", "trend.psarDirection", "structure.activeZoneBias", "structure.nearestFvgBias", "momentum.waveTrendCross", "trend.kernelRateOfChange", "trend.kernelCrossoverSignal", "lorentzian.distanceTrend", "volatility.squeezeOn"])
available_cats = [c for c in categorical_features if c in df.columns]

if available_cats:
    df_encoded = pd.get_dummies(df[available_cats], drop_first=True)
    df_encoded['label'] = df['label']
    cat_corrs = df_encoded.corrwith(df_encoded['label']).abs().sort_values(ascending=False)
    print('\nTop 15 absolute correlations (categorical) with label:')
    print(cat_corrs.head(16))
