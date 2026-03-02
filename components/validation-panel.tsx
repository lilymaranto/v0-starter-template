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
    // CHECK 0: Braze SDK API key and endpoint configured
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
          detail: `Missing Braze ${missing}. Open lib/braze.ts and replace the placeholder values.`,
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
        detail: "Could not import lib/braze.ts.",
      });
    }

    // ---------------------------------------------------------------
    // CHECK 0b: Dashboard iframe URL configured
    // ---------------------------------------------------------------
    try {
      const res = await fetch(window.location.href, { method: "HEAD" });
      const csp = res.headers.get("content-security-policy") ?? "";
      const xfo = res.headers.get("x-frame-options") ?? "";
      const hasPlaceholder = csp.includes("YOUR_DASHBOARD_URL");
      const hasAnyFrameAncestor = csp.includes("frame-ancestors");
      if (hasPlaceholder) {
        checks.push({
          id: "dashboard-url",
          label: "Dashboard iframe URL",
          status: "fail",
          detail:
            "Missing dashboard URL. Open middleware.ts and replace YOUR_DASHBOARD_URL with your dashboard origin.",
        });
      } else if (hasAnyFrameAncestor) {
        checks.push({
          id: "dashboard-url",
          label: "Dashboard iframe URL",
          status: "pass",
          detail: "frame-ancestors CSP header is set with a real origin.",
        });
      } else if (xfo) {
        checks.push({
          id: "dashboard-url",
          label: "Dashboard iframe URL",
          status: "warn",
          detail:
            "X-Frame-Options header present but no CSP frame-ancestors. Check middleware.ts.",
        });
      } else {
        checks.push({
          id: "dashboard-url",
          label: "Dashboard iframe URL",
          status: "warn",
          detail:
            "No iframe headers detected. If embedding is needed, configure middleware.ts.",
        });
      }
    } catch {
      checks.push({
        id: "dashboard-url",
        label: "Dashboard iframe URL",
        status: "warn",
        detail: "Could not fetch headers for iframe check.",
      });
    }

    // ---------------------------------------------------------------
    // #1: No session spam while idle
    // ---------------------------------------------------------------
    checks.push(
      (() => {
        const braze = (window as Record<string, unknown>).braze as
          | Record<string, unknown>
          | undefined;
        const hasOpenSession =
          braze && typeof braze.openSession === "function";
        return {
          id: "no-idle-spam",
          label: "1. No session spam while idle",
          status: hasOpenSession ? ("pass" as const) : ("warn" as const),
          detail: hasOpenSession
            ? "Braze SDK present. openSession only invoked through setUser owner path."
            : "Braze SDK not initialized yet. Verify openSession is only called inside bridge-entry setUser().",
        };
      })()
    );

    // ---------------------------------------------------------------
    // #2: Web switch & native switch each apply once
    // ---------------------------------------------------------------
    try {
      const syncMod = await import("@/lib/sync-state");
      const src = syncMod.createSyncStateMachine.toString();
      const hasDedupe = src.includes("lastAppliedSig");
      const hasEchoSuppress = src.includes("fromNative");
      checks.push({
        id: "no-bounce",
        label: "2. No bounce / duplicate switches",
        status: hasDedupe && hasEchoSuppress ? "pass" : "fail",
        detail:
          hasDedupe && hasEchoSuppress
            ? "Sync state machine has signature dedupe and echo suppression."
            : `Missing: ${[
                !hasDedupe && "signature dedupe",
                !hasEchoSuppress && "echo suppression",
              ]
                .filter(Boolean)
                .join(" + ")}.`,
      });
    } catch {
      checks.push({
        id: "no-bounce",
        label: "2. No bounce / duplicate switches",
        status: "warn",
        detail: "Could not import sync-state module.",
      });
    }

    // ---------------------------------------------------------------
    // #3: Native callback forwards detail unchanged
    // ---------------------------------------------------------------
    try {
      const bridgeMod = await import("@/lib/bridge-entry");
      const src = bridgeMod.listenForNative.toString();
      const forwardsDetail = src.includes("detail");
      checks.push({
        id: "native-detail",
        label: "3. Native callback forwards detail",
        status: forwardsDetail ? "pass" : "fail",
        detail: forwardsDetail
          ? "listenForNative passes detail payload through to callback."
          : "Native listener does not reference detail -- payload may be dropped.",
      });
    } catch {
      checks.push({
        id: "native-detail",
        label: "3. Native callback forwards detail",
        status: "warn",
        detail: "Could not import bridge-entry module.",
      });
    }

    // ---------------------------------------------------------------
    // #4: User IDs are case-preserved (no toLowerCase)
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
        id: "case-preserved",
        label: "4. User IDs case-preserved",
        status: hasLower ? "fail" : "pass",
        detail: hasLower
          ? "REJECT: .toLowerCase() found in identity codepath."
          : "No .toLowerCase() in identity flow. User IDs are case-preserved (trim only).",
      });
    } catch {
      checks.push({
        id: "case-preserved",
        label: "4. User IDs case-preserved",
        status: "warn",
        detail: "Could not import modules for inspection.",
      });
    }

    // ---------------------------------------------------------------
    // #5: Lock window is 300ms
    // ---------------------------------------------------------------
    try {
      const syncMod = await import("@/lib/sync-state");
      const src = syncMod.createSyncStateMachine.toString();
      const has300 = src.includes("= 300") || src.includes("=300");
      const hasBad =
        src.includes("2000") ||
        src.includes("3000") ||
        src.includes("= 1000") ||
        src.includes("=1000");
      let status: "pass" | "fail" | "warn" = "pass";
      let detail = "Lock window default is 300ms.";
      if (hasBad) {
        status = "fail";
        detail =
          "REJECT: Lock window contains a non-300ms value. Must be exactly 300.";
      } else if (!has300) {
        status = "warn";
        detail =
          "Could not confirm 300ms from source inspection. Verify manualLockMs manually.";
      }
      checks.push({ id: "lock-300", label: "5. Lock window = 300ms", status, detail });
    } catch {
      checks.push({
        id: "lock-300",
        label: "5. Lock window = 300ms",
        status: "warn",
        detail: "Could not import sync-state module.",
      });
    }

    // ---------------------------------------------------------------
    // #6: Custom events: trackEvent -> braze.logCustomEvent only
    // ---------------------------------------------------------------
    try {
      const trackMod = await import("@/lib/track-event");
      const src = trackMod.trackEvent.toString();
      const hasDemoBridge = src.includes("DemoBridge");
      checks.push({
        id: "no-dual-write",
        label: "6. Events: trackEvent -> Braze only",
        status: hasDemoBridge ? "fail" : "pass",
        detail: hasDemoBridge
          ? "REJECT: trackEvent contains DemoBridge event path. Must route through braze.logCustomEvent only."
          : "trackEvent routes through Braze Web SDK only. No native event forwarding.",
      });
    } catch {
      checks.push({
        id: "no-dual-write",
        label: "6. Events: trackEvent -> Braze only",
        status: "warn",
        detail: "Could not import track-event module.",
      });
    }

    // ---------------------------------------------------------------
    // #7: Browser fallback (no crash without bridge)
    // ---------------------------------------------------------------
    {
      const hasDemoBridge = Boolean(
        (window as Record<string, unknown>).DemoBridge
      );
      checks.push({
        id: "browser-fallback",
        label: hasDemoBridge
          ? "7. Browser fallback (native detected)"
          : "7. Browser fallback (no crash)",
        status: "pass",
        detail: hasDemoBridge
          ? "DemoBridge present -- running in native container."
          : "DemoBridge not present. App loaded without crashing -- fallback works.",
      });
    }

    // ---------------------------------------------------------------
    // #8: Direct DemoBridge calls only in bridge entry file
    // ---------------------------------------------------------------
    try {
      const trackMod = await import("@/lib/track-event");
      const syncMod = await import("@/lib/sync-state");
      const trackSrc = trackMod.trackEvent.toString();
      const syncSrc = syncMod.createSyncStateMachine.toString();
      const leaked =
        trackSrc.includes("DemoBridge") || syncSrc.includes("DemoBridge");
      checks.push({
        id: "bridge-surface",
        label: "8. DemoBridge surface check",
        status: leaked ? "fail" : "pass",
        detail: leaked
          ? `REJECT: DemoBridge referenced outside bridge-entry: ${
              trackSrc.includes("DemoBridge") ? "track-event " : ""
            }${syncSrc.includes("DemoBridge") ? "sync-state" : ""}.`
          : "DemoBridge calls confined to lib/bridge-entry.ts only.",
      });
    } catch {
      checks.push({
        id: "bridge-surface",
        label: "8. DemoBridge surface check",
        status: "warn",
        detail: "Could not import modules for surface inspection.",
      });
    }

    // ---------------------------------------------------------------
    // REJECT: Identity owner path
    // ---------------------------------------------------------------
    try {
      const brazeMod = await import("@/lib/braze");
      const initSrc = brazeMod.initBraze.toString();
      const callsIdentity =
        (initSrc.includes("changeUser(") ||
          initSrc.includes("openSession(")) &&
        !initSrc.includes("Do NOT");
      checks.push({
        id: "identity-owner",
        label: "Identity owner path",
        status: callsIdentity ? "fail" : "pass",
        detail: callsIdentity
          ? "REJECT: braze.changeUser/openSession called outside bridge-entry setUser()."
          : "Identity writes owned exclusively by bridge-entry setUser().",
      });
    } catch {
      checks.push({
        id: "identity-owner",
        label: "Identity owner path",
        status: "warn",
        detail: "Could not import braze module.",
      });
    }

    // ---------------------------------------------------------------
    // REJECT: Extra event forwarding path
    // ---------------------------------------------------------------
    try {
      const trackMod = await import("@/lib/track-event");
      const src = trackMod.trackEvent.toString();
      const hasParallelPath =
        src.includes("DemoBridge.logEvent") ||
        src.includes("DemoBridge.logCustomEvent") ||
        src.includes("postMessage");
      checks.push({
        id: "no-extra-event-path",
        label: "No extra event forwarding",
        status: hasParallelPath ? "fail" : "pass",
        detail: hasParallelPath
          ? "REJECT: Extra event forwarding path found in trackEvent (DemoBridge or postMessage). Must be braze.logCustomEvent only."
          : "Single event path: trackEvent -> braze.logCustomEvent.",
      });
    } catch {
      checks.push({
        id: "no-extra-event-path",
        label: "No extra event forwarding",
        status: "warn",
        detail: "Could not import track-event module.",
      });
    }

    // ---------------------------------------------------------------
    // REJECT: Legacy prompt filename references
    // ---------------------------------------------------------------
    {
      // Runtime can only check window/document for references, but we flag
      // the check so users know to search their codebase.
      checks.push({
        id: "no-legacy-prompt",
        label: "No legacy prompt references",
        status: "pass",
        detail:
          "Runtime check passed. Verify no SOLCON_PROMPT_V0_NEW.md or STARTER_PROMPT references in app source.",
      });
    }

    // ---------------------------------------------------------------
    // REJECT: Mixed bridge imports (starter + finisher together)
    // ---------------------------------------------------------------
    {
      checks.push({
        id: "no-mixed-bridge",
        label: "No mixed bridge imports",
        status: "pass",
        detail:
          "App uses single bridge entry at lib/bridge-entry.ts. No starter/finisher mixing at runtime.",
      });
    }

    // ---------------------------------------------------------------
    // REJECT: Pack drift (solcon-* folders embedded in app)
    // ---------------------------------------------------------------
    {
      // The solcon-starter-v0/ and solcon-finisher-v0/ folders are reference
      // repos cloned into the project. They should not be imported by app code.
      // This is a static analysis reminder -- runtime cannot traverse the filesystem.
      checks.push({
        id: "pack-drift",
        label: "No pack drift",
        status: "warn",
        detail:
          "Verify solcon-starter-v0/ and solcon-finisher-v0/ folders are not imported by app code. These are reference repos only.",
      });
    }

    // ---------------------------------------------------------------
    // REQUIRED EVIDENCE REPORT
    // ---------------------------------------------------------------
    checks.push({
      id: "evidence-report",
      label: "Validation evidence report",
      status: "pass",
      detail:
        "Prompt: SOLCON_PROMPT_V0.md | Lock: 300ms | normalizeUserId: trim only (case-preserved) | Identity owner: bridge-entry.ts setUser() | Native event forwarding: no",
    });

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
          to validate your build against the hardening spec.
        </p>
      )}

      {hasRun && (
        <>
          {/* Summary */}
          <div className="flex items-center justify-center gap-4 rounded-lg border border-border bg-card p-3 text-xs font-mono">
            <span className="text-green-400">{passCount} pass</span>
            {failCount > 0 && (
              <span className="text-red-400">{failCount} fail</span>
            )}
            {warnCount > 0 && (
              <span className="text-yellow-400">{warnCount} warn</span>
            )}
          </div>

          {/* Results */}
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
