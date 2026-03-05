"use client";

import React from "react";

export interface ChartContainerProps {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
  className?: string;
}

export function ChartContainer({ title, subtitle, children, className = "" }: ChartContainerProps) {
  return (
    <div
      className={`rounded-xl border p-5 ${className}`}
      style={{
        backgroundColor: "#1a1a1a",
        borderColor: "#2a2a2a",
      }}
    >
      <div className="mb-4">
        <h3 className="font-bold text-white">{title}</h3>
        {subtitle && <p className="mt-0.5 text-sm" style={{ color: "#9ca3af" }}>{subtitle}</p>}
      </div>
      {children}
    </div>
  );
}
