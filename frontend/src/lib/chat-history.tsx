"use client";

import { createContext, useCallback, useContext, useMemo, useState } from "react";

export interface ChatHighlight {
  /** KPI id from the backend (e.g. "chargeable-hours", "rate-per-hour") */
  kpi: string;
  period_start?: string;
  period_end?: string;
  capability?: string | null;
}

export interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  /** Optional table data the API returned alongside the answer. */
  data?: Record<string, unknown>[] | null;
  highlight?: ChatHighlight | null;
}

export interface ChatHistoryValue {
  messages: ChatMessage[];
  append: (msg: Omit<ChatMessage, "id"> & { id?: string }) => ChatMessage;
  clear: () => void;
}

const ChatHistoryContext = createContext<ChatHistoryValue | null>(null);

function genId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export function ChatHistoryProvider({ children }: { children: React.ReactNode }) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);

  const append = useCallback<ChatHistoryValue["append"]>((msg) => {
    const full: ChatMessage = { id: msg.id ?? genId(), ...msg };
    setMessages((prev) => [...prev, full]);
    return full;
  }, []);

  const clear = useCallback(() => setMessages([]), []);

  const value = useMemo<ChatHistoryValue>(
    () => ({ messages, append, clear }),
    [messages, append, clear]
  );

  return <ChatHistoryContext.Provider value={value}>{children}</ChatHistoryContext.Provider>;
}

export function useChatHistory(): ChatHistoryValue {
  const ctx = useContext(ChatHistoryContext);
  if (!ctx) throw new Error("useChatHistory must be used within ChatHistoryProvider");
  return ctx;
}
