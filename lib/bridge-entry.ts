// Centralized identity sync entrypoint for SolCon builds (finisher pattern).
// Callers import { startWebSession, setUser, listenForNative } from this file.
// Do not call DemoBridge.* elsewhere; keep changeUser routing single-threaded.
//
// Identity write rule: braze.changeUser + braze.openSession are called ONLY
// inside setUser() below. This is the single owner path used by the
// sync-state machine. Do not call them from providers/components/listeners.

import { getBraze } from "@/lib/braze";

declare global {
  interface Window {
    DemoBridge?: {
      startSession?: (opts: {
        userId: string;
        configId: string | null;
        reason: string;
      }) => void;
      setConfigId?: (id: string) => void;
      initNativeListener?: (
        cb: (incomingUserId: string, detail: Record<string, unknown>) => void
      ) => void;
    };
  }
}

let warnedMissingBridge = false;
let currentConfigId: string | null = null;

function hasBridge(): boolean {
  if (typeof window === "undefined") return false;
  const available = Boolean(window.DemoBridge);
  if (!available && !warnedMissingBridge) {
    warnedMissingBridge = true;
    console.warn("[Bridge] DemoBridge missing; running in browser fallback mode.");
  }
  return available;
}

export function startWebSession({
  userId,
  configId,
}: {
  userId: string;
  configId: string;
}) {
  currentConfigId = configId;
  // Do NOT call braze.changeUser/openSession here directly.
  // startWebSession fires the bridge session; the sync-state machine
  // will call setUser() which owns the Braze identity write.
  if (!hasBridge() || !window.DemoBridge?.startSession) return;
  window.DemoBridge.startSession({ userId, configId, reason: "default" });
}

// setUser is the SOLE OWNER of Braze identity writes.
// The sync-state machine calls this as its setUser callback.
export async function setUser(userId: string, reason = "manual") {
  if (!userId) return;

  // Single identity owner path: Braze changeUser + openSession
  const braze = await getBraze();
  if (braze) {
    braze.changeUser(userId);
    braze.openSession();
  }

  if (!hasBridge() || !window.DemoBridge?.startSession) return;
  if (currentConfigId && window.DemoBridge?.setConfigId) {
    window.DemoBridge.setConfigId(currentConfigId);
  }
  window.DemoBridge.startSession({
    userId,
    configId: currentConfigId,
    reason,
  });
}

export function listenForNative(
  changeUserFn: (userId: string, detail: Record<string, unknown>) => void
) {
  if (typeof changeUserFn !== "function") {
    throw new Error("listenForNative requires changeUserFn(userId, detail)");
  }
  if (!hasBridge() || !window.DemoBridge?.initNativeListener) return;
  window.DemoBridge.initNativeListener((incomingUserId, detail) => {
    if (!incomingUserId) return;
    changeUserFn(incomingUserId, detail);
  });
}
