// @hardened — do not modify without re-running validation panel.
// Structural invariants enforced: hasBridge() gate, environment-gated setUser,
// no .toLowerCase() in identity path, DemoBridge access confined here.
//
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

// Safe identity write: never throws if SDK is missing/uninitialized.
async function applyBrazeIdentitySafely(userId: string) {
  try {
    const braze = await getBraze();
    if (!braze) return;
    if (typeof braze.changeUser !== "function") return;
    if (typeof braze.openSession !== "function") return;
    braze.changeUser(userId);
    braze.openSession();
  } catch (error) {
    console.warn("[Bridge] Braze identity write skipped:", error);
  }
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

// setUser is the SOLE OWNER of identity writes.
// The sync-state machine calls this as its setUser callback.
// configId comes from the sync-state resolver (NFL pattern):
//   native detail.configId > explicit web configId > template fallback
//
// Environment-gated bridge write to avoid native bounce loops:
//   NATIVE MODE:  publish via DemoBridge.startSession
//   BROWSER MODE: no bridge publish
//
// Braze identity enforcement:
//   Always attempt changeUser/openSession safely in setUser owner path.
export async function setUser(userId: string, reason = "manual", resolvedConfigId?: string) {
  if (!userId) return;

  if (resolvedConfigId) {
    currentConfigId = resolvedConfigId;
  }

  // Enforce Braze identity in owner path, but never fail app if SDK unavailable.
  await applyBrazeIdentitySafely(userId);

  // Environment-gated bridge publish: native branch publishes, browser branch does not.
  if (hasBridge() && window.DemoBridge?.startSession) {
    try {
      if (currentConfigId && window.DemoBridge?.setConfigId) {
        window.DemoBridge.setConfigId(currentConfigId);
      }
      window.DemoBridge.startSession({
        userId,
        configId: currentConfigId,
        reason,
      });
    } catch (error) {
      console.warn("[Bridge] startSession failed:", error);
    }
  } else {
    // Browser fallback: Braze identity already handled above.
  }
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