import React, { useState } from "react";

const ChatPage = () => {
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState("");

  const send = async () => {
    if (!input) return;
    const userMsg = { role: "user", content: input };
    setMessages((m) => [...m, userMsg]);
    setInput("");
    try {
      const res = await fetch("/api/chat/message", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: null, message: input }),
      });
      const data = await res.json();
      setMessages((m) => [
        ...m,
        { role: "assistant", content: data.assistant },
      ]);
    } catch (e) {
      setMessages((m) => [
        ...m,
        { role: "assistant", content: "Error contacting AI" },
      ]);
    }
  };

  return (
    <div>
      <h1 className="text-2xl font-bold">AI Chat</h1>
      <div className="mt-4 bg-zinc-900 p-4 rounded max-h-96 overflow-auto">
        {messages.map((m, i) => (
          <div
            key={i}
            className={`py-2 ${m.role === "user" ? "text-right" : "text-left"}`}
          >
            <div className="inline-block px-3 py-2 rounded bg-zinc-800">
              {m.content}
            </div>
          </div>
        ))}
      </div>
      <div className="mt-2 flex gap-2">
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          className="flex-1 bg-zinc-800 rounded px-3 py-2"
          placeholder="Ask the AI..."
        />
        <button
          onClick={send}
          className="bg-emerald-500 text-black px-3 py-2 rounded"
        >
          Send
        </button>
      </div>
    </div>
  );
};

export default ChatPage;
