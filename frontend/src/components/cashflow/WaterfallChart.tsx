"use client";

import React, { useEffect, useState } from "react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from "recharts";

const STAGE_COLORS: Record<string, string> = {
  booked: "#60a5fa",
  recognized: "#a78bfa",
  billed: "#facc15",
  collected: "#4ade80",
};

export interface WaterfallPoint {
  month: string;
  booked?: number;
  recognized?: number;
  billed?: number;
  collected?: number;
}

export interface WaterfallChartProps {
  periodStart?: string;
  periodEnd?: string;
  region?: string;
}

function formatCompactCurrency(value: number): string {
  if (value >= 1_000_000) return `$${(value / 1_000_000).toFixed(1)}M`;
  if (value >= 1_000) return `$${(value / 1_000).toFixed(1)}K`;
  return `$${value}`;
}

export function WaterfallChart({ periodStart, periodEnd, region }: WaterfallChartProps) {
  const [data, setData] = useState<WaterfallPoint[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const params = new URLSearchParams();
    if (periodStart) params.set("periodStart", periodStart);
    if (periodEnd) params.set("periodEnd", periodEnd);
    if (region) params.set("region", region);

    fetch(`/api/cashflow/waterfall?${params}`)
      .then((res) => {
        if (!res.ok) throw new Error(`Failed to fetch: ${res.status}`);
        return res.json();
      })
      .then((json) => {
        const arr = Array.isArray(json.waterfall) ? json.waterfall : [];
        setData(
          arr.map((p: Record<string, unknown>) => ({
            month: String(p.date ?? p.month ?? ""),
            booked: Number(p.booked ?? 0),
            recognized: Number(p.recognized ?? 0),
            billed: Number(p.billed ?? 0),
            collected: Number(p.collected ?? 0),
          }))
        );
      })
      .catch((err) => {
        setError(err instanceof Error ? err.message : "Failed to load waterfall");
      })
      .finally(() => setLoading(false));
  }, [periodStart, periodEnd, region]);

  const CustomTooltip = ({
    active,
    payload,
    label,
  }: {
    active?: boolean;
    payload?: { name: string; value: number; dataKey: string }[];
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
        <p className="mb-2 text-xs font-medium" style={{ color: "#9ca3af" }}>
          {label}
        </p>
        {payload.map((entry) => (
          <p key={entry.dataKey} className="text-sm flex justify-between gap-4">
            <span style={{ color: STAGE_COLORS[entry.dataKey] ?? "#e5e5e5" }}>{entry.name}:</span>
            <span>{formatCompactCurrency(entry.value)}</span>
          </p>
        ))}
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

  const formatMonth = (m: string) =>
    m ? new Date(m).toLocaleDateString("en-US", { month: "short", year: "numeric" }) : m;

  const bars = [
    { dataKey: "booked", name: "Booked", color: STAGE_COLORS.booked },
    { dataKey: "recognized", name: "Recognized", color: STAGE_COLORS.recognized },
    { dataKey: "billed", name: "Billed", color: STAGE_COLORS.billed },
    { dataKey: "collected", name: "Collected", color: STAGE_COLORS.collected },
  ];

  return (
    <div
      className="rounded-xl border p-6"
      style={{ backgroundColor: "#1a1a1a", borderColor: "#2a2a2a" }}
    >
      <h3 className="font-bold text-white mb-1">Cash Flow Waterfall</h3>
      <p className="text-sm text-[#9ca3af] mb-4">Booked → Recognized → Billed → Collected</p>
      <ResponsiveContainer width="100%" height={320}>
        <BarChart data={data} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#2a2a2a" />
          <XAxis
            dataKey="month"
            tickFormatter={formatMonth}
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
          {bars.map(({ dataKey, name, color }) => (
            <Bar key={dataKey} dataKey={dataKey} name={name} stackId="a" fill={color} radius={[0, 0, 0, 0]} />
          ))}
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
