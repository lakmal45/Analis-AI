import axios from "axios";
import NodeCache from "node-cache";

// Initialize cache with standard TTL of 10 seconds, check period of 15 seconds
const cache = new NodeCache({ stdTTL: 10, checkperiod: 15 });

const BINANCE_BASE_URL = "https://api.binance.com/api/v3";

// Get current price for a symbol
const getPrice = async (symbol) => {
  const cacheKey = `price_${symbol.toUpperCase()}`;
  const cachedData = cache.get(cacheKey);
  if (cachedData) return cachedData;

  try {
    const response = await axios.get(`${BINANCE_BASE_URL}/ticker/price`, {
      params: { symbol: symbol.toUpperCase() },
    });
    cache.set(cacheKey, response.data);
    return response.data;
  } catch (error) {
    console.error(`Error fetching price for ${symbol}:`, error.message);
    throw error;
  }
};

// Get 24h ticker data
const get24hTicker = async (symbol) => {
  const cacheKey = `ticker_${symbol.toUpperCase()}`;
  const cachedData = cache.get(cacheKey);
  if (cachedData) return cachedData;

  try {
    const response = await axios.get(`${BINANCE_BASE_URL}/ticker/24hr`, {
      params: { symbol: symbol.toUpperCase() },
    });
    cache.set(cacheKey, response.data);
    return response.data;
  } catch (error) {
    console.error(`Error fetching 24h ticker for ${symbol}:`, error.message);
    throw error;
  }
};

// Get candlestick/kline data
const getKlines = async (symbol, interval = "1h", limit = 100) => {
  const cacheKey = `klines_${symbol.toUpperCase()}_${interval}_${limit}`;
  const cachedData = cache.get(cacheKey);
  if (cachedData) return cachedData;

  try {
    const response = await axios.get(`${BINANCE_BASE_URL}/klines`, {
      params: {
        symbol: symbol.toUpperCase(),
        interval,
        limit,
      },
    });

    // Transform data for easier consumption
    const formattedData = response.data.map((kline) => ({
      openTime: kline[0],
      open: parseFloat(kline[1]),
      high: parseFloat(kline[2]),
      low: parseFloat(kline[3]),
      close: parseFloat(kline[4]),
      volume: parseFloat(kline[5]),
      closeTime: kline[6],
      quoteVolume: parseFloat(kline[7]),
    }));

    cache.set(cacheKey, formattedData, 60); // 60 seconds TTL for klines
    return formattedData;
  } catch (error) {
    console.error(`Error fetching klines for ${symbol}:`, error.message);
    throw error;
  }
};

// Get multiple prices at once
const getMultiplePrices = async (symbols) => {
  const cacheKey = `multi_prices_${symbols.sort().join("_")}`;
  const cachedData = cache.get(cacheKey);
  if (cachedData) return cachedData;

  try {
    const response = await axios.get(`${BINANCE_BASE_URL}/ticker/price`);
    const prices = response.data.filter((ticker) =>
      symbols.some((s) => s.toUpperCase() === ticker.symbol),
    );
    cache.set(cacheKey, prices);
    return prices;
  } catch (error) {
    console.error("Error fetching multiple prices:", error.message);
    throw error;
  }
};

// Get market overview (top cryptocurrencies)
const getMarketOverview = async () => {
  const cacheKey = `market_overview`;
  const cachedData = cache.get(cacheKey);
  if (cachedData) return cachedData;

  try {
    const symbols = ["BTCUSDT", "ETHUSDT", "BNBUSDT", "XRPUSDT", "SOLUSDT"];

    // Fetch only the symbols we need instead of ALL tickers
    const tickerData = await Promise.all(
      symbols.map(async (symbol) => {
        try {
          const response = await axios.get(
            `${BINANCE_BASE_URL}/ticker/24hr`,
            { params: { symbol } },
          );
          return response.data;
        } catch (error) {
          console.error(`Error fetching ticker for ${symbol}:`, error.message);
          return null;
        }
      }),
    );

    const formattedOverview = tickerData
      .filter((ticker) => ticker !== null)
      .map((ticker) => ({
        symbol: ticker.symbol,
        price: parseFloat(ticker.lastPrice),
        change24h: parseFloat(ticker.priceChangePercent),
        volume24h: parseFloat(ticker.volume),
        high24h: parseFloat(ticker.highPrice),
        low24h: parseFloat(ticker.lowPrice),
      }));

    cache.set(cacheKey, formattedOverview, 30); // 30 seconds TTL for overview
    return formattedOverview;
  } catch (error) {
    console.error("Error fetching market overview:", error.message);
    throw error;
  }
};

// Named exports for marketRoutes.js
export {
  getPrice,
  get24hTicker,
  getKlines,
  getMultiplePrices,
  getMarketOverview,
};

// Default export object
const marketService = {
  getPrice,
  get24hTicker,
  getKlines,
  getMultiplePrices,
  getMarketOverview,
};

export default marketService;
