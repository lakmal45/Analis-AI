"""
Shared utility functions used across multiple services.

Replaces the scattered helper functions (toSafeNumber, toBoundedNumber,
clamp, fmtNum, etc.) that were duplicated across signalService.js,
backtestService.js, and mlFeatureService.js.
"""

from __future__ import annotations

import math
from typing import Any


def is_finite(value: Any) -> bool:
    """
    Check if a value is a finite number.

    Replaces JavaScript's `Number.isFinite(value)`.
    Returns False for None, NaN, Infinity, strings, etc.
    """
    if value is None:
        return False
    try:
        f = float(value)
        return math.isfinite(f)
    except (TypeError, ValueError):
        return False


def to_safe_number(value: Any, fallback: float | None = None) -> float | None:
    """
    Parse a value to a finite float, returning fallback if invalid.

    Replaces `toSafeNumber(value, fallback)` from mlFeatureService.js.
    """
    if value is None:
        return fallback
    try:
        f = float(value)
        return f if math.isfinite(f) else fallback
    except (TypeError, ValueError):
        return fallback


def to_finite_number(value: Any) -> float | None:
    """
    Parse a value to a finite float, returning None if invalid.

    Replaces `toFiniteNumber(value)` from signalService.js.
    """
    return to_safe_number(value, fallback=None)


def clamp(value: float, min_val: float, max_val: float) -> float:
    """Clamp a value between min and max bounds."""
    return min(max(value, min_val), max_val)


def to_bounded_number(
    value: Any, fallback: float, min_val: float, max_val: float
) -> float:
    """
    Parse a value to a bounded float.

    Replaces `toBoundedNumber(value, fallback, min, max)` from
    signalService.js and backtestService.js.
    """
    parsed = to_safe_number(value)
    if parsed is None:
        return fallback
    return clamp(parsed, min_val, max_val)


def to_bounded_int(
    value: Any, fallback: int, min_val: int, max_val: int
) -> int:
    """
    Parse a value to a bounded integer.

    Replaces `toBoundedInt(value, fallback, min, max)` from backtestService.js.
    """
    try:
        parsed = int(value)
    except (TypeError, ValueError):
        return fallback
    if parsed <= 0:
        return fallback
    return int(clamp(parsed, min_val, max_val))


def to_fixed_number(value: Any, decimals: int = 4) -> float | None:
    """
    Round a number to a fixed number of decimal places.

    Returns None if the value is not finite.
    Replaces `toFixedNumber(value, decimals)` from backtestService.js.
    """
    if not is_finite(value):
        return None
    return round(float(value), decimals)


def normalize_leverage(
    value: Any, fallback: int = 10
) -> int:
    """
    Parse and clamp leverage to valid futures range (1–125).

    Replaces `normalizeLeverage(value, fallback)` from signalService.js.
    """
    parsed = to_safe_number(value)
    if parsed is None:
        return fallback
    return int(clamp(parsed, 1, 125))


def fmt_num(value: Any, decimals: int = 1) -> str:
    """
    Format a number for human-readable signal reasoning strings.

    Returns "N/A" if the value is not finite.
    Replaces `fmtNum(v, decimals)` from signalService.js.
    """
    if not is_finite(value):
        return "N/A"
    return f"{float(value):.{decimals}f}"


def to_pct(numerator: Any, denominator: Any) -> float | None:
    """
    Calculate a percentage: (numerator / denominator) * 100.

    Returns None if either input is invalid or denominator is zero.
    Replaces `toPct(numerator, denominator)` from mlFeatureService.js.
    """
    num = to_safe_number(numerator)
    den = to_safe_number(denominator)
    if num is None or den is None or den == 0:
        return None
    return (num / den) * 100


# ── Timeframe utilities ──────────────────────────────────

TIMEFRAME_TO_MS: dict[str, int] = {
    "1m": 60 * 1000,
    "5m": 5 * 60 * 1000,
    "15m": 15 * 60 * 1000,
    "1h": 60 * 60 * 1000,
    "4h": 4 * 60 * 60 * 1000,
    "1d": 24 * 60 * 60 * 1000,
}

DEFAULT_RESOLUTION_CANDLES: dict[str, int] = {
    "1m": 10,
    "5m": 8,
    "15m": 6,
    "1h": 5,
    "4h": 3,
    "1d": 3,
}

SUPPORTED_TIMEFRAMES = frozenset(TIMEFRAME_TO_MS.keys())


def timeframe_to_ms(timeframe: str) -> int:
    """Convert a timeframe string to milliseconds."""
    return TIMEFRAME_TO_MS.get(timeframe, TIMEFRAME_TO_MS["1h"])


def get_default_resolution_candles(timeframe: str) -> int:
    """Get the default TP/SL look-ahead window for a timeframe."""
    return DEFAULT_RESOLUTION_CANDLES.get(timeframe, 5)


# ── Direction / outcome helpers ──────────────────────────

def get_expected_direction(signal_type: str) -> str:
    """Map signal type to expected price direction."""
    if signal_type == "BUY":
        return "UP"
    if signal_type == "SELL":
        return "DOWN"
    return "NEUTRAL"


def get_actual_direction(entry_price: float, resolution_price: float) -> str:
    """Determine actual price direction from entry to resolution."""
    if resolution_price > entry_price:
        return "UP"
    if resolution_price < entry_price:
        return "DOWN"
    return "NEUTRAL"


def get_outcome_from_directions(
    expected: str, actual: str, status: str = "COMPLETED"
) -> str:
    """Determine WIN/LOSS/NEUTRAL from expected vs actual direction."""
    if status == "CANCELLED":
        return "CANCELLED"
    if expected == "NEUTRAL" or actual == "NEUTRAL":
        return "NEUTRAL"
    return "WIN" if expected == actual else "LOSS"


def get_exit_reason_outcome(
    exit_reason: str | None,
    expected_direction: str,
    actual_direction: str,
) -> str:
    """Determine outcome from an exit reason string."""
    if exit_reason and (
        exit_reason.startswith("take_profit")
        or exit_reason == "signal_target_hit"
    ):
        return "WIN"

    if exit_reason and (
        exit_reason.startswith("stop_loss")
        or exit_reason == "signal_stop_loss_hit"
    ):
        return "LOSS"

    return get_outcome_from_directions(
        expected_direction, actual_direction, "COMPLETED"
    )
