from datetime import datetime
from typing import Any

from pydantic import BaseModel


class SignalGenerateRequest(BaseModel):
    symbol: str
    timeframe: str = "1h"
    leverage: int | None = None
    preset: str | None = None
    validationMode: str | None = None
    shadowMode: bool = False


class SignalResolveRequest(BaseModel):
    status: str
    resolutionPrice: float | None = None
    resolvedAt: datetime | None = None
    resolutionSource: str | None = None
    resolutionNotes: str | None = None
    exitReason: str | None = None
    feesPerTradePct: float | None = None


class SignalResponse(BaseModel):
    id: int
    user_id: int | None
    symbol: str
    timeframe: str
    signal_type: str
    status: str
    outcome: str
    market_type: str
    leverage: int
    confidence: float
    reasoning: str
    price_entry: float | None
    price_current: float | None
    price_target: float | None
    price_stop_loss: float | None
    features: dict[str, Any] | None
    ml: dict[str, Any] | None
    performance: dict[str, Any] | None
    scoring: dict[str, Any] | None
    expected_direction: str | None
    actual_direction: str | None
    resolution_source: str | None
    resolution_notes: str | None
    was_duplicate: bool
    created_at: datetime
    resolved_at: datetime | None
    expires_at: datetime | None

    class Config:
        from_attributes = True


class SignalSingleResponse(BaseModel):
    success: bool = True
    data: SignalResponse


class SignalListResponse(BaseModel):
    success: bool = True
    data: list[SignalResponse]
    page: int
    limit: int
    total: int
