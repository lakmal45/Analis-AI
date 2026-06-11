from __future__ import annotations

import logging
from pathlib import Path
from typing import Any
from datetime import datetime, timezone

import pandas as pd
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import AsyncSessionLocal
from app.models.signal import Signal
from app.models.backtest_run import BacktestRun
from app.ml.feature_registry import flatten_feature_snapshot
from app.ml.feature_schema import FEATURE_COLUMNS

logger = logging.getLogger(__name__)

# Base path for ML data
DATASET_DIR = Path(__file__).resolve().parent / "data"
DATASET_CSV_PATH = DATASET_DIR / "training-data.csv"
DATASET_JSON_PATH = DATASET_DIR / "training-data.json"

TRUSTED_RESOLUTION_SOURCES = {
    "take_profit_gap",
    "take_profit_intrabar",
    "stop_loss_gap",
    "stop_loss_intrabar",
    "time_expiry"
}

async def export_training_dataset(
    min_signals: int = 200,
    source: str = "combined",
    min_resolved_at: str | None = None,
    trusted_resolution_only: bool = True
) -> dict[str, Any]:
    """
    Extracts resolved signals and/or backtest trades from the database, flattens them, 
    and exports them to CSV and JSON formats for ML training.
    """
    try:
        source = source.lower()
        if source not in ("signals", "backtests", "combined"):
            raise ValueError(f"Invalid source '{source}'. Use signals, backtests, or combined.")

        rows = []
        min_date = datetime.fromisoformat(min_resolved_at.replace("Z", "+00:00")) if min_resolved_at else None

        async with AsyncSessionLocal() as session:
            # 1. Extract from live Signals
            if source in ("signals", "combined"):
                stmt = select(Signal).where(
                    Signal.status == "COMPLETED",
                    Signal.outcome.in_(["WIN", "LOSS"]),
                    Signal.features != None
                )
                
                if trusted_resolution_only:
                    stmt = stmt.where(Signal.resolution_source.in_(TRUSTED_RESOLUTION_SOURCES))
                if min_date:
                    stmt = stmt.where(Signal.resolved_at >= min_date)
                    
                result = await session.execute(stmt)
                signals = result.scalars().all()
                
                for sig in signals:
                    if not sig.features:
                        continue
                    
                    row = {
                        "signalId": f"sig_{sig.id}",
                        "symbol": sig.symbol,
                        "timeframe": sig.timeframe,
                        "type": sig.signal_type,
                        "outcome": sig.outcome,
                        "createdAt": sig.created_at.isoformat() if sig.created_at else None,
                        "resolvedAt": sig.resolved_at.isoformat() if sig.resolved_at else None,
                        "label": 1 if sig.outcome == "WIN" else 0,
                        "source": "live_signal"
                    }
                    flattened_features = flatten_feature_snapshot(sig.features)
                    for feature in FEATURE_COLUMNS:
                        if feature == "type" and "type" in row:
                            continue
                        row[feature] = flattened_features.get(feature, 0)
                    rows.append(row)

            # 2. Extract from Backtest Runs
            if source in ("backtests", "combined"):
                stmt = select(BacktestRun).where(BacktestRun.trades != None)
                result = await session.execute(stmt)
                backtests = result.scalars().all()
                
                for bt in backtests:
                    if not bt.trades:
                        continue
                        
                    for trade in bt.trades:
                        outcome = trade.get("outcome")
                        features = trade.get("features")
                        
                        if outcome not in ("WIN", "LOSS") or not features:
                            continue
                            
                        resolved_at_str = trade.get("resolvedAt")
                        if min_date and resolved_at_str:
                            # Handle potential timezone naive vs aware strings gracefully if needed, 
                            # but backtest service outputs isoformat with tzinfo
                            try:
                                trade_date = datetime.fromisoformat(resolved_at_str.replace("Z", "+00:00"))
                                if trade_date.tzinfo is None:
                                    trade_date = trade_date.replace(tzinfo=timezone.utc)
                                if min_date.tzinfo is None:
                                    min_date = min_date.replace(tzinfo=timezone.utc)
                                if trade_date < min_date:
                                    continue
                            except ValueError:
                                pass
                                
                        exit_reason = trade.get("simulation", {}).get("exitReason")
                        if trusted_resolution_only and exit_reason not in TRUSTED_RESOLUTION_SOURCES:
                            continue
                            
                        row = {
                            "signalId": f"bt_{bt.id}_{trade.get('createdAt')}",
                            "symbol": trade.get("symbol"),
                            "timeframe": trade.get("timeframe"),
                            "type": trade.get("type"),
                            "outcome": outcome,
                            "createdAt": trade.get("createdAt"),
                            "resolvedAt": resolved_at_str,
                            "label": 1 if outcome == "WIN" else 0,
                            "source": "backtest"
                        }
                        flattened_features = flatten_feature_snapshot(features)
                        for feature in FEATURE_COLUMNS:
                            if feature == "type" and "type" in row:
                                continue
                            row[feature] = flattened_features.get(feature, 0)
                        rows.append(row)

        if len(rows) < min_signals:
            return {
                "success": False,
                "message": f"Not enough resolved signals. Found {len(rows)}, need {min_signals}.",
                "count": len(rows)
            }

        df = pd.DataFrame(rows)

        # Ensure directory exists
        DATASET_DIR.mkdir(parents=True, exist_ok=True)

        # Save to CSV
        df.to_csv(DATASET_CSV_PATH, index=False)
        
        # Save to JSON
        df.to_json(DATASET_JSON_PATH, orient="records", indent=2)

        return {
            "success": True,
            "message": "Dataset exported successfully",
            "count": len(rows),
            "csvPath": str(DATASET_CSV_PATH),
            "jsonPath": str(DATASET_JSON_PATH)
        }

    except Exception as exc:
        logger.error(f"Failed to export training dataset: {exc}", exc_info=True)
        return {
            "success": False,
            "message": str(exc)
        }
