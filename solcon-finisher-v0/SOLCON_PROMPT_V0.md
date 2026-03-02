# SolCon Prompt for v0 (Finisher)

Patch only. Preserve existing UI/UX.

Source of truth:
- Use only files in this same uploaded finisher folder.
- Ignore any `solcon-*` folders already present inside the target app.
- If duplicate guidance exists, this file wins.

Reference fidelity rule:
- Treat reference files as contract, not inspiration.
- Do not invent extra normalization, lock values, or event-forwarding paths.
- If output behavior differs from reference files, output is invalid.

Reference:
- `./demo_bridge_entry.js`
- `./sync_state_reference.js`
- `./VALIDATION.md`

Default output file mapping:
- `demo_bridge_entry.js` -> `lib/bridge-entry.ts`
- `sync_state_reference.js` -> `lib/sync-state.ts`
- custom event helper -> `lib/track-event.ts`

Execution rule for custom events:
- Route all custom events through one `trackEvent(name, properties)` helper.
- The helper must call `braze.logCustomEvent` only.
- Do not add `DemoBridge.logEvent` or `DemoBridge.logCustomEvent` calls in app code.

Must enforce:
1) Use one bridge entrypoint file and one import path across the app (no mixed bridge modules), with native callback signature `changeUserFn(userId, detail)`.
2) Use one sync-state writer for identity changes across the app, with one shared default user constant for first session + Braze init.
3) Preserve user IDs exactly as received (case-sensitive). Trim whitespace only.
4) 300ms lock window exactly.
5) One identity action must map to one bridge session write path.
6) Dynamic config id.
7) One custom-event helper only (no parallel provider/context event path).
8) Use canonical event forwarding: `trackEvent -> braze.logCustomEvent` only.
9) Starter continuity rule remains in effect: no DemoBridge custom-event forwarding in finisher mode.
10) Keep identity ownership explicit: web-origin identity writes flow through one `setUser()` path only.
11) Lock value must exactly match reference contract (300ms).
12) `normalizeUserId` must exactly preserve case (`trim` only).

Identity write rule (hard-fail if violated):
- All Braze identity writes (`braze.changeUser`, `braze.openSession`) and bridge identity writes must be owned by one path: the sync state machine `setUser` callback.
- Init, manual switches, and native-origin updates must flow through `applyIncomingSync` into that owner path.
- Do not call `braze.changeUser` directly in UI components, providers, or listeners outside that owner path.

Hard-fail (must reject output if found):
- `toLowerCase()` in identity flow.
- `DEFAULT_LOCK_MS` or `manualLockMs` set to anything other than `300`.
- native listener callback that drops `detail` payload.
- identity change path that writes bridge session twice or mixes multiple bridge modules.
- `DemoBridge.logEvent` or `DemoBridge.logCustomEvent` event forwarding in app code.
- direct `braze.changeUser`/`braze.openSession` calls outside the single identity owner path.

Preflight gate (must pass before final output):
- No `toLowerCase(` in identity/sync codepaths.
- Lock-window values in app code must be exactly `300`.
- No mixed bridge imports (starter bridge + finisher bridge in same app).
- No legacy prompt filename references.
- No extra native event forwarding path beyond `trackEvent -> braze.logCustomEvent`.

Required preflight report (before edits):
- Print the exact prompt filename being followed (`SOLCON_PROMPT_V0.md`).
- Print `DEFAULT_LOCK_MS` from `sync_state_reference.js`.
- Print the `normalizeUserId` function body from `sync_state_reference.js`.
