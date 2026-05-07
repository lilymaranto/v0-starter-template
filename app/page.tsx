"use client";

import { ChangeEvent, useEffect, useRef, useState } from "react";
import { getBraze, initBraze } from "@/lib/braze";
import { setUser, listenForNative, webReady } from "@/lib/bridge-entry";
import { createSyncStateMachine } from "@/lib/sync-state";
import {
  installNativeUserEarlyCapture,
  markNativeUserEarlyCaptureDone,
  takeNativeUserSyncQueue,
} from "@/lib/native-sync-early-capture";
import { ValidationPanel } from "@/components/validation-panel";
import { ReferenceTab } from "@/components/reference-tab";

// ── User Profiles ──────────────────────────────────────────────────────
// Customize these for your app. When the active user changes — from the
// dropdown OR from the native container — the entire UI re-renders with
// the matching profile. Add as many users as you need.

interface UserProfile {
  displayName: string;
  role: string;
  avatar: string;
  color: string;
  greeting: string;
  cards: { title: string; body: string; icon: string }[];
}

const USER_PROFILES: Record<string, UserProfile> = {
  viewer_a: {
    displayName: "Alex Morgan",
    role: "Explorer",
    avatar: "AM",
    color: "#8b5cf6",
    greeting: "Welcome back, Alex",
    cards: [
      { title: "Dashboard", body: "View your activity summary", icon: "📊" },
      { title: "Messages", body: "3 unread conversations", icon: "💬" },
      { title: "Saved Items", body: "12 bookmarks", icon: "⭐" },
    ],
  },
  viewer_b: {
    displayName: "Jordan Lee",
    role: "Creator",
    avatar: "JL",
    color: "#10b981",
    greeting: "Ready to create, Jordan?",
    cards: [
      { title: "Studio", body: "Your creative workspace", icon: "🎨" },
      { title: "Portfolio", body: "8 published works", icon: "📁" },
      { title: "Performance", body: "Analytics & insights", icon: "📈" },
    ],
  },
};

function getProfile(userId: string): UserProfile {
  if (USER_PROFILES[userId]) return USER_PROFILES[userId];
  return {
    displayName: userId,
    role: "User",
    avatar: userId.slice(0, 2).toUpperCase() || "??",
    color: "#64748b",
    greeting: `Hello, ${userId}`,
    cards: [
      {
        title: "Getting Started",
        body: "Add this user to USER_PROFILES for custom content",
        icon: "👋",
      },
    ],
  };
}

// ── Constants ──────────────────────────────────────────────────────────

const USERS = ["viewer_a", "viewer_b"] as const;
const CONFIG_ID =
  process.env.NEXT_PUBLIC_SOLCON_CONFIG_ID ?? "solcon-template";
const DEFAULT_USER = USERS[0];

installNativeUserEarlyCapture();

type Tab = "app" | "validation" | "reference";

// ── Page Component ─────────────────────────────────────────────────────

export default function Home() {
  const [activeUser, setActiveUser] = useState<string>(DEFAULT_USER);
  const [activeTab, setActiveTab] = useState<Tab>("app");

  const syncRef = useRef<ReturnType<typeof createSyncStateMachine> | null>(
    null
  );
  const initialized = useRef(false);
  // Strict mode: only trust configId when it came from native detail payload.
  const nativeConfigIdRef = useRef<string | null>(null);
  const webReadySentRef = useRef(false);

  // Include any native-sent user that isn't in the static list
  const selectUsers = USERS.includes(activeUser as (typeof USERS)[number])
    ? [...USERS]
    : [activeUser, ...USERS];
  const profile = getProfile(activeUser);

  useEffect(() => {
    if (initialized.current) return;
    initialized.current = true;

    let nativeUserReceived = false;
    let webReadyRetryTimeout: ReturnType<typeof setTimeout> | null = null;
    let nativeBootstrapTimeout: ReturnType<typeof setTimeout> | null = null;
    let webReadyRetryCount = 0;
    let didBootstrapDefaultSync = false;

    const hasDemoBridge = () => {
      if (typeof window === "undefined") return false;
      return Boolean(
        "DemoBridge" in window &&
        (window as Window & { DemoBridge?: unknown }).DemoBridge
      );
    };

    const sync = createSyncStateMachine({
      initialUserId: DEFAULT_USER,
      manualLockMs: 300,
      renderUser: (userId: string) => setActiveUser(userId),
      setUser: (userId: string, reason: string, resolvedConfigId?: string) =>
        setUser(userId, reason, resolvedConfigId),
    });
    syncRef.current = sync;

    const emitWebReady = () => {
      const nativeConfigId = nativeConfigIdRef.current;
      webReady({
        userId: sync.getActiveUserId(),
        ...(nativeConfigId ? { configId: nativeConfigId } : {}),
      });
      webReadySentRef.current = true;
    };

    const bootstrapDefaultSyncIfNeeded = () => {
      if (didBootstrapDefaultSync || nativeUserReceived) return;
      didBootstrapDefaultSync = true;
      sync.applyIncomingSync({
        userId: DEFAULT_USER,
        reason: "default",
        configId: nativeConfigIdRef.current ?? CONFIG_ID,
      });
    };

    const resolveBrazeUserId = async (): Promise<string | null> => {
      try {
        const braze = await getBraze();
        if (!braze || typeof (braze as any).getUser !== "function") return null;
        const user = (braze as any).getUser();
        if (!user) return null;
        const rawUserId =
          typeof user.getUserId === "function" ? user.getUserId() : user.userId;
        const resolvedUserId = String(rawUserId ?? "").trim();
        if (!resolvedUserId || resolvedUserId === "unknown") return null;
        return resolvedUserId;
      } catch {
        return null;
      }
    };

    const scheduleWebReadyRetry = () => {
      if (webReadyRetryCount >= 6) return;
      if (hasDemoBridge()) return;
      webReadyRetryTimeout = setTimeout(() => {
        if (hasDemoBridge()) return;
        webReadyRetryCount += 1;
        emitWebReady();
        scheduleWebReadyRetry();
      }, 250);
    };

    // 1. Register native listener (polls for DemoBridge up to ~4 s)
    const applyNativeSync = (
      incomingUserId: string,
      detail: Record<string, unknown>
    ) => {
      if (!incomingUserId || incomingUserId === "unknown") return;
      setActiveTab("app");
      nativeUserReceived = true;
      if (nativeBootstrapTimeout) {
        clearTimeout(nativeBootstrapTimeout);
        nativeBootstrapTimeout = null;
      }
      const nativeConfigId =
        typeof detail?.configId === "string" && detail.configId.trim()
          ? detail.configId
          : undefined;
      if (nativeConfigId) {
        const hadNativeConfigId = Boolean(nativeConfigIdRef.current);
        nativeConfigIdRef.current = nativeConfigId;
        if (webReadySentRef.current && !hadNativeConfigId) {
          // Re-announce once when authoritative native configId first appears.
          emitWebReady();
        }
      }
      sync.applyIncomingSync(
        {
          userId: incomingUserId,
          sessionId: detail?.sessionId as string | undefined,
          authority: detail?.authority as string | undefined,
          reason: (detail?.reason as string) ?? "manual",
          configId: nativeConfigId,
        },
        { fromNative: true }
      );
    };

    const unsubscribeNative = listenForNative(
      (incomingUserId: string, detail: Record<string, unknown>) => {
        applyNativeSync(incomingUserId, detail);
      }
    );
    const earlySyncItems = takeNativeUserSyncQueue();
    earlySyncItems.forEach((item) => applyNativeSync(item.userId, item.detail));
    markNativeUserEarlyCaptureDone();

    // Initialize Braze Web SDK, then browser-only identity fallback and webReady.
    // No eager startWebSession: native runs deferred handshake with its config first.
    initBraze().then((braze) => {
      // Notify native as soon as web initializes so deferred handshake can begin.
      emitWebReady();
      if (hasDemoBridge()) {
        // Native mode: wait briefly for an incoming native identity first.
        // If none arrives, bootstrap one default sync so mobile session start
        // is not blocked on cold open/reopen.
        nativeBootstrapTimeout = setTimeout(async () => {
          if (nativeUserReceived) return;
          const brazeUserId = await resolveBrazeUserId();
          if (brazeUserId) {
            nativeUserReceived = true;
            setActiveTab("app");
            sync.applyIncomingSync(
              {
                userId: brazeUserId,
                reason: "native_reconcile",
                configId: nativeConfigIdRef.current ?? CONFIG_ID,
              },
              { fromNative: true }
            );
          } else {
            bootstrapDefaultSyncIfNeeded();
          }
          emitWebReady();
        }, 1200);
      } else {
        // Browser mode: apply fallback immediately.
        bootstrapDefaultSyncIfNeeded();
      }
      scheduleWebReadyRetry();

      void braze;
    });

    return () => {
      if (webReadyRetryTimeout) clearTimeout(webReadyRetryTimeout);
      if (nativeBootstrapTimeout) clearTimeout(nativeBootstrapTimeout);
      if (typeof unsubscribeNative === "function") unsubscribeNative();
    };
  }, []);

  function handleChangeUser(userId: string) {
    syncRef.current?.applyIncomingSync({ userId, reason: "manual" });
  }

  // Access the current user's profile data for per-user UI rendering.
  // Example: const profile = getProfile(activeUser);

  return (
    <main className="flex flex-col px-5 pb-10 pt-2">
      {/* ── Tab bar ─── */}
      <nav
        className="mb-5 flex w-full rounded-lg bg-secondary p-1"
        aria-label="Tabs"
      >
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
        <button
          onClick={() => setActiveTab("reference")}
          className={`flex-1 rounded-md px-3 py-2 text-xs font-semibold transition-colors ${activeTab === "reference"
              ? "bg-background text-foreground shadow-sm"
              : "text-muted-foreground hover:text-foreground"
            }`}
          aria-selected={activeTab === "reference"}
          role="tab"
        >
          Braze Reference
        </button>
      </nav>

      {/* ── App tab ─── */}
      {activeTab === "app" && (
        <div className="flex flex-col items-center gap-6">
          {/* Instructions */}
          <section
            className="w-full rounded-xl border border-border bg-card p-4"
            aria-label="Getting started"
          >
            <h2 className="mb-2 text-base font-semibold text-card-foreground">
              Start building now
            </h2>
            <ol className="flex flex-col gap-1.5 text-xs text-muted-foreground leading-relaxed">
              <li>
                <span className="font-mono text-foreground">1.</span> Edit this
                page -- Braze + bridge wiring is pre-connected.
                <p className="mt-1 pl-4 italic">
                  Keep the existing infrastructure, all files in lib, and the
                  validation checklist unchanged until the end. You may update
                  the UI, and in braze.ts you may modify only BRAZE_API_KEY and
                  BRAZE_BASE_URL. Help me build..
                </p>
              </li>
              <li>
                <span className="font-mono text-foreground">2.</span> Use the
                user dropdown below or remove it if you only need one user.
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
                <span className="font-mono text-foreground">4.</span> Run the
                Validation tab when you{"'"}re done. Delete the Validation tab
                and its component when you{"'"}re finished.
              </li>
            </ol>
          </section>

          {/* User switcher */}
          <section
            className="flex w-full items-center gap-3 rounded-xl border border-border bg-card p-4"
            aria-label="User switcher"
          >
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
                onChange={(e: ChangeEvent<HTMLSelectElement>) =>
                  handleChangeUser(e.target.value)
                }
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

          <section className="w-full rounded-xl border border-border bg-card p-4">
            <div className="mb-3 flex items-center gap-3">
              <div
                className="flex h-8 w-8 items-center justify-center rounded-full text-xs font-bold text-white"
                style={{ backgroundColor: profile.color }}
              >
                {profile.avatar}
              </div>
              <div>
                <p className="text-sm font-semibold text-card-foreground">
                  {profile.greeting}
                </p>
                <p className="text-xs text-muted-foreground">{profile.role}</p>
              </div>
            </div>
            <p className="mb-2 text-xs text-muted-foreground">
              User-specific app surface
            </p>
            <div className="grid gap-2 sm:grid-cols-3">
              {profile.cards.map((card) => (
                <div
                  key={`${activeUser}-${card.title}`}
                  className="rounded-lg border border-border bg-secondary p-3"
                >
                  <p className="text-sm font-semibold text-secondary-foreground">
                    {card.icon} {card.title}
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground">{card.body}</p>
                </div>
              ))}
            </div>
          </section>

        </div>
      )}

      {/* ── Validation tab ─── */}
      {activeTab === "validation" && <ValidationPanel />}

      {/* ── Reference tab ─── */}
      {activeTab === "reference" && (
        <ReferenceTab />
      )}
    </main>
  );
}
