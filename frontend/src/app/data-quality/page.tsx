"use client";

import React from "react";
import { Header } from "@/components/layout/Header";
import { DQScorecard } from "@/components/data-quality/DQScorecard";
import { DQTrendChart } from "@/components/data-quality/DQTrendChart";
import { AnomalyTable } from "@/components/data-quality/AnomalyTable";

export default function DataQualityPage() {
  return (
    <>
      <Header
        title="Data Quality"
        subtitle="Monitor data integrity and anomaly detection"
      />
      <div className="p-6 space-y-6">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <DQScorecard />
          <DQTrendChart />
        </div>
        <AnomalyTable />
      </div>
    </>
  );
}
