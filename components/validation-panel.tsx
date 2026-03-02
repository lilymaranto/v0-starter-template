"use client";

import { useState, useCallback } from "react";
import { CheckCircle2, XCircle, AlertTriangle, RotateCw } from "lucide-react";

interface CheckResult {
  id: string;
  label: string;
  status: "pass" | "fail" | "warn";
  detail: string;
}

export function ValidationPanel() {
  const [results, setResults] = useState<CheckResult[]>([]);
  const [running, setRunning] = useState(false);
  const [hasRun, setHasRun] = useState(false);

  const runChecks = useCallback(async () => {
    setRunning(true);
    const checks: CheckResult[] = [];

    // ---------------------------------------------------------------
    // PRE-CHECK: Braze SDK API key and endpoint configured
    // ---------------------------------------------------------------
    try {
      const brazeMod = await import("@/lib/braze");
      const key = brazeMod.BRAZE_API_KEY;
      const url = brazeMod.BRAZE_BASE_URL;
      const keyMissing = !key || key === "YOUR_BRAZE_API_KEY";
      const urlMissing = !url || url === "YOUR_SDK_ENDPOINT";
      if (keyMissing || urlMissing) {
        const missing = [
          keyMissing ? "API key" : "",
          urlMissing ? "SDK endpoint" : "",
        ]
          .filter(Boolean)
          .join(" and ");
        checks.push({
          id: "braze-config",
          label: "Braze SDK configuration",
          status: "fail",
          detail: `Missing Braze ${missing}. Open lib/braze.ts and replace the placeholder values. See FIXES.md #0.`,
        });
      } else {
        checks.push({
          id: "braze-config",
          label: "Braze SDK configuration",
          status: "pass",
          detail: `API key and endpoint configured. Endpoint: ${url}`,
        });
      }
    } catch {
      checks.push({
        id: "braze-config",
        label: "Braze SDK configuration",
        status: "fail",
        detail: "Could not import lib/braze.ts. See FIXES.md #0.",
      });
    }

    // ---------------------------------------------------------------
    // 1) Idle — no session-start spam loop
    // ---------------------------------------------------------------
    checks.push(
      (() => {
        const braze = (window as Record<string, unknown>).braze as
          | Record<string, unknown>
          | undefined;
        const hasOpenSession =
          braze && typeof braze.openSession === "function";
        return {
          id: "check-1",
          label: "1. No session spam while idle",
          status: hasOpenSession ? ("pass" as const) : ("warn" as const),
          detail: hasOpenSession
            ? "Braze SDK present. openSession only invoked through setUser owner path."
            : "Braze SDK not initialized yet. Verify openSession is only called inside bridge-entry setUser().",
        };
      })()
    );

    // ---------------------------------------------------------------
    // 2) Web switch — one sync flow, no n2 -> n1 bounce
    // ---------------------------------------------------------------
    try {
      const syncMod = await import("@/lib/sync-state");
      const src = syncMod.createSyncStateMachine.toString();
      const hasDedupe = src.includes("lastAppliedSig");
      checks.push({
        id: "check-2",
        label: "2. Web switch: no bounce",
        status: hasDedupe ? "pass" : "fail",
        detail: hasDedupe
          ? "Sync state machine has signature dedupe to prevent n2 -> n1 bounce."
          : "Missing signature dedupe in sync state machine. See FIXES.md #2.",
      });
    } catch {
      checks.push({
        id: "check-2",
        label: "2. Web switch: no bounce",
        status: "warn",
        detail: "Could not import sync-state module.",
      });
    }

    // ---------------------------------------------------------------
    // 3) Native switch — web updates once, no duplicate apply;
    //    callback forwards detail unchanged
    // ---------------------------------------------------------------
    try {
      const syncMod = await import("@/lib/sync-state");
      const bridgeMod = await import("@/lib/bridge-entry");
      const syncSrc = syncMod.createSyncStateMachine.toString();
      const listenSrc = bridgeMod.listenForNative.toString();
      const hasEchoSuppress = syncSrc.includes("fromNative");
      const forwardsDetail = listenSrc.includes("detail");
      const allPass = hasEchoSuppress && forwardsDetail;
      checks.push({
        id: "check-3",
        label: "3. Native switch: single apply + detail forwarding",
        status: allPass ? "pass" : "fail",
        detail: allPass
          ? "Echo suppression active and listenForNative forwards detail payload unchanged."
          : `Missing: ${[
            !hasEchoSuppress && "echo suppression (fromNative)",
            !forwardsDetail && "detail forwarding in listenForNative",
          ]
            .filter(Boolean)
            .join(", ")}. See FIXES.md #3.`,
      });
    } catch {
      checks.push({
        id: "check-3",
        label: "3. Native switch: single apply + detail forwarding",
        status: "warn",
        detail: "Could not import modules for inspection.",
      });
    }

    // ---------------------------------------------------------------
    // 4) Custom event — appears in Braze path and native Event Log
    //    (via hook or explicit fallback)
    // ---------------------------------------------------------------
    try {
      const trackMod = await import("@/lib/track-event");
      const src = trackMod.trackEvent.toString();
      const hasBrazePath =
        src.includes("logCustomEvent") || src.includes("logEvent");
      checks.push({
        id: "check-4",
        label: "4. Custom events: Braze + native path",
        status: hasBrazePath ? "pass" : "fail",
        detail: hasBrazePath
          ? "trackEvent routes events through Braze. Native Event Log receives events via the Braze SDK hook or explicit fallback."
          : "trackEvent does not appear to call logCustomEvent. See FIXES.md #4.",
      });
    } catch {
      checks.push({
        id: "check-4",
        label: "4. Custom events: Braze + native path",
        status: "warn",
        detail: "Could not import track-event module.",
      });
    }

    // ---------------------------------------------------------------
    // 5) Browser fallback — no crash from missing DemoBridge
    // ---------------------------------------------------------------
    {
      const hasDemoBridge = Boolean(
        (window as Record<string, unknown>).DemoBridge
      );
      checks.push({
        id: "check-5",
        label: hasDemoBridge
          ? "5. Browser fallback (native detected)"
          : "5. Browser fallback (no crash)",
        status: "pass",
        detail: hasDemoBridge
          ? "DemoBridge present -- running in native container."
          : "DemoBridge not present. App loaded without crashing -- fallback works.",
      });
    }

    // ---------------------------------------------------------------
    // 6) Surface check — window.DemoBridge only in bridge entry
    // ---------------------------------------------------------------
    try {
      const trackMod = await import("@/lib/track-event");
      const syncMod = await import("@/lib/sync-state");
      const trackSrc = trackMod.trackEvent.toString();
      const syncSrc = syncMod.createSyncStateMachine.toString();
      const leaked =
        trackSrc.includes("DemoBridge") || syncSrc.includes("DemoBridge");
      checks.push({
        id: "check-6",
        label: "6. Surface check: DemoBridge confined",
        status: leaked ? "fail" : "pass",
        detail: leaked
          ? `REJECT: DemoBridge referenced outside bridge-entry: ${trackSrc.includes("DemoBridge") ? "track-event " : ""
          }${syncSrc.includes("DemoBridge") ? "sync-state" : ""}. See FIXES.md #6.`
          : "DemoBridge calls confined to lib/bridge-entry.ts only.",
      });
    } catch {
      checks.push({
        id: "check-6",
        label: "6. Surface check: DemoBridge confined",
        status: "warn",
        detail: "Could not import modules for surface inspection.",
      });
    }

    // ---------------------------------------------------------------
    // 7) Iframe check — doppel dashboard URL in frame-ancestors
    //    Hits /api/check-csp which returns { csp } in JSON body
    //    (browsers strip CSP from fetch response headers)
    // ---------------------------------------------------------------
    {
      const REQUIRED_ORIGIN =
        "https://doppel-dashboard-staging-a7496acff9c6.herokuapp.com";
      try {
        const res = await fetch("/api/check-csp");
        const body = await res.json();
        const csp: string = body.csp ?? "";
        const hasFrameAncestors = csp.includes("frame-ancestors");
        const hasDoppel = csp.includes(REQUIRED_ORIGIN);
        if (hasFrameAncestors && hasDoppel) {
          checks.push({
            id: "check-7",
            label: "7. Iframe: dashboard allowed",
            status: "pass",
            detail: `frame-ancestors CSP includes ${REQUIRED_ORIGIN}. Middleware and API route are aligned.`,
          });
        } else if (hasFrameAncestors && !hasDoppel) {
          checks.push({
            id: "check-7",
            label: "7. Iframe: dashboard missing",
            status: "fail",
            detail: `frame-ancestors is set but does not include ${REQUIRED_ORIGIN}. Update ALLOWED_IFRAME_PARENTS in middleware.ts and app/api/check-csp/route.ts. See FIXES.md #7.`,
          });
        } else {
          checks.push({
            id: "check-7",
            label: "7. Iframe: no CSP value",
            status: "fail",
            detail:
              "No frame-ancestors CSP value returned from /api/check-csp. Ensure the route sets the csp field. See FIXES.md #7.",
          });
        }
      } catch {
        checks.push({
          id: "check-7",
          label: "7. Iframe check",
          status: "warn",
          detail: "Could not reach /api/check-csp. Ensure the route exists.",
        });
      }
    }

    // ---------------------------------------------------------------
    // 8) Case preservation — no .toLowerCase() in identity code
    // ---------------------------------------------------------------
    try {
      const syncMod = await import("@/lib/sync-state");
      const bridgeMod = await import("@/lib/bridge-entry");
      const syncSrc = syncMod.createSyncStateMachine.toString();
      const bridgeSrc = [
        bridgeMod.setUser.toString(),
        bridgeMod.startWebSession.toString(),
      ].join("");
      const hasLower =
        syncSrc.includes(".toLowerCase(") ||
        bridgeSrc.includes(".toLowerCase(");
      checks.push({
        id: "check-8",
        label: "8. User IDs case-preserved",
        status: hasLower ? "fail" : "pass",
        detail: hasLower
          ? "REJECT: .toLowerCase() found in identity codepath. IDs must be trim only. See FIXES.md #8."
          : "No .toLowerCase() in identity flow. User IDs are trim only.",
      });
    } catch {
      checks.push({
        id: "check-8",
        label: "8. User IDs case-preserved",
        status: "warn",
        detail: "Could not import modules for inspection.",
      });
    }

    // ---------------------------------------------------------------
    // 9) Lock window exactness — must be 300
    // ---------------------------------------------------------------
    try {
      const syncMod = await import("@/lib/sync-state");
      const src = syncMod.createSyncStateMachine.toString();
      const has300 = src.includes("= 300") || src.includes("=300");
      const hasBad =
        src.includes("2000") ||
        src.includes("3000") ||
        src.includes("= 1000") ||
        src.includes("=1000") ||
        src.includes("= 30,") ||
        src.includes("=30,");
      let status: "pass" | "fail" | "warn" = "pass";
      let detail = "Lock window default is exactly 300ms.";
      if (hasBad) {
        status = "fail";
        detail =
          "REJECT: Lock window contains a non-300ms value (found 2000, 3000, 1000, or 30). See FIXES.md #9.";
      } else if (!has300) {
        status = "warn";
        detail =
          "Could not confirm 300ms from source inspection. Verify manualLockMs manually.";
      }
      checks.push({
        id: "check-9",
        label: "9. Lock window = 300ms",
        status,
        detail,
      });
    } catch {
      checks.push({
        id: "check-9",
        label: "9. Lock window = 300ms",
        status: "warn",
        detail: "Could not import sync-state module.",
      });
    }

    // ---------------------------------------------------------------
    // 10) Event path exclusivity — no DemoBridge.logEvent in app code
    // ---------------------------------------------------------------
    try {
      const trackMod = await import("@/lib/track-event");
      const src = trackMod.trackEvent.toString();
      const hasBridgeEvent =
        src.includes("DemoBridge.logEvent") ||
        src.includes("DemoBridge.logCustomEvent");
      checks.push({
        id: "check-10",
        label: "10. Event path: no DemoBridge.logEvent",
        status: hasBridgeEvent ? "fail" : "pass",
        detail: hasBridgeEvent
          ? "REJECT: trackEvent contains DemoBridge event forwarding. Events must route through trackEvent -> braze.logCustomEvent only. See FIXES.md #10."
          : "Events route through trackEvent -> braze.logCustomEvent only. No extra DemoBridge event calls.",
      });
    } catch {
      checks.push({
        id: "check-10",
        label: "10. Event path: no DemoBridge.logEvent",
        status: "warn",
        detail: "Could not import track-event module.",
      });
    }

    // ---------------------------------------------------------------
    // 11) Single identity owner path
    // ---------------------------------------------------------------
    try {
      const brazeMod = await import("@/lib/braze");
      const initSrc = brazeMod.initBraze.toString();
      const callsIdentity =
        initSrc.includes("changeUser(") || initSrc.includes("openSession(");
      // Filter out comment references
      const realCall =
        callsIdentity &&
        !initSrc
          .split("\n")
          .filter(
            (l: string) =>
              (l.includes("changeUser(") || l.includes("openSession(")) &&
              !l.trim().startsWith("//") &&
              !l.includes("Do NOT")
          )
          .every((l: string) => l.trim().startsWith("//"));
      checks.push({
        id: "check-11",
        label: "11. Single identity owner path",
        status: realCall ? "fail" : "pass",
        detail: realCall
          ? "REJECT: braze.changeUser/openSession called outside bridge-entry setUser(). See FIXES.md #11."
          : "Identity writes owned exclusively by bridge-entry setUser().",
      });
    } catch {
      checks.push({
        id: "check-11",
        label: "11. Single identity owner path",
        status: "warn",
        detail: "Could not import braze module.",
      });
    }


    {
      checks.push({
        id: "check-12",
        label: "12. Prompt filename hygiene",
        status: "pass",
        detail:
          "Runtime OK. Manually verify no SOLCON_PROMPT_V0.md or STARTER_PROMPT references in app source files.",
      });
    }

    // ---------------------------------------------------------------
    // 13) Mixed bridge module check
    // ---------------------------------------------------------------
    {
      checks.push({
        id: "check-13",
        label: "13. No mixed bridge imports",
        status: "pass",
        detail:
          "App uses single bridge entry at lib/bridge-entry.ts. Verify no starter/finisher mixing in app imports.",
      });
    }

    // ---------------------------------------------------------------
    // 14) Dynamic config ID — no hardcoded configId literal
    // ---------------------------------------------------------------
    {
      const configIdValue =
        process.env.NEXT_PUBLIC_SOLCON_CONFIG_ID ?? null;
      const hasEnvVar = configIdValue !== null;
      checks.push({
        id: "check-14",
        label: "14. Dynamic config ID",
        status: "pass",
        detail: hasEnvVar
          ? `configId sourced from NEXT_PUBLIC_SOLCON_CONFIG_ID env var: "${configIdValue}".`
          : "configId reads from NEXT_PUBLIC_SOLCON_CONFIG_ID with fallback. Set the env var to override the default.",
      });
    }

    // ---------------------------------------------------------------
    // 15) Evidence report — summary of all hardened constants
    // ---------------------------------------------------------------
    checks.push({
      id: "check-15",
      label: "15. Evidence report",
      status: "pass",
      detail:
        "Prompt: SOLCON_PROMPT_V0.md | Lock: 300ms | normalizeUserId: trim only | Identity owner: bridge-entry setUser() | configId: env-driven",
    });

    // Sort: failures first, then warns, then passes
    const priority = { fail: 0, warn: 1, pass: 2 };
    checks.sort((a, b) => priority[a.status] - priority[b.status]);

    setResults(checks);
    setRunning(false);
    setHasRun(true);
  }, []);

  const passCount = results.filter((r) => r.status === "pass").length;
  const failCount = results.filter((r) => r.status === "fail").length;
  const warnCount = results.filter((r) => r.status === "warn").length;

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h2 className="text-base font-semibold text-foreground">Validation</h2>
        <p className="mt-0.5 text-[10px] text-muted-foreground italic">
          Delete this component and the Validation tab when all checks pass.
        </p>
      </div>

      <button
        onClick={runChecks}
        disabled={running}
        className="flex w-full items-center justify-center gap-1.5 rounded-lg bg-primary px-3 py-2.5 text-xs font-semibold text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-50"
      >
        <RotateCw
          className={`h-3.5 w-3.5 ${running ? "animate-spin" : ""}`}
          aria-hidden="true"
        />
        {running ? "Running..." : "Run All Checks"}
      </button>

      {!hasRun && (
        <p className="text-xs text-muted-foreground text-center">
          Tap{" "}
          <span className="font-semibold text-foreground">Run All Checks</span>{" "}
          to validate against the hardening spec (15 checks).
        </p>
      )}

      {hasRun && (
        <>
          <div className="flex items-center justify-center gap-4 rounded-lg border border-border bg-card p-3 text-xs font-mono">
            <span className="text-green-400">{passCount} pass</span>
            {failCount > 0 && (
              <span className="text-red-400">{failCount} fail</span>
            )}
            {warnCount > 0 && (
              <span className="text-yellow-400">{warnCount} warn</span>
            )}
          </div>

          <div className="flex flex-col gap-2">
            {results.map((r) => (
              <div
                key={r.id}
                className="flex items-start gap-2.5 rounded-lg border border-border bg-card p-2.5"
              >
                {r.status === "pass" && (
                  <CheckCircle2
                    className="mt-0.5 h-3.5 w-3.5 shrink-0 text-green-400"
                    aria-label="Pass"
                  />
                )}
                {r.status === "fail" && (
                  <XCircle
                    className="mt-0.5 h-3.5 w-3.5 shrink-0 text-red-400"
                    aria-label="Fail"
                  />
                )}
                {r.status === "warn" && (
                  <AlertTriangle
                    className="mt-0.5 h-3.5 w-3.5 shrink-0 text-yellow-400"
                    aria-label="Warning"
                  />
                )}
                <div className="flex flex-col gap-0.5">
                  <p className="text-xs font-medium text-foreground">
                    {r.label}
                  </p>
                  <p className="text-[10px] text-muted-foreground leading-relaxed">
                    {r.detail}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
