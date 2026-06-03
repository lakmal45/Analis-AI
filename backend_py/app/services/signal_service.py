from __future__ import annotations

import logging
from datetime import datetime, timezone
from typing import Any

from app.services.ml_feature_service import build_ml_feature_snapshot
from app.services.ml_inference_service import get_ml_prediction
from app.services.market_service import get_klines
from app.services.mtf_service import get_higher_timeframe_bias
from app.services.order_flow_service import get_order_flow_bias
from app.utils.helpers import to_fixed_number

logger = logging.getLogger(__name__)

DEFAULT_FUTURES_LEVERAGE = 10
RULE_CONFIDENCE_WEIGHT = 0.35
ML_PROBABILITY_WEIGHT = 0.65
MIN_DIRECTIONAL_RULE_CONFIDENCE = 68
MIN_DIRECTIONAL_SCORE_GAP = 3.0
MIN_ML_PROBABILITY = 0.6
MIN_MODEL_ROC_AUC = 0.58
MIN_MODEL_DATASET_ROWS = 400
REQUIRE_HEALTHY_ML_FOR_DIRECTIONAL_SIGNALS = True
SIGNAL_THRESHOLD_RATIO = 0.35
MIN_SIGNAL_QUALITY = 40

TIMEFRAME_THRESHOLD_CONFIGS = {
    "1m": {"rsiOversold": 25, "rsiOverbought": 75, "rocExtreme": 3, "cciExtreme": 150, "stochLow": 15, "stochHigh": 85},
    "5m": {"rsiOversold": 28, "rsiOverbought": 72, "rocExtreme": 4, "cciExtreme": 120, "stochLow": 18, "stochHigh": 82},
    "15m": {"rsiOversold": 30, "rsiOverbought": 70, "rocExtreme": 5, "cciExtreme": 100, "stochLow": 20, "stochHigh": 80},
    "1h": {"rsiOversold": 30, "rsiOverbought": 70, "rocExtreme": 5, "cciExtreme": 100, "stochLow": 20, "stochHigh": 80},
    "4h": {"rsiOversold": 33, "rsiOverbought": 67, "rocExtreme": 7, "cciExtreme": 80, "stochLow": 25, "stochHigh": 75},
    "1d": {"rsiOversold": 35, "rsiOverbought": 65, "rocExtreme": 10, "cciExtreme": 70, "stochLow": 25, "stochHigh": 75},
}


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
) -> dict[str, Any]:
    current_price = snapshot.get("context", {}).get("closePrice")
    
    momentum = snapshot.get("momentum", {})
    trend = snapshot.get("trend", {})
    volatility = snapshot.get("volatility", {})
    volume = snapshot.get("volume", {})
    structure = snapshot.get("structure", {})
    lorentzian = snapshot.get("lorentzian", {})
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

    # 1. RSI
    rsi = momentum.get("rsi14")
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

    # 2. Stochastic %K
    stoch_k = momentum.get("stochasticK")
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

    # 3. CCI
    cci20 = momentum.get("cci20")
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

    # 4. Bollinger %B
    bollinger_percent_b = volatility.get("bollingerPercentB")
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

    # 5. Williams %R
    williams_r = momentum.get("williamsR14")
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

    # 6. Ultimate Oscillator
    ultimate_osc = momentum.get("ultimateOscillator")
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

    # 7. Z-score
    zscore20 = volatility.get("zscore20")
    if zscore20 is not None:
        available_max_score += 0.5 * mr_w
        if zscore20 < -2:
            buy_score += 0.5 * mr_w
            buy_reasons.append(f"Z-score extreme low ({fmt_num(zscore20, 2)}) — mean reversion likely")
        elif zscore20 > 2:
            sell_score += 0.5 * mr_w
            sell_reasons.append(f"Z-score extreme high ({fmt_num(zscore20, 2)}) — mean reversion likely")

    # 8. Price vs EMA20
    ema20 = trend.get("ema20")
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

    # 22. WaveTrend
    wt1 = momentum.get("waveTrend1")
    wt2 = momentum.get("waveTrend2")
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

    # 9. MACD Crossover
    macd_line = momentum.get("macdLine")
    signal_line = momentum.get("macdSignal")
    macd_dir = momentum.get("macdCrossoverDirection")
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

    # 10. MACD Histogram
    macd_hist = momentum.get("macdHistogram")
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

    # 11. ADX + DMI
    dmi_plus = trend.get("dmiPlus14")
    dmi_minus = trend.get("dmiMinus14")
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

    # 12. ROC
    roc10 = momentum.get("roc10")
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

    # 13. PSAR
    psar_dir = trend.get("psarDirection")
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

    # 14. Awesome Oscillator
    ao = momentum.get("awesomeOscillator")
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

    # 15. MFI
    mfi = volume.get("mfi14")
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

    # 16. OBV Slope
    obv_slope = volume.get("obvSlope5")
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

    # 17. Relative Volume
    rel_vol = volume.get("relativeVolume")
    if rel_vol is not None:
        available_max_score += 0.5
        if rel_vol > 1.5:
            if buy_score >= sell_score:
                buy_score += 0.5
                buy_reasons.append(f"High volume confirms bullish bias ({fmt_num(rel_vol, 2)}x avg)")
            else:
                sell_score += 0.5
                sell_reasons.append(f"High volume confirms bearish bias ({fmt_num(rel_vol, 2)}x avg)")

    # 18. CMF
    cmf20 = volume.get("cmf20")
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

    # 19. Squeeze
    squeeze = volatility.get("squeezeOn")
    if squeeze is not None:
        available_max_score += 0.5
        if squeeze is True:
            if buy_score >= sell_score:
                buy_score += 0.5
                buy_reasons.append("Volatility squeeze — breakout potential (bullish bias)")
            else:
                sell_score += 0.5
                sell_reasons.append("Volatility squeeze — breakout potential (bearish bias)")

    # 20. Supply/Demand Zones
    active_zone = structure.get("activeZoneBias", "NONE")
    nearest_demand_dist = structure.get("nearestDemandDistancePct")
    nearest_supply_dist = structure.get("nearestSupplyDistancePct")
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

    # 21. FVG
    fvg_bias = structure.get("nearestFvgBias", "NONE")
    bullish_fvg_dist = structure.get("bullishFvgDistancePct")
    bearish_fvg_dist = structure.get("bearishFvgDistancePct")
    bullish_fvg_size = structure.get("bullishFvgSizePct")
    bearish_fvg_size = structure.get("bearishFvgSizePct")
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

    # 23. Lorentzian KNN
    knn_pct = lorentzian.get("bullishNeighborPct")
    knn_dist = lorentzian.get("distanceAvgK8")
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
        }
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


def generate_signal_from_klines(
    symbol: str,
    timeframe: str,
    klines: list[dict[str, Any]],
    leverage: int | None = None,
    ml_model: str | None = None,
    apply_accuracy_guardrails: bool = False,
) -> dict[str, Any] | None:
    """
    Backtesting entrypoint. Generates a signal using provided historical klines.
    Does not use MTF or Order Flow since those would require historical lookups.
    """
    if not klines or len(klines) < 26:
        return None

    symbol = symbol.upper()
    active_leverage = leverage or DEFAULT_FUTURES_LEVERAGE
    latest_close = klines[-1]["close"]

    # 1. Feature Generation
    snapshot_wrapper = build_ml_feature_snapshot(klines)
    snapshot = snapshot_wrapper["features"]

    # 2. Rule Evaluation
    rule_result = evaluate_signal_rules(symbol, timeframe, snapshot, active_leverage)

    final_type = rule_result["type"]
    final_confidence = rule_result["confidence"]

    # 3. ML Inference & Accuracy Guardrails
    prediction = None
    if ml_model and ml_model.lower() != "off":
        prediction = get_ml_prediction(snapshot)
        
        if apply_accuracy_guardrails and final_type != "HOLD":
            guardrail = _build_accuracy_guardrail_decision(final_type, final_confidence, rule_result["scoreGap"], prediction)
            if guardrail["should_abstain"]:
                final_type = "HOLD"
                final_confidence = min(final_confidence, 55)
                reasons_str = "; ".join(guardrail["reasons"])
                rule_result["reasoning"] += f" Accuracy guardrail forced HOLD: {reasons_str}."
        elif final_type != "HOLD" and prediction and prediction.get("probability"):
            # Only probability check if full guardrails are disabled
            prob = prediction["probability"]
            if prob < MIN_ML_PROBABILITY:
                final_type = "HOLD"
                final_confidence = min(final_confidence, 55)
                rule_result["reasoning"] += f" ML probability {prob:.2f} too low."

        if final_type != "HOLD" and prediction and prediction.get("probability"):
            prob = prediction["probability"]
            final_confidence = (rule_result["confidence"] * RULE_CONFIDENCE_WEIGHT) + (prob * 100 * ML_PROBABILITY_WEIGHT)

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
        "scoring": {
            "buyScore": rule_result["buyScore"],
            "sellScore": rule_result["sellScore"],
        },
        "indicators": {},
        "leverage": active_leverage,
    }


async def generate_signal(
    symbol: str,
    timeframe: str = "1h",
    leverage: int | None = None,
) -> dict[str, Any]:
    """
    Main entrypoint to generate a signal for a symbol/timeframe.
    Replaces signalService.js `generateSignal`.
    """
    symbol = symbol.upper()
    active_leverage = leverage or DEFAULT_FUTURES_LEVERAGE

    klines = await get_klines(symbol, timeframe, limit=210)
    if not klines or len(klines) < 26:
        raise ValueError(f"Insufficient kline data for {symbol}")

    latest_close = klines[-1]["close"]

    # 1. Feature Generation
    snapshot_wrapper = build_ml_feature_snapshot(klines)
    snapshot = snapshot_wrapper["features"]

    # 2. Rule Evaluation
    rule_result = evaluate_signal_rules(symbol, timeframe, snapshot, active_leverage)
    
    # 3. MTF and Order Flow (Confirmation)
    mtf_bias = await get_higher_timeframe_bias(symbol, timeframe)
    order_flow = await get_order_flow_bias(symbol, timeframe)

    if rule_result["type"] == "BUY":
        if mtf_bias["direction"] == "BEARISH":
            rule_result["type"] = "HOLD"
            rule_result["reasoning"] += " Blocked by MTF bearish trend."
        elif order_flow["bias"] == "BEARISH":
            rule_result["confidence"] -= 8
    elif rule_result["type"] == "SELL":
        if mtf_bias["direction"] == "BULLISH":
            rule_result["type"] = "HOLD"
            rule_result["reasoning"] += " Blocked by MTF bullish trend."
        elif order_flow["bias"] == "BULLISH":
            rule_result["confidence"] -= 8

    # 4. ML Inference & Accuracy Guardrails
    prediction = get_ml_prediction(snapshot)

    final_type = rule_result["type"]
    final_confidence = rule_result["confidence"]
    
    if final_type != "HOLD":
        guardrail = _build_accuracy_guardrail_decision(final_type, final_confidence, rule_result["scoreGap"], prediction)
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
        "status": "ACTIVE",
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
        "scoring": {
            "buyScore": rule_result["buyScore"],
            "sellScore": rule_result["sellScore"],
        },
        "created_at": datetime.now(timezone.utc).isoformat()
    }
