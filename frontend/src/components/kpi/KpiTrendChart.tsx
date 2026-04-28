"use client";

import {
  Line,
  LineChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
  Legend,
} from "recharts";
import { formatKpiValue, type KpiFormat } from "@/lib/formatters";

export interface TrendPoint {
  period: string;
  value: number;
  budget: number;
}

interface Props {
  data: TrendPoint[];
  format: KpiFormat;
  title?: string;
  height?: number;
  loading?: boolean;
  errorMessage?: string;
}

const monthLabel = (iso: string) =>
  new Date(iso).toLocaleDateString("en-GB", { month: "short", year: "2-digit" });

export function KpiTrendChart({ data, format, title = "Trend (12 months)", height = 240, loading, errorMessage }: Props) {
  return (
    <div
      className="rounded-xl p-4 flex flex-col"
      style={{
        background: "var(--color-surface, #ffffff)",
        border: "1px solid var(--color-border, #e5e7eb)",
        minHeight: height + 40,
      }}
    >
      <h3 className="text-sm font-medium mb-2" style={{ color: "var(--color-text, #111827)" }}>{title}</h3>
      {loading ? (
        <div className="flex-1 rounded animate-pulse" style={{ background: "var(--color-surface-2, #f3f4f6)" }} />
      ) : errorMessage ? (
        <p className="text-sm" style={{ color: "var(--color-negative, #dc2626)" }}>{errorMessage}</p>
      ) : !data || data.length === 0 ? (
        <p className="text-sm" style={{ color: "var(--color-text-muted, #6b7280)" }}>No data in window.</p>
      ) : (
        <div style={{ height }}>
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={data} margin={{ top: 6, right: 12, bottom: 0, left: 0 }}>
              <CartesianGrid stroke="var(--color-border, #e5e7eb)" strokeDasharray="3 3" vertical={false} />
              <XAxis
                dataKey="period"
                tickFormatter={monthLabel}
                stroke="var(--color-text-muted, #6b7280)"
                fontSize={11}
              />
              <YAxis
                stroke="var(--color-text-muted, #6b7280)"
                fontSize={11}
                tickFormatter={(v: number) => formatKpiValue(v, format)}
                width={64}
              />
              <Tooltip
                contentStyle={{
                  background: "var(--color-surface, #ffffff)",
                  border: "1px solid var(--color-border, #e5e7eb)",
                  borderRadius: 6,
                  fontSize: 12,
                }}
                formatter={(v: number, name: string) => [formatKpiValue(v, format), name]}
                labelFormatter={(l: string) => monthLabel(l)}
              />
              <Legend wrapperStyle={{ fontSize: 12 }} />
              <Line
                type="monotone"
                dataKey="value"
                name="Actual"
                stroke="var(--color-accent, #00338D)"
                strokeWidth={2}
                dot={false}
              />
              <Line
                type="monotone"
                dataKey="budget"
                name="Budget"
                stroke="var(--color-text-muted, #6b7280)"
                strokeWidth={1.5}
                strokeDasharray="4 4"
                dot={false}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  );
}
