from __future__ import annotations

import json
import logging
from typing import Any

import httpx

from app.cache import get_redis

logger = logging.getLogger(__name__)

BINANCE_FAPI = "https://fapi.binance.com"


async def get_funding_rate(symbol: str) -> dict[str, Any] | None:
    symbol = symbol.upper()
    cache_key = f"funding_{symbol}"
    redis = await get_redis()
    
    cached = await redis.get(cache_key)
    if cached:
        return json.loads(cached)

    try:
        async with httpx.AsyncClient() as client:
            response = await client.get(
                f"{BINANCE_FAPI}/fapi/v1/fundingRate",
                params={"symbol": symbol, "limit": 1},
                timeout=5.0,
            )
            response.raise_for_status()
            data = response.json()

            if not data:
                return None

            result = {
                "fundingRate": float(data[0]["fundingRate"]),
                "fundingTime": data[0]["fundingTime"],
            }
            await redis.setex(cache_key, 300, json.dumps(result))
            return result
    except Exception as exc:
        logger.error(f"Funding rate error for {symbol}: {exc}")
        return None


async def get_open_interest(symbol: str) -> dict[str, Any] | None:
    symbol = symbol.upper()
    cache_key = f"oi_{symbol}"
    redis = await get_redis()

    cached = await redis.get(cache_key)
    if cached:
        return json.loads(cached)

    try:
        async with httpx.AsyncClient() as client:
            response = await client.get(
                f"{BINANCE_FAPI}/fapi/v1/openInterest",
                params={"symbol": symbol},
                timeout=5.0,
            )
            response.raise_for_status()
            data = response.json()

            result = {
                "openInterest": float(data["openInterest"]),
                "symbol": data["symbol"],
                "time": data["time"],
            }
            await redis.setex(cache_key, 300, json.dumps(result))
            return result
    except Exception as exc:
        logger.error(f"Open interest error for {symbol}: {exc}")
        return None


async def get_long_short_ratio(symbol: str, period: str = "1h") -> dict[str, Any] | None:
    symbol = symbol.upper()
    cache_key = f"lsr_{symbol}_{period}"
    redis = await get_redis()

    cached = await redis.get(cache_key)
    if cached:
        return json.loads(cached)

    try:
        async with httpx.AsyncClient() as client:
            response = await client.get(
                f"{BINANCE_FAPI}/futures/data/topLongShortAccountRatio",
                params={"symbol": symbol, "period": period, "limit": 1},
                timeout=5.0,
            )
            response.raise_for_status()
            data = response.json()

            if not data:
                return None

            result = {
                "longShortRatio": float(data[0]["longShortRatio"]),
                "longAccount": float(data[0]["longAccount"]),
                "shortAccount": float(data[0]["shortAccount"]),
                "timestamp": data[0]["timestamp"],
            }
            await redis.setex(cache_key, 300, json.dumps(result))
            return result
    except Exception as exc:
        logger.error(f"Long/short ratio error for {symbol}: {exc}")
        return None


async def get_order_flow_bias(symbol: str, timeframe: str = "1h") -> dict[str, Any]:
    funding = await get_funding_rate(symbol)
    lsr = await get_long_short_ratio(symbol, timeframe)

    bullish_points = 0.0
    bearish_points = 0.0
    details: dict[str, Any] = {}

    # 1. Funding rate
    if funding:
        rate = funding["fundingRate"]
        details["fundingRate"] = rate
        if rate > 0.0005:
            bearish_points += 1
            details["fundingBias"] = "BEARISH_CONTRARIAN"
        elif rate < -0.0005:
            bullish_points += 1
            details["fundingBias"] = "BULLISH_CONTRARIAN"
        else:
            details["fundingBias"] = "NEUTRAL"

    # 2. Long/Short ratio
    if lsr:
        ratio = lsr["longShortRatio"]
        details["longShortRatio"] = ratio
        if ratio > 2.0:
            bearish_points += 1
            details["lsrBias"] = "BEARISH_CONTRARIAN"
        elif ratio < 0.5:
            bullish_points += 1
            details["lsrBias"] = "BULLISH_CONTRARIAN"
        elif ratio > 1.2:
            bullish_points += 0.5
            details["lsrBias"] = "MILDLY_BULLISH"
        elif ratio < 0.8:
            bearish_points += 0.5
            details["lsrBias"] = "MILDLY_BEARISH"
        else:
            details["lsrBias"] = "NEUTRAL"

    total_checks = bullish_points + bearish_points
    strength = 0
    if total_checks > 0:
        strength = round((abs(bullish_points - bearish_points) / total_checks) * 100)

    if bullish_points > bearish_points:
        bias = "BULLISH"
    elif bearish_points > bullish_points:
        bias = "BEARISH"
    else:
        bias = "NEUTRAL"

    return {"bias": bias, "strength": strength, "details": details}
