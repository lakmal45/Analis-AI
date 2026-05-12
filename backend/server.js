import "dotenv/config.js";
import express from "express";
import cors from "cors";
import http from "http";
import { Server } from "socket.io";
import rateLimit from "express-rate-limit";
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
app.use(
  cors({
    origin: process.env.FRONTEND_URL || "http://localhost:5173",
    credentials: true,
  }),
);
app.use(express.json());

// Rate limiting - general API limiter
const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 200, // limit each IP to 200 requests per windowMs
  message: { message: "Too many requests, please try again later." },
  standardHeaders: true,
  legacyHeaders: false,
});

// Stricter rate limit for auth routes
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 20, // limit each IP to 20 auth attempts per windowMs
  message: { message: "Too many login attempts, please try again later." },
  standardHeaders: true,
  legacyHeaders: false,
});

// Stricter rate limit for AI routes (to protect API credits)
const aiLimiter = rateLimit({
  windowMs: 1 * 60 * 1000, // 1 minute
  max: 10, // limit each IP to 10 AI requests per minute
  message: { message: "Too many AI requests, please try again later." },
  standardHeaders: true,
  legacyHeaders: false,
});

// Apply general rate limit to all API routes
app.use("/api", apiLimiter);

// Routes
import authRoutes from "./routes/authRoutes.js";
import marketRoutes from "./routes/marketRoutes.js";
import indicatorRoutes from "./routes/indicatorRoutes.js";
import aiRoutes from "./routes/aiRoutes.js";
import watchlistRoutes from "./routes/watchlistRoutes.js";
import signalRoutes from "./routes/signalRoutes.js";
import portfolioRoutes from "./routes/portfolioRoutes.js";

app.use("/api/auth", authLimiter, authRoutes);
app.use("/api/market", marketRoutes);
app.use("/api/indicators", indicatorRoutes);
app.use("/api/ai", aiLimiter, aiRoutes);
app.use("/api/watchlist", watchlistRoutes);
app.use("/api/signals", signalRoutes);
app.use("/api/portfolio", portfolioRoutes);

// Basic route
app.get("/", (req, res) => {
  res.send("AnalisAI API is running...");
});

// Socket.IO connection
io.on("connection", (socket) => {
  console.log("New client connected:", socket.id);
  socket.data.subscribedSymbols = new Set();

  // Subscribe to symbol updates
  socket.on("subscribe-ticker", (symbol) => {
    console.log(`Client ${socket.id} subscribing to ${symbol}`);
    socket.join(`ticker-${symbol.toLowerCase()}`);
    socket.data.subscribedSymbols.add(symbol.toLowerCase());

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
    socket.data.subscribedSymbols.delete(symbol.toLowerCase());
    binanceWS.unsubscribeFromSymbol(symbol);
  });

  // Subscribe to multiple tickers (for watchlist)
  socket.on("subscribe-watchlist", (symbols) => {
    console.log(`Client ${socket.id} subscribing to watchlist:`, symbols);
    symbols.forEach((symbol) => {
      socket.join(`ticker-${symbol.toLowerCase()}`);
      socket.data.subscribedSymbols.add(symbol.toLowerCase());
      binanceWS.subscribeToSymbol(symbol, io);
    });
  });

  socket.on("disconnect", () => {
    for (const symbol of socket.data.subscribedSymbols) {
      binanceWS.unsubscribeFromSymbol(symbol);
    }
    console.log("Client disconnected:", socket.id);
  });
});

// Make io accessible to routes
app.set("io", io);

// Import signal generator
import {
  startSignalGenerator,
  stopSignalGenerator,
} from "./services/signalGenerator.js";
import {
  startSignalResolutionJob,
  stopSignalResolutionJob,
} from "./services/signalService.js";

// Global error handler middleware
app.use((err, req, res, next) => {
  console.error("Unhandled error:", err.stack);
  res.status(err.status || 500).json({
    success: false,
    message:
      process.env.NODE_ENV === "production"
        ? "Internal server error"
        : err.message,
    ...(process.env.NODE_ENV !== "production" && { stack: err.stack }),
  });
});

// Start server
const PORT = process.env.PORT || 5000;
server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);

  // Start AI signal generator (runs every 60 minutes to save API costs)
  startSignalGenerator(60);
  startSignalResolutionJob(5);
});

// Handle graceful shutdown
process.on("SIGTERM", () => {
  console.log("SIGTERM signal received: closing HTTP server");
  stopSignalGenerator();
  stopSignalResolutionJob();
  binanceWS.closeAll();
  server.close(() => {
    console.log("HTTP server closed");
  });
});

process.on("SIGINT", () => {
  console.log("SIGINT signal received: closing HTTP server");
  stopSignalGenerator();
  stopSignalResolutionJob();
  binanceWS.closeAll();
  server.close(() => {
    console.log("HTTP server closed");
    process.exit(0);
  });
});
