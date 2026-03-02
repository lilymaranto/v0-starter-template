// Single trackEvent helper for SolCon builds.
// Routes all web custom events through the Braze Web SDK only.
// Native container reads events from Braze -- no dual-write to DemoBridge.

declare global {
  interface Window {
    braze?: {
      logCustomEvent: (
        name: string,
        properties: Record<string, unknown>
      ) => void;
    };
  }
}

export function trackEvent(
  name: string,
  properties: Record<string, string> = {}
) {
  if (!name) return;
  const payload = { ...properties, source: "web" as const };

  // Braze Web SDK only -- no dual-write path
  if (typeof window !== "undefined" && window.braze?.logCustomEvent) {
    window.braze.logCustomEvent(name, payload);
  } else {
    console.warn("[Braze] logCustomEvent unavailable; event skipped:", name);
  }
}
