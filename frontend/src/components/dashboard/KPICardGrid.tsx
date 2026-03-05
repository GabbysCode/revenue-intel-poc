"use client";

import React, { useEffect, useState } from "react";
import { MetricCard } from "../shared/MetricCard";

interface KPIData {
  label: string;
  value: number;
  delta: number;
  prefix?: string;
  suffix?: string;
}

export interface KPICardGridProps {
  region?: string;
  periodStart?: string;
  periodEnd?: string;
}

function formatValue(value: number, prefix?: string, suffix?: string): string {
  if (prefix === "$") {
    if (value >= 1_000_000_000) return `${(value / 1_000_000_000).toFixed(1)}B`;
    if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`;
    if (value >= 1_000) return `${(value / 1_000).toFixed(1)}K`;
    return value.toLocaleString();
  }
  if (suffix === "%") {
    return value.toFixed(1);
  }
  return value.toLocaleString();
}

function SkeletonCard() {
  return (
    <div
      className="h-20 animate-pulse rounded-xl border"
      style={{ backgroundColor: "#1a1a1a", borderColor: "#2a2a2a" }}
    />
  );
}

export function KPICardGrid({ region, periodStart, periodEnd }: KPICardGridProps) {
  const [data, setData] = useState<KPIData[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const params = new URLSearchParams();
    if (region) params.set("region", region);
    if (periodStart) params.set("period_start", periodStart);
    if (periodEnd) params.set("period_end", periodEnd);

    fetch(`/api/dashboard/kpis?${params}`)
      .then((res) => {
        if (!res.ok) throw new Error(`Failed to fetch: ${res.status}`);
        return res.json();
      })
      .then((json) => {
        setData(Array.isArray(json) ? json : json.kpis ?? json.data ?? []);
      })
      .catch((err) => {
        setError(err instanceof Error ? err.message : "Failed to load KPIs");
      })
      .finally(() => {
        setLoading(false);
      });
  }, [region, periodStart, periodEnd]);

  if (error) {
    return (
      <div
        className="rounded-xl border p-6 text-center"
        style={{ backgroundColor: "#1a1a1a", borderColor: "#2a2a2a", color: "#f87171" }}
      >
        {error}
      </div>
    );
  }

  if (loading) {
    return (
      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        {Array.from({ length: 8 }).map((_, i) => (
          <SkeletonCard key={i} />
        ))}
      </div>
    );
  }

  const kpis = data ?? [];
  const prefix = (k: KPIData) => k.prefix ?? "";
  const suffix = (k: KPIData) => k.suffix ?? "";

  return (
    <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
      {kpis.map((kpi, i) => (
        <MetricCard
          key={i}
          label={kpi.label}
          value={formatValue(kpi.value, kpi.prefix, kpi.suffix)}
          delta={kpi.delta}
          prefix={kpi.prefix}
          suffix={kpi.suffix ?? ""}
        />
      ))}
    </div>
  );
}
