from __future__ import annotations

from typing import Annotated, Any

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.middleware.auth import get_current_user
from app.models.signal import Signal
from app.models.user import User
from app.schemas.signal import SignalGenerateRequest, SignalResolveRequest, SignalResponse, SignalSingleResponse, SignalListResponse
from app.services.signal_service import generate_signal

router = APIRouter(prefix="/api/signals", tags=["Signals"])


@router.post("/generate", response_model=SignalSingleResponse)
async def create_signal(
    request: SignalGenerateRequest,
    db: Annotated[AsyncSession, Depends(get_db)],
    current_user: Annotated[User, Depends(get_current_user)],
) -> Any:
    try:
        signal_data = await generate_signal(
            symbol=request.symbol,
            timeframe=request.timeframe,
            leverage=request.leverage,
        )
        # Check for active signal duplicate
        stmt = select(Signal).where(
            Signal.user_id == current_user.id,
            Signal.symbol == request.symbol,
            Signal.timeframe == request.timeframe,
            Signal.status == "ACTIVE"
        )
        existing = (await db.execute(stmt)).scalars().first()
        
        signal_data["was_duplicate"] = bool(existing)
        if existing:
            # Complete the existing one as CANCELLED before opening new
            existing.status = "CANCELLED"
            existing.outcome = "CANCELLED"
            existing.resolution_notes = "Superseded by new signal"
            
        new_signal = Signal(
            user_id=current_user.id,
            symbol=signal_data["symbol"],
            timeframe=signal_data["timeframe"],
            signal_type=signal_data["signal_type"],
            market_type=signal_data["market_type"],
            leverage=signal_data["leverage"],
            confidence=signal_data["confidence"],
            reasoning=signal_data["reasoning"],
            price_entry=signal_data["price_entry"],
            price_current=signal_data["price_current"],
            price_target=signal_data["price_target"],
            price_stop_loss=signal_data["price_stop_loss"],
            features=signal_data["features"],
            ml=signal_data["ml"],
            scoring=signal_data["scoring"],
            was_duplicate=signal_data["was_duplicate"],
        )
        db.add(new_signal)
        await db.commit()
        await db.refresh(new_signal)
        return {"success": True, "data": new_signal}
    except Exception as exc:
        raise HTTPException(status_code=400, detail=str(exc))


@router.get("", response_model=SignalListResponse)
async def get_signals(
    db: Annotated[AsyncSession, Depends(get_db)],
    current_user: Annotated[User, Depends(get_current_user)],
    page: int = Query(1, ge=1),
    limit: int = Query(20, ge=1, le=100),
    status_filter: str | None = Query(None, alias="status"),
) -> Any:
    offset = (page - 1) * limit
    
    stmt = select(Signal).where(Signal.user_id == current_user.id).order_by(Signal.created_at.desc())
    if status_filter:
        stmt = stmt.where(Signal.status == status_filter)
        
    result = await db.execute(stmt.offset(offset).limit(limit))
    signals = result.scalars().all()
    
    return {
        "success": True,
        "data": signals,
        "page": page,
        "limit": limit,
        # A real implementation would include a count query here
        "total": len(signals) if len(signals) < limit else offset + limit + 1
    }


@router.get("/stats/summary")
async def get_stats_summary(
    db: Annotated[AsyncSession, Depends(get_db)],
    current_user: Annotated[User, Depends(get_current_user)],
    symbol: str | None = None,
    timeframe: str | None = None,
) -> Any:
    stmt = select(Signal).where(Signal.user_id == current_user.id, Signal.status == "COMPLETED")
    if symbol:
        stmt = stmt.where(Signal.symbol == symbol)
    if timeframe:
        stmt = stmt.where(Signal.timeframe == timeframe)
        
    result = await db.execute(stmt)
    signals = result.scalars().all()
    
    total = len(signals)
    wins = sum(1 for s in signals if s.outcome == "WIN")
    losses = sum(1 for s in signals if s.outcome == "LOSS")
    win_rate = (wins / total * 100) if total > 0 else 0
    
    return {
        "success": True,
        "data": {
            "totalCompleted": total,
            "wins": wins,
            "losses": losses,
            "winRate": win_rate,
        }
    }


@router.get("/stats/ml-summary")
async def get_stats_ml_summary(
    db: Annotated[AsyncSession, Depends(get_db)],
    current_user: Annotated[User, Depends(get_current_user)],
) -> Any:
    return {
        "success": True,
        "data": {
            "totalSignals": 0,
            "winRate": 0,
            "modelsActive": 0,
            "averageConfidence": 0,
            "mlCoverageRate": 0,
            "avgMlProbabilityPct": 0
        }
    }


@router.get("/{signal_id}", response_model=SignalSingleResponse)
async def get_signal(
    signal_id: int,
    db: Annotated[AsyncSession, Depends(get_db)],
    current_user: Annotated[User, Depends(get_current_user)],
) -> Any:
    stmt = select(Signal).where(Signal.id == signal_id, Signal.user_id == current_user.id)
    signal = (await db.execute(stmt)).scalars().first()
    if not signal:
        raise HTTPException(status_code=404, detail="Signal not found")
    return {"success": True, "data": signal}


@router.put("/{signal_id}/status", response_model=SignalSingleResponse)
async def resolve_signal(
    signal_id: int,
    request: SignalResolveRequest,
    db: Annotated[AsyncSession, Depends(get_db)],
    current_user: Annotated[User, Depends(get_current_user)],
) -> Any:
    stmt = select(Signal).where(Signal.id == signal_id, Signal.user_id == current_user.id)
    signal = (await db.execute(stmt)).scalars().first()
    if not signal:
        raise HTTPException(status_code=404, detail="Signal not found")
        
    if signal.status != "ACTIVE":
        raise HTTPException(status_code=400, detail="Signal is already resolved")

    signal.status = request.status
    if request.resolutionPrice is not None:
        signal.price_current = request.resolutionPrice
    
    if request.status == "CANCELLED":
        signal.outcome = "CANCELLED"
    else:
        # Simplified outcome calculation
        if signal.signal_type == "BUY" and request.resolutionPrice and request.resolutionPrice > signal.price_entry:
            signal.outcome = "WIN"
        elif signal.signal_type == "SELL" and request.resolutionPrice and request.resolutionPrice < signal.price_entry:
            signal.outcome = "WIN"
        else:
            signal.outcome = "LOSS"
            
    signal.resolution_source = request.resolutionSource
    signal.resolution_notes = request.resolutionNotes
    
    await db.commit()
    await db.refresh(signal)
    return {"success": True, "data": signal}


@router.delete("/{signal_id}")
async def delete_signal(
    signal_id: int,
    db: Annotated[AsyncSession, Depends(get_db)],
    current_user: Annotated[User, Depends(get_current_user)],
) -> Any:
    stmt = select(Signal).where(Signal.id == signal_id, Signal.user_id == current_user.id)
    signal = (await db.execute(stmt)).scalars().first()
    if not signal:
        raise HTTPException(status_code=404, detail="Signal not found")
        
    await db.delete(signal)
    await db.commit()
    return {"message": "Signal deleted successfully"}
