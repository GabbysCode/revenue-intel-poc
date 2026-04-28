"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { apiFetch } from "@/lib/apiFetch";
import { useChatHistory, type ChatMessage } from "@/lib/chat-history";
import { useFilterState } from "@/lib/filter-state";
import { useAuth } from "@/lib/auth-context";

const PATH_TO_CONTEXT: Record<string, string> = {
  "/": "overview",
  "/chargeable-hours": "chargeable-hours",
  "/rate-per-hour": "rate-per-hour",
  "/gross-fee-days": "gross-fee-days",
  "/unbilled-days": "unbilled-days",
};

const KPI_TO_PATH: Record<string, string> = {
  "chargeable-hours": "/chargeable-hours",
  "rate-per-hour": "/rate-per-hour",
  "gross-fee-days": "/gross-fee-days",
  "unbilled-days": "/unbilled-days",
};

const COLLAPSED_WIDTH = 48;
const EXPANDED_WIDTH = 380;

export function ChatPane() {
  const pathname = usePathname();
  const router = useRouter();
  const { activePersona } = useAuth();
  const { messages, append } = useChatHistory();
  const { filters, periodEnd } = useFilterState();
  const [collapsed, setCollapsed] = useState(false);
  const [prompts, setPrompts] = useState<string[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const context = useMemo(() => PATH_TO_CONTEXT[pathname] || "overview", [pathname]);

  // Persist collapsed state across navigation.
  useEffect(() => {
    const saved = typeof window !== "undefined" && window.localStorage.getItem("revintel.chat.collapsed");
    if (saved === "true") setCollapsed(true);
  }, []);
  useEffect(() => {
    if (typeof window !== "undefined") {
      window.localStorage.setItem("revintel.chat.collapsed", collapsed ? "true" : "false");
    }
  }, [collapsed]);

  useEffect(() => {
    apiFetch(`/api/nlp/suggested-prompts?context=${encodeURIComponent(context)}`)
      .then((r) => r.json())
      .then((j) => setPrompts(Array.isArray(j?.prompts) ? j.prompts : []))
      .catch(() => setPrompts([]));
  }, [context]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages.length]);

  const ask = async (question: string) => {
    if (!question.trim() || loading) return;
    setInput("");
    append({ role: "user", content: question });
    setLoading(true);
    try {
      const res = await apiFetch("/api/nlp/query", {
        method: "POST",
        body: JSON.stringify({ question }),
      });
      const json = await res.json();
      const resp = json.response || {};
      const text = resp.text || resp.status || json.answer || "No response.";
      const rawData = resp.data;
      const data: Record<string, unknown>[] | null = Array.isArray(rawData?.rows)
        ? rawData.rows.map((row: unknown[]) => {
            const obj: Record<string, unknown> = {};
            (rawData.columns || []).forEach((c: string, i: number) => {
              obj[c] = row[i];
            });
            return obj;
          })
        : null;
      const highlight = resp.highlight ?? null;
      append({ role: "assistant", content: text, data, highlight });
    } catch (e) {
      append({
        role: "assistant",
        content: e instanceof Error ? e.message : "Failed to reach the API.",
      });
    } finally {
      setLoading(false);
    }
  };

  const goToKpi = (msg: ChatMessage) => {
    if (!msg.highlight?.kpi) return;
    const path = KPI_TO_PATH[msg.highlight.kpi];
    if (!path) return;
    const params = new URLSearchParams();
    if (filters.capability) params.set("capability", filters.capability);
    if (filters.month) params.set("month", filters.month);
    if (filters.viewMode === "current_month") params.set("view", "current_month");
    const qs = params.toString();
    router.push(`${path}${qs ? `?${qs}` : ""}`);
  };

  if (collapsed) {
    return (
      <aside
        className="hidden md:flex flex-col items-center gap-3 py-4 border-l shrink-0"
        style={{
          width: COLLAPSED_WIDTH,
          background: "var(--color-surface, #ffffff)",
          borderColor: "var(--color-border, #e5e7eb)",
          color: "var(--color-text, #111827)",
        }}
        aria-label="Knowledge assistant (collapsed)"
      >
        <button
          type="button"
          onClick={() => setCollapsed(false)}
          className="p-2 rounded-md hover:bg-[color:var(--color-surface-2,#f3f4f6)]"
          title="Expand knowledge assistant"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
        </button>
        <div
          className="text-[10px] font-medium tracking-wider uppercase"
          style={{
            writingMode: "vertical-rl",
            transform: "rotate(180deg)",
            color: "var(--color-text-muted, #6b7280)",
          }}
        >
          Ask why
        </div>
      </aside>
    );
  }

  return (
    <aside
      className="hidden md:flex flex-col border-l shrink-0"
      style={{
        width: EXPANDED_WIDTH,
        background: "var(--color-surface, #ffffff)",
        borderColor: "var(--color-border, #e5e7eb)",
        color: "var(--color-text, #111827)",
      }}
      aria-label="Knowledge assistant"
    >
      <header
        className="p-4 border-b flex items-start justify-between gap-3 shrink-0"
        style={{ borderColor: "var(--color-border, #e5e7eb)" }}
      >
        <div className="min-w-0">
          <h2 className="font-semibold text-base">Ask why &mdash; Genie</h2>
          <p className="text-xs mt-0.5 truncate" style={{ color: "var(--color-text-muted, #6b7280)" }}>
            {activePersona ? `Asking as ${activePersona.name}` : "Anonymous session"} &middot; {context}
          </p>
        </div>
        <button
          type="button"
          onClick={() => setCollapsed(true)}
          className="p-1.5 rounded hover:bg-[color:var(--color-surface-2,#f3f4f6)] shrink-0"
          aria-label="Collapse"
          title="Collapse"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
          </svg>
        </button>
      </header>

      <div className="flex-1 overflow-y-auto p-4 space-y-4 min-h-0">
        {messages.length === 0 && (
          <>
            <p className="text-sm" style={{ color: "var(--color-text-muted, #6b7280)" }}>
              Try one of these prompts. Period anchored to {periodEnd}.
            </p>
            <div className="grid grid-cols-1 gap-2">
              {prompts.map((p) => (
                <button
                  key={p}
                  type="button"
                  onClick={() => ask(p)}
                  className="text-left text-sm rounded-lg border px-3 py-2 hover:bg-[color:var(--color-surface-2,#f3f4f6)]"
                  style={{ borderColor: "var(--color-border, #e5e7eb)" }}
                >
                  {p}
                </button>
              ))}
            </div>
          </>
        )}

        {messages.map((msg) => (
          <div key={msg.id} className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
            <div
              className="max-w-[88%] rounded-lg px-3 py-2 text-sm"
              style={{
                background: msg.role === "user" ? "var(--color-accent, #00338D)" : "var(--color-surface-2, #f3f4f6)",
                color: msg.role === "user" ? "var(--color-on-accent, #ffffff)" : "var(--color-text, #111827)",
              }}
            >
              <p className="whitespace-pre-wrap leading-relaxed">{msg.content}</p>
              {msg.data && msg.data.length > 0 && (
                <div className="mt-2 overflow-x-auto">
                  <table className="w-full text-xs border-collapse">
                    <thead>
                      <tr>
                        {Object.keys(msg.data[0] as object).map((k) => (
                          <th
                            key={k}
                            className="px-2 py-1 text-left font-medium border"
                            style={{ borderColor: "var(--color-border, #e5e7eb)" }}
                          >
                            {k}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {msg.data.map((row, ri) => (
                        <tr key={ri}>
                          {Object.values(row as object).map((v, vi) => (
                            <td
                              key={vi}
                              className="px-2 py-1 border tabular-nums"
                              style={{ borderColor: "var(--color-border, #e5e7eb)" }}
                            >
                              {String(v ?? "")}
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
              {msg.role === "assistant" && msg.highlight?.kpi && KPI_TO_PATH[msg.highlight.kpi] && (
                <button
                  type="button"
                  onClick={() => goToKpi(msg)}
                  className="mt-2 text-xs font-medium underline"
                  style={{ color: "var(--color-accent, #00338D)" }}
                >
                  View on dashboard &rarr;
                </button>
              )}
            </div>
          </div>
        ))}

        {loading && (
          <div className="flex justify-start">
            <div className="rounded-lg px-3 py-2 text-sm" style={{ background: "var(--color-surface-2, #f3f4f6)" }}>
              <span style={{ color: "var(--color-text-muted, #6b7280)" }}>Thinking&hellip;</span>
            </div>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      <div className="p-3 border-t shrink-0" style={{ borderColor: "var(--color-border, #e5e7eb)" }}>
        <div className="flex gap-2">
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && !e.shiftKey && ask(input)}
            placeholder="Ask a question&hellip;"
            className="flex-1 min-w-0 px-3 py-2 rounded-lg text-sm border outline-none focus:ring-1"
            style={{ borderColor: "var(--color-border, #e5e7eb)", color: "var(--color-text, #111827)" }}
            disabled={loading}
          />
          <button
            type="button"
            onClick={() => ask(input)}
            disabled={loading || !input.trim()}
            className="px-3 py-2 rounded-lg text-sm font-medium disabled:opacity-50 shrink-0"
            style={{ background: "var(--color-accent, #00338D)", color: "var(--color-on-accent, #ffffff)" }}
          >
            Ask
          </button>
        </div>
      </div>
    </aside>
  );
}
