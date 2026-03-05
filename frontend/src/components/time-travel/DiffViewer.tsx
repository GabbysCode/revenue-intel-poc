"use client";

import React, { useEffect, useState } from "react";
import { formatCurrency, formatPct } from "@/lib/formatters";

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

  return (
    <div
      className="rounded-xl border overflow-hidden"
      style={{ backgroundColor: "#1a1a1a", borderColor: "#2a2a2a" }}
    >
      {/* Summary */}
      <div className="p-6 border-b" style={{ borderColor: "#2a2a2a" }}>
        <div className="flex flex-wrap gap-8">
          <div>
            <p className="text-xs text-[#888888]">Version {v1} Total Revenue</p>
            <p className="text-lg font-semibold text-[#e5e5e5]">
              {formatCurrency(d.v1_total_revenue)}
            </p>
          </div>
          <div>
            <p className="text-xs text-[#888888]">Version {v2} Total Revenue</p>
            <p className="text-lg font-semibold text-[#e5e5e5]">
              {formatCurrency(d.v2_total_revenue)}
            </p>
          </div>
          <div>
            <p className="text-xs text-[#888888]">Delta</p>
            <p className="text-lg font-semibold" style={{ color: deltaColor }}>
              {d.delta >= 0 ? "+" : ""}{formatCurrency(d.delta)}
            </p>
          </div>
        </div>
      </div>

      {/* Table */}
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr style={{ backgroundColor: "#151515" }}>
              <th className="px-4 py-3 text-left font-medium text-[#9ca3af]">Date</th>
              <th className="px-4 py-3 text-left font-medium text-[#9ca3af]">Region</th>
              <th className="px-4 py-3 text-left font-medium text-[#9ca3af]">Service Line</th>
              <th className="px-4 py-3 text-right font-medium text-[#9ca3af]">V1 Revenue</th>
              <th className="px-4 py-3 text-right font-medium text-[#9ca3af]">V2 Revenue</th>
              <th className="px-4 py-3 text-right font-medium text-[#9ca3af]">Diff</th>
              <th className="px-4 py-3 text-right font-medium text-[#9ca3af]">% Change</th>
            </tr>
          </thead>
          <tbody>
            {d.rows.map((row, i) => (
              <tr
                key={`${row.date}-${row.region_id}-${row.service_line_id}-${i}`}
                style={{ backgroundColor: i % 2 === 0 ? "#1a1a1a" : "#151515" }}
              >
                <td className="px-4 py-3 text-[#e5e5e5]">{row.date}</td>
                <td className="px-4 py-3 text-[#e5e5e5]">{row.region_id}</td>
                <td className="px-4 py-3 text-[#e5e5e5]">{row.service_line_id}</td>
                <td className="px-4 py-3 text-right text-[#e5e5e5]">
                  {formatCurrency(row.v1_revenue)}
                </td>
                <td className="px-4 py-3 text-right text-[#e5e5e5]">
                  {formatCurrency(row.v2_revenue)}
                </td>
                <td
                  className="px-4 py-3 text-right font-medium"
                  style={{ color: row.revenue_diff >= 0 ? "#4ade80" : "#f87171" }}
                >
                  {row.revenue_diff >= 0 ? "+" : ""}{formatCurrency(row.revenue_diff)}
                </td>
                <td
                  className="px-4 py-3 text-right font-medium"
                  style={{ color: row.pct_change >= 0 ? "#4ade80" : "#f87171" }}
                >
                  {formatPct(row.pct_change)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {d.rows.length === 0 && (
        <p className="p-6 text-center text-[#888888]">No differences found</p>
      )}
    </div>
  );
}
