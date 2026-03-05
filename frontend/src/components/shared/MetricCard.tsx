"use client";

import React from "react";

export interface MetricCardProps {
  label: string;
  value: string | number;
  delta: number;
  prefix?: string;
  suffix?: string;
}

export function MetricCard({ label, value, delta, prefix = "", suffix = "" }: MetricCardProps) {
  const isPositive = delta >= 0;

  return (
    <div
      className="rounded-xl border p-4"
      style={{
        backgroundColor: "#1a1a1a",
        borderColor: "#2a2a2a",
      }}
    >
      <p className="mb-1 text-xs font-medium" style={{ color: "#9ca3af" }}>
        {label}
      </p>
      <div className="flex flex-wrap items-baseline gap-2">
        <span className="text-2xl font-bold text-white xl:text-3xl">
          {prefix}
          {value}
          {suffix}
        </span>
        <span
          className="rounded-md px-2 py-0.5 text-xs font-medium"
          style={{
            backgroundColor: isPositive ? "rgba(74, 222, 128, 0.2)" : "rgba(248, 113, 113, 0.2)",
            color: isPositive ? "#4ade80" : "#f87171",
          }}
        >
          {isPositive ? "+" : ""}
          {delta.toFixed(1)}%
        </span>
      </div>
    </div>
  );
}
