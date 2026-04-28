"use client";

import { KpiPlaceholderPage } from "@/components/kpi/KpiPlaceholderPage";

export default function SalesForecastPage() {
  return (
    <KpiPlaceholderPage
      title="Sales Forecast"
      subtitle="Forward-looking pipeline value vs. quota."
      description="Sales forecast will summarise weighted pipeline, commit, and best-case revenue against quota. Connect the CRM/forecast feed to populate this view."
    />
  );
}
