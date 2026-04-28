"use client";

import { useMemo, useState } from "react";
import { DeckProgressModal, type KpiSnapshot } from "@/components/tellr/DeckProgressModal";
import { useFilterState } from "@/lib/filter-state";
import { useKpiSummary } from "@/lib/use-kpis";

interface Props {
  /** Optional override prompt body; when omitted we synthesise one from the current KPIs. */
  summaryOverride?: string;
}

export function ExportToPresentationButton({ summaryOverride }: Props) {
  const { filters, periodEnd, ytdStart } = useFilterState();
  const summary = useKpiSummary();
  const [open, setOpen] = useState(false);

  const kpiSnapshot = useMemo<KpiSnapshot>(() => {
    const k = summary.data?.kpis;
    if (!k) return {};
    const num = (v: number | null | undefined) => (v === null || v === undefined ? null : v);
    return {
      chargeable_hours: num(k["chargeable-hours"]?.current),
      hourly_rate: num(k["rate-per-hour"]?.current),
      gross_fee_days: num(k["gross-fee-days"]?.current),
      unbilled_days: num(k["unbilled-days"]?.current),
    };
  }, [summary.data]);

  const generatedSummary = useMemo(() => {
    if (summaryOverride) return summaryOverride;
    const k = summary.data?.kpis;
    if (!k) return "Executive KPI summary for the current period.";
    const lines = [
      `Executive KPI summary — view: ${filters.viewMode === "ytd" ? "YTD" : "Current month"}, period end ${periodEnd}.`,
      "",
      "Headline KPIs:",
      `- Chargeable hours: ${k["chargeable-hours"]?.current?.toFixed(0) ?? "—"} (${formatVar(k["chargeable-hours"]?.vs_budget_pct)} vs budget)`,
      `- Rate per hour: £${k["rate-per-hour"]?.current?.toFixed(0) ?? "—"} (${formatVar(k["rate-per-hour"]?.vs_budget_pct)} vs budget)`,
      `- Gross fee days: ${k["gross-fee-days"]?.current?.toFixed(0) ?? "—"} (${formatVar(k["gross-fee-days"]?.vs_budget_pct)} vs budget)`,
      `- Unbilled days: ${k["unbilled-days"]?.current?.toFixed(1) ?? "—"} (${formatVar(k["unbilled-days"]?.vs_budget_pct)} vs budget; lower is better)`,
    ];
    if (filters.capability) lines.push(`Capability filter: ${filters.capability}`);
    return lines.join("\n");
  }, [summary.data, filters, periodEnd, summaryOverride]);

  const disabled = summary.state !== "ready";

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        disabled={disabled}
        className="inline-flex items-center gap-2 px-3.5 py-2 rounded-md text-sm font-medium transition-opacity disabled:opacity-50"
        style={{ background: "var(--color-accent, #00338D)", color: "var(--color-on-accent, #ffffff)" }}
        title={disabled ? "Loading KPIs…" : "Export current view as a board-ready deck"}
      >
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v12m8-8H4" />
        </svg>
        Export to Presentation
      </button>
      <DeckProgressModal
        open={open}
        onClose={() => setOpen(false)}
        summary={generatedSummary}
        periodStart={filters.viewMode === "ytd" ? ytdStart : periodEnd}
        periodEnd={periodEnd}
        capability={filters.capability}
        kpiSnapshot={kpiSnapshot}
      />
    </>
  );
}

function formatVar(v: number | null | undefined): string {
  if (v === null || v === undefined || Number.isNaN(v)) return "n/a";
  return `${v >= 0 ? "+" : ""}${v.toFixed(1)}%`;
}
