"use client";

import React, { useEffect, useState } from "react";
import { PieChart, Pie, Cell, ResponsiveContainer } from "recharts";
import { ChartContainer } from "../shared/ChartContainer";

const COLORS = ["#60a5fa", "#a78bfa", "#fb923c", "#4ade80", "#f87171", "#2dd4bf"];

interface AttributionItem {
  name: string;
  value: number;
  description?: string;
  percentage?: number;
}

interface AttributionData {
  items: AttributionItem[];
  growthPercent?: number;
}

export interface AttributionPieChartProps {
  periodStart?: string;
  periodEnd?: string;
  region?: string;
}

function formatCurrency(value: number): string {
  if (value >= 1_000_000) return `$${(value / 1_000_000).toFixed(1)}M`;
  if (value >= 1_000) return `$${(value / 1_000).toFixed(1)}K`;
  return `$${value.toLocaleString()}`;
}

export function AttributionPieChart({ periodStart, periodEnd, region }: AttributionPieChartProps) {
  const [data, setData] = useState<AttributionData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const params = new URLSearchParams();
    if (periodStart) params.set("period_start", periodStart);
    if (periodEnd) params.set("period_end", periodEnd);
    if (region) params.set("region", region);

    fetch(`/api/dashboard/attribution?${params}`)
      .then((res) => {
        if (!res.ok) throw new Error(`Failed to fetch: ${res.status}`);
        return res.json();
      })
      .then((json) => {
        const raw = json.attribution ?? json.data ?? json.items ?? json;
        const items = (Array.isArray(raw) ? raw : []).map((i: Record<string, unknown>) => ({
          name: i.service_line ?? i.name ?? "",
          value: (i.revenue ?? i.value ?? 0) as number,
          description: (i.description ?? "") as string,
          percentage: (i.percentage ?? 0) as number,
        }));
        const total = json.total_revenue ?? items.reduce((sum: number, i: { value: number }) => sum + i.value, 0);
        const withPct = items.map((i: AttributionItem) => ({
          ...i,
          percentage: total > 0 ? (i.value / total) * 100 : 0,
        }));
        setData({
          items: withPct,
          growthPercent: json.growth_percent ?? json.growthPercent,
        });
      })
      .catch((err) => {
        setError(err instanceof Error ? err.message : "Failed to load attribution");
      })
      .finally(() => {
        setLoading(false);
      });
  }, [periodStart, periodEnd, region]);

  if (error) {
    return (
      <ChartContainer title="Revenue Attribution" subtitle="By service line">
        <div className="flex h-64 items-center justify-center" style={{ color: "#f87171" }}>
          {error}
        </div>
      </ChartContainer>
    );
  }

  if (loading) {
    return (
      <ChartContainer title="Revenue Attribution" subtitle="By service line">
        <div
          className="h-64 animate-pulse rounded-lg"
          style={{ backgroundColor: "#252525" }}
        />
      </ChartContainer>
    );
  }

  const items = data?.items ?? [];
  const growthPercent = data?.growthPercent ?? 0;

  return (
    <ChartContainer title="Revenue Attribution" subtitle="By service line">
      <div className="flex flex-col gap-4 md:flex-row">
        <div className="flex-shrink-0 md:w-[40%]">
          <ResponsiveContainer width="100%" height={240}>
            <PieChart>
              <Pie
                data={items}
                dataKey="value"
                nameKey="name"
                cx="50%"
                cy="50%"
                innerRadius={60}
                outerRadius={90}
                paddingAngle={2}
              >
                {items.map((_, index) => (
                  <Cell key={index} fill={COLORS[index % COLORS.length]} stroke="#1a1a1a" strokeWidth={2} />
                ))}
              </Pie>
            </PieChart>
          </ResponsiveContainer>
        </div>
        <div className="flex-1 md:w-[60%]">
          <ul className="space-y-3">
            {items.map((item, i) => (
              <li key={i} className="flex items-start justify-between gap-4">
                <div className="flex min-w-0 flex-1 items-start gap-2">
                  <span
                    className="mt-1.5 h-2.5 w-2.5 flex-shrink-0 rounded-full"
                    style={{ backgroundColor: COLORS[i % COLORS.length] }}
                  />
                  <div className="min-w-0">
                    <p className="font-medium text-white">{item.name}</p>
                    {item.description && (
                      <p className="text-xs" style={{ color: "#9ca3af" }}>
                        {item.description}
                      </p>
                    )}
                  </div>
                </div>
                <div className="flex-shrink-0 text-right">
                  <p className="font-semibold text-white">{formatCurrency(item.value)}</p>
                  <p className="text-xs" style={{ color: "#9ca3af" }}>
                    {(item.percentage ?? 0).toFixed(1)}%
                  </p>
                </div>
              </li>
            ))}
          </ul>
          {growthPercent > 0 && (
            <p className="mt-4 text-sm font-medium" style={{ color: "#4ade80" }}>
              Trending up by {growthPercent.toFixed(1)}% this month
            </p>
          )}
        </div>
      </div>
    </ChartContainer>
  );
}
