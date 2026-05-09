import axios from "axios";
import NodeCache from "node-cache";

// Cache AI responses for 5 minutes (300 seconds)
const aiCache = new NodeCache({ stdTTL: 300, checkperiod: 320 });

// OpenRouter API configuration
const OPENROUTER_API_URL = "https://openrouter.ai/api/v1/chat/completions";
const OPENROUTER_API_KEY =
  process.env.OPENROUTER_API_KEY || "your_openrouter_api_key_here";

// Available models (you can change this)
const MODEL = "openai/gpt-oss-120b"; // OpenAI GPT-OSS-120B

/**
 * Send a prompt to OpenRouter AI
 * @param {string} systemPrompt - System message for context
 * @param {string} userPrompt - User's question/request
 * @param {number} maxTokens - Maximum tokens in response
 * @returns {Promise<string>} AI response
 */
const getAIResponse = async (systemPrompt, userPrompt, maxTokens = 1000) => {
  try {
    const response = await axios.post(
      OPENROUTER_API_URL,
      {
        model: MODEL,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
        max_tokens: maxTokens,
        temperature: 0.7,
        response_format: { type: "json_object" },
      },
      {
        headers: {
          Authorization: `Bearer ${OPENROUTER_API_KEY}`,
          "Content-Type": "application/json",
          "HTTP-Referer": "http://localhost:5000", // Optional: your site URL
          "X-Title": "AnalisAI", // Optional: your app name
        },
      },
    );

    return response.data.choices[0].message.content;
  } catch (error) {
    console.error(
      "OpenRouter API Error:",
      error.response?.data || error.message,
    );
    throw new Error("Failed to get AI response");
  }
};

/**
 * Generate market analysis prompt
 * @param {object} marketData - Current market data
 * @param {object} indicators - Technical indicators
 * @param {Array} newsData - Array of recent news articles
 * @returns {string} Formatted prompt
 */
const generateMarketAnalysisPrompt = (marketData, indicators, newsData = []) => {
  
  let newsSection = "";
  if (newsData && newsData.length > 0) {
    const newsItems = newsData.map((n, i) => `${i + 1}. ${n.title}`).join("\n");
    newsSection = `\n[Market Sentiment & News]\nRecent Headlines:\n${newsItems}\n`;
  }

  return `
Analyze this market data for ${marketData.symbol}:
Current Price: $${parseFloat(marketData.lastPrice).toFixed(2)}
24h Change: ${marketData.priceChangePercent}%
24h High: $${parseFloat(marketData.highPrice).toFixed(2)} | 24h Low: $${parseFloat(marketData.lowPrice).toFixed(2)}

Technical Indicators Categorized:
[Trend Indicators]
- SMA (20-period, Short-Term): ${indicators.sma20 ? "$" + indicators.sma20.toFixed(2) : "N/A"}
- EMA (20-period, Short-Term): ${indicators.ema20 ? "$" + indicators.ema20.toFixed(2) : "N/A"}
- SMA (200-period, Macro Trend): ${indicators.sma200 ? "$" + indicators.sma200.toFixed(2) : "N/A"}

[Momentum Indicators]
- RSI (14-period): ${indicators.rsi14 ? indicators.rsi14.toFixed(2) : "N/A"} (Overbought > 70, Oversold < 30)
- MACD Line: ${indicators.macd?.macdLine ? indicators.macd.macdLine.toFixed(4) : "N/A"}
- MACD Signal: ${indicators.macd?.signalLine ? indicators.macd.signalLine.toFixed(4) : "N/A"}
${newsSection}
Please provide:
1. Trend analysis (Bullish/Bearish/Neutral)
2. Confidence level (0-100%). RULE: Cap confidence at 60% if the short-term trend (SMA 20) conflicts with the macro trend (SMA 200). Adjust confidence based on news sentiment.
3. Key support and resistance levels based on recent highs/lows and moving averages.
4. Trading recommendation (Strong Buy/Buy/Hold/Sell/Strong Sell).
5. Brief explanation (2-4 sentences). You MUST justify your recommendation by explicitly explaining how the Trend indicators align or conflict with the Momentum indicators, and factor in the recent News Sentiment.

Format the response exactly as JSON:
{
  "trend": "...",
  "confidence": 0,
  "support": 0,
  "resistance": 0,
  "recommendation": "...",
  "explanation": "..."
}
`;
};

/**
 * Generate chat response prompt
 * @param {string} userMessage - User's message
 * @param {object} marketContext - Optional market context
 * @returns {string} Formatted prompt
 */
const generateChatPrompt = (userMessage, marketContext = null) => {
  let contextInfo = "";

  if (marketContext) {
    let newsStr = "";
    if (marketContext.news && marketContext.news.length > 0) {
      newsStr = `\n- Recent News: ${marketContext.news.slice(0, 3).join(" | ")}`;
    }
    contextInfo = `
Current Market Context:
- Symbol: ${marketContext.symbol}
- Price: $${parseFloat(marketContext.lastPrice).toFixed(2)}
- 24h Change: ${marketContext.priceChangePercent}%${newsStr}
`;
  }

  return `
You are an AI trading assistant for AnalisAI platform. You help users with:
- Market analysis and predictions
- Technical indicator explanations
- Trading strategies and recommendations
- Risk management advice

${contextInfo}

User: ${userMessage}

Provide a helpful, concise response. If discussing trading, always include risk warnings.
`;
};

/**
 * Analyze market data using AI
 * @param {object} marketData - Market data from Binance
 * @param {object} indicators - Technical indicators
 * @param {Array} newsData - Recent news articles
 * @returns {Promise<object>} Analysis result
 */
const analyzeMarket = async (marketData, indicators, newsData = []) => {
  // Use symbol and a generic 'analysis' string as cache key. We can add timeframe if passed later.
  const cacheKey = `analysis_${marketData.symbol}`;
  const cachedAnalysis = aiCache.get(cacheKey);
  
  if (cachedAnalysis) {
    console.log(`[Cache Hit] Serving cached AI analysis for ${marketData.symbol}`);
    return cachedAnalysis;
  }

  const systemPrompt =
    "You are a professional crypto trading analyst. Provide accurate, data-driven analysis. Always respond in valid JSON format.";
  const userPrompt = generateMarketAnalysisPrompt(marketData, indicators, newsData);

  try {
    const response = await getAIResponse(systemPrompt, userPrompt, 500);
    let result;
    // Try to parse JSON from response
    const jsonMatch = response.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      result = JSON.parse(jsonMatch[0]);
    } else {
      // If no JSON found, return text response
      result = {
        trend: "Neutral",
        confidence: 50,
        support: 0,
        resistance: 0,
        recommendation: "Hold",
        explanation: response,
      };
    }
    
    // Save to cache
    aiCache.set(cacheKey, result);
    return result;
  } catch (error) {
    console.error("Error in market analysis:", error);
    throw error;
  }
};

/**
 * Get chat response from AI
 * @param {string} message - User's message
 * @param {array} history - Chat history (optional)
 * @param {object} marketContext - Current market context (optional)
 * @returns {Promise<string>} AI response
 */
const getChatResponse = async (message, history = [], marketContext = null) => {
  const systemPrompt =
    "You are an AI trading assistant for AnalisAI. Provide helpful, accurate trading advice. Always include risk warnings for trading recommendations.";
  const userPrompt = generateChatPrompt(message, marketContext);

  try {
    return await getAIResponse(systemPrompt, userPrompt, 1000);
  } catch (error) {
    console.error("Error in chat response:", error);
    throw error;
  }
};

export {
  getAIResponse,
  analyzeMarket,
  getChatResponse,
  generateMarketAnalysisPrompt,
  generateChatPrompt,
};
