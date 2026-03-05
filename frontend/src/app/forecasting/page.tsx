"use client";

import { Header } from "@/components/layout/Header";
import { ForecastChart } from "@/components/forecasting/ForecastChart";
import { ModelComparison } from "@/components/forecasting/ModelComparison";
import { PredictionTester } from "@/components/forecasting/PredictionTester";

export default function ForecastingPage() {
  return (
    <div className="min-h-screen bg-[#0f0f0f]">
      <Header title="Forecasting" subtitle="AI-powered revenue predictions" />
      <main className="p-6">
        <div className="mb-6">
          <ForecastChart horizon={6} model="hybrid" />
        </div>
        <div className="grid gap-6 lg:grid-cols-2">
          <ModelComparison />
          <PredictionTester />
        </div>
      </main>
    </div>
  );
}
