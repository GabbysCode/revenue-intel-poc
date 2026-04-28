"use client";

import { ExecHeader } from "@/components/layout/ExecHeader";
import { KpiDrillDown } from "@/components/kpi/KpiDrillDown";

export default function GrossFeeDaysPage() {
  return (
    <>
      <ExecHeader
        title="Gross Fee Days"
        subtitle="Chargeable effort at a 7.5-hour day. Higher is better."
      />
      <KpiDrillDown kpi="gross-fee-days" lowerIsBetter={false} />
    </>
  );
}
