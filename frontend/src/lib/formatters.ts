export function formatCurrency(value: number, compact = false): string {
  if (compact) {
    if (value >= 1_000_000_000) return `£${(value / 1_000_000_000).toFixed(1)}B`;
    if (value >= 1_000_000) return `£${(value / 1_000_000).toFixed(1)}M`;
    if (value >= 1_000) return `£${(value / 1_000).toFixed(1)}K`;
  }
  return new Intl.NumberFormat("en-GB", { style: "currency", currency: "GBP", maximumFractionDigits: 0 }).format(value);
}

export function formatNumber(value: number, compact = false): string {
  if (compact) {
    if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`;
    if (value >= 1_000) return `${(value / 1_000).toFixed(1)}K`;
  }
  return new Intl.NumberFormat("en-GB").format(value);
}

export function formatPct(value: number): string {
  return `${value >= 0 ? "+" : ""}${value.toFixed(2)}%`;
}

export function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString("en-GB", { month: "short", year: "numeric" });
}

export function formatDateShort(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString("en-GB", { month: "short" });
}

export type KpiFormat = "compact" | "currency" | "decimal";

/** Single entry point used by every KPI surface so changes flow through one place. */
export function formatKpiValue(value: number | null | undefined, fmt: KpiFormat): string {
  if (value === null || value === undefined || Number.isNaN(value)) return "—";
  if (fmt === "currency") return formatCurrency(value, false);
  if (fmt === "decimal") return new Intl.NumberFormat("en-GB", { maximumFractionDigits: 1 }).format(value);
  return formatNumber(value, true);
}
