/**
 * Simple in-memory cache for API responses
 * Helps reduce API calls and improve performance
 */

class APICache {
  constructor() {
    this.cache = new Map();
    this.ttl = new Map(); // Time to live for each key
  }

  /**
   * Set cache item with optional TTL (time to live in milliseconds)
   */
  set(key, value, ttl = 60000) {
    // Default 1 minute
    this.cache.set(key, {
      data: value,
      timestamp: Date.now(),
    });

    // Set expiration timeout
    if (ttl > 0) {
      if (this.ttl.has(key)) {
        clearTimeout(this.ttl.get(key));
      }

      const timeout = setTimeout(() => {
        this.cache.delete(key);
        this.ttl.delete(key);
      }, ttl);

      this.ttl.set(key, timeout);
    }
  }

  /**
   * Get cache item if not expired
   */
  get(key) {
    const item = this.cache.get(key);

    if (!item) return null;

    return item.data;
  }

  /**
   * Check if key exists and is valid
   */
  has(key) {
    return this.cache.has(key);
  }

  /**
   * Remove item from cache
   */
  delete(key) {
    if (this.ttl.has(key)) {
      clearTimeout(this.ttl.get(key));
      this.ttl.delete(key);
    }
    return this.cache.delete(key);
  }

  /**
   * Clear all cache
   */
  clear() {
    // Clear all timeouts
    for (const timeout of this.ttl.values()) {
      clearTimeout(timeout);
    }
    this.cache.clear();
    this.ttl.clear();
  }

  /**
   * Get cache statistics
   */
  getStats() {
    return {
      size: this.cache.size,
      keys: Array.from(this.cache.keys()),
    };
  }
}

// Create singleton instance
const apiCache = new APICache();

// Export helper functions
export const setCache = (key, value, ttl) => apiCache.set(key, value, ttl);
export const getCache = (key) => apiCache.get(key);
export const hasCache = (key) => apiCache.has(key);
export const deleteCache = (key) => apiCache.delete(key);
export const clearCache = () => apiCache.clear();
export const getCacheStats = () => apiCache.getStats();

// Cache keys generator
export const generateCacheKey = (endpoint, params = {}) => {
  const sortedParams = Object.keys(params)
    .sort()
    .reduce((obj, key) => {
      obj[key] = params[key];
      return obj;
    }, {});

  return `${endpoint}:${JSON.stringify(sortedParams)}`;
};

// Cache wrapper for API calls
export const withCache = async (key, apiCall, ttl = 60000) => {
  // Check cache first
  if (hasCache(key)) {
    return getCache(key);
  }

  // Make API call
  const data = await apiCall();

  // Cache the result
  setCache(key, data, ttl);

  return data;
};

export default apiCache;
