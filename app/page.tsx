"use client";

import { useEffect, useRef, useState } from "react";
import { initBraze } from "@/lib/braze";
import { startWebSession, setUser, listenForNative } from "@/lib/bridge-entry";
import { createSyncStateMachine } from "@/lib/sync-state";
import { ValidationPanel } from "@/components/validation-panel";

const USERS = ["viewer_a", "viewer_b"] as const;
const CONFIG_ID = "solcon-template";
const DEFAULT_USER = USERS[0];

export default function Home() {
  const [activeUser, setActiveUser] = useState<string>(DEFAULT_USER);
  const syncRef = useRef<ReturnType<typeof createSyncStateMachine> | null>(null);
  const initialized = useRef(false);

  useEffect(() => {
    if (initialized.current) return;
    initialized.current = true;

    // Create sync state machine -- setUser from bridge-entry is the SOLE
    // identity owner path for braze.changeUser + braze.openSession.
    const sync = createSyncStateMachine({
      initialUserId: DEFAULT_USER,
      manualLockMs: 300,
      renderUser: (userId: string) => setActiveUser(userId),
      setUser: (userId: string, reason: string) => setUser(userId, reason),
    });
    syncRef.current = sync;

    // Init Braze SDK (no identity write), then fire the initial session
    // through the sync state machine so setUser owns the first changeUser.
    initBraze().then(() => {
      startWebSession({ userId: DEFAULT_USER, configId: CONFIG_ID });
      sync.applyIncomingSync({
        userId: DEFAULT_USER,
        reason: "default",
      });
    });

    // Native listener: forward incoming native identity through sync machine
    listenForNative((incomingUserId: string, detail: Record<string, unknown>) => {
      if (!incomingUserId) return;
      sync.applyIncomingSync(
        {
          userId: incomingUserId,
          sessionId: detail?.sessionId as string | undefined,
          authority: detail?.authority as string | undefined,
          reason: (detail?.reason as string) ?? "manual",
        },
        { fromNative: true }
      );
    });
  }, []);

  function handleChangeUser(userId: string) {
    syncRef.current?.applyIncomingSync({
      userId,
      reason: "manual",
    });
  }

  return (
    <main className="flex flex-col items-center gap-6 px-5 pb-10 pt-4">
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
            <span className="font-mono text-foreground">4.</span> Run Validation below when you{"'"}re done.
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
            {USERS.map((user) => (
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

      {/* Validation */}
      <ValidationPanel />
    </main>
  );
}
