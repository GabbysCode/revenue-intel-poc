"use client";

import { ExecHeader } from "@/components/layout/ExecHeader";
import { CapabilityBreakdown } from "@/components/kpi/CapabilityBreakdown";
import { KpiSummaryCard, type KpiCardData } from "@/components/kpi/KpiSummaryCard";
import { KpiTrendChart } from "@/components/kpi/KpiTrendChart";
import { YtdVsBudget } from "@/components/kpi/YtdVsBudget";
import { useKpiDrilldown, useKpiSummary } from "@/lib/use-kpis";
import type { KpiFormat } from "@/lib/formatters";

type KpiTile = {
  id: string;
  label: string;
  lowerIsBetter: boolean;
  href: string;
  /** When true, no backend data yet — render the card as a "coming soon" tile and skip its drill-down row. */
  placeholder?: boolean;
};

const KPI_ORDER: readonly KpiTile[] = [
  { id: "chargeable-hours", label: "Chargeable Hours", lowerIsBetter: false, href: "/chargeable-hours" },
  { id: "rate-per-hour", label: "Rate Per Hour", lowerIsBetter: false, href: "/rate-per-hour" },
  { id: "gross-fee-days", label: "Gross Fee Days", lowerIsBetter: false, href: "/gross-fee-days" },
  { id: "unbilled-days", label: "Unbilled Days", lowerIsBetter: true, href: "/unbilled-days" },
  { id: "sales-forecast", label: "Sales Forecast", lowerIsBetter: false, href: "/sales-forecast", placeholder: true },
  { id: "chargeability", label: "Chargeability", lowerIsBetter: false, href: "/chargeability", placeholder: true },
  { id: "delivery-financials", label: "Delivery Financials", lowerIsBetter: false, href: "/delivery-financials", placeholder: true },
  { id: "staff-attrition", label: "Staff Attrition", lowerIsBetter: true, href: "/staff-attrition", placeholder: true },
];

export default function OverviewPage() {
  const summary = useKpiSummary();

  return (
    <>
      <ExecHeader
        title="Executive Overview"
        subtitle="Four KPIs that move the P&L. Filter by capability and period above."
      />
      <div className="p-6 space-y-8">
        <section>
          <h2 className="text-sm font-medium uppercase tracking-wide mb-3" style={{ color: "var(--color-text-muted, #6b7280)" }}>
            Headline KPIs
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
            {KPI_ORDER.map((k) => {
              if (k.placeholder) {
                return (
                  <KpiSummaryCard
                    key={k.id}
                    state="placeholder"
                    href={k.href}
                    placeholderLabel={k.label}
                  />
                );
              }
              const entry = summary.data?.kpis?.[k.id];
              const cardState =
                summary.state === "loading"
                  ? "loading"
                  : summary.state === "error"
                  ? "error"
                  : entry
                  ? "ready"
                  : "error";
              const cardData: KpiCardData | undefined = entry
                ? {
                    label: entry.label,
                    current: entry.current,
                    budget: entry.budget,
                    prior_year: entry.prior_year,
                    vs_budget_pct: entry.vs_budget_pct,
                    vs_py_pct: entry.vs_py_pct,
                    sparkline: entry.sparkline,
                    format: entry.format as KpiFormat,
                    lower_is_better: k.lowerIsBetter,
                  }
                : undefined;
              return (
                <KpiSummaryCard
                  key={k.id}
                  state={cardState}
                  data={cardData}
                  href={k.href}
                  errorMessage={summary.error || (entry ? undefined : "Missing in /summary response")}
                  onRetry={summary.reload}
                />
              );
            })}
          </div>
        </section>

        {KPI_ORDER.filter((k) => !k.placeholder).map((k) => (
          <KpiOverviewRow key={k.id} kpiId={k.id} label={k.label} lowerIsBetter={k.lowerIsBetter} />
        ))}
      </div>
    </>
  );
}

function KpiOverviewRow({
  kpiId,
  label,
  lowerIsBetter,
}: {
  kpiId: string;
  label: string;
  lowerIsBetter: boolean;
}) {
  const drill = useKpiDrilldown(kpiId);
  const fmt: KpiFormat = (drill.data?.format as KpiFormat) || "compact";
  return (
    <section>
      <h2 className="text-sm font-medium uppercase tracking-wide mb-3" style={{ color: "var(--color-text-muted, #6b7280)" }}>
        {label}
      </h2>
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <KpiTrendChart
          data={drill.data?.trend ?? []}
          format={fmt}
          loading={drill.state === "loading"}
          errorMessage={drill.state === "error" ? drill.error || "Failed to load trend" : undefined}
        />
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
    </section>
  );
}
