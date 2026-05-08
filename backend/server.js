import "dotenv/config.js";
import express from "express";
import cors from "cors";
import http from "http";
import { Server } from "socket.io";
import connectDB from "./config/db.js";
import binanceWS from "./services/binanceWS.js";

// Initialize app
const app = express();
const server = http.createServer(app);

// Initialize Socket.IO
const io = new Server(server, {
  cors: {
    origin: process.env.FRONTEND_URL || "http://localhost:5173",
    methods: ["GET", "POST"],
  },
});

// Connect to MongoDB
connectDB();

// Middleware
app.use(cors());
app.use(express.json());

// Routes
import authRoutes from "./routes/authRoutes.js";
import marketRoutes from "./routes/marketRoutes.js";
import indicatorRoutes from "./routes/indicatorRoutes.js";
import aiRoutes from "./routes/aiRoutes.js";
import watchlistRoutes from "./routes/watchlistRoutes.js";

app.use("/api/auth", authRoutes);
app.use("/api/market", marketRoutes);
app.use("/api/indicators", indicatorRoutes);
app.use("/api/ai", aiRoutes);
app.use("/api/watchlist", watchlistRoutes);

// Basic route
app.get("/", (req, res) => {
  res.send("AnalisAI API is running...");
});

// Socket.IO connection
io.on("connection", (socket) => {
  console.log("New client connected:", socket.id);

  // Subscribe to symbol updates
  socket.on("subscribe-ticker", (symbol) => {
    console.log(`Client ${socket.id} subscribing to ${symbol}`);
    socket.join(`ticker-${symbol.toLowerCase()}`);

    // Start Binance WebSocket for this symbol if not already started
    binanceWS.subscribeToSymbol(symbol, io);

    // Send latest data if available
    const latestData = binanceWS.getLatestPrice(symbol);
    if (latestData) {
      socket.emit("price-update", latestData);
    }
  });

  // Unsubscribe from symbol updates
  socket.on("unsubscribe-ticker", (symbol) => {
    console.log(`Client ${socket.id} unsubscribing from ${symbol}`);
    socket.leave(`ticker-${symbol.toLowerCase()}`);
  });

  // Subscribe to multiple tickers (for watchlist)
  socket.on("subscribe-watchlist", (symbols) => {
    console.log(`Client ${socket.id} subscribing to watchlist:`, symbols);
    symbols.forEach((symbol) => {
      socket.join(`ticker-${symbol.toLowerCase()}`);
      binanceWS.subscribeToSymbol(symbol, io);
    });
  });

  socket.on("disconnect", () => {
    console.log("Client disconnected:", socket.id);
  });
});

// Make io accessible to routes
app.set("io", io);

// Start server
const PORT = process.env.PORT || 5000;
server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});

// Handle graceful shutdown
process.on("SIGTERM", () => {
  console.log("SIGTERM signal received: closing HTTP server");
  binanceWS.closeAll();
  server.close(() => {
    console.log("HTTP server closed");
  });
});
