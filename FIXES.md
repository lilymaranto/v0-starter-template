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

## Check 7: Iframe CSP header

- **Why it exists:** Required for preview/embed flows in dashboard contexts.
- **Failure means:** `frame-ancestors` policy is missing or too restrictive.
- **Fix:** Set route-scoped CSP headers to allow required parent origins.

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
- **Failure means:** `braze.changeUser`/`braze.openSession` called from multiple places.
- **Fix:** Restrict identity writes to the single sync-owned `setUser` path.

## Check 12: No mixed bridge imports

- **Why it exists:** Mixing starter + finisher bridge modules causes contract conflicts.
- **Failure means:** Multiple bridge module variants are imported in app code.
- **Fix:** Keep one bridge entry file and one import path across the codebase.

## Check 13: ConfigId NFL pattern parity

- **Why it exists:** Mobile routing is config-scoped; hardcoding breaks portability. Must match NFL resolution behavior.
- **Failure means:** One or more of: configId missing from SyncPayload, no fallbackConfigId param in sync machine, no native override path (`configId ?? fallbackConfigId`), or setUser doesn't accept resolvedConfigId.
- **Fix:** Dynamic configId must come from native detail override, explicit web value, or env-backed fallback. Hardcoded literals are allowed only as documented template fallback defaults.
- Pass when config resolution order is: native detail.configId -> explicit web configId -> env-backed fallback configId.
- Ensure configId resolution order is: native detail.configId -> explicit web-provided configId -> template fallback configId.
- Hard fail if configId is removed from payload contract or if native detail.configId cannot override fallback.

## Check 14: No duplicate identity write path in native mode

- **Why it exists:** In WKWebView container flow, DemoBridge.startSession already performs braze.changeUser/openSession internally. Calling both directly and via bridge creates duplicate user/session writes and racey analytics.
- **Failure means:** Both direct Braze identity writes (braze.changeUser/openSession) and DemoBridge.startSession execute in the same setUser() code path without environment gating.
- **Fix:** Gate setUser() by environment:
  - Native mode (window.DemoBridge.startSession available): bridge session write only, do NOT call braze.changeUser/openSession directly.
  - Browser fallback mode (no bridge): direct Braze identity write only.
- Both paths must be in separate if/else branches, never sequential.
- Hard fail if both direct Braze identity write and DemoBridge.startSession execute in the same native setUser path.

## Check 15: Native runtime event simulation

- **Why it exists:** Static code checks cannot prove real native-to-web behavior.
- **Failure means:** Dispatching a nativeUserUpdate-shape payload does not update active user exactly once, or causes bounce/duplicate apply.
- **Fix:** Add a runtime validation action that dispatches a mock native event and asserts:
  - user changes once
  - no immediate rollback
  - no duplicate apply logs/state transitions
  - echo suppression prevents setUser callback for fromNative events

## Check 16: Embed header conflict (CSP vs X-Frame-Options)

- **Why it exists:** frame-ancestors may be correct while X-Frame-Options still blocks embedding.
- **Failure means:** Any blocking XFO policy conflicts with intended cross-origin dashboard iframe behavior.
- **Fix:** Ensure headers are consistent for embed routes:
  - CSP frame-ancestors includes allowed dashboard origin(s)
  - X-Frame-Options does not contradict embed intent on those routes
  - Keep route-scoped policy for non-embed pages
  - Remove or delete XFO header on embed routes rather than setting SAMEORIGIN

## Check 17: Evidence report

- **Why it exists:** Forces deterministic proof instead of “looks good” claims.
- **Failure means:** Validation output omits required proof values.
- **Fix:** Always print prompt filename, lock value, normalize behavior, identity owner path, and event path result.
