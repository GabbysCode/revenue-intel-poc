"use client";

import React from "react";

export interface FilterOption {
  id: string;
  name: string;
}

export interface FilterDropdownProps {
  label: string;
  options: FilterOption[];
  value: string;
  onChange: (value: string) => void;
}

export function FilterDropdown({ label, options, value, onChange }: FilterDropdownProps) {
  return (
    <div className="flex flex-col gap-1">
      <label className="text-xs font-medium" style={{ color: "#9ca3af" }}>
        {label}
      </label>
      <div className="relative">
        <select
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="w-full appearance-none rounded-lg border px-3 py-2 pr-8 text-sm focus:outline-none focus:ring-2 focus:ring-[#4ade80]/50"
          style={{
            backgroundColor: "#1a1a1a",
            borderColor: "#2a2a2a",
            color: "#e5e5e5",
          }}
        >
          {options.map((opt) => (
            <option key={opt.id} value={opt.id} style={{ backgroundColor: "#1a1a1a" }}>
              {opt.name}
            </option>
          ))}
        </select>
        <span
          className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-[#9ca3af]"
          aria-hidden
        >
          <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M3 4.5l3 3 3-3" />
          </svg>
        </span>
      </div>
    </div>
  );
}
