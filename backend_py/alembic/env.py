"""
Alembic environment configuration.

Connects Alembic to the same database engine and model metadata used by
the application, so ``alembic revision --autogenerate`` can detect schema
changes automatically.
"""

from __future__ import annotations

import asyncio
from logging.config import fileConfig

from alembic import context
from sqlalchemy import pool
from sqlalchemy.ext.asyncio import async_engine_from_config

from app.config import settings
from app.database import Base

# ── Import ALL models so their tables are registered on Base.metadata ──
# This is required for autogenerate to detect them.
from app.models.user import User            # noqa: F401
from app.models.signal import Signal        # noqa: F401
from app.models.backtest_run import BacktestRun  # noqa: F401
from app.models.portfolio import Portfolio  # noqa: F401
from app.models.watchlist import Watchlist  # noqa: F401

# Alembic Config object (provides access to alembic.ini values)
config = context.config

# Override the sqlalchemy.url from alembic.ini with our Settings value
config.set_main_option("sqlalchemy.url", settings.database_url)

# Python logging configuration from alembic.ini
if config.config_file_name is not None:
    fileConfig(config.config_file_name)

# Target metadata for autogenerate support
target_metadata = Base.metadata


def run_migrations_offline() -> None:
    """
    Run migrations in 'offline' mode — generates SQL without connecting.

    Called when Alembic is invoked with ``--sql``.
    """
    url = config.get_main_option("sqlalchemy.url")
    context.configure(
        url=url,
        target_metadata=target_metadata,
        literal_binds=True,
        dialect_opts={"paramstyle": "named"},
    )

    with context.begin_transaction():
        context.run_migrations()


def do_run_migrations(connection):
    """Run migrations on the given connection."""
    context.configure(connection=connection, target_metadata=target_metadata)
    with context.begin_transaction():
        context.run_migrations()


async def run_async_migrations() -> None:
    """
    Run migrations in 'online' mode with an async engine.
    """
    connectable = async_engine_from_config(
        config.get_section(config.config_ini_section, {}),
        prefix="sqlalchemy.",
        poolclass=pool.NullPool,
    )

    async with connectable.connect() as connection:
        await connection.run_sync(do_run_migrations)

    await connectable.dispose()


def run_migrations_online() -> None:
    """Entry point for online migrations — delegates to async runner."""
    asyncio.run(run_async_migrations())


if context.is_offline_mode():
    run_migrations_offline()
else:
    run_migrations_online()
