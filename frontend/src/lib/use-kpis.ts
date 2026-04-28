"use client";

import { useEffect, useMemo, useState } from "react";
import { apiFetch } from "@/lib/apiFetch";
import { useFilterState } from "@/lib/filter-state";
import type { KpiCardData } from "@/components/kpi/KpiSummaryCard";
import type { TrendPoint } from "@/components/kpi/KpiTrendChart";
import type { CapabilityRow } from "@/components/kpi/CapabilityBreakdown";
import type { YtdPoint } from "@/components/kpi/YtdVsBudget";

export type FetchState = "loading" | "ready" | "error";

interface SummaryResponse {
  view: string;
  period: Record<string, string>;
  filters: { region: string | null; capability: string | null };
  kpis: Record<string, KpiCardData>;
}

interface DrilldownResponse {
  id: string;
  label: string;
  unit: string;
  format: string;
  lower_is_better: boolean;
  view: string;
  period: Record<string, string>;
  filters: { region: string | null; capability: string | null };
  trend: TrendPoint[];
  capability_breakdown: CapabilityRow[];
  ytd_vs_budget: YtdPoint[];
}

function buildQuery(params: Record<string, string | null | undefined>): string {
  const usp = new URLSearchParams();
  Object.entries(params).forEach(([k, v]) => {
    if (v !== null && v !== undefined && v !== "") usp.set(k, v);
  });
  const s = usp.toString();
  return s ? `?${s}` : "";
}

export function useKpiSummary() {
  const { filters, periodEnd, ytdStart } = useFilterState();
  const [state, setState] = useState<FetchState>("loading");
  const [data, setData] = useState<SummaryResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [reloadToken, setReloadToken] = useState(0);

  const params = useMemo(() => ({
    view: filters.viewMode,
    period_start: filters.viewMode === "ytd" ? ytdStart : periodEnd,
    period_end: periodEnd,
    capability: filters.capability,
  }), [filters.viewMode, filters.capability, periodEnd, ytdStart]);

  useEffect(() => {
    let cancelled = false;
    setState("loading");
    setError(null);
    apiFetch(`/api/kpis/summary${buildQuery(params)}`)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))))
      .then((j: SummaryResponse) => {
        if (cancelled) return;
        setData(j);
        setState("ready");
      })
      .catch((e) => {
        if (cancelled) return;
        setError(e instanceof Error ? e.message : "Failed to load summary");
        setState("error");
      });
    return () => {
      cancelled = true;
    };
  }, [params, reloadToken]);

  return { state, data, error, reload: () => setReloadToken((t) => t + 1) };
}

export function useKpiDrilldown(kpiId: string) {
  const { filters, periodEnd, ytdStart } = useFilterState();
  const [state, setState] = useState<FetchState>("loading");
  const [data, setData] = useState<DrilldownResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [reloadToken, setReloadToken] = useState(0);

  const params = useMemo(() => ({
    view: filters.viewMode,
    period_start: filters.viewMode === "ytd" ? ytdStart : periodEnd,
    period_end: periodEnd,
    capability: filters.capability,
  }), [filters.viewMode, filters.capability, periodEnd, ytdStart]);

  useEffect(() => {
    let cancelled = false;
    setState("loading");
    setError(null);
    apiFetch(`/api/kpis/${kpiId}${buildQuery(params)}`)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))))
      .then((j: DrilldownResponse) => {
        if (cancelled) return;
        setData(j);
        setState("ready");
      })
      .catch((e) => {
        if (cancelled) return;
        setError(e instanceof Error ? e.message : "Failed to load drill-down");
        setState("error");
      });
    return () => {
      cancelled = true;
    };
  }, [kpiId, params, reloadToken]);

  return { state, data, error, reload: () => setReloadToken((t) => t + 1) };
}
