## SolCon Starter for v0

Purpose:
- Provide minimal, known-good wiring that v0 can keep stable.
- Cover the custom-event path early so this does not break late.

What to use from this folder:
- `STARTER_PROMPT_V0.md`
- `starter_bridge_entry.js`
- `starter_track_event.js`
- `STARTER_VALIDATION.md`

Approach:
- Keep starter small and non-invasive.
- Do not redesign generated UI.
- Add bridge/event helpers and connect them in one place.
