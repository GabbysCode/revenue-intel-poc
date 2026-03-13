"use client";

import React, { useEffect, useState } from "react";

interface Action {
  priority: "high" | "medium" | "low";
  category: string;
  title: string;
  description: string;
  metric: number;
  metric_label: string;
}

export interface RecommendedActionsProps {
  region?: string;
}

const PRIORITY_CONFIG = {
  high: {
    color: "#f87171",
    bg: "rgba(248,113,113,0.08)",
    border: "rgba(248,113,113,0.2)",
    icon: (
      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
      </svg>
    ),
    label: "Urgent",
  },
  medium: {
    color: "#facc15",
    bg: "rgba(250,204,21,0.08)",
    border: "rgba(250,204,21,0.2)",
    icon: (
      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M12 2a10 10 0 100 20 10 10 0 000-20z" />
      </svg>
    ),
    label: "Watch",
  },
  low: {
    color: "#4ade80",
    bg: "rgba(74,222,128,0.08)",
    border: "rgba(74,222,128,0.2)",
    icon: (
      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
      </svg>
    ),
    label: "Positive",
  },
};

export function RecommendedActions({ region }: RecommendedActionsProps) {
  const [actions, setActions] = useState<Action[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    setError(null);
    const params = new URLSearchParams();
    if (region) params.set("region", region);

    fetch(`/api/forecasting/recommendations?${params}`)
      .then((res) => {
        if (!res.ok) throw new Error(`Failed to fetch: ${res.status}`);
        return res.json();
      })
      .then((json) => {
        setActions(Array.isArray(json.recommendations) ? json.recommendations : []);
      })
      .catch((err) => {
        setError(err instanceof Error ? err.message : "Failed to load");
      })
      .finally(() => setLoading(false));
  }, [region]);

  if (error) {
    return (
      <div className="rounded-xl border p-6 bg-[#1a1a1a] border-[#2a2a2a]">
        <div className="flex h-32 items-center justify-center text-[#f87171]">{error}</div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="rounded-xl border p-6 bg-[#1a1a1a] border-[#2a2a2a]">
        <h3 className="font-bold text-white mb-4">Recommended Actions</h3>
        <div className="space-y-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="h-20 animate-pulse rounded-lg bg-[#252525]" />
          ))}
        </div>
      </div>
    );
  }

  if (actions.length === 0) {
    return (
      <div className="rounded-xl border p-6 bg-[#1a1a1a] border-[#2a2a2a]">
        <h3 className="font-bold text-white mb-2">Recommended Actions</h3>
        <p className="text-sm text-[#888888]">No actionable recommendations at this time.</p>
      </div>
    );
  }

  const highCount = actions.filter((a) => a.priority === "high").length;
  const mediumCount = actions.filter((a) => a.priority === "medium").length;

  return (
    <div className="rounded-xl border p-6 bg-[#1a1a1a] border-[#2a2a2a]">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h3 className="font-bold text-white">Recommended Actions</h3>
          <p className="text-sm text-[#9ca3af] mt-0.5">AI-generated insights from forecast and financial data</p>
        </div>
        <div className="flex items-center gap-2">
          {highCount > 0 && (
            <span className="text-xs font-medium px-2 py-1 rounded" style={{ color: "#f87171", backgroundColor: "rgba(248,113,113,0.1)" }}>
              {highCount} urgent
            </span>
          )}
          {mediumCount > 0 && (
            <span className="text-xs font-medium px-2 py-1 rounded" style={{ color: "#facc15", backgroundColor: "rgba(250,204,21,0.1)" }}>
              {mediumCount} watch
            </span>
          )}
        </div>
      </div>

      <div className="space-y-3">
        {actions.map((action, i) => {
          const cfg = PRIORITY_CONFIG[action.priority];
          return (
            <div
              key={i}
              className="rounded-lg border p-4 transition-colors hover:bg-[#222]"
              style={{ backgroundColor: cfg.bg, borderColor: cfg.border }}
            >
              <div className="flex items-start gap-3">
                <div className="flex-shrink-0 mt-0.5" style={{ color: cfg.color }}>
                  {cfg.icon}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-[10px] font-semibold uppercase px-1.5 py-0.5 rounded" style={{ color: cfg.color, backgroundColor: `${cfg.color}20` }}>
                      {action.category}
                    </span>
                  </div>
                  <p className="text-sm font-medium text-[#e5e5e5]">{action.title}</p>
                  <p className="text-xs text-[#9ca3af] mt-1 leading-relaxed">{action.description}</p>
                </div>
                <div className="flex-shrink-0 text-right">
                  <p className="text-lg font-bold" style={{ color: cfg.color }}>
                    {action.metric_label.includes("ratio") || action.metric_label.includes("coverage")
                      ? `${action.metric}x`
                      : action.metric_label.includes("width")
                        ? `${action.metric}%`
                        : `${action.metric > 0 ? "+" : ""}${action.metric}%`
                    }
                  </p>
                  <p className="text-[10px] text-[#888888]">{action.metric_label}</p>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
