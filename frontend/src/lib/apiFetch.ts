"use client";

const STORAGE = "revintel-persona";

function readPersonaId(): string | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(STORAGE);
    if (!raw) return null;
    const j = JSON.parse(raw) as { activePersonaId?: string };
    return j.activePersonaId?.trim() || null;
  } catch {
    return null;
  }
}

/** Same as `fetch`, but sends `X-RevIntel-Persona` so the API can scope data (e.g. EMEA for Regional). */
export function apiFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  const headers = new Headers(init?.headers);
  const pid = readPersonaId();
  if (pid) headers.set("X-RevIntel-Persona", pid);
  if (init?.body && typeof init.body === "string" && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }
  return fetch(input, { ...init, headers });
}
