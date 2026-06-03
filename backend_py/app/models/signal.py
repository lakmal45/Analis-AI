from __future__ import annotations

from datetime import datetime
from typing import TYPE_CHECKING

from sqlalchemy import Boolean, DateTime, Float, ForeignKey, Index, Integer, String
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column, relationship
from sqlalchemy.sql import func

from app.database import Base

if TYPE_CHECKING:
    from app.models.user import User


class Signal(Base):
    __tablename__ = "signals"

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int | None] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), index=True
    )

    symbol: Mapped[str] = mapped_column(String(20), index=True)
    timeframe: Mapped[str] = mapped_column(String(5))
    signal_type: Mapped[str] = mapped_column(String(10))  # BUY, SELL, HOLD
    status: Mapped[str] = mapped_column(String(20), default="ACTIVE")
    outcome: Mapped[str] = mapped_column(String(20), default="PENDING")

    market_type: Mapped[str] = mapped_column(String(20), default="FUTURES")
    leverage: Mapped[int] = mapped_column(Integer, default=10)

    confidence: Mapped[float] = mapped_column(Float)
    reasoning: Mapped[str] = mapped_column(String)

    # Flattened price data
    price_entry: Mapped[float | None] = mapped_column(Float)
    price_current: Mapped[float | None] = mapped_column(Float)
    price_target: Mapped[float | None] = mapped_column(Float)
    price_stop_loss: Mapped[float | None] = mapped_column(Float)

    # JSON columns for flexible/nested data
    features: Mapped[dict | None] = mapped_column(JSONB)
    ml: Mapped[dict | None] = mapped_column(JSONB)
    performance: Mapped[dict | None] = mapped_column(JSONB)
    scoring: Mapped[dict | None] = mapped_column(JSONB)

    expected_direction: Mapped[str | None] = mapped_column(String(20))
    actual_direction: Mapped[str | None] = mapped_column(String(20))

    resolution_source: Mapped[str | None] = mapped_column(String(50))
    resolution_notes: Mapped[str | None] = mapped_column(String)
    was_duplicate: Mapped[bool] = mapped_column(Boolean, default=False)

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )
    resolved_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    expires_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))

    user: Mapped["User | None"] = relationship("User", back_populates="signals")

    __table_args__ = (
        Index("ix_signals_user_symbol_tf", "user_id", "symbol", "timeframe"),
        Index("ix_signals_status_outcome", "status", "outcome"),
    )
