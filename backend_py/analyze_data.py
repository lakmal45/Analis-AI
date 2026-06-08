"""Quick diagnostic analysis of training data."""
import pandas as pd
import sys

print("Loading CSV...")
df = pd.read_csv(r'app\ml\data\training-data.csv')
print(f"Shape: {df.shape}")
print(f"\n=== LABEL DISTRIBUTION ===")
print(df['label'].value_counts())
print(f"\nLabel percentages:")
print(df['label'].value_counts(normalize=True) * 100)

print(f"\n=== COLUMN NAMES ({len(df.columns)} total) ===")
print(list(df.columns))

# Check which FEATURE_COLUMNS exist in the data
from app.ml.feature_schema import FEATURE_COLUMNS, CATEGORICAL_FEATURES

available = [c for c in FEATURE_COLUMNS if c in df.columns]
missing = [c for c in FEATURE_COLUMNS if c not in df.columns]
print(f"\n=== FEATURE ALIGNMENT ===")
print(f"FEATURE_COLUMNS defined: {len(FEATURE_COLUMNS)}")
print(f"Available in CSV: {len(available)}")
print(f"Missing from CSV: {len(missing)}")
if missing:
    print(f"Missing columns: {missing}")

# Check zero rates for available features
print(f"\n=== ZERO RATES (features with >80% zeros) ===")
for col in available:
    if col not in CATEGORICAL_FEATURES:
        zero_rate = (df[col] == 0).sum() / len(df) * 100
        if zero_rate > 80:
            print(f"  {col}: {zero_rate:.1f}% zeros")

# Check missing/null rates
print(f"\n=== NULL/MISSING RATES (features with >20% null) ===")
for col in available:
    null_rate = df[col].isnull().sum() / len(df) * 100
    if null_rate > 20:
        print(f"  {col}: {null_rate:.1f}% null")

# Check constant columns
print(f"\n=== CONSTANT/NEAR-CONSTANT FEATURES ===")
for col in available:
    if col not in CATEGORICAL_FEATURES:
        nunique = df[col].nunique()
        if nunique <= 3:
            print(f"  {col}: only {nunique} unique values - {df[col].value_counts().head(5).to_dict()}")

# Check label leakage - features perfectly correlated with label
print(f"\n=== POTENTIAL LABEL LEAKAGE (high correlation with label) ===")
for col in available:
    if col not in CATEGORICAL_FEATURES:
        try:
            corr = df[col].corr(df['label'])
            if abs(corr) > 0.5:
                print(f"  {col}: corr={corr:.4f}")
        except:
            pass

# Check categorical value distributions
print(f"\n=== CATEGORICAL VALUE DISTRIBUTIONS ===")
for col in available:
    if col in CATEGORICAL_FEATURES:
        print(f"  {col}: {df[col].value_counts().to_dict()}")

# Check data temporal ordering
time_cols = [c for c in ('resolvedAt', 'createdAt') if c in df.columns]
print(f"\n=== TIME COLUMNS ===")
print(f"Time columns present: {time_cols}")
if time_cols:
    for tc in time_cols:
        print(f"  {tc} range: {df[tc].min()} to {df[tc].max()}")

print("\n=== DONE ===")
