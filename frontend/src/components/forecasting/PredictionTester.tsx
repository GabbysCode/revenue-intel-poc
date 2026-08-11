"use client";

import React, { useState } from "react";

const MODELS = ["prophet", "xgboost", "hybrid"] as const;
const REGION_OPTIONS = [
  { label: "All", id: "" },
  { label: "Americas", id: "R001" },
  { label: "EMEA", id: "R002" },
  { label: "APAC", id: "R003" },
  { label: "UK", id: "R004" },
];

interface ForecastResult {
  month?: string;
  forecast?: number;
  lower80?: number;
  upper80?: number;
}

export interface PredictionTesterProps {
  onForecastRun?: (params: { horizon: number; model: string; region?: string }) => void;
}

function formatCompactCurrency(value: number): string {
  if (value >= 1_000_000_000) return `$${(value / 1_000_000_000).toFixed(1)}B`;
  if (value >= 1_000_000) return `$${(value / 1_000_000).toFixed(1)}M`;
  if (value >= 1_000) return `$${(value / 1_000).toFixed(1)}K`;
  return `$${value}`;
}

export function PredictionTester({ onForecastRun }: PredictionTesterProps) {
  const [horizon, setHorizon] = useState(6);
  const [model, setModel] = useState<"prophet" | "xgboost" | "hybrid">("hybrid");
  const [regionId, setRegionId] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [results, setResults] = useState<ForecastResult[] | null>(null);

  const handleRun = () => {
    setLoading(true);
    setError(null);
    setResults(null);
    const params = new URLSearchParams({ horizon: String(horizon), model });
    if (regionId) params.set("region", regionId);

    fetch(`/api/forecasting/predict?${params}`)
      .then((res) => {
        if (!res.ok) throw new Error(`Failed to fetch: ${res.status}`);
        return res.json();
      })
      .then((json) => {
        const points = Array.isArray(json.forecast) ? json.forecast : [];
        setResults(
          points.map((p: { date?: string; revenue?: number; lower_80?: number; upper_80?: number }) => ({
            month: p.date ? new Date(p.date).toLocaleDateString("en-US", { month: "short", year: "2-digit" }) : "",
            forecast: p.revenue ?? 0,
            lower80: p.lower_80,
            upper80: p.upper_80,
          }))
        );
        onForecastRun?.({ horizon, model, region: regionId || undefined });
      })
      .catch((err) => {
        setError(err instanceof Error ? err.message : "Failed to run prediction");
      })
      .finally(() => setLoading(false));
  };

  return (
    <div className="rounded-xl border p-5 bg-[#1a1a1a] border-[#2a2a2a]">
      <div className="mb-4">
        <h3 className="font-bold text-white">Prediction Tester</h3>
        <p className="mt-0.5 text-sm text-[#9ca3af]">Test forecast parameters interactively</p>
      </div>

      <div className="space-y-4">
        <div>
          <label className="mb-2 block text-sm font-medium text-[#9ca3af]">
            Horizon: {horizon} months
          </label>
          <input
            type="range"
            min={1}
            max={24}
            value={horizon}
            onChange={(e) => setHorizon(Number(e.target.value))}
            className="h-2 w-full cursor-pointer appearance-none rounded-lg bg-[#2a2a2a] accent-[#4ade80]"
          />
        </div>

        <div>
          <label className="mb-2 block text-sm font-medium text-[#9ca3af]">Model</label>
          <div className="flex gap-4">
            {MODELS.map((m) => (
              <label key={m} className="flex cursor-pointer items-center gap-2">
                <input
                  type="radio"
                  name="model"
                  value={m}
                  checked={model === m}
                  onChange={() => setModel(m)}
                  className="accent-[#4ade80]"
                />
                <span className="text-sm text-[#e5e5e5] capitalize">{m}</span>
              </label>
            ))}
          </div>
        </div>

        <div>
          <label className="mb-2 block text-sm font-medium text-[#9ca3af]">Region</label>
          <select
            value={regionId}
            onChange={(e) => setRegionId(e.target.value)}
            className="w-full rounded-lg border border-[#2a2a2a] bg-[#0f0f0f] px-3 py-2 text-sm text-[#e5e5e5] focus:border-[#4ade80] focus:outline-none focus:ring-1 focus:ring-[#4ade80]"
          >
            {REGION_OPTIONS.map((r) => (
              <option key={r.id || "all"} value={r.id}>
                {r.label}
              </option>
            ))}
          </select>
        </div>

        <button
          type="button"
          onClick={handleRun}
          disabled={loading}
          className="w-full rounded-lg bg-[#4ade80] px-4 py-2.5 font-medium text-[#0f0f0f] transition-colors hover:bg-[#22c55e] disabled:opacity-50"
        >
          {loading ? "Running..." : "Run Prediction"}
        </button>
      </div>

      {error && <p className="mt-4 text-sm text-[#f87171]">{error}</p>}

      {results && results.length > 0 && (
        <div className="mt-4 overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-[#2a2a2a]">
                <th className="pb-2 text-left font-medium text-[#9ca3af]">Month</th>
                <th className="pb-2 text-right font-medium text-[#9ca3af]">Forecast</th>
                <th className="pb-2 text-right font-medium text-[#9ca3af]">80% Low</th>
                <th className="pb-2 text-right font-medium text-[#9ca3af]">80% High</th>
              </tr>
            </thead>
            <tbody>
              {results.map((row, i) => (
                <tr key={i} className="border-b border-[#2a2a2a]">
                  <td className="py-2 text-[#e5e5e5]">{row.month ?? "-"}</td>
                  <td className="py-2 text-right text-[#e5e5e5]">
                    {row.forecast != null ? formatCompactCurrency(row.forecast) : "-"}
                  </td>
                  <td className="py-2 text-right text-[#e5e5e5]">
                    {row.lower80 != null ? formatCompactCurrency(row.lower80) : "-"}
                  </td>
                  <td className="py-2 text-right text-[#e5e5e5]">
                    {row.upper80 != null ? formatCompactCurrency(row.upper80) : "-"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
