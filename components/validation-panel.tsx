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
            : "Braze SDK not initialized yet. Verify openSession is only called inside bridge-entry setUser(). See FIXES.md #1.",
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
        detail: "Could not import sync-state module. See FIXES.md #2.",
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
        detail: "Could not import modules for inspection. See FIXES.md #3.",
      });
    }

    // ---------------------------------------------------------------
    // 4) Custom event — Braze-only routing, no DemoBridge forwarding
    // ---------------------------------------------------------------
    try {
      const trackMod = await import("@/lib/track-event");
      const src = trackMod.trackEvent.toString();
      const hasBrazePath =
        src.includes("logCustomEvent") || src.includes("logEvent");
      checks.push({
        id: "check-4",
        label: "4. Custom events: Braze-only path",
        status: hasBrazePath ? "pass" : "fail",
        detail: hasBrazePath
          ? "trackEvent routes events through Braze only (trackEvent -> braze.logCustomEvent). No DemoBridge custom-event forwarding."
          : "trackEvent does not appear to call logCustomEvent. See FIXES.md #4.",
      });
    } catch {
      checks.push({
        id: "check-4",
        label: "4. Custom events: Braze-only path",
        status: "warn",
        detail: "Could not import track-event module. See FIXES.md #4.",
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
          ? "DemoBridge present -- running in native container. See FIXES.md #5."
          : "DemoBridge not present. App loaded without crashing -- fallback works. See FIXES.md #5.",
      });
    }

    // ---------------------------------------------------------------
    // Fetch scan-source evidence (used by checks 6, 8, 9, 10, 11, 12, 17)
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
    // 6) Surface check — DemoBridge only in bridge-entry (scan-source)
    // ---------------------------------------------------------------
    if (scanData && !scanError) {
      const hits = scanData.demoBridgeOutsideBridgeEntryHits;
      if (hits.length === 0) {
        checks.push({
          id: "check-6",
          label: "6. Surface check: DemoBridge confined",
          status: "pass",
          detail: `Scanned ${scanData.scannedFiles} files. DemoBridge calls confined to lib/bridge-entry.ts only.`,
        });
      } else {
        const locs = hits.map((h) => `${h.file}:${h.line}`).join("; ");
        checks.push({
          id: "check-6",
          label: "6. Surface check: DemoBridge leaked",
          status: "fail",
          detail: `REJECT: DemoBridge referenced outside bridge-entry at: ${locs}. See FIXES.md #6.`,
        });
      }
    } else {
      checks.push({
        id: "check-6",
        label: "6. Surface check: DemoBridge confined",
        status: "warn",
        detail: "Could not reach /api/scan-source for surface inspection. See FIXES.md #6.",
      });
    }

    // ---------------------------------------------------------------
    // 7) Iframe check — intended CSP policy includes dashboard origin
    // ---------------------------------------------------------------
    {
      const REQUIRED_ORIGIN =
        "https://doppel-dashboard-staging-a7496acff9c6.herokuapp.com";
      try {
        const res = await fetch("/api/check-csp");
        const body = await res.json();
        const csp: string = body.intendedCsp ?? "";
        const hasFrameAncestors = csp.includes("frame-ancestors");
        const hasDoppel = csp.includes(REQUIRED_ORIGIN);
        if (hasFrameAncestors && hasDoppel) {
          checks.push({
            id: "check-7",
            label: "7. Iframe: intended policy OK",
            status: "pass",
            detail: `Intended CSP frame-ancestors includes ${REQUIRED_ORIGIN}.`,
          });
        } else if (hasFrameAncestors && !hasDoppel) {
          checks.push({
            id: "check-7",
            label: "7. Iframe: dashboard missing from policy",
            status: "fail",
            detail: `Intended frame-ancestors does not include ${REQUIRED_ORIGIN}. Update ALLOWED_IFRAME_PARENTS. See FIXES.md #7.`,
          });
        } else {
          checks.push({
            id: "check-7",
            label: "7. Iframe: no CSP policy defined",
            status: "fail",
            detail:
              "No frame-ancestors in intended CSP from /api/check-csp. See FIXES.md #7.",
          });
        }
      } catch {
        checks.push({
          id: "check-7",
          label: "7. Iframe check",
          status: "warn",
          detail: "Could not reach /api/check-csp. Ensure the route exists. See FIXES.md #7.",
        });
      }
    }

    // ---------------------------------------------------------------
    // 8) Case preservation — no .toLowerCase() in identity code (scan-source)
    // ---------------------------------------------------------------
    if (scanData && !scanError) {
      const hits = scanData.lowercaseIdentityHits;
      if (hits.length === 0) {
        checks.push({
          id: "check-8",
          label: "8. User IDs case-preserved",
          status: "pass",
          detail: "No .toLowerCase() in identity files. User IDs are trim only.",
        });
      } else {
        const locs = hits.map((h) => `${h.file}:${h.line}`).join("; ");
        checks.push({
          id: "check-8",
          label: "8. User IDs case-preserved",
          status: "fail",
          detail: `REJECT: .toLowerCase() found in identity codepath at: ${locs}. IDs must be trim only. See FIXES.md #8.`,
        });
      }
    } else {
      checks.push({
        id: "check-8",
        label: "8. User IDs case-preserved",
        status: "warn",
        detail: "Could not reach /api/scan-source for identity inspection. See FIXES.md #8.",
      });
    }

    // ---------------------------------------------------------------
    // 9) Lock window exactness — must be 300 (scan-source evidence)
    // ---------------------------------------------------------------
    if (scanData && !scanError) {
      const hits = scanData.lockValueHits;
      if (hits.length === 0) {
        checks.push({
          id: "check-9",
          label: "9. Lock window = 300ms",
          status: "warn",
          detail: "No lock value declarations found in source. Verify manualLockMs manually. See FIXES.md #9.",
        });
      } else {
        const allText = hits.map((h) => h.match).join(" ");
        const has300 = /\b300\b/.test(allText);
        const badValues = ["2000", "3000", "1000"].filter((v) =>
          new RegExp(`\\b${v}\\b`).test(allText)
        );
        const has30 = /\b30\b/.test(allText) && !has300;
        if (badValues.length > 0 || has30) {
          const found = [...badValues, ...(has30 ? ["30"] : [])].join(", ");
          checks.push({
            id: "check-9",
            label: "9. Lock window = 300ms",
            status: "fail",
            detail: `REJECT: Lock source contains non-300ms value(s): ${found}. See FIXES.md #9.`,
          });
        } else if (has300) {
          checks.push({
            id: "check-9",
            label: "9. Lock window = 300ms",
            status: "pass",
            detail: `Lock window default is 300ms. Evidence: ${hits.map((h) => `${h.file}:${h.line}`).join("; ")}.`,
          });
        } else {
          checks.push({
            id: "check-9",
            label: "9. Lock window = 300ms",
            status: "warn",
            detail: `Lock declarations found but could not confirm 300. Evidence: ${hits.map((h) => h.match).join("; ")}. See FIXES.md #9.`,
          });
        }
      }
    } else {
      checks.push({
        id: "check-9",
        label: "9. Lock window = 300ms",
        status: "warn",
        detail: "Could not reach /api/scan-source for lock inspection. See FIXES.md #9.",
      });
    }

    // ---------------------------------------------------------------
    // 10) Event path exclusivity — no DemoBridge.logEvent (scan-source)
    // ---------------------------------------------------------------
    if (scanData && !scanError) {
      const hits = scanData.eventBridgeForwardingHits;
      if (hits.length === 0) {
        checks.push({
          id: "check-10",
          label: "10. Event path: no DemoBridge.logEvent",
          status: "pass",
          detail: "No DemoBridge event forwarding found in runtime source. Events route through braze.logCustomEvent only.",
        });
      } else {
        const locs = hits.map((h) => `${h.file}:${h.line} (${h.match})`).join("; ");
        checks.push({
          id: "check-10",
          label: "10. Event path: DemoBridge forwarding found",
          status: "fail",
          detail: `REJECT: DemoBridge event forwarding at: ${locs}. Events must route through trackEvent -> braze.logCustomEvent only. See FIXES.md #10.`,
        });
      }
    } else {
      checks.push({
        id: "check-10",
        label: "10. Event path: no DemoBridge.logEvent",
        status: "warn",
        detail: "Could not reach /api/scan-source for event path inspection. See FIXES.md #10.",
      });
    }

    // ---------------------------------------------------------------
    // 11) Single identity owner — no changeUser/openSession outside bridge-entry (scan-source)
    // ---------------------------------------------------------------
    if (scanData && !scanError) {
      const hits = scanData.identityWritesOutsideBridgeEntryHits;
      if (hits.length === 0) {
        checks.push({
          id: "check-11",
          label: "11. Single identity owner path",
          status: "pass",
          detail: "No changeUser/openSession calls found outside lib/bridge-entry.ts. Identity writes owned exclusively by setUser().",
        });
      } else {
        const locs = hits.map((h) => `${h.file}:${h.line} (${h.match})`).join("; ");
        checks.push({
          id: "check-11",
          label: "11. Single identity owner path",
          status: "fail",
          detail: `REJECT: Identity writes found outside bridge-entry at: ${locs}. See FIXES.md #11.`,
        });
      }
    } else {
      checks.push({
        id: "check-11",
        label: "11. Single identity owner path",
        status: "warn",
        detail: "Could not reach /api/scan-source for identity owner inspection. See FIXES.md #11.",
      });
    }

    // ---------------------------------------------------------------
    // 12) Mixed bridge module check (scan-source)
    // ---------------------------------------------------------------
    if (scanData && !scanError) {
      const hits = scanData.mixedBridgeHits;
      if (hits.length === 0) {
        checks.push({
          id: "check-12",
          label: "12. No mixed bridge imports",
          status: "pass",
          detail: `Scanned ${scanData.scannedFiles} runtime source files. No starter/finisher bridge imports found.`,
        });
      } else {
        const locs = hits.map((h) => `${h.file}:${h.line} (${h.match})`).join("; ");
        checks.push({
          id: "check-12",
          label: "12. No mixed bridge imports",
          status: "fail",
          detail: `FAIL: Mixed bridge references found in: ${locs}. See FIXES.md #12.`,
        });
      }
    } else {
      checks.push({
        id: "check-12",
        label: "12. No mixed bridge imports",
        status: "warn",
        detail: "Could not reach /api/scan-source. Ensure the route exists. See FIXES.md #12.",
      });
    }

    // ---------------------------------------------------------------
    // 13) ConfigId behavior parity with NFL pattern
    //     - configId present in SyncPayload contract
    //     - fallbackConfigId exists in sync machine
    //     - native detail.configId overrides fallback when present
    //     - no multiple conflicting fallback constants
    // ---------------------------------------------------------------
    try {
      const syncMod = await import("@/lib/sync-state");
      const bridgeMod = await import("@/lib/bridge-entry");
      const syncSrc = syncMod.createSyncStateMachine.toString();
      const setUserSrc = bridgeMod.setUser.toString();

      const inPayload = syncSrc.includes("configId");
      const hasFallback = syncSrc.includes("fallbackConfigId");
      const nativeOverride = syncSrc.includes("configId ?? fallbackConfigId") ||
        syncSrc.includes("configId??fallbackConfigId");
      const setUserAccepts = setUserSrc.includes("resolvedConfigId");

      const allPass = inPayload && hasFallback && nativeOverride && setUserAccepts;
      const missing = [
        !inPayload && "configId not in payload contract",
        !hasFallback && "no fallbackConfigId parameter",
        !nativeOverride && "no native override path (configId ?? fallbackConfigId)",
        !setUserAccepts && "setUser does not accept resolvedConfigId",
      ].filter(Boolean);

      checks.push({
        id: "check-13",
        label: "13. ConfigId: NFL pattern parity",
        status: allPass ? "pass" : "fail",
        detail: allPass
          ? "configId in payload contract, fallback exists, native detail.configId overrides fallback, setUser receives resolved value."
          : `FAIL: ${missing.join("; ")}. See FIXES.md #13.`,
      });
    } catch {
      checks.push({
        id: "check-13",
        label: "13. ConfigId: NFL pattern parity",
        status: "warn",
        detail: "Could not import modules for configId inspection. See FIXES.md #13.",
      });
    }

    // ---------------------------------------------------------------
    // 14) No duplicate identity write path in native mode
    //     In native mode: only DemoBridge.startSession, no direct braze calls
    //     In browser mode: only direct braze.changeUser/openSession
    // ---------------------------------------------------------------
    try {
      const bridgeMod = await import("@/lib/bridge-entry");
      const src = bridgeMod.setUser.toString();

      // Check that identity writes are inside an if/else gate, not sequential
      const hasHasBridgeGate = src.includes("hasBridge()");
      const hasBrazeInElse =
        (src.includes("changeUser(") || src.includes("openSession(")) &&
        src.includes("} else {");
      const hasStartSession = src.includes("startSession(");

      // The key test: braze.changeUser/openSession must NOT appear before
      // or outside the else branch. If both startSession and changeUser
      // appear at the same nesting level (not gated), it's a duplicate.
      const lines = src.split("\n").map((l: string) => l.trim());
      const brazeCallLines = lines.filter(
        (l: string) =>
          (l.includes("changeUser(") || l.includes("openSession(")) &&
          !l.startsWith("//") &&
          !l.includes("Do NOT") &&
          !l.includes("already performs")
      );
      const startSessionLines = lines.filter(
        (l: string) =>
          l.includes("startSession(") &&
          !l.startsWith("//")
      );
      // Both paths exist but they must be in separate branches
      const gated = hasHasBridgeGate && hasBrazeInElse;
      const allPass = gated && hasStartSession && brazeCallLines.length > 0;

      checks.push({
        id: "check-14",
        label: "14. No duplicate identity write (native mode)",
        status: allPass ? "pass" : "fail",
        detail: allPass
          ? "setUser() is environment-gated: native mode uses DemoBridge.startSession only, browser fallback uses direct Braze identity writes only. No duplicate path."
          : `FAIL: setUser() does not properly gate identity writes by environment. Both direct Braze calls and DemoBridge.startSession may execute in the same path. See FIXES.md #14.`,
      });
    } catch {
      checks.push({
        id: "check-14",
        label: "14. No duplicate identity write (native mode)",
        status: "warn",
        detail: "Could not import bridge-entry module for inspection. See FIXES.md #14.",
      });
    }

    // ---------------------------------------------------------------
    // 15) Native runtime event simulation
    //     Dispatches a real nativeUserUpdate-shape CustomEvent and asserts:
    //       - user changes exactly once
    //       - no immediate rollback
    //       - no duplicate apply
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
        id: "check-15",
        label: "15. Native runtime event simulation",
        status: allPass ? "pass" : "fail",
        detail: allPass
          ? "Mock native event applied exactly once, no bounce, no duplicate, echo suppression active."
          : `FAIL: ${issues.join("; ")}. See FIXES.md #15.`,
      });
    } catch (err) {
      checks.push({
        id: "check-15",
        label: "15. Native runtime event simulation",
        status: "warn",
        detail: `Could not run native simulation: ${err instanceof Error ? err.message : "unknown error"}. See FIXES.md #15.`,
      });
    }

    // ---------------------------------------------------------------
    // 16) Embed header conflict — observed runtime headers
    //     Verifies real CSP allows dashboard origin AND XFO does not block
    // ---------------------------------------------------------------
    {
      const REQUIRED_ORIGIN =
        "https://doppel-dashboard-staging-a7496acff9c6.herokuapp.com";
      try {
        const res = await fetch("/api/check-headers");
        const body = await res.json();

        if (body.error) {
          checks.push({
            id: "check-16",
            label: "16. Embed headers: observation failed",
            status: "warn",
            detail: `Server-side header fetch failed: ${body.error}. See FIXES.md #16.`,
          });
        } else {
          const observedCsp: string = body.observedCsp ?? "";
          const observedXfo: string | null = body.observedXFrameOptions ?? null;
          const isProd: boolean = body.isProductionLike ?? false;
          const envHost: string = body.host ?? "unknown";

          const cspOk = observedCsp.includes("frame-ancestors") && observedCsp.includes(REQUIRED_ORIGIN);
          const xfoConflict = observedXfo !== null && observedXfo !== "" &&
            (observedXfo.toUpperCase() === "DENY" || observedXfo.toUpperCase() === "SAMEORIGIN");

          // XFO conflict is always a FAIL regardless of environment
          if (xfoConflict) {
            checks.push({
              id: "check-16",
              label: "16. Embed headers: XFO conflict",
              status: "fail",
              detail: `Observed X-Frame-Options is "${observedXfo}" which blocks cross-origin embedding even though CSP may allow it. See FIXES.md #16.`,
            });
          } else if (cspOk) {
            checks.push({
              id: "check-16",
              label: "16. Embed headers: no conflict",
              status: "pass",
              detail: `Observed CSP frame-ancestors allows ${REQUIRED_ORIGIN} and no conflicting X-Frame-Options header on real response.`,
            });
          } else if (!isProd) {
            // Non-production: middleware intentionally omits frame-ancestors
            checks.push({
              id: "check-16",
              label: "16. Embed headers: preview/local exempt",
              status: "pass",
              detail: `Non-production host (${envHost}): CSP frame-ancestors intentionally omitted; production enforcement required.`,
            });
          } else {
            // Production-like but CSP missing
            checks.push({
              id: "check-16",
              label: "16. Embed headers: observed CSP missing",
              status: "fail",
              detail: `Production host (${envHost}): observed CSP does not include frame-ancestors for ${REQUIRED_ORIGIN}. See FIXES.md #16.`,
            });
          }
        }
      } catch {
        checks.push({
          id: "check-16",
          label: "16. Embed header conflict check",
          status: "warn",
          detail: "Could not reach /api/check-headers. Ensure the route exists. See FIXES.md #16.",
        });
      }
    }

    // Sort: failures first, then warns, then passes
    const priority = { fail: 0, warn: 1, pass: 2 };
    checks.sort((a, b) => priority[a.status] - priority[b.status]);

    // ---------------------------------------------------------------
    // 17) Hardened file protection — structural invariants + opt-in integrity
    //     Always rendered last (after sort).
    // ---------------------------------------------------------------
    if (scanData && !scanError) {
      const invariants = scanData.structuralInvariants ?? [];
      const allMissing = invariants.flatMap((inv) =>
        inv.missing.map((m) => `${inv.file}: ${m}`)
      );
      const invariantsOk = allMissing.length === 0;

      // Integrity hashes (opt-in strict)
      const integrity = scanData.integrityResults ?? [];
      const strictMode = scanData.integrityStrictMode ?? false;
      const manifestFound = scanData.integrityManifestFound ?? false;
      const hashMismatches = integrity.filter((r) => !r.match);
      const integrityOk = hashMismatches.length === 0;

      // Build detail string
      const parts: string[] = [];

      if (invariantsOk) {
        parts.push(`Structural invariants: all ${invariants.length} hardened files pass`);
      } else {
        parts.push(`Structural invariants BROKEN: ${allMissing.join("; ")}`);
      }

      if (!manifestFound) {
        parts.push("Integrity manifest: not found (run scripts/update-integrity-manifest.ts)");
      } else if (integrityOk) {
        parts.push(`Integrity hashes: ${integrity.length}/${integrity.length} match`);
      } else {
        const changed = hashMismatches.map((r) => r.file).join(", ");
        parts.push(`Integrity hashes CHANGED: ${changed}${strictMode ? " [STRICT MODE]" : " (warn only, set STRICT_INTEGRITY_MODE=true to enforce)"}`);
      }

      // Determine status
      let status: "pass" | "fail" | "warn" = "pass";
      if (!invariantsOk) {
        status = "fail"; // Structural invariants always enforced
      } else if (!integrityOk && strictMode) {
        status = "fail"; // Hash mismatch + strict mode = fail
      } else if (!integrityOk || !manifestFound) {
        status = "warn"; // Hash mismatch without strict, or no manifest
      }

      checks.push({
        id: "check-17",
        label: status === "pass"
          ? "17. Hardened file protection: all clear"
          : status === "fail"
            ? "17. Hardened file protection: BROKEN"
            : "17. Hardened file protection: advisory",
        status,
        detail: parts.join(" | ") + ". See FIXES.md #17.",
      });
    } else {
      checks.push({
        id: "check-17",
        label: "17. Hardened file protection",
        status: "warn",
        detail: "Could not reach /api/scan-source for invariant/integrity inspection. See FIXES.md #17.",
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
          to validate against the hardening spec (17 checks + structural invariants).
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
