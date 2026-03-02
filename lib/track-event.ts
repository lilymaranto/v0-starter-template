// Single trackEvent helper for SolCon builds (finisher pattern).
// Routes all web custom events through both Braze Web SDK and native bridge
// so events appear in both Braze analytics and the native Event Log.
// Per VALIDATION.md #4: "appears in Braze path and native Event Log".

declare global {
  interface Window {
    braze?: {
      logCustomEvent: (
        name: string,
        properties: Record<string, unknown>
      ) => void;
    };
    DemoBridge?: {
      logEvent?: (name: string, properties: Record<string, unknown>) => void;
    };
  }
}

export function trackEvent(
  name: string,
  properties: Record<string, string> = {}
) {
  if (!name) return;
  const payload = { ...properties, source: "web" as const };

  // Route 1: Braze Web SDK
  if (typeof window !== "undefined" && window.braze?.logCustomEvent) {
    window.braze.logCustomEvent(name, payload);
  } else {
    console.warn("[Braze] logCustomEvent unavailable; event skipped:", name);
  }

  // Route 2: Native bridge (if available)
  if (typeof window !== "undefined" && window.DemoBridge?.logEvent) {
    window.DemoBridge.logEvent(name, payload);
  }
}
