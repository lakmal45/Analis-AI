import pandas as pd
import pandas_ta as ta
df = pd.DataFrame({'close': range(100), 'high': range(100), 'low': range(100)})
trix = ta.trix(df['close'], length=15)
if trix is not None:
    print('TRIX columns:', trix.columns.tolist())
bbands = ta.bbands(df['close'], length=20, std=2)
if bbands is not None:
    print('BBANDS columns:', bbands.columns.tolist())
