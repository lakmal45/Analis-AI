from __future__ import annotations

import logging
from typing import Any

from app.ml.dataset_service import export_training_dataset
from app.ml.training import train_model
from app.ml.model_store import save_bundle

logger = logging.getLogger(__name__)


async def retrain_ml_model() -> None:
    """
    Background job to export a fresh dataset and retrain the ML model.
    """
    logger.info("Starting ML retraining job...")
    
    try:
        # 1. Export dataset
        export_result = await export_training_dataset(min_signals=60)
        if not export_result["success"]:
            logger.warning(f"Skipping ML retraining: {export_result['message']}")
            return
            
        dataset_path = export_result["path"]
        logger.info(f"Dataset exported with {export_result['count']} samples to {dataset_path}")
        
        # 2. Train model
        logger.info("Training XGBoost + Lorentzian KNN ensemble...")
        bundle, metadata = train_model(
            dataset_path=dataset_path,
            notes="Auto-retraining job"
        )
        
        # 3. Check promotion eligibility and save
        eligible = metadata.get("promotion", {}).get("eligible", False)
        
        # We save it regardless, but mark it active only if eligible
        # (save_bundle handles activation if activate=True)
        record = save_bundle(bundle, metadata, activate=eligible)
        
        if eligible:
            logger.info(f"ML model {record['modelVersion']} promoted to ACTIVE!")
        else:
            reasons = metadata.get("promotion", {}).get("reasons", [])
            logger.info(f"ML model {record['modelVersion']} trained but not promoted. Reasons: {reasons}")
            
    except Exception as exc:
        logger.error(f"ML retraining job failed: {exc}", exc_info=True)
