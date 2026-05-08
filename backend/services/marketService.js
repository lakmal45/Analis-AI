import axios from "axios";

const BINANCE_BASE_URL = "https://api.binance.com/api/v3";

// Get current price for a symbol
const getPrice = async (symbol) => {
  try {
    const response = await axios.get(`${BINANCE_BASE_URL}/ticker/price`, {
      params: { symbol: symbol.toUpperCase() },
    });
    return response.data;
  } catch (error) {
    console.error(`Error fetching price for ${symbol}:`, error.message);
    throw error;
  }
};

// Get 24h ticker data
const get24hTicker = async (symbol) => {
  try {
    const response = await axios.get(`${BINANCE_BASE_URL}/ticker/24hr`, {
      params: { symbol: symbol.toUpperCase() },
    });
    return response.data;
  } catch (error) {
    console.error(`Error fetching 24h ticker for ${symbol}:`, error.message);
    throw error;
  }
};

// Get candlestick/kline data
const getKlines = async (symbol, interval = "1h", limit = 100) => {
  try {
    const response = await axios.get(`${BINANCE_BASE_URL}/klines`, {
      params: {
        symbol: symbol.toUpperCase(),
        interval,
        limit,
      },
    });

    // Transform data for easier consumption
    return response.data.map((kline) => ({
      openTime: kline[0],
      open: parseFloat(kline[1]),
      high: parseFloat(kline[2]),
      low: parseFloat(kline[3]),
      close: parseFloat(kline[4]),
      volume: parseFloat(kline[5]),
      closeTime: kline[6],
      quoteVolume: parseFloat(kline[7]),
    }));
  } catch (error) {
    console.error(`Error fetching klines for ${symbol}:`, error.message);
    throw error;
  }
};

// Get multiple prices at once
const getMultiplePrices = async (symbols) => {
  try {
    const response = await axios.get(`${BINANCE_BASE_URL}/ticker/price`);
    const prices = response.data.filter((ticker) =>
      symbols.some((s) => s.toUpperCase() === ticker.symbol),
    );
    return prices;
  } catch (error) {
    console.error("Error fetching multiple prices:", error.message);
    throw error;
  }
};

// Get market overview (top cryptocurrencies)
const getMarketOverview = async () => {
  try {
    const symbols = ["BTCUSDT", "ETHUSDT", "BNBUSDT", "XRPUSDT", "SOLUSDT"];
    const response = await axios.get(`${BINANCE_BASE_URL}/ticker/24hr`);

    return response.data
      .filter((ticker) => symbols.includes(ticker.symbol))
      .map((ticker) => ({
        symbol: ticker.symbol,
        price: parseFloat(ticker.lastPrice),
        change24h: parseFloat(ticker.priceChangePercent),
        volume24h: parseFloat(ticker.volume),
        high24h: parseFloat(ticker.highPrice),
        low24h: parseFloat(ticker.lowPrice),
      }));
  } catch (error) {
    console.error("Error fetching market overview:", error.message);
    throw error;
  }
};

export {
  getPrice,
  get24hTicker,
  getKlines,
  getMultiplePrices,
  getMarketOverview,
};
