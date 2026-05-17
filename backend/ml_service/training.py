from __future__ import annotations

import os
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

import numpy as np
import pandas as pd
from sklearn.impute import SimpleImputer
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import (
    average_precision_score,
    brier_score_loss,
    log_loss,
    roc_auc_score,
)
from sklearn.model_selection import TimeSeriesSplit
from xgboost import XGBClassifier

from feature_schema import FEATURE_COLUMNS


def load_training_frame(dataset_path: str | Path) -> pd.DataFrame:
    path = Path(dataset_path)
    if not path.exists():
        raise FileNotFoundError(f"Dataset not found: {path}")

    if path.suffix.lower() == ".csv":
        frame = pd.read_csv(path)
    else:
        raw = pd.read_json(path)
        if "samples" in raw:
            frame = pd.json_normalize(raw["samples"])
        else:
            frame = pd.json_normalize(raw.to_dict(orient="records"))

    if "label" not in frame.columns:
        raise ValueError("Training dataset is missing required 'label' column")

    return sort_training_frame(frame)


def sort_training_frame(frame: pd.DataFrame) -> pd.DataFrame:
    chronological_columns = [
        column for column in ("resolvedAt", "createdAt") if column in frame.columns
    ]
    if not chronological_columns:
        return frame.reset_index(drop=True)

    sorted_frame = frame.copy()
    for column in chronological_columns:
        sorted_frame[column] = pd.to_datetime(sorted_frame[column], errors="coerce")

    return sorted_frame.sort_values(
        chronological_columns,
        kind="stable",
        na_position="last",
    ).reset_index(drop=True)


def prepare_features(frame: pd.DataFrame) -> tuple[pd.DataFrame, pd.Series]:
    available_columns = [column for column in FEATURE_COLUMNS if column in frame.columns]
    if not available_columns:
        raise ValueError("No supported feature columns were found in the dataset")

    x_frame = frame[available_columns].copy()
    y_frame = frame["label"].astype(int)
    return x_frame, y_frame


def validate_training_frame(frame: pd.DataFrame, y_frame: pd.Series) -> None:
    if len(frame) < 60:
        raise ValueError(
            "Training dataset must contain at least 60 rows before retraining"
        )

    class_counts = y_frame.value_counts().to_dict()
    missing_classes = [label for label in (0, 1) if class_counts.get(label, 0) == 0]
    if missing_classes:
        raise ValueError(
            "Training dataset must include both WIN and LOSS samples before retraining"
        )

    min_class_count = min(class_counts.get(0, 0), class_counts.get(1, 0))
    if min_class_count < 10:
        raise ValueError(
            "Training dataset needs at least 10 WIN and 10 LOSS samples for stable calibration"
        )

    split_sizes = derive_split_sizes(len(frame))
    if min(split_sizes.values()) < 10:
        raise ValueError(
            "Training dataset is too small for chronological train/calibration/test splits"
        )


def derive_split_sizes(total_rows: int) -> dict[str, int]:
    test_rows = max(20, int(round(total_rows * 0.2)))
    calibration_rows = max(20, int(round(total_rows * 0.2)))
    train_rows = total_rows - calibration_rows - test_rows

    if train_rows < 20:
        shortage = 20 - train_rows
        reduce_test = min(shortage, max(0, test_rows - 10))
        test_rows -= reduce_test
        shortage -= reduce_test
        if shortage > 0:
            reduce_calibration = min(shortage, max(0, calibration_rows - 10))
            calibration_rows -= reduce_calibration
            shortage -= reduce_calibration
        train_rows = total_rows - calibration_rows - test_rows

    return {
        "trainRows": int(train_rows),
        "calibrationRows": int(calibration_rows),
        "testRows": int(test_rows),
    }


def build_base_model(y_train: pd.Series) -> XGBClassifier:
    positives = int((y_train == 1).sum())
    negatives = int((y_train == 0).sum())
    scale_pos_weight = negatives / positives if positives > 0 else 1.0

    return XGBClassifier(
        n_estimators=250,
        max_depth=5,
        learning_rate=0.05,
        subsample=0.9,
        colsample_bytree=0.9,
        objective="binary:logistic",
        eval_metric="logloss",
        random_state=42,
        scale_pos_weight=scale_pos_weight,
    )


def fit_calibrator(
    probabilities: np.ndarray,
    labels: pd.Series | np.ndarray,
) -> LogisticRegression | None:
    unique_labels = np.unique(np.asarray(labels))
    if unique_labels.size < 2:
        return None

    calibrator = LogisticRegression(random_state=42, max_iter=1000)
    calibrator.fit(probabilities.reshape(-1, 1), labels)
    return calibrator


def apply_calibrator(
    probabilities: np.ndarray,
    calibrator: LogisticRegression | None,
) -> np.ndarray:
    clipped = np.clip(probabilities, 1e-6, 1 - 1e-6)
    if calibrator is None:
        return clipped
    calibrated = calibrator.predict_proba(clipped.reshape(-1, 1))[:, 1]
    return np.clip(calibrated, 1e-6, 1 - 1e-6)


def compute_binary_metrics(
    labels: pd.Series | np.ndarray,
    probabilities: np.ndarray,
) -> dict[str, Any]:
    y_true = np.asarray(labels)
    y_prob = np.clip(np.asarray(probabilities), 1e-6, 1 - 1e-6)
    unique_labels = np.unique(y_true)
    predicted_positive_rate = float((y_prob >= 0.6).mean()) if y_prob.size else 0.0

    metrics = {
        "rocAuc": None,
        "prAuc": None,
        "logLoss": None,
        "brierScore": None,
        "positiveRate": float(y_true.mean()) if y_true.size else 0.0,
        "predictedPositiveRateAt60": predicted_positive_rate,
    }

    if y_prob.size == 0:
        return metrics

    metrics["logLoss"] = float(log_loss(y_true, y_prob, labels=[0, 1]))
    metrics["brierScore"] = float(brier_score_loss(y_true, y_prob))

    if unique_labels.size > 1:
        metrics["rocAuc"] = float(roc_auc_score(y_true, y_prob))
        metrics["prAuc"] = float(average_precision_score(y_true, y_prob))

    return metrics


def aggregate_fold_metrics(fold_metrics: list[dict[str, Any]]) -> dict[str, Any]:
    if not fold_metrics:
        return {
            "completedFolds": 0,
            "requestedFolds": 0,
        }

    summary: dict[str, Any] = {
        "completedFolds": len(fold_metrics),
        "requestedFolds": len(fold_metrics),
        "folds": fold_metrics,
    }

    metric_names = ("rocAuc", "prAuc", "logLoss", "brierScore")
    for name in metric_names:
        values = [
            fold[name]
            for fold in fold_metrics
            if fold.get(name) is not None and np.isfinite(fold[name])
        ]
        summary[f"{name}Mean"] = float(np.mean(values)) if values else None
        summary[f"{name}Std"] = float(np.std(values)) if values else None

    return summary


def build_walk_forward_metrics(
    x_frame: pd.DataFrame,
    y_frame: pd.Series,
) -> dict[str, Any]:
    total_rows = len(x_frame)
    requested_folds = min(5, max(2, total_rows // 60))
    splitter = TimeSeriesSplit(n_splits=requested_folds)
    folds: list[dict[str, Any]] = []

    for fold_index, (train_val_idx, test_idx) in enumerate(splitter.split(x_frame), start=1):
        if len(train_val_idx) < 30 or len(test_idx) < 10:
            continue

        calibration_rows = max(10, int(round(len(train_val_idx) * 0.2)))
        if len(train_val_idx) - calibration_rows < 20:
            continue

        train_idx = train_val_idx[:-calibration_rows]
        calibration_idx = train_val_idx[-calibration_rows:]

        y_train = y_frame.iloc[train_idx]
        y_calibration = y_frame.iloc[calibration_idx]
        y_test = y_frame.iloc[test_idx]

        if min(y_train.nunique(), y_calibration.nunique(), y_test.nunique()) < 2:
            continue

        imputer = SimpleImputer(strategy="constant", fill_value=0)
        x_train = imputer.fit_transform(x_frame.iloc[train_idx])
        x_calibration = imputer.transform(x_frame.iloc[calibration_idx])
        x_test = imputer.transform(x_frame.iloc[test_idx])

        model = build_base_model(y_train)
        model.fit(x_train, y_train)

        calibration_raw = model.predict_proba(x_calibration)[:, 1]
        calibrator = fit_calibrator(calibration_raw, y_calibration)
        test_raw = model.predict_proba(x_test)[:, 1]
        test_calibrated = apply_calibrator(test_raw, calibrator)

        fold_metrics = compute_binary_metrics(y_test, test_calibrated)
        fold_metrics.update(
            {
                "fold": fold_index,
                "trainRows": int(len(train_idx)),
                "calibrationRows": int(len(calibration_idx)),
                "testRows": int(len(test_idx)),
            }
        )
        folds.append(fold_metrics)

    aggregated = aggregate_fold_metrics(folds)
    aggregated["requestedFolds"] = requested_folds
    return aggregated


def evaluate_promotion_eligibility(metrics: dict[str, Any]) -> dict[str, Any]:
    min_dataset_rows = int(os.getenv("ML_PROMOTION_MIN_DATASET_ROWS", "250"))
    min_roc_auc = float(os.getenv("ML_PROMOTION_MIN_ROC_AUC", "0.58"))
    min_walkforward_roc_auc = float(
        os.getenv("ML_PROMOTION_MIN_WALKFORWARD_ROC_AUC", "0.56")
    )
    max_brier_score = float(os.getenv("ML_PROMOTION_MAX_BRIER_SCORE", "0.25"))

    reasons: list[str] = []
    dataset_rows = metrics.get("datasetRows")
    roc_auc = metrics.get("rocAuc")
    brier_score = metrics.get("brierScore")
    walk_forward = metrics.get("walkForward") or {}
    walk_forward_roc_auc = walk_forward.get("rocAucMean")
    completed_folds = walk_forward.get("completedFolds", 0)

    if dataset_rows is None or dataset_rows < min_dataset_rows:
        reasons.append(
            f"dataset rows {dataset_rows if dataset_rows is not None else 'N/A'} below {min_dataset_rows}"
        )

    if roc_auc is None or roc_auc < min_roc_auc:
        reasons.append(
            f"holdout ROC AUC {roc_auc if roc_auc is not None else 'N/A'} below {min_roc_auc}"
        )

    if brier_score is None or brier_score > max_brier_score:
        reasons.append(
            f"holdout Brier score {brier_score if brier_score is not None else 'N/A'} above {max_brier_score}"
        )

    if completed_folds < 2:
        reasons.append("not enough completed walk-forward folds")
    elif walk_forward_roc_auc is None or walk_forward_roc_auc < min_walkforward_roc_auc:
        reasons.append(
            f"walk-forward ROC AUC {walk_forward_roc_auc if walk_forward_roc_auc is not None else 'N/A'} below {min_walkforward_roc_auc}"
        )

    return {
        "eligible": len(reasons) == 0,
        "reasons": reasons,
        "thresholds": {
            "minDatasetRows": min_dataset_rows,
            "minRocAuc": min_roc_auc,
            "minWalkForwardRocAuc": min_walkforward_roc_auc,
            "maxBrierScore": max_brier_score,
        },
    }


def train_model(dataset_path: str | Path, notes: str | None = None) -> tuple[dict, dict]:
    frame = load_training_frame(dataset_path)
    x_frame, y_frame = prepare_features(frame)
    validate_training_frame(frame, y_frame)

    split_sizes = derive_split_sizes(len(frame))
    train_rows = split_sizes["trainRows"]
    calibration_rows = split_sizes["calibrationRows"]
    test_rows = split_sizes["testRows"]

    train_end = train_rows
    calibration_end = train_rows + calibration_rows

    x_train_frame = x_frame.iloc[:train_end]
    y_train = y_frame.iloc[:train_end]
    x_calibration_frame = x_frame.iloc[train_end:calibration_end]
    y_calibration = y_frame.iloc[train_end:calibration_end]
    x_test_frame = x_frame.iloc[calibration_end:]
    y_test = y_frame.iloc[calibration_end:]

    if min(y_train.nunique(), y_calibration.nunique(), y_test.nunique()) < 2:
        raise ValueError(
            "Each chronological split must contain both WIN and LOSS samples"
        )

    imputer = SimpleImputer(strategy="constant", fill_value=0)
    x_train = imputer.fit_transform(x_train_frame)
    x_calibration = imputer.transform(x_calibration_frame)
    x_test = imputer.transform(x_test_frame)

    model = build_base_model(y_train)
    model.fit(x_train, y_train)

    calibration_raw = model.predict_proba(x_calibration)[:, 1]
    calibrator = fit_calibrator(calibration_raw, y_calibration)
    if calibrator is None:
        raise ValueError("Calibration split must contain both WIN and LOSS samples")

    test_raw = model.predict_proba(x_test)[:, 1]
    test_calibrated = apply_calibrator(test_raw, calibrator)
    holdout_metrics = compute_binary_metrics(y_test, test_calibrated)
    walk_forward_metrics = build_walk_forward_metrics(x_frame, y_frame)
    promotion = evaluate_promotion_eligibility(
        {
            **holdout_metrics,
            "datasetRows": int(len(frame)),
            "walkForward": walk_forward_metrics,
        }
    )

    metrics = {
        **holdout_metrics,
        "trainRows": int(train_rows),
        "calibrationRows": int(calibration_rows),
        "testRows": int(test_rows),
        "datasetRows": int(len(frame)),
        "calibrationMethod": "platt_logistic_regression",
        "walkForward": walk_forward_metrics,
    }

    metadata = {
        "trainedAt": datetime.now(timezone.utc).isoformat(),
        "featureColumns": list(x_frame.columns),
        "featureVersion": "v1",
        "modelVersion": f"xgb_v1_{datetime.now(timezone.utc).strftime('%Y%m%dT%H%M%SZ')}",
        "datasetPath": str(Path(dataset_path)),
        "notes": notes,
        "metrics": metrics,
        "promotion": promotion,
    }

    bundle = {
        "model": model,
        "imputer": imputer,
        "calibrator": calibrator,
    }
    return bundle, metadata
