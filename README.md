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
