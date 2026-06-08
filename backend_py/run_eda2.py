import pandas as pd
import numpy as np

try:
    df = pd.read_csv('c:/Users/LAKMAL/Desktop/github/Analis-AI/backend_py/training-data.csv')
    with open('eda_out.txt', 'w') as f:
        f.write(f'Columns: {len(df.columns)}\n')
        f.write(f'Label balance: {df["label"].value_counts(normalize=True).to_dict()}\n')
        numeric_cols = df.select_dtypes(include=[np.number]).columns
        if 'label' in numeric_cols:
            corrs = df[numeric_cols].corrwith(df['label']).abs().sort_values(ascending=False)
            f.write('\nTop 20 absolute correlations with label:\n')
            f.write(corrs.head(20).to_string())
        
        f.write('\n\nMissing values check (top 10):\n')
        f.write(df.isna().sum().sort_values(ascending=False).head(10).to_string())
except Exception as e:
    with open('eda_out.txt', 'w') as f:
        f.write(f'Error: {e}')
