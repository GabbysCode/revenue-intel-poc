"use client";

import { ExecHeader } from "@/components/layout/ExecHeader";
import { KpiDrillDown } from "@/components/kpi/KpiDrillDown";

export default function RatePerHourPage() {
  return (
    <>
      <ExecHeader
        title="Rate Per Hour"
        subtitle="Realised £/hour across delivered engagements. Higher is better."
      />
      <KpiDrillDown kpi="rate-per-hour" lowerIsBetter={false} />
    </>
  );
}
