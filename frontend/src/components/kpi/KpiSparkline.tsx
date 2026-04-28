"use client";

import { LineChart, Line, ResponsiveContainer, YAxis, Tooltip } from "recharts";
import { formatKpiValue, type KpiFormat } from "@/lib/formatters";

export interface SparkPoint {
  period: string;
  value: number;
}

interface Props {
  data: SparkPoint[];
  format: KpiFormat;
  /** Tailwind-friendly height; default 48px keeps it card-friendly. */
  height?: number;
  color?: string;
}

export function KpiSparkline({ data, format, height = 48, color }: Props) {
  if (!data || data.length === 0) {
    return <div style={{ height }} aria-hidden />;
  }
  const stroke = color ?? "var(--color-accent, #00338D)";
  return (
    <div style={{ height }}>
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={{ top: 4, right: 0, left: 0, bottom: 0 }}>
          <YAxis hide domain={["dataMin", "dataMax"]} />
          <Tooltip
            cursor={{ stroke: "var(--color-border, #e5e7eb)" }}
            contentStyle={{
              background: "var(--color-surface, #ffffff)",
              border: "1px solid var(--color-border, #e5e7eb)",
              borderRadius: 6,
              fontSize: 12,
            }}
            formatter={(v: number) => [formatKpiValue(v, format), ""]}
            labelFormatter={(l: string) =>
              new Date(l).toLocaleDateString("en-GB", { month: "short", year: "numeric" })
            }
          />
          <Line
            type="monotone"
            dataKey="value"
            stroke={stroke}
            strokeWidth={2}
            dot={false}
            isAnimationActive={false}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
