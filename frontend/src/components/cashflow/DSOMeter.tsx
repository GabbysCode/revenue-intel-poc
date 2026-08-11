"use client";

import React, { useEffect, useState } from "react";
import { formatCurrency } from "@/lib/formatters";

export interface DSOData {
  dso: number;
  total_ar: number;
  total_billed: number;
}

export interface DSOMeterProps {
  region?: string;
  periodStart?: string;
  periodEnd?: string;
}

export function DSOMeter({ region, periodStart, periodEnd }: DSOMeterProps) {
  const [data, setData] = useState<DSOData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    setError(null);
    const params = new URLSearchParams();
    if (region) params.set("region", region);
    if (periodStart) params.set("period_start", periodStart);
    if (periodEnd) params.set("period_end", periodEnd);

    fetch(`/api/cashflow/dso?${params}`)
      .then((res) => {
        if (!res.ok) throw new Error(`Failed to fetch: ${res.status}`);
        return res.json();
      })
      .then((json) => {
        const raw = json.data ?? json;
        setData({
          dso: Number(raw.dso_days ?? raw.dso ?? 0),
          total_ar: Number(raw.total_ar ?? raw.totalAR ?? 0),
          total_billed: Number(raw.total_billed ?? raw.totalBilled ?? 0),
        });
      })
      .catch((err) => {
        setError(err instanceof Error ? err.message : "Failed to load DSO");
      })
      .finally(() => setLoading(false));
  }, [region, periodStart, periodEnd]);

  if (error) {
    return (
      <div
        className="rounded-xl border p-6"
        style={{ backgroundColor: "#1a1a1a", borderColor: "#2a2a2a" }}
      >
        <div className="flex h-48 items-center justify-center" style={{ color: "#f87171" }}>
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
        <div className="flex flex-col items-center gap-4">
          <div className="w-40 h-24 rounded-full animate-pulse" style={{ backgroundColor: "#252525" }} />
          <div className="h-12 w-full animate-pulse rounded-lg" style={{ backgroundColor: "#252525" }} />
        </div>
      </div>
    );
  }

  const d = data!;
  const dsoColor = d.dso < 60 ? "#4ade80" : d.dso <= 75 ? "#facc15" : "#f87171";
  const fillPct = Math.min(100, (d.dso / 90) * 100);

  return (
    <div
      className="rounded-xl border p-6"
      style={{ backgroundColor: "#1a1a1a", borderColor: "#2a2a2a" }}
    >
      <h3 className="font-bold text-white mb-1">Days Sales Outstanding</h3>
      <p className="text-sm text-[#9ca3af] mb-4">Current DSO</p>

      <div className="flex flex-col items-center">
        <div className="relative w-48 h-24 mb-4">
          <svg viewBox="0 0 200 100" className="w-full h-full">
            <path
              d="M 20 80 A 80 80 0 0 1 180 80"
              fill="none"
              stroke="#2a2a2a"
              strokeWidth="12"
              strokeLinecap="round"
            />
            <path
              d="M 20 80 A 80 80 0 0 1 180 80"
              fill="none"
              stroke={dsoColor}
              strokeWidth="12"
              strokeLinecap="round"
              strokeDasharray={`${(fillPct / 100) * 251.2} 251.2`}
            />
          </svg>
          <div className="absolute inset-0 flex items-center justify-center pt-4">
            <span className="text-3xl font-bold" style={{ color: dsoColor }}>
              {Math.round(d.dso)}
            </span>
            <span className="text-sm text-[#888888] ml-1">days</span>
          </div>
        </div>

        <div className="w-full space-y-2">
          <div className="flex justify-between text-sm">
            <span className="text-[#888888]">Total AR</span>
            <span className="font-medium text-[#e5e5e5]">{formatCurrency(d.total_ar)}</span>
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-[#888888]">Total Billed</span>
            <span className="font-medium text-[#e5e5e5]">{formatCurrency(d.total_billed)}</span>
          </div>
        </div>
      </div>
    </div>
  );
}
