"use client";

import React, { useEffect, useState } from "react";

export interface Anomaly {
  table: string;
  check: string;
  timestamp: string;
  failures: number;
  details: string;
}

type SortKey = "failures" | "timestamp" | "table";
type SortOrder = "asc" | "desc";

export function AnomalyTable() {
  const [data, setData] = useState<Anomaly[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [sortKey, setSortKey] = useState<SortKey>("failures");
  const [sortOrder, setSortOrder] = useState<SortOrder>("desc");

  useEffect(() => {
    fetch("/api/data-quality/anomalies")
      .then((res) => {
        if (!res.ok) throw new Error(`Failed to fetch: ${res.status}`);
        return res.json();
      })
      .then((json) => {
        const raw = json.data ?? json.anomalies ?? json;
        const arr = Array.isArray(raw) ? raw : [];
        setData(
          arr.map((a: { table?: string; check?: string; timestamp?: string; failures?: number; details?: string }) => ({
            table: String(a.table ?? ""),
            check: String(a.check ?? ""),
            timestamp: String(a.timestamp ?? ""),
            failures: Number(a.failures ?? 0),
            details: String(a.details ?? ""),
          }))
        );
      })
      .catch((err) => {
        setError(err instanceof Error ? err.message : "Failed to load anomalies");
      })
      .finally(() => setLoading(false));
  }, []);

  const handleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortOrder(sortOrder === "asc" ? "desc" : "asc");
    } else {
      setSortKey(key);
      setSortOrder("desc");
    }
  };

  const sorted = [...data].sort((a, b) => {
    let aVal: string | number = a[sortKey];
    let bVal: string | number = b[sortKey];
    if (sortKey === "timestamp") {
      aVal = new Date(a.timestamp).getTime();
      bVal = new Date(b.timestamp).getTime();
    }
    if (typeof aVal === "number" && typeof bVal === "number") {
      return sortOrder === "asc" ? aVal - bVal : bVal - aVal;
    }
    const cmp = String(aVal).localeCompare(String(bVal));
    return sortOrder === "asc" ? cmp : -cmp;
  });

  if (error) {
    return (
      <div
        className="rounded-xl border p-6"
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
        className="rounded-xl border p-6"
        style={{ backgroundColor: "#1a1a1a", borderColor: "#2a2a2a" }}
      >
        <div className="h-64 animate-pulse rounded-lg" style={{ backgroundColor: "#252525" }} />
      </div>
    );
  }

  const formatTs = (ts: string) =>
    ts ? new Date(ts).toLocaleString("en-US", { dateStyle: "short", timeStyle: "short" }) : "-";

  return (
    <div
      className="rounded-xl border overflow-hidden"
      style={{ backgroundColor: "#1a1a1a", borderColor: "#2a2a2a" }}
    >
      <div className="p-4 border-b" style={{ borderColor: "#2a2a2a" }}>
        <h3 className="font-bold text-white">Flagged Anomalies</h3>
        <p className="text-sm text-[#9ca3af]">Data quality issues requiring attention</p>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr style={{ backgroundColor: "#151515" }}>
              <th className="px-4 py-3 text-left font-medium text-[#9ca3af]">Table</th>
              <th className="px-4 py-3 text-left font-medium text-[#9ca3af]">Check</th>
              <th className="px-4 py-3 text-left font-medium text-[#9ca3af]">Timestamp</th>
              <th
                className="px-4 py-3 text-right font-medium text-[#9ca3af] cursor-pointer hover:text-[#e5e5e5] select-none"
                onClick={() => handleSort("failures")}
              >
                Failures {sortKey === "failures" && (sortOrder === "asc" ? "↑" : "↓")}
              </th>
              <th className="px-4 py-3 text-left font-medium text-[#9ca3af]">Details</th>
            </tr>
          </thead>
          <tbody>
            {sorted.map((row, i) => (
              <tr
                key={`${row.table}-${row.check}-${row.timestamp}-${i}`}
                style={{
                  backgroundColor: i % 2 === 0 ? "#1a1a1a" : "#151515",
                }}
              >
                <td className="px-4 py-3 text-[#e5e5e5]">{row.table}</td>
                <td className="px-4 py-3 text-[#e5e5e5]">{row.check}</td>
                <td className="px-4 py-3 text-[#e5e5e5]">{formatTs(row.timestamp)}</td>
                <td
                  className={`px-4 py-3 text-right font-medium ${
                    row.failures > 10 ? "text-[#f87171]" : "text-[#e5e5e5]"
                  }`}
                >
                  {row.failures}
                </td>
                <td className="px-4 py-3 text-[#888888] max-w-xs truncate">{row.details}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {sorted.length === 0 && (
        <p className="p-6 text-center text-[#888888]">No anomalies found</p>
      )}
    </div>
  );
}
