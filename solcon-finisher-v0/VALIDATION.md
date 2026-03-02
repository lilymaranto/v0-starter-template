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
