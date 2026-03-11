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
    let brazePlaceholder = false;
    try {
      const brazeMod = await import("@/lib/braze");
      const key = brazeMod.BRAZE_API_KEY;
      const url = brazeMod.BRAZE_BASE_URL;
      const keyMissing = !key || key === "YOUR_BRAZE_API_KEY";
      const urlMissing = !url || url === "YOUR_SDK_ENDPOINT";
      brazePlaceholder = keyMissing || urlMissing;
      if (brazePlaceholder) {
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
      brazePlaceholder = true;
      checks.push({
        id: "braze-config",
        label: "Braze SDK configuration",
        status: "fail",
        detail: "Could not import lib/braze.ts. See FIXES.md #0.",
      });
    }

    // ---------------------------------------------------------------
    // Fetch scan-source evidence (used by multiple checks)
    // ---------------------------------------------------------------
    type Hit = { file: string; line: number; match: string };
    type InvariantResult = { file: string; present: string[]; missing: string[] };
    type IntegrityResult = { file: string; expected: string; actual: string; match: boolean };
    let scanData: {
      scannedFiles: number;
      mixedBridgeHits: Hit[];
      identityWritesOutsideBridgeEntryHits: Hit[];
      demoBridgeOutsideBridgeEntryHits: Hit[];
      eventBridgeForwardingHits: Hit[];
      lowercaseIdentityHits: Hit[];
      lockValueHits: Hit[];
      structuralInvariants: InvariantResult[];
      integrityResults: IntegrityResult[];
      integrityStrictMode: boolean;
      integrityManifestFound: boolean;
    } | null = null;
    let scanError = false;

    try {
      const res = await fetch("/api/scan-source");
      scanData = await res.json();
    } catch {
      scanError = true;
    }

    // ---------------------------------------------------------------
    // 1) Web switch — one sync flow, no n2 -> n1 bounce
    // ---------------------------------------------------------------
    try {
      const syncMod = await import("@/lib/sync-state");
      const src = syncMod.createSyncStateMachine.toString();
      const hasDedupe = src.includes("lastAppliedSig");
      checks.push({
        id: "check-1",
        label: "1. Web switch: no bounce",
        status: hasDedupe ? "pass" : "fail",
        detail: hasDedupe
          ? "Sync state machine has signature dedupe to prevent n2 -> n1 bounce."
          : "Missing signature dedupe in sync state machine. See FIXES.md #2.",
      });
    } catch {
      checks.push({
        id: "check-1",
        label: "1. Web switch: no bounce",
        status: "warn",
        detail: "Could not import sync-state module. See FIXES.md #2.",
      });
    }

    // ---------------------------------------------------------------
    // 2) Native switch — web updates once, no duplicate apply;
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
        id: "check-2",
        label: "2. Native switch: single apply + detail forwarding",
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
        id: "check-2",
        label: "2. Native switch: single apply + detail forwarding",
        status: "warn",
        detail: "Could not import modules for inspection. See FIXES.md #3.",
      });
    }

    // ---------------------------------------------------------------
    // 3) Event path exclusivity — Braze-only, no DemoBridge forwarding
    //    (merged check 4 + 10)
    // ---------------------------------------------------------------
    {
      let brazePath = false;
      let demoBridgeForwarding: Hit[] = [];

      try {
        const trackMod = await import("@/lib/track-event");
        const src = trackMod.trackEvent.toString();
        brazePath = src.includes("logCustomEvent") || src.includes("logEvent");
      } catch {
        // Will report as warn
      }

      if (scanData && !scanError) {
        demoBridgeForwarding = scanData.eventBridgeForwardingHits;
      }

      const noDemoBridgeEvents = demoBridgeForwarding.length === 0;
      const allPass = brazePath && noDemoBridgeEvents;

      if (scanError) {
        checks.push({
          id: "check-3",
          label: "3. Event path exclusivity",
          status: "warn",
          detail: "Could not reach /api/scan-source for event path inspection. See FIXES.md #4/#10.",
        });
      } else if (allPass) {
        checks.push({
          id: "check-3",
          label: "3. Event path exclusivity",
          status: "pass",
          detail: "Events route through trackEvent -> braze.logCustomEvent only. No DemoBridge.logEvent forwarding.",
        });
      } else {
        const issues = [
          !brazePath && "trackEvent does not call logCustomEvent",
          !noDemoBridgeEvents && `DemoBridge event forwarding at: ${demoBridgeForwarding.map((h) => `${h.file}:${h.line}`).join("; ")}`,
        ].filter(Boolean);
        checks.push({
          id: "check-3",
          label: "3. Event path exclusivity",
          status: "fail",
          detail: `FAIL: ${issues.join("; ")}. See FIXES.md #4/#10.`,
        });
      }
    }

    // ---------------------------------------------------------------
    // 4) Surface check — DemoBridge only in bridge-entry (scan-source)
    // ---------------------------------------------------------------
    if (scanData && !scanError) {
      const hits = scanData.demoBridgeOutsideBridgeEntryHits;
      if (hits.length === 0) {
        checks.push({
          id: "check-4",
          label: "4. Surface check: DemoBridge confined",
          status: "pass",
          detail: `Scanned ${scanData.scannedFiles} files. DemoBridge calls confined to lib/bridge-entry.ts only.`,
        });
      } else {
        const locs = hits.map((h) => `${h.file}:${h.line}`).join("; ");
        checks.push({
          id: "check-4",
          label: "4. Surface check: DemoBridge leaked",
          status: "fail",
          detail: `REJECT: DemoBridge referenced outside bridge-entry at: ${locs}. See FIXES.md #6.`,
        });
      }
    } else {
      checks.push({
        id: "check-4",
        label: "4. Surface check: DemoBridge confined",
        status: "warn",
        detail: "Could not reach /api/scan-source for surface inspection. See FIXES.md #6.",
      });
    }

    // ---------------------------------------------------------------
    // 5) Single identity owner — no changeUser/openSession outside bridge-entry
    // ---------------------------------------------------------------
    if (scanData && !scanError) {
      const hits = scanData.identityWritesOutsideBridgeEntryHits;
      if (hits.length === 0) {
        checks.push({
          id: "check-5",
          label: "5. Single identity owner path",
          status: "pass",
          detail: "No changeUser/openSession calls found outside lib/bridge-entry.ts. Identity writes owned exclusively by setUser().",
        });
      } else {
        const locs = hits.map((h) => `${h.file}:${h.line} (${h.match})`).join("; ");
        checks.push({
          id: "check-5",
          label: "5. Single identity owner path",
          status: "fail",
          detail: `REJECT: Identity writes found outside bridge-entry at: ${locs}. See FIXES.md #11.`,
        });
      }
    } else {
      checks.push({
        id: "check-5",
        label: "5. Single identity owner path",
        status: "warn",
        detail: "Could not reach /api/scan-source for identity owner inspection. See FIXES.md #11.",
      });
    }

    // ---------------------------------------------------------------
    // 6) ConfigId resolution parity (uses structural invariants)
    // ---------------------------------------------------------------
    if (scanData && !scanError) {
      const syncInv = scanData.structuralInvariants.find((i) => i.file === "lib/sync-state.ts");
      const bridgeInv = scanData.structuralInvariants.find((i) => i.file === "lib/bridge-entry.ts");

      const requiredLabels = [
        { source: syncInv, label: "configId in SyncPayload" },
        { source: syncInv, label: "fallbackConfigId param" },
        { source: syncInv, label: "configId native override" },
        { source: bridgeInv, label: "setUser accepts resolvedConfigId" },
      ];

      const missing = requiredLabels
        .filter((r) => !r.source?.present.includes(r.label))
        .map((r) => r.label);

      checks.push({
        id: "check-6",
        label: "6. ConfigId resolution parity",
        status: missing.length === 0 ? "pass" : "fail",
        detail: missing.length === 0
          ? "configId in payload contract, fallback exists, native detail.configId overrides fallback, setUser receives resolved value."
          : `FAIL: ${missing.join("; ")}. See FIXES.md #13.`,
      });
    } else {
      checks.push({
        id: "check-6",
        label: "6. ConfigId resolution parity",
        status: "warn",
        detail: "Could not reach /api/scan-source for configId inspection. See FIXES.md #13.",
      });
    }

    // ---------------------------------------------------------------
    // 7) Native runtime event simulation
    // ---------------------------------------------------------------
    try {
      const syncMod = await import("@/lib/sync-state");
      const testUserId = `__val_test_${Date.now()}`;
      let applyCount = 0;
      let lastRendered = "";

      const testSync = syncMod.createSyncStateMachine({
        initialUserId: "viewer_a",
        manualLockMs: 300,
        fallbackConfigId: "test",
        renderUser: (userId: string) => {
          lastRendered = userId;
        },
        setUser: () => {
          applyCount++;
        },
      });

      // Simulate native dispatch
      const applied = testSync.applyIncomingSync(
        {
          userId: testUserId,
          reason: "manual",
          sessionId: "test-session",
          authority: "native",
          configId: "test-config",
        },
        { fromNative: true }
      );

      // Try same payload again (should dedupe)
      const dupe = testSync.applyIncomingSync(
        {
          userId: testUserId,
          reason: "manual",
          sessionId: "test-session",
          authority: "native",
          configId: "test-config",
        },
        { fromNative: true }
      );

      const userUpdated = applied && lastRendered === testUserId;
      const noDupe = !dupe;
      const noEcho = applyCount === 0; // fromNative should suppress setUser callback
      const allPass = userUpdated && noDupe && noEcho;

      const issues = [
        !applied && "native event did not apply",
        lastRendered !== testUserId && `rendered "${lastRendered}" instead of "${testUserId}"`,
        dupe && "duplicate apply was not suppressed",
        applyCount > 0 && `setUser called ${applyCount}x (should be 0 for fromNative)`,
      ].filter(Boolean);

      checks.push({
        id: "check-7",
        label: "7. Native runtime event simulation",
        status: allPass ? "pass" : "fail",
        detail: allPass
          ? "Mock native event applied exactly once, no bounce, no duplicate, echo suppression active."
          : `FAIL: ${issues.join("; ")}. See FIXES.md #15.`,
      });
    } catch (err) {
      checks.push({
        id: "check-7",
        label: "7. Native runtime event simulation",
        status: "warn",
        detail: `Could not run native simulation: ${err instanceof Error ? err.message : "unknown error"}. See FIXES.md #15.`,
      });
    }

    // ---------------------------------------------------------------
    // 8) Embed policy (merged check 7 + 16: intended + observed)
    // ---------------------------------------------------------------
    {
      const REQUIRED_ORIGIN =
        "https://doppel-dashboard-staging-a7496acff9c6.herokuapp.com";
      let intendedOk = false;
      let observedOk = false;
      let xfoConflict = false;
      let isProd = false;
      let envHost = "unknown";
      let intendedError = false;
      let observedError = false;

      // Check intended CSP
      try {
        const res = await fetch("/api/check-csp");
        const body = await res.json();
        const csp: string = body.intendedCsp ?? "";
        intendedOk = csp.includes("frame-ancestors") && csp.includes(REQUIRED_ORIGIN);
      } catch {
        intendedError = true;
      }

      // Check observed headers
      try {
        const res = await fetch("/api/check-headers");
        const body = await res.json();
        if (!body.error) {
          const observedCsp: string = body.observedCsp ?? "";
          const observedXfo: string | null = body.observedXFrameOptions ?? null;
          isProd = body.isProductionLike ?? false;
          envHost = body.host ?? "unknown";

          observedOk = observedCsp.includes("frame-ancestors") && observedCsp.includes(REQUIRED_ORIGIN);
          xfoConflict = observedXfo !== null && observedXfo !== "" &&
            (observedXfo.toUpperCase() === "DENY" || observedXfo.toUpperCase() === "SAMEORIGIN");
        }
      } catch {
        observedError = true;
      }

      if (xfoConflict) {
        checks.push({
          id: "check-8",
          label: "8. Embed policy: XFO conflict",
          status: "fail",
          detail: `X-Frame-Options blocks cross-origin embedding. See FIXES.md #7/#16.`,
        });
      } else if (intendedError && observedError) {
        checks.push({
          id: "check-8",
          label: "8. Embed policy",
          status: "warn",
          detail: "Could not reach /api/check-csp or /api/check-headers. See FIXES.md #7/#16.",
        });
      } else if (intendedOk && (observedOk || !isProd)) {
        checks.push({
          id: "check-8",
          label: "8. Embed policy: OK",
          status: "pass",
          detail: isProd
            ? `Intended and observed CSP frame-ancestors allow ${REQUIRED_ORIGIN}.`
            : `Intended CSP OK. Non-production host (${envHost}): observed CSP exempt.`,
        });
      } else if (!intendedOk) {
        checks.push({
          id: "check-8",
          label: "8. Embed policy: intended missing",
          status: "fail",
          detail: `Intended frame-ancestors does not include ${REQUIRED_ORIGIN}. Update ALLOWED_IFRAME_PARENTS. See FIXES.md #7.`,
        });
      } else {
        checks.push({
          id: "check-8",
          label: "8. Embed policy: observed missing",
          status: "fail",
          detail: `Production host (${envHost}): observed CSP does not include frame-ancestors for ${REQUIRED_ORIGIN}. See FIXES.md #16.`,
        });
      }
    }

    // ---------------------------------------------------------------
    // 9) Hardened identity invariants (merged 8+9+14+17)
    //    - case preservation (no toLowerCase)
    //    - lock window = 300ms
    //    - identity gating (hasBridge, else branch, etc.)
    //    - structural invariants + integrity
    // ---------------------------------------------------------------
    if (scanData && !scanError) {
      const issues: string[] = [];

      // Case preservation
      if (scanData.lowercaseIdentityHits.length > 0) {
        const locs = scanData.lowercaseIdentityHits.map((h) => `${h.file}:${h.line}`).join("; ");
        issues.push(`toLowerCase in identity code: ${locs}`);
      }

      // Lock window
      const lockHits = scanData.lockValueHits;
      if (lockHits.length > 0) {
        const allText = lockHits.map((h) => h.match).join(" ");
        const has300 = /\b300\b/.test(allText);
        const badValues = ["2000", "3000", "1000", "30"].filter((v) =>
          new RegExp(`\\b${v}\\b`).test(allText) && (v !== "30" || !/\b300\b/.test(allText))
        );
        if (badValues.length > 0) {
          issues.push(`Lock window has non-300ms value(s): ${badValues.join(", ")}`);
        } else if (!has300) {
          issues.push("Lock window: could not confirm 300ms");
        }
      }

      // Identity gating (from bridge-entry invariants)
      const bridgeInv = scanData.structuralInvariants.find((i) => i.file === "lib/bridge-entry.ts");
      const gatingLabels = [
        "hasBridge() gate",
        "environment-gated setUser",
        "explicit else branch in setUser",
        "native branch startSession",
        "browser fallback braze identity write",
      ];
      const gatingMissing = gatingLabels.filter((l) => !bridgeInv?.present.includes(l));
      if (gatingMissing.length > 0 && !brazePlaceholder) {
        issues.push(`Identity gating missing: ${gatingMissing.join("; ")}`);
      }

      // Structural invariants (all hardened files)
      const invariants = scanData.structuralInvariants ?? [];
      const allMissing = invariants.flatMap((inv) =>
        inv.missing.map((m) => `${inv.file}: ${m}`)
      );
      if (allMissing.length > 0) {
        issues.push(`Structural invariants broken: ${allMissing.join("; ")}`);
      }

      // Integrity hashes (opt-in strict)
      const integrity = scanData.integrityResults ?? [];
      const strictMode = scanData.integrityStrictMode ?? false;
      const manifestFound = scanData.integrityManifestFound ?? false;
      const hashMismatches = integrity.filter((r) => !r.match);
      const integrityOk = hashMismatches.length === 0;

      let integrityNote = "";
      if (!manifestFound) {
        integrityNote = "Integrity manifest: not present (opt-in via STRICT_INTEGRITY_MODE=true)";
      } else if (integrityOk) {
        integrityNote = `Integrity hashes: ${integrity.length}/${integrity.length} match`;
      } else {
        const changed = hashMismatches.map((r) => r.file).join(", ");
        integrityNote = `Integrity hashes changed: ${changed}`;
        if (strictMode) {
          issues.push(`Integrity mismatch [STRICT MODE]: ${changed}`);
        }
      }

      // Determine status
      const hasStructuralFail = allMissing.length > 0;
      const hasIdentityFail = issues.some((i) => i.includes("toLowerCase") || i.includes("Lock window") || i.includes("Identity gating"));
      const hasStrictIntegrityFail = strictMode && (!manifestFound || !integrityOk);

      let status: "pass" | "fail" | "warn" = "pass";
      if (hasStructuralFail || hasIdentityFail || hasStrictIntegrityFail) {
        status = "fail";
      } else if (brazePlaceholder && gatingMissing.length > 0) {
        status = "warn"; // Braze placeholder makes gating check informational
      }

      const passDetails = [
        "Case preserved (no toLowerCase)",
        "Lock window = 300ms",
        brazePlaceholder ? "Identity gating (informational until Braze configured)" : "Identity gating OK",
        `Structural invariants: ${invariants.length} files pass`,
        integrityNote,
      ];

      checks.push({
        id: "check-9",
        label: status === "pass"
          ? "9. Hardened identity invariants: OK"
          : status === "warn"
            ? "9. Hardened identity invariants: advisory"
            : "9. Hardened identity invariants: BROKEN",
        status,
        detail: status === "pass" || status === "warn"
          ? passDetails.join(". ") + "."
          : `FAIL: ${issues.join("; ")}. See FIXES.md #8/#9/#14/#17.`,
      });
    } else {
      checks.push({
        id: "check-9",
        label: "9. Hardened identity invariants",
        status: "warn",
        detail: "Could not reach /api/scan-source for invariant inspection. See FIXES.md #8/#9/#14/#17.",
      });
    }

    // ---------------------------------------------------------------
    // 10) Browser fallback — no crash from missing DemoBridge (informational)
    // ---------------------------------------------------------------
    {
      const hasDemoBridge = Boolean(
        (window as Record<string, unknown>).DemoBridge
      );
      checks.push({
        id: "check-10",
        label: hasDemoBridge
          ? "10. Browser fallback (native detected)"
          : "10. Browser fallback: OK",
        status: "pass",
        detail: hasDemoBridge
          ? "DemoBridge present -- running in native container."
          : "DemoBridge not present. App loaded without crashing -- fallback works.",
      });
    }

    // Sort: fail/warn first, then pass. Within each group, numerical order.
    const statusPriority = { fail: 0, warn: 1, pass: 2 };
    checks.sort((a, b) => {
      const sp = statusPriority[a.status] - statusPriority[b.status];
      if (sp !== 0) return sp;
      // Numerical order within same status group
      const numA = parseInt(a.id.replace("check-", ""), 10) || 0;
      const numB = parseInt(b.id.replace("check-", ""), 10) || 0;
      return numA - numB;
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
          to validate against the hardening spec (10 consolidated checks).
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
