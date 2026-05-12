import WebSocket from "ws";

class BinanceWebSocket {
  constructor() {
    this.connections = new Map(); // symbol -> ws connection
    this.subscribers = new Map(); // symbol -> subscriber count
    this.priceData = new Map(); // symbol -> latest price data
    this.manualClosures = new Set();
  }

  // Subscribe to a symbol's ticker data
  subscribeToSymbol(symbol, io, options = {}) {
    const normalizedSymbol = symbol.toLowerCase();
    const { incrementSubscribers = true } = options;
    const subscriberCount = this.subscribers.get(normalizedSymbol) || 0;
    if (incrementSubscribers) {
      this.subscribers.set(normalizedSymbol, subscriberCount + 1);
    }
    this.manualClosures.delete(normalizedSymbol);

    // If already subscribed, just add to subscribers
    if (this.connections.has(normalizedSymbol)) {
      console.log(`Already subscribed to ${symbol}, adding subscriber`);
      return;
    }

    const wsUrl = `wss://stream.binance.com:9443/ws/${normalizedSymbol}@ticker`;
    console.log(`Connecting to Binance WebSocket: ${wsUrl}`);

    const ws = new WebSocket(wsUrl);

    ws.on("open", () => {
      console.log(`WebSocket connected for ${symbol}`);
    });

    ws.on("message", (data) => {
      try {
        const ticker = JSON.parse(data);
        const priceData = {
          symbol: ticker.s,
          price: parseFloat(ticker.c), // Current price
          priceChange: parseFloat(ticker.p), // Price change
          priceChangePercent: parseFloat(ticker.P), // Price change percent
          high24h: parseFloat(ticker.h),
          low24h: parseFloat(ticker.l),
          volume24h: parseFloat(ticker.v),
          quoteVolume24h: parseFloat(ticker.q),
          openPrice: parseFloat(ticker.o),
          timestamp: Date.now(),
        };

        // Store latest data
        this.priceData.set(normalizedSymbol, priceData);

        // Broadcast to room subscribers only (not all clients)
        if (io) {
          io.to(`ticker-${normalizedSymbol}`).emit("price-update", priceData);
          io.to(`ticker-${normalizedSymbol}`).emit("ticker-update", priceData);
        }
      } catch (error) {
        console.error(`Error parsing WebSocket data for ${symbol}:`, error);
      }
    });

    ws.on("error", (error) => {
      console.error(`WebSocket error for ${symbol}:`, error);
    });

    ws.on("close", () => {
      console.log(`WebSocket disconnected for ${symbol}`);
      this.connections.delete(normalizedSymbol);

      // Attempt to reconnect after 5 seconds
      setTimeout(() => {
        if (
          !this.connections.has(normalizedSymbol) &&
          !this.manualClosures.has(normalizedSymbol) &&
          (this.subscribers.get(normalizedSymbol) || 0) > 0
        ) {
          console.log(`Attempting to reconnect to ${symbol}...`);
          this.subscribeToSymbol(symbol, io, { incrementSubscribers: false });
        }
      }, 5000);
    });

    this.connections.set(normalizedSymbol, ws);
  }

  // Unsubscribe from a symbol
  unsubscribeFromSymbol(symbol) {
    const normalizedSymbol = symbol.toLowerCase();
    const currentSubscribers = this.subscribers.get(normalizedSymbol) || 0;

    if (currentSubscribers > 1) {
      this.subscribers.set(normalizedSymbol, currentSubscribers - 1);
      return;
    }

    this.subscribers.delete(normalizedSymbol);
    this.manualClosures.add(normalizedSymbol);
    const ws = this.connections.get(normalizedSymbol);

    if (ws) {
      ws.close();
      this.connections.delete(normalizedSymbol);
      this.priceData.delete(normalizedSymbol);
      console.log(`Unsubscribed from ${symbol}`);
    }
  }

  // Get latest price data for a symbol
  getLatestPrice(symbol) {
    return this.priceData.get(symbol.toLowerCase());
  }

  // Get all latest prices
  getAllPrices() {
    return Array.from(this.priceData.values());
  }

  // Close all connections
  closeAll() {
    for (const [symbol, ws] of this.connections) {
      this.manualClosures.add(symbol);
      ws.close();
    }
    this.connections.clear();
    this.subscribers.clear();
    this.priceData.clear();
    console.log("All WebSocket connections closed");
  }
}

// Export singleton instance
const binanceWS = new BinanceWebSocket();
export default binanceWS;
