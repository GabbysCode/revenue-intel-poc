"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState } from "react";
import { NAV_ITEMS } from "@/lib/constants";
import { useAuth } from "@/lib/auth-context";
import { PERSONAS, type Persona } from "@/lib/personas";

const ICONS: Record<string, React.ReactNode> = {
  LayoutDashboard: (
    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V6zM14 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2zM14 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z" />
    </svg>
  ),
  Clock: (
    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
    </svg>
  ),
  PoundSterling: (
    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18 7c-3-2.5-9-2-9 3v4H7m11 7H7c1.5-2 1.5-4 1.5-7M7 12h7" />
    </svg>
  ),
  CalendarDays: (
    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
    </svg>
  ),
  AlertCircle: (
    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
    </svg>
  ),
  TrendingUp: (
    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 17l6-6 4 4 8-8m0 0h-5m5 0v5" />
    </svg>
  ),
  Percent: (
    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 5L5 19m2-12a2 2 0 11-4 0 2 2 0 014 0zm14 12a2 2 0 11-4 0 2 2 0 014 0z" />
    </svg>
  ),
  Briefcase: (
    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 13.255A23.93 23.93 0 0112 15c-3.183 0-6.22-.62-9-1.745M16 6V4a2 2 0 00-2-2h-4a2 2 0 00-2 2v2m4 6h.01M5 20h14a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
    </svg>
  ),
  Users: (
    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a4 4 0 00-3-3.87M9 20H4v-2a4 4 0 013-3.87m6-5a4 4 0 11-8 0 4 4 0 018 0zm6 0a4 4 0 11-8 0 4 4 0 018 0z" />
    </svg>
  ),
};

export function Sidebar() {
  const pathname = usePathname();
  const router = useRouter();
  const { activePersona, setActivePersona, logout } = useAuth();
  const [isOpen, setIsOpen] = useState(false);
  const [personaOpen, setPersonaOpen] = useState(false);

  const p: Persona | null = activePersona;

  // Sidebar uses fixed KPMG navy regardless of light/dark theme — locked spec.
  // We use CSS vars so a future tweak only needs a globals.css change.
  return (
    <>
      {isOpen && (
        <div
          className="fixed inset-0 bg-black/50 z-40 lg:hidden"
          onClick={() => setIsOpen(false)}
          aria-hidden="true"
        />
      )}

      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="fixed top-4 left-4 z-50 lg:hidden p-2 rounded-lg shadow-md"
        style={{
          background: "var(--sidebar-bg, #00338D)",
          color: "var(--sidebar-text, #ffffff)",
        }}
        aria-label="Toggle sidebar"
      >
        <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
        </svg>
      </button>

      <aside
        className={`
          fixed lg:static inset-y-0 left-0 z-40
          w-64 flex flex-col
          transform transition-transform duration-200 ease-in-out
          ${isOpen ? "translate-x-0" : "-translate-x-full lg:translate-x-0"}
        `}
        style={{
          background: "var(--sidebar-bg, #00338D)",
          color: "var(--sidebar-text, #ffffff)",
        }}
      >
        <div
          className="flex items-center gap-3 px-5 py-4"
          style={{ borderBottom: "1px solid var(--sidebar-border, rgba(255,255,255,0.12))" }}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/kpmg-logo.png" alt="KPMG" className="h-7 w-auto" />
          <div className="h-5 w-px" style={{ background: "var(--sidebar-border, rgba(255,255,255,0.12))" }} />
          <span className="font-semibold text-sm">Revenue Intel</span>
        </div>

        <nav className="flex-1 overflow-y-auto py-4 px-3">
          {NAV_ITEMS.map((group) => (
            <div key={group.group} className="mb-6">
              <h3 className="px-3 mb-2 text-xs font-medium uppercase tracking-wider" style={{ color: "var(--sidebar-text-muted, rgba(255,255,255,0.6))" }}>
                {group.group}
              </h3>
              <ul className="space-y-0.5">
                {group.items.map((item) => {
                  const isActive = pathname === item.href || (item.href !== "/" && pathname.startsWith(item.href));
                  return (
                    <li key={item.href}>
                      <Link
                        href={item.href}
                        onClick={() => setIsOpen(false)}
                        className="flex items-center gap-3 px-3 py-2.5 rounded-lg transition-colors duration-150 relative"
                        style={{
                          background: isActive ? "var(--sidebar-active, color-mix(in oklch, white 12%, #00338D))" : "transparent",
                          color: "var(--sidebar-text, #ffffff)",
                        }}
                        onMouseEnter={(e) => {
                          if (!isActive) {
                            e.currentTarget.style.background = "var(--sidebar-hover, color-mix(in oklch, white 8%, #00338D))";
                          }
                        }}
                        onMouseLeave={(e) => {
                          if (!isActive) {
                            e.currentTarget.style.background = "transparent";
                          }
                        }}
                      >
                        {isActive && (
                          <span className="absolute left-0 top-1/2 -translate-y-1/2 w-1 h-6 rounded-r" style={{ background: "var(--sidebar-text, #ffffff)" }} />
                        )}
                        <span className="flex-shrink-0">
                          {ICONS[item.icon] ?? null}
                        </span>
                        <span className="font-medium">{item.label}</span>
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
        </nav>

        <div
          className="p-4 relative"
          style={{ borderTop: "1px solid var(--sidebar-border, rgba(255,255,255,0.12))" }}
        >
          {p && (
            <div className="text-[10px] uppercase tracking-wider px-3 mb-1" style={{ color: "var(--sidebar-text-muted, rgba(255,255,255,0.6))" }}>
              Signed in as
            </div>
          )}
          <div className="relative">
            <button
              type="button"
              onClick={() => setPersonaOpen((o) => !o)}
              className="w-full flex items-center gap-3 px-3 py-2 rounded-lg text-left transition-colors"
              style={{ color: "var(--sidebar-text, #ffffff)" }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = "var(--sidebar-hover, color-mix(in oklch, white 8%, #00338D))";
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = "transparent";
              }}
            >
              {p ? (
                <>
                  <div
                    className="w-9 h-9 rounded-full flex items-center justify-center text-sm font-medium shrink-0"
                    style={{ backgroundColor: `${p.accent}33`, color: p.accent }}
                  >
                    {p.initials}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-medium truncate">{p.name}</p>
                    <p className="text-xs truncate" title={p.title} style={{ color: "var(--sidebar-text-muted, rgba(255,255,255,0.6))" }}>
                      {p.title}
                    </p>
                  </div>
                </>
              ) : null}
              <svg
                className={`w-4 h-4 flex-shrink-0 transition-transform ${personaOpen ? "rotate-180" : ""}`}
                style={{ color: "var(--sidebar-text-muted, rgba(255,255,255,0.6))" }}
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
              </svg>
            </button>

            {personaOpen && p && (
              <>
                <div
                  className="fixed inset-0 z-10"
                  onClick={() => setPersonaOpen(false)}
                  aria-hidden="true"
                />
                <div
                  className="absolute bottom-full left-0 right-0 mb-1 z-20 max-h-64 overflow-y-auto rounded-lg shadow-lg py-1"
                  style={{
                    background: "var(--sidebar-bg, #00338D)",
                    border: "1px solid var(--sidebar-border, rgba(255,255,255,0.12))",
                  }}
                >
                  {PERSONAS.map((x) => (
                    <button
                      key={x.id}
                      type="button"
                      onClick={() => {
                        if (x.id !== p.id) {
                          setActivePersona(x.id);
                          setPersonaOpen(false);
                        }
                      }}
                      className="w-full text-left px-3 py-2.5 text-sm flex items-center gap-2 transition-colors"
                      style={{
                        background: x.id === p.id ? "var(--sidebar-active, color-mix(in oklch, white 12%, #00338D))" : "transparent",
                        color: "var(--sidebar-text, #ffffff)",
                      }}
                    >
                      <span
                        className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-medium"
                        style={{ backgroundColor: `${x.accent}33`, color: x.accent }}
                      >
                        {x.initials}
                      </span>
                      <span className="min-w-0">
                        <span className="block font-medium truncate">{x.name}</span>
                        <span className="block text-[10px] truncate" style={{ color: "var(--sidebar-text-muted, rgba(255,255,255,0.6))" }}>{x.title}</span>
                      </span>
                    </button>
                  ))}
                  <div className="my-1" style={{ borderTop: "1px solid var(--sidebar-border, rgba(255,255,255,0.12))" }} />
                  <button
                    type="button"
                    onClick={() => {
                      setPersonaOpen(false);
                      logout();
                      router.push("/login");
                    }}
                    className="w-full text-left px-3 py-2.5 text-sm transition-colors"
                    style={{ color: "var(--color-negative, #fca5a5)" }}
                  >
                    Sign out
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      </aside>
    </>
  );
}
