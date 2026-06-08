from __future__ import annotations

from app.ml.quality import (
    build_feature_vector_quality,
    build_normalization_report,
    compute_feature_drift,
    evaluate_model_quality,
    summarize_feature_rows,
)


def test_feature_row_summary_reports_missing_and_distribution():
    summary = summarize_feature_rows(
        [
            {"a": 1, "b": 0},
            {"a": 3},
            {"a": None, "b": 4},
        ],
        feature_columns=["a", "b"],
    )

    assert summary["rowCount"] == 3
    assert summary["features"]["a"]["mean"] == 2
    assert summary["features"]["a"]["missing"] == 1
    assert summary["features"]["b"]["missingRate"] == 1 / 3


def test_feature_vector_quality_marks_missing_contract_columns():
    quality = build_feature_vector_quality(
        {"momentum": {"rsi14": 45}},
        feature_columns=["momentum.rsi14", "trend.adx14"],
    )

    assert quality["status"] == "degraded"
    assert quality["presentCount"] == 1
    assert quality["missingColumns"] == ["trend.adx14"]


def test_normalization_report_exposes_contract_coverage():
    report = build_normalization_report(["volume.relativeVolume", "context.closePrice"])

    assert report["featureCount"] == 2
    assert report["normalizedFeatureCount"] == 1
    assert "volume.relativeVolume" in report["normalizedFeatures"]
    assert "context.closePrice" in report["rawFeatures"]


def test_drift_report_rates_standardized_mean_difference():
    reference = summarize_feature_rows([{"a": 1}, {"a": 2}, {"a": 3}], feature_columns=["a"])
    current = summarize_feature_rows([{"a": 10}, {"a": 11}, {"a": 12}], feature_columns=["a"])

    drift = compute_feature_drift(reference, current)

    assert drift["status"] == "high"
    assert drift["summary"]["high"] == 1
    assert drift["features"][0]["feature"] == "a"


def test_model_quality_reports_unavailable_and_degraded_states():
    unavailable = evaluate_model_quality(None)
    degraded = evaluate_model_quality(
        {
            "modelVersion": "test",
            "metrics": {"datasetRows": 10, "rocAuc": 0.5, "brierScore": 0.4},
            "promotion": {"eligible": False, "reasons": ["not promoted"]},
        }
    )

    assert unavailable["status"] == "unavailable"
    assert degraded["status"] == "degraded"
    assert "not promoted" in degraded["reasons"]
