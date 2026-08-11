"use client";

import { useEffect, useRef, useState, useCallback } from "react";

export interface StreamEvent {
  id: string;
  timestamp: string;
  type: "booking" | "billing" | "collection" | "margin_update" | "connected";
  source_system: string;
  client_name?: string;
  region?: string;
  service_line?: string;
  amount?: number;
  description?: string;
  message?: string;
}

export interface StreamStats {
  totalReceived: number;
  eventsPerMinute: number;
  byType: Record<string, number>;
}

const MAX_EVENTS = 100;
const SSE_BASE = process.env.NEXT_PUBLIC_SSE_URL || "http://localhost:8000";

export function useEventStream(url = `${SSE_BASE}/api/stream/events`) {
  const [events, setEvents] = useState<StreamEvent[]>([]);
  const [isConnected, setIsConnected] = useState(false);
  const [stats, setStats] = useState<StreamStats>({
    totalReceived: 0,
    eventsPerMinute: 0,
    byType: {},
  });
  const esRef = useRef<EventSource | null>(null);
  const startTimeRef = useRef<number>(Date.now());
  const countRef = useRef(0);

  const connect = useCallback(() => {
    if (esRef.current) {
      esRef.current.close();
    }

    const es = new EventSource(url);
    esRef.current = es;
    startTimeRef.current = Date.now();
    countRef.current = 0;

    es.onopen = () => {
      setIsConnected(true);
    };

    es.onmessage = (msg) => {
      try {
        const event: StreamEvent = JSON.parse(msg.data);
        if (event.type === "connected") {
          return;
        }
        countRef.current += 1;
        const elapsed = (Date.now() - startTimeRef.current) / 60000;
        const epm = elapsed > 0 ? countRef.current / elapsed : 0;

        setEvents((prev) => {
          const next = [event, ...prev];
          return next.length > MAX_EVENTS ? next.slice(0, MAX_EVENTS) : next;
        });

        setStats((prev) => ({
          totalReceived: prev.totalReceived + 1,
          eventsPerMinute: Math.round(epm * 10) / 10,
          byType: {
            ...prev.byType,
            [event.type]: (prev.byType[event.type] ?? 0) + 1,
          },
        }));
      } catch {
        // ignore malformed events
      }
    };

    es.onerror = () => {
      setIsConnected(false);
      es.close();
      setTimeout(connect, 3000);
    };
  }, [url]);

  useEffect(() => {
    connect();
    return () => {
      esRef.current?.close();
      esRef.current = null;
    };
  }, [connect]);

  return { events, isConnected, stats };
}
