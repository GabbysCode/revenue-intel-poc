"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { useAuth } from "@/lib/auth-context";
import { GENIE_ROOM_URL, PERSONAS, type Persona } from "@/lib/personas";

const REQUIRES_CODE = Boolean(
  typeof process !== "undefined" && process.env.NEXT_PUBLIC_DEMO_ACCESS_CODE?.trim()
);

export default function LoginPage() {
  const router = useRouter();
  const { isReady, isAuthenticated, login } = useAuth();
  const [returnTo, setReturnTo] = useState("/");
  const [selected, setSelected] = useState<Persona | null>(null);
  const [accessCode, setAccessCode] = useState("");
  const [error, setError] = useState<string | null>(null);

  // Avoid useSearchParams() — it can suspend the route and leave the app on “Loading” forever in some cases.
  useEffect(() => {
    const sp = new URLSearchParams(
      typeof window !== "undefined" ? window.location.search : ""
    );
    const f = sp.get("from");
    if (f && f.startsWith("/") && !f.startsWith("//")) setReturnTo(f);
  }, []);

  useEffect(() => {
    if (isReady && isAuthenticated) router.replace(returnTo);
  }, [isReady, isAuthenticated, returnTo, router]);

  if (isReady && isAuthenticated) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#0a0a0a] text-[#888888] text-sm">
        Opening app…
      </div>
    );
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!selected) {
      setError("Select a persona to continue.");
      return;
    }
    const result = login(selected.id, accessCode);
    if (!result.ok) {
      setError(result.error ?? "Sign in failed.");
      return;
    }
    router.replace(returnTo);
  };

  return (
    <div className="min-h-screen flex flex-col items-center justify-center px-4 py-12 bg-[#0a0a0a] text-[#e5e5e5]">
      <div className="w-full max-w-3xl">
        <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-6 mb-10">
          <div className="flex items-center gap-4">
            <img src="/kpmg-logo.png" alt="KPMG" className="h-9 w-auto" />
            <div className="h-8 w-px bg-[#2a2a2a]" />
            <div>
              <h1 className="text-2xl font-semibold tracking-tight">Revenue Intel</h1>
              <p className="text-sm text-[#888888] mt-1">Sign in with a demo persona to explore the platform</p>
            </div>
          </div>
          {GENIE_ROOM_URL && (
            <a
              href={GENIE_ROOM_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="text-sm text-[#81d4e2] hover:underline shrink-0"
            >
              Open Databricks Genie room →
            </a>
          )}
        </div>

        <form
          onSubmit={handleSubmit}
          className="rounded-2xl border border-[#2a2a2a] bg-[#141414] p-6 sm:p-8 shadow-xl"
        >
          <p className="text-sm text-[#a3a3a3] mb-4">
            Choose who you are simulating. You can switch personas anytime from the sidebar.
          </p>

          <div className="grid sm:grid-cols-2 gap-3 mb-6">
            {PERSONAS.map((p) => {
              const active = selected?.id === p.id;
              return (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => {
                    setSelected(p);
                    setError(null);
                  }}
                  className={`
                    text-left rounded-xl border p-4 transition-all
                    ${active
                      ? "border-[#81d4e2] bg-[#1a1a1a] ring-1 ring-[#81d4e2]/30"
                      : "border-[#2a2a2a] bg-[#0f0f0f] hover:border-[#444] hover:bg-[#161616]"
                    }
                  `}
                >
                  <div className="flex items-start gap-3">
                    <div
                      className="w-10 h-10 rounded-full flex items-center justify-center text-sm font-semibold shrink-0"
                      style={{ backgroundColor: `${p.accent}22`, color: p.accent }}
                    >
                      {p.initials}
                    </div>
                    <div className="min-w-0">
                      <p className="font-medium text-[#e5e5e5]">{p.name}</p>
                      <p className="text-xs text-[#888888] mt-0.5">{p.title}</p>
                      <p className="text-xs text-[#6b6b6b] mt-2 line-clamp-2">{p.description}</p>
                    </div>
                  </div>
                </button>
              );
            })}
          </div>

          {REQUIRES_CODE && (
            <div className="mb-6">
              <label htmlFor="access" className="block text-sm font-medium text-[#a3a3a3] mb-2">
                Access code
              </label>
              <input
                id="access"
                type="password"
                autoComplete="off"
                value={accessCode}
                onChange={(e) => setAccessCode(e.target.value)}
                className="w-full px-4 py-2.5 rounded-lg bg-[#0f0f0f] border border-[#2a2a2a] text-[#e5e5e5] placeholder-[#666] text-sm focus:outline-none focus:ring-2 focus:ring-[#81d4e2]/40 focus:border-[#81d4e2]/50"
                placeholder="Enter the demo access code"
              />
            </div>
          )}

          {error && (
            <p className="text-sm text-red-400 mb-4" role="alert">
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={!selected}
            className="w-full sm:w-auto px-8 py-3 rounded-lg text-sm font-semibold text-[#0f0f0f] disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            style={{ backgroundColor: "#81d4e2" }}
          >
            {selected ? `Continue as ${selected.name.split(" ")[0]}` : "Select a persona"}
          </button>
        </form>
      </div>
    </div>
  );
}
