from __future__ import annotations

import logging
from typing import Any

import pandas as pd
import pandas_ta as ta  # type: ignore

from app.services.market_service import get_klines

logger = logging.getLogger(__name__)

HIGHER_TIMEFRAME_MAP = {
    "1m": "5m",
    "5m": "15m",
    "15m": "1h",
    "1h": "4h",
    "4h": "1d",
    "1d": "1d",  # No higher TF for daily — skip MTF
}


async def get_higher_timeframe_bias(
    symbol: str, signal_timeframe: str
) -> dict[str, Any]:
    htf = HIGHER_TIMEFRAME_MAP.get(signal_timeframe, signal_timeframe)

    if htf == signal_timeframe:
        return {
            "direction": "NEUTRAL",
            "strength": 0,
            "htf": htf,
            "details": {"skipped": True},
        }

    try:
        kline_data = await get_klines(symbol, htf, limit=100)
    except Exception as exc:
        logger.error(f"[MTF] Failed to fetch {htf} klines for {symbol}: {exc}")
        return {
            "direction": "NEUTRAL",
            "strength": 0,
            "htf": htf,
            "details": {"error": str(exc)},
        }

    if not kline_data or len(kline_data) < 26:
        return {
            "direction": "NEUTRAL",
            "strength": 0,
            "htf": htf,
            "details": {"insufficientData": True},
        }

    frame = pd.DataFrame(kline_data)
    close = pd.to_numeric(frame["close"], errors="coerce")

    ema20 = ta.ema(close=close, length=20)
    sma50 = ta.sma(close=close, length=50)
    rsi14 = ta.rsi(close=close, length=14)

    latest_close = close.iloc[-1]
    latest_ema20 = ema20.iloc[-1] if not ema20.empty and pd.notna(ema20.iloc[-1]) else None
    latest_sma50 = sma50.iloc[-1] if not sma50.empty and pd.notna(sma50.iloc[-1]) else None
    latest_rsi = rsi14.iloc[-1] if not rsi14.empty and pd.notna(rsi14.iloc[-1]) else None

    prev_ema20 = None
    if not ema20.empty and len(ema20) > 5 and pd.notna(ema20.iloc[-6]):
        prev_ema20 = ema20.iloc[-6]

    ema20_rising = None
    if latest_ema20 is not None and prev_ema20 is not None:
        ema20_rising = latest_ema20 > prev_ema20

    bullish_points = 0
    bearish_points = 0
    details: dict[str, Any] = {}

    if latest_ema20 is not None:
        if latest_close > latest_ema20:
            bullish_points += 1
            details["priceVsEma20"] = "BULLISH"
        else:
            bearish_points += 1
            details["priceVsEma20"] = "BEARISH"

    if latest_sma50 is not None:
        if latest_close > latest_sma50:
            bullish_points += 1
            details["priceVsSma50"] = "BULLISH"
        else:
            bearish_points += 1
            details["priceVsSma50"] = "BEARISH"

    if latest_rsi is not None:
        if latest_rsi > 55:
            bullish_points += 1
            details["rsi"] = "BULLISH"
        elif latest_rsi < 45:
            bearish_points += 1
            details["rsi"] = "BEARISH"
        else:
            details["rsi"] = "NEUTRAL"

    if ema20_rising is not None:
        if ema20_rising:
            bullish_points += 1
            details["ema20Slope"] = "RISING"
        else:
            bearish_points += 1
            details["ema20Slope"] = "FALLING"

    total_checks = bullish_points + bearish_points
    strength = 0
    if total_checks > 0:
        strength = round((abs(bullish_points - bearish_points) / total_checks) * 100)

    if bullish_points > bearish_points:
        direction = "BULLISH"
    elif bearish_points > bullish_points:
        direction = "BEARISH"
    else:
        direction = "NEUTRAL"

    details["bullishPoints"] = bullish_points
    details["bearishPoints"] = bearish_points

    return {
        "direction": direction,
        "strength": strength,
        "htf": htf,
        "details": details,
    }
