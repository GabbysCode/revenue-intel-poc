"use client";

import React, { useEffect, useState } from "react";
import { Header } from "@/components/layout/Header";
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
  margin_update: "Margin Update",
};

function timeAgo(ts: string): string {
  const diff = Math.floor((Date.now() - new Date(ts).getTime()) / 1000);
  if (diff < 5) return "just now";
  if (diff < 60) return `${diff}s ago`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  return `${Math.floor(diff / 3600)}h ago`;
}

interface SourceStatus {
  name: string;
  type: string;
  events: number;
  status: string;
}

export default function LiveFeedPage() {
  const { events, isConnected, stats } = useEventStream();
  const [sourceStatus, setSourceStatus] = useState<SourceStatus[]>([]);
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    const interval = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    fetch("/api/stream/status")
      .then((r) => r.json())
      .then((d) => setSourceStatus(d.source_systems ?? []))
      .catch(() => {});
    const interval = setInterval(() => {
      fetch("/api/stream/status")
        .then((r) => r.json())
        .then((d) => setSourceStatus(d.source_systems ?? []))
        .catch(() => {});
    }, 5000);
    return () => clearInterval(interval);
  }, []);

  const runningTotals = events.reduce(
    (acc, e) => {
      if (e.type === "booking") acc.bookings += e.amount ?? 0;
      if (e.type === "billing") acc.billings += e.amount ?? 0;
      if (e.type === "collection") acc.collections += e.amount ?? 0;
      return acc;
    },
    { bookings: 0, billings: 0, collections: 0 }
  );

  return (
    <>
      <Header
        title="Live Feed"
        subtitle="Real-time unified data stream from Salesforce, Oracle & SAP"
      />
      <div className="p-6 space-y-6">
        {/* Top row: connection status + running totals */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <div className="rounded-xl border p-4 bg-[#1a1a1a] border-[#2a2a2a]">
            <div className="flex items-center gap-2 mb-2">
              <span
                className={`w-2.5 h-2.5 rounded-full ${isConnected ? "bg-[#4ade80] animate-pulse" : "bg-[#f87171]"}`}
              />
              <span className="text-sm font-medium text-[#e5e5e5]">
                {isConnected ? "Stream Connected" : "Reconnecting..."}
              </span>
            </div>
            <p className="text-2xl font-bold text-[#4ade80]">{stats.eventsPerMinute}</p>
            <p className="text-xs text-[#888]">events / min</p>
          </div>
          {[
            { label: "Bookings", value: runningTotals.bookings, color: "#60a5fa" },
            { label: "Billings", value: runningTotals.billings, color: "#a78bfa" },
            { label: "Collections", value: runningTotals.collections, color: "#4ade80" },
          ].map((t) => (
            <div key={t.label} className="rounded-xl border p-4 bg-[#1a1a1a] border-[#2a2a2a]">
              <p className="text-xs text-[#888] mb-1">Session {t.label}</p>
              <p className="text-2xl font-bold" style={{ color: t.color }}>
                {formatCurrency(t.value, true)}
              </p>
              <p className="text-xs text-[#888]">{stats.byType[t.label.toLowerCase().slice(0, -1)] ?? stats.byType[t.label === "Bookings" ? "booking" : t.label === "Billings" ? "billing" : "collection"] ?? 0} events</p>
            </div>
          ))}
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Event feed */}
          <div className="lg:col-span-2 rounded-xl border bg-[#1a1a1a] border-[#2a2a2a] overflow-hidden">
            <div className="px-5 py-4 border-b border-[#2a2a2a] flex items-center justify-between">
              <div>
                <h3 className="font-bold text-white">Unified Event Stream</h3>
                <p className="text-xs text-[#9ca3af] mt-0.5">
                  Single source of truth — all systems consolidated
                </p>
              </div>
              <span className="text-xs px-2 py-1 rounded bg-[#4ade80]/10 text-[#4ade80]">
                {stats.totalReceived} received
              </span>
            </div>
            <div className="max-h-[600px] overflow-y-auto">
              {events.length === 0 ? (
                <div className="flex items-center justify-center h-40 text-[#888]">
                  Waiting for events...
                </div>
              ) : (
                events.map((event) => (
                  <EventRow key={event.id} event={event} now={now} />
                ))
              )}
            </div>
          </div>

          {/* Source system status */}
          <div className="space-y-4">
            <div className="rounded-xl border bg-[#1a1a1a] border-[#2a2a2a] p-5">
              <h3 className="font-bold text-white mb-4">Source Systems</h3>
              <div className="space-y-3">
                {(sourceStatus.length > 0
                  ? sourceStatus
                  : [
                      { name: "Salesforce", type: "booking", events: 0, status: "connecting" },
                      { name: "Oracle", type: "billing", events: 0, status: "connecting" },
                      { name: "SAP", type: "collection", events: 0, status: "connecting" },
                      { name: "Internal ERP", type: "margin_update", events: 0, status: "connecting" },
                    ]
                ).map((sys) => (
                  <div
                    key={sys.name}
                    className="flex items-center justify-between p-3 rounded-lg bg-[#151515]"
                  >
                    <div className="flex items-center gap-3">
                      <div
                        className="w-2 h-2 rounded-full"
                        style={{ backgroundColor: sys.status === "connected" ? "#4ade80" : "#888" }}
                      />
                      <div>
                        <p className="text-sm font-medium text-[#e5e5e5]">{sys.name}</p>
                        <p className="text-xs text-[#888]">{TYPE_LABELS[sys.type] ?? sys.type}</p>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className="text-sm font-medium text-[#e5e5e5]">{sys.events}</p>
                      <p className="text-xs text-[#888]">events</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="rounded-xl border bg-[#1a1a1a] border-[#2a2a2a] p-5">
              <h3 className="font-bold text-white mb-3">Stream Health</h3>
              <div className="space-y-3">
                <div className="flex justify-between text-sm">
                  <span className="text-[#888]">Throughput</span>
                  <span className="text-[#e5e5e5]">{stats.eventsPerMinute} evt/min</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-[#888]">Total Received</span>
                  <span className="text-[#e5e5e5]">{stats.totalReceived}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-[#888]">Connection</span>
                  <span className={isConnected ? "text-[#4ade80]" : "text-[#f87171]"}>
                    {isConnected ? "Active" : "Reconnecting"}
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}

function EventRow({ event, now }: { event: StreamEvent; now: number }) {
  const color = SOURCE_COLORS[event.source_system ?? ""] ?? "#888";
  const isPositive = (event.amount ?? 0) >= 0;

  return (
    <div className="flex items-start gap-3 px-5 py-3 border-b border-[#2a2a2a]/50 hover:bg-[#151515] transition-colors animate-[fadeSlideIn_0.3s_ease-out]">
      <div className="mt-1 w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: color }} />
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-0.5">
          <span
            className="text-[10px] font-semibold uppercase px-1.5 py-0.5 rounded"
            style={{ backgroundColor: `${color}20`, color }}
          >
            {event.source_system}
          </span>
          <span className="text-[10px] text-[#888] uppercase">{TYPE_LABELS[event.type] ?? event.type}</span>
        </div>
        <p className="text-sm text-[#e5e5e5] truncate">{event.description}</p>
        <p className="text-xs text-[#888] mt-0.5">
          {event.client_name} &middot; {event.region} &middot; {event.service_line}
        </p>
      </div>
      <div className="text-right flex-shrink-0">
        <p className={`text-sm font-semibold ${isPositive ? "text-[#4ade80]" : "text-[#f87171]"}`}>
          {isPositive ? "+" : ""}{formatCurrency(event.amount ?? 0, true)}
        </p>
        <p className="text-[10px] text-[#888]">{timeAgo(event.timestamp)}</p>
      </div>
    </div>
  );
}
