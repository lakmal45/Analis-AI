const AIChat = require("../models/AIChat");
const trendEngine = require("./trendEngine");

exports.message = async (req, res) => {
  try {
    const { userId, message, asset, prices } = req.body;
    let chat = await AIChat.findOne({ userId });
    if (!chat) {
      chat = new AIChat({ userId, messages: [] });
    }

    chat.messages.push({ role: "user", content: message });

    let assistantText = "I am an AI assistant.";
    if (asset || (Array.isArray(prices) && prices.length)) {
      const result = trendEngine.analyze({ prices: prices || undefined });
      assistantText = `Trend: ${result.direction}. Score: ${result.score}. Reasons: ${result.reasons.join("; ")}`;
    } else {
      assistantText = `Echo: ${message}`;
    }

    chat.messages.push({ role: "assistant", content: assistantText });
    await chat.save();

    res.json({ assistant: assistantText, chatId: chat._id });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Chat failed" });
  }
};
