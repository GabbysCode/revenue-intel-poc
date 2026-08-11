"use client";

import React from "react";
import {
  AreaChart,
  Area,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  BarChart,
  Bar,
} from "recharts";

export interface ScenarioResultsData {
  summary?: {
    baseTotal?: number;
    p10?: number;
    p50?: number;
    p90?: number;
    expectedDeltaPct?: number;
    cashFlowP50?: number;
    avgMargin?: number;
  };
  fanChart?: Array<{
    period?: string;
    base?: number;
    p10?: number;
    p50?: number;
    p90?: number;
  }>;
  sensitivity?: Array<{
    parameter?: string;
    positiveImpact?: number;
    negativeImpact?: number;
  }>;
}

export interface ScenarioResultsProps {
  data: ScenarioResultsData | null;
}

function formatCompactCurrency(value: number): string {
  if (value >= 1_000_000_000) return `$${(value / 1_000_000_000).toFixed(1)}B`;
  if (value >= 1_000_000) return `$${(value / 1_000_000).toFixed(1)}M`;
  if (value >= 1_000) return `$${(value / 1_000).toFixed(1)}K`;
  return `$${value}`;
}

export function ScenarioResults({ data }: ScenarioResultsProps) {
  if (!data || (!data.summary && !data.fanChart?.length && !data.sensitivity?.length)) {
    return (
      <div className="flex min-h-[400px] items-center justify-center rounded-xl border border-[#2a2a2a] bg-[#1a1a1a] p-8">
        <p className="text-[#888888]">Run a scenario to see results</p>
      </div>
    );
  }

  const summary = data.summary ?? {};
  const fanData = data.fanChart ?? [];
  const sensitivityData = data.sensitivity ?? [];

  const summaryCards = [
    { label: "Base Total", value: summary.baseTotal, format: formatCompactCurrency },
    { label: "P10", value: summary.p10, format: formatCompactCurrency },
    { label: "P50", value: summary.p50, format: formatCompactCurrency },
    { label: "P90", value: summary.p90, format: formatCompactCurrency },
    { label: "Expected Delta %", value: summary.expectedDeltaPct, format: (v: number) => `${v >= 0 ? "+" : ""}${v?.toFixed(2)}%` },
    { label: "Cash Flow P50", value: summary.cashFlowP50, format: formatCompactCurrency },
    { label: "Avg Margin", value: summary.avgMargin, format: (v: number) => `${v?.toFixed(1)}%` },
  ];

  const CustomTooltip = ({
    active,
    payload,
    label,
  }: {
    active?: boolean;
    payload?: { name: string; value?: number }[];
    label?: string;
  }) => {
    if (!active || !payload?.length) return null;
    return (
      <div className="rounded-lg border border-[#2a2a2a] bg-[#1a1a1a] px-3 py-2 shadow-lg text-[#e5e5e5]">
        <p className="mb-2 text-xs font-medium text-[#9ca3af]">{label}</p>
        {payload.map((entry) =>
          entry.value != null ? (
            <p key={entry.name} className="text-sm">
              {entry.name}: {formatCompactCurrency(entry.value)}
            </p>
          ) : null
        )}
      </div>
    );
  };

  const tornadoData = sensitivityData.map((s) => ({
    parameter: s.parameter ?? "Unknown",
    negative: -(s.negativeImpact ?? 0),
    positive: s.positiveImpact ?? 0,
  }));

  return (
    <div className="space-y-6">
      {Object.keys(summary).length > 0 && (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-7">
          {summaryCards.map(
            (card) =>
              card.value != null && (
                <div
                  key={card.label}
                  className="rounded-lg border border-[#2a2a2a] bg-[#1a1a1a] p-3"
                >
                  <p className="text-xs text-[#9ca3af]">{card.label}</p>
                  <p className="mt-1 text-sm font-semibold text-[#e5e5e5]">
                    {card.format(card.value)}
                  </p>
                </div>
              )
          )}
        </div>
      )}

      {fanData.length > 0 && (
        <div className="rounded-xl border border-[#2a2a2a] bg-[#1a1a1a] p-5">
          <h3 className="mb-4 font-bold text-white">Fan Chart</h3>
          <ResponsiveContainer width="100%" height={280}>
            <AreaChart data={fanData} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
              <defs>
                <linearGradient id="p90Grad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#4ade80" stopOpacity={0.1} />
                  <stop offset="100%" stopColor="#4ade80" stopOpacity={0} />
                </linearGradient>
                <linearGradient id="p50Grad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#4ade80" stopOpacity={0.25} />
                  <stop offset="100%" stopColor="#4ade80" stopOpacity={0.05} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#2a2a2a" />
              <XAxis
                dataKey="period"
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
              {fanData.some((d) => d.p10 != null && d.p90 != null) && (
                <Area
                  type="monotone"
                  dataKey="p90"
                  baseValue={(e: { p10?: number }) => e.p10 ?? 0}
                  stroke="none"
                  fill="url(#p90Grad)"
                />
              )}
              {fanData.some((d) => d.p10 != null && d.p50 != null) && (
                <Area
                  type="monotone"
                  dataKey="p50"
                  baseValue={(e: { p10?: number }) => e.p10 ?? 0}
                  stroke="none"
                  fill="url(#p50Grad)"
                />
              )}
              <Line
                type="monotone"
                dataKey="base"
                name="Base"
                stroke="#4ade80"
                strokeWidth={2}
                dot={false}
                connectNulls
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      )}

      {tornadoData.length > 0 && (
        <div className="rounded-xl border border-[#2a2a2a] bg-[#1a1a1a] p-5">
          <h3 className="mb-4 font-bold text-white">Sensitivity / Tornado Chart</h3>
          <ResponsiveContainer width="100%" height={Math.max(200, tornadoData.length * 48)}>
            <BarChart
              data={tornadoData}
              layout="vertical"
              margin={{ top: 5, right: 30, left: 100, bottom: 5 }}
            >
              <CartesianGrid strokeDasharray="3 3" stroke="#2a2a2a" />
              <XAxis
                type="number"
                tickFormatter={(v) => formatCompactCurrency(v)}
                tick={{ fill: "#9ca3af", fontSize: 12 }}
                axisLine={{ stroke: "#2a2a2a" }}
                tickLine={{ stroke: "#2a2a2a" }}
              />
              <YAxis
                type="category"
                dataKey="parameter"
                tick={{ fill: "#9ca3af", fontSize: 12 }}
                axisLine={{ stroke: "#2a2a2a" }}
                tickLine={{ stroke: "#2a2a2a" }}
                width={90}
              />
              <Tooltip
                content={({ active, payload }) => {
                  if (!active || !payload?.length) return null;
                  const d = payload[0].payload;
                  return (
                    <div className="rounded-lg border border-[#2a2a2a] bg-[#1a1a1a] px-3 py-2 text-[#e5e5e5]">
                      <p className="font-medium">{d.parameter}</p>
                      <p className="text-sm text-[#9ca3af]">
                        Negative: {formatCompactCurrency(d.negative)} | Positive: {formatCompactCurrency(d.positive)}
                      </p>
                    </div>
                  );
                }}
              />
              <Bar dataKey="negative" fill="#f87171" radius={[0, 4, 4, 0]} />
              <Bar dataKey="positive" fill="#4ade80" radius={[4, 0, 0, 4]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  );
}
