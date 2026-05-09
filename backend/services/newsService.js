import axios from "axios";
import NodeCache from "node-cache";

// Cache news for 15 minutes (900 seconds)
const newsCache = new NodeCache({ stdTTL: 900, checkperiod: 920 });

/**
 * Fetch latest news for a specific cryptocurrency symbol
 * @param {string} symbol - e.g. "BTCUSDT"
 * @returns {Promise<Array>} Array of news articles
 */
export const getLatestNews = async (symbol) => {
  try {
    // Extract base coin (e.g., BTC from BTCUSDT)
    const baseAsset = symbol.replace("USDT", "").toUpperCase();
    
    const cacheKey = `news_${baseAsset}`;
    const cachedNews = newsCache.get(cacheKey);
    
    if (cachedNews) {
      return cachedNews;
    }

    // Using CryptoCompare's free news API
    const response = await axios.get("https://min-api.cryptocompare.com/data/v2/news/?lang=EN", {
      params: {
        categories: baseAsset
      }
    });

    if (response.data && response.data.Data) {
      // Extract top 5 headlines and summaries
      const articles = response.data.Data.slice(0, 5).map(article => ({
        title: article.title,
        body: article.body,
        source: article.source,
        url: article.url
      }));

      newsCache.set(cacheKey, articles);
      return articles;
    }

    return [];
  } catch (error) {
    console.error(`Error fetching news for ${symbol}:`, error.message);
    // Return empty array on failure so it doesn't break the main analysis
    return [];
  }
};
