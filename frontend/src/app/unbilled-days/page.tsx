"use client";

import { ExecHeader } from "@/components/layout/ExecHeader";
import { KpiDrillDown } from "@/components/kpi/KpiDrillDown";

export default function UnbilledDaysPage() {
  return (
    <>
      <ExecHeader
        title="Unbilled Days"
        subtitle="WIP outstanding measured in revenue-days. Lower is better."
      />
      <KpiDrillDown kpi="unbilled-days" lowerIsBetter={true} />
    </>
  );
}
