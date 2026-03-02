// Golden reference sync reducer for SolCon web apps (finisher pattern).
// Single state writer: all identity changes (web and native) flow through applyIncomingSync.
// Enforces: dedupe via signature, echo suppression for native-origin, manual lock window.

const DEFAULT_LOCK_MS = 3000;

function normalizeUserId(raw: string | null | undefined): string {
  return String(raw ?? "").trim().toLowerCase();
}

export interface SyncPayload {
  userId: string;
  sessionId?: string;
  authority?: string;
  reason?: string;
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
  manualLockMs = DEFAULT_LOCK_MS,
  renderUser,
  setUser,
}: {
  initialUserId?: string;
  manualLockMs?: number;
  renderUser: (userId: string) => void;
  setUser: (userId: string, reason: string) => void;
}): SyncStateMachine {
  if (typeof renderUser !== "function") {
    throw new Error("createSyncStateMachine requires renderUser(userId)");
  }
  if (typeof setUser !== "function") {
    throw new Error("createSyncStateMachine requires setUser(userId, reason)");
  }

  const state = {
    activeUserId: normalizeUserId(initialUserId) || "viewer_a",
    lastAppliedSig: "",
    lastManualAt: 0,
  };

  function shouldSkipDefaultRollback(
    normalizedUser: string,
    reason: string
  ): boolean {
    return (
      reason === "default" &&
      Date.now() - state.lastManualAt < manualLockMs &&
      normalizedUser !== state.activeUserId
    );
  }

  function applyIncomingSync(
    { userId, sessionId, authority, reason = "manual" }: SyncPayload,
    { fromNative = false }: SyncOptions = {}
  ): boolean {
    const normalizedUser = normalizeUserId(userId);
    if (!normalizedUser) return false;

    // Dedupe via signature check
    const sig = `${normalizedUser}|${sessionId ?? "na"}|${authority ?? "na"}|${reason ?? "na"}`;
    if (sig === state.lastAppliedSig) return false;

    // Manual lock window: skip default rollbacks within lock period
    if (shouldSkipDefaultRollback(normalizedUser, reason)) return false;

    state.activeUserId = normalizedUser;
    renderUser(normalizedUser);

    if (reason === "manual") {
      state.lastManualAt = Date.now();
    }
    state.lastAppliedSig = sig;

    // Echo suppression: do not re-send native-origin updates back to native.
    if (!fromNative) {
      setUser(normalizedUser, reason);
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
