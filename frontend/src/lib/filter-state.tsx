"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

export type ViewMode = "ytd" | "current_month";

export interface FilterState {
  capability: string | null;
  /** First-of-month YYYY-MM-01; doubles as `period_end` snap point for the API */
  month: string;
  viewMode: ViewMode;
}

export interface FilterStateValue {
  filters: FilterState;
  setCapability: (id: string | null) => void;
  setMonth: (m: string) => void;
  setViewMode: (m: ViewMode) => void;
  /** YYYY-MM-DD month-end (last day of the selected month) */
  periodEnd: string;
  /** YYYY-MM-DD start of fiscal year of the selected month */
  ytdStart: string;
}

const FilterStateContext = createContext<FilterStateValue | null>(null);

const DEFAULT_MONTH = "2025-12-01"; // Last full month in the synthetic seed.
const DEFAULT_VIEW_MODE: ViewMode = "ytd";

function lastDayOfMonth(monthStart: string): string {
  // Expects YYYY-MM-DD where DD is 01.
  const [y, m] = monthStart.split("-").map(Number);
  if (!y || !m) return monthStart;
  const last = new Date(Date.UTC(y, m, 0));
  return last.toISOString().slice(0, 10);
}

function ytdStartOfMonth(monthStart: string): string {
  const [y] = monthStart.split("-").map(Number);
  if (!y) return monthStart;
  return `${y}-01-01`;
}

function parseFilters(params: URLSearchParams): FilterState {
  const cap = params.get("capability");
  const month = params.get("month") || DEFAULT_MONTH;
  const view = params.get("view");
  return {
    capability: cap && cap !== "" ? cap : null,
    month,
    viewMode: view === "current_month" ? "current_month" : DEFAULT_VIEW_MODE,
  };
}

export function FilterStateProvider({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const [filters, setFilters] = useState<FilterState>(() => parseFilters(new URLSearchParams()));

  // Sync state to URL on read so deep-links persist filter state across tabs.
  useEffect(() => {
    const next = parseFilters(searchParams);
    setFilters((prev) => {
      if (
        prev.capability === next.capability &&
        prev.month === next.month &&
        prev.viewMode === next.viewMode
      ) {
        return prev;
      }
      return next;
    });
  }, [searchParams]);

  const writeParams = useCallback(
    (patch: Partial<FilterState>) => {
      const params = new URLSearchParams(searchParams.toString());
      const next = { ...filters, ...patch };
      if (next.capability) params.set("capability", next.capability);
      else params.delete("capability");
      if (next.month) params.set("month", next.month);
      if (next.viewMode && next.viewMode !== DEFAULT_VIEW_MODE) {
        params.set("view", next.viewMode);
      } else {
        params.delete("view");
      }
      const qs = params.toString();
      // `replace` instead of `push` so filter changes don't pile up in history.
      router.replace(`${pathname}${qs ? `?${qs}` : ""}`, { scroll: false });
      setFilters(next);
    },
    [filters, pathname, router, searchParams]
  );

  const setCapability = useCallback(
    (id: string | null) => writeParams({ capability: id }),
    [writeParams]
  );
  const setMonth = useCallback((m: string) => writeParams({ month: m }), [writeParams]);
  const setViewMode = useCallback((m: ViewMode) => writeParams({ viewMode: m }), [writeParams]);

  const value = useMemo<FilterStateValue>(
    () => ({
      filters,
      setCapability,
      setMonth,
      setViewMode,
      periodEnd: lastDayOfMonth(filters.month),
      ytdStart: ytdStartOfMonth(filters.month),
    }),
    [filters, setCapability, setMonth, setViewMode]
  );

  return <FilterStateContext.Provider value={value}>{children}</FilterStateContext.Provider>;
}

export function useFilterState(): FilterStateValue {
  const ctx = useContext(FilterStateContext);
  if (!ctx) throw new Error("useFilterState must be used within FilterStateProvider");
  return ctx;
}
