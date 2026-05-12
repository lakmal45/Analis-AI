import axios from "axios";
import NodeCache from "node-cache";

// Initialize cache with standard TTL of 10 seconds, check period of 15 seconds
const cache = new NodeCache({ stdTTL: 10, checkperiod: 15 });

const BINANCE_FUTURES_BASE_URL = "https://fapi.binance.com/fapi/v1";

const ensureArray = (value) => {
  if (Array.isArray(value)) {
    return value;
  }

  if (!value) {
    return [];
  }

  return [value];
};

const sanitizeSymbolInput = (value = "") =>
  value.toString().trim().toUpperCase().replace(/[^A-Z0-9]/g, "");

// Get a searchable list of active USDT perpetual futures symbols
const getSearchableSymbols = async () => {
  const cacheKey = "searchable_symbols";
  const cachedData = cache.get(cacheKey);
  if (cachedData) return cachedData;

  try {
    const response = await axios.get(`${BINANCE_FUTURES_BASE_URL}/exchangeInfo`);

    const symbols = (response.data.symbols || [])
      .filter(
        (item) =>
          item.status === "TRADING" &&
          item.contractType === "PERPETUAL" &&
          item.quoteAsset === "USDT",
      )
      .map((item) => ({
        symbol: item.symbol,
        baseAsset: item.baseAsset,
        quoteAsset: item.quoteAsset,
      }))
      .sort((a, b) => a.symbol.localeCompare(b.symbol));

    cache.set(cacheKey, symbols, 60 * 60);
    return symbols;
  } catch (error) {
    console.error("Error fetching searchable symbols:", error.message);
    throw error;
  }
};

const resolveToMarketSymbol = async (rawSymbol) => {
  const normalizedInput = sanitizeSymbolInput(rawSymbol);
  if (!normalizedInput) {
    return null;
  }

  const symbols = await getSearchableSymbols();
  const bySymbol = new Map(symbols.map((item) => [item.symbol, item.symbol]));
  const byBaseAsset = new Map(symbols.map((item) => [item.baseAsset, item.symbol]));

  if (bySymbol.has(normalizedInput)) {
    return bySymbol.get(normalizedInput);
  }

  if (byBaseAsset.has(normalizedInput)) {
    return byBaseAsset.get(normalizedInput);
  }

  const withUsdtSuffix = `${normalizedInput}USDT`;
  if (bySymbol.has(withUsdtSuffix)) {
    return bySymbol.get(withUsdtSuffix);
  }

  return null;
};

// Get current price for a symbol
const getPrice = async (symbol) => {
  const cacheKey = `price_${symbol.toUpperCase()}`;
  const cachedData = cache.get(cacheKey);
  if (cachedData) return cachedData;

  try {
    const response = await axios.get(`${BINANCE_FUTURES_BASE_URL}/ticker/price`, {
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
    const response = await axios.get(`${BINANCE_FUTURES_BASE_URL}/ticker/24hr`, {
      params: { symbol: symbol.toUpperCase() },
    });
    cache.set(cacheKey, response.data);
    return response.data;
  } catch (error) {
    console.error(`Error fetching 24h ticker for ${symbol}:`, error.message);
    throw error;
  }
};

// Get multiple 24h tickers at once
const getMultiple24hTickers = async (symbols) => {
  const normalizedSymbols = symbols.map((symbol) => symbol.toUpperCase()).sort();
  const cacheKey = `multi_tickers_${normalizedSymbols.join("_")}`;
  const cachedData = cache.get(cacheKey);
  if (cachedData) return cachedData;

  try {
    const response = await axios.get(`${BINANCE_FUTURES_BASE_URL}/ticker/24hr`, {
      params: {
        symbols: JSON.stringify(normalizedSymbols),
      },
    });

    const tickerData = ensureArray(response.data);

    cache.set(cacheKey, tickerData, 10);
    return tickerData;
  } catch (error) {
    console.error("Error fetching multiple 24h tickers:", error.message);
    throw error;
  }
};

// Get candlestick/kline data
const getKlines = async (symbol, interval = "1h", limit = 100) => {
  const cacheKey = `klines_${symbol.toUpperCase()}_${interval}_${limit}`;
  const cachedData = cache.get(cacheKey);
  if (cachedData) return cachedData;

  try {
    const response = await axios.get(`${BINANCE_FUTURES_BASE_URL}/klines`, {
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
  const normalizedSymbols = symbols.map((symbol) => symbol.toUpperCase()).sort();
  const cacheKey = `multi_prices_${normalizedSymbols.join("_")}`;
  const cachedData = cache.get(cacheKey);
  if (cachedData) return cachedData;

  try {
    const response = await axios.get(`${BINANCE_FUTURES_BASE_URL}/ticker/price`, {
      params: {
        symbols: JSON.stringify(normalizedSymbols),
      },
    });
    const priceData = ensureArray(response.data);
    cache.set(cacheKey, priceData);
    return priceData;
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
            `${BINANCE_FUTURES_BASE_URL}/ticker/24hr`,
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
  getMultiple24hTickers,
  getKlines,
  getMultiplePrices,
  getMarketOverview,
  getSearchableSymbols,
  resolveToMarketSymbol,
};

// Default export object
const marketService = {
  getPrice,
  get24hTicker,
  getMultiple24hTickers,
  getKlines,
  getMultiplePrices,
  getMarketOverview,
  getSearchableSymbols,
  resolveToMarketSymbol,
};

export default marketService;
