from __future__ import annotations

import logging
from datetime import datetime, timezone
from typing import Any

from app.config import settings
from app.services.ml_feature_service import build_ml_feature_snapshot
from app.utils.helpers import to_fixed_number

logger = logging.getLogger(__name__)

DEFAULT_FUTURES_LEVERAGE = settings.default_futures_leverage
RULE_CONFIDENCE_WEIGHT = settings.ml_rule_confidence_weight
ML_PROBABILITY_WEIGHT = settings.ml_probability_weight
MIN_DIRECTIONAL_RULE_CONFIDENCE = settings.min_directional_rule_confidence
MIN_DIRECTIONAL_SCORE_GAP = settings.min_directional_score_gap
MIN_ML_PROBABILITY = settings.min_ml_probability
MIN_MODEL_ROC_AUC = settings.min_model_roc_auc
MIN_MODEL_DATASET_ROWS = settings.min_model_dataset_rows
REQUIRE_HEALTHY_ML_FOR_DIRECTIONAL_SIGNALS = settings.require_healthy_ml_for_directional_signals
SIGNAL_THRESHOLD_RATIO = settings.signal_threshold_ratio
MIN_SIGNAL_QUALITY = settings.min_signal_quality

TIMEFRAME_THRESHOLD_CONFIGS = {
    "1m": {"rsiOversold": 25, "rsiOverbought": 75, "rocExtreme": 3, "cciExtreme": 150, "stochLow": 15, "stochHigh": 85},
    "5m": {"rsiOversold": 28, "rsiOverbought": 72, "rocExtreme": 4, "cciExtreme": 120, "stochLow": 18, "stochHigh": 82},
    "15m": {"rsiOversold": 30, "rsiOverbought": 70, "rocExtreme": 5, "cciExtreme": 100, "stochLow": 20, "stochHigh": 80},
    "1h": {"rsiOversold": 30, "rsiOverbought": 70, "rocExtreme": 5, "cciExtreme": 100, "stochLow": 20, "stochHigh": 80},
    "4h": {"rsiOversold": 33, "rsiOverbought": 67, "rocExtreme": 7, "cciExtreme": 80, "stochLow": 25, "stochHigh": 75},
    "1d": {"rsiOversold": 35, "rsiOverbought": 65, "rocExtreme": 10, "cciExtreme": 70, "stochLow": 25, "stochHigh": 75},
}

RULE_PRESETS = {
    "balanced": {
        "id": "balanced",
        "label": "Balanced",
        "groupMultipliers": {"mean_reversion": 1.0, "trend": 1.0, "volume_structure": 1.0, "lorentzian": 1.0},
    },
    "trend_following": {
        "id": "trend_following",
        "label": "Trend Following",
        "groupMultipliers": {"mean_reversion": 0.7, "trend": 1.25, "volume_structure": 1.0, "lorentzian": 1.0},
    },
    "mean_reversion": {
        "id": "mean_reversion",
        "label": "Mean Reversion",
        "groupMultipliers": {"mean_reversion": 1.25, "trend": 0.75, "volume_structure": 1.0, "lorentzian": 1.0},
    },
    "breakout": {
        "id": "breakout",
        "label": "Breakout",
        "groupMultipliers": {"mean_reversion": 0.8, "trend": 1.15, "volume_structure": 1.25, "lorentzian": 1.15},
    },
    "scalping": {
        "id": "scalping",
        "label": "Scalping",
        "groupMultipliers": {"mean_reversion": 1.1, "trend": 1.1, "volume_structure": 0.9, "lorentzian": 0.8},
    },
}

VALIDATION_MODES = ("rules_only", "rules_plus_ml", "full_live_like")
DEFAULT_LIVE_VALIDATION_MODE = "full_live_like"
DEFAULT_BACKTEST_VALIDATION_MODE = "rules_plus_ml"


def _resolve_rule_preset(preset: str | None) -> dict[str, Any]:
    key = (preset or "balanced").lower()
    return RULE_PRESETS.get(key, RULE_PRESETS["balanced"])


def _resolve_validation_mode(mode: str | None, default: str) -> str:
    fallback = default if default in VALIDATION_MODES else DEFAULT_LIVE_VALIDATION_MODE
    key = (mode or fallback).lower()
    return key if key in VALIDATION_MODES else fallback


def _build_skipped_gate(
    gate_id: str,
    label: str,
    reason: str,
    details: dict[str, Any] | None = None,
) -> dict[str, Any]:
    return {
        "id": gate_id,
        "label": label,
        "passed": True,
        "skipped": True,
        "details": {
            "reason": reason,
            **(details or {}),
        },
    }


def _round_score(value: float) -> float:
    return round(value, 6)


def _rule_side(buy_contribution: float, sell_contribution: float) -> str:
    if buy_contribution > 0 and sell_contribution > 0:
        return "BOTH"
    if buy_contribution > 0:
        return "BUY"
    if sell_contribution > 0:
        return "SELL"
    return "NONE"


def _apply_preset_to_rule_traces(
    rule_traces: list[dict[str, Any]],
    preset_config: dict[str, Any],
) -> tuple[float, float, float]:
    multipliers = preset_config["groupMultipliers"]
    buy_score = 0.0
    sell_score = 0.0
    available_max_score = 0.0

    for trace in rule_traces:
        multiplier = multipliers.get(trace["group"], 1.0)
        trace["presetMultiplier"] = multiplier
        trace["finalBuyContribution"] = _round_score(trace["baseBuyContribution"] * multiplier)
        trace["finalSellContribution"] = _round_score(trace["baseSellContribution"] * multiplier)
        trace["finalAvailableWeight"] = _round_score(trace["baseAvailableWeight"] * multiplier)
        buy_score += trace["finalBuyContribution"]
        sell_score += trace["finalSellContribution"]
        available_max_score += trace["finalAvailableWeight"]

    return buy_score, sell_score, available_max_score


def _clamp(value: float, min_val: float, max_val: float) -> float:
    return max(min_val, min(value, max_val))


def _compute_regime_weights(regime: str, adx14: float | None, enabled: bool = True) -> dict[str, float]:
    if not enabled:
        return {"mr": 1.0, "tf": 1.0}
    is_trending = regime in ("TRENDING", "TRENDING_VOLATILE")
    is_ranging = regime in ("RANGING", "RANGING_VOLATILE")
    adx = adx14 if adx14 is not None else 25.0
    
    if is_trending and adx > 40:
        return {"mr": 0.0, "tf": 1.0}
    if is_ranging and adx < 15:
        return {"mr": 1.0, "tf": 0.0}
        
    return {
        "mr": 0.4 if is_trending else 1.0,
        "tf": 0.4 if is_ranging else 1.0,
    }


def _get_regime_adaptive_multipliers(regime: str, base_tp: float = 3.0, base_sl: float = 1.5) -> dict[str, float]:
    if regime == "TRENDING":
        return {"tp": base_tp * 1.3, "sl": base_sl}
    if regime == "TRENDING_VOLATILE":
        return {"tp": base_tp * 1.5, "sl": base_sl * 1.3}
    if regime == "RANGING":
        return {"tp": base_tp * 0.5, "sl": base_sl * 0.7}
    if regime == "RANGING_VOLATILE":
        return {"tp": base_tp * 0.7, "sl": base_sl * 1.0}
    if regime == "CONSOLIDATING":
        return {"tp": base_tp * 0.4, "sl": base_sl * 0.6}
    if regime == "BREAKOUT":
        return {"tp": base_tp * 1.5, "sl": base_sl * 1.2}
    return {"tp": base_tp, "sl": base_sl}

def fmt_num(v: float | None, decimals: int = 1) -> str:
    if v is None:
        return "N/A"
    return f"{v:.{decimals}f}"

def evaluate_signal_rules(
    symbol: str,
    timeframe: str,
    snapshot: dict[str, Any],
    leverage: int,
    regime_weighting_enabled: bool = True,
    preset: str | None = None,
) -> dict[str, Any]:
    current_price = snapshot.get("context", {}).get("closePrice")
    
    momentum = snapshot.get("momentum", {})
    trend = snapshot.get("trend", {})
    volatility = snapshot.get("volatility", {})
    volume = snapshot.get("volume", {})
    structure = snapshot.get("structure", {})
    lorentzian = snapshot.get("lorentzian", {})
    candle = snapshot.get("candle", {})
    context = snapshot.get("context", {})

    market_regime = context.get("marketRegime", "UNKNOWN")
    adx14 = trend.get("adx14")
    
    weights = _compute_regime_weights(market_regime, adx14, regime_weighting_enabled)
    mr_w = weights["mr"]
    tf_w = weights["tf"]
    
    tf_config = TIMEFRAME_THRESHOLD_CONFIGS.get(timeframe, TIMEFRAME_THRESHOLD_CONFIGS["1h"])
    
    available_max_score = 0.0
    buy_score = 0.0
    sell_score = 0.0
    buy_reasons = []
    sell_reasons = []
    
    buy_momentum_count = 0
    sell_momentum_count = 0
    buy_trend_count = 0
    sell_trend_count = 0
    buy_vol_struct_count = 0
    sell_vol_struct_count = 0
    rule_traces: list[dict[str, Any]] = []

    def record_rule(
        rule_id: int,
        name: str,
        group: str,
        field_paths: list[str],
        raw_values: dict[str, Any],
        thresholds: dict[str, Any],
        base_available_weight: float,
        before_buy_score: float,
        before_sell_score: float,
        before_buy_reasons: int,
        before_sell_reasons: int,
    ) -> None:
        base_buy = buy_score - before_buy_score
        base_sell = sell_score - before_sell_score
        new_reasons = buy_reasons[before_buy_reasons:] + sell_reasons[before_sell_reasons:]
        rule_traces.append(
            {
                "id": rule_id,
                "name": name,
                "group": group,
                "fieldPaths": field_paths,
                "rawValues": raw_values,
                "thresholds": thresholds,
                "side": _rule_side(base_buy, base_sell),
                "triggered": base_buy > 0 or base_sell > 0,
                "baseAvailableWeight": _round_score(base_available_weight),
                "baseBuyContribution": _round_score(base_buy),
                "baseSellContribution": _round_score(base_sell),
                "reason": "; ".join(new_reasons) if new_reasons else None,
            }
        )

    # 1. RSI
    rsi = momentum.get("rsi14")
    before_buy, before_sell, before_max = buy_score, sell_score, available_max_score
    before_buy_reasons, before_sell_reasons = len(buy_reasons), len(sell_reasons)
    if rsi is not None:
        available_max_score += 2 * mr_w
        if rsi < tf_config["rsiOversold"]:
            buy_score += 2 * mr_w
            buy_momentum_count += 1
            buy_reasons.append(f"RSI oversold ({fmt_num(rsi)})")
        elif rsi < tf_config["rsiOversold"] + 10:
            buy_score += 1 * mr_w
            buy_momentum_count += 1
            buy_reasons.append(f"RSI low ({fmt_num(rsi)})")
        elif rsi > tf_config["rsiOverbought"]:
            sell_score += 2 * mr_w
            sell_momentum_count += 1
            sell_reasons.append(f"RSI overbought ({fmt_num(rsi)})")
        elif rsi > tf_config["rsiOverbought"] - 10:
            sell_score += 1 * mr_w
            sell_momentum_count += 1
            sell_reasons.append(f"RSI elevated ({fmt_num(rsi)})")

    record_rule(1, "RSI", "mean_reversion", ["momentum.rsi14"], {"rsi14": rsi}, {"oversold": tf_config["rsiOversold"], "overbought": tf_config["rsiOverbought"]}, available_max_score - before_max, before_buy, before_sell, before_buy_reasons, before_sell_reasons)

    # 2. Stochastic %K
    stoch_k = momentum.get("stochasticK")
    before_buy, before_sell, before_max = buy_score, sell_score, available_max_score
    before_buy_reasons, before_sell_reasons = len(buy_reasons), len(sell_reasons)
    if stoch_k is not None:
        available_max_score += 1 * mr_w
        if stoch_k < tf_config["stochLow"]:
            buy_score += 1 * mr_w
            buy_momentum_count += 1
            buy_reasons.append(f"Stochastic oversold (%K={fmt_num(stoch_k)})")
        elif stoch_k > tf_config["stochHigh"]:
            sell_score += 1 * mr_w
            sell_momentum_count += 1
            sell_reasons.append(f"Stochastic overbought (%K={fmt_num(stoch_k)})")

    record_rule(2, "Stochastic %K", "mean_reversion", ["momentum.stochasticK"], {"stochasticK": stoch_k}, {"low": tf_config["stochLow"], "high": tf_config["stochHigh"]}, available_max_score - before_max, before_buy, before_sell, before_buy_reasons, before_sell_reasons)

    # 3. CCI
    cci20 = momentum.get("cci20")
    before_buy, before_sell, before_max = buy_score, sell_score, available_max_score
    before_buy_reasons, before_sell_reasons = len(buy_reasons), len(sell_reasons)
    if cci20 is not None:
        available_max_score += 1 * mr_w
        if cci20 < -tf_config["cciExtreme"]:
            buy_score += 1 * mr_w
            buy_momentum_count += 1
            buy_reasons.append(f"CCI oversold ({fmt_num(cci20)})")
        elif cci20 > tf_config["cciExtreme"]:
            sell_score += 1 * mr_w
            sell_momentum_count += 1
            sell_reasons.append(f"CCI overbought ({fmt_num(cci20)})")

    record_rule(3, "CCI", "mean_reversion", ["momentum.cci20"], {"cci20": cci20}, {"extreme": tf_config["cciExtreme"]}, available_max_score - before_max, before_buy, before_sell, before_buy_reasons, before_sell_reasons)

    # 4. Bollinger %B
    bollinger_percent_b = volatility.get("bollingerPercentB")
    before_buy, before_sell, before_max = buy_score, sell_score, available_max_score
    before_buy_reasons, before_sell_reasons = len(buy_reasons), len(sell_reasons)
    if bollinger_percent_b is not None:
        available_max_score += 1 * mr_w
        if bollinger_percent_b < 0.2:
            buy_score += 1 * mr_w
            buy_momentum_count += 1
            buy_reasons.append(f"Near Bollinger lower band (%B={fmt_num(bollinger_percent_b, 2)})")
        elif bollinger_percent_b > 0.8:
            sell_score += 1 * mr_w
            sell_momentum_count += 1
            sell_reasons.append(f"Near Bollinger upper band (%B={fmt_num(bollinger_percent_b, 2)})")

    record_rule(4, "Bollinger %B", "mean_reversion", ["volatility.bollingerPercentB"], {"bollingerPercentB": bollinger_percent_b}, {"lower": 0.2, "upper": 0.8}, available_max_score - before_max, before_buy, before_sell, before_buy_reasons, before_sell_reasons)

    # 5. Williams %R
    williams_r = momentum.get("williamsR14")
    before_buy, before_sell, before_max = buy_score, sell_score, available_max_score
    before_buy_reasons, before_sell_reasons = len(buy_reasons), len(sell_reasons)
    if williams_r is not None:
        available_max_score += 1 * mr_w
        if williams_r < -80:
            buy_score += 1 * mr_w
            buy_momentum_count += 1
            buy_reasons.append(f"Williams %R oversold ({fmt_num(williams_r)})")
        elif williams_r > -20:
            sell_score += 1 * mr_w
            sell_momentum_count += 1
            sell_reasons.append(f"Williams %R overbought ({fmt_num(williams_r)})")

    record_rule(5, "Williams %R", "mean_reversion", ["momentum.williamsR14"], {"williamsR14": williams_r}, {"oversold": -80, "overbought": -20}, available_max_score - before_max, before_buy, before_sell, before_buy_reasons, before_sell_reasons)

    # 6. Ultimate Oscillator
    ultimate_osc = momentum.get("ultimateOscillator")
    before_buy, before_sell, before_max = buy_score, sell_score, available_max_score
    before_buy_reasons, before_sell_reasons = len(buy_reasons), len(sell_reasons)
    if ultimate_osc is not None:
        available_max_score += 1 * mr_w
        if ultimate_osc < 30:
            buy_score += 1 * mr_w
            buy_momentum_count += 1
            buy_reasons.append(f"Ultimate Oscillator oversold ({fmt_num(ultimate_osc)})")
        elif ultimate_osc > 70:
            sell_score += 1 * mr_w
            sell_momentum_count += 1
            sell_reasons.append(f"Ultimate Oscillator overbought ({fmt_num(ultimate_osc)})")

    record_rule(6, "Ultimate Oscillator", "mean_reversion", ["momentum.ultimateOscillator"], {"ultimateOscillator": ultimate_osc}, {"oversold": 30, "overbought": 70}, available_max_score - before_max, before_buy, before_sell, before_buy_reasons, before_sell_reasons)

    # 7. Z-score
    zscore20 = volatility.get("zscore20")
    before_buy, before_sell, before_max = buy_score, sell_score, available_max_score
    before_buy_reasons, before_sell_reasons = len(buy_reasons), len(sell_reasons)
    if zscore20 is not None:
        available_max_score += 0.5 * mr_w
        if zscore20 < -2:
            buy_score += 0.5 * mr_w
            buy_reasons.append(f"Z-score extreme low ({fmt_num(zscore20, 2)}) — mean reversion likely")
        elif zscore20 > 2:
            sell_score += 0.5 * mr_w
            sell_reasons.append(f"Z-score extreme high ({fmt_num(zscore20, 2)}) — mean reversion likely")

    record_rule(7, "Z-score", "mean_reversion", ["volatility.zscore20"], {"zscore20": zscore20}, {"low": -2, "high": 2}, available_max_score - before_max, before_buy, before_sell, before_buy_reasons, before_sell_reasons)

    # 8. Price vs EMA20
    ema20 = trend.get("ema20")
    before_buy, before_sell, before_max = buy_score, sell_score, available_max_score
    before_buy_reasons, before_sell_reasons = len(buy_reasons), len(sell_reasons)
    if ema20 is not None and current_price is not None:
        available_max_score += 0.5 * tf_w
        if current_price > ema20:
            buy_score += 0.5 * tf_w
            buy_trend_count += 1
            buy_reasons.append("Price above EMA20 (bullish trend)")
        elif current_price < ema20:
            sell_score += 0.5 * tf_w
            sell_trend_count += 1
            sell_reasons.append("Price below EMA20 (bearish trend)")

    record_rule(8, "Price vs EMA20", "trend", ["context.closePrice", "trend.ema20"], {"closePrice": current_price, "ema20": ema20}, {}, available_max_score - before_max, before_buy, before_sell, before_buy_reasons, before_sell_reasons)

    # 22. WaveTrend
    wt1 = momentum.get("waveTrend1")
    wt2 = momentum.get("waveTrend2")
    before_buy, before_sell, before_max = buy_score, sell_score, available_max_score
    before_buy_reasons, before_sell_reasons = len(buy_reasons), len(sell_reasons)
    if wt1 is not None and wt2 is not None:
        wt_weight = 1.5 * mr_w
        available_max_score += wt_weight
        if wt1 < -60 and wt1 > wt2:
            buy_score += wt_weight
            buy_reasons.append(f"WaveTrend oversold + bullish cross (WT1={fmt_num(wt1)})")
        elif wt1 > 60 and wt1 < wt2:
            sell_score += wt_weight
            sell_reasons.append(f"WaveTrend overbought + bearish cross (WT1={fmt_num(wt1)})")
        elif wt1 < -40:
            buy_score += wt_weight * 0.5
            buy_momentum_count += 1
            buy_reasons.append(f"WaveTrend low zone (WT1={fmt_num(wt1)})")
        elif wt1 > 40:
            sell_score += wt_weight * 0.5
            sell_momentum_count += 1
            sell_reasons.append(f"WaveTrend high zone (WT1={fmt_num(wt1)})")

    record_rule(22, "WaveTrend", "mean_reversion", ["momentum.waveTrend1", "momentum.waveTrend2"], {"waveTrend1": wt1, "waveTrend2": wt2}, {"strongLow": -60, "strongHigh": 60, "low": -40, "high": 40}, available_max_score - before_max, before_buy, before_sell, before_buy_reasons, before_sell_reasons)

    # 9. MACD Crossover
    macd_line = momentum.get("macdLine")
    signal_line = momentum.get("macdSignal")
    macd_dir = momentum.get("macdCrossoverDirection")
    before_buy, before_sell, before_max = buy_score, sell_score, available_max_score
    before_buy_reasons, before_sell_reasons = len(buy_reasons), len(sell_reasons)
    if macd_line is not None and signal_line is not None:
        available_max_score += 2 * tf_w
    if macd_dir == "BULLISH":
        buy_score += 2 * tf_w
        buy_trend_count += 1
        buy_reasons.append("MACD bullish crossover")
    elif macd_dir == "BEARISH":
        sell_score += 2 * tf_w
        sell_trend_count += 1
        sell_reasons.append("MACD bearish crossover")

    record_rule(9, "MACD Crossover", "trend", ["momentum.macdLine", "momentum.macdSignal", "momentum.macdCrossoverDirection"], {"macdLine": macd_line, "macdSignal": signal_line, "macdCrossoverDirection": macd_dir}, {}, available_max_score - before_max, before_buy, before_sell, before_buy_reasons, before_sell_reasons)

    # 10. MACD Histogram
    macd_hist = momentum.get("macdHistogram")
    before_buy, before_sell, before_max = buy_score, sell_score, available_max_score
    before_buy_reasons, before_sell_reasons = len(buy_reasons), len(sell_reasons)
    if macd_hist is not None:
        available_max_score += 1 * tf_w
        if macd_hist > 0:
            buy_score += 1 * tf_w
            buy_trend_count += 1
            buy_reasons.append("MACD histogram positive")
        elif macd_hist < 0:
            sell_score += 1 * tf_w
            sell_trend_count += 1
            sell_reasons.append("MACD histogram negative")

    record_rule(10, "MACD Histogram", "trend", ["momentum.macdHistogram"], {"macdHistogram": macd_hist}, {"bullishAbove": 0, "bearishBelow": 0}, available_max_score - before_max, before_buy, before_sell, before_buy_reasons, before_sell_reasons)

    # 11. ADX + DMI
    dmi_plus = trend.get("dmiPlus14")
    dmi_minus = trend.get("dmiMinus14")
    before_buy, before_sell, before_max = buy_score, sell_score, available_max_score
    before_buy_reasons, before_sell_reasons = len(buy_reasons), len(sell_reasons)
    if dmi_plus is not None and dmi_minus is not None:
        has_strong_trend = adx14 is not None and adx14 > 25
        dmi_weight = 2 if has_strong_trend else 1
        available_max_score += dmi_weight * tf_w
        if dmi_plus > dmi_minus:
            buy_score += dmi_weight * tf_w
            buy_trend_count += 1
            buy_reasons.append(f"ADX strong trend + DMI bullish (ADX={fmt_num(adx14)})" if has_strong_trend else "DMI+ > DMI- (bullish directional movement)")
        elif dmi_minus > dmi_plus:
            sell_score += dmi_weight * tf_w
            sell_trend_count += 1
            sell_reasons.append(f"ADX strong trend + DMI bearish (ADX={fmt_num(adx14)})" if has_strong_trend else "DMI- > DMI+ (bearish directional movement)")

    record_rule(11, "ADX + DMI", "trend", ["trend.adx14", "trend.dmiPlus14", "trend.dmiMinus14"], {"adx14": adx14, "dmiPlus14": dmi_plus, "dmiMinus14": dmi_minus}, {"strongTrendAdx": 25}, available_max_score - before_max, before_buy, before_sell, before_buy_reasons, before_sell_reasons)

    # 12. ROC
    roc10 = momentum.get("roc10")
    before_buy, before_sell, before_max = buy_score, sell_score, available_max_score
    before_buy_reasons, before_sell_reasons = len(buy_reasons), len(sell_reasons)
    if roc10 is not None:
        available_max_score += 1 * mr_w
        if roc10 < -tf_config["rocExtreme"]:
            buy_score += 1 * mr_w
            buy_momentum_count += 1
            buy_reasons.append(f"ROC deeply negative ({fmt_num(roc10)}%) — reversal potential")
        elif roc10 > tf_config["rocExtreme"]:
            sell_score += 1 * mr_w
            sell_momentum_count += 1
            sell_reasons.append(f"ROC strongly positive ({fmt_num(roc10)}%) — reversal potential")

    record_rule(12, "ROC", "mean_reversion", ["momentum.roc10"], {"roc10": roc10}, {"extreme": tf_config["rocExtreme"]}, available_max_score - before_max, before_buy, before_sell, before_buy_reasons, before_sell_reasons)

    # 13. PSAR
    psar_dir = trend.get("psarDirection")
    before_buy, before_sell, before_max = buy_score, sell_score, available_max_score
    before_buy_reasons, before_sell_reasons = len(buy_reasons), len(sell_reasons)
    if psar_dir in ("BULLISH", "BEARISH"):
        available_max_score += 1 * tf_w
        if psar_dir == "BULLISH":
            buy_score += 1 * tf_w
            buy_trend_count += 1
            buy_reasons.append("PSAR below price (bullish trend)")
        else:
            sell_score += 1 * tf_w
            sell_trend_count += 1
            sell_reasons.append("PSAR above price (bearish trend)")

    record_rule(13, "PSAR", "trend", ["trend.psarDirection"], {"psarDirection": psar_dir}, {}, available_max_score - before_max, before_buy, before_sell, before_buy_reasons, before_sell_reasons)

    # 14. Awesome Oscillator
    ao = momentum.get("awesomeOscillator")
    before_buy, before_sell, before_max = buy_score, sell_score, available_max_score
    before_buy_reasons, before_sell_reasons = len(buy_reasons), len(sell_reasons)
    if ao is not None:
        available_max_score += 0.5 * tf_w
        if ao > 0:
            buy_score += 0.5 * tf_w
            buy_trend_count += 1
            buy_reasons.append("Awesome Oscillator positive (bullish momentum)")
        elif ao < 0:
            sell_score += 0.5 * tf_w
            sell_trend_count += 1
            sell_reasons.append("Awesome Oscillator negative (bearish momentum)")

    record_rule(14, "Awesome Oscillator", "trend", ["momentum.awesomeOscillator"], {"awesomeOscillator": ao}, {"bullishAbove": 0, "bearishBelow": 0}, available_max_score - before_max, before_buy, before_sell, before_buy_reasons, before_sell_reasons)

    # 15. MFI
    mfi = volume.get("mfi14")
    before_buy, before_sell, before_max = buy_score, sell_score, available_max_score
    before_buy_reasons, before_sell_reasons = len(buy_reasons), len(sell_reasons)
    if mfi is not None:
        available_max_score += 1.5
        if mfi < 20:
            buy_score += 1.5
            buy_vol_struct_count += 1
            buy_reasons.append(f"MFI oversold ({fmt_num(mfi)})")
        elif mfi < 40:
            buy_score += 0.5
            buy_vol_struct_count += 1
            buy_reasons.append(f"MFI low ({fmt_num(mfi)})")
        elif mfi > 80:
            sell_score += 1.5
            sell_vol_struct_count += 1
            sell_reasons.append(f"MFI overbought ({fmt_num(mfi)})")
        elif mfi > 60:
            sell_score += 0.5
            sell_vol_struct_count += 1
            sell_reasons.append(f"MFI elevated ({fmt_num(mfi)})")

    record_rule(15, "MFI", "volume_structure", ["volume.mfi14"], {"mfi14": mfi}, {"strongOversold": 20, "low": 40, "high": 60, "strongOverbought": 80}, available_max_score - before_max, before_buy, before_sell, before_buy_reasons, before_sell_reasons)

    # 16. OBV Slope
    obv_slope = volume.get("obvSlope5")
    before_buy, before_sell, before_max = buy_score, sell_score, available_max_score
    before_buy_reasons, before_sell_reasons = len(buy_reasons), len(sell_reasons)
    if obv_slope is not None:
        available_max_score += 0.5
        if obv_slope > 0:
            buy_score += 0.5
            buy_vol_struct_count += 1
            buy_reasons.append("OBV rising (buying pressure)")
        elif obv_slope < 0:
            sell_score += 0.5
            sell_vol_struct_count += 1
            sell_reasons.append("OBV falling (selling pressure)")

    record_rule(16, "OBV Slope", "volume_structure", ["volume.obvSlope5"], {"obvSlope5": obv_slope}, {"bullishAbove": 0, "bearishBelow": 0}, available_max_score - before_max, before_buy, before_sell, before_buy_reasons, before_sell_reasons)

    # 17. Relative Volume
    rel_vol = volume.get("relativeVolume")
    before_buy, before_sell, before_max = buy_score, sell_score, available_max_score
    before_buy_reasons, before_sell_reasons = len(buy_reasons), len(sell_reasons)
    if rel_vol is not None:
        available_max_score += 0.5
        if rel_vol > 1.5:
            if buy_score >= sell_score:
                buy_score += 0.5
                buy_reasons.append(f"High volume confirms bullish bias ({fmt_num(rel_vol, 2)}x avg)")
            else:
                sell_score += 0.5
                sell_reasons.append(f"High volume confirms bearish bias ({fmt_num(rel_vol, 2)}x avg)")

    record_rule(17, "Relative Volume", "volume_structure", ["volume.relativeVolume"], {"relativeVolume": rel_vol}, {"confirmationAbove": 1.5}, available_max_score - before_max, before_buy, before_sell, before_buy_reasons, before_sell_reasons)

    # 18. CMF
    cmf20 = volume.get("cmf20")
    before_buy, before_sell, before_max = buy_score, sell_score, available_max_score
    before_buy_reasons, before_sell_reasons = len(buy_reasons), len(sell_reasons)
    if cmf20 is not None:
        available_max_score += 1.0
        if cmf20 > 0.1:
            buy_score += 1.0
            buy_vol_struct_count += 1
            buy_reasons.append(f"CMF positive accumulation ({fmt_num(cmf20, 2)})")
        elif cmf20 < -0.1:
            sell_score += 1.0
            sell_vol_struct_count += 1
            sell_reasons.append(f"CMF negative distribution ({fmt_num(cmf20, 2)})")

    record_rule(18, "CMF", "volume_structure", ["volume.cmf20"], {"cmf20": cmf20}, {"accumulationAbove": 0.1, "distributionBelow": -0.1}, available_max_score - before_max, before_buy, before_sell, before_buy_reasons, before_sell_reasons)

    # 19. Squeeze
    squeeze = volatility.get("squeezeOn")
    before_buy, before_sell, before_max = buy_score, sell_score, available_max_score
    before_buy_reasons, before_sell_reasons = len(buy_reasons), len(sell_reasons)
    if squeeze is not None:
        available_max_score += 0.5
        if squeeze is True:
            if buy_score >= sell_score:
                buy_score += 0.5
                buy_reasons.append("Volatility squeeze — breakout potential (bullish bias)")
            else:
                sell_score += 0.5
                sell_reasons.append("Volatility squeeze — breakout potential (bearish bias)")

    record_rule(19, "Squeeze", "volume_structure", ["volatility.squeezeOn"], {"squeezeOn": squeeze}, {"active": True}, available_max_score - before_max, before_buy, before_sell, before_buy_reasons, before_sell_reasons)

    # 20. Supply/Demand Zones
    active_zone = structure.get("activeZoneBias", "NONE")
    nearest_demand_dist = structure.get("nearestDemandDistancePct")
    nearest_supply_dist = structure.get("nearestSupplyDistancePct")
    before_buy, before_sell, before_max = buy_score, sell_score, available_max_score
    before_buy_reasons, before_sell_reasons = len(buy_reasons), len(sell_reasons)
    if active_zone in ("DEMAND", "SUPPLY"):
        available_max_score += 2.0
        if active_zone == "DEMAND":
            is_near_demand = nearest_demand_dist is not None and abs(nearest_demand_dist) <= 2.5
            buy_score += 2.0 if is_near_demand else 1.0
            buy_vol_struct_count += 1
            if is_near_demand:
                buy_reasons.append(f"Price sitting near demand zone ({fmt_num(nearest_demand_dist, 2)}% away)")
            else:
                buy_reasons.append("Nearest structural zone is demand")
        else:
            is_near_supply = nearest_supply_dist is not None and abs(nearest_supply_dist) <= 2.5
            sell_score += 2.0 if is_near_supply else 1.0
            sell_vol_struct_count += 1
            if is_near_supply:
                sell_reasons.append(f"Price sitting near supply zone ({fmt_num(nearest_supply_dist, 2)}% away)")
            else:
                sell_reasons.append("Nearest structural zone is supply")

    record_rule(20, "Supply/Demand Zones", "volume_structure", ["structure.activeZoneBias", "structure.nearestDemandDistancePct", "structure.nearestSupplyDistancePct"], {"activeZoneBias": active_zone, "nearestDemandDistancePct": nearest_demand_dist, "nearestSupplyDistancePct": nearest_supply_dist}, {"nearZonePct": 2.5}, available_max_score - before_max, before_buy, before_sell, before_buy_reasons, before_sell_reasons)

    # 21. FVG
    fvg_bias = structure.get("nearestFvgBias", "NONE")
    bullish_fvg_dist = structure.get("bullishFvgDistancePct")
    bearish_fvg_dist = structure.get("bearishFvgDistancePct")
    bullish_fvg_size = structure.get("bullishFvgSizePct")
    bearish_fvg_size = structure.get("bearishFvgSizePct")
    before_buy, before_sell, before_max = buy_score, sell_score, available_max_score
    before_buy_reasons, before_sell_reasons = len(buy_reasons), len(sell_reasons)
    if fvg_bias in ("BULLISH", "BEARISH"):
        available_max_score += 1.5
        if fvg_bias == "BULLISH":
            in_range = bullish_fvg_dist is not None and abs(bullish_fvg_dist) <= 2.5
            buy_score += 1.5 if in_range else 0.75
            buy_vol_struct_count += 1
            buy_reasons.append(f"Bullish FVG {'active nearby' if in_range else 'present'} ({fmt_num(bullish_fvg_size, 2)}% gap size)")
        else:
            in_range = bearish_fvg_dist is not None and abs(bearish_fvg_dist) <= 2.5
            sell_score += 1.5 if in_range else 0.75
            sell_vol_struct_count += 1
            sell_reasons.append(f"Bearish FVG {'active nearby' if in_range else 'present'} ({fmt_num(bearish_fvg_size, 2)}% gap size)")

    record_rule(21, "FVG", "volume_structure", ["structure.nearestFvgBias", "structure.bullishFvgDistancePct", "structure.bullishFvgSizePct", "structure.bearishFvgDistancePct", "structure.bearishFvgSizePct"], {"nearestFvgBias": fvg_bias, "bullishFvgDistancePct": bullish_fvg_dist, "bullishFvgSizePct": bullish_fvg_size, "bearishFvgDistancePct": bearish_fvg_dist, "bearishFvgSizePct": bearish_fvg_size}, {"nearGapPct": 2.5}, available_max_score - before_max, before_buy, before_sell, before_buy_reasons, before_sell_reasons)

    # 23. Lorentzian KNN
    knn_pct = lorentzian.get("bullishNeighborPct")
    knn_dist = lorentzian.get("distanceAvgK8")
    before_buy, before_sell, before_max = buy_score, sell_score, available_max_score
    before_buy_reasons, before_sell_reasons = len(buy_reasons), len(sell_reasons)
    if knn_pct is not None:
        available_max_score += 1.5
        high_conf = knn_dist is not None and knn_dist < 5.0
        if knn_pct >= 70:
            weight = 1.5 if high_conf else 0.75
            buy_score += weight
            buy_vol_struct_count += 1
            buy_reasons.append(f"Lorentzian: {fmt_num(knn_pct)}% of similar patterns were bullish{' (high-confidence match)' if high_conf else ''}")
        elif knn_pct <= 30:
            weight = 1.5 if high_conf else 0.75
            sell_score += weight
            sell_vol_struct_count += 1
            sell_reasons.append(f"Lorentzian: {fmt_num(100 - knn_pct)}% of similar patterns were bearish{' (high-confidence match)' if high_conf else ''}")

    record_rule(23, "Lorentzian KNN", "lorentzian", ["lorentzian.bullishNeighborPct", "lorentzian.distanceAvgK8"], {"bullishNeighborPct": knn_pct, "distanceAvgK8": knn_dist}, {"bullishPct": 70, "bearishPct": 30, "highConfidenceDistanceBelow": 5.0}, available_max_score - before_max, before_buy, before_sell, before_buy_reasons, before_sell_reasons)

    # 24. Kernel Regression Trend
    kernel_cross = trend.get("kernelCrossoverSignal")
    kernel_pct = trend.get("priceVsKernelPct")
    before_buy, before_sell, before_max = buy_score, sell_score, available_max_score
    before_buy_reasons, before_sell_reasons = len(buy_reasons), len(sell_reasons)
    if kernel_cross is not None:
        available_max_score += 1.5 * tf_w
        if kernel_cross == 1:
            buy_score += 1.5 * tf_w
            buy_trend_count += 1
            buy_reasons.append(f"Kernel regression bullish crossover (price vs kernel: {fmt_num(kernel_pct, 2)}%)")
        elif kernel_cross == -1:
            sell_score += 1.5 * tf_w
            sell_trend_count += 1
            sell_reasons.append(f"Kernel regression bearish crossover (price vs kernel: {fmt_num(kernel_pct, 2)}%)")

    record_rule(24, "Kernel Regression", "trend", ["trend.kernelCrossoverSignal", "trend.priceVsKernelPct"], {"kernelCrossoverSignal": kernel_cross, "priceVsKernelPct": kernel_pct}, {"bullishCross": 1, "bearishCross": -1}, available_max_score - before_max, before_buy, before_sell, before_buy_reasons, before_sell_reasons)

    # 25. Candle Pattern Strength
    candle_bull = candle.get("bullishStrength")
    candle_bear = candle.get("bearishStrength")
    candle_body = candle.get("bodyPct")
    candle_lower_wick = candle.get("lowerWickPct")
    candle_upper_wick = candle.get("upperWickPct")
    before_buy, before_sell, before_max = buy_score, sell_score, available_max_score
    before_buy_reasons, before_sell_reasons = len(buy_reasons), len(sell_reasons)
    if candle_bull is not None and candle_bear is not None and candle_body is not None:
        available_max_score += 1.0
        if candle_bull > 0.7 and candle_body > 40 and (candle_lower_wick or 0) > 30:
            buy_score += 1.0
            buy_vol_struct_count += 1
            buy_reasons.append(f"Strong bullish candle pattern (strength={fmt_num(candle_bull, 2)}, body={fmt_num(candle_body)}%, lower wick={fmt_num(candle_lower_wick)}%)")
        elif candle_bear > 0.7 and candle_body > 40 and (candle_upper_wick or 0) > 30:
            sell_score += 1.0
            sell_vol_struct_count += 1
            sell_reasons.append(f"Strong bearish candle pattern (strength={fmt_num(candle_bear, 2)}, body={fmt_num(candle_body)}%, upper wick={fmt_num(candle_upper_wick)}%)")

    record_rule(25, "Candle Pattern", "volume_structure", ["candle.bullishStrength", "candle.bearishStrength", "candle.bodyPct", "candle.lowerWickPct", "candle.upperWickPct"], {"bullishStrength": candle_bull, "bearishStrength": candle_bear, "bodyPct": candle_body, "lowerWickPct": candle_lower_wick, "upperWickPct": candle_upper_wick}, {"minStrength": 0.7, "minBodyPct": 40, "minWickPct": 30}, available_max_score - before_max, before_buy, before_sell, before_buy_reasons, before_sell_reasons)

    # 26. Donchian Channel Position
    donchian_pos = volatility.get("donchianPositionPct")
    before_buy, before_sell, before_max = buy_score, sell_score, available_max_score
    before_buy_reasons, before_sell_reasons = len(buy_reasons), len(sell_reasons)
    if donchian_pos is not None:
        available_max_score += 1.0 * mr_w
        if donchian_pos < 10:
            buy_score += 1.0 * mr_w
            buy_momentum_count += 1
            buy_reasons.append(f"Near Donchian channel low ({fmt_num(donchian_pos)}% position)")
        elif donchian_pos > 90:
            sell_score += 1.0 * mr_w
            sell_momentum_count += 1
            sell_reasons.append(f"Near Donchian channel high ({fmt_num(donchian_pos)}% position)")

    record_rule(26, "Donchian Position", "mean_reversion", ["volatility.donchianPositionPct"], {"donchianPositionPct": donchian_pos}, {"low": 10, "high": 90}, available_max_score - before_max, before_buy, before_sell, before_buy_reasons, before_sell_reasons)

    # 27. Keltner Channel Position
    keltner_pos = volatility.get("keltnerPositionPct")
    before_buy, before_sell, before_max = buy_score, sell_score, available_max_score
    before_buy_reasons, before_sell_reasons = len(buy_reasons), len(sell_reasons)
    if keltner_pos is not None:
        available_max_score += 0.5 * mr_w
        if keltner_pos < 10:
            buy_score += 0.5 * mr_w
            buy_momentum_count += 1
            buy_reasons.append(f"Near Keltner channel low ({fmt_num(keltner_pos)}% position)")
        elif keltner_pos > 90:
            sell_score += 0.5 * mr_w
            sell_momentum_count += 1
            sell_reasons.append(f"Near Keltner channel high ({fmt_num(keltner_pos)}% position)")

    record_rule(27, "Keltner Position", "mean_reversion", ["volatility.keltnerPositionPct"], {"keltnerPositionPct": keltner_pos}, {"low": 10, "high": 90}, available_max_score - before_max, before_buy, before_sell, before_buy_reasons, before_sell_reasons)

    # 28. PPO (Percentage Price Oscillator)
    ppo_line = momentum.get("ppoLine")
    ppo_hist = momentum.get("ppoHistogram")
    before_buy, before_sell, before_max = buy_score, sell_score, available_max_score
    before_buy_reasons, before_sell_reasons = len(buy_reasons), len(sell_reasons)
    if ppo_line is not None and ppo_hist is not None:
        available_max_score += 1.0 * mr_w
        if ppo_line < -1 and ppo_hist < 0:
            buy_score += 1.0 * mr_w
            buy_momentum_count += 1
            buy_reasons.append(f"PPO negative — momentum washed out (line={fmt_num(ppo_line, 2)}, hist={fmt_num(ppo_hist, 2)})")
        elif ppo_line > 1 and ppo_hist > 0:
            sell_score += 1.0 * mr_w
            sell_momentum_count += 1
            sell_reasons.append(f"PPO elevated — momentum exhaustion (line={fmt_num(ppo_line, 2)}, hist={fmt_num(ppo_hist, 2)})")

    record_rule(28, "PPO", "mean_reversion", ["momentum.ppoLine", "momentum.ppoHistogram"], {"ppoLine": ppo_line, "ppoHistogram": ppo_hist}, {"bearishLineBelow": -1, "bullishLineAbove": 1}, available_max_score - before_max, before_buy, before_sell, before_buy_reasons, before_sell_reasons)

    # 29. TRIX Momentum
    trix = momentum.get("trix15")
    before_buy, before_sell, before_max = buy_score, sell_score, available_max_score
    before_buy_reasons, before_sell_reasons = len(buy_reasons), len(sell_reasons)
    if trix is not None:
        available_max_score += 0.5 * tf_w
        if trix > 0:
            buy_score += 0.5 * tf_w
            buy_trend_count += 1
            buy_reasons.append(f"TRIX positive — smoothed trend up ({fmt_num(trix, 4)})")
        elif trix < 0:
            sell_score += 0.5 * tf_w
            sell_trend_count += 1
            sell_reasons.append(f"TRIX negative — smoothed trend down ({fmt_num(trix, 4)})")

    record_rule(29, "TRIX", "trend", ["momentum.trix15"], {"trix15": trix}, {"bullishAbove": 0, "bearishBelow": 0}, available_max_score - before_max, before_buy, before_sell, before_buy_reasons, before_sell_reasons)

    # 30. Lorentzian Distance Trend
    dist_trend = lorentzian.get("distanceTrend")
    before_buy, before_sell, before_max = buy_score, sell_score, available_max_score
    before_buy_reasons, before_sell_reasons = len(buy_reasons), len(sell_reasons)
    if dist_trend is not None and knn_pct is not None:
        available_max_score += 0.5
        if dist_trend == 1 and knn_pct >= 70:
            buy_score += 0.5
            buy_reasons.append("Lorentzian patterns converging + bullish — high-quality match")
        elif dist_trend == 1 and knn_pct <= 30:
            sell_score += 0.5
            sell_reasons.append("Lorentzian patterns converging + bearish — high-quality match")

    record_rule(30, "Lorentzian Distance Trend", "lorentzian", ["lorentzian.distanceTrend"], {"distanceTrend": dist_trend, "bullishNeighborPct": knn_pct}, {"converging": 1, "bullishPct": 70, "bearishPct": 30}, available_max_score - before_max, before_buy, before_sell, before_buy_reasons, before_sell_reasons)

    # 31. Elder Force Index
    efi = volume.get("efi13")
    before_buy, before_sell, before_max = buy_score, sell_score, available_max_score
    before_buy_reasons, before_sell_reasons = len(buy_reasons), len(sell_reasons)
    if efi is not None:
        available_max_score += 0.5
        if efi > 0:
            buy_score += 0.5
            buy_vol_struct_count += 1
            buy_reasons.append(f"Elder Force Index positive — bullish force ({fmt_num(efi)})")
        elif efi < 0:
            sell_score += 0.5
            sell_vol_struct_count += 1
            sell_reasons.append(f"Elder Force Index negative — bearish force ({fmt_num(efi)})")

    record_rule(31, "Elder Force Index", "volume_structure", ["volume.efi13"], {"efi13": efi}, {"bullishAbove": 0, "bearishBelow": 0}, available_max_score - before_max, before_buy, before_sell, before_buy_reasons, before_sell_reasons)

    preset_config = _resolve_rule_preset(preset)
    buy_score, sell_score, available_max_score = _apply_preset_to_rule_traces(rule_traces, preset_config)

    # Confluence Gating
    MIN_CONFLUENCE_CATEGORIES = 2
    buy_confluence_categories = (1 if buy_momentum_count > 0 else 0) + (1 if buy_trend_count > 0 else 0) + (1 if buy_vol_struct_count > 0 else 0)
    sell_confluence_categories = (1 if sell_momentum_count > 0 else 0) + (1 if sell_trend_count > 0 else 0) + (1 if sell_vol_struct_count > 0 else 0)
    buy_has_confluence = buy_confluence_categories >= MIN_CONFLUENCE_CATEGORIES
    sell_has_confluence = sell_confluence_categories >= MIN_CONFLUENCE_CATEGORIES

    dynamic_threshold = max(2.5, available_max_score * SIGNAL_THRESHOLD_RATIO)
    signal_type = "HOLD"
    rule_confidence = 50
    reasoning = ""
    score_gap = abs(buy_score - sell_score)

    if buy_score >= dynamic_threshold and buy_score > sell_score and score_gap >= MIN_DIRECTIONAL_SCORE_GAP and buy_has_confluence:
        signal_type = "BUY"
        rule_confidence = min(95, round(55 + (buy_score / max(available_max_score, 1)) * 40))
        reasoning = f"BUY signal confirmed by {len(buy_reasons)} indicator(s): {'; '.join(buy_reasons)}. "
        reasoning += f"Buy score: {buy_score:.1f} vs Sell score: {sell_score:.1f} (threshold: {dynamic_threshold:.1f}, gap: {score_gap:.1f}). "
        reasoning += f"Market regime: {market_regime}. "
        if sell_reasons:
            reasoning += f"Caution — opposing signals: {'; '.join(sell_reasons)}."
    elif sell_score >= dynamic_threshold and sell_score > buy_score and score_gap >= MIN_DIRECTIONAL_SCORE_GAP and sell_has_confluence:
        signal_type = "SELL"
        rule_confidence = min(95, round(55 + (sell_score / max(available_max_score, 1)) * 40))
        reasoning = f"SELL signal confirmed by {len(sell_reasons)} indicator(s): {'; '.join(sell_reasons)}. "
        reasoning += f"Sell score: {sell_score:.1f} vs Buy score: {buy_score:.1f} (threshold: {dynamic_threshold:.1f}, gap: {score_gap:.1f}). "
        reasoning += f"Market regime: {market_regime}. "
        if buy_reasons:
            reasoning += f"Caution — opposing signals: {'; '.join(buy_reasons)}."
    else:
        signal_type = "HOLD"
        best_score = max(buy_score, sell_score)
        proximity = min(best_score / dynamic_threshold, 1.0) if dynamic_threshold > 0 else 0.0
        rule_confidence = round(30 + proximity * 25)
        reasoning = "HOLD signal: No multi-indicator consensus reached. "
        reasoning += f"Buy score: {buy_score:.1f}, Sell score: {sell_score:.1f} (threshold: {dynamic_threshold:.1f}, gap: {score_gap:.1f}). "
        reasoning += f"Market regime: {market_regime}. "
        if score_gap < MIN_DIRECTIONAL_SCORE_GAP and (buy_score >= dynamic_threshold or sell_score >= dynamic_threshold):
            reasoning += f"Score gap ({score_gap:.1f}) below minimum ({MIN_DIRECTIONAL_SCORE_GAP}) — signal too ambiguous. "
        if not buy_has_confluence and buy_score >= dynamic_threshold:
            reasoning += f"BUY lacked confluence ({buy_confluence_categories}/{MIN_CONFLUENCE_CATEGORIES} categories). "
        if not sell_has_confluence and sell_score >= dynamic_threshold:
            reasoning += f"SELL lacked confluence ({sell_confluence_categories}/{MIN_CONFLUENCE_CATEGORIES} categories). "
        if buy_reasons:
            reasoning += f"Bullish hints: {'; '.join(buy_reasons)}. "
        if sell_reasons:
            reasoning += f"Bearish hints: {'; '.join(sell_reasons)}. "
        reasoning += "Wait for clearer multi-indicator agreement."

    # Signal Quality Score
    signal_quality = 0
    if signal_type != "HOLD":
        winning_cats = buy_confluence_categories if signal_type == "BUY" else sell_confluence_categories
        opponent_reasons_len = len(sell_reasons) if signal_type == "BUY" else len(buy_reasons)
        winning_reasons_len = len(buy_reasons) if signal_type == "BUY" else len(sell_reasons)

        gap_ratio = min(score_gap / (available_max_score * 0.5), 1.0) if available_max_score > 0 else 0.0
        confluence_ratio = winning_cats / 3.0
        is_trend_signal = signal_type in ("BUY", "SELL")
        is_trending = market_regime in ("TRENDING", "TRENDING_VOLATILE")
        is_ranging = market_regime in ("RANGING", "RANGING_VOLATILE")
        regime_aligned = 1.0 if ((is_trending and is_trend_signal) or (is_ranging and is_trend_signal)) else 0.5
        total_reasons = winning_reasons_len + opponent_reasons_len
        opponent_ratio = (1.0 - (opponent_reasons_len / total_reasons)) if total_reasons > 0 else 0.5

        signal_quality = round((gap_ratio * 30) + (confluence_ratio * 25) + (regime_aligned * 20) + (opponent_ratio * 25))

    if signal_type != "HOLD" and signal_quality < MIN_SIGNAL_QUALITY:
        reasoning += f" Quality gate: score {signal_quality}/100 below minimum {MIN_SIGNAL_QUALITY} — downgraded to HOLD."
        signal_type = "HOLD"
        rule_confidence = min(rule_confidence, 45)

    winning_side = "buy" if buy_score >= sell_score else "sell"
    winning_has_confluence = buy_has_confluence if winning_side == "buy" else sell_has_confluence
    winning_confluence_categories = buy_confluence_categories if winning_side == "buy" else sell_confluence_categories
    gates = [
        {
            "id": "dynamic_threshold",
            "label": "Dynamic threshold",
            "passed": max(buy_score, sell_score) >= dynamic_threshold,
            "details": {
                "buyScore": _round_score(buy_score),
                "sellScore": _round_score(sell_score),
                "dynamicThreshold": _round_score(dynamic_threshold),
                "availableMaxScore": _round_score(available_max_score),
                "thresholdRatio": SIGNAL_THRESHOLD_RATIO,
            },
        },
        {
            "id": "score_gap",
            "label": "Directional score gap",
            "passed": score_gap >= MIN_DIRECTIONAL_SCORE_GAP,
            "details": {
                "scoreGap": _round_score(score_gap),
                "minRequired": MIN_DIRECTIONAL_SCORE_GAP,
            },
        },
        {
            "id": "confluence",
            "label": "Confluence categories",
            "passed": winning_has_confluence,
            "details": {
                "winningSide": winning_side.upper(),
                "categories": winning_confluence_categories,
                "minRequired": MIN_CONFLUENCE_CATEGORIES,
                "buyCategories": buy_confluence_categories,
                "sellCategories": sell_confluence_categories,
            },
        },
        {
            "id": "signal_quality",
            "label": "Signal quality",
            "passed": signal_type == "HOLD" or signal_quality >= MIN_SIGNAL_QUALITY,
            "details": {
                "signalQuality": signal_quality,
                "minRequired": MIN_SIGNAL_QUALITY,
            },
        },
    ]

    summary = {
        "type": signal_type,
        "confidence": rule_confidence,
        "buyScore": _round_score(buy_score),
        "sellScore": _round_score(sell_score),
        "scoreGap": _round_score(score_gap),
        "availableMaxScore": _round_score(available_max_score),
        "dynamicThreshold": _round_score(dynamic_threshold),
        "signalQuality": signal_quality,
        "regime": market_regime,
        "preset": preset_config["id"],
    }

    return {
        "type": signal_type,
        "confidence": rule_confidence,
        "reasoning": reasoning,
        "buyScore": buy_score,
        "sellScore": sell_score,
        "scoreGap": score_gap,
        "regime": market_regime,
        "signalQuality": signal_quality,
        "availableMaxScore": available_max_score,
        "dynamicThreshold": dynamic_threshold,
        "confluence": {
            "buy": {"momentum": buy_momentum_count, "trend": buy_trend_count, "volumeStruct": buy_vol_struct_count, "categories": buy_confluence_categories},
            "sell": {"momentum": sell_momentum_count, "trend": sell_trend_count, "volumeStruct": sell_vol_struct_count, "categories": sell_confluence_categories},
            "minRequired": MIN_CONFLUENCE_CATEGORIES,
        },
        "preset": preset_config,
        "rules": rule_traces,
        "gates": gates,
        "summary": summary,
    }


def _build_accuracy_guardrail_decision(signal_type: str, rule_confidence: float, score_gap: float, prediction: dict[str, Any] | None) -> dict[str, Any]:
    if signal_type == "HOLD":
        return {"should_abstain": False, "reasons": []}
        
    reasons = []
    
    if rule_confidence < MIN_DIRECTIONAL_RULE_CONFIDENCE:
        reasons.append(f"rule confidence {rule_confidence}% is below {MIN_DIRECTIONAL_RULE_CONFIDENCE}%")
        
    if score_gap < MIN_DIRECTIONAL_SCORE_GAP:
        reasons.append(f"score gap {score_gap:.1f} is below {MIN_DIRECTIONAL_SCORE_GAP:.1f}")
        
    if REQUIRE_HEALTHY_ML_FOR_DIRECTIONAL_SIGNALS:
        if not prediction:
            reasons.append("ML validation is unavailable")
        else:
            prob = prediction.get("probability")
            metrics = prediction.get("metrics", {})
            roc_auc = metrics.get("rocAuc")
            dataset_rows = metrics.get("datasetRows")
            promotion = prediction.get("promotion", {})
            eligible = promotion.get("eligible")

            if prob is None or prob < MIN_ML_PROBABILITY:
                prob_str = f"{prob*100:.1f}%" if prob is not None else "N/A"
                reasons.append(f"ML win probability {prob_str} is below {MIN_ML_PROBABILITY*100:.1f}%")
                
            if roc_auc is None or roc_auc < MIN_MODEL_ROC_AUC:
                roc_str = f"{roc_auc:.3f}" if roc_auc is not None else "N/A"
                reasons.append(f"model ROC AUC {roc_str} is below {MIN_MODEL_ROC_AUC:.2f}")
                
            if dataset_rows is None or dataset_rows < MIN_MODEL_DATASET_ROWS:
                rows_str = str(dataset_rows) if dataset_rows is not None else "N/A"
                reasons.append(f"training dataset {rows_str} rows is below {MIN_MODEL_DATASET_ROWS}")
                
            if eligible is False:
                reasons.append("active model failed promotion-quality checks")
                
    return {"should_abstain": len(reasons) > 0, "reasons": reasons}


def _build_scoring_payload(
    rule_result: dict[str, Any],
    final_type: str,
    final_confidence: float,
    extra_gates: list[dict[str, Any]] | None = None,
    validation_mode: str | None = None,
    shadow_mode: bool | None = None,
) -> dict[str, Any]:
    summary = dict(rule_result.get("summary", {}))
    summary.update(
        {
            "finalType": final_type,
            "finalConfidence": round(final_confidence, 2),
        }
    )
    if validation_mode:
        summary["validationMode"] = validation_mode
    if shadow_mode is not None:
        summary["shadowMode"] = shadow_mode
    return {
        "buyScore": rule_result["buyScore"],
        "sellScore": rule_result["sellScore"],
        "scoreGap": rule_result.get("scoreGap"),
        "availableMaxScore": rule_result.get("availableMaxScore"),
        "dynamicThreshold": rule_result.get("dynamicThreshold"),
        "signalQuality": rule_result.get("signalQuality"),
        "preset": rule_result.get("preset"),
        "confluence": rule_result.get("confluence"),
        "rules": rule_result.get("rules", []),
        "gates": [*rule_result.get("gates", []), *(extra_gates or [])],
        "summary": summary,
    }


def generate_signal_from_klines(
    symbol: str,
    timeframe: str,
    klines: list[dict[str, Any]],
    leverage: int | None = None,
    ml_model: str | None = None,
    apply_accuracy_guardrails: bool = False,
    preset: str | None = None,
    validation_mode: str | None = None,
    include_mtf_confirmation: bool = False,
    include_order_flow_confirmation: bool = False,
) -> dict[str, Any] | None:
    """
    Backtesting entrypoint. Generates a signal using provided historical klines.
    MTF and order-flow gates are explicit parity placeholders unless historical
    implementations are added for them.
    """
    if not klines or len(klines) < 26:
        return None

    symbol = symbol.upper()
    active_leverage = leverage or DEFAULT_FUTURES_LEVERAGE
    ml_enabled = bool(ml_model and ml_model.lower() != "off")
    default_validation_mode = DEFAULT_BACKTEST_VALIDATION_MODE if ml_enabled else "rules_only"
    active_validation_mode = _resolve_validation_mode(validation_mode, default_validation_mode)
    latest_close = klines[-1]["close"]

    # 1. Feature Generation
    snapshot_wrapper = build_ml_feature_snapshot(klines, options={"timeframe": timeframe, "leverage": active_leverage, "preset": preset})
    snapshot = snapshot_wrapper["features"]

    # 2. Rule Evaluation
    rule_result = evaluate_signal_rules(symbol, timeframe, snapshot, active_leverage, preset=preset)

    final_type = rule_result["type"]
    final_confidence = rule_result["confidence"]
    extra_gates: list[dict[str, Any]] = []

    if include_mtf_confirmation:
        extra_gates.append(
            _build_skipped_gate(
                "mtf_confirmation",
                "Higher timeframe confirmation",
                "historical_mtf_not_available",
                {"validationMode": active_validation_mode},
            )
        )
    if include_order_flow_confirmation:
        extra_gates.append(
            _build_skipped_gate(
                "order_flow_confirmation",
                "Order-flow confirmation",
                "historical_order_flow_not_available",
                {"validationMode": active_validation_mode},
            )
        )

    # 3. ML Inference & Accuracy Guardrails
    prediction = None
    run_ml = ml_enabled and active_validation_mode in ("rules_plus_ml", "full_live_like")
    if run_ml:
        from app.services.ml_inference_service import get_ml_prediction

        prediction = get_ml_prediction(snapshot)
        
        if apply_accuracy_guardrails and final_type != "HOLD":
            guardrail = _build_accuracy_guardrail_decision(final_type, final_confidence, rule_result["scoreGap"], prediction)
            extra_gates.append(
                {
                    "id": "ml_validation",
                    "label": "ML validation",
                    "passed": not guardrail["should_abstain"],
                    "details": {
                        "guardrailsEnabled": True,
                        "probability": prediction.get("probability") if prediction else None,
                        "reasons": guardrail["reasons"],
                    },
                }
            )
            if guardrail["should_abstain"]:
                final_type = "HOLD"
                final_confidence = min(final_confidence, 55)
                reasons_str = "; ".join(guardrail["reasons"])
                rule_result["reasoning"] += f" Accuracy guardrail forced HOLD: {reasons_str}."
        elif final_type != "HOLD" and prediction and prediction.get("probability"):
            # Only probability check if full guardrails are disabled
            prob = prediction["probability"]
            ml_passed = prob >= MIN_ML_PROBABILITY
            extra_gates.append(
                {
                    "id": "ml_probability",
                    "label": "ML probability",
                    "passed": ml_passed,
                    "details": {
                        "guardrailsEnabled": False,
                        "probability": prob,
                        "minRequired": MIN_ML_PROBABILITY,
                    },
                }
            )
            if prob < MIN_ML_PROBABILITY:
                final_type = "HOLD"
                final_confidence = min(final_confidence, 55)
                rule_result["reasoning"] += f" ML probability {prob:.2f} too low."

        if final_type != "HOLD" and prediction and prediction.get("probability"):
            prob = prediction["probability"]
            final_confidence = (rule_result["confidence"] * RULE_CONFIDENCE_WEIGHT) + (prob * 100 * ML_PROBABILITY_WEIGHT)
    elif ml_enabled:
        extra_gates.append(
            _build_skipped_gate(
                "ml_validation",
                "ML validation",
                "validation_mode_rules_only",
                {"validationMode": active_validation_mode},
            )
        )

    # 4. Price Targets (Regime Adaptive)
    regime = rule_result["regime"]
    multipliers = _get_regime_adaptive_multipliers(regime)
    atr = snapshot.get("volatility", {}).get("atr14", latest_close * 0.01)

    target_price = None
    stop_price = None
    if final_type == "BUY":
        target_price = latest_close + (atr * multipliers["tp"])
        stop_price = latest_close - (atr * multipliers["sl"])
    elif final_type == "SELL":
        target_price = latest_close - (atr * multipliers["tp"])
        stop_price = latest_close + (atr * multipliers["sl"])

    return {
        "symbol": symbol,
        "timeframe": timeframe,
        "type": final_type,
        "confidence": round(final_confidence, 2),
        "expectedDirection": "UP" if final_type == "BUY" else ("DOWN" if final_type == "SELL" else "NEUTRAL"),
        "reasoning": rule_result["reasoning"],
        "price": {
            "entry": latest_close,
            "target": target_price,
            "stopLoss": stop_price,
        },
        "features": snapshot,
        "ml": prediction or {},
        "scoring": _build_scoring_payload(
            rule_result,
            final_type,
            final_confidence,
            extra_gates,
            validation_mode=active_validation_mode,
        ),
        "validationMode": active_validation_mode,
        "indicators": {},
        "leverage": active_leverage,
    }


async def generate_signal(
    symbol: str,
    timeframe: str = "1h",
    leverage: int | None = None,
    preset: str | None = None,
    validation_mode: str | None = None,
    shadow_mode: bool = False,
) -> dict[str, Any]:
    """
    Main entrypoint to generate a signal for a symbol/timeframe.
    Replaces signalService.js `generateSignal`.
    """
    symbol = symbol.upper()
    active_leverage = leverage or DEFAULT_FUTURES_LEVERAGE
    active_validation_mode = _resolve_validation_mode(validation_mode, DEFAULT_LIVE_VALIDATION_MODE)

    from app.services.market_service import get_klines

    klines = await get_klines(symbol, timeframe, limit=210)
    if not klines or len(klines) < 26:
        raise ValueError(f"Insufficient kline data for {symbol}")

    latest_close = klines[-1]["close"]

    # 1. Feature Generation
    snapshot_wrapper = build_ml_feature_snapshot(klines, options={"timeframe": timeframe, "leverage": active_leverage, "preset": preset})
    snapshot = snapshot_wrapper["features"]

    # 2. Rule Evaluation
    rule_result = evaluate_signal_rules(symbol, timeframe, snapshot, active_leverage, preset=preset)
    extra_gates: list[dict[str, Any]] = []
    
    # 3. MTF and Order Flow (Confirmation)
    if active_validation_mode == "full_live_like":
        from app.services.mtf_service import get_higher_timeframe_bias
        from app.services.order_flow_service import get_order_flow_bias

        mtf_bias = await get_higher_timeframe_bias(symbol, timeframe)
        order_flow = await get_order_flow_bias(symbol, timeframe)

        if rule_result["type"] == "BUY":
            extra_gates.append(
                {
                    "id": "mtf_confirmation",
                    "label": "Higher timeframe confirmation",
                    "passed": mtf_bias["direction"] != "BEARISH",
                    "details": mtf_bias,
                }
            )
            if mtf_bias["direction"] == "BEARISH":
                rule_result["type"] = "HOLD"
                rule_result["reasoning"] += " Blocked by MTF bearish trend."
            elif order_flow["bias"] == "BEARISH":
                rule_result["confidence"] -= 8
            extra_gates.append(
                {
                    "id": "order_flow_confirmation",
                    "label": "Order-flow confirmation",
                    "passed": order_flow["bias"] != "BEARISH",
                    "details": order_flow,
                }
            )
        elif rule_result["type"] == "SELL":
            extra_gates.append(
                {
                    "id": "mtf_confirmation",
                    "label": "Higher timeframe confirmation",
                    "passed": mtf_bias["direction"] != "BULLISH",
                    "details": mtf_bias,
                }
            )
            if mtf_bias["direction"] == "BULLISH":
                rule_result["type"] = "HOLD"
                rule_result["reasoning"] += " Blocked by MTF bullish trend."
            elif order_flow["bias"] == "BULLISH":
                rule_result["confidence"] -= 8
            extra_gates.append(
                {
                    "id": "order_flow_confirmation",
                    "label": "Order-flow confirmation",
                    "passed": order_flow["bias"] != "BULLISH",
                    "details": order_flow,
                }
            )
    else:
        extra_gates.extend(
            [
                _build_skipped_gate(
                    "mtf_confirmation",
                    "Higher timeframe confirmation",
                    "validation_mode_excludes_live_confirmation",
                    {"validationMode": active_validation_mode},
                ),
                _build_skipped_gate(
                    "order_flow_confirmation",
                    "Order-flow confirmation",
                    "validation_mode_excludes_live_confirmation",
                    {"validationMode": active_validation_mode},
                ),
            ]
        )

    # 4. ML Inference & Accuracy Guardrails
    prediction = None
    if active_validation_mode in ("rules_plus_ml", "full_live_like"):
        from app.services.ml_inference_service import get_ml_prediction

        prediction = get_ml_prediction(snapshot)
    else:
        extra_gates.append(
            _build_skipped_gate(
                "ml_validation",
                "ML validation",
                "validation_mode_rules_only",
                {"validationMode": active_validation_mode},
            )
        )

    final_type = rule_result["type"]
    final_confidence = rule_result["confidence"]
    
    if prediction and final_type != "HOLD":
        guardrail = _build_accuracy_guardrail_decision(final_type, final_confidence, rule_result["scoreGap"], prediction)
        extra_gates.append(
            {
                "id": "ml_validation",
                "label": "ML validation",
                "passed": not guardrail["should_abstain"],
                "details": {
                    "probability": prediction.get("probability") if prediction else None,
                    "reasons": guardrail["reasons"],
                },
            }
        )
        if guardrail["should_abstain"]:
            final_type = "HOLD"
            final_confidence = min(final_confidence, 55)
            reasons_str = "; ".join(guardrail["reasons"])
            rule_result["reasoning"] += f" Accuracy guardrail forced HOLD: {reasons_str}."

    if final_type != "HOLD" and prediction and prediction.get("probability"):
        prob = prediction["probability"]
        final_confidence = (rule_result["confidence"] * RULE_CONFIDENCE_WEIGHT) + (prob * 100 * ML_PROBABILITY_WEIGHT)

    # 5. Price Targets (Regime Adaptive)
    regime = rule_result["regime"]
    multipliers = _get_regime_adaptive_multipliers(regime)
    atr = snapshot.get("volatility", {}).get("atr14", latest_close * 0.01)
    
    target_price = None
    stop_price = None
    if final_type == "BUY":
        target_price = latest_close + (atr * multipliers["tp"])
        stop_price = latest_close - (atr * multipliers["sl"])
    elif final_type == "SELL":
        target_price = latest_close - (atr * multipliers["tp"])
        stop_price = latest_close + (atr * multipliers["sl"])

    return {
        "symbol": symbol,
        "timeframe": timeframe,
        "signal_type": final_type,
        "status": "SHADOW" if shadow_mode else "ACTIVE",
        "market_type": "FUTURES",
        "leverage": active_leverage,
        "confidence": round(final_confidence, 2),
        "reasoning": rule_result["reasoning"],
        "price_entry": latest_close,
        "price_current": latest_close,
        "price_target": target_price,
        "price_stop_loss": stop_price,
        "features": snapshot,
        "ml": prediction or {},
        "scoring": _build_scoring_payload(
            rule_result,
            final_type,
            final_confidence,
            extra_gates,
            validation_mode=active_validation_mode,
            shadow_mode=shadow_mode,
        ),
        "validationMode": active_validation_mode,
        "shadowMode": shadow_mode,
        "created_at": datetime.now(timezone.utc).isoformat()
    }
