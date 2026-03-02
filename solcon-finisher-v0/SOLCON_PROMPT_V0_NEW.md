# SolCon Prompt for v0 (Finisher New)

Use the files in `solcon-v0-pack/solcon-finisher-v0-new/` as the source of truth while altering this existing codebase for native app-container compatibility. This is finisher mode: patch existing code only. Preserve all existing user-facing functionality and current UI behavior. Do not redesign UI unless explicitly requested. Only restructure identity/session sync and custom-event forwarding.

v0 constraints:
- Treat this as an existing Next.js App Router project unless explicitly told otherwise.
- Keep folder structure/import style intact.
- Do not mass refactor.

Must-use references:
- `solcon-v0-pack/solcon-finisher-v0-new/SOLCON_PROMPT_V0_NEW.md`
- `solcon-v0-pack/solcon-finisher-v0-new/README.md`
- `solcon-v0-pack/solcon-finisher-v0-new/VALIDATION.md`
- `solcon-v0-pack/solcon-finisher-v0-new/demo_bridge_entry.js`
- `solcon-v0-pack/solcon-finisher-v0-new/sync_state_reference.js`

Execution order:
1) Inspect identity/session/event code paths.
2) Centralize bridge calls into one module (`demo_bridge_entry.js` pattern).
3) Route web and native callbacks through one reducer/state writer (`applyIncomingSync` pattern).
4) Enforce dedupe, echo suppression, manual lock window, and touch idempotency.
5) Route all custom events through one `trackEvent(name, properties)` helper.
6) Validate and report pass/fail with evidence.

Preview embedding support:
- If preview pages are iframe-rendered by dashboard, allow parent origin:
  - `https://doppel-dashboard-staging-a7496acff9c6.herokuapp.com/`
- Keep policy route-scoped.
