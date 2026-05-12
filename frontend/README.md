# AnalisAI Frontend

## Stack

- React 19
- Vite
- React Router
- Tailwind CSS
- Socket.IO client

## Main Features

- Authenticated dashboard under `/app/*`
- Live market analysis screens
- Watchlist with realtime ticker updates
- Signal browsing and manual signal generation
- Portfolio tracking
- AI chat and AI market analysis

## Environment

Create a `.env` file in the frontend directory:

```env
VITE_API_URL=http://localhost:5000
```

## Scripts

```bash
npm run dev
npm run build
npm run lint
npm run preview
```

## Notes

- The frontend expects the backend API to expose routes under `/api`.
- Protected pages live under `/app/dashboard`, `/app/analysis`, `/app/watchlist`, `/app/signals`, `/app/chat`, `/app/settings`, and `/app/profile`.
