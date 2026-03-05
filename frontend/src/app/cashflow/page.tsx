"use client";

import React from "react";
import { Header } from "@/components/layout/Header";
import { WaterfallChart } from "@/components/cashflow/WaterfallChart";
import { DSOMeter } from "@/components/cashflow/DSOMeter";
import { ARAgingChart } from "@/components/cashflow/ARAgingChart";

export default function CashflowPage() {
  return (
    <>
      <Header
        title="Cash Flow"
        subtitle="Billing, collections, and receivables analytics"
      />
      <div className="p-6 space-y-6">
        <WaterfallChart />
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <DSOMeter />
          <ARAgingChart />
        </div>
      </div>
    </>
  );
}
