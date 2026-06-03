from __future__ import annotations

from typing import Annotated, Any

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.database import get_db
from app.middleware.auth import get_current_user
from app.models.portfolio import Holding, Portfolio
from app.models.user import User
from app.schemas.portfolio import HoldingCreate, PortfolioResponse

router = APIRouter(prefix="/api/portfolio", tags=["Portfolio"])


async def get_or_create_portfolio(db: AsyncSession, user_id: int) -> Portfolio:
    stmt = select(Portfolio).options(selectinload(Portfolio.holdings)).where(Portfolio.user_id == user_id)
    portfolio = (await db.execute(stmt)).scalars().first()
    
    if not portfolio:
        portfolio = Portfolio(user_id=user_id)
        db.add(portfolio)
        await db.commit()
        await db.refresh(portfolio)
        
    return portfolio


@router.get("/", response_model=PortfolioResponse)
async def get_portfolio(
    db: Annotated[AsyncSession, Depends(get_db)],
    current_user: Annotated[User, Depends(get_current_user)],
) -> Any:
    return await get_or_create_portfolio(db, current_user.id)


@router.post("/add", response_model=PortfolioResponse)
async def add_holding(
    holding: HoldingCreate,
    db: Annotated[AsyncSession, Depends(get_db)],
    current_user: Annotated[User, Depends(get_current_user)],
) -> Any:
    portfolio = await get_or_create_portfolio(db, current_user.id)
    
    new_holding = Holding(
        portfolio_id=portfolio.id,
        symbol=holding.symbol.upper(),
        quantity=holding.quantity,
        buy_price=holding.buy_price,
        notes=holding.notes,
    )
    db.add(new_holding)
    await db.commit()
    
    # Refresh portfolio to get updated holdings list
    stmt = select(Portfolio).options(selectinload(Portfolio.holdings)).where(Portfolio.id == portfolio.id)
    portfolio = (await db.execute(stmt)).scalars().first()
    
    return portfolio


@router.delete("/{holding_id}", response_model=PortfolioResponse)
async def delete_holding(
    holding_id: int,
    db: Annotated[AsyncSession, Depends(get_db)],
    current_user: Annotated[User, Depends(get_current_user)],
) -> Any:
    portfolio = await get_or_create_portfolio(db, current_user.id)
    
    stmt = select(Holding).where(Holding.id == holding_id, Holding.portfolio_id == portfolio.id)
    holding = (await db.execute(stmt)).scalars().first()
    
    if not holding:
        raise HTTPException(status_code=404, detail="Holding not found")
        
    await db.delete(holding)
    await db.commit()
    
    # Refresh portfolio
    stmt = select(Portfolio).options(selectinload(Portfolio.holdings)).where(Portfolio.id == portfolio.id)
    portfolio = (await db.execute(stmt)).scalars().first()
    
    return portfolio
