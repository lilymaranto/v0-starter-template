// Adapted from solcon-starter-v0/starter_bridge_entry.js
// Centralized DemoBridge wrappers with safe browser fallback.

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
        cb: (incomingUserId: string, detail: unknown) => void
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
    console.warn("[Bridge] DemoBridge missing; browser fallback active.");
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
  if (!hasBridge() || !window.DemoBridge?.startSession) return;
  window.DemoBridge.startSession({ userId, configId, reason: "default" });
}

export function setUser(userId: string, reason = "manual") {
  if (!userId) return;
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
  changeUserFn: (userId: string, detail: unknown) => void
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
