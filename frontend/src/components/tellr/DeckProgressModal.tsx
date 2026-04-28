"use client";

import { useEffect, useRef, useState } from "react";
import { apiFetch } from "@/lib/apiFetch";

export interface KpiSnapshot {
  chargeable_hours?: number | null;
  hourly_rate?: number | null;
  gross_fee_days?: number | null;
  unbilled_days?: number | null;
}

export interface DeckProgressProps {
  open: boolean;
  onClose: () => void;
  /** Plain-text summary the user wants narrated; required by the backend. */
  summary: string;
  periodStart?: string;
  periodEnd?: string;
  capability?: string | null;
  region?: string | null;
  kpiSnapshot: KpiSnapshot;
}

type PollState =
  | { kind: "idle" }
  | { kind: "creating" }
  | { kind: "polling"; sessionId: string; requestId: string; correlationId?: string; status?: string }
  | { kind: "ready"; sessionId: string; requestId: string; correlationId?: string; htmlDocument: string; deckUrl?: string }
  | { kind: "error"; message: string; correlationId?: string };

const FAST_POLL_MS = 2000;
const SLOW_POLL_MS = 5000;
const FAST_POLL_DURATION_MS = 30_000;
const HARD_DEADLINE_MS = 10 * 60 * 1000;

export function DeckProgressModal({
  open,
  onClose,
  summary,
  periodStart,
  periodEnd,
  capability,
  region,
  kpiSnapshot,
}: DeckProgressProps) {
  const [state, setState] = useState<PollState>({ kind: "idle" });
  const startedAtRef = useRef<number>(0);
  const cancelledRef = useRef(false);

  useEffect(() => {
    if (!open) {
      // Reset on close so the next open starts fresh.
      cancelledRef.current = true;
      setState({ kind: "idle" });
      return;
    }
    cancelledRef.current = false;
    startedAtRef.current = Date.now();
    setState({ kind: "creating" });

    apiFetch("/api/tellr/create-executive-deck", {
      method: "POST",
      body: JSON.stringify({
        summary,
        period_start: periodStart,
        period_end: periodEnd,
        region,
        capability,
        num_slides: 10,
        kpi_snapshot: kpiSnapshot,
      }),
    })
      .then(async (r) => {
        const j = await r.json().catch(() => ({}));
        if (!r.ok) throw new Error(j?.detail || j?.error || `HTTP ${r.status}`);
        return j;
      })
      .then((j) => {
        if (cancelledRef.current) return;
        if (!j.session_id || !j.request_id) {
          throw new Error("Tellr did not return session/request ids.");
        }
        setState({
          kind: "polling",
          sessionId: j.session_id,
          requestId: j.request_id,
          correlationId: j.correlation_id,
          status: j.status || "pending",
        });
      })
      .catch((e) => {
        if (cancelledRef.current) return;
        setState({ kind: "error", message: e instanceof Error ? e.message : String(e) });
      });

    return () => {
      cancelledRef.current = true;
    };
  }, [open, summary, periodStart, periodEnd, capability, region, kpiSnapshot]);

  // Polling loop — driven off latest state via a ref so timeouts don't capture stale values.
  const stateRef = useRef(state);
  stateRef.current = state;

  useEffect(() => {
    if (!open) return;
    if (state.kind !== "polling") return;

    let timer: ReturnType<typeof setTimeout> | null = null;

    const poll = async () => {
      if (cancelledRef.current) return;
      const elapsed = Date.now() - startedAtRef.current;
      if (elapsed >= HARD_DEADLINE_MS) {
        setState({
          kind: "error",
          message: `Deck did not finish within ${(HARD_DEADLINE_MS / 60_000).toFixed(0)} minutes.`,
          correlationId: state.correlationId,
        });
        return;
      }
      try {
        const r = await apiFetch(
          `/api/tellr/deck-status?session_id=${encodeURIComponent(state.sessionId)}&request_id=${encodeURIComponent(state.requestId)}`,
        );
        const j = await r.json().catch(() => ({}));
        if (!r.ok) throw new Error(j?.detail || j?.error || `HTTP ${r.status}`);
        const status = (j.status || "pending").toLowerCase();
        if (status === "ready" || status === "complete" || status === "completed") {
          setState({
            kind: "ready",
            sessionId: state.sessionId,
            requestId: state.requestId,
            correlationId: state.correlationId,
            htmlDocument: j.html_document || "",
            deckUrl: j.deck_url || undefined,
          });
          return;
        }
        if (status === "error" || status === "failed") {
          setState({
            kind: "error",
            message: j.error || "Tellr reported a generation failure.",
            correlationId: state.correlationId,
          });
          return;
        }
        // Still running — schedule next tick at appropriate cadence.
        const interval = elapsed < FAST_POLL_DURATION_MS ? FAST_POLL_MS : SLOW_POLL_MS;
        setState((prev) => (prev.kind === "polling" ? { ...prev, status } : prev));
        timer = setTimeout(poll, interval);
      } catch (e) {
        if (cancelledRef.current) return;
        setState({
          kind: "error",
          message: e instanceof Error ? e.message : String(e),
          correlationId: state.correlationId,
        });
      }
    };

    // Kick off immediately, then drive cadence inside `poll`.
    timer = setTimeout(poll, 0);
    return () => {
      if (timer) clearTimeout(timer);
    };
  }, [open, state]);

  const downloadPdf = async () => {
    if (state.kind !== "ready") return;
    const url = `/api/tellr/deck-pdf?session_id=${encodeURIComponent(state.sessionId)}&request_id=${encodeURIComponent(state.requestId)}`;
    try {
      const r = await apiFetch(url);
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const blob = await r.blob();
      const objectUrl = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = objectUrl;
      a.download = "revintel-executive-deck.pdf";
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(objectUrl);
    } catch (e) {
      alert(e instanceof Error ? e.message : "Could not download PDF.");
    }
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ background: "rgba(0,0,0,0.5)" }}>
      <div
        className="relative w-full max-w-3xl mx-4 rounded-xl shadow-xl"
        style={{
          background: "var(--color-surface, #ffffff)",
          color: "var(--color-text, #111827)",
          border: "1px solid var(--color-border, #e5e7eb)",
        }}
      >
        <header className="flex items-start justify-between p-5 border-b" style={{ borderColor: "var(--color-border, #e5e7eb)" }}>
          <div>
            <h2 className="text-lg font-semibold">Export to Presentation</h2>
            <p className="text-sm" style={{ color: "var(--color-text-muted, #6b7280)" }}>
              Tellr is generating your board-ready deck.
            </p>
          </div>
          <button type="button" onClick={onClose} aria-label="Close" className="p-1.5 rounded hover:bg-[color:var(--color-surface-2,#f3f4f6)]">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </header>

        <div className="p-5 space-y-4">
          {state.kind === "creating" && <Status label="Submitting prompt to Tellr…" />}
          {state.kind === "polling" && <Status label={`Tellr ${state.status || "pending"}…`} />}
          {state.kind === "error" && (
            <div className="rounded-md p-3 text-sm" style={{ background: "var(--color-surface-2, #f3f4f6)", color: "var(--color-negative, #dc2626)" }}>
              <strong>Generation failed.</strong>
              <p className="mt-1">{state.message}</p>
              {state.correlationId && (
                <p className="mt-2 text-xs" style={{ color: "var(--color-text-muted, #6b7280)" }}>
                  correlation_id: <code>{state.correlationId}</code>
                </p>
              )}
            </div>
          )}
          {state.kind === "ready" && (
            <>
              <div className="flex items-center gap-2 text-sm">
                <span
                  className="inline-flex items-center gap-2 rounded-full px-2.5 py-1 text-xs font-medium"
                  style={{ background: "var(--color-positive-soft, rgba(5,150,105,0.12))", color: "var(--color-positive, #059669)" }}
                >
                  <span className="w-1.5 h-1.5 rounded-full" style={{ background: "var(--color-positive, #059669)" }} />
                  Deck ready
                </span>
              </div>
              <div
                className="rounded-md overflow-hidden border"
                style={{ borderColor: "var(--color-border, #e5e7eb)", height: 360 }}
              >
                <iframe
                  title="Tellr deck preview"
                  srcDoc={state.htmlDocument}
                  className="w-full h-full"
                  sandbox="allow-same-origin"
                />
              </div>
              <div className="flex flex-wrap gap-2">
                {state.deckUrl && (
                  <a
                    href={state.deckUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="px-3 py-2 rounded-md text-sm font-medium border"
                    style={{ borderColor: "var(--color-border, #e5e7eb)", color: "var(--color-text, #111827)" }}
                  >
                    Open in Tellr
                  </a>
                )}
                <button
                  type="button"
                  onClick={downloadPdf}
                  className="px-3 py-2 rounded-md text-sm font-medium"
                  style={{ background: "var(--color-accent, #00338D)", color: "var(--color-on-accent, #ffffff)" }}
                >
                  Download PDF
                </button>
                {/* TODO(v1.1): direct PPTX / Google Slides via tools/call export_pptx | export_google_slides */}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function Status({ label }: { label: string }) {
  return (
    <div className="flex items-center gap-3">
      <span className="inline-block w-3 h-3 rounded-full animate-pulse" style={{ background: "var(--color-accent, #00338D)" }} />
      <span className="text-sm" style={{ color: "var(--color-text, #111827)" }}>{label}</span>
    </div>
  );
}
