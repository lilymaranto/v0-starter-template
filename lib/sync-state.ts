// @hardened — do not modify without re-running validation panel.
// Structural invariants enforced: manualLockMs=300, lastAppliedSig dedupe,
// fromNative echo suppression, no .toLowerCase(), configId NFL resolution.
//
// Sync state machine for SolCon web apps.
// Single state writer: all identity changes (web and native) flow through applyIncomingSync.
// Enforces: dedupe via signature, echo suppression for native-origin, manual lock window.

export interface SyncPayload {
  userId: string;
  sessionId?: string;
  authority?: string;
  reason?: string;
  configId?: string;
}

export interface SyncOptions {
  fromNative?: boolean;
}

export interface SyncStateMachine {
  applyIncomingSync: (payload: SyncPayload, opts?: SyncOptions) => boolean;
  getActiveUserId: () => string;
}

export function createSyncStateMachine({
  initialUserId = "viewer_a",
  manualLockMs = 300,
  fallbackConfigId,
  renderUser,
  setUser,
}: {
  initialUserId?: string;
  manualLockMs?: number;
  fallbackConfigId?: string;
  renderUser: (userId: string) => void;
  setUser: (userId: string, reason: string, resolvedConfigId?: string) => void;
}): SyncStateMachine {
  if (typeof renderUser !== "function") {
    throw new Error("createSyncStateMachine requires renderUser(userId)");
  }
  if (typeof setUser !== "function") {
    throw new Error("createSyncStateMachine requires setUser(userId, reason)");
  }

  const state = {
    activeUserId: initialUserId || "viewer_a",
    lastAppliedSig: "",
    lastManualAt: 0,
  };

  function shouldSkipDefaultRollback(
    incoming: string,
    reason: string
  ): boolean {
    return (
      reason === "default" &&
      Date.now() - state.lastManualAt < manualLockMs &&
      incoming !== state.activeUserId
    );
  }

  function applyIncomingSync(
    { userId, sessionId, authority, reason = "manual", configId }: SyncPayload,
    { fromNative = false }: SyncOptions = {}
  ): boolean {
    // No toLowerCase -- user IDs are compared as-is, casing may be significant
    const incoming = String(userId ?? "").trim();
    if (!incoming) return false;

    // Dedupe via signature check
    const sig = `${incoming}|${sessionId ?? "na"}|${authority ?? "na"}|${reason ?? "na"}`;
    if (sig === state.lastAppliedSig) return false;

    // Manual lock window: skip default rollbacks within lock period
    if (shouldSkipDefaultRollback(incoming, reason)) return false;

    state.activeUserId = incoming;
    renderUser(incoming);

    if (reason === "manual") {
      state.lastManualAt = Date.now();
    }
    state.lastAppliedSig = sig;

    // configId resolution order (NFL pattern):
    // 1) native detail.configId (if present)
    // 2) explicit web-provided configId from payload
    // 3) template fallback configId
    const resolvedConfigId = configId ?? fallbackConfigId;

    // Echo suppression: do not re-send native-origin updates back to native
    if (!fromNative) {
      setUser(incoming, reason, resolvedConfigId);
    }
    return true;
  }

  function getActiveUserId(): string {
    return state.activeUserId;
  }

  return {
    applyIncomingSync,
    getActiveUserId,
  };
}
