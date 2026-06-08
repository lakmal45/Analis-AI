# New Python Backend Description

This document explains the new `backend_py` backend for Analis-AI. It covers the FastAPI architecture, all backend features, their related files, and how the important Signal, Backtesting, and AI/ML systems work.

## 1. Backend Overview

The new Python backend replaces the older Node/Express API with a FastAPI application. It keeps the same product idea: crypto market data, user authentication, watchlists, portfolio tracking, AI chat, trading signals, backtesting, real-time prices, and ML-assisted signal validation.

Main backend folder:

```text
backend_py/
```

Main entry point:

```text
backend_py/app/main.py
```

Core stack:

- `FastAPI` for REST API endpoints.
- `SQLAlchemy async` for PostgreSQL database access.
- `PostgreSQL` as the main persistent database.
- `Redis` for optional short-lived caching.
- `Socket.IO` for frontend-compatible real-time events.
- `APScheduler` for background jobs.
- `httpx` for async calls to Binance and OpenRouter.
- `pandas`, `pandas_ta`, `scikit-learn`, `xgboost`, and `joblib` for ML features, training, and inference.

Startup behavior in `backend_py/app/main.py`:

1. Creates the FastAPI application.
2. Adds CORS for the frontend.
3. Adds global rate limiting.
4. Creates database tables using SQLAlchemy metadata.
5. Tries to connect to Redis.
6. Starts background jobs:
   - signal resolution every configured number of minutes.
   - ML retraining every configured number of hours.
7. Sets up Socket.IO handlers for live ticker subscriptions.
8. Mounts all API routers under `/api/*`.

## 2. Important Folder Map

```text
backend_py/
  app/
    main.py                 FastAPI app, CORS, scheduler, Socket.IO
    config.py               Environment settings
    database.py             Async SQLAlchemy engine and sessions
    cache.py                Redis client and dummy fallback
    middleware/
      auth.py               JWT authentication dependency
    routes/                 HTTP API endpoints
    services/               Business logic and external API calls
    models/                 SQLAlchemy database models
    schemas/                Pydantic request/response schemas
    ml/                     Native ML feature, training, and model logic
    tasks/                  Background jobs
    utils/                  Shared helper functions
  tests/                    Backend tests
  requirements.txt          Python dependencies
  pyproject.toml            Project metadata and dependencies
  alembic.ini               Alembic migration config
  alembic/                  Migration setup
```

## 3. Configuration Feature

Related files:

- `backend_py/app/config.py`
- `backend_py/requirements.txt`
- `backend_py/pyproject.toml`

How it works:

- `config.py` defines one central `Settings` class using `pydantic-settings`.
- Values come from `.env` or real environment variables.
- Defaults are provided for local development.
- The global `settings` object is imported by services, tasks, and the app entry point.

Important settings:

- `port`: backend port, default `5000`.
- `frontend_url`: frontend CORS and OpenRouter referer.
- `database_url`: async PostgreSQL connection string.
- `redis_url`: Redis connection string.
- `jwt_secret`, `jwt_algorithm`, `jwt_expire_minutes`: auth settings.
- `openrouter_api_key`: enables AI chat.
- ML thresholds:
  - `ml_rule_confidence_weight`
  - `ml_probability_weight`
  - `min_ml_probability`
  - `min_model_roc_auc`
  - `ml_promotion_min_dataset_rows`
  - `ml_promotion_min_roc_auc`
  - `ml_promotion_min_walkforward_roc_auc`
  - `ml_promotion_max_brier_score`
- Signal settings:
  - `default_fees_per_trade_pct`
  - `max_concurrent_signals`
  - `min_signal_quality`
  - `default_futures_leverage`
- Scheduler settings:
  - `signal_resolution_interval_minutes`
  - `ml_retrain_interval_hours`

## 4. Database Feature

Related files:

- `backend_py/app/database.py`
- `backend_py/app/models/user.py`
- `backend_py/app/models/signal.py`
- `backend_py/app/models/backtest_run.py`
- `backend_py/app/models/portfolio.py`
- `backend_py/app/models/watchlist.py`
- `backend_py/alembic.ini`
- `backend_py/alembic/env.py`

How it works:

- The backend uses SQLAlchemy async with `asyncpg`.
- `database.py` creates:
  - `engine`
  - `AsyncSessionLocal`
  - `Base`
  - `get_db()` dependency for FastAPI routes.
- On app startup, `Base.metadata.create_all()` ensures tables exist.
- Alembic files are present for future production-grade migrations.

Database models:

| Model | File | Purpose |
|---|---|---|
| `User` | `app/models/user.py` | Stores username, email, password hash, and relationships. |
| `Signal` | `app/models/signal.py` | Stores generated signals, prices, ML data, features, status, and outcome. |
| `BacktestRun` | `app/models/backtest_run.py` | Stores complete backtest config, dataset info, summary, and trades in JSONB. |
| `Portfolio` | `app/models/portfolio.py` | One portfolio per user. |
| `Holding` | `app/models/portfolio.py` | Individual portfolio holdings. |
| `Watchlist` | `app/models/watchlist.py` | One watchlist per user. |
| `WatchlistAsset` | `app/models/watchlist.py` | Symbols saved in a watchlist. |

## 5. Authentication Feature

Related files:

- `backend_py/app/routes/auth.py`
- `backend_py/app/middleware/auth.py`
- `backend_py/app/models/user.py`
- `backend_py/app/schemas/auth.py`

Endpoints:

| Method | Endpoint | Purpose |
|---|---|---|
| `POST` | `/api/auth/register` | Create user and return JWT token. |
| `POST` | `/api/auth/login` | Validate credentials and return JWT token. |
| `GET` | `/api/auth/profile` | Return current authenticated user. |

How it works:

1. Registration checks if the email already exists.
2. Passwords are hashed with `bcrypt`.
3. Login checks the email and password hash.
4. `create_access_token()` signs a JWT containing the user id.
5. Protected routes use `get_current_user()` from `middleware/auth.py`.
6. `get_current_user()` decodes the Bearer token, loads the user from PostgreSQL, and rejects invalid credentials with `401`.

## 6. Market Data Feature

Related files:

- `backend_py/app/routes/market.py`
- `backend_py/app/services/market_service.py`
- `backend_py/app/schemas/market.py`
- `backend_py/app/cache.py`

Endpoints:

| Method | Endpoint | Purpose |
|---|---|---|
| `GET` | `/api/market/price/{symbol}` | Current Binance spot price. |
| `GET` | `/api/market/klines` | Historical OHLCV candles. |
| `GET` | `/api/market/overview` | Top active USDT pairs by volume. |
| `GET` | `/api/market/symbols` | Static list of supported symbols. |

How it works:

- `get_price()` calls Binance `/api/v3/ticker/price`.
- Prices are cached for 10 seconds in Redis when Redis is available.
- `get_klines()` calls Binance `/api/v3/klines` and converts raw arrays into candle dictionaries:
  - `openTime`
  - `open`
  - `high`
  - `low`
  - `close`
  - `volume`
  - `closeTime`
- `get_market_overview()` calls Binance `/api/v3/ticker/24hr`, filters USDT pairs, sorts by quote volume, returns the top 100, and caches the result for 60 seconds.
- If Redis is not available, `cache.py` uses `DummyRedis`, so the backend still runs without cache.

## 7. Real-Time Price Feature

Related files:

- `backend_py/app/main.py`
- `backend_py/app/services/binance_ws.py`

Socket.IO events:

| Event | Direction | Purpose |
|---|---|---|
| `subscribe-ticker` | frontend to backend | Subscribe to one symbol. |
| `unsubscribe-ticker` | frontend to backend | Unsubscribe from one symbol. |
| `subscribe-watchlist` | frontend to backend | Subscribe to multiple symbols. |
| `unsubscribe-watchlist` | frontend to backend | Unsubscribe from multiple symbols. |
| `price-update` | backend to frontend | Emit Binance ticker update to subscribed room. |

How it works:

1. The Socket.IO server is created in `main.py`.
2. `BinanceWSManager` stores subscribed symbols and reference counts.
3. When a frontend subscribes, the client joins a room named `ticker-{symbol}`.
4. `BinanceWSManager` opens a Binance websocket connection if needed.
5. It sends Binance subscribe/unsubscribe messages for `symbol@ticker`.
6. Incoming `24hrTicker` messages are normalized.
7. The backend emits `price-update` to the matching Socket.IO room.

## 8. Watchlist Feature

Related files:

- `backend_py/app/routes/watchlist.py`
- `backend_py/app/models/watchlist.py`
- `backend_py/app/schemas/watchlist.py`

Endpoints:

| Method | Endpoint | Purpose |
|---|---|---|
| `GET` | `/api/watchlist` | Get or create the user's watchlist. |
| `POST` | `/api/watchlist/add` | Add a symbol. |
| `DELETE` | `/api/watchlist/remove/{symbol}` | Remove a symbol. |
| `DELETE` | `/api/watchlist/{symbol}` | Backward-compatible remove alias. |

How it works:

- Every user has one watchlist.
- `get_or_create_watchlist()` creates it automatically if missing.
- Adding a symbol uppercases it and avoids duplicates.
- Responses are enriched with live Binance 24h ticker data:
  - `price`
  - `change24h`
  - `volume24h`
  - `high24h`
  - `low24h`

## 9. Portfolio Feature

Related files:

- `backend_py/app/routes/portfolio.py`
- `backend_py/app/models/portfolio.py`
- `backend_py/app/schemas/portfolio.py`

Endpoints:

| Method | Endpoint | Purpose |
|---|---|---|
| `GET` | `/api/portfolio/` | Get or create user portfolio. |
| `POST` | `/api/portfolio/add` | Add a holding. |
| `DELETE` | `/api/portfolio/{holding_id}` | Delete a holding. |

How it works:

- Every user has one portfolio.
- `get_or_create_portfolio()` creates it automatically if missing.
- Holdings include:
  - `symbol`
  - `quantity`
  - `buy_price`
  - `notes`
  - `buy_date`
- Deleting checks that the holding belongs to the authenticated user's portfolio.

## 10. AI Chat Feature

Related files:

- `backend_py/app/routes/ai.py`
- `backend_py/app/services/ai_service.py`
- `backend_py/app/schemas/ai.py`
- `backend_py/app/config.py`

Endpoints:

| Method | Endpoint | Purpose |
|---|---|---|
| `POST` | `/api/ai/chat` | Send messages to the AI trading assistant. |
| `GET` | `/api/ai/ml/lifecycle` | Placeholder lifecycle response. |
| `GET` | `/api/ai/ml/health` | Placeholder ML health response. |

How AI chat works:

1. The frontend sends a list of chat messages.
2. Optional `context` is appended to the system prompt.
3. Optional `systemPrompt` replaces the default system prompt.
4. `ai_service.py` calls OpenRouter:
   - URL: `https://openrouter.ai/api/v1/chat/completions`
   - default model: `meta-llama/llama-3-8b-instruct:free`
5. The assistant reply is returned as `{ "message": "..." }`.
6. If `OPENROUTER_API_KEY` is missing, chat returns a disabled message instead of calling the provider.

Current ML endpoints in `routes/ai.py`:

- `/api/ai/ml/lifecycle` currently returns static placeholder data.
- `/api/ai/ml/health` currently returns static placeholder data.
- Real ML inference and training are implemented as native Python services, not full public management endpoints yet.

## 11. Signal Feature

The signal feature is the main trading-intelligence feature. It creates futures-style crypto trade ideas using recent Binance candles, technical feature engineering, a rule engine, higher-timeframe confirmation, order-flow data, and ML probability filtering.

### 11.1 Signal Files

Core signal files:

| File | Purpose |
|---|---|
| `backend_py/app/routes/signal.py` | Signal API endpoints. |
| `backend_py/app/services/signal_service.py` | Main signal generation logic and rule engine. |
| `backend_py/app/services/ml_feature_service.py` | Builds the feature snapshot used by rules and ML. |
| `backend_py/app/ml/feature_builder.py` | Computes all technical/ML features from candles. |
| `backend_py/app/ml/feature_schema.py` | Defines supported ML feature columns. |
| `backend_py/app/services/ml_inference_service.py` | Loads active ML model and predicts win probability. |
| `backend_py/app/services/market_service.py` | Fetches Binance candles. |
| `backend_py/app/services/mtf_service.py` | Higher-timeframe confirmation. |
| `backend_py/app/services/order_flow_service.py` | Funding-rate and long/short-ratio bias. |
| `backend_py/app/tasks/signal_resolution.py` | Background auto-resolution of pending signals. |
| `backend_py/app/models/signal.py` | Signal database model. |
| `backend_py/app/schemas/signal.py` | Signal request/response schemas. |
| `backend_py/tests/test_signal_engine.py` | Unit tests for important signal helpers. |

### 11.2 Signal Endpoints

| Method | Endpoint | Purpose |
|---|---|---|
| `POST` | `/api/signals/generate` | Generate and save a new signal. |
| `GET` | `/api/signals` | List current user's signals with pagination and optional status filter. |
| `GET` | `/api/signals/stats/summary` | Completed signal win/loss summary. |
| `GET` | `/api/signals/stats/ml-summary` | Placeholder ML signal summary. |
| `GET` | `/api/signals/{signal_id}` | Get one signal. |
| `PUT` | `/api/signals/{signal_id}/status` | Manually resolve or cancel a signal. |
| `DELETE` | `/api/signals/{signal_id}` | Delete a signal. |

### 11.3 Signal Database Fields

The `Signal` model stores:

- user ownership:
  - `user_id`
- identity:
  - `symbol`
  - `timeframe`
  - `signal_type`
  - `market_type`
  - `leverage`
- lifecycle:
  - `status`
  - `outcome`
  - `created_at`
  - `resolved_at`
  - `expires_at`
- prices:
  - `price_entry`
  - `price_current`
  - `price_target`
  - `price_stop_loss`
- intelligence:
  - `confidence`
  - `reasoning`
  - `features`
  - `ml`
  - `scoring`
  - `performance`
- direction/result:
  - `expected_direction`
  - `actual_direction`
  - `resolution_source`
  - `resolution_notes`
  - `was_duplicate`

### 11.4 Signal Generation Flow

Request body:

```json
{
  "symbol": "BTCUSDT",
  "timeframe": "1h",
  "leverage": 10
}
```

Full flow:

1. `routes/signal.py` receives `POST /api/signals/generate`.
2. The route requires an authenticated user.
3. It calls `generate_signal()` in `services/signal_service.py`.
4. `generate_signal()` uppercases the symbol and chooses leverage.
5. It fetches the latest 100 candles from Binance using `get_klines()`.
6. It rejects the request if fewer than 26 candles are available.
7. It builds a native ML feature snapshot using `build_ml_feature_snapshot()`.
8. `build_ml_feature_snapshot()` calls `build_feature_snapshot()` in `app/ml/feature_builder.py`.
9. The rule engine evaluates the feature snapshot using `evaluate_signal_rules()`.
10. The backend requests higher-timeframe trend bias using `get_higher_timeframe_bias()`.
11. The backend requests order-flow bias using `get_order_flow_bias()`.
12. Higher-timeframe bias can block directional signals:
    - BUY blocked by bearish higher timeframe.
    - SELL blocked by bullish higher timeframe.
13. ML prediction is loaded using `get_ml_prediction()`.
14. If the final rule signal is directional, ML probability is checked.
15. If ML probability is below `0.60`, the signal becomes `HOLD`.
16. If ML probability passes, final confidence is blended:
    - rule confidence weight: `0.35`
    - ML probability weight: `0.65`
17. Target and stop-loss are created from ATR and regime-adaptive multipliers.
18. The result is returned to the route.
19. The route checks for an existing pending signal with the same user, symbol, and timeframe.
20. Existing pending duplicates are marked `CANCELLED`.
21. The new signal is saved in PostgreSQL.
22. The API returns the saved signal.

### 11.5 Signal Rule Engine

Main function:

```text
evaluate_signal_rules()
```

File:

```text
backend_py/app/services/signal_service.py
```

The Python port currently uses a simplified but functional rule engine built from these parts:

#### RSI Mean Reversion

- Uses timeframe-specific oversold/overbought thresholds.
- Oversold RSI increases BUY score.
- Overbought RSI increases SELL score.
- Threshold examples:
  - `1m`: oversold `25`, overbought `75`
  - `1h`: oversold `30`, overbought `70`
  - `1d`: oversold `35`, overbought `65`

#### MACD Trend Confirmation

- Bullish MACD crossover with positive histogram increases BUY score.
- Bearish MACD crossover with negative histogram increases SELL score.

#### EMA Trend Alignment

- Price above EMA20 increases BUY score.
- Price below EMA20 increases SELL score.

#### Lorentzian KNN Pattern Similarity

- `lorentzian.bullishNeighborPct >= 75` increases BUY score.
- `lorentzian.bullishNeighborPct <= 25` increases SELL score.
- This uses pattern similarity from the ML feature snapshot.

#### Regime-Adaptive Weights

Function:

```text
_compute_regime_weights()
```

The rule engine changes how much it trusts mean-reversion versus trend-following depending on market regime:

- Strong trending market with ADX above `40`:
  - mean-reversion weight becomes `0`
  - trend-following weight stays `1`
- Low-ADX ranging market below `15`:
  - mean-reversion weight stays `1`
  - trend-following weight becomes `0`
- Normal trending market:
  - mean-reversion is reduced
  - trend-following is favored
- Normal ranging market:
  - trend-following is reduced
  - mean-reversion is favored

#### Direction Decision

The engine calculates:

- `buyScore`
- `sellScore`
- score gap
- rule confidence

It returns:

- `BUY` when buy score beats sell score by enough.
- `SELL` when sell score beats buy score by enough.
- `HOLD` when neither side is strong enough.

In the current Python port:

- total possible score is `6.5`
- minimum score gap is `1.0`
- minimum rule confidence is `35%`

### 11.6 Feature Snapshot Used By Signals

Main files:

- `backend_py/app/services/ml_feature_service.py`
- `backend_py/app/ml/feature_builder.py`
- `backend_py/app/ml/feature_schema.py`

The feature builder requires at least 26 candles and produces `featureVersion = v4_lorentzian`.

Feature groups:

| Group | Examples |
|---|---|
| `momentum` | RSI, MACD, Stochastic, CCI, ROC, Williams %R, AO, Ultimate Oscillator, TRIX, PPO, WaveTrend. |
| `trend` | EMA, SMA, SMA200, ADX, DMI, HMA, DEMA, PSAR, linear regression, kernel regression. |
| `volatility` | ATR, ATR %, candle range %, Bollinger width, Bollinger %B, NATR, Donchian, Keltner, squeeze, z-score. |
| `volume` | raw volume, volume SMA20, relative volume, MFI, OBV, CMF, AD line, Elder Force Index. |
| `structure` | supply/demand zones and fair value gaps. |
| `candle` | body %, upper wick %, lower wick %, bullish/bearish strength. |
| `context` | signal type, timeframe, leverage, regime, OHLC prices. |
| `lorentzian` | KNN distance and bullish-neighbor pattern statistics. |

The feature schema in `feature_schema.py` lists the flattened columns used by training and inference.

### 11.7 Lorentzian Signal Logic

Lorentzian-related files:

- `backend_py/app/ml/feature_builder.py`
- `backend_py/app/ml/lorentzian_model.py`
- `backend_py/app/services/signal_service.py`

The signal feature uses Lorentzian concepts in two places:

1. Feature engineering:
   - WaveTrend oscillator.
   - Nadaraya-Watson kernel regression.
   - Lorentzian-distance nearest-neighbor pattern similarity.
2. ML ensemble:
   - A KNN classifier using Lorentzian distance can be trained beside XGBoost.

Feature-builder Lorentzian distance:

```text
sum(log(1 + abs(a - b)))
```

Why this is useful:

- It is less sensitive to large outliers than plain Euclidean distance.
- Crypto candles can contain sudden spikes.
- The log transform keeps extreme feature differences from dominating the entire distance.

The pattern-similarity process:

1. Build a compact vector for each historical bar:
   - RSI
   - CCI
   - ADX
   - Stochastic K
   - ROC
2. Label each past bar:
   - bullish if price four bars later is higher.
   - bearish if price four bars later is lower.
3. Compare the latest vector to past vectors using Lorentzian distance.
4. Search historical neighbors with chronological spacing.
5. Return:
   - average neighbor distance.
   - sum of neighbor labels.
   - bullish-neighbor percentage.
   - distance trend.
6. The rule engine uses bullish-neighbor percentage as an extra directional vote.

### 11.8 Higher-Timeframe Confirmation

Related file:

```text
backend_py/app/services/mtf_service.py
```

The signal timeframe maps to a higher timeframe:

| Signal TF | Higher TF |
|---|---|
| `1m` | `5m` |
| `5m` | `15m` |
| `15m` | `1h` |
| `1h` | `4h` |
| `4h` | `1d` |
| `1d` | skipped / neutral |

MTF logic checks:

- price vs EMA20
- price vs SMA50
- RSI above/below neutral thresholds
- EMA20 slope

It returns:

- `BULLISH`
- `BEARISH`
- `NEUTRAL`

Signal blocking:

- BUY is blocked when higher timeframe is bearish.
- SELL is blocked when higher timeframe is bullish.

### 11.9 Order-Flow Confirmation

Related file:

```text
backend_py/app/services/order_flow_service.py
```

The order-flow service contains helpers for Binance Futures data:

- funding rate
- open interest
- top trader long/short account ratio

The currently called `get_order_flow_bias()` flow uses funding rate and top trader long/short account ratio. `get_open_interest()` exists as a helper, but it is not yet included in the final order-flow bias calculation. The simplified Python signal engine fetches order-flow bias but does not yet use it to change final score. The returned data is ready to be used for future scoring or filtering.

Current order-flow interpretation:

- Very positive funding can be bearish contrarian.
- Very negative funding can be bullish contrarian.
- Extremely high long/short ratio can be bearish contrarian.
- Extremely low long/short ratio can be bullish contrarian.
- Mild ratio imbalance can produce mild bullish/bearish bias.

### 11.10 ML Guardrail In Signals

Related file:

```text
backend_py/app/services/ml_inference_service.py
```

If an active model exists:

1. Signal rules produce a candidate direction.
2. ML predicts probability of a successful setup.
3. If candidate signal is `BUY` or `SELL` and probability is below `0.60`, it is downgraded to `HOLD`.
4. If probability passes, confidence is blended:

```text
finalConfidence = ruleConfidence * 0.35 + mlProbabilityPercent * 0.65
```

If no model bundle is active, inference returns `None`; the signal still works from rule logic only.

### 11.11 Target and Stop-Loss Logic

Related function:

```text
_get_regime_adaptive_multipliers()
```

Base multipliers:

- target: `ATR * 3.0`
- stop-loss: `ATR * 1.5`

Regime examples:

- `TRENDING`: wider target.
- `TRENDING_VOLATILE`: much wider target and wider stop.
- `RANGING`: tighter target and tighter stop.
- `RANGING_VOLATILE`: moderately tighter target.
- `CONSOLIDATING`: very tight target and stop.
- `BREAKOUT`: wider target and wider stop.

BUY signal:

- target = close + ATR target distance.
- stop = close - ATR stop distance.

SELL signal:

- target = close - ATR target distance.
- stop = close + ATR stop distance.

### 11.12 Signal Resolution

Manual resolution:

- Endpoint: `PUT /api/signals/{signal_id}/status`
- File: `backend_py/app/routes/signal.py`

Manual logic:

- If status is `CANCELLED`, outcome becomes `CANCELLED`.
- Otherwise:
  - BUY wins if resolution price is above entry.
  - SELL wins if resolution price is below entry.
  - otherwise it is a loss.

Automatic resolution:

- Background task file: `backend_py/app/tasks/signal_resolution.py`
- Scheduled from: `backend_py/app/main.py`

Auto-resolution flow:

1. Scheduler runs `resolve_pending_signals()`.
2. It loads all `PENDING` signals.
3. For each signal, it fetches the latest 10 candles.
4. It checks the most recent candle only.
5. BUY:
   - high >= target means WIN.
   - low <= stop-loss means LOSS.
6. SELL:
   - low <= target means WIN.
   - high >= stop-loss means LOSS.
7. Resolved signals become:
   - `status = COMPLETED`
   - `outcome = WIN` or `LOSS`
   - `resolution_source = auto_resolution_job`
   - `resolution_notes = take_profit_hit` or `stop_loss_hit`

Current limitation:

- The auto-resolution task only checks the latest candle, not every candle since signal creation.

## 12. Backtesting Feature

The backtesting feature replays historical candles and runs the same signal engine over past data. It is designed to answer: "How would the current signal logic have behaved on historical candles?"

### 12.1 Backtesting Files

| File | Purpose |
|---|---|
| `backend_py/app/routes/backtest.py` | Backtest API endpoints. |
| `backend_py/app/services/backtest_service.py` | Full backtest simulation engine. |
| `backend_py/app/services/signal_service.py` | Provides `generate_signal_from_klines()` for historical signal generation. |
| `backend_py/app/services/market_service.py` | Fetches historical Binance klines. |
| `backend_py/app/models/backtest_run.py` | Stores backtest runs. |
| `backend_py/app/schemas/backtest.py` | Backtest request/response schemas. |

### 12.2 Backtesting Endpoints

| Method | Endpoint | Purpose |
|---|---|---|
| `POST` | `/api/backtest` | Run and save a new backtest. |
| `GET` | `/api/backtest/history` | List user's saved backtests. |
| `GET` | `/api/backtest/{run_id}` | Get one backtest run. |
| `DELETE` | `/api/backtest/history/{run_id}` | Delete a saved run. |

### 12.3 Backtest Request Options

Request schema:

```text
backend_py/app/schemas/backtest.py
```

Important fields:

| Field | Meaning |
|---|---|
| `symbol` | Market symbol, e.g. `BTCUSDT`. |
| `timeframe` | Candle interval, default `1h`. |
| `limit` | Number of recent candles if no date range is used. |
| `analysisWindow` | Number of candles given to the signal engine at each step. |
| `warmupCandles` | Minimum candles before testing begins. |
| `resolutionCandles` | Number of future candles allowed for TP/SL/time expiry. |
| `sampleSize` | Number of recent trades shown separately. |
| `leverage` | Futures leverage used in return calculations. |
| `tradeAmountUsd` | Base capital per simulated trade. |
| `startDate`, `endDate` | Optional date range. |
| `cooldownCandles` | Wait period after a trade before opening another. |
| `intrabarPolicy` | `conservative` or `optimistic` when TP and SL both hit inside one candle. |
| `feesPerTradePct` | Fee percentage subtracted from leveraged return. |
| `slippagePct` | Slippage percentage subtracted from leveraged return. |
| `backtestMlModel` | Enables ML during backtest unless `off`. |
| `applyAccuracyGuardrails` | Passed into historical signal generation. |

### 12.4 Backtest Execution Flow

Main function:

```text
run_backtest()
```

Full flow:

1. Route receives `POST /api/backtest`.
2. Request is validated by `BacktestRequest`.
3. `run_backtest()` normalizes and bounds numeric options.
4. If `startDate` and `endDate` are provided, it fetches candles by date range.
5. Otherwise, it fetches the latest `limit` candles.
6. It verifies enough candles exist:
   - `warmupCandles + resolutionCandles + 1`
7. It sets `last_eligible_index` so each test point has future candles available.
8. It loops candle-by-candle from warmup to the last eligible candle.
9. It skips indexes during cooldown.
10. For each index, it creates a rolling analysis window.
11. It calls `generate_signal_from_klines()` with only historical candles up to that index.
12. `HOLD` signals are skipped.
13. Directional `BUY` and `SELL` signals are simulated.
14. Future candles are checked for target, stop-loss, or time expiry.
15. A trade result is built.
16. Cooldown is applied.
17. After the loop, aggregate summary and equity metrics are calculated.
18. The route saves the full run in `backtest_runs`.
19. The API returns the saved run.

### 12.5 Historical Signal Generation

Backtests use:

```text
generate_signal_from_klines()
```

This function differs from live signal generation:

- It uses only the historical candles provided by the backtest window.
- It does not call higher-timeframe service.
- It does not call order-flow service.
- It can optionally use ML if `backtestMlModel` is enabled.
- It uses the same feature builder and rule engine.
- It creates ATR-based target and stop-loss.

This prevents obvious future-data leakage inside the main signal calculation.

### 12.6 Trade Resolution Model

Backtest trade resolution happens in:

```text
simulate_trade_resolution()
```

It checks future candles in this order:

1. Gap-open exit.
2. Intrabar target/stop-loss hit.
3. Time expiry if neither target nor stop is hit.

#### Gap-open exits

Function:

```text
resolve_gap_exit()
```

BUY:

- open <= stop-loss: stop-loss gap.
- open >= target: take-profit gap.

SELL:

- open >= stop-loss: stop-loss gap.
- open <= target: take-profit gap.

#### Intrabar exits

Function:

```text
resolve_intrabar_exit()
```

BUY:

- high >= target means target hit.
- low <= stop means stop hit.

SELL:

- low <= target means target hit.
- high >= stop means stop hit.

If both target and stop are hit inside the same candle:

- `conservative`: assumes stop-loss happened first.
- `optimistic`: assumes take-profit happened first.

#### Time expiry

If no target or stop is hit within `resolutionCandles`, the trade exits at the close price of the expiry candle.

### 12.7 Backtest Performance Calculation

Performance function:

```text
calculate_futures_performance()
```

For BUY:

- directional return follows market price change.

For SELL:

- directional return is the inverse of market price change.

Then:

```text
leveragedReturnPct = directionalReturnPct * leverage
```

Net return:

```text
netReturnPct = leveragedReturnPct - feeImpactPct - slippageImpactPct
```

Where:

```text
feeImpactPct = feesPerTradePct * leverage
slippageImpactPct = slippagePct * leverage
```

The result is capped at a minimum of `-100%`.

Position calculations:

- `tradeAmountUsd`: configured capital per trade.
- `positionNotionalUsd`: trade amount multiplied by leverage.
- `pnlUsd`: trade amount multiplied by net return percentage.

### 12.8 Backtest Summary Metrics

Summary is built in:

```text
build_aggregate_summary()
build_equity_metrics()
```

Returned metrics include:

- total signals.
- wins.
- losses.
- neutrals.
- win rate.
- loss rate.
- neutral rate.
- average return percentage.
- average underlying market move.
- average leverage.
- average confidence.
- average holding candles.
- total PnL in USD.
- average PnL in USD.
- best trade PnL.
- worst trade PnL.
- grouped performance by signal type.
- grouped performance by outcome.
- grouped performance by exit reason.
- total return percentage.
- max drawdown percentage.
- profit factor.
- Sharpe ratio.
- Calmar ratio.
- win/loss ratio.
- equity curve.

### 12.9 Stored Backtest Shape

Backtest runs are stored in `BacktestRun`:

- `symbol`
- `market_type`
- `config`
- `dataset`
- `summary`
- `recent_trades`
- `trades`
- `created_at`

The JSONB fields allow the full simulation result to be saved without needing many separate relational tables.

## 13. AI/ML Model Feature

The Python backend now contains the ML service natively. Instead of calling a separate FastAPI ML microservice, signal generation and backtesting can call Python ML modules directly.

### 13.1 AI/ML Files

| File | Purpose |
|---|---|
| `backend_py/app/ml/feature_builder.py` | Builds feature snapshots from OHLCV candles. |
| `backend_py/app/ml/feature_schema.py` | Defines all supported flattened ML feature columns. |
| `backend_py/app/ml/training.py` | Trains the XGBoost + Lorentzian KNN ensemble. |
| `backend_py/app/ml/lorentzian_model.py` | Builds KNN classifier with Lorentzian distance. |
| `backend_py/app/ml/model_store.py` | Saves, loads, activates, and lists model artifacts. |
| `backend_py/app/ml/dataset_service.py` | Exports resolved signal data to training CSV. |
| `backend_py/app/services/ml_feature_service.py` | Service wrapper around native feature builder. |
| `backend_py/app/services/ml_inference_service.py` | Runs prediction from active model bundle. |
| `backend_py/app/tasks/ml_retraining.py` | Scheduled dataset export and model retraining. |
| `backend_py/app/routes/ai.py` | AI chat route and placeholder ML health/lifecycle routes. |
| `backend_py/app/services/ai_service.py` | OpenRouter chat integration. |

### 13.2 Feature Engineering

Main function:

```text
build_feature_snapshot()
```

File:

```text
backend_py/app/ml/feature_builder.py
```

Input:

- list of OHLCV candles.

Minimum:

- at least 26 candles.

Output:

- nested feature snapshot.
- `featureVersion = v4_lorentzian`.
- generated timestamp.
- `source = native_mixed` because the snapshot combines `pandas_ta` outputs with custom derived, structural, candle, kernel, and Lorentzian features.

The feature builder normalizes candles into a pandas DataFrame, converts OHLCV columns to numeric values, computes indicators with `pandas_ta`, calculates custom structural features, calculates kernel regression values, and calculates Lorentzian nearest-neighbor pattern features.

### 13.3 Feature Schema

File:

```text
backend_py/app/ml/feature_schema.py
```

`FEATURE_COLUMNS` is the authoritative list used by:

- dataset export.
- training feature selection.
- inference DataFrame creation.

The schema uses dotted names like:

```text
momentum.rsi14
trend.ema20
volatility.atr14
volume.relativeVolume
structure.nearestFvgBias
candle.bodyPct
context.marketRegime
lorentzian.bullishNeighborPct
```

Important note:

- The schema is flattened.
- The live feature snapshot is nested.
- Current inference uses direct dictionary lookup by dotted column names.
- If the feature snapshot is not flattened before inference, missing dotted values default to `0` in `_prepare_feature_frame()`.
- That means future improvement should ensure nested features are flattened consistently before model inference and training.

### 13.4 ML Inference

Main function:

```text
get_ml_prediction()
```

File:

```text
backend_py/app/services/ml_inference_service.py
```

How it works:

1. Loads active or requested model bundle using `load_bundle()`.
2. If no active model exists, returns `None`.
3. Builds a one-row pandas DataFrame using model feature columns.
4. Missing feature values default to `0`.
5. Applies the saved imputer.
6. Runs XGBoost `predict_proba()`.
7. If a Lorentzian KNN model exists, runs KNN `predict_proba()`.
8. Blends model probabilities using ensemble weights.
9. If a calibrator exists, applies Platt scaling.
10. Returns:
    - calibrated probability.
    - raw probability.
    - model version.
    - feature version.
    - model metrics.
    - promotion metadata.
    - ensemble details.

Default ensemble logic:

- XGBoost only: `xgboost = 1.0`
- XGBoost + Lorentzian KNN:
  - `xgboost = 0.65`
  - `lorentzian_knn = 0.35`

### 13.5 ML Training

Main function:

```text
train_model()
```

File:

```text
backend_py/app/ml/training.py
```

Training flow:

1. Load CSV or JSON training dataset.
2. Validate that a `label` column exists.
3. Sort chronologically by `resolvedAt` or `createdAt`.
4. Select available columns from `FEATURE_COLUMNS`.
5. Convert labels to integers.
6. Validate dataset size and class balance:
   - at least 60 rows.
   - both WIN and LOSS classes.
   - at least 10 samples per class.
7. Split chronologically into:
   - train.
   - calibration.
   - holdout test.
8. Impute missing values with `0`.
9. Train an XGBoost binary classifier.
10. Fit Platt-scaling logistic regression on calibration probabilities.
11. Evaluate calibrated probabilities on holdout test set.
12. Run walk-forward evaluation using `TimeSeriesSplit`.
13. Try to train Lorentzian KNN as an ensemble member.
14. Evaluate promotion eligibility.
15. Build model bundle and metadata.

XGBoost configuration:

- `n_estimators = 250`
- `max_depth = 5`
- `learning_rate = 0.05`
- `subsample = 0.9`
- `colsample_bytree = 0.9`
- objective: binary logistic
- eval metric: log loss
- class imbalance handled using `scale_pos_weight`

### 13.6 Calibration

Calibration functions:

- `fit_calibrator()`
- `apply_calibrator()`

How it works:

- The base model produces raw probabilities.
- Logistic regression is trained on calibration split probabilities.
- This is Platt scaling.
- The calibrated output should behave more like a real probability than raw model confidence.

### 13.7 Walk-Forward Metrics

Function:

```text
build_walk_forward_metrics()
```

How it works:

- Uses up to 5 chronological folds.
- Each fold splits past data into train and calibration.
- The future fold is used as test data.
- Metrics are aggregated across folds.

Tracked metrics:

- ROC AUC.
- PR AUC.
- log loss.
- Brier score.
- positive rate.
- predicted positive rate at 60%.

### 13.8 Promotion Eligibility

Function:

```text
evaluate_promotion_eligibility()
```

Promotion checks use settings:

- minimum dataset rows.
- minimum holdout ROC AUC.
- minimum walk-forward ROC AUC.
- maximum Brier score.
- enough completed walk-forward folds.

If a model passes:

- it is eligible to become active.

If it fails:

- metadata stores failure reasons.
- the model can still be saved, but scheduled retraining only activates eligible models.

### 13.9 Model Store

File:

```text
backend_py/app/ml/model_store.py
```

Main functions:

| Function | Purpose |
|---|---|
| `save_bundle()` | Save model bundle and metadata as `.joblib` files. |
| `load_bundle()` | Load active or requested model. |
| `activate_model()` | Set a model version as active. |
| `list_models()` | Return registry metadata. |
| `save_latest_training()` | Save latest training record. |
| `load_latest_training()` | Load latest training record. |

Expected artifact location:

```text
backend_py/app/ml/artifacts/
  registry.json
  latest_training.json
  models/
    {modelVersion}.joblib
    {modelVersion}.meta.joblib
```

Current repository note:

- The old Node/ML-service artifacts are under `backend/ml_service/artifacts`.
- The new Python backend expects artifacts under `backend_py/app/ml/artifacts`.
- If no active registry/model exists in the new path, ML inference returns `None`.

### 13.10 Training Dataset Export

File:

```text
backend_py/app/ml/dataset_service.py
```

Function:

```text
export_training_dataset()
```

How it works:

1. Queries completed `Signal` records.
2. Uses only signals with:
   - `status = COMPLETED`
   - `outcome` in `WIN`, `LOSS`
   - non-empty `features`
3. Requires at least `min_signals`, default `60`.
4. Flattens fields:
   - signal id.
   - symbol.
   - timeframe.
   - signal type.
   - outcome.
   - created/resolved times.
   - label: `1` for WIN, `0` for LOSS.
5. Adds every column from `FEATURE_COLUMNS`.
6. Saves CSV to:

```text
backend_py/app/ml/data/training-data.csv
```

Current implementation note:

- `DATASET_PATH` points to `backend_py/app/ml/data/training-data.csv`.
- The directory is created automatically before saving.

### 13.11 Scheduled ML Retraining

Related files:

- `backend_py/app/tasks/ml_retraining.py`
- `backend_py/app/main.py`

How it works:

1. APScheduler calls `retrain_ml_model()` every `ml_retrain_interval_hours`.
2. It exports a fresh training dataset from resolved signals.
3. If not enough signals exist, retraining is skipped.
4. It trains an XGBoost + Lorentzian KNN model.
5. It checks promotion eligibility.
6. It saves the model bundle and metadata.
7. It activates the model only if eligible.

## 14. Background Task Feature

Related files:

- `backend_py/app/main.py`
- `backend_py/app/tasks/signal_resolution.py`
- `backend_py/app/tasks/ml_retraining.py`

Scheduled jobs:

| Job | Default interval | Purpose |
|---|---:|---|
| `signal_resolution` | 5 minutes | Resolve pending signals by TP/SL. |
| `ml_retraining` | 24 hours | Export dataset and train a new model. |

How it works:

- `AsyncIOScheduler` is created in `main.py`.
- Jobs are added during app lifespan startup.
- Scheduler is stopped during shutdown.

## 15. Utility Services

### 15.1 Indicator Service

Related file:

```text
backend_py/app/services/indicator_service.py
```

Purpose:

- Small helper service for direct RSI and MACD calculations.
- Uses `pandas_ta`.
- Not currently exposed as an API route in the Python backend.

### 15.2 News Service

Related file:

```text
backend_py/app/services/news_service.py
```

Purpose:

- Placeholder crypto news service.
- Currently returns a simple local placeholder result.
- Can later be connected to CryptoPanic, NewsAPI, or another provider.

### 15.3 Helpers

Related file:

```text
backend_py/app/utils/helpers.py
```

Purpose:

- Shared numeric parsing.
- Bounds checks.
- rounding.
- timeframe conversions.
- direction/outcome helpers.
- leverage normalization.

## 16. API Router Summary

Routers are registered in:

```text
backend_py/app/main.py
```

| Router file | Prefix | Feature |
|---|---|---|
| `routes/auth.py` | `/api/auth` | Auth and profile. |
| `routes/market.py` | `/api/market` | Price, klines, overview, symbols. |
| `routes/signal.py` | `/api/signals` | Signal generation, listing, stats, resolution. |
| `routes/ai.py` | `/api/ai` | AI chat and placeholder ML status. |
| `routes/portfolio.py` | `/api/portfolio` | Portfolio and holdings. |
| `routes/watchlist.py` | `/api/watchlist` | Watchlist management. |
| `routes/backtest.py` | `/api/backtest` | Backtest execution and history. |

## 17. Request/Response Schema Summary

Schema files:

```text
backend_py/app/schemas/
```

| Schema file | Purpose |
|---|---|
| `auth.py` | Register, login, user response, token response. |
| `market.py` | Ticker and market overview models. |
| `signal.py` | Signal generation, resolution, signal responses. |
| `backtest.py` | Backtest request and saved-run responses. |
| `ai.py` | AI chat messages and response. |
| `portfolio.py` | Holding and portfolio responses. |
| `watchlist.py` | Watchlist asset and watchlist responses. |

## 18. Tests

Related files:

- `backend_py/tests/test_signal_engine.py`
- `backend_py/tests/test_auth.py`

What is tested:

- Signal helper clamp behavior.
- Regime weight behavior.
- Regime target/stop multipliers.
- RSI-based rule direction behavior.
- Basic FastAPI health endpoint.
- Auth validation failures.

Current test note:

- `test_auth.py` checks `/api/auth/me`, but the Python route currently exposes `/api/auth/profile`. That test may need updating if the Python backend is the source of truth.

## 19. Current Port Status and Known Gaps

The Python backend is functional for the main flows, but some areas are still simplified or placeholder-level.

Current strong areas:

- FastAPI app structure is complete.
- Auth works with JWT and PostgreSQL users.
- Market data works through Binance.
- Watchlist and portfolio CRUD are implemented.
- Signal generation uses native Python feature engineering.
- Backtesting supports intrabar TP/SL, gap opens, time expiry, fees, slippage, leverage, equity curve, and saved runs.
- ML training and inference modules exist inside the Python backend.
- Socket.IO live price streaming is implemented.

Current limitations:

- AI ML lifecycle and health endpoints return placeholder data.
- Signal ML summary endpoint returns placeholder data.
- Auto-resolution checks only the latest candle instead of the full candle range since signal creation.
- Live signal generation fetches order-flow bias but does not yet apply it to scoring.
- Backtest historical signal generation intentionally skips MTF and order-flow to avoid requiring historical versions of those datasets.
- New Python ML artifact directory may not contain an active model until retraining or artifact migration is done.
- Feature snapshot is nested while inference expects flattened dotted feature columns, so flattening consistency should be reviewed.
- There is no public Python API route yet for manually training, listing, or activating ML models, even though the service functions exist.

## 20. Practical Flow Summary

### Live Signal Flow

```text
Frontend
  -> POST /api/signals/generate
  -> routes/signal.py
  -> services/signal_service.py
  -> services/market_service.py fetches candles
  -> services/ml_feature_service.py
  -> ml/feature_builder.py
  -> evaluate_signal_rules()
  -> services/mtf_service.py
  -> services/order_flow_service.py
  -> services/ml_inference_service.py
  -> save Signal in PostgreSQL
  -> return signal to frontend
```

### Backtest Flow

```text
Frontend
  -> POST /api/backtest
  -> routes/backtest.py
  -> services/backtest_service.py
  -> services/market_service.py fetches historical candles
  -> rolling windows call generate_signal_from_klines()
  -> simulate target/stop/time-expiry exits
  -> calculate futures performance and summary metrics
  -> save BacktestRun in PostgreSQL
  -> return saved run to frontend
```

### ML Training Flow

```text
APScheduler
  -> tasks/ml_retraining.py
  -> ml/dataset_service.py exports resolved signals
  -> ml/training.py trains XGBoost + Lorentzian KNN
  -> ml/training.py evaluates promotion metrics
  -> ml/model_store.py saves artifacts
  -> eligible model becomes active
```

### ML Inference Flow

```text
Signal or backtest
  -> services/ml_inference_service.py
  -> ml/model_store.py loads active bundle
  -> feature row is prepared
  -> imputer transforms features
  -> XGBoost predicts probability
  -> optional Lorentzian KNN predicts probability
  -> optional Platt calibrator adjusts probability
  -> probability becomes signal guardrail and confidence input
```
