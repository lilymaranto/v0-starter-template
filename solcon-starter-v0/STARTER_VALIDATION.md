## Starter Validation (v0)

1) Browser fallback
- Open in browser without native bridge.
- Pass: app does not crash; bridge helpers no-op safely.

2) Session entrypoint
- Confirm direct `window.DemoBridge` calls exist only in `starter_bridge_entry.js`.

3) Custom events
- Trigger one UI event routed through `trackEvent`.
- Pass: one `braze.logCustomEvent` call with `source: "web"` payload.

4) Iframe readiness (if applicable)
- If used in dashboard preview, verify intended route can embed from:
  - `https://doppel-dashboard-staging-a7496acff9c6.herokuapp.com/`
