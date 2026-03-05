"use client";

import React, { useEffect, useState } from "react";
import {
  AreaChart,
  Area,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from "recharts";
export interface ForecastChartProps {
  horizon?: number;
  model?: string;
  region?: string;
}

interface ForecastPoint {
  month: string;
  historical?: number;
  forecast?: number;
  lower80?: number;
  upper80?: number;
  lower95?: number;
  upper95?: number;
}

function formatCompactCurrency(value: number): string {
  if (value >= 1_000_000_000) return `$${(value / 1_000_000_000).toFixed(1)}B`;
  if (value >= 1_000_000) return `$${(value / 1_000_000).toFixed(1)}M`;
  if (value >= 1_000) return `$${(value / 1_000).toFixed(1)}K`;
  return `$${value}`;
}

export function ForecastChart({ horizon = 6, model = "hybrid", region }: ForecastChartProps) {
  const [data, setData] = useState<ForecastPoint[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    setError(null);
    const params = new URLSearchParams({ horizon: String(horizon), model });
    if (region) params.set("region", region);

    fetch(`/api/forecasting/predict?${params}`)
      .then((res) => {
        if (!res.ok) throw new Error(`Failed to fetch: ${res.status}`);
        return res.json();
      })
      .then((json) => {
        const historical = Array.isArray(json.historical) ? json.historical : [];
        const forecast = Array.isArray(json.forecast) ? json.forecast : [];
        const combined: ForecastPoint[] = [
          ...historical.map((p: { date?: string; revenue?: number }) => ({
            month: new Date(p.date ?? "").toLocaleDateString("en-US", { month: "short", year: "2-digit" }),
            historical: p.revenue,
          })),
          ...forecast.map((p: { date?: string; revenue?: number; lower_80?: number; upper_80?: number; lower_95?: number; upper_95?: number }) => ({
            month: new Date(p.date ?? "").toLocaleDateString("en-US", { month: "short", year: "2-digit" }),
            forecast: p.revenue,
            lower80: p.lower_80,
            upper80: p.upper_80,
            lower95: p.lower_95,
            upper95: p.upper_95,
          })),
        ];
        setData(combined);
      })
      .catch((err) => {
        setError(err instanceof Error ? err.message : "Failed to load forecast");
      })
      .finally(() => setLoading(false));
  }, [horizon, model, region]);

  if (error) {
    return (
      <div className="rounded-xl border p-5 bg-[#1a1a1a] border-[#2a2a2a]">
        <div className="flex h-64 items-center justify-center text-[#f87171]">{error}</div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="rounded-xl border p-5 bg-[#1a1a1a] border-[#2a2a2a]">
        <div className="mb-4">
          <h3 className="font-bold text-white">Revenue Forecast</h3>
          <p className="mt-0.5 text-sm text-[#9ca3af]">Historical and predicted revenue with confidence bands</p>
        </div>
        <div className="h-64 animate-pulse rounded-lg bg-[#252525]" />
      </div>
    );
  }

  const CustomTooltip = ({
    active,
    payload,
    label,
  }: {
    active?: boolean;
    payload?: { name: string; value?: number; dataKey?: string }[];
    label?: string;
  }) => {
    if (!active || !payload?.length) return null;
    return (
      <div className="rounded-lg border px-3 py-2 shadow-lg bg-[#1a1a1a] border-[#2a2a2a] text-[#e5e5e5]">
        <p className="mb-2 text-xs font-medium text-[#9ca3af]">{label}</p>
        {payload.map((entry) =>
          entry.value != null ? (
            <p key={entry.dataKey ?? entry.name} className="text-sm">
              {entry.name}: {formatCompactCurrency(entry.value)}
            </p>
          ) : null
        )}
      </div>
    );
  };

  return (
    <div className="rounded-xl border p-5 bg-[#1a1a1a] border-[#2a2a2a]">
      <div className="mb-4">
        <h3 className="font-bold text-white">Revenue Forecast</h3>
        <p className="mt-0.5 text-sm text-[#9ca3af]">Historical and predicted revenue with confidence bands</p>
      </div>
      <ResponsiveContainer width="100%" height={320}>
        <AreaChart data={data} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
          <defs>
            <linearGradient id="band95" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#4ade80" stopOpacity={0.15} />
              <stop offset="100%" stopColor="#4ade80" stopOpacity={0} />
            </linearGradient>
            <linearGradient id="band80" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#4ade80" stopOpacity={0.35} />
              <stop offset="100%" stopColor="#4ade80" stopOpacity={0.1} />
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
            formatter={(value) => <span className="text-[#e5e5e5]">{value}</span>}
            iconType="circle"
            iconSize={8}
          />
          {data.some((d) => d.lower95 != null && d.upper95 != null) && (
            <Area
              type="monotone"
              dataKey="upper95"
              baseValue={(entry: ForecastPoint) => entry.lower95 ?? 0}
              stroke="none"
              fill="url(#band95)"
            />
          )}
          {data.some((d) => d.lower80 != null && d.upper80 != null) && (
            <Area
              type="monotone"
              dataKey="upper80"
              baseValue={(entry: ForecastPoint) => entry.lower80 ?? 0}
              stroke="none"
              fill="url(#band80)"
            />
          )}
          <Line
            type="monotone"
            dataKey="historical"
            name="Historical"
            stroke="#4ade80"
            strokeWidth={2}
            dot={false}
            connectNulls
          />
          <Line
            type="monotone"
            dataKey="forecast"
            name="Forecast"
            stroke="#4ade80"
            strokeWidth={2}
            strokeDasharray="5 5"
            dot={false}
            connectNulls
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
