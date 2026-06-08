import sys
import traceback
from app.ml.training import train_model

try:
    print("Testing train_model...")
    bundle, metadata = train_model("app/ml/data/training-data.csv")
    print("Success")
except Exception as e:
    print("Failed with exception:")
    traceback.print_exc()
