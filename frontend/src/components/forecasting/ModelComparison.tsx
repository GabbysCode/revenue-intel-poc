"use client";

import React, { useEffect, useState } from "react";

interface ModelAccuracy {
  model: string;
  mape: number;
  rmse: number;
  predictions: number;
}

export function ModelComparison() {
  const [data, setData] = useState<ModelAccuracy[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/forecasting/accuracy")
      .then((res) => {
        if (!res.ok) throw new Error(`Failed to fetch: ${res.status}`);
        return res.json();
      })
      .then((json) => {
        const raw = json.data ?? json.models ?? json;
        const items = Array.isArray(raw) ? raw : [];
        setData(
          items.map((m: { model?: string; mape?: number; rmse?: number; predictions?: number }) => ({
            model: m.model ?? "Unknown",
            mape: m.mape ?? 0,
            rmse: m.rmse ?? 0,
            predictions: m.predictions ?? 0,
          }))
        );
      })
      .catch((err) => {
        setError(err instanceof Error ? err.message : "Failed to load accuracy");
      })
      .finally(() => setLoading(false));
  }, []);

  if (error) {
    return (
      <div className="rounded-xl border p-5 bg-[#1a1a1a] border-[#2a2a2a]">
        <div className="flex h-32 items-center justify-center text-[#f87171]">{error}</div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="rounded-xl border p-5 bg-[#1a1a1a] border-[#2a2a2a]">
        <div className="mb-4">
          <h3 className="font-bold text-white">Model Accuracy</h3>
          <p className="mt-0.5 text-sm text-[#9ca3af]">Compare forecast model performance</p>
        </div>
        <div className="space-y-2">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-12 animate-pulse rounded-lg bg-[#252525]" />
          ))}
        </div>
      </div>
    );
  }

  const bestModel = data.length > 0 ? data.reduce((a, b) => (a.mape < b.mape ? a : b)) : null;

  return (
    <div className="rounded-xl border p-5 bg-[#1a1a1a] border-[#2a2a2a]">
      <div className="mb-4">
        <h3 className="font-bold text-white">Model Accuracy</h3>
        <p className="mt-0.5 text-sm text-[#9ca3af]">Compare forecast model performance</p>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-[#2a2a2a]">
              <th className="pb-3 text-left font-medium text-[#9ca3af]">Model</th>
              <th className="pb-3 text-right font-medium text-[#9ca3af]">MAPE (%)</th>
              <th className="pb-3 text-right font-medium text-[#9ca3af]">RMSE</th>
              <th className="pb-3 text-right font-medium text-[#9ca3af]">Predictions</th>
            </tr>
          </thead>
          <tbody>
            {data.map((row) => (
              <tr
                key={row.model}
                className={`border-b border-[#2a2a2a] transition-colors ${
                  bestModel && row.model === bestModel.model ? "border-l-4 border-l-[#4ade80] bg-[#1a1a1a]" : ""
                }`}
              >
                <td className="py-3 text-[#e5e5e5]">{row.model}</td>
                <td className="py-3 text-right text-[#e5e5e5]">{row.mape.toFixed(2)}</td>
                <td className="py-3 text-right text-[#e5e5e5]">{row.rmse.toLocaleString()}</td>
                <td className="py-3 text-right text-[#e5e5e5]">{row.predictions.toLocaleString()}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
