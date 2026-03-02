"use client";

import { useEffect, useRef, useState } from "react";
import { initBraze } from "@/lib/braze";
import { startWebSession, setUser, listenForNative } from "@/lib/bridge-entry";
import { ValidationPanel } from "@/components/validation-panel";

const USERS = ["viewer_a", "viewer_b"] as const;
const CONFIG_ID = "solcon-template";

export default function Home() {
  const [activeUser, setActiveUser] = useState<string>(USERS[0]);
  const initialized = useRef(false);

  useEffect(() => {
    if (initialized.current) return;
    initialized.current = true;

    initBraze().then(() => {
      startWebSession({ userId: USERS[0], configId: CONFIG_ID });
    });

    listenForNative((incomingUserId: string) => {
      if (!incomingUserId) return;
      setActiveUser(incomingUserId);
    });
  }, []);

  function changeUser(userId: string) {
    setActiveUser(userId);
    setUser(userId, "manual");
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

      {/* Change User */}
      <section className="flex w-full flex-col items-center gap-3 rounded-xl border border-border bg-card p-4" aria-label="User switcher">
        <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
          Active User
        </p>
        <div className="flex w-full items-center gap-2">
          {USERS.map((user) => (
            <button
              key={user}
              onClick={() => changeUser(user)}
              className={`flex-1 rounded-lg px-4 py-2.5 text-sm font-semibold transition-colors ${
                activeUser === user
                  ? "bg-primary text-primary-foreground"
                  : "bg-secondary text-secondary-foreground hover:bg-secondary/80"
              }`}
            >
              {user}
            </button>
          ))}
        </div>
        <p className="font-mono text-xs text-muted-foreground">
          Session: <span className="text-foreground">{activeUser}</span>
        </p>
      </section>

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
            <span className="font-mono text-foreground">2.</span> Use{" "}
            <code className="rounded bg-secondary px-1 py-0.5 font-mono text-[10px] text-foreground">
              changeUser()
            </code>{" "}
            or remove it if you only need one user.
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

      {/* Validation */}
      <ValidationPanel />
    </main>
  );
}
