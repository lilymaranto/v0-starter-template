// Minimal starter bridge entry for v0-generated apps.
// Keep all direct DemoBridge calls centralized here.

let warnedMissingBridge = false;
let currentConfigId = null;

const hasBridge = () => {
  const available = Boolean(window.DemoBridge);
  if (!available && !warnedMissingBridge) {
    warnedMissingBridge = true;
    console.warn("[Bridge] DemoBridge missing; browser fallback active.");
  }
  return available;
};

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
  window.DemoBridge.startSession({ userId, configId: currentConfigId, reason });
}

export function listenForNative(changeUserFn) {
  if (typeof changeUserFn !== "function") {
    throw new Error("listenForNative requires changeUserFn(userId, detail)");
  }
  if (!hasBridge() || !window.DemoBridge?.initNativeListener) return;
  window.DemoBridge.initNativeListener((incomingUserId, detail) => {
    if (!incomingUserId) return;
    changeUserFn(incomingUserId, detail);
  });
}
