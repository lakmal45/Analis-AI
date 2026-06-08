from __future__ import annotations

import logging
from typing import Any

from app.ml.feature_schema import FEATURE_COLUMNS

logger = logging.getLogger(__name__)


def build_ml_feature_snapshot(
    candles: list[dict[str, Any]],
    options: dict[str, Any] | None = None,
) -> dict[str, Any]:
    """
    Builds the ML feature snapshot by calling the feature builder directly.

    This replaces the Node.js `getMlFeatureSnapshotWithFallback` method.
    Since the backend and ML service are now unified, the fallback logic
    has been completely removed as requested.
    """
    try:
        from app.ml.feature_builder import build_feature_snapshot

        snapshot = build_feature_snapshot(candles, options)
        return {
            "features": snapshot,
            "featureVersion": snapshot.get("featureVersion", "v4_lorentzian"),
            "source": snapshot.get("source", "native_mixed"),
            "supportedFeatureCount": len(FEATURE_COLUMNS),
        }
    except Exception as exc:
        logger.error(f"Failed to build feature snapshot: {exc}")
        raise
