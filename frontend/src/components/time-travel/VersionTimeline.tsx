"use client";

import React, { useEffect, useState } from "react";
import { formatCurrency } from "@/lib/formatters";

export interface Version {
  version_id: number;
  version_date: string;
  record_count: number;
  total_revenue: number;
}

export interface VersionTimelineProps {
  selectedVersion?: number | null;
  onSelect?: (versionId: number) => void;
  onVersionsLoaded?: (versions: Version[]) => void;
}

export function VersionTimeline({ selectedVersion, onSelect, onVersionsLoaded }: VersionTimelineProps) {
  const [versions, setVersions] = useState<Version[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/time-travel/versions")
      .then((res) => {
        if (!res.ok) throw new Error(`Failed to fetch: ${res.status}`);
        return res.json();
      })
      .then((json) => {
        const raw = json.data ?? json.versions ?? json;
        const arr = Array.isArray(raw) ? raw : [];
        const mapped = arr.map((v: { version_id?: number; version_date?: string; record_count?: number; total_revenue?: number }) => ({
          version_id: v.version_id ?? 0,
          version_date: v.version_date ?? "",
          record_count: v.record_count ?? 0,
          total_revenue: v.total_revenue ?? 0,
        }));
        setVersions(mapped);
        onVersionsLoaded?.(mapped);
      })
      .catch((err) => {
        setError(err instanceof Error ? err.message : "Failed to load versions");
      })
      .finally(() => setLoading(false));
  }, []);

  if (error) {
    return (
      <div
        className="rounded-xl border p-6"
        style={{ backgroundColor: "#1a1a1a", borderColor: "#2a2a2a" }}
      >
        <div className="flex h-24 items-center justify-center" style={{ color: "#f87171" }}>
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
        <div className="h-24 animate-pulse rounded-lg" style={{ backgroundColor: "#252525" }} />
      </div>
    );
  }

  if (versions.length === 0) {
    return (
      <div
        className="rounded-xl border p-6"
        style={{ backgroundColor: "#1a1a1a", borderColor: "#2a2a2a" }}
      >
        <p className="text-center text-[#888888]">No versions available</p>
      </div>
    );
  }

  return (
    <div
      className="rounded-xl border p-6 overflow-x-auto"
      style={{ backgroundColor: "#1a1a1a", borderColor: "#2a2a2a" }}
    >
      <div className="flex items-start gap-0 min-w-max pb-4">
        {versions.map((v, i) => (
          <React.Fragment key={v.version_id}>
            {/* Connector line */}
            {i > 0 && (
              <div
                className="flex-shrink-0 w-8 h-0.5 self-[22px]"
                style={{ backgroundColor: "#2a2a2a", minWidth: 32 }}
              />
            )}
            <button
              type="button"
              onClick={() => onSelect?.(v.version_id)}
              className={`
                flex-shrink-0 w-48 rounded-lg border p-4 text-left transition-colors
                hover:bg-[#222222]
                ${selectedVersion === v.version_id ? "border-[#4ade80]" : "border-[#2a2a2a]"}
              `}
              style={{ backgroundColor: selectedVersion === v.version_id ? "#1e2a1e" : "#1a1a1a" }}
            >
              <div className="flex items-center gap-2 mb-2">
                <div
                  className="w-2.5 h-2.5 rounded-full"
                  style={{
                    backgroundColor: selectedVersion === v.version_id ? "#4ade80" : "#2a2a2a",
                  }}
                />
                <span className="text-xs font-medium text-[#888888]">v{v.version_id}</span>
              </div>
              <p className="text-sm font-medium text-[#e5e5e5]">
                {new Date(v.version_date).toLocaleDateString("en-US", {
                  month: "short",
                  day: "numeric",
                  year: "numeric",
                })}
              </p>
              <p className="text-xs text-[#888888] mt-1">
                {v.record_count.toLocaleString()} records
              </p>
              <p className="text-sm font-semibold mt-2" style={{ color: "#4ade80" }}>
                {formatCurrency(v.total_revenue, true)}
              </p>
            </button>
          </React.Fragment>
        ))}
      </div>
    </div>
  );
}
