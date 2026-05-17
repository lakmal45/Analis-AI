from __future__ import annotations

from pathlib import Path
from typing import Any

import pandas as pd
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel, Field

from feature_builder import build_feature_snapshot
from feature_schema import FEATURE_COLUMNS
from model_store import (
    activate_model,
    load_bundle,
    load_latest_training,
    list_models,
    save_bundle,
)
from training import train_model

app = FastAPI(title="AnalisAI ML Service", version="0.2.0")


class PredictRequest(BaseModel):
    features: dict[str, float | int | bool | str | None]
    metadata: dict[str, Any] = Field(default_factory=dict)


class TrainRequest(BaseModel):
    datasetPath: str = "data/training-data.csv"
    activateOnTrain: bool = True
    notes: str | None = None


class FeatureRequest(BaseModel):
    candles: list[dict[str, Any]]
    options: dict[str, Any] = Field(default_factory=dict)


def _load_active_model() -> tuple[dict, dict]:
    bundle, metadata = load_bundle()
    if bundle is None or metadata is None:
        raise HTTPException(status_code=503, detail="Model is not trained yet")
    return bundle, metadata


def _prepare_feature_frame(features: dict[str, Any], feature_columns: list[str]) -> pd.DataFrame:
    row = {column: features.get(column, 0) for column in feature_columns}
    return pd.DataFrame([row], columns=feature_columns)


@app.get("/health")
def health() -> dict[str, Any]:
    bundle, metadata = load_bundle()
    registry = list_models()
    return {
        "ok": True,
        "modelLoaded": bundle is not None,
        "modelVersion": metadata.get("modelVersion") if metadata else None,
        "featureVersion": metadata.get("featureVersion") if metadata else None,
        "supportedFeatureCount": len(FEATURE_COLUMNS),
        "activeModelVersion": registry.get("activeModelVersion"),
        "registeredModels": len(registry.get("models", [])),
    }


@app.get("/models")
def models() -> dict[str, Any]:
    registry = list_models()
    return {
        "activeModelVersion": registry.get("activeModelVersion"),
        "models": registry.get("models", []),
    }


@app.get("/training/latest")
def latest_training() -> dict[str, Any]:
    latest = load_latest_training()
    return {
        "latestTraining": latest,
    }


@app.post("/train")
def train(request: TrainRequest) -> dict[str, Any]:
    dataset_path = Path(__file__).resolve().parent / request.datasetPath
    bundle, metadata = train_model(dataset_path, notes=request.notes)
    promotion = metadata.get("promotion", {})
    activation_requested = request.activateOnTrain
    should_activate = activation_requested and promotion.get("eligible", False)
    saved_metadata = save_bundle(bundle, metadata, activate=should_activate)
    return {
        "status": "trained",
        "datasetPath": str(dataset_path),
        "activationRequested": activation_requested,
        "activated": should_activate,
        "activationBlockedReasons": [] if should_activate else promotion.get("reasons", []),
        **saved_metadata,
    }


@app.post("/features")
def features(request: FeatureRequest) -> dict[str, Any]:
    try:
        snapshot = build_feature_snapshot(request.candles, request.options)
    except RuntimeError as error:
        raise HTTPException(status_code=503, detail=str(error)) from error
    except ValueError as error:
        raise HTTPException(status_code=400, detail=str(error)) from error

    return {
        "featureSnapshot": snapshot,
        "featureVersion": snapshot.get("featureVersion"),
        "featureSource": snapshot.get("source"),
    }


@app.post("/models/{model_version}/activate")
def activate(model_version: str) -> dict[str, Any]:
    try:
        activated = activate_model(model_version)
    except FileNotFoundError as error:
        raise HTTPException(status_code=404, detail=str(error)) from error

    return {
        "status": "activated",
        "activeModelVersion": model_version,
        "model": activated,
    }


@app.post("/predict")
def predict(request: PredictRequest) -> dict[str, Any]:
    requested_model_version = request.metadata.get("modelVersion")
    if requested_model_version:
        bundle, metadata = load_bundle(requested_model_version)
        if bundle is None or metadata is None:
            raise HTTPException(
                status_code=404,
                detail=f"Unknown model version: {requested_model_version}",
            )
    else:
        bundle, metadata = _load_active_model()
    feature_columns = metadata.get("featureColumns") or FEATURE_COLUMNS
    feature_frame = _prepare_feature_frame(request.features, feature_columns)
    transformed = bundle["imputer"].transform(feature_frame)
    raw_probability = float(bundle["model"].predict_proba(transformed)[0][1])
    calibrator = bundle.get("calibrator")
    if calibrator is not None:
        probability = float(
            calibrator.predict_proba([[raw_probability]])[0][1]
        )
    else:
        probability = raw_probability

    return {
        "probability": probability,
        "rawProbability": raw_probability,
        "modelVersion": metadata.get("modelVersion"),
        "featureVersion": metadata.get("featureVersion"),
        "metrics": metadata.get("metrics", {}),
        "promotion": metadata.get("promotion", {}),
    }
