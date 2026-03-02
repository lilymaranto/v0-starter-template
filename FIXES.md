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
- **Failure means:** Events are not routed through the canonical helper path.
- **Fix:** Route custom events through `trackEvent` and use Braze path consistently.

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

## Check 12: Prompt filename hygiene

- **Why it exists:** Prevents stale prompt drift.
- **Failure means:** Legacy prompt names (for example `_NEW`) are still referenced.
- **Fix:** Standardize to canonical filenames and remove stale references.

## Check 13: No mixed bridge imports

- **Why it exists:** Mixing starter + finisher bridge modules causes contract conflicts.
- **Failure means:** Multiple bridge module variants are imported in app code.
- **Fix:** Keep one bridge entry file and one import path across the codebase.

## Check 14: Dynamic configId

- **Why it exists:** Mobile routing is config-scoped; hardcoding breaks portability.
- **Failure means:** `configId` is hardcoded to a single literal.
- **Fix:** Source `configId` from env/prop/state, with explicit fallback behavior.

## Check 15: Evidence report

- **Why it exists:** Forces deterministic proof instead of “looks good” claims.
- **Failure means:** Validation output omits required proof values.
- **Fix:** Always print prompt filename, lock value, normalize behavior, identity owner path, and event path result.
