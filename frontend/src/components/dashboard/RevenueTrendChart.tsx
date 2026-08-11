"use client";

import React, { useEffect, useState } from "react";
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from "recharts";
import { ChartContainer } from "../shared/ChartContainer";

interface RevenueTrendPoint {
  month: string;
  revenue: number;
  collected: number;
}

export interface RevenueTrendChartProps {
  region?: string;
}

function formatCompactCurrency(value: number): string {
  if (value >= 1_000_000) return `$${(value / 1_000_000).toFixed(1)}M`;
  if (value >= 1_000) return `$${(value / 1_000).toFixed(1)}K`;
  return `$${value}`;
}

function formatMonthAbbr(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString("en-US", { month: "short" });
}

export function RevenueTrendChart({ region }: RevenueTrendChartProps) {
  const [data, setData] = useState<RevenueTrendPoint[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const params = new URLSearchParams();
    if (region) params.set("region", region);

    fetch(`/api/dashboard/revenue-trend?${params}`)
      .then((res) => {
        if (!res.ok) throw new Error(`Failed to fetch: ${res.status}`);
        return res.json();
      })
      .then((json) => {
        const raw = json.trend ?? json.data ?? json.series ?? json;
        const points = Array.isArray(raw) ? raw : [];
        setData(
          points.map((p: { month?: string; date?: string; revenue?: number; collected?: number }) => ({
            month: formatMonthAbbr(p.month ?? p.date ?? ""),
            revenue: p.revenue ?? 0,
            collected: p.collected ?? 0,
          }))
        );
      })
      .catch((err) => {
        setError(err instanceof Error ? err.message : "Failed to load revenue trend");
      })
      .finally(() => {
        setLoading(false);
      });
  }, [region]);

  if (error) {
    return (
      <ChartContainer title="Recent Sales" subtitle="Revenue vs collections trend">
        <div className="flex h-64 items-center justify-center" style={{ color: "#f87171" }}>
          {error}
        </div>
      </ChartContainer>
    );
  }

  if (loading) {
    return (
      <ChartContainer title="Recent Sales" subtitle="Revenue vs collections trend">
        <div
          className="h-64 animate-pulse rounded-lg"
          style={{ backgroundColor: "#252525" }}
        />
      </ChartContainer>
    );
  }

  const CustomTooltip = ({ active, payload, label }: { active?: boolean; payload?: { name: string; value: number }[]; label?: string }) => {
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
        <p className="mb-2 text-xs font-medium" style={{ color: "#9ca3af" }}>{label}</p>
        {payload.map((entry) => (
          <p key={entry.name} className="text-sm">
            {entry.name}: {formatCompactCurrency(entry.value)}
          </p>
        ))}
      </div>
    );
  };

  return (
    <ChartContainer title="Recent Sales" subtitle="Revenue vs collections trend">
      <ResponsiveContainer width="100%" height={320}>
        <AreaChart data={data} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
          <defs>
            <linearGradient id="revenueGrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#4ade80" stopOpacity={0.3} />
              <stop offset="100%" stopColor="#4ade80" stopOpacity={0} />
            </linearGradient>
            <linearGradient id="collectedGrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#facc15" stopOpacity={0.3} />
              <stop offset="100%" stopColor="#facc15" stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" stroke="#2a2a2a" />
          <XAxis
            dataKey="month"
            tick={{ fill: "#9ca3af", fontSize: 12 }}
            axisLine={{ stroke: "#2a2a2a" }}
            tickLine={{ stroke: "#2a2a2a" }}
          />
          <YAxis
            tickFormatter={formatCompactCurrency}
            tick={{ fill: "#9ca3af", fontSize: 12 }}
            axisLine={{ stroke: "#2a2a2a" }}
            tickLine={{ stroke: "#2a2a2a" }}
          />
          <Tooltip content={<CustomTooltip />} />
          <Legend
            wrapperStyle={{ paddingTop: 16 }}
            formatter={(value) => <span style={{ color: "#e5e5e5" }}>{value}</span>}
            iconType="circle"
            iconSize={8}
          />
          <Area
            type="monotone"
            dataKey="revenue"
            name="Revenue"
            stroke="#4ade80"
            fill="url(#revenueGrad)"
            strokeWidth={2}
          />
          <Area
            type="monotone"
            dataKey="collected"
            name="Collected"
            stroke="#facc15"
            fill="url(#collectedGrad)"
            strokeWidth={2}
          />
        </AreaChart>
      </ResponsiveContainer>
    </ChartContainer>
  );
}
