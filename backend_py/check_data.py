import pandas as pd

try:
    df = pd.read_csv('app/ml/data/training-data.csv')
    print("Total Rows:", len(df))
    if 'label' in df.columns:
        print("Label counts:")
        print(df['label'].value_counts())
    else:
        print("NO LABEL COLUMN!")
except Exception as e:
    print("Error:", e)
