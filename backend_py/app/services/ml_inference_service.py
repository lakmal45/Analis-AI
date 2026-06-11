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
    Get prediction from the active ML model (XGBoost + Platt calibration).

    Loads the active (or requested) model bundle from the filesystem and
    executes predict_proba. The 4 Lorentzian KNN features computed by the
    feature builder are included as input features to XGBoost.
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

        xgb_model = bundle.get("model")
        if not xgb_model:
            return None

        raw_probability = float(xgb_model.predict_proba(transformed)[0][1])

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
        }

    except Exception as exc:
        logger.error(f"Error during ML inference: {exc}", exc_info=True)
        return None
