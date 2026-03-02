## SolCon Finisher Validation (v0 New)

1) Idle
- Open Demo and wait 30-60s.
- Pass: no session-start spam loop.

2) Web switch
- Change user once in web UI.
- Pass: one sync flow, no `n2 -> n1` bounce.

3) Native switch
- Change user once from native.
- Pass: web updates once, no duplicate apply.
- Pass: callback forwards `detail` unchanged.

4) Custom event
- Trigger one web custom event.
- Pass: appears in Braze path and native Event Log (via hook or explicit fallback).

5) Browser fallback
- Open in normal browser (no native bridge).
- Pass: no crash from missing `window.DemoBridge`.

6) Surface check
- Search for `window.DemoBridge`.
- Pass: only `demo_bridge_entry.js` calls it directly.

7) Iframe check (if used)
- If embedded by dashboard, parent allowlist supports:
  - `https://doppel-dashboard-staging-a7496acff9c6.herokuapp.com/`

8) Case preservation
Search identity/sync code for .toLowerCase(.
Pass: none found; user IDs are trim only.

9) Lock window exactness
Verify DEFAULT_LOCK_MS and manualLockMs.
Pass: both are exactly 300 (not 3000, 2000, 30, etc).

10) Event path exclusivity
Search for DemoBridge.logEvent / DemoBridge.logCustomEvent.
Pass: none in app code; events route only trackEvent -> braze.logCustomEvent.

11) Single identity owner path
Search for braze.changeUser and braze.openSession.
Pass: only in the single owner path (setUser callback flow), not scattered in providers/components/init.

12) Prompt filename hygiene
Search for _NEW prompt references.
Pass: none (SOLCON_PROMPT_V0.md only).

13) Mixed bridge module check
Search imports for starter + finisher bridge modules together.
Pass: only one bridge entry module is used.

14) Dynamic config id
Search for hardcoded configId: "...".
Pass: configId comes from prop/env/state, not fixed literal.