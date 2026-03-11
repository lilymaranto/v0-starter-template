"use client";

import { useEffect, useRef, useState } from "react";
import { initBraze } from "@/lib/braze";
import { startWebSession, setUser, listenForNative } from "@/lib/bridge-entry";
import { createSyncStateMachine } from "@/lib/sync-state";
import { ValidationPanel } from "@/components/validation-panel";

const USERS = ["viewer_a", "viewer_b"] as const;
const CONFIG_ID = process.env.NEXT_PUBLIC_SOLCON_CONFIG_ID ?? "solcon-template";
const DEFAULT_USER = USERS[0];

type Tab = "app" | "validation";

export default function Home() {
  const [activeUser, setActiveUser] = useState<string>(DEFAULT_USER);
  const [activeTab, setActiveTab] = useState<Tab>("app");

  // Build dynamic options: include activeUser if not in base USERS list
  const selectUsers = USERS.includes(activeUser as (typeof USERS)[number])
    ? [...USERS]
    : [activeUser, ...USERS];
  const syncRef = useRef<ReturnType<typeof createSyncStateMachine> | null>(null);
  const initialized = useRef(false);

  useEffect(() => {
    if (initialized.current) return;
    initialized.current = true;

    // Guards: once a real identity is applied, default logic is permanently disabled
    let hasResolvedIdentity = false;
    let nativeUserReceived = false;
    let fallbackTimer: ReturnType<typeof setTimeout> | null = null;

    const sync = createSyncStateMachine({
      initialUserId: DEFAULT_USER,
      manualLockMs: 300,
      fallbackConfigId: CONFIG_ID,
      renderUser: (userId: string) => setActiveUser(userId),
      setUser: (userId: string, reason: string, resolvedConfigId?: string) =>
        setUser(userId, reason, resolvedConfigId),
    });
    syncRef.current = sync;

    // Register native listener immediately (with retry/polling for late bridge attach)
    const unsubscribeNative = listenForNative((incomingUserId: string, detail: Record<string, unknown>) => {
      // listenForNative already filters empty/unknown, but double-check
      if (!incomingUserId || incomingUserId === "unknown") return;

      nativeUserReceived = true;
      hasResolvedIdentity = true;

      sync.applyIncomingSync(
        {
          userId: incomingUserId,
          sessionId: detail?.sessionId as string | undefined,
          authority: detail?.authority as string | undefined,
          reason: (detail?.reason as string) ?? "manual",
          configId: (detail?.configId as string | undefined) ?? CONFIG_ID,
        },
        { fromNative: true }
      );
    });

    const FALLBACK_MS = 1200;

    initBraze().then(() => {
      // One-time fallback: if no native user arrives within grace period, apply default.
      // Works in both browser-only and container mode (for config persistence).
      fallbackTimer = setTimeout(() => {
        if (hasResolvedIdentity) return;
        if (!nativeUserReceived) {
          hasResolvedIdentity = true;
          startWebSession({ userId: DEFAULT_USER, configId: CONFIG_ID });
          sync.applyIncomingSync({
            userId: DEFAULT_USER,
            reason: "default",
            configId: CONFIG_ID,
          });
        }
      }, FALLBACK_MS);
    });

    return () => {
      if (fallbackTimer) clearTimeout(fallbackTimer);
      if (typeof unsubscribeNative === "function") unsubscribeNative();
    };
  }, []);

  function handleChangeUser(userId: string) {
    syncRef.current?.applyIncomingSync({
      userId,
      reason: "manual",
    });
  }

  return (
    <main className="flex flex-col px-5 pb-10 pt-2">
      {/* Tab bar */}
      <nav className="mb-5 flex w-full rounded-lg bg-secondary p-1" aria-label="Tabs">
        <button
          onClick={() => setActiveTab("app")}
          className={`flex-1 rounded-md px-3 py-2 text-xs font-semibold transition-colors ${activeTab === "app"
              ? "bg-background text-foreground shadow-sm"
              : "text-muted-foreground hover:text-foreground"
            }`}
          aria-selected={activeTab === "app"}
          role="tab"
        >
          App
        </button>
        <button
          onClick={() => setActiveTab("validation")}
          className={`flex-1 rounded-md px-3 py-2 text-xs font-semibold transition-colors ${activeTab === "validation"
              ? "bg-background text-foreground shadow-sm"
              : "text-muted-foreground hover:text-foreground"
            }`}
          aria-selected={activeTab === "validation"}
          role="tab"
        >
          Validation
        </button>
      </nav>

      {/* App tab */}
      {activeTab === "app" && (
        <div className="flex flex-col items-center gap-6">
          {/* Header */}
          <div className="flex flex-col items-center gap-2 text-center">
            <h1 className="text-2xl font-bold tracking-tight text-foreground text-balance">
              SolCon Template
            </h1>
            <p className="text-sm text-muted-foreground leading-relaxed">
              Braze + DemoBridge wiring is ready. Switch users below, then start building your app.
            </p>
          </div>

          {/* Instructions */}
          <section className="w-full rounded-xl border border-border bg-card p-4" aria-label="Getting started">
            <h2 className="mb-2 text-base font-semibold text-card-foreground">
              Start building now
            </h2>
            <ol className="flex flex-col gap-1.5 text-xs text-muted-foreground leading-relaxed">
              <li>
                <span className="font-mono text-foreground">1.</span> Edit this page -- Braze + bridge wiring is pre-connected.
                <p className="mt-1 pl-4 italic">
                  Keep the existing infrastructure, all files in lib, and the validation checklist unchanged until the end. You may update the UI, and in braze.ts you may modify only BRAZE_API_KEY and BRAZE_BASE_URL. Help me build..
                </p>
              </li>
              <li>
                <span className="font-mono text-foreground">2.</span> Use the user dropdown below or remove it if you only need one user.
              </li>
              <li>
                <span className="font-mono text-foreground">3.</span> Import{" "}
                <code className="rounded bg-secondary px-1 py-0.5 font-mono text-[10px] text-foreground">
                  trackEvent
                </code>{" "}
                from{" "}
                <code className="rounded bg-secondary px-1 py-0.5 font-mono text-[10px] text-foreground">
                  @/lib/track-event
                </code>{" "}
                for custom events.
              </li>
              <li>
                <span className="font-mono text-foreground">4.</span> Run the Validation tab when you{"'"}re done. Delete the Validation tab and its component when you{"'"}re finished.
              </li>
            </ol>
          </section>

          {/* Change User Dropdown */}
          <section className="flex w-full items-center gap-3 rounded-xl border border-border bg-card p-4" aria-label="User switcher">
            <label
              htmlFor="user-select"
              className="shrink-0 text-xs font-medium text-muted-foreground"
            >
              Active User
            </label>
            <div className="relative flex-1">
              <select
                id="user-select"
                value={activeUser}
                onChange={(e) => handleChangeUser(e.target.value)}
                className="w-full appearance-none rounded-lg border border-border bg-secondary px-3 py-2 pr-8 text-sm font-semibold text-secondary-foreground transition-colors focus:outline-none focus:ring-2 focus:ring-ring"
              >
                {selectUsers.map((user) => (
                  <option key={user} value={user}>
                    {user}
                  </option>
                ))}
              </select>
              <svg
                className="pointer-events-none absolute right-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground"
                xmlns="http://www.w3.org/2000/svg"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                <path d="m6 9 6 6 6-6" />
              </svg>
            </div>
          </section>
        </div>
      )}

      {/* Validation tab */}
      {activeTab === "validation" && (
        <ValidationPanel />
      )}
    </main>
  );
}
