"use client";

import React, { useEffect, useState } from "react";

export interface CheckResult {
  table_name: string;
  check_name: string;
  passed: boolean;
  failed_count: number;
}

export interface DQReport {
  score: number;
  checks: CheckResult[];
}

export function DQScorecard() {
  const [data, setData] = useState<DQReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/data-quality/report")
      .then((res) => {
        if (!res.ok) throw new Error(`Failed to fetch: ${res.status}`);
        return res.json();
      })
      .then((json) => {
        const raw = json.data ?? json;
        const checks = Array.isArray(raw.checks) ? raw.checks : [];
        setData({
          score: Number(raw.overall_score ?? raw.score ?? 0),
          checks: checks.map((c: { table_name?: string; check_name?: string; passed?: boolean; failed_count?: number }) => ({
            table_name: String(c.table_name ?? ""),
            check_name: String(c.check_name ?? ""),
            passed: Boolean(c.passed),
            failed_count: Number(c.failed_count ?? 0),
          })),
        });
      })
      .catch((err) => {
        setError(err instanceof Error ? err.message : "Failed to load report");
      })
      .finally(() => setLoading(false));
  }, []);

  if (error) {
    return (
      <div
        className="rounded-xl border p-6"
        style={{ backgroundColor: "#1a1a1a", borderColor: "#2a2a2a" }}
      >
        <div className="flex h-48 items-center justify-center" style={{ color: "#f87171" }}>
          {error}
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div
        className="rounded-xl border p-6"
        style={{ backgroundColor: "#1a1a1a", borderColor: "#2a2a2a" }}
      >
        <div className="flex flex-col items-center gap-4">
          <div className="w-32 h-32 rounded-full animate-pulse" style={{ backgroundColor: "#252525" }} />
          <div className="h-24 w-full animate-pulse rounded-lg" style={{ backgroundColor: "#252525" }} />
        </div>
      </div>
    );
  }

  const d = data!;
  const scoreColor = d.score >= 95 ? "#4ade80" : d.score >= 80 ? "#facc15" : "#f87171";

  const byTable = d.checks.reduce<Record<string, CheckResult[]>>((acc, c) => {
    const t = c.table_name || "Other";
    if (!acc[t]) acc[t] = [];
    acc[t].push(c);
    return acc;
  }, {});

  return (
    <div
      className="rounded-xl border p-6"
      style={{ backgroundColor: "#1a1a1a", borderColor: "#2a2a2a" }}
    >
      <h3 className="text-sm font-medium text-[#9ca3af] mb-4">Overall Score</h3>
      <div className="flex flex-col items-center mb-6">
        <div
          className="w-28 h-28 rounded-full flex items-center justify-center text-3xl font-bold border-4"
          style={{
            backgroundColor: "#0f0f0f",
            borderColor: scoreColor,
            color: scoreColor,
          }}
        >
          {Math.round(d.score)}
        </div>
        <p className="text-xs text-[#888888] mt-2">out of 100</p>
      </div>

      <div className="space-y-4">
        {Object.entries(byTable).map(([tableName, checks]) => (
          <div key={tableName}>
            <p className="text-xs font-medium text-[#9ca3af] mb-2">{tableName}</p>
            <div className="space-y-2">
              {checks.map((c, i) => (
                <div
                  key={`${c.check_name}-${i}`}
                  className="flex items-center justify-between py-2 px-3 rounded-lg"
                  style={{ backgroundColor: "#151515" }}
                >
                  <div className="flex items-center gap-2">
                    <div
                      className="w-2 h-2 rounded-full"
                      style={{ backgroundColor: c.passed ? "#4ade80" : "#f87171" }}
                    />
                    <span className="text-sm text-[#e5e5e5]">{c.check_name}</span>
                  </div>
                  <span
                    className={`text-xs px-2 py-0.5 rounded ${
                      c.passed ? "bg-[#1e2a1e] text-[#4ade80]" : "bg-[#2a1e1e] text-[#f87171]"
                    }`}
                  >
                    {c.passed ? "Pass" : "Fail"}
                  </span>
                  {!c.passed && c.failed_count > 0 && (
                    <span className="text-xs text-[#f87171] ml-2">
                      {c.failed_count} failed
                    </span>
                  )}
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
