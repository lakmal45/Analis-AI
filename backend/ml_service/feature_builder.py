from __future__ import annotations

from typing import Any

import pandas as pd
import pandas_ta as ta  # type: ignore[import-untyped]


def _safe_number(value: Any) -> float | None:
    if value is None:
        return None

    try:
        parsed = float(value)
    except (TypeError, ValueError):
        return None

    return parsed if pd.notna(parsed) else None


def _safe_bool(value: Any) -> bool | None:
    if value is None or pd.isna(value):
        return None
    return bool(value)


def _pct(numerator: float | None, denominator: float | None) -> float | None:
    if numerator is None or denominator in (None, 0):
        return None
    return (numerator / denominator) * 100


def _latest(series: pd.Series | None) -> float | None:
    if series is None or series.empty:
        return None
    return _safe_number(series.iloc[-1])


def _previous(series: pd.Series | None) -> float | None:
    if series is None or len(series) < 2:
        return None
    return _safe_number(series.iloc[-2])


def _slope(series: pd.Series | None, periods: int = 5) -> float | None:
    """Simple slope of the last N values (difference between last and N-ago)."""
    if series is None or len(series) < periods + 1:
        return None
    last = _safe_number(series.iloc[-1])
    prev = _safe_number(series.iloc[-(periods + 1)])
    if last is None or prev is None:
        return None
    return last - prev


def _resolve_trend_direction(
    close_price: float | None,
    ema20: float | None,
    sma20: float | None,
    sma200: float | None,
) -> str:
    if close_price is None or ema20 is None or sma20 is None:
        return "UNKNOWN"

    if sma200 is not None:
        if close_price > ema20 > sma20 > sma200:
            return "STRONG_BULLISH"
        if close_price < ema20 < sma20 < sma200:
            return "STRONG_BEARISH"

    if close_price > ema20 and ema20 >= sma20:
        return "BULLISH"
    if close_price < ema20 and ema20 <= sma20:
        return "BEARISH"
    return "SIDEWAYS"


def _resolve_market_regime(
    trend_direction: str,
    atr_pct: float | None,
    bollinger_width_pct: float | None,
) -> str:
    volatility = max(atr_pct or 0, bollinger_width_pct or 0)
    if "BULLISH" in trend_direction or "BEARISH" in trend_direction:
        return "TRENDING_VOLATILE" if volatility >= 3 else "TRENDING"
    return "RANGING_VOLATILE" if volatility >= 3 else "RANGING"


def _normalize_candles(candles: list[dict[str, Any]]) -> pd.DataFrame:
    frame = pd.DataFrame(candles)
    if frame.empty:
        raise ValueError("No candle data provided")

    required_columns = ["open", "high", "low", "close", "volume"]
    missing = [column for column in required_columns if column not in frame.columns]
    if missing:
        raise ValueError(f"Missing candle columns: {', '.join(missing)}")

    for column in required_columns:
        frame[column] = pd.to_numeric(frame[column], errors="coerce")

    if "openTime" in frame.columns:
        frame["openTime"] = pd.to_numeric(frame["openTime"], errors="coerce")
        frame = frame.sort_values("openTime", kind="stable")

    frame = frame.reset_index(drop=True)
    return frame


def _safe_col(dataframe: pd.DataFrame | None, column_name: str) -> pd.Series | None:
    """Safely extract a column from a DataFrame that may be None."""
    if dataframe is None or column_name not in dataframe:
        return None
    return dataframe[column_name]


def _latest_swing_level(
    frame: pd.DataFrame,
    source_column: str,
    swing_length: int = 10,
) -> tuple[float | None, int | None]:
    if len(frame) < swing_length * 2 + 1:
        return None, None

    values = frame[source_column].tolist()
    for idx in range(len(values) - 1 - swing_length, swing_length - 1, -1):
        candidate = _safe_number(values[idx])
        if candidate is None:
            continue

        window = values[idx - swing_length : idx + swing_length + 1]
        filtered = [_safe_number(value) for value in window]
        if any(value is None for value in filtered):
            continue

        if source_column == "high":
            is_pivot = all(candidate > value for offset, value in enumerate(filtered) if offset != swing_length)
        else:
            is_pivot = all(candidate < value for offset, value in enumerate(filtered) if offset != swing_length)

        if is_pivot:
            return candidate, idx

    return None, None


def _calculate_supply_demand(
    frame: pd.DataFrame,
    atr_value: float | None,
    latest_close: float | None,
    swing_length: int = 10,
    box_width: float = 5.0,
) -> dict[str, Any]:
    buffer = (atr_value or 0) * (box_width / 10.0)
    supply_price, _ = _latest_swing_level(frame, "high", swing_length)
    demand_price, _ = _latest_swing_level(frame, "low", swing_length)

    supply = None
    if supply_price is not None:
        poi = supply_price - buffer / 2
        supply = {
            "top": supply_price,
            "bottom": supply_price - buffer,
            "poi": poi,
            "distancePct": _pct(poi - latest_close, latest_close),
        }

    demand = None
    if demand_price is not None:
        poi = demand_price + buffer / 2
        demand = {
            "top": demand_price + buffer,
            "bottom": demand_price,
            "poi": poi,
            "distancePct": _pct(latest_close - poi, latest_close),
        }

    bias = "NONE"
    if supply and demand:
        supply_distance = abs(supply["distancePct"] or 0)
        demand_distance = abs(demand["distancePct"] or 0)
        bias = "DEMAND" if demand_distance <= supply_distance else "SUPPLY"
    elif demand:
        bias = "DEMAND"
    elif supply:
        bias = "SUPPLY"

    return {
        "bias": bias,
        "supply": supply,
        "demand": demand,
    }


def _find_active_fvg(frame: pd.DataFrame, direction: str) -> dict[str, Any] | None:
    if len(frame) < 3:
        return None

    for idx in range(len(frame) - 1, 1, -1):
        current = frame.iloc[idx]
        middle = frame.iloc[idx - 1]
        first = frame.iloc[idx - 2]

        current_low = _safe_number(current["low"])
        current_high = _safe_number(current["high"])
        middle_close = _safe_number(middle["close"])
        first_high = _safe_number(first["high"])
        first_low = _safe_number(first["low"])
        if None in (current_low, current_high, middle_close, first_high, first_low):
            continue

        same_type = (
            _safe_number(current["close"]) >= _safe_number(current["open"])
        ) == (
            _safe_number(middle["close"]) >= _safe_number(middle["open"])
        ) == (
            _safe_number(first["close"]) >= _safe_number(first["open"])
        )

        if direction == "bull":
            if not (current_low > first_high and middle_close > first_high and same_type):
                continue

            min_value = first_high
            max_value = current_low
            invalidated = any(
                (_safe_number(close_value) or float("inf")) < min_value
                for close_value in frame["close"].iloc[idx + 1 :]
            )
        else:
            if not (current_high < first_low and middle_close < first_low and same_type):
                continue

            min_value = current_high
            max_value = first_low
            invalidated = any(
                (_safe_number(close_value) or float("-inf")) > max_value
                for close_value in frame["close"].iloc[idx + 1 :]
            )

        if not invalidated:
            return {
                "min": min_value,
                "max": max_value,
                "sizePct": _pct(max_value - min_value, min_value if direction == "bull" else max_value),
            }

    return None


def _calculate_fvg_structure(frame: pd.DataFrame, latest_close: float | None) -> dict[str, Any]:
    bullish = _find_active_fvg(frame, "bull")
    bearish = _find_active_fvg(frame, "bear")

    if bullish is not None:
        bullish["distancePct"] = _pct(
            latest_close - ((bullish["min"] + bullish["max"]) / 2),
            latest_close,
        )

    if bearish is not None:
        bearish["distancePct"] = _pct(
            ((bearish["min"] + bearish["max"]) / 2) - latest_close,
            latest_close,
        )

    bias = "NONE"
    if bullish and bearish:
        bias = (
            "BULLISH"
            if abs(bullish["distancePct"] or 0) <= abs(bearish["distancePct"] or 0)
            else "BEARISH"
        )
    elif bullish:
        bias = "BULLISH"
    elif bearish:
        bias = "BEARISH"

    return {
        "bias": bias,
        "bullish": bullish,
        "bearish": bearish,
    }


def build_feature_snapshot(candles: list[dict[str, Any]], options: dict[str, Any] | None = None) -> dict[str, Any]:
    options = options or {}
    frame = _normalize_candles(candles)

    if ta is None:
        raise RuntimeError(
            "pandas-ta is not installed. Install it in the ML service environment to enable library-based feature generation."
        )

    if len(frame) < 26:
        raise ValueError("At least 26 candles are required to build technical features")

    close = frame["close"]
    high = frame["high"]
    low = frame["low"]
    open_ = frame["open"]
    volume = frame["volume"]

    # ──────────────────────────────────────────────────────────────
    # Existing indicators (16 core)
    # ──────────────────────────────────────────────────────────────
    rsi14 = ta.rsi(close=close, length=14)
    macd = ta.macd(close=close, fast=12, slow=26, signal=9)
    stoch = ta.stoch(high=high, low=low, close=close, k=14, d=3, smooth_k=3)
    bollinger = ta.bbands(close=close, length=20, std=2)
    atr14_series = ta.atr(high=high, low=low, close=close, length=14)
    adx = ta.adx(high=high, low=low, close=close, length=14)
    cci20 = ta.cci(high=high, low=low, close=close, length=20)
    roc10 = ta.roc(close=close, length=10)
    mfi14 = ta.mfi(high=high, low=low, close=close, volume=volume, length=14)
    obv = ta.obv(close=close, volume=volume)
    ema20 = ta.ema(close=close, length=20)
    ema50 = ta.ema(close=close, length=50)
    sma20 = ta.sma(close=close, length=20)
    sma50 = ta.sma(close=close, length=50)
    sma200 = ta.sma(close=close, length=200)

    # ──────────────────────────────────────────────────────────────
    # NEW indicators — expanding to ~35 total
    # Selected for LOW correlation with existing features and
    # HIGH predictive value for crypto futures trading.
    # ──────────────────────────────────────────────────────────────

    # Momentum — new oscillators covering different timeframes/methods
    willr14 = ta.willr(high=high, low=low, close=close, length=14)
    ao = ta.ao(high=high, low=low)  # Awesome Oscillator (5/34 SMA of median)
    uo = ta.uo(high=high, low=low, close=close)  # Ultimate Oscillator (7/14/28)
    trix15 = ta.trix(close=close, length=15)  # Triple-smoothed EMA rate of change
    ppo = ta.ppo(close=close)  # Percentage Price Oscillator (signal & hist)

    # Trend — additional moving averages that capture different dynamics
    hma20 = ta.hma(close=close, length=20)  # Hull MA — faster reaction than EMA
    dema20 = ta.dema(close=close, length=20)  # Double EMA — less lag
    psar = ta.psar(high=high, low=low, close=close)  # Parabolic SAR

    # Volatility — channel-based indicators
    donchian = ta.donchian(high=high, low=low, close=close, lower_length=20, upper_length=20)
    kc = ta.kc(high=high, low=low, close=close, length=20)  # Keltner Channels

    # Volume — money flow and accumulation
    cmf20 = ta.cmf(high=high, low=low, close=close, volume=volume, length=20)  # Chaikin Money Flow
    ad = ta.ad(high=high, low=low, close=close, volume=volume)  # Accumulation/Distribution line
    efi13 = ta.efi(close=close, volume=volume, length=13)  # Elder Force Index

    # Statistics — distribution features for ML
    zscore20 = ta.zscore(close=close, length=20)  # Z-score — normalized distance from mean
    linreg_result = ta.linreg(close=close, length=20)  # Linear regression value

    # ──────────────────────────────────────────────────────────────
    # Extract series from multi-column results
    # ──────────────────────────────────────────────────────────────
    macd_line = _safe_col(macd, "MACD_12_26_9")
    macd_signal = _safe_col(macd, "MACDs_12_26_9")
    macd_hist = _safe_col(macd, "MACDh_12_26_9")
    stoch_k = _safe_col(stoch, "STOCHk_14_3_3")
    stoch_d = _safe_col(stoch, "STOCHd_14_3_3")
    bb_upper = _safe_col(bollinger, "BBU_20_2.0")
    bb_lower = _safe_col(bollinger, "BBL_20_2.0")
    bb_percent = _safe_col(bollinger, "BBP_20_2.0")
    adx14 = _safe_col(adx, "ADX_14")
    dmp14 = _safe_col(adx, "DMP_14")
    dmn14 = _safe_col(adx, "DMN_14")

    # PPO multi-column extraction
    ppo_line = _safe_col(ppo, "PPO_12_26_9")
    ppo_signal_line = _safe_col(ppo, "PPOs_12_26_9")
    ppo_hist = _safe_col(ppo, "PPOh_12_26_9")

    # PSAR — extract the long/short SAR values
    psar_long = _safe_col(psar, "PSARl_0.02_0.2") if psar is not None else None
    psar_short = _safe_col(psar, "PSARs_0.02_0.2") if psar is not None else None

    # Donchian channels extraction
    dc_upper = _safe_col(donchian, "DCU_20_20")
    dc_lower = _safe_col(donchian, "DCL_20_20")
    dc_mid = _safe_col(donchian, "DCM_20_20")

    # Keltner channels extraction
    kc_upper = _safe_col(kc, "KCUe_20_2")
    kc_lower = _safe_col(kc, "KCLe_20_2")

    # ──────────────────────────────────────────────────────────────
    # Compute latest scalar values
    # ──────────────────────────────────────────────────────────────
    latest_close = _safe_number(close.iloc[-1])
    latest_open = _safe_number(open_.iloc[-1])
    latest_high = _safe_number(high.iloc[-1])
    latest_low = _safe_number(low.iloc[-1])
    latest_volume = _safe_number(volume.iloc[-1]) or 0

    latest_ema20 = _latest(ema20)
    latest_ema50 = _latest(ema50)
    latest_sma20 = _latest(sma20)
    latest_sma50 = _latest(sma50)
    latest_sma200 = _latest(sma200)
    latest_atr14 = _latest(atr14_series)
    latest_bb_upper = _latest(bb_upper)
    latest_bb_lower = _latest(bb_lower)
    latest_bb_percent = _latest(bb_percent)
    latest_macd_line = _latest(macd_line)
    latest_macd_signal = _latest(macd_signal)
    prev_macd_line = _previous(macd_line)
    prev_macd_signal = _previous(macd_signal)

    # New latest values
    latest_hma20 = _latest(hma20)
    latest_dema20 = _latest(dema20)
    latest_dc_upper = _latest(dc_upper)
    latest_dc_lower = _latest(dc_lower)
    latest_dc_mid = _latest(dc_mid)
    latest_kc_upper = _latest(kc_upper)
    latest_kc_lower = _latest(kc_lower)

    # ──────────────────────────────────────────────────────────────
    # Derived percentage / ratio features
    # ──────────────────────────────────────────────────────────────
    price_vs_ema_pct = _pct(
        latest_close - latest_ema20 if latest_close is not None and latest_ema20 is not None else None,
        latest_ema20,
    )
    price_vs_sma_pct = _pct(
        latest_close - latest_sma20 if latest_close is not None and latest_sma20 is not None else None,
        latest_sma20,
    )
    price_vs_sma200_pct = _pct(
        latest_close - latest_sma200 if latest_close is not None and latest_sma200 is not None else None,
        latest_sma200,
    )
    ema_sma_spread_pct = _pct(
        latest_ema20 - latest_sma20 if latest_ema20 is not None and latest_sma20 is not None else None,
        latest_sma20,
    )
    atr_pct = _pct(latest_atr14, latest_close)
    candle_range_pct = _pct(
        latest_high - latest_low if latest_high is not None and latest_low is not None else None,
        latest_close,
    )
    candle_body_pct = _pct(
        abs(latest_close - latest_open) if latest_close is not None and latest_open is not None else None,
        latest_close,
    )
    upper_wick_pct = _pct(
        latest_high - max(latest_open, latest_close)
        if None not in (latest_high, latest_open, latest_close)
        else None,
        latest_close,
    )
    lower_wick_pct = _pct(
        min(latest_open, latest_close) - latest_low
        if None not in (latest_open, latest_close, latest_low)
        else None,
        latest_close,
    )
    volume_sma20 = _safe_number(volume.tail(20).mean()) if len(volume) >= 20 else None
    relative_volume = (
        latest_volume / volume_sma20
        if volume_sma20 not in (None, 0)
        else None
    )
    obv_slope5 = (
        _safe_number(obv.iloc[-1] - obv.iloc[-6])
        if obv is not None and len(obv) >= 6
        else None
    )

    # New derived features
    price_vs_hma_pct = _pct(
        latest_close - latest_hma20 if latest_close is not None and latest_hma20 is not None else None,
        latest_hma20,
    )
    price_vs_dema_pct = _pct(
        latest_close - latest_dema20 if latest_close is not None and latest_dema20 is not None else None,
        latest_dema20,
    )

    # Donchian channel position — where price sits within the channel (0-100%)
    donchian_position_pct = None
    if None not in (latest_close, latest_dc_upper, latest_dc_lower) and latest_dc_upper != latest_dc_lower:
        donchian_position_pct = ((latest_close - latest_dc_lower) / (latest_dc_upper - latest_dc_lower)) * 100

    donchian_width_pct = _pct(
        latest_dc_upper - latest_dc_lower if latest_dc_upper is not None and latest_dc_lower is not None else None,
        latest_close,
    )

    # Keltner channel position
    keltner_position_pct = None
    if None not in (latest_close, latest_kc_upper, latest_kc_lower) and latest_kc_upper != latest_kc_lower:
        keltner_position_pct = ((latest_close - latest_kc_lower) / (latest_kc_upper - latest_kc_lower)) * 100

    # Squeeze detection — Bollinger inside Keltner = low volatility compression
    squeeze_on = None
    if None not in (latest_bb_lower, latest_bb_upper, latest_kc_lower, latest_kc_upper):
        squeeze_on = latest_bb_lower > latest_kc_lower and latest_bb_upper < latest_kc_upper

    # Parabolic SAR direction — above close = bearish, below close = bullish
    psar_direction = "UNKNOWN"
    latest_psar_long = _latest(psar_long)
    latest_psar_short = _latest(psar_short)
    if latest_psar_long is not None and latest_close is not None:
        psar_direction = "BULLISH"
    elif latest_psar_short is not None and latest_close is not None:
        psar_direction = "BEARISH"

    psar_distance_pct = None
    active_psar = latest_psar_long if latest_psar_long is not None else latest_psar_short
    if active_psar is not None and latest_close not in (None, 0):
        psar_distance_pct = ((latest_close - active_psar) / latest_close) * 100

    # AD line slope
    ad_slope5 = _slope(ad, 5)

    # ──────────────────────────────────────────────────────────────
    # MACD crossover logic
    # ──────────────────────────────────────────────────────────────
    if None not in (prev_macd_line, prev_macd_signal, latest_macd_line, latest_macd_signal):
        if prev_macd_line <= prev_macd_signal and latest_macd_line > latest_macd_signal:
            macd_crossover_direction = "BULLISH"
        elif prev_macd_line >= prev_macd_signal and latest_macd_line < latest_macd_signal:
            macd_crossover_direction = "BEARISH"
        else:
            macd_crossover_direction = "NONE"
    else:
        macd_crossover_direction = "UNKNOWN"

    macd_crossover_strength = (
        abs(latest_macd_line - latest_macd_signal)
        if latest_macd_line is not None and latest_macd_signal is not None
        else None
    )

    # ──────────────────────────────────────────────────────────────
    # Composite classification features
    # ──────────────────────────────────────────────────────────────
    trend_direction = _resolve_trend_direction(
        latest_close,
        latest_ema20,
        latest_sma20,
        latest_sma200,
    )
    trend_strength = max(
        abs(price_vs_ema_pct or 0),
        abs(price_vs_sma_pct or 0),
        abs(ema_sma_spread_pct or 0),
        abs(_latest(adx14) or 0),
    )
    bollinger_band_width_pct = _pct(
        latest_bb_upper - latest_bb_lower
        if latest_bb_upper is not None and latest_bb_lower is not None
        else None,
        latest_close,
    )
    natr14 = _pct(latest_atr14, latest_close)
    market_regime = _resolve_market_regime(
        trend_direction,
        atr_pct,
        bollinger_band_width_pct,
    )
    supply_demand = _calculate_supply_demand(frame, latest_atr14, latest_close)
    fvg_structure = _calculate_fvg_structure(frame, latest_close)

    timeframe = options.get("timeframe", "1h")
    leverage = options.get("leverage", 10)
    signal_type = options.get("signalType", "UNKNOWN")

    return {
        "featureVersion": "v3_expanded",
        "generatedAt": pd.Timestamp.utcnow().isoformat(),
        "source": "pandas_ta",
        "momentum": {
            "rsi14": _latest(rsi14),
            "macdLine": latest_macd_line,
            "macdSignal": latest_macd_signal,
            "macdHistogram": _latest(macd_hist),
            "macdCrossoverDirection": macd_crossover_direction,
            "macdCrossoverStrength": _safe_number(macd_crossover_strength),
            "stochasticK": _latest(stoch_k),
            "stochasticD": _latest(stoch_d),
            "cci20": _latest(cci20),
            "roc10": _latest(roc10),
            # NEW momentum indicators
            "williamsR14": _latest(willr14),
            "awesomeOscillator": _latest(ao),
            "ultimateOscillator": _latest(uo),
            "trix15": _latest(trix15),
            "ppoLine": _latest(ppo_line),
            "ppoHistogram": _latest(ppo_hist),
        },
        "trend": {
            "ema20": latest_ema20,
            "ema50": latest_ema50,
            "sma20": latest_sma20,
            "sma50": latest_sma50,
            "sma200": latest_sma200,
            "emaSmaSpreadPct": _safe_number(ema_sma_spread_pct),
            "priceVsEmaPct": _safe_number(price_vs_ema_pct),
            "priceVsSmaPct": _safe_number(price_vs_sma_pct),
            "priceVsSma200Pct": _safe_number(price_vs_sma200_pct),
            "trendDirection": trend_direction,
            "trendStrength": _safe_number(trend_strength),
            "adx14": _latest(adx14),
            "dmiPlus14": _latest(dmp14),
            "dmiMinus14": _latest(dmn14),
            # NEW trend indicators
            "hma20": latest_hma20,
            "dema20": latest_dema20,
            "priceVsHmaPct": _safe_number(price_vs_hma_pct),
            "priceVsDemaPct": _safe_number(price_vs_dema_pct),
            "psarDirection": psar_direction,
            "psarDistancePct": _safe_number(psar_distance_pct),
            "linregValue": _latest(linreg_result),
        },
        "volatility": {
            "atr14": latest_atr14,
            "atrPct": _safe_number(atr_pct),
            "candleRangePct": _safe_number(candle_range_pct),
            "bollingerBandWidthPct": _safe_number(bollinger_band_width_pct),
            "bollingerPercentB": latest_bb_percent,
            "natr14": _safe_number(natr14),
            "volatilityPct": max(atr_pct or 0, candle_range_pct or 0, bollinger_band_width_pct or 0),
            # NEW volatility indicators
            "donchianPositionPct": _safe_number(donchian_position_pct),
            "donchianWidthPct": _safe_number(donchian_width_pct),
            "keltnerPositionPct": _safe_number(keltner_position_pct),
            "squeezeOn": _safe_bool(squeeze_on),
            "zscore20": _latest(zscore20),
        },
        "volume": {
            "volume": latest_volume,
            "volumeSma20": volume_sma20,
            "relativeVolume": _safe_number(relative_volume),
            "mfi14": _latest(mfi14),
            "obv": _latest(obv),
            "obvSlope5": obv_slope5,
            # NEW volume indicators
            "cmf20": _latest(cmf20),
            "adLine": _latest(ad),
            "adSlope5": _safe_number(ad_slope5),
            "efi13": _latest(efi13),
        },
        "structure": {
            "activeZoneBias": supply_demand["bias"],
            "nearestSupplyTop": supply_demand["supply"]["top"] if supply_demand["supply"] else None,
            "nearestSupplyBottom": supply_demand["supply"]["bottom"] if supply_demand["supply"] else None,
            "nearestSupplyPoi": supply_demand["supply"]["poi"] if supply_demand["supply"] else None,
            "nearestSupplyDistancePct": supply_demand["supply"]["distancePct"] if supply_demand["supply"] else None,
            "nearestDemandTop": supply_demand["demand"]["top"] if supply_demand["demand"] else None,
            "nearestDemandBottom": supply_demand["demand"]["bottom"] if supply_demand["demand"] else None,
            "nearestDemandPoi": supply_demand["demand"]["poi"] if supply_demand["demand"] else None,
            "nearestDemandDistancePct": supply_demand["demand"]["distancePct"] if supply_demand["demand"] else None,
            "nearestFvgBias": fvg_structure["bias"],
            "bullishFvgTop": fvg_structure["bullish"]["max"] if fvg_structure["bullish"] else None,
            "bullishFvgBottom": fvg_structure["bullish"]["min"] if fvg_structure["bullish"] else None,
            "bullishFvgDistancePct": fvg_structure["bullish"]["distancePct"] if fvg_structure["bullish"] else None,
            "bullishFvgSizePct": fvg_structure["bullish"]["sizePct"] if fvg_structure["bullish"] else None,
            "bearishFvgTop": fvg_structure["bearish"]["max"] if fvg_structure["bearish"] else None,
            "bearishFvgBottom": fvg_structure["bearish"]["min"] if fvg_structure["bearish"] else None,
            "bearishFvgDistancePct": fvg_structure["bearish"]["distancePct"] if fvg_structure["bearish"] else None,
            "bearishFvgSizePct": fvg_structure["bearish"]["sizePct"] if fvg_structure["bearish"] else None,
        },
        "candle": {
            "bodyPct": _safe_number(candle_body_pct),
            "upperWickPct": _safe_number(upper_wick_pct),
            "lowerWickPct": _safe_number(lower_wick_pct),
            "bullishStrength": _safe_number(candle_body_pct if latest_close is not None and latest_open is not None and latest_close >= latest_open else 0),
            "bearishStrength": _safe_number(candle_body_pct if latest_close is not None and latest_open is not None and latest_close < latest_open else 0),
            "isBullish": _safe_bool(latest_close is not None and latest_open is not None and latest_close >= latest_open),
        },
        "context": {
            "signalType": signal_type if signal_type in {"BUY", "SELL", "HOLD"} else "UNKNOWN",
            "timeframe": timeframe,
            "leverage": _safe_number(leverage) or 10,
            "marketRegime": market_regime,
            "closePrice": latest_close,
            "openPrice": latest_open,
            "highPrice": latest_high,
            "lowPrice": latest_low,
        },
    }
