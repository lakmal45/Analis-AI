require("dotenv").config();
const express = require("express");
const cors = require("cors");
const connectDB = require("./config/dbConnection");

const app = express();
app.use(cors());
app.use(express.json());

const authRoutes = require('./routes/auth');
app.use('/api/auth', authRoutes);

const aiRoutes = require('./routes/ai');
app.use('/api/ai', aiRoutes);

const chatRoutes = require('./routes/chat');
app.use('/api/chat', chatRoutes);

const watchlistRoutes = require('./routes/watchlist');
app.use('/api/watchlist', watchlistRoutes);

const signalsRoutes = require('./routes/signals');
app.use('/api/signals', signalsRoutes);

app.get("/api/ping", (req, res) => res.json({ message: "pong" }));

const PORT = process.env.PORT || 4000;

const http = require('http');
const { Server } = require('socket.io');

const start = async () => {
  try {
    await connectDB();
  } catch (err) {
    console.error("DB connection error:", err);
  }

  const server = http.createServer(app);
  const io = new Server(server, { cors: { origin: '*' } });

  require('./controllers/priceSocket')(io);

  server.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
  });
};

start();
