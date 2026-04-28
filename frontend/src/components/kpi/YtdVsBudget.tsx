"use client";

import {
  Area,
  AreaChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { formatKpiValue, type KpiFormat } from "@/lib/formatters";

export interface YtdPoint {
  period: string;
  actual: number;
  budget: number;
}

interface Props {
  data: YtdPoint[];
  format: KpiFormat;
  /** When true (e.g. unbilled-days), actual > budget is a bad outcome. */
  lowerIsBetter: boolean;
  title?: string;
  height?: number;
  loading?: boolean;
  errorMessage?: string;
}

const monthLabel = (iso: string) =>
  new Date(iso).toLocaleDateString("en-GB", { month: "short", year: "2-digit" });

export function YtdVsBudget({
  data,
  format,
  lowerIsBetter,
  title = "YTD vs. budget",
  height = 240,
  loading,
  errorMessage,
}: Props) {
  // Determine sentiment for the latest point so the area shading reflects status.
  const latest = data && data.length ? data[data.length - 1] : null;
  let actualTone = "var(--color-accent, #00338D)";
  if (latest) {
    const ahead = latest.actual >= latest.budget;
    const good = lowerIsBetter ? !ahead : ahead;
    actualTone = good ? "var(--color-positive, #059669)" : "var(--color-negative, #dc2626)";
  }

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
        <p className="text-sm" style={{ color: "var(--color-text-muted, #6b7280)" }}>No YTD data.</p>
      ) : (
        <div style={{ height }}>
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={data} margin={{ top: 6, right: 12, bottom: 0, left: 0 }}>
              <defs>
                <linearGradient id="ytd-actual" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={actualTone} stopOpacity={0.35} />
                  <stop offset="100%" stopColor={actualTone} stopOpacity={0} />
                </linearGradient>
              </defs>
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
              <Area
                type="monotone"
                dataKey="budget"
                name="Budget"
                stroke="var(--color-text-muted, #6b7280)"
                strokeDasharray="4 4"
                fill="transparent"
              />
              <Area
                type="monotone"
                dataKey="actual"
                name="Actual"
                stroke={actualTone}
                fill="url(#ytd-actual)"
                strokeWidth={2}
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  );
}
