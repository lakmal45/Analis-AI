# AnalisAI

AnalisAI is a full-stack crypto market analysis app with:

- Express + MongoDB backend
- React + Vite frontend
- Binance market data and websocket streaming
- AI-assisted market analysis and chat
- Watchlist, signals, and portfolio tracking

## Project Structure

```text
backend/   Express API, Mongo models, services, realtime server
frontend/  React client application
```

## Backend Environment

Create `backend/.env` with:

```env
PORT=5000
MONGO_URI=your_mongodb_connection_string
JWT_SECRET=your_jwt_secret
FRONTEND_URL=http://localhost:5173
OPENROUTER_API_KEY=your_openrouter_api_key
```

## Frontend Environment

Create `frontend/.env` with:

```env
VITE_API_URL=http://localhost:5000
```

## Run Locally

Backend:

```bash
cd backend
npm install
npm run dev
```

Frontend:

```bash
cd frontend
npm install
npm run dev
```

## Scripts

Backend:

```bash
npm run dev
npm start
npm test
```

Frontend:

```bash
npm run dev
npm run build
npm run lint
```

## Current Product Areas

- Authentication and profile management
- Market overview and technical indicators
- AI-generated analysis
- Signal management
- Watchlist management
- Portfolio tracking
- Realtime price updates via Socket.IO

## Futures Signals

The futures signal feature is designed to help users turn market data into clear trade ideas for Binance USDT perpetual contracts. From the Signals page, users can select a symbol from their watchlist, choose a leverage value, and generate a structured futures signal that is saved and tracked inside the platform.

Each signal includes:

- Signal type: `BUY`, `SELL`, or `HOLD`
- Confidence score
- Expected direction: `UP`, `DOWN`, or `NEUTRAL`
- Leverage
- Entry price, live price, target, and stop-loss
- Technical indicator snapshot
- Human-readable reasoning
- Lifecycle data such as status, outcome, and resolution details

The main user-facing flow is built around rule-based technical analysis. When a signal is generated, the backend evaluates recent futures candles using:

- RSI (14)
- MACD (12, 26, 9)
- EMA (20)
- SMA (20)
- ATR (14) for target and stop-loss estimation

The current logic looks for momentum and reversal conditions:

- `BUY` signals are produced when the market appears oversold or when MACD confirms bullish momentum.
- `SELL` signals are produced when the market appears overbought or when MACD confirms bearish momentum.
- `HOLD` is returned when the setup is not clear enough to justify a directional trade.

Signals start as active records and can later be resolved manually or automatically. Once resolved, the system compares the entry price with a later market price, determines whether the call was directionally correct, and classifies the result as:

- `WIN`
- `LOSS`
- `NEUTRAL`
- `CANCELLED`

Performance is tracked using futures-style leveraged return calculations, so the platform can report not only whether a signal was correct, but also how large the move was after leverage is applied.

Signals are generated on demand and then validated by the rule engine plus the ML layer before they are saved. Accuracy guardrails can downgrade weak directional setups to `HOLD` when the setup or model quality is not strong enough.

## Futures Backtesting

The futures backtesting feature is the validation layer for the signal engine. It allows users to replay historical futures candles and measure how the current signal-generation rules would have performed over time.

From the Backtesting tab, users can configure:

- Symbol
- Timeframe
- Number of historical candles to fetch
- Analysis window size
- Resolution horizon in candles
- Leverage
- Number of sample trades to display

When a backtest runs, the system:

1. Fetches historical Binance futures candles for the selected market.
2. Walks through the dataset candle by candle.
3. Uses a rolling analysis window to generate signals from past data only.
4. Skips `HOLD` signals and keeps directional `BUY` and `SELL` setups.
5. Resolves each simulated trade using the candle close at the configured future horizon.
6. Calculates the outcome and leveraged return for every simulated trade.
7. Builds a summary of historical performance.

The backtest result includes:

- Configuration used for the run
- Dataset coverage and candle range
- Number of evaluated setups
- Number of skipped `HOLD` signals
- Win/loss/neutral breakdown
- Average leveraged return
- Average confidence and leverage
- Per-signal-type summary
- A sample of recent simulated trades

This makes the feature useful for quickly answering questions like:

- How often does the current signal logic produce directional trades?
- How often are those trades correct at a given timeframe?
- Does changing leverage materially affect the simulated return profile?
- How many neutral setups are being filtered out?

The current backtest is intentionally lightweight and signal-focused. It measures directional quality and leveraged outcome at a fixed future candle, but it is not a full execution simulator. It does not currently model trading fees, slippage, funding, liquidation, or intrabar target/stop-loss behavior. That means it is best used as a strategy research and signal-validation tool rather than a complete real-world profitability simulator.
