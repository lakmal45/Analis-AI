"""
Async SQLAlchemy engine and session factory for PostgreSQL.

Replaces `backend/config/db.js` (Mongoose / MongoDB connection).

Usage:
    from app.database import get_db, engine, Base

    # In FastAPI dependencies:
    async def my_route(db: AsyncSession = Depends(get_db)):
        result = await db.execute(select(Signal))

    # For Alembic migrations:
    target_metadata = Base.metadata
"""

from __future__ import annotations

from collections.abc import AsyncGenerator

from sqlalchemy.ext.asyncio import (
    AsyncSession,
    async_sessionmaker,
    create_async_engine,
)
from sqlalchemy.orm import DeclarativeBase

from app.config import settings

# ── Engine ───────────────────────────────────────────────
# `echo=False` in production; set to True for SQL query logging during dev.
engine = create_async_engine(
    settings.database_url,
    echo=False,
    pool_size=10,
    max_overflow=20,
    pool_pre_ping=True,  # detect stale connections
)

# ── Session factory ──────────────────────────────────────
AsyncSessionLocal = async_sessionmaker(
    bind=engine,
    class_=AsyncSession,
    expire_on_commit=False,
)


# ── Base class for all ORM models ────────────────────────
class Base(DeclarativeBase):
    """All SQLAlchemy models inherit from this."""
    pass


# ── Dependency for FastAPI routes ────────────────────────
async def get_db() -> AsyncGenerator[AsyncSession, None]:
    """
    Yields an async database session.

    Automatically commits on success and rolls back on error.
    Used as a FastAPI dependency:

        @router.get("/items")
        async def get_items(db: AsyncSession = Depends(get_db)):
            ...
    """
    async with AsyncSessionLocal() as session:
        try:
            yield session
            await session.commit()
        except Exception:
            await session.rollback()
            raise
