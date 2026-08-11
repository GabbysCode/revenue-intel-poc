"use client";

import { useState, useEffect } from "react";

export type TabItem = {
  label: string;
  value: string;
};

export interface DateRange {
  label: string;
  start: string;
  end: string;
}

export const DATE_PRESETS: DateRange[] = [
  { label: "FY 2025", start: "2025-01-01", end: "2025-12-31" },
  { label: "FY 2024", start: "2024-01-01", end: "2024-12-31" },
  { label: "H1 2025", start: "2025-01-01", end: "2025-06-30" },
  { label: "H2 2025", start: "2025-07-01", end: "2025-12-31" },
  { label: "Q1 2025", start: "2025-01-01", end: "2025-03-31" },
  { label: "Q2 2025", start: "2025-04-01", end: "2025-06-30" },
  { label: "Q3 2025", start: "2025-07-01", end: "2025-09-30" },
  { label: "Q4 2025", start: "2025-10-01", end: "2025-12-31" },
  { label: "All Time", start: "2023-01-01", end: "2025-12-31" },
];

export type HeaderProps = {
  title: string;
  subtitle?: string;
  tabs?: TabItem[];
  defaultTab?: string;
  showLiveIndicator?: boolean;
  region?: string;
  onRegionChange?: (region: string | undefined) => void;
  dateRange?: DateRange;
  onDateRangeChange?: (range: DateRange) => void;
};

const REGIONS = [
  { label: "All Regions", id: "" },
  { label: "Americas", id: "R001" },
  { label: "EMEA", id: "R002" },
  { label: "APAC", id: "R003" },
  { label: "UK", id: "R004" },
];

export function Header({
  title,
  subtitle,
  tabs = [],
  defaultTab,
  showLiveIndicator = true,
  region: controlledRegion,
  onRegionChange,
  dateRange: controlledDateRange,
  onDateRangeChange,
}: HeaderProps) {
  const [activeTab, setActiveTab] = useState(defaultTab ?? tabs[0]?.value ?? "");
  const [internalRegionId, setInternalRegionId] = useState("");
  const [isRegionOpen, setIsRegionOpen] = useState(false);
  const [internalDateRange, setInternalDateRange] = useState<DateRange>(DATE_PRESETS[0]);
  const [isDateOpen, setIsDateOpen] = useState(false);

  const activeDateRange = controlledDateRange ?? internalDateRange;

  const handleDateRangeChange = (range: DateRange) => {
    if (onDateRangeChange) {
      onDateRangeChange(range);
    } else {
      setInternalDateRange(range);
    }
  };

  const activeRegionId = controlledRegion !== undefined ? (controlledRegion || "") : internalRegionId;
  const activeRegionLabel = REGIONS.find((r) => r.id === activeRegionId)?.label ?? "All Regions";

  const handleRegionChange = (r: typeof REGIONS[number]) => {
    const value = r.id || undefined;
    if (onRegionChange) {
      onRegionChange(value);
    } else {
      setInternalRegionId(r.id);
    }
  };
  const [streamStatus, setStreamStatus] = useState<{ running: boolean; events_per_minute: number } | null>(null);

  useEffect(() => {
    if (!showLiveIndicator) return;
    const fetchStatus = () => {
      fetch("/api/stream/status")
        .then((r) => r.json())
        .then(setStreamStatus)
        .catch(() => {});
    };
    fetchStatus();
    const interval = setInterval(fetchStatus, 5000);
    return () => clearInterval(interval);
  }, [showLiveIndicator]);

  return (
    <header className="sticky top-0 z-30 bg-[#0f0f0f] border-b border-[#2a2a2a]">
      <div className="px-6 py-4">
        {/* Title row */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-4">
          <div className="flex items-center gap-3">
            <div>
              <h1 className="text-xl font-semibold text-[#e5e5e5]">{title}</h1>
              {subtitle && (
                <p className="text-sm text-[#888888] mt-0.5">{subtitle}</p>
              )}
            </div>
            {showLiveIndicator && streamStatus?.running && (
              <a
                href="/live"
                className="flex items-center gap-1.5 px-2 py-1 rounded-md bg-[#4ade80]/10 border border-[#4ade80]/20 hover:bg-[#4ade80]/20 transition-colors"
              >
                <span
                  className="w-2 h-2 rounded-full bg-[#4ade80]"
                  style={{ animation: "pulse-live 2s ease-in-out infinite" }}
                />
                <span className="text-[10px] font-semibold text-[#4ade80] uppercase">Live</span>
                <span className="text-[10px] text-[#4ade80]/70">{streamStatus.events_per_minute} evt/m</span>
              </a>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-3">
            {/* Date range */}
            <div className="relative">
              <button
                type="button"
                onClick={() => setIsDateOpen(!isDateOpen)}
                className="flex items-center gap-2 px-3 py-2 rounded-lg bg-[#1a1a1a] border border-[#2a2a2a] text-sm text-[#e5e5e5] hover:bg-[#222] transition-colors min-w-[160px]"
              >
                <span className="text-[#888888]">📅</span>
                <span className="flex-1 text-left">{activeDateRange.label}</span>
                <svg
                  className={`w-4 h-4 text-[#888888] transition-transform ${isDateOpen ? "rotate-180" : ""}`}
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
              </button>

              {isDateOpen && (
                <>
                  <div
                    className="fixed inset-0 z-10"
                    onClick={() => setIsDateOpen(false)}
                    aria-hidden="true"
                  />
                  <div className="absolute right-0 top-full mt-1 z-20 w-full min-w-[200px] py-1 rounded-lg bg-[#1a1a1a] border border-[#2a2a2a] shadow-lg">
                    {DATE_PRESETS.map((preset) => (
                      <button
                        key={preset.label}
                        type="button"
                        onClick={() => {
                          handleDateRangeChange(preset);
                          setIsDateOpen(false);
                        }}
                        className={`
                          w-full px-3 py-2 text-left text-sm transition-colors flex justify-between items-center
                          ${preset.label === activeDateRange.label ? "bg-[#222] text-[#4ade80]" : "text-[#e5e5e5] hover:bg-[#222]"}
                        `}
                      >
                        <span>{preset.label}</span>
                        <span className="text-[10px] text-[#888888]">
                          {new Date(preset.start).toLocaleDateString("en-US", { month: "short", year: "2-digit" })}
                          {" - "}
                          {new Date(preset.end).toLocaleDateString("en-US", { month: "short", year: "2-digit" })}
                        </span>
                      </button>
                    ))}
                  </div>
                </>
              )}
            </div>

            {/* Region filter */}
            <div className="relative">
              <button
                type="button"
                onClick={() => setIsRegionOpen(!isRegionOpen)}
                className="flex items-center gap-2 px-3 py-2 rounded-lg bg-[#1a1a1a] border border-[#2a2a2a] text-sm text-[#e5e5e5] hover:bg-[#222] transition-colors min-w-[140px]"
              >
                <span className="flex-1 text-left">{activeRegionLabel}</span>
                <svg
                  className={`w-4 h-4 text-[#888888] transition-transform ${isRegionOpen ? "rotate-180" : ""}`}
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
              </button>

              {isRegionOpen && (
                <>
                  <div
                    className="fixed inset-0 z-10"
                    onClick={() => setIsRegionOpen(false)}
                    aria-hidden="true"
                  />
                  <div className="absolute right-0 top-full mt-1 z-20 w-full min-w-[160px] py-1 rounded-lg bg-[#1a1a1a] border border-[#2a2a2a] shadow-lg">
                    {REGIONS.map((r) => (
                      <button
                        key={r.id || "all"}
                        type="button"
                        onClick={() => {
                          handleRegionChange(r);
                          setIsRegionOpen(false);
                        }}
                        className={`
                          w-full px-3 py-2 text-left text-sm transition-colors
                          ${r.id === activeRegionId ? "bg-[#222] text-[#4ade80]" : "text-[#e5e5e5] hover:bg-[#222]"}
                        `}
                      >
                        {r.label}
                      </button>
                    ))}
                  </div>
                </>
              )}
            </div>
          </div>
        </div>

        {/* Tab switcher */}
        {tabs.length > 0 && (
          <div className="flex gap-1 p-1 rounded-lg bg-[#1a1a1a] border border-[#2a2a2a] w-fit">
            {tabs.map((tab) => (
              <button
                key={tab.value}
                type="button"
                onClick={() => setActiveTab(tab.value)}
                className={`
                  px-4 py-2 rounded-md text-sm font-medium transition-colors
                  ${activeTab === tab.value
                    ? "bg-[#222] text-[#4ade80]"
                    : "text-[#a3a3a3] hover:text-[#e5e5e5] hover:bg-[#222]/50"
                  }
                `}
              >
                {tab.label}
              </button>
            ))}
          </div>
        )}
      </div>
    </header>
  );
}
