"use client";

import { Suspense, useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";
import { Sidebar } from "@/components/layout/Sidebar";
import { ChatPane } from "@/components/nlp/ChatPane";
import { useAuth } from "@/lib/auth-context";
import { ChatHistoryProvider } from "@/lib/chat-history";
import { FilterStateProvider } from "@/lib/filter-state";

const LOGIN_PATH = "/login";

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { isReady, isAuthenticated } = useAuth();
  const isLogin = pathname === LOGIN_PATH;

  useEffect(() => {
    if (!isReady) return;
    if (isLogin) return;
    if (!isAuthenticated) {
      const from =
        typeof window !== "undefined"
          ? window.location.pathname + window.location.search
          : pathname;
      const q = from && from !== "/" ? `?from=${encodeURIComponent(from)}` : "";
      router.replace(`${LOGIN_PATH}${q}`);
    }
  }, [isReady, isAuthenticated, isLogin, pathname, router]);

  // Login is interactive immediately; don't block on localStorage / isReady
  if (isLogin) {
    return <>{children}</>;
  }

  if (!isReady) {
    return (
      <div className="min-h-screen flex items-center justify-center text-[var(--color-text-muted,#888)] text-sm">
        Loading…
      </div>
    );
  }

  if (!isAuthenticated) {
    return (
      <div className="min-h-screen flex items-center justify-center text-[var(--color-text-muted,#888)] text-sm">
        Redirecting to sign in…
      </div>
    );
  }

  // FilterStateProvider uses `useSearchParams` which Next requires inside a
  // Suspense boundary. The fallback renders the shell chrome immediately so
  // the user never sees a full-page "Loading…" while filters hydrate.
  return (
    <Suspense fallback={
      <div className="flex min-h-screen w-full">
        <Sidebar />
        <main className="flex-1 flex flex-col min-w-0 pt-14 pl-14 lg:pt-0 lg:pl-0" />
      </div>
    }>
      <FilterStateProvider>
        <ChatHistoryProvider>
          <div className="flex min-h-screen w-full">
            <Sidebar />
            <main className="flex-1 flex flex-col min-w-0 pt-14 pl-14 lg:pt-0 lg:pl-0">
              {children}
            </main>
            <ChatPane />
          </div>
        </ChatHistoryProvider>
      </FilterStateProvider>
    </Suspense>
  );
}
