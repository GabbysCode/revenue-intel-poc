"use client";

import React from "react";

export interface DateRangePickerProps {
  startDate: string;
  endDate: string;
  onChange?: (startDate: string, endDate: string) => void;
}

function formatDisplayDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

export function DateRangePicker({ startDate, endDate, onChange }: DateRangePickerProps) {
  const displayText = `${formatDisplayDate(startDate)} – ${formatDisplayDate(endDate)}`;

  const handleClick = () => {
    if (onChange) {
      const newStart = prompt("Enter start date (YYYY-MM-DD):", startDate);
      const newEnd = prompt("Enter end date (YYYY-MM-DD):", endDate);
      if (newStart && newEnd) {
        onChange(newStart, newEnd);
      }
    }
  };

  return (
    <button
      type="button"
      onClick={handleClick}
      className="flex items-center gap-2 rounded-lg border px-3 py-2 text-sm transition-colors hover:bg-[#252525]"
      style={{
        backgroundColor: "#1a1a1a",
        borderColor: "#2a2a2a",
        color: "#e5e5e5",
      }}
    >
      <span aria-hidden>📅</span>
      <span>{displayText}</span>
    </button>
  );
}
