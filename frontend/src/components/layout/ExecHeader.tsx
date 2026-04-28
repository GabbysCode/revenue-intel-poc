"use client";

import { ExportToPresentationButton } from "@/components/tellr/ExportToPresentationButton";
import { ThemeToggle } from "@/components/layout/ThemeToggle";
import { FilterBar } from "@/components/kpi/FilterBar";

interface Props {
  title: string;
  subtitle?: string;
}

export function ExecHeader({ title, subtitle }: Props) {
  return (
    <header
      className="sticky top-0 z-30 backdrop-blur"
      style={{
        background: "var(--color-surface-translucent, rgba(255,255,255,0.85))",
        borderBottom: "1px solid var(--color-border, #e5e7eb)",
      }}
    >
      <div className="px-6 pt-5 pb-3 flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <h1 className="text-xl font-semibold tracking-tight" style={{ color: "var(--color-text, #111827)" }}>
            {title}
          </h1>
          {subtitle && (
            <p className="text-sm mt-0.5" style={{ color: "var(--color-text-muted, #6b7280)" }}>
              {subtitle}
            </p>
          )}
        </div>
        <div className="flex items-center gap-2 self-end lg:self-auto">
          <ThemeToggle />
          <ExportToPresentationButton />
        </div>
      </div>
      <FilterBar />
    </header>
  );
}
