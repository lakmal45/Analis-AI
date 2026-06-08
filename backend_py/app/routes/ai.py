from __future__ import annotations

from typing import Annotated, Any

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.middleware.auth import get_current_user
from app.models.user import User
from app.ml.model_store import list_models, load_latest_training
from app.ml.quality import build_model_quality_report
router = APIRouter(prefix="/api/ai", tags=["AI"])




@router.get("/ml/lifecycle")
async def get_ml_lifecycle(
    db: Annotated[AsyncSession, Depends(get_db)],
    current_user: Annotated[User, Depends(get_current_user)],
) -> Any:
    registry = list_models()
    return {
        "success": True,
        "data": {
            "isTraining": False,
            "lastTrainingRun": load_latest_training(),
            "activeModelVersion": registry.get("activeModelVersion"),
            "models": registry.get("models", [])
        }
    }

@router.get("/ml/health")
async def get_ml_health(
    db: Annotated[AsyncSession, Depends(get_db)],
    current_user: Annotated[User, Depends(get_current_user)],
) -> Any:
    report = build_model_quality_report()
    return {
        "success": True,
        "data": {
            "status": report["quality"]["status"],
            "activeModelVersion": report.get("activeModelVersion"),
            "modelCount": report.get("modelCount"),
            "reasons": report["quality"].get("reasons", []),
            "lastTraining": report["quality"].get("trainedAt"),
        }
    }
