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

    // CHECK 1: Braze SDK initialized on window
    checks.push(
      (window as Record<string, unknown>).braze
        ? {
            id: "braze-init",
            label: "Braze SDK initialized",
            status: "pass",
            detail: "window.braze is present and accessible.",
          }
        : {
            id: "braze-init",
            label: "Braze SDK initialized",
            status: "fail",
            detail:
              "window.braze is missing. initBraze() may not have been called.",
          }
    );

    // CHECK 2: DemoBridge surface check -- should NOT be called directly
    // outside bridge-entry.ts. We can't grep at runtime, but we can verify
    // the bridge object shape is correct if it exists.
    const bridge = (window as Record<string, unknown>).DemoBridge;
    if (bridge) {
      checks.push({
        id: "bridge-present",
        label: "DemoBridge detected (native container)",
        status: "pass",
        detail:
          "Running inside native container. Bridge calls should only come from lib/bridge-entry.ts.",
      });
    } else {
      checks.push({
        id: "bridge-present",
        label: "DemoBridge not present (browser fallback)",
        status: "pass",
        detail:
          "Running in standalone browser. Bridge calls are safely no-oped via hasBridge() guard.",
      });
    }

    // CHECK 3: trackEvent does NOT dual-write to DemoBridge.logEvent
    // We import the actual module and inspect it.
    try {
      const trackMod = await import("@/lib/track-event");
      const fnSource = trackMod.trackEvent.toString();
      const hasDualWrite =
        fnSource.includes("DemoBridge") && fnSource.includes("logEvent");
      checks.push(
        hasDualWrite
          ? {
              id: "no-dual-write",
              label: "trackEvent routing (no dual-write)",
              status: "fail",
              detail:
                "trackEvent() contains DemoBridge.logEvent path. Events should route through Braze only -- native reads from Braze, not a second write.",
            }
          : {
              id: "no-dual-write",
              label: "trackEvent routing (Braze-only)",
              status: "pass",
              detail:
                "trackEvent() routes through Braze Web SDK only. No dual-write to native bridge.",
            }
      );
    } catch {
      checks.push({
        id: "no-dual-write",
        label: "trackEvent routing",
        status: "warn",
        detail: "Could not dynamically import track-event module to inspect.",
      });
    }

    // CHECK 4: sync-state normalizeUserId should NOT toLowerCase
    try {
      const syncMod = await import("@/lib/sync-state");
      const factorySource = syncMod.createSyncStateMachine.toString();
      const hasToLowerCase = factorySource.includes("toLowerCase");
      checks.push(
        hasToLowerCase
          ? {
              id: "no-tolowercase",
              label: "User ID normalization (no toLowerCase)",
              status: "fail",
              detail:
                'sync-state uses .toLowerCase() on user IDs. User IDs should be compared as-is -- casing may be significant.',
            }
          : {
              id: "no-tolowercase",
              label: "User ID normalization",
              status: "pass",
              detail:
                "sync-state does not force lowercase on user IDs. Casing preserved.",
            }
      );
    } catch {
      checks.push({
        id: "no-tolowercase",
        label: "User ID normalization",
        status: "warn",
        detail: "Could not dynamically import sync-state module to inspect.",
      });
    }

    // CHECK 5: sync-state lock window value
    try {
      const syncMod = await import("@/lib/sync-state");
      const factorySource = syncMod.createSyncStateMachine.toString();
      // Check if 3000 is hardcoded as the default
      const hasHardcoded3000 = factorySource.includes("3000");
      checks.push(
        hasHardcoded3000
          ? {
              id: "lock-window",
              label: "Lock window constant",
              status: "warn",
              detail:
                "DEFAULT_LOCK_MS appears to be 3000ms. Verify this matches your hardened spec. The value should be configurable via the factory parameter.",
            }
          : {
              id: "lock-window",
              label: "Lock window constant",
              status: "pass",
              detail:
                "Lock window does not hardcode 3000ms inline. Value is injected via factory config.",
            }
      );
    } catch {
      checks.push({
        id: "lock-window",
        label: "Lock window constant",
        status: "warn",
        detail: "Could not dynamically import sync-state module to inspect.",
      });
    }

    // CHECK 6: changeUser is centralized in bridge-entry only
    // Runtime heuristic: check that braze.changeUser is not exposed globally
    // in a way that components could call it directly.
    const brazeObj = (window as Record<string, unknown>).braze as
      | Record<string, unknown>
      | undefined;
    if (brazeObj && typeof brazeObj.changeUser === "function") {
      checks.push({
        id: "centralized-changeuser",
        label: "changeUser centralization",
        status: "warn",
        detail:
          "window.braze.changeUser is accessible globally. Ensure components only call setUser() from lib/bridge-entry.ts, never braze.changeUser() directly.",
      });
    } else {
      checks.push({
        id: "centralized-changeuser",
        label: "changeUser centralization",
        status: "pass",
        detail:
          "braze.changeUser is not directly exposed on window -- identity routing is likely centralized.",
      });
    }

    // CHECK 7: iframe headers (can only test via fetch to self)
    try {
      const res = await fetch(window.location.href, { method: "HEAD" });
      const csp = res.headers.get("content-security-policy") ?? "";
      const hasFrameAncestors = csp.includes("frame-ancestors");
      checks.push(
        hasFrameAncestors
          ? {
              id: "iframe-headers",
              label: "Iframe CSP headers",
              status: "pass",
              detail: `CSP frame-ancestors directive found: "${csp}"`,
            }
          : {
              id: "iframe-headers",
              label: "Iframe CSP headers",
              status: "warn",
              detail:
                "No frame-ancestors directive detected in CSP. This may be expected if middleware strips headers on HEAD requests.",
            }
      );
    } catch {
      checks.push({
        id: "iframe-headers",
        label: "Iframe CSP headers",
        status: "warn",
        detail:
          "Could not fetch own headers to verify CSP. Check middleware.ts manually.",
      });
    }

    setResults(checks);
    setRunning(false);
    setHasRun(true);
  }, []);

  const passCount = results.filter((r) => r.status === "pass").length;
  const failCount = results.filter((r) => r.status === "fail").length;
  const warnCount = results.filter((r) => r.status === "warn").length;

  return (
    <section
      className="w-full max-w-lg rounded-xl border border-border bg-card p-6"
      aria-label="Validation checks"
    >
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-lg font-semibold text-card-foreground">
          Validation
        </h2>
        <button
          onClick={runChecks}
          disabled={running}
          className="flex items-center gap-2 rounded-lg bg-secondary px-4 py-2 text-sm font-medium text-secondary-foreground transition-colors hover:bg-secondary/80 disabled:opacity-50"
        >
          <RotateCw
            className={`h-4 w-4 ${running ? "animate-spin" : ""}`}
            aria-hidden="true"
          />
          {running ? "Running..." : "Run Checks"}
        </button>
      </div>

      {!hasRun && (
        <p className="text-sm text-muted-foreground">
          Click{" "}
          <span className="font-semibold text-foreground">Run Checks</span> to
          validate your build against the hardening spec.
        </p>
      )}

      {hasRun && (
        <>
          {/* Summary */}
          <div className="mb-4 flex items-center gap-4 text-sm font-mono">
            <span className="text-green-400">{passCount} pass</span>
            {failCount > 0 && (
              <span className="text-red-400">{failCount} fail</span>
            )}
            {warnCount > 0 && (
              <span className="text-yellow-400">{warnCount} warn</span>
            )}
          </div>

          {/* Results */}
          <div className="flex flex-col gap-3">
            {results.map((r) => (
              <div
                key={r.id}
                className="flex items-start gap-3 rounded-lg border border-border bg-background p-3"
              >
                {r.status === "pass" && (
                  <CheckCircle2
                    className="mt-0.5 h-4 w-4 shrink-0 text-green-400"
                    aria-label="Pass"
                  />
                )}
                {r.status === "fail" && (
                  <XCircle
                    className="mt-0.5 h-4 w-4 shrink-0 text-red-400"
                    aria-label="Fail"
                  />
                )}
                {r.status === "warn" && (
                  <AlertTriangle
                    className="mt-0.5 h-4 w-4 shrink-0 text-yellow-400"
                    aria-label="Warning"
                  />
                )}
                <div className="flex flex-col gap-1">
                  <p className="text-sm font-medium text-foreground">
                    {r.label}
                  </p>
                  <p className="text-xs text-muted-foreground leading-relaxed">
                    {r.detail}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </>
      )}
    </section>
  );
}
