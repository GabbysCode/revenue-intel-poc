"use client";

import React, { useEffect, useState } from "react";
import { useEventStream, type StreamEvent } from "@/lib/useEventStream";
import { formatCurrency } from "@/lib/formatters";

const SOURCE_COLORS: Record<string, string> = {
  Salesforce: "#60a5fa",
  Oracle: "#a78bfa",
  SAP: "#4ade80",
  "Internal ERP": "#facc15",
};

const TYPE_LABELS: Record<string, string> = {
  booking: "Booking",
  billing: "Billing",
  collection: "Collection",
  margin_update: "Margin",
};

function timeAgo(ts: string): string {
  const diff = Math.floor((Date.now() - new Date(ts).getTime()) / 1000);
  if (diff < 5) return "now";
  if (diff < 60) return `${diff}s`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m`;
  return `${Math.floor(diff / 3600)}h`;
}

export function LiveFeedPanel() {
  const { events, isConnected, stats } = useEventStream();
  const [, setTick] = useState(0);

  useEffect(() => {
    const interval = setInterval(() => setTick((t) => t + 1), 2000);
    return () => clearInterval(interval);
  }, []);

  const displayEvents = events.slice(0, 15);

  return (
    <div className="rounded-xl border bg-[#1a1a1a] border-[#2a2a2a] overflow-hidden">
      <div className="px-5 py-3 border-b border-[#2a2a2a] flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span
            className={`w-2 h-2 rounded-full ${isConnected ? "bg-[#4ade80]" : "bg-[#f87171]"}`}
            style={isConnected ? { animation: "pulse-live 2s ease-in-out infinite" } : undefined}
          />
          <h3 className="text-sm font-semibold text-white">Live Feed</h3>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-[10px] text-[#888]">{stats.eventsPerMinute} evt/min</span>
          <a
            href="/live"
            className="text-[10px] px-2 py-0.5 rounded bg-[#4ade80]/10 text-[#4ade80] hover:bg-[#4ade80]/20 transition-colors"
          >
            View all
          </a>
        </div>
      </div>
      <div className="max-h-[380px] overflow-y-auto">
        {displayEvents.length === 0 ? (
          <div className="flex items-center justify-center h-20 text-xs text-[#888]">
            Connecting to stream...
          </div>
        ) : (
          displayEvents.map((event) => (
            <CompactEventRow key={event.id} event={event} />
          ))
        )}
      </div>
    </div>
  );
}

function CompactEventRow({ event }: { event: StreamEvent }) {
  const color = SOURCE_COLORS[event.source_system ?? ""] ?? "#888";
  const isPositive = (event.amount ?? 0) >= 0;

  return (
    <div
      className="flex items-center gap-2 px-4 py-2.5 border-b border-[#2a2a2a]/30 hover:bg-[#151515] transition-colors"
      style={{ animation: "fadeSlideIn 0.3s ease-out" }}
    >
      <div className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ backgroundColor: color }} />
      <span
        className="text-[9px] font-semibold uppercase px-1 py-0.5 rounded flex-shrink-0"
        style={{ backgroundColor: `${color}15`, color }}
      >
        {TYPE_LABELS[event.type] ?? event.type}
      </span>
      <span className="text-xs text-[#e5e5e5] truncate flex-1">{event.client_name}</span>
      <span className="text-xs text-[#888] flex-shrink-0">{event.region}</span>
      <span
        className={`text-xs font-semibold flex-shrink-0 ${isPositive ? "text-[#4ade80]" : "text-[#f87171]"}`}
      >
        {isPositive ? "+" : ""}{formatCurrency(event.amount ?? 0, true)}
      </span>
      <span className="text-[9px] text-[#666] flex-shrink-0 w-6 text-right">{timeAgo(event.timestamp)}</span>
    </div>
  );
}
