// Golden reference sync reducer for SolCon web apps.
// Import this pattern and adapt renderUser/setUser to your app.

const DEFAULT_LOCK_MS = 3000;

export function createSyncStateMachine({
  initialUserId = "n1",
  manualLockMs = DEFAULT_LOCK_MS,
  renderUser,
  setUser
}) {
  if (typeof renderUser !== "function") {
    throw new Error("createSyncStateMachine requires renderUser(userId)");
  }
  if (typeof setUser !== "function") {
    throw new Error("createSyncStateMachine requires setUser(userId, reason)");
  }

  const state = {
    activeUserId: normalizeUserId(initialUserId) || "n1",
    lastAppliedSig: "",
    lastManualAt: 0
  };

  function shouldSkipDefaultRollback(normalizedUser, reason) {
    return (
      reason === "default" &&
      Date.now() - state.lastManualAt < manualLockMs &&
      normalizedUser !== state.activeUserId
    );
  }

  function applyIncomingSync(
    { userId, sessionId, authority, reason = "manual" },
    { fromNative = false } = {}
  ) {
    const normalizedUser = normalizeUserId(userId);
    if (!normalizedUser) return false;

    const sig = `${normalizedUser}|${sessionId ?? "na"}|${authority ?? "na"}|${reason ?? "na"}`;
    if (sig === state.lastAppliedSig) return false;
    if (shouldSkipDefaultRollback(normalizedUser, reason)) return false;

    state.activeUserId = normalizedUser;
    renderUser(normalizedUser);

    if (reason === "manual") {
      state.lastManualAt = Date.now();
    }
    state.lastAppliedSig = sig;

    // Echo suppression: do not re-send native-origin updates.
    if (!fromNative) {
      setUser(normalizedUser, reason);
    }
    return true;
  }

  function getActiveUserId() {
    return state.activeUserId;
  }

  return {
    applyIncomingSync,
    getActiveUserId
  };
}

function normalizeUserId(raw) {
  return String(raw ?? "").trim().toLowerCase();
}
