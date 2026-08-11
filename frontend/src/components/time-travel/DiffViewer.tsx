"use client";

import React, { useEffect, useState } from "react";
import { formatCurrency, formatPct } from "@/lib/formatters";

const REGION_NAMES: Record<string, string> = {
  R001: "Americas",
  R002: "EMEA",
  R003: "APAC",
  R004: "UK",
};

const SL_NAMES: Record<string, string> = {
  SL01: "Audit & Assurance",
  SL02: "Tax & Legal",
  SL03: "Advisory",
  SL04: "Consulting",
  SL05: "Risk & Compliance",
  SL06: "Technology",
};

export interface DiffRow {
  date: string;
  region_id: string;
  service_line_id: string;
  v1_revenue: number;
  v2_revenue: number;
  revenue_diff: number;
  pct_change: number;
}

export interface DiffData {
  v1_total_revenue: number;
  v2_total_revenue: number;
  delta: number;
  rows: DiffRow[];
}

export interface DiffViewerProps {
  v1: number;
  v2: number;
}

export function DiffViewer({ v1, v2 }: DiffViewerProps) {
  const [data, setData] = useState<DiffData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!v1 || !v2) {
      setData(null);
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);
    fetch(`/api/time-travel/diff?v1=${v1}&v2=${v2}`)
      .then((res) => {
        if (!res.ok) throw new Error(`Failed to fetch: ${res.status}`);
        return res.json();
      })
      .then((json) => {
        const raw = json.data ?? json;
        const rows = Array.isArray(raw.rows) ? raw.rows : Array.isArray(raw) ? raw : [];
        setData({
          v1_total_revenue: raw.v1_total_revenue ?? 0,
          v2_total_revenue: raw.v2_total_revenue ?? 0,
          delta: raw.delta ?? (raw.v2_total_revenue ?? 0) - (raw.v1_total_revenue ?? 0),
          rows: rows.map((r: Record<string, unknown>) => ({
            date: String(r.date ?? ""),
            region_id: String(r.region_id ?? ""),
            service_line_id: String(r.service_line_id ?? ""),
            v1_revenue: Number(r.v1_revenue ?? 0),
            v2_revenue: Number(r.v2_revenue ?? 0),
            revenue_diff: Number(r.revenue_diff ?? (Number(r.v2_revenue ?? 0) - Number(r.v1_revenue ?? 0))),
            pct_change: Number(r.pct_change ?? 0),
          })),
        });
      })
      .catch((err) => {
        setError(err instanceof Error ? err.message : "Failed to load diff");
        setData(null);
      })
      .finally(() => setLoading(false));
  }, [v1, v2]);

  if (!v1 || !v2) {
    return (
      <div
        className="rounded-xl border p-8"
        style={{ backgroundColor: "#1a1a1a", borderColor: "#2a2a2a" }}
      >
        <p className="text-center text-[#888888]">Select two versions to compare</p>
      </div>
    );
  }

  if (error) {
    return (
      <div
        className="rounded-xl border p-8"
        style={{ backgroundColor: "#1a1a1a", borderColor: "#2a2a2a" }}
      >
        <div className="flex h-32 items-center justify-center" style={{ color: "#f87171" }}>
          {error}
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div
        className="rounded-xl border p-8"
        style={{ backgroundColor: "#1a1a1a", borderColor: "#2a2a2a" }}
      >
        <div className="space-y-4">
          <div className="h-16 animate-pulse rounded-lg" style={{ backgroundColor: "#252525" }} />
          <div className="h-64 animate-pulse rounded-lg" style={{ backgroundColor: "#252525" }} />
        </div>
      </div>
    );
  }

  if (!data) {
    return (
      <div
        className="rounded-xl border p-8"
        style={{ backgroundColor: "#1a1a1a", borderColor: "#2a2a2a" }}
      >
        <p className="text-center text-[#888888]">No diff data available</p>
      </div>
    );
  }

  const d = data;
  const deltaColor = d.delta >= 0 ? "#4ade80" : "#f87171";
  const deltaPct = d.v1_total_revenue > 0
    ? ((d.delta / d.v1_total_revenue) * 100).toFixed(1)
    : "0.0";

  const regionSummary = d.rows.reduce<Record<string, number>>((acc, row) => {
    const name = REGION_NAMES[row.region_id] || row.region_id;
    acc[name] = (acc[name] || 0) + row.revenue_diff;
    return acc;
  }, {});

  const sortedRegions = Object.entries(regionSummary).sort((a, b) => Math.abs(b[1]) - Math.abs(a[1]));

  return (
    <div
      className="rounded-xl border overflow-hidden"
      style={{ backgroundColor: "#1a1a1a", borderColor: "#2a2a2a" }}
    >
      {/* Summary */}
      <div className="p-6 border-b" style={{ borderColor: "#2a2a2a" }}>
        <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
          <div>
            <p className="text-xs text-[#888888] mb-1">Version {v1} Revenue</p>
            <p className="text-lg font-semibold text-[#e5e5e5]">
              {formatCurrency(d.v1_total_revenue)}
            </p>
          </div>
          <div>
            <p className="text-xs text-[#888888] mb-1">Version {v2} Revenue</p>
            <p className="text-lg font-semibold text-[#e5e5e5]">
              {formatCurrency(d.v2_total_revenue)}
            </p>
          </div>
          <div>
            <p className="text-xs text-[#888888] mb-1">Net Change</p>
            <p className="text-lg font-semibold" style={{ color: deltaColor }}>
              {d.delta >= 0 ? "+" : ""}{formatCurrency(d.delta)}
            </p>
            <p className="text-xs mt-0.5" style={{ color: deltaColor }}>
              {d.delta >= 0 ? "+" : ""}{deltaPct}%
            </p>
          </div>
          <div>
            <p className="text-xs text-[#888888] mb-1">Rows Changed</p>
            <p className="text-lg font-semibold text-[#e5e5e5]">
              {d.rows.length.toLocaleString()}
            </p>
          </div>
        </div>
      </div>

      {/* Regional impact bars */}
      {sortedRegions.length > 0 && (
        <div className="p-6 border-b" style={{ borderColor: "#2a2a2a" }}>
          <h4 className="text-xs font-medium text-[#9ca3af] mb-3">Impact by Region</h4>
          <div className="space-y-2">
            {sortedRegions.map(([name, diff]) => {
              const maxAbs = Math.max(...sortedRegions.map(([, v]) => Math.abs(v)));
              const pct = maxAbs > 0 ? Math.abs(diff) / maxAbs * 100 : 0;
              const color = diff >= 0 ? "#4ade80" : "#f87171";
              return (
                <div key={name} className="flex items-center gap-3">
                  <span className="text-xs text-[#e5e5e5] w-20 flex-shrink-0">{name}</span>
                  <div className="flex-1 h-5 rounded-sm overflow-hidden" style={{ backgroundColor: "#252525" }}>
                    <div
                      className="h-full rounded-sm transition-all"
                      style={{ width: `${pct}%`, backgroundColor: color, opacity: 0.7 }}
                    />
                  </div>
                  <span className="text-xs font-medium w-28 text-right flex-shrink-0" style={{ color }}>
                    {diff >= 0 ? "+" : ""}{formatCurrency(diff)}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Table */}
      <div className="overflow-x-auto max-h-[480px] overflow-y-auto">
        <table className="w-full text-sm">
          <thead className="sticky top-0">
            <tr style={{ backgroundColor: "#151515" }}>
              <th className="px-4 py-3 text-left font-medium text-[#9ca3af]">Period</th>
              <th className="px-4 py-3 text-left font-medium text-[#9ca3af]">Region</th>
              <th className="px-4 py-3 text-left font-medium text-[#9ca3af]">Service Line</th>
              <th className="px-4 py-3 text-right font-medium text-[#9ca3af]">V{v1}</th>
              <th className="px-4 py-3 text-right font-medium text-[#9ca3af]">V{v2}</th>
              <th className="px-4 py-3 text-right font-medium text-[#9ca3af]">Diff</th>
              <th className="px-4 py-3 text-right font-medium text-[#9ca3af]">Change</th>
            </tr>
          </thead>
          <tbody>
            {d.rows.map((row, i) => {
              const period = row.date
                ? new Date(row.date).toLocaleDateString("en-US", { month: "short", year: "2-digit" })
                : "";
              return (
                <tr
                  key={`${row.date}-${row.region_id}-${row.service_line_id}-${i}`}
                  style={{ backgroundColor: i % 2 === 0 ? "#1a1a1a" : "#151515" }}
                >
                  <td className="px-4 py-2.5 text-[#e5e5e5]">{period}</td>
                  <td className="px-4 py-2.5 text-[#e5e5e5]">{REGION_NAMES[row.region_id] || row.region_id}</td>
                  <td className="px-4 py-2.5 text-[#e5e5e5]">{SL_NAMES[row.service_line_id] || row.service_line_id}</td>
                  <td className="px-4 py-2.5 text-right text-[#a3a3a3]">
                    {formatCurrency(row.v1_revenue)}
                  </td>
                  <td className="px-4 py-2.5 text-right text-[#e5e5e5]">
                    {formatCurrency(row.v2_revenue)}
                  </td>
                  <td
                    className="px-4 py-2.5 text-right font-medium"
                    style={{ color: row.revenue_diff >= 0 ? "#4ade80" : "#f87171" }}
                  >
                    {row.revenue_diff >= 0 ? "+" : ""}{formatCurrency(row.revenue_diff)}
                  </td>
                  <td
                    className="px-4 py-2.5 text-right font-medium"
                    style={{ color: row.pct_change >= 0 ? "#4ade80" : "#f87171" }}
                  >
                    {formatPct(row.pct_change)}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {d.rows.length === 0 && (
        <p className="p-6 text-center text-[#888888]">No differences found</p>
      )}
    </div>
  );
}
