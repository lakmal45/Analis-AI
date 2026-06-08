import sys
import pandas as pd
from app.ml.training import load_training_frame, prepare_features, validate_training_frame, derive_split_sizes

try:
    print("Loading data...")
    frame = load_training_frame("app/ml/data/training-data.csv")
    print(f"Loaded {len(frame)} rows.")
    x_frame, y_frame = prepare_features(frame)
    print("Validating...")
    validate_training_frame(frame, y_frame)
    
    split_sizes = derive_split_sizes(len(frame))
    train_rows = split_sizes["trainRows"]
    calibration_rows = split_sizes["calibrationRows"]
    test_rows = split_sizes["testRows"]
    
    train_end = train_rows
    calibration_end = train_rows + calibration_rows
    
    y_train = y_frame.iloc[:train_end]
    y_calibration = y_frame.iloc[train_end:calibration_end]
    y_test = y_frame.iloc[calibration_end:]
    
    if min(y_train.nunique(), y_calibration.nunique(), y_test.nunique()) < 2:
        print("Error: Each chronological split must contain both WIN and LOSS samples")
    else:
        print("Validation passed!")
except Exception as e:
    print("Exception:")
    import traceback
    traceback.print_exc()
