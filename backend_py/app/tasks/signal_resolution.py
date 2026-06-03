from __future__ import annotations

import logging
from datetime import datetime, timezone
from typing import Any

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import AsyncSessionLocal
from app.models.signal import Signal
from app.services.market_service import get_klines

logger = logging.getLogger(__name__)


async def resolve_pending_signals() -> None:
    """
    Background job to auto-resolve pending signals based on real-time price data.
    """
    logger.info("Running signal resolution job...")
    
    try:
        async with AsyncSessionLocal() as session:
            stmt = select(Signal).where(Signal.status == "ACTIVE")
            result = await session.execute(stmt)
            pending_signals = result.scalars().all()

            if not pending_signals:
                logger.debug("No pending signals to resolve.")
                return

            for signal in pending_signals:
                try:
                    await _process_signal(signal, session)
                except Exception as exc:
                    logger.error(f"Failed to process signal {signal.id}: {exc}")

    except Exception as exc:
        logger.error(f"Signal resolution job failed: {exc}", exc_info=True)


async def _process_signal(signal: Signal, session: AsyncSession) -> None:
    # Fetch recent candles to see if target or stop loss was hit
    klines = await get_klines(signal.symbol, signal.timeframe, limit=10)
    if not klines:
        return

    now = datetime.now(timezone.utc)
    target = signal.price_target
    stop_loss = signal.price_stop_loss
    
    # We'll just check the very last candle for simplicity in this port
    # A full implementation iterates over all candles since signal creation
    latest = klines[-1]
    high = latest["high"]
    low = latest["low"]
    
    resolved = False
    outcome = "NEUTRAL"
    exit_reason = None
    resolution_price = None

    if signal.signal_type == "BUY":
        if target and high >= target:
            resolved = True
            outcome = "WIN"
            exit_reason = "take_profit_hit"
            resolution_price = target
        elif stop_loss and low <= stop_loss:
            resolved = True
            outcome = "LOSS"
            exit_reason = "stop_loss_hit"
            resolution_price = stop_loss
    elif signal.signal_type == "SELL":
        if target and low <= target:
            resolved = True
            outcome = "WIN"
            exit_reason = "take_profit_hit"
            resolution_price = target
        elif stop_loss and high >= stop_loss:
            resolved = True
            outcome = "LOSS"
            exit_reason = "stop_loss_hit"
            resolution_price = stop_loss

    if resolved:
        signal.status = "COMPLETED"
        signal.outcome = outcome
        signal.price_current = resolution_price
        signal.resolved_at = now
        signal.resolution_source = "auto_resolution_job"
        signal.resolution_notes = exit_reason
        
        await session.commit()
        logger.info(f"Resolved signal {signal.id} as {outcome}")
