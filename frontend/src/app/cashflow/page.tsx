"use client";

import React, { useState } from "react";
import { Header, DATE_PRESETS, type DateRange } from "@/components/layout/Header";
import { WaterfallChart } from "@/components/cashflow/WaterfallChart";
import { DSOMeter } from "@/components/cashflow/DSOMeter";
import { ARAgingChart } from "@/components/cashflow/ARAgingChart";

export default function CashflowPage() {
  const [region, setRegion] = useState<string | undefined>(undefined);
  const [dateRange, setDateRange] = useState<DateRange>(DATE_PRESETS[0]);

  return (
    <>
      <Header
        title="Cash Flow"
        subtitle="Billing, collections, and receivables analytics"
        region={region ?? ""}
        onRegionChange={setRegion}
        dateRange={dateRange}
        onDateRangeChange={setDateRange}
      />
      <div className="p-6 space-y-6">
        <WaterfallChart region={region} periodStart={dateRange.start} periodEnd={dateRange.end} />
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <DSOMeter region={region} periodStart={dateRange.start} periodEnd={dateRange.end} />
          <ARAgingChart region={region} />
        </div>
      </div>
    </>
  );
}
