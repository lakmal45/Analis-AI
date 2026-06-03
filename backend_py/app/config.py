"""
Centralized application settings.

Replaces all scattered `process.env.*` reads from the Node.js backend with a
single, validated, typed Settings object.  Values are loaded from the .env file
and can be overridden by real environment variables.

Usage anywhere in the app:
    from app.config import settings
    print(settings.database_url)
"""

from __future__ import annotations

from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """Application-wide configuration — all values come from .env or env vars."""

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        case_sensitive=False,
        extra="ignore",
    )

    # ── Server ───────────────────────────────────────────
    port: int = 5000
    frontend_url: str = "http://localhost:5173"

    # ── Database ─────────────────────────────────────────
    database_url: str = "postgresql+asyncpg://postgres:postgres@localhost:5432/analis_ai"

    # ── Redis ────────────────────────────────────────────
    redis_url: str = "redis://localhost:6379/0"

    # ── Auth ─────────────────────────────────────────────
    jwt_secret: str = "change-me-in-production"
    jwt_algorithm: str = "HS256"
    jwt_expire_minutes: int = 1440  # 24 hours

    # ── ML Configuration ─────────────────────────────────
    ml_rule_confidence_weight: float = 0.35
    ml_probability_weight: float = 0.65
    min_directional_rule_confidence: float = 68.0
    min_directional_score_gap: float = 3.0
    min_ml_probability: float = 0.6
    min_model_roc_auc: float = 0.58
    min_model_dataset_rows: int = 400
    require_healthy_ml_for_directional_signals: bool = True

    # ── ML Promotion Thresholds ──────────────────────────
    ml_promotion_min_dataset_rows: int = 250
    ml_promotion_min_roc_auc: float = 0.58
    ml_promotion_min_walkforward_roc_auc: float = 0.56
    ml_promotion_max_brier_score: float = 0.25

    # ── Kernel Regression (Lorentzian Classification) ────
    kernel_lookback: int = 8
    kernel_relative_weight: float = 8.0
    kernel_start_bar: int = 25
    kernel_lag: int = 2

    # ── Background Tasks ─────────────────────────────────
    signal_resolution_interval_minutes: int = 5
    ml_retrain_interval_hours: int = 24

    # ── Signal Engine ────────────────────────────────────
    default_fees_per_trade_pct: float = 0.04
    max_concurrent_signals: int = 5
    min_signal_quality: int = 40
    cooldown_loss_streak_threshold: int = 3
    default_futures_leverage: int = 10


@lru_cache
def get_settings() -> Settings:
    """Return a cached Settings instance (loaded once at startup)."""
    return Settings()


# Convenience alias — import this directly
settings = get_settings()
