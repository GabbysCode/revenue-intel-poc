"use client";

import { KpiPlaceholderPage } from "@/components/kpi/KpiPlaceholderPage";

export default function ChargeabilityPage() {
  return (
    <KpiPlaceholderPage
      title="Chargeability"
      subtitle="Share of available hours billed to clients."
      description="Chargeability will report billable hours as a percentage of available hours by capability and grade. Connect the timesheet feed to populate this view."
    />
  );
}
