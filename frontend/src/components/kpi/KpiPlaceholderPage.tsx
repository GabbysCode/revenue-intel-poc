"use client";

import { ExecHeader } from "@/components/layout/ExecHeader";

interface Props {
  title: string;
  subtitle: string;
  /** Short description of what this KPI will track once data is wired up. */
  description?: string;
}

export function KpiPlaceholderPage({ title, subtitle, description }: Props) {
  return (
    <>
      <ExecHeader title={title} subtitle={subtitle} />
      <div className="p-6">
        <div
          className="rounded-xl flex flex-col items-center justify-center text-center p-10"
          style={{
            background: "var(--color-surface-2, #f9fafb)",
            border: "1px dashed var(--color-border, #e5e7eb)",
            minHeight: 320,
          }}
        >
          <div
            className="w-12 h-12 rounded-full flex items-center justify-center mb-4"
            style={{
              background: "var(--color-surface, #ffffff)",
              border: "1px solid var(--color-border, #e5e7eb)",
              color: "var(--color-text-muted, #6b7280)",
            }}
          >
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"
              />
            </svg>
          </div>
          <h2
            className="text-lg font-semibold"
            style={{ color: "var(--color-text, #111827)" }}
          >
            Awaiting data
          </h2>
          <p
            className="mt-2 max-w-md text-sm"
            style={{ color: "var(--color-text-muted, #6b7280)" }}
          >
            {description ||
              "This KPI is reserved on the dashboard. Once the upstream data source is connected, the headline card and drill-down charts will populate automatically."}
          </p>
        </div>
      </div>
    </>
  );
}
