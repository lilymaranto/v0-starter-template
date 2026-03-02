// Minimal starter custom-event helper for v0-generated apps.
// Route all web custom events through this function.

export function trackEvent(name, properties = {}) {
  if (!name) return;
  const payload = { ...properties, source: "web" };

  if (window.braze?.logCustomEvent) {
    window.braze.logCustomEvent(name, payload);
  } else {
    console.warn("[Braze] logCustomEvent unavailable; event skipped:", name);
  }
}
