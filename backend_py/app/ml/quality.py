from __future__ import annotations

import math
from collections import Counter
from datetime import datetime, timezone
from pathlib import Path
from typing import TYPE_CHECKING, Any

import pandas as pd

from app.config import settings
from app.ml.feature_registry import FEATURE_REGISTRY_BY_PATH, flatten_feature_snapshot
from app.ml.feature_schema import FEATURE_COLUMNS

if TYPE_CHECKING:
    from sqlalchemy.ext.asyncio import AsyncSession

DRIFT_MEDIUM_THRESHOLD = 0.5
DRIFT_HIGH_THRESHOLD = 1.0


def _to_float(value: Any) -> float | None:
    try:
        parsed = float(value)
    except (TypeError, ValueError):
        return None
    return parsed if math.isfinite(parsed) else None


def _has_feature_path(features: dict[str, Any], path: str) -> bool:
    if path in features:
        return True
    current: Any = features
    for part in path.split("."):
        if not isinstance(current, dict) or part not in current:
            return False
        current = current[part]
    return True


def _get_feature_path(features: dict[str, Any], path: str) -> Any:
    if path in features:
        return features[path]
    current: Any = features
    for part in path.split("."):
        if not isinstance(current, dict) or part not in current:
            return None
        current = current[part]
    return current


def summarize_feature_rows(rows: list[dict[str, Any]], feature_columns: list[str] | None = None) -> dict[str, Any]:
    columns = feature_columns or FEATURE_COLUMNS
    total_rows = len(rows)
    features: dict[str, dict[str, Any]] = {}

    for column in columns:
        values: list[float] = []
        missing = 0
        zero_count = 0
        for row in rows:
            numeric = _to_float(row.get(column))
            if numeric is None:
                missing += 1
                continue
            if numeric == 0:
                zero_count += 1
            values.append(numeric)

        mean = sum(values) / len(values) if values else None
        variance = (
            sum((value - mean) ** 2 for value in values) / len(values)
            if values and mean is not None
            else None
        )
        features[column] = {
            "count": len(values),
            "missing": missing,
            "missingRate": missing / total_rows if total_rows else 1.0,
            "zeroRate": zero_count / len(values) if values else None,
            "mean": mean,
            "std": math.sqrt(variance) if variance is not None else None,
            "min": min(values) if values else None,
            "max": max(values) if values else None,
        }

    usable_columns = sum(1 for item in features.values() if item["count"] > 0)
    high_missing_columns = [
        column for column, item in features.items() if item["missingRate"] >= 0.25
    ]
    return {
        "rowCount": total_rows,
        "featureCount": len(columns),
        "usableFeatureCount": usable_columns,
        "highMissingFeatureCount": len(high_missing_columns),
        "highMissingFeatures": high_missing_columns[:25],
        "features": features,
    }


def build_feature_vector_quality(
    features: dict[str, Any],
    feature_columns: list[str] | None = None,
) -> dict[str, Any]:
    columns = feature_columns or FEATURE_COLUMNS
    missing_columns: list[str] = []
    non_finite_columns: list[str] = []
    zero_filled_columns: list[str] = []

    for column in columns:
        if not _has_feature_path(features, column):
            missing_columns.append(column)
            zero_filled_columns.append(column)
            continue
        if _to_float(_get_feature_path(features, column)) is None:
            non_finite_columns.append(column)
            zero_filled_columns.append(column)

    return {
        "featureCount": len(columns),
        "presentCount": len(columns) - len(missing_columns),
        "missingCount": len(missing_columns),
        "nonFiniteCount": len(non_finite_columns),
        "zeroFillCount": len(zero_filled_columns),
        "missingRate": len(missing_columns) / len(columns) if columns else 0,
        "status": "degraded" if missing_columns or non_finite_columns else "ok",
        "missingColumns": missing_columns[:25],
        "nonFiniteColumns": non_finite_columns[:25],
    }


def build_normalization_report(feature_columns: list[str] | None = None) -> dict[str, Any]:
    columns = feature_columns or FEATURE_COLUMNS
    normalized_columns = [
        column
        for column in columns
        if FEATURE_REGISTRY_BY_PATH.get(column) and FEATURE_REGISTRY_BY_PATH[column].normalized
    ]
    raw_columns = [column for column in columns if column not in normalized_columns]
    return {
        "method": "feature_contract_flattening_with_zero_fill",
        "imputation": "constant_zero",
        "scaling": "model_imputer_only",
        "featureCount": len(columns),
        "normalizedFeatureCount": len(normalized_columns),
        "rawFeatureCount": len(raw_columns),
        "normalizedCoverageRate": len(normalized_columns) / len(columns) if columns else 0,
        "normalizedFeatures": normalized_columns,
        "rawFeatures": raw_columns,
    }


def evaluate_model_quality(model_record: dict[str, Any] | None) -> dict[str, Any]:
    if not model_record:
        return {
            "status": "unavailable",
            "reasons": ["no active model"],
            "thresholds": _quality_thresholds(),
        }

    metrics = model_record.get("metrics") or {}
    promotion = model_record.get("promotion") or {}
    reasons: list[str] = []
    dataset_rows = metrics.get("datasetRows")
    roc_auc = metrics.get("rocAuc")
    brier_score = metrics.get("brierScore")
    walk_forward = metrics.get("walkForward") or {}
    walk_forward_roc_auc = walk_forward.get("rocAucMean")

    if dataset_rows is None or dataset_rows < settings.min_model_dataset_rows:
        reasons.append(
            f"dataset rows {dataset_rows if dataset_rows is not None else 'N/A'} below {settings.min_model_dataset_rows}"
        )
    if roc_auc is None or roc_auc < settings.min_model_roc_auc:
        reasons.append(
            f"holdout ROC AUC {roc_auc if roc_auc is not None else 'N/A'} below {settings.min_model_roc_auc}"
        )
    if brier_score is not None and brier_score > settings.ml_promotion_max_brier_score:
        reasons.append(f"Brier score {brier_score} above {settings.ml_promotion_max_brier_score}")
    if walk_forward_roc_auc is None or walk_forward_roc_auc < settings.ml_promotion_min_walkforward_roc_auc:
        reasons.append(
            f"walk-forward ROC AUC {walk_forward_roc_auc if walk_forward_roc_auc is not None else 'N/A'} below {settings.ml_promotion_min_walkforward_roc_auc}"
        )
    if promotion.get("eligible") is False:
        reasons.extend(promotion.get("reasons", []))

    return {
        "status": "healthy" if not reasons else "degraded",
        "reasons": list(dict.fromkeys(reasons)),
        "thresholds": _quality_thresholds(),
        "modelVersion": model_record.get("modelVersion"),
        "featureVersion": model_record.get("featureVersion"),
        "trainedAt": model_record.get("trainedAt"),
        "metrics": metrics,
        "promotion": promotion,
    }


def build_model_quality_report() -> dict[str, Any]:
    from app.ml.model_store import load_registry

    registry = load_registry()
    active_version = registry.get("activeModelVersion")
    active_model = next(
        (model for model in registry.get("models", []) if model.get("modelVersion") == active_version),
        None,
    )
    return {
        "activeModelVersion": active_version,
        "modelCount": len(registry.get("models", [])),
        "quality": evaluate_model_quality(active_model),
        "normalization": build_normalization_report(
            active_model.get("featureColumns") if active_model and active_model.get("featureColumns") else FEATURE_COLUMNS
        ),
    }


def compute_feature_drift(
    reference_summary: dict[str, Any] | None,
    current_summary: dict[str, Any],
    top_n: int = 20,
) -> dict[str, Any]:
    if not reference_summary or not reference_summary.get("features"):
        return {
            "status": "unavailable",
            "reason": "reference_feature_statistics_unavailable",
            "features": [],
            "summary": {"high": 0, "medium": 0, "low": 0},
        }

    drift_features: list[dict[str, Any]] = []
    summary = {"high": 0, "medium": 0, "low": 0}
    current_features = current_summary.get("features", {})

    for column, reference in reference_summary.get("features", {}).items():
        current = current_features.get(column)
        if not current:
            continue
        reference_mean = _to_float(reference.get("mean"))
        current_mean = _to_float(current.get("mean"))
        reference_std = _to_float(reference.get("std")) or 0.0
        current_std = _to_float(current.get("std")) or 0.0
        if reference_mean is None or current_mean is None:
            continue
        pooled_std = max(math.sqrt((reference_std**2 + current_std**2) / 2), 1e-9)
        distance = abs(current_mean - reference_mean) / pooled_std
        severity = "high" if distance >= DRIFT_HIGH_THRESHOLD else ("medium" if distance >= DRIFT_MEDIUM_THRESHOLD else "low")
        summary[severity] += 1
        drift_features.append(
            {
                "feature": column,
                "severity": severity,
                "standardizedMeanDifference": distance,
                "referenceMean": reference_mean,
                "currentMean": current_mean,
                "referenceStd": reference_std,
                "currentStd": current_std,
                "referenceMissingRate": reference.get("missingRate"),
                "currentMissingRate": current.get("missingRate"),
            }
        )

    drift_features.sort(key=lambda item: item["standardizedMeanDifference"], reverse=True)
    status = "high" if summary["high"] else ("medium" if summary["medium"] else "low")
    return {
        "status": status,
        "thresholds": {
            "mediumStandardizedMeanDifference": DRIFT_MEDIUM_THRESHOLD,
            "highStandardizedMeanDifference": DRIFT_HIGH_THRESHOLD,
        },
        "summary": summary,
        "features": drift_features[:top_n],
    }


async def collect_recent_signal_feature_rows(
    db: "AsyncSession",
    user_id: int | None = None,
    limit: int = 200,
) -> list[dict[str, Any]]:
    from sqlalchemy import select

    from app.models.signal import Signal

    stmt = select(Signal).where(Signal.features != None).order_by(Signal.created_at.desc()).limit(limit)
    if user_id is not None:
        stmt = stmt.where(Signal.user_id == user_id)
    result = await db.execute(stmt)
    rows: list[dict[str, Any]] = []
    for signal in result.scalars().all():
        if signal.features:
            rows.append(flatten_feature_snapshot(signal.features))
    return rows


async def build_drift_report(
    db: "AsyncSession",
    user_id: int | None = None,
    limit: int = 200,
) -> dict[str, Any]:
    from app.ml.model_store import load_registry

    registry = load_registry()
    active_version = registry.get("activeModelVersion")
    active_model = next(
        (model for model in registry.get("models", []) if model.get("modelVersion") == active_version),
        None,
    )
    reference_summary = active_model.get("featureStats") if active_model else None
    if reference_summary is None and active_model and active_model.get("datasetPath"):
        reference_summary = load_dataset_feature_stats(active_model["datasetPath"])

    current_rows = await collect_recent_signal_feature_rows(db, user_id=user_id, limit=limit)
    current_summary = summarize_feature_rows(current_rows)
    drift = compute_feature_drift(reference_summary, current_summary)
    return {
        "activeModelVersion": active_version,
        "currentWindow": {
            "source": "recent_signals",
            "limit": limit,
            "rowCount": current_summary["rowCount"],
        },
        "referenceWindow": {
            "source": "training_feature_stats" if active_model and active_model.get("featureStats") else "dataset_path",
            "rowCount": reference_summary.get("rowCount") if reference_summary else 0,
        },
        "currentQuality": {
            key: current_summary[key]
            for key in ("rowCount", "featureCount", "usableFeatureCount", "highMissingFeatureCount", "highMissingFeatures")
        },
        "drift": drift,
    }


def load_dataset_feature_stats(dataset_path: str | Path) -> dict[str, Any] | None:
    path = Path(dataset_path)
    if not path.exists():
        return None
    try:
        frame = pd.read_csv(path) if path.suffix.lower() == ".csv" else pd.read_json(path)
    except Exception:
        return None
    rows = frame.to_dict(orient="records")
    return summarize_feature_rows(rows)


async def build_ml_signal_analytics(
    db: "AsyncSession",
    user_id: int | None = None,
    limit: int = 500,
) -> dict[str, Any]:
    from sqlalchemy import select

    from app.models.signal import Signal

    stmt = select(Signal).order_by(Signal.created_at.desc()).limit(limit)
    if user_id is not None:
        stmt = stmt.where(Signal.user_id == user_id)
    result = await db.execute(stmt)
    signals = result.scalars().all()

    total = len(signals)
    completed = [signal for signal in signals if signal.outcome in ("WIN", "LOSS")]
    wins = sum(1 for signal in completed if signal.outcome == "WIN")
    ml_signals = [signal for signal in signals if signal.ml and signal.ml.get("probability") is not None]
    probabilities = [_to_float(signal.ml.get("probability")) for signal in ml_signals]
    probabilities = [value for value in probabilities if value is not None]
    confidence_values = [_to_float(signal.confidence) for signal in signals]
    confidence_values = [value for value in confidence_values if value is not None]
    model_versions = Counter(
        signal.ml.get("modelVersion") for signal in ml_signals if signal.ml.get("modelVersion")
    )

    return {
        "window": {"limit": limit, "totalSignals": total},
        "outcomes": {
            "completed": len(completed),
            "wins": wins,
            "losses": len(completed) - wins,
            "winRate": wins / len(completed) * 100 if completed else 0,
        },
        "mlCoverage": {
            "signalsWithMl": len(ml_signals),
            "coverageRate": len(ml_signals) / total * 100 if total else 0,
            "averageProbabilityPct": (sum(probabilities) / len(probabilities) * 100) if probabilities else 0,
            "modelVersions": dict(model_versions),
        },
        "confidence": {
            "averageConfidence": sum(confidence_values) / len(confidence_values) if confidence_values else 0,
        },
        "generatedAt": datetime.now(timezone.utc).isoformat(),
    }


def _quality_thresholds() -> dict[str, Any]:
    return {
        "minDatasetRows": settings.min_model_dataset_rows,
        "minRocAuc": settings.min_model_roc_auc,
        "minWalkForwardRocAuc": settings.ml_promotion_min_walkforward_roc_auc,
        "maxBrierScore": settings.ml_promotion_max_brier_score,
    }
