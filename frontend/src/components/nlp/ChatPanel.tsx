"use client";

import React, { useState, useRef, useEffect } from "react";

export interface ChatMessage {
  role: "user" | "assistant";
  content: string;
  data?: Record<string, unknown>[] | null;
}

export function ChatPanel() {
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const handleSend = async () => {
    const question = input.trim();
    if (!question || loading) return;

    setInput("");
    setMessages((prev) => [...prev, { role: "user", content: question }]);
    setLoading(true);

    try {
      const res = await fetch("/api/nlp/query", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question }),
      });

      if (!res.ok) throw new Error(`Failed: ${res.status}`);
      const json = await res.json();

      const resp = json.response || {};
      const responseText = resp.text || resp.status || json.answer || "No response.";
      const rawData = resp.data;
      const data = rawData?.rows?.map((row: unknown[]) => {
        const obj: Record<string, unknown> = {};
        rawData.columns?.forEach((col: string, i: number) => { obj[col] = row[i]; });
        return obj;
      }) ?? null;

      setMessages((prev) => [
        ...prev,
        { role: "assistant", content: responseText, data: Array.isArray(data) ? data : null },
      ]);
    } catch (err) {
      setMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          content: err instanceof Error ? err.message : "Failed to get response",
          data: null,
        },
      ]);
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="fixed bottom-6 right-6 z-50 w-14 h-14 rounded-full flex items-center justify-center shadow-lg transition-transform hover:scale-105"
        style={{ backgroundColor: "#4ade80", color: "#0f0f0f" }}
        aria-label="Toggle AI Assistant"
      >
        <span className="text-xl">💬</span>
      </button>

      <div
        className={`fixed top-0 right-0 z-40 h-full w-[400px] flex flex-col border-l transition-transform duration-300 ease-out ${
          isOpen ? "translate-x-0" : "translate-x-full"
        }`}
        style={{
          backgroundColor: "#1a1a1a",
          borderColor: "#2a2a2a",
          boxShadow: isOpen ? "-4px 0 24px rgba(0,0,0,0.4)" : "none",
        }}
      >
        <div className="flex items-center justify-between p-4 border-b" style={{ borderColor: "#2a2a2a" }}>
          <h2 className="font-semibold text-[#e5e5e5]">AI Assistant - Powered by Databricks Genie</h2>
          <button
            type="button"
            onClick={() => setIsOpen(false)}
            className="p-1 rounded hover:bg-[#2a2a2a] text-[#888888]"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {messages.length === 0 && (
            <p className="text-sm text-[#888888] text-center py-8">
              Ask a question about your revenue data. Try &quot;What was total revenue last quarter?&quot;
            </p>
          )}
          {messages.map((msg, i) => (
            <div
              key={i}
              className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}
            >
              <div
                className={`max-w-[85%] rounded-lg px-4 py-2 ${
                  msg.role === "user"
                    ? "rounded-br-none"
                    : "rounded-bl-none"
                }`}
                style={{
                  backgroundColor: msg.role === "user" ? "#4ade80" : "#252525",
                  color: msg.role === "user" ? "#0f0f0f" : "#e5e5e5",
                }}
              >
                <p className="text-sm whitespace-pre-wrap">{msg.content}</p>
                {msg.data && msg.data.length > 0 && (
                  <div className="mt-3 overflow-x-auto">
                    <table className="w-full text-xs border-collapse">
                      <thead>
                        <tr>
                          {Object.keys(msg.data[0] as object).map((k) => (
                            <th
                              key={k}
                              className="px-2 py-1 text-left font-medium border"
                              style={{ borderColor: "#2a2a2a", color: "#9ca3af" }}
                            >
                              {k}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {msg.data.map((row, ri) => (
                          <tr key={ri}>
                            {Object.values(row as object).map((val, vi) => (
                              <td
                                key={vi}
                                className="px-2 py-1 border"
                                style={{ borderColor: "#2a2a2a", color: "#e5e5e5" }}
                              >
                                {String(val ?? "")}
                              </td>
                            ))}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </div>
          ))}
          {loading && (
            <div className="flex justify-start">
              <div
                className="rounded-lg rounded-bl-none px-4 py-2"
                style={{ backgroundColor: "#252525" }}
              >
                <span className="text-sm text-[#888888]">Thinking...</span>
              </div>
            </div>
          )}
          <div ref={messagesEndRef} />
        </div>

        <div className="p-4 border-t" style={{ borderColor: "#2a2a2a" }}>
          <div className="flex gap-2">
            <input
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && !e.shiftKey && handleSend()}
              placeholder="Ask a question..."
              className="flex-1 px-4 py-2 rounded-lg text-sm bg-[#0f0f0f] border text-[#e5e5e5] placeholder-[#666]"
              style={{ borderColor: "#2a2a2a" }}
              disabled={loading}
            />
            <button
              type="button"
              onClick={handleSend}
              disabled={loading || !input.trim()}
              className="px-4 py-2 rounded-lg text-sm font-medium disabled:opacity-50"
              style={{
                backgroundColor: "#4ade80",
                color: "#0f0f0f",
              }}
            >
              Send
            </button>
          </div>
        </div>
      </div>

      {isOpen && (
        <div
          className="fixed inset-0 z-30 bg-black/40"
          onClick={() => setIsOpen(false)}
          aria-hidden="true"
        />
      )}
    </>
  );
}
