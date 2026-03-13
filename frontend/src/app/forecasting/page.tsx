"use client";

import { useState, useCallback } from "react";
import { Header, DATE_PRESETS, type DateRange } from "@/components/layout/Header";
import { ForecastChart } from "@/components/forecasting/ForecastChart";
import { ModelComparison } from "@/components/forecasting/ModelComparison";
import { PredictionTester } from "@/components/forecasting/PredictionTester";
import { RecommendedActions } from "@/components/forecasting/RecommendedActions";

export default function ForecastingPage() {
  const [region, setRegion] = useState<string | undefined>(undefined);
  const [dateRange, setDateRange] = useState<DateRange>(DATE_PRESETS[0]);
  const [chartHorizon, setChartHorizon] = useState(6);
  const [chartModel, setChartModel] = useState("hybrid");
  const [chartRegion, setChartRegion] = useState<string | undefined>(undefined);

  const handleForecastRun = useCallback((params: { horizon: number; model: string; region?: string }) => {
    setChartHorizon(params.horizon);
    setChartModel(params.model);
    setChartRegion(params.region);
  }, []);

  const activeRegion = chartRegion !== undefined ? chartRegion : region;

  return (
    <div className="min-h-screen bg-[#0f0f0f]">
      <Header
        title="Forecasting"
        subtitle="AI-powered revenue predictions"
        region={region ?? ""}
        onRegionChange={setRegion}
        dateRange={dateRange}
        onDateRangeChange={setDateRange}
      />
      <main className="p-6 space-y-6">
        <ForecastChart horizon={chartHorizon} model={chartModel} region={activeRegion} />
        <RecommendedActions region={activeRegion} />
        <div className="grid gap-6 lg:grid-cols-2">
          <ModelComparison />
          <PredictionTester onForecastRun={handleForecastRun} />
        </div>
      </main>
    </div>
  );
}
