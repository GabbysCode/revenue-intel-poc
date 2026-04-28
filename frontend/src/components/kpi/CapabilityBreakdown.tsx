"use client";

import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis, Cell } from "recharts";
import { formatKpiValue, type KpiFormat } from "@/lib/formatters";

export interface CapabilityRow {
  id: string;
  name: string;
  value: number;
  budget: number;
}

interface Props {
  data: CapabilityRow[];
  format: KpiFormat;
  lowerIsBetter: boolean;
  title?: string;
  height?: number;
  loading?: boolean;
  errorMessage?: string;
  /** When set, that capability is shown highlighted; others muted. */
  highlightId?: string | null;
}

export function CapabilityBreakdown({
  data,
  format,
  lowerIsBetter,
  title = "By capability",
  height = 240,
  loading,
  errorMessage,
  highlightId,
}: Props) {
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
        <p className="text-sm" style={{ color: "var(--color-text-muted, #6b7280)" }}>No capability data.</p>
      ) : (
        <div style={{ height }}>
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={data} layout="vertical" margin={{ top: 4, right: 12, bottom: 0, left: 8 }}>
              <CartesianGrid stroke="var(--color-border, #e5e7eb)" strokeDasharray="3 3" horizontal={false} />
              <XAxis
                type="number"
                stroke="var(--color-text-muted, #6b7280)"
                fontSize={11}
                tickFormatter={(v: number) => formatKpiValue(v, format)}
              />
              <YAxis
                dataKey="name"
                type="category"
                stroke="var(--color-text-muted, #6b7280)"
                fontSize={11}
                width={140}
              />
              <Tooltip
                contentStyle={{
                  background: "var(--color-surface, #ffffff)",
                  border: "1px solid var(--color-border, #e5e7eb)",
                  borderRadius: 6,
                  fontSize: 12,
                }}
                formatter={(v: number) => [formatKpiValue(v, format), "Actual"]}
              />
              <Bar dataKey="value" radius={[0, 4, 4, 0]}>
                {data.map((row) => {
                  const isMuted = highlightId && row.id !== highlightId;
                  const overBudget = row.budget > 0 && row.value > row.budget;
                  // For lowerIsBetter, exceeding budget is bad → red. Else, exceeding is good → green.
                  const tone = overBudget
                    ? lowerIsBetter
                      ? "var(--color-negative, #dc2626)"
                      : "var(--color-positive, #059669)"
                    : lowerIsBetter
                    ? "var(--color-positive, #059669)"
                    : "var(--color-accent, #00338D)";
                  return (
                    <Cell
                      key={row.id}
                      fill={tone}
                      fillOpacity={isMuted ? 0.35 : 1}
                    />
                  );
                })}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  );
}
