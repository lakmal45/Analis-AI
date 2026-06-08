from __future__ import annotations

import logging
from typing import Any

import pandas as pd

from app.ml.feature_registry import flatten_feature_snapshot
from app.ml.feature_schema import FEATURE_COLUMNS
from app.ml.model_store import load_bundle
from app.ml.quality import build_feature_vector_quality

logger = logging.getLogger(__name__)


def _prepare_feature_frame(
    features: dict[str, Any], feature_columns: list[str]
) -> pd.DataFrame:
    flattened = flatten_feature_snapshot(features)
    row = {column: flattened.get(column, None) for column in feature_columns}
    return pd.DataFrame([row], columns=feature_columns)


def get_ml_prediction(
    features: dict[str, Any], requested_model_version: str | None = None
) -> dict[str, Any] | None:
    """
    Get prediction from the ML models.
    
    Replaces Node.js mlInferenceService HTTP call. Directly loads the active
    (or requested) model bundle from the filesystem and executes predict_proba.
    """
    try:
        bundle, metadata = load_bundle(requested_model_version)
        if bundle is None or metadata is None:
            logger.warning("No ML model available or trained yet.")
            return None

        feature_columns = metadata.get("featureColumns") or FEATURE_COLUMNS
        feature_frame = _prepare_feature_frame(features, feature_columns)
        feature_quality = build_feature_vector_quality(features, feature_columns)
        transformed = bundle["imputer"].transform(feature_frame)

        # Primary XGBoost model
        xgb_model = bundle.get("model")
        if not xgb_model:
            return None
            
        xgb_probability = float(xgb_model.predict_proba(transformed)[0][1])

        # Lorentzian KNN ensemble member
        knn_probability = None
        ensemble_weights = bundle.get("ensemble_weights", {"xgboost": 1.0})
        knn_model = bundle.get("lorentzian_knn")
        knn_pipeline = bundle.get("knn_pipeline")
        knn_imputer = bundle.get("knn_imputer") # fallback for older models
        
        if knn_model is not None:
            try:
                knn_transformed = transformed
                if knn_pipeline is not None:
                    knn_transformed = knn_pipeline.transform(transformed)
                elif knn_imputer is not None:
                    knn_transformed = knn_imputer.transform(transformed)
                knn_probability = float(knn_model.predict_proba(knn_transformed)[0][1])
                raw_probability = (
                    xgb_probability * ensemble_weights.get("xgboost", 0.65)
                    + knn_probability * ensemble_weights.get("lorentzian_knn", 0.35)
                )
            except Exception as e:
                logger.warning(f"KNN prediction failed, falling back to XGB: {e}")
                raw_probability = xgb_probability
        else:
            raw_probability = xgb_probability

        # Platt scaling calibration
        calibrator = bundle.get("calibrator")
        if calibrator is not None:
            probability = float(calibrator.predict_proba([[raw_probability]])[0][1])
        else:
            probability = raw_probability

        return {
            "probability": probability,
            "rawProbability": raw_probability,
            "predictedDirection": "WIN" if probability >= 0.5 else "LOSS",
            "modelVersion": metadata.get("modelVersion"),
            "featureVersion": metadata.get("featureVersion"),
            "metrics": metadata.get("metrics", {}),
            "promotion": metadata.get("promotion", {}),
            "featureQuality": feature_quality,
            "ensemble": {
                "xgboostProbability": xgb_probability,
                "knnProbability": knn_probability,
                "weights": ensemble_weights,
            },
        }

    except Exception as exc:
        logger.error(f"Error during ML inference: {exc}", exc_info=True)
        return None
