"use client";

import React, { useEffect, useState } from "react";

export interface ExecSummaryModalProps {
  isOpen: boolean;
  onClose: () => void;
  periodStart: string;
  periodEnd: string;
  region?: string;
}

export function ExecSummaryModal({
  isOpen,
  onClose,
  periodStart,
  periodEnd,
  region,
}: ExecSummaryModalProps) {
  const [content, setContent] = useState<string>("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen) return;

    setLoading(true);
    setError(null);
    setContent("");

    fetch("/api/nlp/executive-summary", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ period_start: periodStart, period_end: periodEnd, region: region || null }),
    })
      .then((res) => {
        if (!res.ok) throw new Error(`Failed to fetch: ${res.status}`);
        return res.json();
      })
      .then((json) => {
        setContent(json.summary ?? json.content ?? json.text ?? "");
      })
      .catch((err) => {
        setError(err instanceof Error ? err.message : "Failed to generate summary");
      })
      .finally(() => setLoading(false));
  }, [isOpen, periodStart, periodEnd, region]);

  const handleExportPDF = () => {
    window.print();
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div
        className="absolute inset-0 bg-black/70"
        onClick={onClose}
        aria-hidden="true"
      />
      <div
        className="relative w-full max-w-2xl max-h-[90vh] flex flex-col rounded-xl overflow-hidden"
        style={{
          backgroundColor: "#1a1a1a",
          borderColor: "#2a2a2a",
          borderWidth: 1,
          boxShadow: "0 25px 50px -12px rgba(0,0,0,0.5)",
        }}
      >
        <div className="flex items-center justify-between p-4 border-b" style={{ borderColor: "#2a2a2a" }}>
          <h2 className="text-lg font-semibold text-[#e5e5e5]">Executive Summary</h2>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={handleExportPDF}
              className="px-3 py-1.5 rounded-lg text-sm font-medium bg-[#2a2a2a] text-[#e5e5e5] hover:bg-[#333]"
            >
              Export PDF
            </button>
            <button
              type="button"
              onClick={onClose}
              className="p-1.5 rounded-lg hover:bg-[#2a2a2a] text-[#888888]"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-6">
          {loading && (
            <div className="flex flex-col items-center justify-center py-16">
              <div
                className="w-10 h-10 border-2 border-t-[#4ade80] rounded-full animate-spin"
                style={{ borderColor: "#2a2a2a" }}
              />
              <p className="mt-4 text-sm text-[#888888]">Generating summary...</p>
            </div>
          )}

          {error && !loading && (
            <div className="flex items-center justify-center py-16" style={{ color: "#f87171" }}>
              {error}
            </div>
          )}

          {content && !loading && !error && (
            <div
              className="prose prose-invert max-w-none"
              style={{
                color: "#e5e5e5",
                fontSize: "0.95rem",
                lineHeight: 1.7,
              }}
            >
              {content.split("\n").map((para, i) => {
                const renderBold = (text: string) => {
                  const parts = text.split(/\*\*(.*?)\*\*/g);
                  return parts.map((part, j) =>
                    j % 2 === 1 ? <strong key={j} className="text-white font-semibold">{part}</strong> : part
                  );
                };
                if (para.startsWith("## ")) {
                  return (
                    <h3 key={i} className="text-lg font-semibold mt-6 mb-2" style={{ color: "#e5e5e5" }}>
                      {renderBold(para.replace(/^##\s*/, ""))}
                    </h3>
                  );
                }
                if (para.startsWith("# ")) {
                  return (
                    <h2 key={i} className="text-xl font-semibold mt-6 mb-2" style={{ color: "#e5e5e5" }}>
                      {renderBold(para.replace(/^#\s*/, ""))}
                    </h2>
                  );
                }
                if (para.startsWith("- ") || para.startsWith("* ")) {
                  return (
                    <li key={i} className="ml-4 mb-1" style={{ color: "#d4d4d4" }}>
                      {renderBold(para.replace(/^[-*]\s*/, ""))}
                    </li>
                  );
                }
                if (para.trim()) {
                  return (
                    <p key={i} className="mb-3" style={{ color: "#d4d4d4" }}>
                      {renderBold(para)}
                    </p>
                  );
                }
                return null;
              })}
            </div>
          )}
        </div>

        <div className="p-4 border-t text-center text-xs" style={{ borderColor: "#2a2a2a", color: "#666" }}>
          Generated by: Databricks Genie
        </div>
      </div>
    </div>
  );
}
