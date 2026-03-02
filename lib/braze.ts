// Centralized Braze SDK initialization.
// Keeps all Braze config in one place.
// Identity calls (changeUser/openSession) are exported for use by bridge-entry.ts.

let brazeInitialized = false;

export const BRAZE_API_KEY = "7ea48369-1551-4a9e-b054-d09b40648ef1";
export const BRAZE_BASE_URL = "sdk.iad-03.braze.com";

export async function initBraze() {
  if (brazeInitialized) return;
  if (typeof window === "undefined") return;

  const braze = await import("@braze/web-sdk");

  braze.initialize(BRAZE_API_KEY, {
    baseUrl: `https://${BRAZE_BASE_URL}`,
    enableLogging: true,
    allowUserSuppliedJavascript: false,
  });

  braze.openSession();
  brazeInitialized = true;

  // Expose on window for track-event.ts compatibility
  (window as unknown as Record<string, unknown>).braze = braze;

  return braze;
}

export async function getBraze() {
  if (typeof window === "undefined") return null;
  return import("@braze/web-sdk");
}

// Granular identity helpers used by bridge-entry.ts to keep changeUser single-threaded.
export async function changeUser(userId: string) {
  const braze = await getBraze();
  if (!braze) return;
  braze.changeUser(userId);
}

export async function openSession() {
  const braze = await getBraze();
  if (!braze) return;
  braze.openSession();
}

export async function logCustomEvent(
  eventName: string,
  properties?: Record<string, string>
) {
  const braze = await getBraze();
  if (!braze) return;
  braze.logCustomEvent(eventName, { ...properties, source: "web" });
}

export async function setCustomAttribute(key: string, value: string) {
  const braze = await getBraze();
  if (!braze) return;
  const user = braze.getUser();
  if (user) {
    user.setCustomUserAttribute(key, value);
  }
}
