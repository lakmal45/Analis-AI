from __future__ import annotations

from typing import Annotated, Any

from fastapi import APIRouter, Depends, HTTPException, BackgroundTasks
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.middleware.auth import get_current_user
from app.models.user import User

from app.ml.dataset_service import export_training_dataset
from app.ml.training import train_model
from app.ml.model_store import list_models, activate_model, delete_model, save_bundle
from app.tasks.ml_retraining import retrain_ml_model

router = APIRouter(prefix="/api/ml", tags=["ML"])

class ExtractRequest(BaseModel):
    min_signals: int = 60
    source: str = "combined"

class TrainRequest(BaseModel):
    dataset_path: str = "app/ml/data/training-data.csv"
    notes: str = ""

class ActivateRequest(BaseModel):
    version: str


@router.post("/extract")
async def extract_data(
    request: ExtractRequest,
    db: Annotated[AsyncSession, Depends(get_db)],
    current_user: Annotated[User, Depends(get_current_user)],
) -> Any:
    # Requires an async call
    result = await export_training_dataset(min_signals=request.min_signals, source=request.source)
    if not result.get("success"):
        raise HTTPException(status_code=400, detail=result.get("message", "Extraction failed"))
    return result


@router.post("/train")
async def run_training(
    request: TrainRequest,
    db: Annotated[AsyncSession, Depends(get_db)],
    current_user: Annotated[User, Depends(get_current_user)],
) -> Any:
    try:
        bundle, metadata = train_model(dataset_path=request.dataset_path, notes=request.notes)
        eligible = metadata.get("promotion", {}).get("eligible", False)
        record = save_bundle(bundle, metadata, activate=eligible)
        return {
            "success": True,
            "data": record,
            "message": f"Model trained successfully. Promoted to active: {eligible}"
        }
    except Exception as exc:
        raise HTTPException(status_code=400, detail=f"Training failed: {str(exc)}")


@router.post("/retrain")
async def run_retrain_pipeline(
    background_tasks: BackgroundTasks,
    db: Annotated[AsyncSession, Depends(get_db)],
    current_user: Annotated[User, Depends(get_current_user)],
) -> Any:
    # Add to background tasks so it doesn't block the request
    background_tasks.add_task(retrain_ml_model)
    return {"success": True, "message": "Automated retraining pipeline started in background."}


@router.get("/models")
async def get_models(
    db: Annotated[AsyncSession, Depends(get_db)],
    current_user: Annotated[User, Depends(get_current_user)],
) -> Any:
    registry = list_models()
    return {"success": True, "data": registry}


@router.post("/models/activate")
async def activate_model_version(
    request: ActivateRequest,
    db: Annotated[AsyncSession, Depends(get_db)],
    current_user: Annotated[User, Depends(get_current_user)],
) -> Any:
    try:
        record = activate_model(request.version)
        return {"success": True, "data": record, "message": f"Activated {request.version}"}
    except Exception as exc:
        raise HTTPException(status_code=400, detail=f"Activation failed: {str(exc)}")


@router.delete("/models/{version}")
async def delete_model_version(
    version: str,
    db: Annotated[AsyncSession, Depends(get_db)],
    current_user: Annotated[User, Depends(get_current_user)],
) -> Any:
    try:
        success = delete_model(version)
        if not success:
            raise HTTPException(status_code=404, detail="Model not found")
        return {"success": True, "message": f"Deleted {version}"}
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Deletion failed: {str(exc)}")
