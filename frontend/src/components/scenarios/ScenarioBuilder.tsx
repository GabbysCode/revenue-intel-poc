"use client";

import React, { useState } from "react";

export interface ScenarioParams {
  revenueGrowth: number;
  dsoChange: number;
  churnRate: number;
  winRate: number;
  macroMultiplier: number;
}

export interface ScenarioBuilderProps {
  onResult: (data: unknown) => void;
}

const SLIDERS = [
  { key: "revenueGrowth" as const, label: "Revenue Growth", min: -20, max: 30, suffix: "%", step: 1 },
  { key: "dsoChange" as const, label: "DSO Change", min: -30, max: 30, suffix: " days", step: 1 },
  { key: "churnRate" as const, label: "Churn Rate", min: 0, max: 20, suffix: "%", step: 0.5 },
  { key: "winRate" as const, label: "Win Rate", min: 10, max: 60, suffix: "%", step: 1 },
  { key: "macroMultiplier" as const, label: "Macro Multiplier", min: 0.7, max: 1.3, suffix: "x", step: 0.05 },
];

export function ScenarioBuilder({ onResult }: ScenarioBuilderProps) {
  const [params, setParams] = useState<ScenarioParams>({
    revenueGrowth: 0,
    dsoChange: 0,
    churnRate: 5,
    winRate: 35,
    macroMultiplier: 1,
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleRun = () => {
    setLoading(true);
    setError(null);
    fetch("/api/scenarios/run", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        revenue_growth_pct: params.revenueGrowth,
        dso_change_days: params.dsoChange,
        churn_rate_pct: params.churnRate,
        win_rate_pct: params.winRate,
        macro_multiplier: params.macroMultiplier,
        iterations: 1000,
      }),
    })
      .then((res) => {
        if (!res.ok) throw new Error(`Failed to run: ${res.status}`);
        return res.json();
      })
      .then((raw) => {
        const summary = raw.summary ?? {};
        const projections = raw.projections ?? [];
        const tornado = raw.tornado ?? [];
        onResult({
          summary: {
            baseTotal: summary.base_total,
            p10: summary.scenario_p10,
            p50: summary.scenario_p50,
            p90: summary.scenario_p90,
            expectedDeltaPct: summary.expected_delta_pct,
            cashFlowP50: summary.cash_flow_p50,
            avgMargin: summary.avg_margin_p50,
          },
          fanChart: projections.map((p: Record<string, unknown>) => ({
            period: String(p.date ?? ""),
            base: Number(p.base ?? 0),
            p10: Number(p.p10 ?? 0),
            p50: Number(p.p50 ?? 0),
            p90: Number(p.p90 ?? 0),
          })),
          sensitivity: tornado.map((t: Record<string, unknown>) => ({
            parameter: String(t.parameter ?? ""),
            positiveImpact: Number(t.high_value ?? 0),
            negativeImpact: Number(t.low_value ?? 0),
          })),
        });
      })
      .catch((err) => {
        setError(err instanceof Error ? err.message : "Failed to run scenario");
      })
      .finally(() => setLoading(false));
  };

  const updateParam = (key: keyof ScenarioParams, value: number) => {
    setParams((p) => ({ ...p, [key]: value }));
  };

  return (
    <div className="rounded-xl border p-5 bg-[#1a1a1a] border-[#2a2a2a]">
      <div className="mb-4">
        <h3 className="font-bold text-white">Scenario Parameters</h3>
        <p className="mt-0.5 text-sm text-[#9ca3af]">Adjust sliders to define your scenario</p>
      </div>

      <div className="space-y-5">
        {SLIDERS.map(({ key, label, min, max, suffix, step }) => (
          <div key={key}>
            <div className="mb-2 flex justify-between">
              <label className="text-sm font-medium text-[#9ca3af]">{label}</label>
              <span className="text-sm text-[#e5e5e5]">
                {params[key]}
                {suffix}
              </span>
            </div>
            <input
              type="range"
              min={min}
              max={max}
              step={step}
              value={params[key]}
              onChange={(e) => updateParam(key, Number(e.target.value))}
              className="h-2 w-full cursor-pointer appearance-none rounded-lg bg-[#2a2a2a] accent-[#4ade80]"
            />
          </div>
        ))}

        <button
          type="button"
          onClick={handleRun}
          disabled={loading}
          className="w-full rounded-lg bg-[#4ade80] px-4 py-2.5 font-medium text-[#0f0f0f] transition-colors hover:bg-[#22c55e] disabled:opacity-50"
        >
          {loading ? "Running..." : "Run Scenario"}
        </button>
      </div>

      {error && <p className="mt-4 text-sm text-[#f87171]">{error}</p>}
    </div>
  );
}
