"use client";

import React, { useEffect, useState } from "react";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
} from "recharts";

export interface DQHistoryPoint {
  date: string;
  score: number;
}

export function DQTrendChart() {
  const [data, setData] = useState<DQHistoryPoint[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/data-quality/history?days=90")
      .then((res) => {
        if (!res.ok) throw new Error(`Failed to fetch: ${res.status}`);
        return res.json();
      })
      .then((json) => {
        const raw = json.history ?? json.data ?? json.series ?? json;
        const arr = Array.isArray(raw) ? raw : [];
        setData(
          arr.map((p: { date?: string; score?: number }) => ({
            date: p.date ?? "",
            score: Number(p.score ?? 0),
          }))
        );
      })
      .catch((err) => {
        setError(err instanceof Error ? err.message : "Failed to load history");
      })
      .finally(() => setLoading(false));
  }, []);

  const CustomTooltip = ({
    active,
    payload,
    label,
  }: {
    active?: boolean;
    payload?: { value: number }[];
    label?: string;
  }) => {
    if (!active || !payload?.length) return null;
    return (
      <div
        className="rounded-lg border px-3 py-2 shadow-lg"
        style={{
          backgroundColor: "#1a1a1a",
          borderColor: "#2a2a2a",
          color: "#e5e5e5",
        }}
      >
        <p className="mb-1 text-xs" style={{ color: "#9ca3af" }}>
          {label}
        </p>
        <p className="text-sm font-medium" style={{ color: "#4ade80" }}>
          Score: {payload[0].value}%
        </p>
      </div>
    );
  };

  if (error) {
    return (
      <div
        className="rounded-xl border p-6"
        style={{ backgroundColor: "#1a1a1a", borderColor: "#2a2a2a" }}
      >
        <div className="flex h-64 items-center justify-center" style={{ color: "#f87171" }}>
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
        <div className="h-64 animate-pulse rounded-lg" style={{ backgroundColor: "#252525" }} />
      </div>
    );
  }

  const formatDate = (d: string) =>
    new Date(d).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "2-digit" });

  return (
    <div
      className="rounded-xl border p-6"
      style={{ backgroundColor: "#1a1a1a", borderColor: "#2a2a2a" }}
    >
      <h3 className="font-bold text-white mb-1">Score Trend</h3>
      <p className="text-sm text-[#9ca3af] mb-4">Data quality over last 90 days</p>
      <ResponsiveContainer width="100%" height={280}>
        <LineChart data={data} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#2a2a2a" />
          <XAxis
            dataKey="date"
            tickFormatter={formatDate}
            tick={{ fill: "#9ca3af", fontSize: 12 }}
            axisLine={{ stroke: "#2a2a2a" }}
            tickLine={{ stroke: "#2a2a2a" }}
          />
          <YAxis
            domain={[0, 100]}
            tick={{ fill: "#9ca3af", fontSize: 12 }}
            axisLine={{ stroke: "#2a2a2a" }}
            tickLine={{ stroke: "#2a2a2a" }}
          />
          <Tooltip content={<CustomTooltip />} />
          <ReferenceLine y={95} stroke="#facc15" strokeDasharray="5 5" />
          <Line
            type="monotone"
            dataKey="score"
            stroke="#4ade80"
            strokeWidth={2}
            dot={{ fill: "#4ade80", r: 3 }}
            activeDot={{ r: 5, fill: "#4ade80" }}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
