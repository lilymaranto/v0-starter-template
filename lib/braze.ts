// @hardened — do not modify without re-running validation panel.
// Structural invariants enforced: no changeUser/openSession calls in this file.
//
// Centralized Braze SDK initialization.
// Identity writes (changeUser/openSession) are NOT called here.
// They are owned exclusively by the sync-state setUser callback
// invoked through bridge-entry.ts. Do not add them elsewhere.

let brazeInitialized = false;
let brazeInstance: typeof import("@braze/web-sdk") | null = null;

export const BRAZE_API_KEY = "YOUR_BRAZE_API_KEY";
export const BRAZE_BASE_URL = "YOUR_SDK_ENDPOINT";

export async function initBraze() {
  if (brazeInitialized) return brazeInstance;
  if (typeof window === "undefined") return null;

  try {
    const braze = await import("@braze/web-sdk");

    braze.initialize(BRAZE_API_KEY, {
      baseUrl: `https://${BRAZE_BASE_URL}`,
      enableLogging: true,
      allowUserSuppliedJavascript: false,
    });

    // Do NOT call braze.openSession() or braze.changeUser() here.
    // The sync-state machine owns the first identity write via startWebSession -> setUser.

    brazeInitialized = true;
    brazeInstance = braze;

    // Expose on window for track-event.ts logCustomEvent access
    (window as unknown as Record<string, unknown>).braze = braze;

    return braze;
  } catch {
    // Placeholder keys or missing SDK -- app continues in fallback mode
    brazeInitialized = true;
    return null;
  }
}

export async function getBraze() {
  if (brazeInstance) return brazeInstance;
  if (typeof window === "undefined") return null;
  return import("@braze/web-sdk");
}
