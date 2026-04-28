"use client";

import { useEffect, useState } from "react";
import { apiFetch } from "@/lib/apiFetch";
import { useFilterState, type ViewMode } from "@/lib/filter-state";

interface CapabilityOption {
  id: string;
  name: string;
}

const VIEW_MODES: { id: ViewMode; label: string }[] = [
  { id: "ytd", label: "YTD" },
  { id: "current_month", label: "Current month" },
];

const MONTH_OPTIONS = generateMonthOptions();

function generateMonthOptions(): { value: string; label: string }[] {
  const out: { value: string; label: string }[] = [];
  for (let year = 2023; year <= 2025; year += 1) {
    for (let month = 1; month <= 12; month += 1) {
      const mm = String(month).padStart(2, "0");
      const value = `${year}-${mm}-01`;
      const label = new Date(`${year}-${mm}-01T00:00:00Z`).toLocaleString("en-GB", {
        month: "short",
        year: "numeric",
        timeZone: "UTC",
      });
      out.push({ value, label });
    }
  }
  return out;
}

export function FilterBar() {
  const { filters, setCapability, setMonth, setViewMode } = useFilterState();
  const [capabilities, setCapabilities] = useState<CapabilityOption[]>([]);
  const [loadingCaps, setLoadingCaps] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoadingCaps(true);
    apiFetch("/api/kpis/capabilities")
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))))
      .then((j) => {
        if (cancelled) return;
        const list = Array.isArray(j?.items)
          ? j.items
          : Array.isArray(j?.capabilities)
          ? j.capabilities
          : Array.isArray(j)
          ? j
          : [];
        setCapabilities(list);
      })
      .catch(() => {
        if (!cancelled) setCapabilities([]);
      })
      .finally(() => {
        if (!cancelled) setLoadingCaps(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const inputBase =
    "px-3 py-2 rounded-md text-sm border outline-none focus:ring-1 focus:ring-[var(--color-accent,#00338D)]";

  return (
    <div
      className="flex flex-wrap items-end gap-3 px-6 py-4 border-b"
      style={{
        background: "var(--color-surface, #ffffff)",
        borderColor: "var(--color-border, #e5e7eb)",
      }}
    >
      <label className="flex flex-col gap-1 min-w-[180px]">
        <span className="text-xs font-medium uppercase tracking-wide" style={{ color: "var(--color-text-muted, #6b7280)" }}>
          Capability
        </span>
        <select
          value={filters.capability ?? ""}
          onChange={(e) => setCapability(e.target.value || null)}
          className={inputBase}
          style={{
            background: "var(--color-surface, #ffffff)",
            borderColor: "var(--color-border, #e5e7eb)",
            color: "var(--color-text, #111827)",
          }}
          disabled={loadingCaps && capabilities.length === 0}
        >
          <option value="">All capabilities</option>
          {capabilities.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
      </label>

      <label className="flex flex-col gap-1 min-w-[160px]">
        <span className="text-xs font-medium uppercase tracking-wide" style={{ color: "var(--color-text-muted, #6b7280)" }}>
          Month
        </span>
        <select
          value={filters.month}
          onChange={(e) => setMonth(e.target.value)}
          className={inputBase}
          style={{
            background: "var(--color-surface, #ffffff)",
            borderColor: "var(--color-border, #e5e7eb)",
            color: "var(--color-text, #111827)",
          }}
        >
          {MONTH_OPTIONS.map((m) => (
            <option key={m.value} value={m.value}>
              {m.label}
            </option>
          ))}
        </select>
      </label>

      <div className="flex flex-col gap-1">
        <span className="text-xs font-medium uppercase tracking-wide" style={{ color: "var(--color-text-muted, #6b7280)" }}>
          View
        </span>
        <div
          className="inline-flex rounded-md border overflow-hidden"
          style={{ borderColor: "var(--color-border, #e5e7eb)" }}
          role="group"
          aria-label="View mode"
        >
          {VIEW_MODES.map((m) => {
            const active = filters.viewMode === m.id;
            return (
              <button
                key={m.id}
                type="button"
                onClick={() => setViewMode(m.id)}
                className="px-3 py-2 text-sm font-medium transition-colors"
                style={{
                  background: active ? "var(--color-accent, #00338D)" : "transparent",
                  color: active ? "var(--color-on-accent, #ffffff)" : "var(--color-text, #111827)",
                }}
              >
                {m.label}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
