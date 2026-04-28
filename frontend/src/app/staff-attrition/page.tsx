"use client";

import { KpiPlaceholderPage } from "@/components/kpi/KpiPlaceholderPage";

export default function StaffAttritionPage() {
  return (
    <KpiPlaceholderPage
      title="Staff Attrition"
      subtitle="Voluntary leaver rate. Lower is better."
      description="Staff attrition will track rolling 12-month voluntary leaver rates by capability and grade, with a regrettable-loss split. Connect the HRIS feed to populate this view."
    />
  );
}
