"use client";

import { CapabilityBreakdown } from "@/components/kpi/CapabilityBreakdown";
import { KpiSummaryCard, type KpiCardData } from "@/components/kpi/KpiSummaryCard";
import { KpiTrendChart } from "@/components/kpi/KpiTrendChart";
import { YtdVsBudget } from "@/components/kpi/YtdVsBudget";
import { useKpiDrilldown, useKpiSummary } from "@/lib/use-kpis";
import type { KpiFormat } from "@/lib/formatters";

interface Props {
  kpi: "chargeable-hours" | "rate-per-hour" | "gross-fee-days" | "unbilled-days";
  /** Inverts variance colouring; pass `true` for unbilled-days. */
  lowerIsBetter: boolean;
}

export function KpiDrillDown({ kpi, lowerIsBetter }: Props) {
  const summary = useKpiSummary();
  const drill = useKpiDrilldown(kpi);

  const summaryEntry = summary.data?.kpis?.[kpi];
  const cardData: KpiCardData | undefined = summaryEntry
    ? {
        label: summaryEntry.label,
        current: summaryEntry.current,
        budget: summaryEntry.budget,
        prior_year: summaryEntry.prior_year,
        vs_budget_pct: summaryEntry.vs_budget_pct,
        vs_py_pct: summaryEntry.vs_py_pct,
        sparkline: summaryEntry.sparkline,
        format: summaryEntry.format as KpiFormat,
        lower_is_better: lowerIsBetter,
      }
    : undefined;

  const fmt: KpiFormat = (drill.data?.format as KpiFormat) || "compact";

  return (
    <div className="p-6 space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <KpiSummaryCard
          state={summary.state === "loading" ? "loading" : summary.state === "error" ? "error" : "ready"}
          data={cardData}
          errorMessage={summary.error || undefined}
          onRetry={summary.reload}
        />
        <KpiTrendChart
          data={drill.data?.trend ?? []}
          format={fmt}
          loading={drill.state === "loading"}
          errorMessage={drill.state === "error" ? drill.error || "Failed to load trend" : undefined}
          height={180}
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <CapabilityBreakdown
          data={drill.data?.capability_breakdown ?? []}
          format={fmt}
          lowerIsBetter={lowerIsBetter}
          loading={drill.state === "loading"}
          errorMessage={drill.state === "error" ? drill.error || "Failed to load capability mix" : undefined}
        />
        <YtdVsBudget
          data={drill.data?.ytd_vs_budget ?? []}
          format={fmt}
          lowerIsBetter={lowerIsBetter}
          loading={drill.state === "loading"}
          errorMessage={drill.state === "error" ? drill.error || "Failed to load YTD" : undefined}
        />
      </div>
    </div>
  );
}
