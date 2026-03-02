# SolCon Starter Prompt for v0 (Lightweight)

Use only the files in `solcon-v0-pack/solcon-starter-v0/` to apply a minimal starter pass to this existing Next.js app.

Rules:
- Patch only. Do not redesign UI or move architecture.
- Keep changes small and local.
- Treat this as a Next.js App Router + React + TypeScript codebase; do not migrate framework/runtime.
- Add one centralized bridge module and one centralized custom-event helper.
- Keep browser fallback safe (no crash when `window.DemoBridge` is missing).

Must-use references:
- `solcon-v0-pack/solcon-starter-v0/starter_bridge_entry.js`
- `solcon-v0-pack/solcon-starter-v0/starter_track_event.js`
- `solcon-v0-pack/solcon-starter-v0/STARTER_VALIDATION.md`

Implementation goals:
1) Add `startWebSession`, `setUser`, `listenForNative` wrappers using the bridge entry pattern.
2) Add one `trackEvent(name, properties)` helper and route existing custom events through it.
3) Keep `trackEvent` default behavior as Braze-only logging (`braze.logCustomEvent`) with `source: "web"`.
4) Do not dual-write to native bridge unless explicitly requested.
5) Preserve all existing UI behavior.

Iframe note:
- If preview routes are embedded by Doppel dashboard, allow parent origin:
  - `https://doppel-dashboard-staging-a7496acff9c6.herokuapp.com/`
- Keep embed policy route-scoped (not global).
