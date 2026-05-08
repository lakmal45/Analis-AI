import axios from "axios";

// OpenRouter API configuration
const OPENROUTER_API_URL = "https://openrouter.ai/api/v1/chat/completions";
const OPENROUTER_API_KEY =
  process.env.OPENROUTER_API_KEY || "your_openrouter_api_key_here";

// Available models (you can change this)
const MODEL = "google/gemini-2.0-flash-exp:free"; // Free tier model

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
 * @returns {string} Formatted prompt
 */
const generateMarketAnalysisPrompt = (marketData, indicators) => {
  return `
Analyze this market data:

Symbol: ${marketData.symbol}
Current Price: $${parseFloat(marketData.lastPrice).toFixed(2)}
24h Change: ${marketData.priceChangePercent}%
24h High: $${parseFloat(marketData.highPrice).toFixed(2)}
24h Low: $${parseFloat(marketData.lowPrice).toFixed(2)}
24h Volume: ${parseFloat(marketData.volume).toFixed(2)}

Technical Indicators:
- RSI (14): ${indicators.rsi14 ? indicators.rsi14.toFixed(2) : "N/A"}
- MACD: ${indicators.macd?.macdLine ? indicators.macd.macdLine.toFixed(4) : "N/A"}
- Signal: ${indicators.macd?.signalLine ? indicators.macd.signalLine.toFixed(4) : "N/A"}
- EMA 20: ${indicators.ema20 ? "$" + indicators.ema20.toFixed(2) : "N/A"}
- SMA 20: ${indicators.sma20 ? "$" + indicators.sma20.toFixed(2) : "N/A"}

Please provide:
1. Trend analysis (Bullish/Bearish/Neutral)
2. Confidence level (0-100%)
3. Key support and resistance levels
4. Trading recommendation (Strong Buy/Buy/Hold/Sell/Strong Sell)
5. Brief explanation (2-3 sentences)

Format the response as JSON:
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
    contextInfo = `
Current Market Context:
- Symbol: ${marketContext.symbol}
- Price: $${parseFloat(marketContext.lastPrice).toFixed(2)}
- 24h Change: ${marketContext.priceChangePercent}%
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
 * @returns {Promise<object>} Analysis result
 */
const analyzeMarket = async (marketData, indicators) => {
  const systemPrompt =
    "You are a professional crypto trading analyst. Provide accurate, data-driven analysis. Always respond in valid JSON format.";
  const userPrompt = generateMarketAnalysisPrompt(marketData, indicators);

  try {
    const response = await getAIResponse(systemPrompt, userPrompt, 500);
    // Try to parse JSON from response
    const jsonMatch = response.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      return JSON.parse(jsonMatch[0]);
    }
    // If no JSON found, return text response
    return {
      trend: "Neutral",
      confidence: 50,
      support: 0,
      resistance: 0,
      recommendation: "Hold",
      explanation: response,
    };
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
