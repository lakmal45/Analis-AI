"""
Tests for the Signal Generation engine.
"""
from __future__ import annotations

import pytest

from app.services.signal_service import (
    DEFAULT_BACKTEST_VALIDATION_MODE,
    DEFAULT_LIVE_VALIDATION_MODE,
    VALIDATION_MODES,
    _build_scoring_payload,
    _build_skipped_gate,
    _clamp,
    _compute_regime_weights,
    _get_regime_adaptive_multipliers,
    _resolve_validation_mode,
    evaluate_signal_rules,
)


class TestClamp:
    def test_clamp_within_range(self):
        assert _clamp(50, 0, 100) == 50

    def test_clamp_below_min(self):
        assert _clamp(-10, 0, 100) == 0

    def test_clamp_above_max(self):
        assert _clamp(150, 0, 100) == 100


class TestRegimeWeights:
    def test_trending_high_adx_disables_mr(self):
        weights = _compute_regime_weights("TRENDING", 45)
        assert weights["mr"] == 0.0
        assert weights["tf"] == 1.0

    def test_ranging_low_adx_disables_tf(self):
        weights = _compute_regime_weights("RANGING", 10)
        assert weights["mr"] == 1.0
        assert weights["tf"] == 0.0

    def test_disabled_returns_equal_weights(self):
        weights = _compute_regime_weights("TRENDING", 45, enabled=False)
        assert weights["mr"] == 1.0
        assert weights["tf"] == 1.0

    def test_normal_trending(self):
        weights = _compute_regime_weights("TRENDING", 25)
        assert weights["mr"] == 0.4
        assert weights["tf"] == 1.0

    def test_normal_ranging(self):
        weights = _compute_regime_weights("RANGING", 25)
        assert weights["mr"] == 1.0
        assert weights["tf"] == 0.4


class TestRegimeMultipliers:
    def test_trending_widens_tp(self):
        m = _get_regime_adaptive_multipliers("TRENDING")
        assert m["tp"] > 3.0  # wider than default

    def test_ranging_tightens_tp(self):
        m = _get_regime_adaptive_multipliers("RANGING")
        assert m["tp"] < 3.0  # tighter than default

    def test_default_fallback(self):
        m = _get_regime_adaptive_multipliers("UNKNOWN")
        assert m["tp"] == 3.0
        assert m["sl"] == 1.5


class TestValidationModes:
    def test_validation_modes_are_explicit(self):
        assert VALIDATION_MODES == ("rules_only", "rules_plus_ml", "full_live_like")
        assert DEFAULT_LIVE_VALIDATION_MODE == "full_live_like"
        assert DEFAULT_BACKTEST_VALIDATION_MODE == "rules_plus_ml"

    def test_validation_mode_resolver_defaults_and_rejects_unknown(self):
        assert _resolve_validation_mode(None, "rules_only") == "rules_only"
        assert _resolve_validation_mode("RULES_PLUS_ML", "rules_only") == "rules_plus_ml"
        assert _resolve_validation_mode("unknown", "rules_only") == "rules_only"
        assert _resolve_validation_mode(None, "invalid_default") == "full_live_like"

    def test_skipped_gate_and_scoring_metadata_are_traceable(self):
        gate = _build_skipped_gate(
            "ml_validation",
            "ML validation",
            "validation_mode_rules_only",
            {"validationMode": "rules_only"},
        )
        scoring = _build_scoring_payload(
            {
                "buyScore": 1,
                "sellScore": 0,
                "summary": {},
                "gates": [],
            },
            "HOLD",
            55,
            [gate],
            validation_mode="rules_only",
            shadow_mode=True,
        )

        assert scoring["gates"][0]["skipped"] is True
        assert scoring["gates"][0]["details"]["reason"] == "validation_mode_rules_only"
        assert scoring["summary"]["validationMode"] == "rules_only"
        assert scoring["summary"]["shadowMode"] is True


class TestEvaluateSignalRules:
    def test_oversold_rsi_triggers_buy(self):
        snapshot = {
            "momentum": {"rsi14": 25, "macdCrossoverDirection": None, "macdHistogram": 0},
            "trend": {"ema20": 100, "adx14": 25},
            "volatility": {},
            "context": {"marketRegime": "RANGING", "closePrice": 95},
            "lorentzian": {},
        }
        result = evaluate_signal_rules("BTCUSDT", "1h", snapshot, 10)
        assert result["buyScore"] > result["sellScore"]

    def test_overbought_rsi_triggers_sell(self):
        snapshot = {
            "momentum": {"rsi14": 80, "macdCrossoverDirection": None, "macdHistogram": 0},
            "trend": {"ema20": 100, "adx14": 25},
            "volatility": {},
            "context": {"marketRegime": "RANGING", "closePrice": 105},
            "lorentzian": {},
        }
        result = evaluate_signal_rules("BTCUSDT", "1h", snapshot, 10)
        assert result["sellScore"] > result["buyScore"]

    def test_neutral_rsi_no_strong_signal(self):
        snapshot = {
            "momentum": {"rsi14": 50, "macdCrossoverDirection": None, "macdHistogram": 0},
            "trend": {"ema20": 100, "adx14": 25},
            "volatility": {},
            "context": {"marketRegime": "UNKNOWN", "closePrice": 100},
            "lorentzian": {},
        }
        result = evaluate_signal_rules("BTCUSDT", "1h", snapshot, 10)
        assert result["type"] == "HOLD"

    def test_rule_trace_and_gates_are_returned(self):
        snapshot = {
            "momentum": {
                "rsi14": 25,
                "macdLine": 1,
                "macdSignal": 0,
                "macdCrossoverDirection": "BULLISH",
                "macdHistogram": 1,
            },
            "trend": {"ema20": 100, "adx14": 25},
            "volatility": {},
            "context": {"marketRegime": "RANGING", "closePrice": 105},
            "lorentzian": {},
        }

        result = evaluate_signal_rules("BTCUSDT", "1h", snapshot, 10)

        assert len(result["rules"]) == 31
        assert result["summary"]["preset"] == "balanced"
        assert {"dynamic_threshold", "score_gap", "confluence", "signal_quality"} <= {
            gate["id"] for gate in result["gates"]
        }
        rsi_rule = next(rule for rule in result["rules"] if rule["id"] == 1)
        assert rsi_rule["name"] == "RSI"
        assert rsi_rule["fieldPaths"] == ["momentum.rsi14"]
        assert "finalBuyContribution" in rsi_rule

    def test_rule_preset_changes_weighted_scores(self):
        snapshot = {
            "momentum": {"rsi14": 25},
            "trend": {"ema20": 100, "adx14": 25},
            "volatility": {},
            "context": {"marketRegime": "RANGING", "closePrice": 105},
            "lorentzian": {},
        }

        balanced = evaluate_signal_rules("BTCUSDT", "1h", snapshot, 10, preset="balanced")
        trend_following = evaluate_signal_rules(
            "BTCUSDT", "1h", snapshot, 10, preset="trend_following"
        )

        assert balanced["preset"]["id"] == "balanced"
        assert trend_following["preset"]["id"] == "trend_following"
        assert trend_following["buyScore"] != balanced["buyScore"]
