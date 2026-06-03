"""
Tests for the Signal Generation engine.
"""
from __future__ import annotations

import pytest

from app.services.signal_service import (
    _clamp,
    _compute_regime_weights,
    _get_regime_adaptive_multipliers,
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
