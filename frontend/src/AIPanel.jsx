import React, { useState } from "react";

const AIPanel = () => {
  const [messages, setMessages] = useState([])
  const [input, setInput] = useState("")

  const send = async () => {
    if (!input) return
    const userMsg = { role: "user", content: input }
    setMessages((m) => [...m, userMsg])
    setInput("")
    try {
      const res = await fetch("/api/chat/message", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: null, message: input }),
      })
      const data = await res.json()
      setMessages((m) => [...m, { role: "assistant", content: data.assistant }])
    } catch (e) {
      setMessages((m) => [...m, { role: "assistant", content: "Error contacting AI" }])
    }
  }

  return (
    <div>
      <h3 className="text-lg font-semibold mb-2">AI Assistant</h3>
      <div className="bg-zinc-800 rounded p-3 text-sm max-h-64 overflow-auto">
        {messages.map((msg, i) => (
          <div key={i} className={`py-1 ${msg.role === 'user' ? 'text-right' : 'text-left'}`}>
            <div className="inline-block px-3 py-1 rounded bg-zinc-700">{msg.content}</div>
          </div>
        ))}
      </div>
      <div className="mt-2 flex gap-2">
        <input value={input} onChange={(e) => setInput(e.target.value)} className="flex-1 bg-zinc-800 rounded px-3 py-2" placeholder="Ask AI..." />
        <button onClick={send} className="bg-emerald-500 text-black px-3 py-2 rounded">Send</button>
      </div>
    </div>
  )
}

export default AIPanel;
