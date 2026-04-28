"use client";

import {
  createContext,
  useCallback,
  useContext,
  useLayoutEffect,
  useMemo,
  useState,
} from "react";
import { getPersonaById, type Persona } from "@/lib/personas";

const STORAGE_KEY = "revintel-persona";

type AuthState = {
  activePersonaId: string;
};

type AuthContextValue = {
  /** null before hydration from localStorage */
  isReady: boolean;
  isAuthenticated: boolean;
  activePersona: Persona | null;
  login: (personaId: string, accessCode: string) => { ok: boolean; error?: string };
  logout: () => void;
  setActivePersona: (personaId: string) => void;
};

const AuthContext = createContext<AuthContextValue | null>(null);

function getExpectedAccessCode(): string {
  if (typeof window === "undefined") return "";
  return (
    process.env.NEXT_PUBLIC_DEMO_ACCESS_CODE?.trim() ??
    ""
  );
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [isReady, setIsReady] = useState(false);
  const [activePersonaId, setActivePersonaId] = useState<string | null>(null);

  // useLayoutEffect: hydrate session before first paint to avoid a stuck "Loading" flash on protected routes
  useLayoutEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed: AuthState = JSON.parse(raw);
        if (parsed?.activePersonaId && getPersonaById(parsed.activePersonaId)) {
          setActivePersonaId(parsed.activePersonaId);
        }
      }
    } catch {
      /* ignore */
    }
    setIsReady(true);
  }, []);

  const persist = useCallback((id: string | null) => {
    if (id) {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ activePersonaId: id } satisfies AuthState));
    } else {
      localStorage.removeItem(STORAGE_KEY);
    }
  }, []);

  const login = useCallback(
    (personaId: string, accessCode: string): { ok: boolean; error?: string } => {
      const p = getPersonaById(personaId);
      if (!p) return { ok: false, error: "Unknown persona." };

      const expected = getExpectedAccessCode();
      if (expected && accessCode.trim() !== expected) {
        return { ok: false, error: "Invalid access code." };
      }

      setActivePersonaId(personaId);
      persist(personaId);
      return { ok: true };
    },
    [persist]
  );

  const logout = useCallback(() => {
    setActivePersonaId(null);
    persist(null);
  }, [persist]);

  const setActivePersona = useCallback(
    (personaId: string) => {
      if (!getPersonaById(personaId)) return;
      setActivePersonaId(personaId);
      persist(personaId);
    },
    [persist]
  );

  const activePersona = getPersonaById(activePersonaId);

  const value = useMemo<AuthContextValue>(
    () => ({
      isReady,
      isAuthenticated: Boolean(activePersonaId && activePersona),
      activePersona,
      login,
      logout,
      setActivePersona,
    }),
    [isReady, activePersonaId, activePersona, login, logout, setActivePersona]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
