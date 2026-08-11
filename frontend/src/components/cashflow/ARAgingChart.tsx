"use client";

import React, { useEffect, useState } from "react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Cell,
} from "recharts";
import { formatCurrency } from "@/lib/formatters";
import { CHART_COLORS } from "@/lib/constants";

export interface ARAgingPoint {
  service_line_id: string;
  service_line_name: string;
  balance: number;
}

export interface ARAgingChartProps {
  region?: string;
}

export function ARAgingChart({ region }: ARAgingChartProps) {
  const [data, setData] = useState<ARAgingPoint[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const params = new URLSearchParams();
    if (region) params.set("region", region);

    fetch(`/api/cashflow/ar-aging?${params}`)
      .then((res) => {
        if (!res.ok) throw new Error(`Failed to fetch: ${res.status}`);
        return res.json();
      })
      .then((json) => {
        const arr = Array.isArray(json.aging_buckets) ? json.aging_buckets : [];
        setData(
          arr.map((p: { service_line?: string; service_line_id?: string; ar_balance?: number; balance?: number }) => ({
            service_line_id: String(p.service_line ?? p.service_line_id ?? ""),
            service_line_name: String(p.service_line ?? p.service_line_id ?? ""),
            balance: Number(p.ar_balance ?? p.balance ?? 0),
          }))
        );
      })
      .catch((err) => {
        setError(err instanceof Error ? err.message : "Failed to load AR aging");
      })
      .finally(() => setLoading(false));
  }, [region]);

  const CustomTooltip = ({
    active,
    payload,
  }: {
    active?: boolean;
    payload?: { payload: ARAgingPoint }[];
  }) => {
    if (!active || !payload?.length) return null;
    const p = payload[0].payload;
    return (
      <div
        className="rounded-lg border px-3 py-2 shadow-lg"
        style={{
          backgroundColor: "#1a1a1a",
          borderColor: "#2a2a2a",
          color: "#e5e5e5",
        }}
      >
        <p className="mb-1 text-sm font-medium">{p.service_line_name}</p>
        <p className="text-sm" style={{ color: "#4ade80" }}>
          {formatCurrency(p.balance)}
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

  return (
    <div
      className="rounded-xl border p-6"
      style={{ backgroundColor: "#1a1a1a", borderColor: "#2a2a2a" }}
    >
      <h3 className="font-bold text-white mb-1">AR Aging by Service Line</h3>
      <p className="text-sm text-[#9ca3af] mb-4">Outstanding receivables</p>
      <ResponsiveContainer width="100%" height={Math.max(200, data.length * 40)}>
        <BarChart
          data={data}
          layout="vertical"
          margin={{ top: 10, right: 60, left: 100, bottom: 0 }}
        >
          <CartesianGrid strokeDasharray="3 3" stroke="#2a2a2a" horizontal={false} />
          <XAxis
            type="number"
            tickFormatter={(v) => formatCurrency(v, true)}
            tick={{ fill: "#9ca3af", fontSize: 12 }}
            axisLine={{ stroke: "#2a2a2a" }}
            tickLine={{ stroke: "#2a2a2a" }}
          />
          <YAxis
            type="category"
            dataKey="service_line_name"
            tick={{ fill: "#9ca3af", fontSize: 12 }}
            axisLine={{ stroke: "#2a2a2a" }}
            tickLine={{ stroke: "#2a2a2a" }}
            width={90}
          />
          <Tooltip content={<CustomTooltip />} />
          <Bar dataKey="balance" name="AR Balance" radius={[0, 4, 4, 0]} label={{ position: "right", fill: "#e5e5e5", formatter: (v: number) => formatCurrency(v, true) }}>
            {data.map((_, i) => (
              <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
