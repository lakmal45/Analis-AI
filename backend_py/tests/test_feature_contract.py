from __future__ import annotations

import os

import pytest

from app.config import settings
from app.ml.feature_registry import (
    FEATURE_COUNT,
    FEATURE_REGISTRY,
    FEATURE_REGISTRY_BY_PATH,
    RULE_ENGINE_FEATURES,
    feature_inventory,
    flatten_feature_snapshot,
)
from app.ml.feature_schema import FEATURE_COLUMNS


def test_feature_schema_count_is_current_contract():
    assert FEATURE_COUNT == 103
    assert len(FEATURE_COLUMNS) == FEATURE_COUNT
    assert len(set(FEATURE_COLUMNS)) == FEATURE_COUNT


def test_feature_registry_matches_feature_columns_in_order():
    assert [definition.path for definition in FEATURE_REGISTRY] == FEATURE_COLUMNS
    assert set(FEATURE_REGISTRY_BY_PATH) == set(FEATURE_COLUMNS)
    assert len(feature_inventory()) == FEATURE_COUNT


def test_rule_engine_feature_metadata_is_in_schema():
    assert RULE_ENGINE_FEATURES <= set(FEATURE_COLUMNS)
    for path in RULE_ENGINE_FEATURES:
        assert FEATURE_REGISTRY_BY_PATH[path].rule_usage == "rule_engine"


def test_flatten_feature_snapshot_supports_nested_and_flat_values():
    snapshot = {
        "momentum": {"rsi14": 31.5},
        "trend": {"ema20": 100.0},
        "context.closePrice": 101.0,
    }

    flattened = flatten_feature_snapshot(snapshot)

    assert flattened["momentum.rsi14"] == 31.5
    assert flattened["trend.ema20"] == 100.0
    assert flattened["context.closePrice"] == 101.0
    assert flattened["momentum.macdLine"] == 0
    assert list(flattened) == FEATURE_COLUMNS


def test_signal_settings_expose_feature_contract_defaults():
    assert settings.default_futures_leverage == 10
    assert settings.signal_threshold_ratio == 0.35
    assert settings.min_signal_quality == 40


def test_feature_builder_outputs_every_schema_field_when_dependencies_exist():
    if os.getenv("RUN_PANDAS_TA_CONTRACT_TESTS") != "1":
        pytest.skip("Set RUN_PANDAS_TA_CONTRACT_TESTS=1 to run pandas-ta feature builder contract test")

    pytest.importorskip("pandas_ta")
    from app.ml.feature_builder import build_feature_snapshot

    candles = []
    for index in range(240):
        close = 100 + (index * 0.1)
        candles.append(
            {
                "openTime": index,
                "open": close - 0.2,
                "high": close + 0.5,
                "low": close - 0.5,
                "close": close,
                "volume": 1000 + index,
            }
        )

    snapshot = build_feature_snapshot(candles)
    flattened = flatten_feature_snapshot(snapshot)

    assert snapshot["source"] == "native_mixed"
    assert set(flattened) == set(FEATURE_COLUMNS)
