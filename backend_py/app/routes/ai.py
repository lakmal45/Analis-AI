from __future__ import annotations

from typing import Annotated, Any

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.middleware.auth import get_current_user
from app.models.user import User
router = APIRouter(prefix="/api/ai", tags=["AI"])




@router.get("/ml/lifecycle")
async def get_ml_lifecycle(
    db: Annotated[AsyncSession, Depends(get_db)],
    current_user: Annotated[User, Depends(get_current_user)],
) -> Any:
    return {
        "success": True,
        "data": {
            "isTraining": False,
            "lastTrainingRun": None,
            "models": []
        }
    }

@router.get("/ml/health")
async def get_ml_health(
    db: Annotated[AsyncSession, Depends(get_db)],
    current_user: Annotated[User, Depends(get_current_user)],
) -> Any:
    return {
        "success": True,
        "data": {
            "status": "healthy",
            "uptime": "100%",
            "lastTraining": None
        }
    }
