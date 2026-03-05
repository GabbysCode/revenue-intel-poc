"use client";

import { useState, useEffect, useCallback } from "react";
import { Header } from "@/components/layout/Header";
import { KPICardGrid } from "@/components/dashboard/KPICardGrid";
import { RevenueTrendChart } from "@/components/dashboard/RevenueTrendChart";
import { AttributionPieChart } from "@/components/dashboard/AttributionPieChart";
import { ExecSummaryModal } from "@/components/nlp/ExecSummaryModal";
import { LiveFeedPanel } from "@/components/live/LiveFeedPanel";

export default function DashboardPage() {
  const [showSummary, setShowSummary] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    const interval = setInterval(() => {
      setRefreshKey((k) => k + 1);
    }, 10000);
    return () => clearInterval(interval);
  }, []);

  return (
    <>
      <Header
        title="Analytics"
        subtitle="Track campaign performance and audience behavior insights."
        tabs={[
          { label: "Revenue Attribution", value: "revenue" },
          { label: "Billings & Collections", value: "billings" },
        ]}
        dateRange="Jan 01, 2025 - Dec 31, 2025"
      />

      <div className="p-6 space-y-6">
        <div className="flex items-center justify-between">
          <div />
          <button
            onClick={() => setShowSummary(true)}
            className="px-4 py-2 text-sm font-medium rounded-lg bg-[#4ade80]/10 text-[#4ade80] border border-[#4ade80]/20 hover:bg-[#4ade80]/20 transition-colors"
          >
            Generate Executive Summary
          </button>
        </div>

        <KPICardGrid key={`kpi-${refreshKey}`} />

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2">
            <RevenueTrendChart />
          </div>
          <LiveFeedPanel />
        </div>

        <AttributionPieChart />
      </div>

      <ExecSummaryModal
        isOpen={showSummary}
        onClose={() => setShowSummary(false)}
        periodStart="2025-01-01"
        periodEnd="2025-12-31"
      />
    </>
  );
}
