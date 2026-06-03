from __future__ import annotations

from typing import Any

import pandas as pd
import pandas_ta as ta  # type: ignore

from app.utils.helpers import to_fixed_number


def calculate_rsi(candles: list[dict[str, Any]], length: int = 14) -> float | None:
    frame = _prepare_frame(candles)
    if frame.empty or len(frame) <= length:
        return None
    rsi = ta.rsi(frame["close"], length=length)
    return to_fixed_number(rsi.iloc[-1], 2) if rsi is not None else None


def calculate_macd(
    candles: list[dict[str, Any]], fast: int = 12, slow: int = 26, signal: int = 9
) -> dict[str, float | None] | None:
    frame = _prepare_frame(candles)
    if frame.empty or len(frame) <= slow:
        return None
    macd = ta.macd(frame["close"], fast=fast, slow=slow, signal=signal)
    if macd is None or macd.empty:
        return None
    return {
        "macd": to_fixed_number(macd.iloc[-1, 0], 4),
        "signal": to_fixed_number(macd.iloc[-1, 1], 4),
        "histogram": to_fixed_number(macd.iloc[-1, 2], 4),
    }


def _prepare_frame(candles: list[dict[str, Any]]) -> pd.DataFrame:
    if not candles:
        return pd.DataFrame()
    frame = pd.DataFrame(candles)
    if "close" in frame.columns:
        frame["close"] = pd.to_numeric(frame["close"], errors="coerce")
    return frame
