"use client";

import { useState } from "react";
import { Header } from "@/components/layout/Header";
import { ScenarioBuilder } from "@/components/scenarios/ScenarioBuilder";
import { ScenarioResults } from "@/components/scenarios/ScenarioResults";
import type { ScenarioResultsData } from "@/components/scenarios/ScenarioResults";

export default function ScenariosPage() {
  const [scenarioData, setScenarioData] = useState<ScenarioResultsData | null>(null);

  return (
    <div className="min-h-screen bg-[#0f0f0f]">
      <Header title="Scenario Planning" subtitle="Monte Carlo simulation & what-if analysis" />
      <main className="p-6">
        <div className="grid gap-6 lg:grid-cols-3">
          <div className="lg:col-span-1">
            <ScenarioBuilder onResult={(data) => setScenarioData(data as ScenarioResultsData)} />
          </div>
          <div className="lg:col-span-2">
            <ScenarioResults data={scenarioData} />
          </div>
        </div>
      </main>
    </div>
  );
}
