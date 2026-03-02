# SolCon Validation Fix Guide

When a validation check fails, reference the matching section below.  
v0: ALWAYS read this file before attempting to fix any validation failure.

---

## Check 0: Braze SDK configuration

- **Why it exists:** Prevents false positives when Braze is unconfigured.
- **Failure means:** Placeholder API key/endpoint is still present.
- **Fix:** Set real values in the Braze config module before validating runtime behavior.

## Check 1: No session spam while idle

- **Why it exists:** Prevents repeated session starts and analytics noise.
- **Failure means:** Session writes are firing from loops/effects/timers.
- **Fix:** Keep session starts tied to explicit identity transitions only.

## Check 2: Web user switch (no bounce)

- **Why it exists:** One manual change should apply once and settle.
- **Failure means:** Dedupe/rollback guards are missing or broken.
- **Fix:** Preserve signature dedupe and manual-lock rollback suppression in sync-state.

## Check 3: Native switch + detail forwarding

- **Why it exists:** Native metadata (`reason`, `sessionId`, `authority`, `configId`) is needed for correct reconciliation.
- **Failure means:** Bridge callback drops `detail` or misroutes native updates.
- **Fix:** Keep callback shape `changeUserFn(userId, detail)` and pass detail unchanged.

## Check 4: Custom event forwarding

- **Why it exists:** Prevents duplicate custom events across web/native.
- **Failure means:** Any parallel custom-event forwarding path exists (for example DemoBridge.logEvent/logCustomEvent).
- **Fix:** Use one path only: trackEvent -> braze.logCustomEvent. Do NOT forward custom events directly through DemoBridge.

## Check 5: Browser fallback

- **Why it exists:** Template must run with and without native bridge.
- **Failure means:** Direct bridge usage crashes in plain browser mode.
- **Fix:** Guard all bridge calls and no-op safely when `window.DemoBridge` is absent.

## Check 6: DemoBridge surface check

- **Why it exists:** Keeps bridge contract centralized and maintainable.
- **Failure means:** `window.DemoBridge` is called from multiple files.
- **Fix:** Keep direct DemoBridge calls only in one bridge entry module.

## Check 7: Iframe CSP header (intended policy)

- **Why it exists:** Required for preview/embed flows in dashboard contexts.
- **Failure means:** Intended `frame-ancestors` policy (from /api/check-csp) is missing or does not include required dashboard origin.
- **Fix:** Update ALLOWED_IFRAME_PARENTS in check-csp route and middleware.ts to include the required parent origin. This checks intended policy; Check 16 verifies observed runtime headers.

## Check 8: Case-preserved userId

- **Why it exists:** Mobile/native identity expects trim-only behavior.
- **Failure means:** `.toLowerCase()` exists in identity flow.
- **Fix:** Use `String(userId).trim()` only; never lowercase identity values.

## Check 9: Lock window = 300ms

- **Why it exists:** 300ms is the tuned balance for race suppression vs responsiveness.
- **Failure means:** Lock window is `3000`, `2000`, `30`, or any non-300 value.
- **Fix:** Set `DEFAULT_LOCK_MS` and effective `manualLockMs` to exactly `300`.

## Check 10: No extra event forwarding path

- **Why it exists:** Prevents double event writes and drifty analytics.
- **Failure means:** Extra forwarding path exists (`DemoBridge.logEvent`/parallel route).
- **Fix:** Keep one event path only; remove parallel forwarding code.

## Check 11: Single identity owner

- **Why it exists:** Avoids race conditions and split authority over active user.
- **Failure means:** `changeUser()`/`openSession()` calls found outside lib/bridge-entry.ts via scan-source evidence across all runtime files.
- **Fix:** Restrict identity writes to the single sync-owned `setUser` path in lib/bridge-entry.ts. Remove any direct braze.changeUser/openSession calls from other files.

## Check 12: No mixed bridge imports

- **Why it exists:** Mixing starter + finisher bridge modules causes contract conflicts.
- **Failure means:** Multiple bridge module variants are imported in app code.
- **Fix:** Keep one bridge entry file and one import path across the codebase.

## Check 13: ConfigId resolution parity

- **Why it exists:** Mobile routing is config-scoped; hardcoding breaks portability.
- **Failure means:** One or more of: configId missing from SyncPayload, no fallbackConfigId param in sync machine, no native override path (`configId ?? fallbackConfigId`), or setUser doesn't accept resolvedConfigId.
- **Fix:** Dynamic configId must come from native detail override, explicit web value, or env-backed fallback. Hardcoded literals are allowed only as documented template fallback defaults.
- Pass when config resolution order is: native detail.configId -> explicit web configId -> env-backed fallback configId.
- Hard fail if configId is removed from payload contract or if native detail.configId cannot override fallback.
- **Source of truth:** Structural invariants from `/api/scan-source` (no `toString()` inspection).

## Check 14: No duplicate identity write path in native mode

- **Why it exists:** In WKWebView container flow, DemoBridge.startSession already performs braze.changeUser/openSession internally. Calling both directly and via bridge creates duplicate user/session writes and racey analytics.
- **Failure means:** Both direct Braze identity writes (braze.changeUser/openSession) and DemoBridge.startSession execute in the same setUser() code path without environment gating.
- **Fix:** Gate setUser() by environment:
  - Native mode (window.DemoBridge.startSession available): bridge session write only, do NOT call braze.changeUser/openSession directly.
  - Browser fallback mode (no bridge): direct Braze identity write only.
- Both paths must be in separate if/else branches, never sequential.
- Hard fail if both direct Braze identity write and DemoBridge.startSession execute in the same native setUser path.
- **When Braze placeholders are present** (check 0 fail), check 14 downgrades to WARN with advisory message. Identity gating is informational until Braze config is finalized.
- **Source of truth:** Structural invariants from `/api/scan-source` (no `toString()` inspection).

## Check 15: Native runtime event simulation

- **Why it exists:** Static code checks cannot prove real native-to-web behavior.
- **Failure means:** Dispatching a nativeUserUpdate-shape payload does not update active user exactly once, or causes bounce/duplicate apply.
- **Fix:** Add a runtime validation action that dispatches a mock native event and asserts:
  - user changes once
  - no immediate rollback
  - no duplicate apply logs/state transitions
  - echo suppression prevents setUser callback for fromNative events

## Check 16: Embed header conflict (observed runtime headers)

- **Why it exists:** Intended policy (Check 7) may be correct while actual observed headers differ due to middleware/proxy/CDN injection.
- **Failure means:** Real observed CSP on a same-origin fetch to "/" does not include required origin, or observed X-Frame-Options is DENY/SAMEORIGIN which blocks embedding.
- **Environment behavior:**
  - Non-production/preview (v0.dev, vusercontent.net, localhost): missing observed CSP is PASS (preview/local exempt), because middleware intentionally omits frame-ancestors to allow preview iframe embedding.
  - Production-like: missing observed CSP for required origin is FAIL.
  - XFO conflict (DENY/SAMEORIGIN) is always FAIL regardless of environment.
- **Fix:** Ensure headers are consistent for embed routes:
  - Observed CSP frame-ancestors must include allowed dashboard origin(s) in production
  - Observed X-Frame-Options must not contradict embed intent (remove or delete XFO on embed routes)
  - Keep route-scoped policy for non-embed pages
  - If observation fails, check that /api/check-headers can fetch "/" internally

## Check 17: Hardened file protection

- **Why it exists:** Prevents silent drift of the 5 critical files (braze.ts, bridge-entry.ts, sync-state.ts, track-event.ts, middleware.ts) after template fork.
- **Two layers:**
  - **Structural invariants (always enforced):** Each hardened file is checked for required code patterns (e.g. `hasBridge()` gate, `manualLockMs`, `lastAppliedSig`, no `.toLowerCase()`, etc.) and absence of forbidden patterns (e.g. `changeUser()` in braze.ts). FAIL if any invariant is missing.
  - **Integrity hashes (opt-in strict):** SHA-256 hashes of the 5 files are compared against `integrity-manifest.json`. PASS with advisory label by default; set `STRICT_INTEGRITY_MODE=true` env var to enforce FAIL on mismatch.
- **Failure means:**
  - Structural: A required pattern was removed or a forbidden pattern was introduced in a hardened file.
  - Integrity (strict mode): A hardened file was modified in any way without regenerating the manifest.
- **Fix:**
  - Structural: Restore the required pattern or remove the forbidden one. Run validation to confirm.
  - Integrity: If the change was intentional, run `npx tsx scripts/update-integrity-manifest.ts` to regenerate baseline hashes.
