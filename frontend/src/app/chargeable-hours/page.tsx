"use client";

import { ExecHeader } from "@/components/layout/ExecHeader";
import { KpiDrillDown } from "@/components/kpi/KpiDrillDown";

export default function ChargeableHoursPage() {
  return (
    <>
      <ExecHeader
        title="Chargeable Hours"
        subtitle="Volume of billable consulting effort. Higher is better."
      />
      <KpiDrillDown kpi="chargeable-hours" lowerIsBetter={false} />
    </>
  );
}
