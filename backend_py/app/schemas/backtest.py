from datetime import datetime
from typing import Any

from pydantic import BaseModel
from pydantic.alias_generators import to_camel


class BacktestRequest(BaseModel):
    symbol: str
    timeframe: str = "1h"
    limit: int = 1000
    analysisWindow: int = 300
    warmupCandles: int = 210
    resolutionCandles: int = 5
    sampleSize: int = 50
    leverage: int = 10
    tradeAmountUsd: float = 10.0
    atrTargetMultiplier: float = 3.0
    atrStopMultiplier: float = 1.5
    startDate: str | None = None
    endDate: str | None = None
    cooldownCandles: int = 1
    intrabarPolicy: str = "conservative"
    feesPerTradePct: float = 0.04
    slippagePct: float = 0.01
    backtestMlModel: str | None = None
    applyAccuracyGuardrails: bool = False
    preset: str | None = None
    validationMode: str | None = None
    includeMtfConfirmation: bool = False
    includeOrderFlowConfirmation: bool = False


class BacktestRunResponse(BaseModel):
    id: int
    user_id: int
    symbol: str
    market_type: str
    config: dict[str, Any]
    dataset: dict[str, Any]
    summary: dict[str, Any]
    recent_trades: list[dict[str, Any]] | None
    trades: list[dict[str, Any]] | None
    created_at: datetime

    class Config:
        from_attributes = True
        alias_generator = to_camel
        populate_by_name = True


class BacktestRunSingleResponse(BaseModel):
    success: bool = True
    data: BacktestRunResponse


class BacktestRunListResponse(BaseModel):
    success: bool = True
    data: list[BacktestRunResponse]
