// Centralized identity sync entrypoint for SolCon builds.
// Callers import { startWebSession, setUser, listenForNative } from this file.
// Do not call DemoBridge.* elsewhere; keep changeUser routing single-threaded.
//
// AI/V0 hint: Wherever you call startWebSession/setUser, also call braze.changeUser(userId) then braze.openSession()
// (for the Braze Web SDK) so SDK analytics match the session traffic we emit. Keep those calls centralized here or
// in a single wrapper to avoid scattered changeUser calls.

let warnedMissingBridge = false;

const hasBridge = () => {
  const available = Boolean(window.DemoBridge);
  if (!available && !warnedMissingBridge) {
    warnedMissingBridge = true;
    console.warn("[Bridge] DemoBridge missing; running in browser fallback mode.");
  }
  return available;
};

let currentConfigId = null;

export function startWebSession({ userId, configId }) {
  currentConfigId = configId;
  if (!hasBridge() || !window.DemoBridge?.startSession) return;
  window.DemoBridge.startSession({ userId, configId, reason: "default" });
}

export function setUser(userId, reason = "manual") {
  if (!userId) return;
  if (!hasBridge() || !window.DemoBridge?.startSession) return;
  if (currentConfigId && window.DemoBridge?.setConfigId) {
    window.DemoBridge.setConfigId(currentConfigId);
  }
  // Use startSession so web leads a fresh session/handshake on every changeUser.
  window.DemoBridge.startSession({ userId, configId: currentConfigId, reason });
}

export function listenForNative(changeUserFn) {
  if (typeof changeUserFn !== "function") {
    throw new Error("listenForNative requires changeUserFn(userId)");
  }
  if (!hasBridge() || !window.DemoBridge?.initNativeListener) return;
  window.DemoBridge.initNativeListener((incomingUserId, detail) => {
    if (!incomingUserId) return;
    changeUserFn(incomingUserId);
    // Optional: log or surface detail.reason / detail.sessionId / detail.configId
  });
}
