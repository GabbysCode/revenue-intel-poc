"use client";

import { useState, useEffect } from "react";

export type TabItem = {
  label: string;
  value: string;
};

export type HeaderProps = {
  title: string;
  subtitle?: string;
  tabs?: TabItem[];
  dateRange?: string;
  defaultTab?: string;
  showLiveIndicator?: boolean;
};

const REGIONS = ["All Regions", "Americas", "EMEA", "APAC", "UK"];

export function Header({
  title,
  subtitle,
  tabs = [],
  dateRange = "Jan 01, 2025 - Dec 31, 2025",
  defaultTab,
  showLiveIndicator = true,
}: HeaderProps) {
  const [activeTab, setActiveTab] = useState(defaultTab ?? tabs[0]?.value ?? "");
  const [region, setRegion] = useState("All Regions");
  const [isRegionOpen, setIsRegionOpen] = useState(false);
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
            <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-[#1a1a1a] border border-[#2a2a2a] text-sm text-[#a3a3a3]">
              <span className="text-[#888888]">📅</span>
              <span>{dateRange}</span>
            </div>

            {/* Region filter */}
            <div className="relative">
              <button
                type="button"
                onClick={() => setIsRegionOpen(!isRegionOpen)}
                className="flex items-center gap-2 px-3 py-2 rounded-lg bg-[#1a1a1a] border border-[#2a2a2a] text-sm text-[#e5e5e5] hover:bg-[#222] transition-colors min-w-[140px]"
              >
                <span className="flex-1 text-left">{region}</span>
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
                        key={r}
                        type="button"
                        onClick={() => {
                          setRegion(r);
                          setIsRegionOpen(false);
                        }}
                        className={`
                          w-full px-3 py-2 text-left text-sm transition-colors
                          ${r === region ? "bg-[#222] text-[#4ade80]" : "text-[#e5e5e5] hover:bg-[#222]"}
                        `}
                      >
                        {r}
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
