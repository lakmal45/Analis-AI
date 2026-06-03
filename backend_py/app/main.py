"""
FastAPI application entry point.

Replaces ``backend/server.js`` — sets up CORS, rate limiting, Socket.IO,
background scheduler, and mounts all API routers at ``/api/*``.
"""

from __future__ import annotations

import logging
from contextlib import asynccontextmanager
from typing import Any

import redis.asyncio as aioredis
import socketio
from apscheduler.schedulers.asyncio import AsyncIOScheduler
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from slowapi import Limiter, _rate_limit_exceeded_handler
from slowapi.errors import RateLimitExceeded
from slowapi.util import get_remote_address

from app.config import settings
from app.database import engine, Base
from app.routes import ai, auth, backtest, market, portfolio, signal, watchlist, ml
from app import cache

# ── Logging ──────────────────────────────────────────────
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s | %(levelname)-7s | %(name)s | %(message)s",
    datefmt="%Y-%m-%d %H:%M:%S",
)
logger = logging.getLogger("analis")

# ── Rate Limiter ─────────────────────────────────────────
limiter = Limiter(key_func=get_remote_address, default_limits=["200/minute"])

# ── Background Scheduler ────────────────────────────────
scheduler = AsyncIOScheduler()

# ── Socket.IO Server ────────────────────────────────────
# Creates a Socket.IO server that wraps around ASGI.
# `async_mode="asgi"` is compatible with uvicorn.
# `cors_allowed_origins` is set to the frontend URL for WebSocket CORS.
sio = socketio.AsyncServer(
    async_mode="asgi",
    cors_allowed_origins="*",
    logger=False,
    engineio_logger=False,
)

# ── Lifespan (startup / shutdown) ────────────────────────
@asynccontextmanager
async def lifespan(app: FastAPI):
    """
    Runs once on startup and once on shutdown.

    Replaces the connect-then-listen flow from ``server.js``:
    - connectDB()
    - startSignalResolutionJob(5)
    - startMlRetrainingJob()
    - app.listen(PORT)
    """
    from app.services.binance_ws import binance_ws
    binance_ws.setup(sio)

    # ── Startup ──────────────────────────────────────────
    logger.info("Starting Analis-AI backend (Python/FastAPI) ...")

    # 1. Create database tables (in dev; Alembic handles prod migrations)
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    logger.info("Database tables ensured")

    # 2. Connect to Redis
    try:
        cache.redis_client = aioredis.from_url(
            settings.redis_url,
            decode_responses=True,
            max_connections=20,
        )
        await cache.redis_client.ping()
        logger.info("Redis connected at %s", settings.redis_url)
    except Exception as exc:
        logger.warning("Redis not available (%s) — running without cache", exc)
        cache.redis_client = None

    # 3. Start background scheduler
    from app.tasks import signal_resolution, ml_retraining
    
    scheduler.add_job(
        signal_resolution.resolve_pending_signals,
        "interval",
        minutes=settings.signal_resolution_interval_minutes,
        id="signal_resolution"
    )
    
    scheduler.add_job(
        ml_retraining.retrain_ml_model,
        "interval",
        hours=settings.ml_retrain_interval_hours,
        id="ml_retraining"
    )
    
    scheduler.start()
    logger.info(
        "Background scheduler started (signal resolution every %d min, "
        "ML retraining every %d h)",
        settings.signal_resolution_interval_minutes,
        settings.ml_retrain_interval_hours,
    )

    logger.info(
        "Analis-AI backend ready — listening on port %d", settings.port
    )

    yield  # ← Application runs here

    # ── Shutdown ─────────────────────────────────────────
    logger.info("Shutting down ...")
    scheduler.shutdown(wait=False)
    await binance_ws.stop()
    if cache.redis_client:
        await cache.redis_client.aclose()
    await engine.dispose()
    logger.info("Cleanup complete — goodbye")


# ── FastAPI application ──────────────────────────────────
app = FastAPI(
    title="AnalisAI",
    description="AI-Powered Crypto Signal & Backtesting Platform",
    version="2.0.0",
    lifespan=lifespan,
)

# Rate limit error handler
app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)

# ── CORS (replaces Express cors() middleware) ────────────
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        settings.frontend_url,
        "http://localhost:5173",  # Vite dev default
        "http://127.0.0.1:5173",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ── Global error handler ────────────────────────────────
@app.exception_handler(Exception)
async def global_exception_handler(request: Request, exc: Exception):
    """Catch-all handler that returns a JSON error response."""
    logger.exception("Unhandled error: %s", exc)
    return JSONResponse(
        status_code=500,
        content={
            "success": False,
            "message": "Internal server error",
            "error": str(exc),
        },
    )


# ── Health check ─────────────────────────────────────────
@app.get("/health")
async def health_check():
    """Quick health probe for load balancers / monitors."""
    return {
        "status": "ok",
        "version": "2.0.0",
        "framework": "FastAPI",
    }


# ── Register API routers ────────────────────────────────
app.include_router(auth.router)
app.include_router(market.router)
app.include_router(signal.router)
app.include_router(ai.router)
app.include_router(portfolio.router)
app.include_router(watchlist.router)
app.include_router(backtest.router)
app.include_router(ml.router)


# ── Mount Socket.IO on the same ASGI server ─────────────
# The `app` wraps the FastAPI app, so both HTTP routes
# and WebSocket events are served from the same port.
app = socketio.ASGIApp(sio, other_asgi_app=app)


# ── Socket.IO event handlers ────────────────────────────
@sio.event
async def connect(sid: str, environ: dict, auth: dict | None = None):
    """Client connected."""
    logger.info("Socket.IO client connected: %s", sid)


@sio.event
async def disconnect(sid: str):
    """Client disconnected."""
    logger.info("Socket.IO client disconnected: %s", sid)


@sio.on("subscribe-ticker")
async def subscribe_ticker(sid: str, data: dict[str, Any] | str):
    """
    Client subscribes to a symbol's live price stream.

    Replaces the Socket.IO `subscribe-ticker` handler from ``server.js``.
    Joins the client to the ``ticker-<symbol>`` room and starts the
    Binance WebSocket stream if not already running.
    """
    symbol = ""
    if isinstance(data, str):
        symbol = data.lower()
    elif isinstance(data, dict):
        symbol = (data.get("symbol") or "").lower()

    if not symbol:
        return

    room = f"ticker-{symbol}"
    await sio.enter_room(sid, room)
    logger.info("Client %s subscribed to %s", sid, room)

    from app.services.binance_ws import binance_ws
    await binance_ws.subscribe(symbol)


@sio.on("unsubscribe-ticker")
async def unsubscribe_ticker(sid: str, data: dict[str, Any] | str):
    """Client unsubscribes from a symbol's live price stream."""
    symbol = ""
    if isinstance(data, str):
        symbol = data.lower()
    elif isinstance(data, dict):
        symbol = (data.get("symbol") or "").lower()

    if not symbol:
        return

    room = f"ticker-{symbol}"
    await sio.leave_room(sid, room)
    logger.info("Client %s unsubscribed from %s", sid, room)

    from app.services.binance_ws import binance_ws
    await binance_ws.unsubscribe(symbol)


@sio.on("subscribe-watchlist")
async def subscribe_watchlist(sid: str, data: list[str] | str | dict[str, Any]):
    """Client subscribes to multiple symbols for the watchlist."""
    symbols = []
    if isinstance(data, list):
        symbols = [s.lower() for s in data if isinstance(s, str)]
    elif isinstance(data, str):
        symbols = [data.lower()]
    elif isinstance(data, dict):
        symbols = [(data.get("symbols") or [])]
    
    from app.services.binance_ws import binance_ws
    for symbol in symbols:
        if symbol:
            room = f"ticker-{symbol}"
            await sio.enter_room(sid, room)
            logger.info("Client %s subscribed to %s (watchlist)", sid, room)
            await binance_ws.subscribe(symbol)


@sio.on("unsubscribe-watchlist")
async def unsubscribe_watchlist(sid: str, data: list[str] | str | dict[str, Any]):
    """Client unsubscribes from multiple symbols."""
    symbols = []
    if isinstance(data, list):
        symbols = [s.lower() for s in data if isinstance(s, str)]
    elif isinstance(data, str):
        symbols = [data.lower()]
    elif isinstance(data, dict):
        symbols = [(data.get("symbols") or [])]

    from app.services.binance_ws import binance_ws
    for symbol in symbols:
        if symbol:
            room = f"ticker-{symbol}"
            await sio.leave_room(sid, room)
            logger.info("Client %s unsubscribed from %s (watchlist)", sid, room)
            await binance_ws.unsubscribe(symbol)
