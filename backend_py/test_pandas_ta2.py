import pandas as pd
import pandas_ta as ta
df = pd.DataFrame({'close': [float(x) for x in range(100)], 'high': [float(x+1) for x in range(100)], 'low': [float(x-1) for x in range(100)]})
trix = ta.trix(close=df['close'], length=15)
print('TRIX:', type(trix))
if trix is not None:
    print(trix.columns.tolist())
bb = ta.bbands(close=df['close'], length=20, std=2)
print('BB:', type(bb))
if bb is not None:
    print(bb.columns.tolist())
