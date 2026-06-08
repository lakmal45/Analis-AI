from __future__ import annotations

from typing import Annotated, Any

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.middleware.auth import get_current_user
from app.models.user import User
from app.schemas.market import MarketOverviewResponse
from app.services.market_service import get_klines, get_market_overview, get_price, get_all_symbols

router = APIRouter(prefix="/api/market", tags=["Market"])


@router.get("/price/{symbol}")
async def fetch_price(
    symbol: str,
    db: Annotated[AsyncSession, Depends(get_db)],
    current_user: Annotated[User, Depends(get_current_user)],
) -> Any:
    price = await get_price(symbol)
    if price is None:
        raise HTTPException(status_code=404, detail="Price not found or fetch failed")
    return {"symbol": symbol.upper(), "price": price}


@router.get("/klines")
async def fetch_klines(
    symbol: str,
    interval: str = "1h",
    limit: int = 100,
    db: Annotated[AsyncSession, Depends(get_db)] = None,
    current_user: Annotated[User, Depends(get_current_user)] = None,
) -> Any:
    try:
        candles = await get_klines(symbol, interval, limit)
        return candles
    except Exception as exc:
        raise HTTPException(status_code=400, detail=str(exc))


@router.get("/overview", response_model=MarketOverviewResponse)
async def fetch_overview(
    db: Annotated[AsyncSession, Depends(get_db)],
    current_user: Annotated[User, Depends(get_current_user)],
) -> Any:
    try:
        overview = await get_market_overview()
        return {"success": True, "data": overview}
    except Exception as exc:
        raise HTTPException(status_code=400, detail=str(exc))

@router.get("/symbols")
async def get_symbols(
    db: Annotated[AsyncSession, Depends(get_db)],
    current_user: Annotated[User, Depends(get_current_user)],
) -> Any:
    try:
        symbols = await get_all_symbols()
        return symbols
    except Exception as exc:
        raise HTTPException(status_code=400, detail=str(exc))
