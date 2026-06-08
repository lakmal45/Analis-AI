from __future__ import annotations

from typing import Annotated, Any

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select, delete
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.middleware.auth import get_current_user
from app.models.backtest_run import BacktestRun
from app.models.user import User
from app.schemas.backtest import BacktestRequest, BacktestRunResponse, BacktestRunSingleResponse, BacktestRunListResponse
from app.services.backtest_service import run_backtest

router = APIRouter(prefix="/api/backtest", tags=["Backtest"])


@router.post("", response_model=BacktestRunSingleResponse)
async def create_backtest(
    request: BacktestRequest,
    db: Annotated[AsyncSession, Depends(get_db)],
    current_user: Annotated[User, Depends(get_current_user)],
) -> Any:
    try:
        # Pass request dict to backtest service
        result = await run_backtest(request.model_dump(exclude_none=True))
        
        # Save to DB
        new_run = BacktestRun(
            user_id=current_user.id,
            symbol=result["symbol"],
            market_type=result["market_type"],
            config=result["config"],
            dataset=result["dataset"],
            summary=result["summary"],
            recent_trades=result["recent_trades"],
            trades=result["trades"]
        )
        db.add(new_run)
        await db.commit()
        await db.refresh(new_run)
        return {"success": True, "data": new_run}
    except Exception as exc:
        raise HTTPException(status_code=400, detail=str(exc))


@router.get("/history", response_model=BacktestRunListResponse)
async def get_backtest_history(
    db: Annotated[AsyncSession, Depends(get_db)],
    current_user: Annotated[User, Depends(get_current_user)],
) -> Any:
    stmt = select(BacktestRun).where(BacktestRun.user_id == current_user.id).order_by(BacktestRun.created_at.desc())
    runs = (await db.execute(stmt)).scalars().all()
    return {"success": True, "data": runs}


@router.get("/{run_id}", response_model=BacktestRunSingleResponse)
async def get_backtest_run(
    run_id: int,
    db: Annotated[AsyncSession, Depends(get_db)],
    current_user: Annotated[User, Depends(get_current_user)],
) -> Any:
    stmt = select(BacktestRun).where(BacktestRun.id == run_id, BacktestRun.user_id == current_user.id)
    run = (await db.execute(stmt)).scalars().first()
    if not run:
        raise HTTPException(status_code=404, detail="Backtest run not found")
    return {"success": True, "data": run}


@router.delete("/history/all")
async def delete_all_backtest_history(
    db: Annotated[AsyncSession, Depends(get_db)],
    current_user: Annotated[User, Depends(get_current_user)],
) -> Any:
    stmt = delete(BacktestRun).where(BacktestRun.user_id == current_user.id)
    await db.execute(stmt)
    await db.commit()
    return {"success": True, "message": "All backtest runs deleted successfully"}


@router.delete("/history/filter")
async def delete_filtered_backtest_history(
    db: Annotated[AsyncSession, Depends(get_db)],
    current_user: Annotated[User, Depends(get_current_user)],
    symbol: str | None = None,
    timeframe: str | None = None,
) -> Any:
    if not symbol and not timeframe:
        raise HTTPException(status_code=400, detail="Must provide at least symbol or timeframe")
        
    stmt = delete(BacktestRun).where(BacktestRun.user_id == current_user.id)
    
    if symbol:
        stmt = stmt.where(BacktestRun.symbol == symbol)
    if timeframe:
        # JSONB access in SQLAlchemy: config->>'timeframe'
        stmt = stmt.where(BacktestRun.config["timeframe"].astext == timeframe)
        
    result = await db.execute(stmt)
    await db.commit()
    
    return {"success": True, "message": f"Deleted matching backtest runs"}


@router.delete("/history/{run_id}")
async def delete_backtest_history(
    run_id: int,
    db: Annotated[AsyncSession, Depends(get_db)],
    current_user: Annotated[User, Depends(get_current_user)],
) -> Any:
    stmt = select(BacktestRun).where(BacktestRun.id == run_id, BacktestRun.user_id == current_user.id)
    run = (await db.execute(stmt)).scalars().first()
    if not run:
        raise HTTPException(status_code=404, detail="Backtest run not found")
        
    await db.delete(run)
    await db.commit()
    return {"success": True, "message": "Backtest run deleted successfully"}

