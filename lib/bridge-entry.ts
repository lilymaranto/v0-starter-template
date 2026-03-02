// Centralized identity sync entrypoint for SolCon builds (finisher pattern).
// Callers import { startWebSession, setUser, listenForNative } from this file.
// Do not call DemoBridge.* elsewhere; keep changeUser routing single-threaded.
//
// AI/V0 hint: Wherever you call startWebSession/setUser, also call
// braze.changeUser(userId) then braze.openSession() (for the Braze Web SDK)
// so SDK analytics match the session traffic we emit. Keep those calls
// centralized here or in a single wrapper to avoid scattered changeUser calls.

import { changeUser as brazeChangeUser, openSession as brazeOpenSession } from "@/lib/braze";

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

  // Centralized Braze identity call
  brazeChangeUser(userId);
  brazeOpenSession();

  if (!hasBridge() || !window.DemoBridge?.startSession) return;
  window.DemoBridge.startSession({ userId, configId, reason: "default" });
}

export function setUser(userId: string, reason = "manual") {
  if (!userId) return;

  // Centralized Braze identity call
  brazeChangeUser(userId);
  brazeOpenSession();

  if (!hasBridge() || !window.DemoBridge?.startSession) return;
  if (currentConfigId && window.DemoBridge?.setConfigId) {
    window.DemoBridge.setConfigId(currentConfigId);
  }
  // Use startSession so web leads a fresh session/handshake on every changeUser.
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
    // detail.reason / detail.sessionId / detail.configId available to caller
  });
}
