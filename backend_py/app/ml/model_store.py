from __future__ import annotations

from datetime import datetime, timezone
from pathlib import Path
import json
import joblib

MODEL_DIR = Path(__file__).resolve().parent / "artifacts"
MODELS_DIR = MODEL_DIR / "models"
REGISTRY_PATH = MODEL_DIR / "registry.json"
LATEST_TRAINING_PATH = MODEL_DIR / "latest_training.json"


def ensure_model_dir() -> None:
    MODELS_DIR.mkdir(parents=True, exist_ok=True)


def _default_registry() -> dict:
    return {
        "activeModelVersion": None,
        "models": [],
    }


def load_registry() -> dict:
    ensure_model_dir()
    if not REGISTRY_PATH.exists():
        return _default_registry()

    return json.loads(REGISTRY_PATH.read_text(encoding="utf-8"))


def save_registry(registry: dict) -> None:
    ensure_model_dir()
    REGISTRY_PATH.write_text(json.dumps(registry, indent=2), encoding="utf-8")


def _model_paths(model_version: str) -> tuple[Path, Path]:
    bundle_path = MODELS_DIR / f"{model_version}.joblib"
    metadata_path = MODELS_DIR / f"{model_version}.meta.joblib"
    return bundle_path, metadata_path


def save_bundle(bundle: dict, metadata: dict, activate: bool = True) -> dict:
    ensure_model_dir()
    model_version = metadata["modelVersion"]
    bundle_path, metadata_path = _model_paths(model_version)
    joblib.dump(bundle, bundle_path)
    joblib.dump(metadata, metadata_path)

    registry = load_registry()
    existing = next(
        (model for model in registry["models"] if model["modelVersion"] == model_version),
        None,
    )
    model_record = {
        "modelVersion": model_version,
        "featureVersion": metadata.get("featureVersion"),
        "trainedAt": metadata.get("trainedAt"),
        "metrics": metadata.get("metrics", {}),
        "promotion": metadata.get("promotion", {}),
        "datasetPath": metadata.get("datasetPath"),
        "featureColumns": metadata.get("featureColumns"),
        "featureStats": metadata.get("featureStats"),
        "notes": metadata.get("notes"),
    }

    if existing:
        existing.update(model_record)
    else:
        registry["models"].append(model_record)

    registry["models"] = sorted(
        registry["models"],
        key=lambda item: item.get("trainedAt") or "",
        reverse=True,
    )

    if activate:
        registry["activeModelVersion"] = model_version

    save_registry(registry)
    save_latest_training(model_record)
    return model_record


def load_bundle(model_version: str | None = None) -> tuple[dict | None, dict | None]:
    registry = load_registry()
    target_version = model_version or registry.get("activeModelVersion")
    if not target_version:
      return None, None

    bundle_path, metadata_path = _model_paths(target_version)
    if not bundle_path.exists() or not metadata_path.exists():
        return None, None

    bundle = joblib.load(bundle_path)
    metadata = joblib.load(metadata_path)
    return bundle, metadata


def activate_model(model_version: str) -> dict:
    registry = load_registry()
    target = next(
        (model for model in registry["models"] if model["modelVersion"] == model_version),
        None,
    )
    if not target:
        raise FileNotFoundError(f"Unknown model version: {model_version}")

    bundle_path, metadata_path = _model_paths(model_version)
    if not bundle_path.exists() or not metadata_path.exists():
        raise FileNotFoundError(f"Artifact files are missing for model version: {model_version}")

    registry["activeModelVersion"] = model_version
    save_registry(registry)
    return target


def list_models() -> dict:
    return load_registry()


def save_latest_training(metadata: dict) -> None:
    ensure_model_dir()
    payload = {
        **metadata,
        "recordedAt": datetime.now(timezone.utc).isoformat(),
    }
    LATEST_TRAINING_PATH.write_text(json.dumps(payload, indent=2), encoding="utf-8")


def load_latest_training() -> dict | None:
    ensure_model_dir()
    if not LATEST_TRAINING_PATH.exists():
        return None

    return json.loads(LATEST_TRAINING_PATH.read_text(encoding="utf-8"))


def delete_model(model_version: str) -> bool:
    registry = load_registry()
    
    if registry.get("activeModelVersion") == model_version:
        raise ValueError("Cannot delete the currently active model.")
        
    initial_count = len(registry["models"])
    registry["models"] = [m for m in registry["models"] if m["modelVersion"] != model_version]
    
    if len(registry["models"]) == initial_count:
        return False
        
    bundle_path, metadata_path = _model_paths(model_version)
    if bundle_path.exists():
        bundle_path.unlink()
    if metadata_path.exists():
        metadata_path.unlink()
        
    save_registry(registry)
    return True
