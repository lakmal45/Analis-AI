import json
import logging
from typing import Annotated, Any

import httpx
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.cache import get_redis
from app.database import get_db
from app.middleware.auth import get_current_user
from app.models.user import User
from app.models.watchlist import Watchlist, WatchlistAsset
from app.schemas.watchlist import WatchlistAssetCreate

logger = logging.getLogger(__name__)

BINANCE_API_URL = "https://api.binance.com/api/v3"

router = APIRouter(prefix="/api/watchlist", tags=["Watchlist"])


async def get_or_create_watchlist(db: AsyncSession, user_id: int) -> Watchlist:
    stmt = select(Watchlist).options(selectinload(Watchlist.assets)).where(Watchlist.user_id == user_id)
    watchlist = (await db.execute(stmt)).scalars().first()
    
    if not watchlist:
        watchlist = Watchlist(user_id=user_id)
        db.add(watchlist)
        await db.commit()
        await db.refresh(watchlist)
        
    return watchlist


async def fetch_binance_tickers(symbols: list[str]) -> dict[str, dict]:
    """Fetch 24hr ticker data from Binance for the given symbols."""
    if not symbols:
        return {}
    
    symbols_sorted = sorted([s.upper() for s in symbols])
    cache_key = f"watchlist_tickers:{'_'.join(symbols_sorted)}"
    
    redis = await get_redis()
    cached = await redis.get(cache_key)
    if cached:
        return json.loads(cached)
    
    ticker_map = {}
    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            # Use the bulk ticker endpoint with specific symbols
            params = {"symbols": str(symbols).replace("'", '"')}
            response = await client.get(
                f"{BINANCE_API_URL}/ticker/24hr", params=params
            )
            response.raise_for_status()
            tickers = response.json()
            
            for t in tickers:
                ticker_map[t["symbol"]] = {
                    "price": float(t["lastPrice"]),
                    "change24h": float(t["priceChangePercent"]),
                    "volume24h": float(t["quoteVolume"]),
                    "high24h": float(t["highPrice"]),
                    "low24h": float(t["lowPrice"]),
                }
            
            # Cache the result for 10 seconds
            await redis.setex(cache_key, 10, json.dumps(ticker_map))
    except Exception as exc:
        logger.error(f"Failed to fetch Binance tickers: {exc}")
    
    return ticker_map


def enrich_watchlist_response(watchlist: Watchlist, ticker_map: dict[str, dict]) -> dict:
    """Build a response dict that includes live market data for each asset."""
    enriched_assets = []
    for asset in watchlist.assets:
        asset_data = {
            "id": asset.id,
            "watchlist_id": asset.watchlist_id,
            "symbol": asset.symbol,
            "added_at": asset.added_at.isoformat(),
        }
        # Merge in live ticker data if available
        ticker = ticker_map.get(asset.symbol, {})
        asset_data.update(ticker)
        enriched_assets.append(asset_data)
    
    return {
        "id": watchlist.id,
        "user_id": watchlist.user_id,
        "assets": enriched_assets,
        "created_at": watchlist.created_at.isoformat(),
    }


@router.get("")
async def get_watchlist(
    db: Annotated[AsyncSession, Depends(get_db)],
    current_user: Annotated[User, Depends(get_current_user)],
) -> Any:
    watchlist = await get_or_create_watchlist(db, current_user.id)
    symbols = [asset.symbol for asset in watchlist.assets]
    ticker_map = await fetch_binance_tickers(symbols)
    return enrich_watchlist_response(watchlist, ticker_map)


@router.post("/add")
async def add_asset(
    asset: WatchlistAssetCreate,
    db: Annotated[AsyncSession, Depends(get_db)],
    current_user: Annotated[User, Depends(get_current_user)],
) -> Any:
    watchlist = await get_or_create_watchlist(db, current_user.id)
    
    # Check if already in watchlist
    symbol = asset.symbol.upper()
    existing = next((a for a in watchlist.assets if a.symbol == symbol), None)
    if existing:
        symbols = [a.symbol for a in watchlist.assets]
        ticker_map = await fetch_binance_tickers(symbols)
        return enrich_watchlist_response(watchlist, ticker_map)
        
    new_asset = WatchlistAsset(
        watchlist_id=watchlist.id,
        symbol=symbol
    )
    db.add(new_asset)
    await db.commit()
    
    # Refresh watchlist
    stmt = select(Watchlist).options(selectinload(Watchlist.assets)).where(Watchlist.id == watchlist.id)
    watchlist = (await db.execute(stmt)).scalars().first()
    
    symbols = [a.symbol for a in watchlist.assets]
    ticker_map = await fetch_binance_tickers(symbols)
    return enrich_watchlist_response(watchlist, ticker_map)


@router.delete("/remove/{symbol}")
async def remove_asset(
    symbol: str,
    db: Annotated[AsyncSession, Depends(get_db)],
    current_user: Annotated[User, Depends(get_current_user)],
) -> Any:
    watchlist = await get_or_create_watchlist(db, current_user.id)
    symbol = symbol.upper()
    
    stmt = select(WatchlistAsset).where(WatchlistAsset.symbol == symbol, WatchlistAsset.watchlist_id == watchlist.id)
    asset = (await db.execute(stmt)).scalars().first()
    
    if not asset:
        raise HTTPException(status_code=404, detail="Asset not found in watchlist")
        
    await db.delete(asset)
    await db.commit()
    
    # Refresh watchlist
    stmt = select(Watchlist).options(selectinload(Watchlist.assets)).where(Watchlist.id == watchlist.id)
    watchlist = (await db.execute(stmt)).scalars().first()
    
    symbols = [a.symbol for a in watchlist.assets]
    ticker_map = await fetch_binance_tickers(symbols)
    return enrich_watchlist_response(watchlist, ticker_map)


@router.delete("/{symbol}")
async def delete_asset(
    symbol: str,
    db: Annotated[AsyncSession, Depends(get_db)],
    current_user: Annotated[User, Depends(get_current_user)],
) -> Any:
    """Alias for remove_asset — keeps backward compatibility."""
    return await remove_asset(symbol, db, current_user)
