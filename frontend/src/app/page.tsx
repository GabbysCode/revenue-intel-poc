"use client";

import { useState, useEffect } from "react";
import { Header, DATE_PRESETS, type DateRange } from "@/components/layout/Header";
import { KPICardGrid } from "@/components/dashboard/KPICardGrid";
import { RevenueTrendChart } from "@/components/dashboard/RevenueTrendChart";
import { AttributionPieChart } from "@/components/dashboard/AttributionPieChart";
import { ExecSummaryModal } from "@/components/nlp/ExecSummaryModal";
import { LiveFeedPanel } from "@/components/live/LiveFeedPanel";

export default function DashboardPage() {
  const [showSummary, setShowSummary] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);
  const [region, setRegion] = useState<string | undefined>(undefined);
  const [dateRange, setDateRange] = useState<DateRange>(DATE_PRESETS[0]);

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
        region={region ?? ""}
        onRegionChange={setRegion}
        dateRange={dateRange}
        onDateRangeChange={setDateRange}
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

        <KPICardGrid key={`kpi-${refreshKey}-${region}-${dateRange.start}`} region={region} periodStart={dateRange.start} periodEnd={dateRange.end} />

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2">
            <RevenueTrendChart region={region} />
          </div>
          <LiveFeedPanel />
        </div>

        <AttributionPieChart region={region} periodStart={dateRange.start} periodEnd={dateRange.end} />
      </div>

      <ExecSummaryModal
        isOpen={showSummary}
        onClose={() => setShowSummary(false)}
        periodStart={dateRange.start}
        periodEnd={dateRange.end}
        region={region}
      />
    </>
  );
}
