"use client";

import Link from "next/link";
import { KpiSparkline, type SparkPoint } from "@/components/kpi/KpiSparkline";
import { formatKpiValue, formatPct, type KpiFormat } from "@/lib/formatters";

export type KpiCardState = "loading" | "error" | "ready" | "placeholder";

export interface KpiCardData {
  label: string;
  current: number | null;
  budget: number | null;
  prior_year: number | null;
  vs_budget_pct: number | null;
  vs_py_pct: number | null;
  sparkline: SparkPoint[];
  format: KpiFormat;
  /** When true (e.g. unbilled-days), positive variance is bad. */
  lower_is_better: boolean;
}

interface Props {
  state: KpiCardState;
  data?: KpiCardData;
  href?: string;
  errorMessage?: string;
  onRetry?: () => void;
  /** Persist a stable height so loading/ready transitions don't reflow. */
  minHeight?: number;
  /** Required when state === "placeholder" — title shown in the empty card. */
  placeholderLabel?: string;
}

function varianceTone(pct: number | null, lowerIsBetter: boolean): "positive" | "negative" | "neutral" {
  if (pct === null || pct === undefined || Number.isNaN(pct)) return "neutral";
  const isUp = pct >= 0;
  // For "lower is better" KPIs, an increase is bad, a decrease is good.
  const good = lowerIsBetter ? !isUp : isUp;
  return good ? "positive" : "negative";
}

const TONE_COLOR: Record<"positive" | "negative" | "neutral", string> = {
  positive: "var(--color-positive, #059669)",
  negative: "var(--color-negative, #dc2626)",
  neutral: "var(--color-text-muted, #6b7280)",
};

export function KpiSummaryCard({
  state,
  data,
  href,
  errorMessage,
  onRetry,
  minHeight = 220,
  placeholderLabel,
}: Props) {
  const wrapperStyle: React.CSSProperties = {
    minHeight,
    background: "var(--color-surface, #ffffff)",
    border: "1px solid var(--color-border, #e5e7eb)",
    borderRadius: 12,
    padding: 20,
  };

  if (state === "placeholder") {
    const placeholderStyle: React.CSSProperties = {
      ...wrapperStyle,
      background: "var(--color-surface-2, #f9fafb)",
      borderStyle: "dashed",
      display: "flex",
      flexDirection: "column",
      justifyContent: "space-between",
    };
    const inner = (
      <div style={placeholderStyle}>
        <div>
          <p
            className="text-xs uppercase tracking-wide font-medium"
            style={{ color: "var(--color-text-muted, #6b7280)" }}
          >
            {placeholderLabel || "KPI"}
          </p>
          <p
            className="mt-2 text-3xl font-semibold tabular-nums"
            style={{ color: "var(--color-text-muted, #9ca3af)" }}
          >
            —
          </p>
        </div>
        <div>
          <span
            className="inline-flex items-center gap-1.5 px-2 py-1 rounded-md text-[11px] font-medium uppercase tracking-wide"
            style={{
              background: "var(--color-surface, #ffffff)",
              border: "1px solid var(--color-border, #e5e7eb)",
              color: "var(--color-text-muted, #6b7280)",
            }}
          >
            <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            Awaiting data
          </span>
          <p className="mt-2 text-xs" style={{ color: "var(--color-text-muted, #6b7280)" }}>
            Source not connected yet.
          </p>
        </div>
      </div>
    );
    if (href) {
      return (
        <Link href={href} className="block hover:shadow-sm transition-shadow rounded-xl">
          {inner}
        </Link>
      );
    }
    return inner;
  }

  if (state === "loading") {
    return (
      <div style={wrapperStyle} aria-busy="true" aria-live="polite">
        <div className="h-3 w-24 rounded animate-pulse" style={{ background: "var(--color-surface-2, #f3f4f6)" }} />
        <div className="mt-4 h-8 w-32 rounded animate-pulse" style={{ background: "var(--color-surface-2, #f3f4f6)" }} />
        <div className="mt-3 h-3 w-40 rounded animate-pulse" style={{ background: "var(--color-surface-2, #f3f4f6)" }} />
        <div className="mt-1 h-3 w-36 rounded animate-pulse" style={{ background: "var(--color-surface-2, #f3f4f6)" }} />
        <div className="mt-4 h-12 rounded animate-pulse" style={{ background: "var(--color-surface-2, #f3f4f6)" }} />
      </div>
    );
  }

  if (state === "error" || !data) {
    return (
      <div style={wrapperStyle} role="alert">
        <p className="text-xs uppercase tracking-wide font-medium" style={{ color: "var(--color-text-muted, #6b7280)" }}>
          KPI unavailable
        </p>
        <p className="mt-2 text-sm" style={{ color: "var(--color-negative, #dc2626)" }}>
          {errorMessage || "Could not load this KPI."}
        </p>
        {onRetry && (
          <button
            type="button"
            onClick={onRetry}
            className="mt-3 text-xs font-medium underline"
            style={{ color: "var(--color-accent, #00338D)" }}
          >
            Retry
          </button>
        )}
      </div>
    );
  }

  const budgetTone = varianceTone(data.vs_budget_pct, data.lower_is_better);
  const pyTone = varianceTone(data.vs_py_pct, data.lower_is_better);

  const inner = (
    <div style={wrapperStyle}>
      <p className="text-xs uppercase tracking-wide font-medium" style={{ color: "var(--color-text-muted, #6b7280)" }}>
        {data.label}
      </p>
      <p className="mt-2 text-3xl font-semibold tabular-nums" style={{ color: "var(--color-text, #111827)" }}>
        {formatKpiValue(data.current, data.format)}
      </p>
      <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
        <div>
          <p style={{ color: "var(--color-text-muted, #6b7280)" }}>vs. budget</p>
          <p className="font-medium tabular-nums" style={{ color: TONE_COLOR[budgetTone] }}>
            {data.vs_budget_pct === null ? "—" : formatPct(data.vs_budget_pct)}
          </p>
        </div>
        <div>
          <p style={{ color: "var(--color-text-muted, #6b7280)" }}>vs. prior year</p>
          <p className="font-medium tabular-nums" style={{ color: TONE_COLOR[pyTone] }}>
            {data.vs_py_pct === null ? "—" : formatPct(data.vs_py_pct)}
          </p>
        </div>
      </div>
      <div className="mt-3">
        <KpiSparkline data={data.sparkline} format={data.format} />
      </div>
    </div>
  );

  if (href) {
    return (
      <Link href={href} className="block hover:shadow-sm transition-shadow rounded-xl">
        {inner}
      </Link>
    );
  }
  return inner;
}
