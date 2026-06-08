from __future__ import annotations

import json
import logging
from typing import Any

import httpx

from app.cache import get_redis

logger = logging.getLogger(__name__)

BINANCE_API_URL = "https://api.binance.com/api/v3"


async def get_price(symbol: str) -> float | None:
    """Fetch the current price of a symbol, caching for 10 seconds."""
    symbol = symbol.upper()
    cache_key = f"price:{symbol}"
    
    redis = await get_redis()
    cached = await redis.get(cache_key)
    if cached:
        return float(cached)

    try:
        async with httpx.AsyncClient() as client:
            response = await client.get(
                f"{BINANCE_API_URL}/ticker/price", params={"symbol": symbol}
            )
            response.raise_for_status()
            data = response.json()
            price = float(data["price"])
            await redis.setex(cache_key, 10, str(price))
            return price
    except Exception as exc:
        logger.error(f"Failed to fetch price for {symbol}: {exc}")
        return None


async def get_klines(
    symbol: str, interval: str, limit: int = 100, startTime: int | None = None, endTime: int | None = None
) -> list[dict[str, Any]]:
    """
    Fetch OHLCV candlestick data from Binance.
    Result maps to standard dict: openTime, open, high, low, close, volume, closeTime.
    """
    symbol = symbol.upper()
    try:
        async with httpx.AsyncClient() as client:
            params = {"symbol": symbol, "interval": interval, "limit": limit}
            if startTime:
                params["startTime"] = startTime
            if endTime:
                params["endTime"] = endTime

            response = await client.get(
                f"{BINANCE_API_URL}/klines",
                params=params,
            )
            response.raise_for_status()
            data = response.json()

            # Binance format:
            # [ [Open time, Open, High, Low, Close, Volume, Close time, ...], ... ]
            candles = []
            for k in data:
                candles.append(
                    {
                        "openTime": k[0],
                        "open": float(k[1]),
                        "high": float(k[2]),
                        "low": float(k[3]),
                        "close": float(k[4]),
                        "volume": float(k[5]),
                        "closeTime": k[6],
                    }
                )
            return candles
    except Exception as exc:
        logger.error(f"Failed to fetch klines for {symbol} ({interval}): {exc}")
        raise


async def get_market_overview() -> dict[str, Any]:
    """
    Fetch 24hr ticker data for top symbols to build a market overview.
    Caches the entire result for 60 seconds.
    """
    cache_key = "market_overview"
    redis = await get_redis()
    
    cached = await redis.get(cache_key)
    if cached:
        return json.loads(cached)

    # We only care about USDT pairs for the overview
    try:
        async with httpx.AsyncClient() as client:
            response = await client.get("https://fapi.binance.com/fapi/v1/ticker/24hr")
            response.raise_for_status()
            all_tickers = response.json()

        usdt_pairs = [t for t in all_tickers if t["symbol"].endswith("USDT")]
        
        # Sort by volume (quote volume) descending to get most active
        usdt_pairs.sort(key=lambda x: float(x.get("quoteVolume", 0)), reverse=True)
        top_active = usdt_pairs[:100]

        # Format into standard TickerData objects
        formatted = []
        for t in top_active:
            formatted.append({
                "symbol": t["symbol"],
                "price": float(t["lastPrice"]),
                "change24h": float(t["priceChangePercent"]),
                "volume24h": float(t["quoteVolume"]),
                "high24h": float(t["highPrice"]),
                "low24h": float(t["lowPrice"]),
            })

        await redis.setex(cache_key, 60, json.dumps(formatted))
        return formatted

    except Exception as exc:
        logger.error(f"Failed to fetch market overview: {exc}")
        raise

async def get_all_symbols() -> list[dict[str, Any]]:
    """
    Fetch all trading USDT pairs from Binance Futures exchange info.
    Caches the result for 1 hour.
    """
    cache_key = "all_binance_symbols"
    redis = await get_redis()
    
    cached = await redis.get(cache_key)
    if cached:
        return json.loads(cached)

    try:
        async with httpx.AsyncClient() as client:
            response = await client.get("https://fapi.binance.com/fapi/v1/exchangeInfo")
            response.raise_for_status()
            data = response.json()
            
        symbols = data.get("symbols", [])
        usdt_pairs = [
            {
                "symbol": s["symbol"],
                "baseAsset": s["baseAsset"],
                "quoteAsset": s["quoteAsset"]
            }
            for s in symbols if s["quoteAsset"] == "USDT" and s["status"] == "TRADING"
        ]
        
        await redis.setex(cache_key, 3600, json.dumps(usdt_pairs))
        return usdt_pairs
    except Exception as exc:
        logger.error(f"Failed to fetch exchange info: {exc}")
        return []
