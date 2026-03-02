import { NextResponse } from "next/server";
import { createHash } from "crypto";
import fs from "fs";
import path from "path";

// Only scan these runtime source directories
const SCAN_DIRS = ["app", "components", "lib"];

// Specific files/dirs to ALWAYS skip even within SCAN_DIRS
const SKIP_PATHS = [
  "app/api/scan-source",
  "app/api/check-csp",
  "app/api/check-headers",
  "components/validation-panel.tsx",
];

// Directory names to skip at any depth
const SKIP_DIRS = new Set([
  "node_modules",
  ".next",
  "solcon-starter-v0",
  "solcon-finisher-v0",
  "user_read_only_context",
  "scripts",
  "public",
]);

type Hit = { file: string; line: number; match: string };

function collectFiles(dir: string, root: string, files: string[] = []): string[] {
  if (!fs.existsSync(dir)) return files;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    const rel = path.relative(root, full);
    if (entry.isDirectory()) {
      if (SKIP_DIRS.has(entry.name)) continue;
      if (SKIP_PATHS.some((p) => rel.startsWith(p))) continue;
      collectFiles(full, root, files);
      continue;
    }
    if (!/\.(ts|tsx|js|jsx)$/.test(entry.name)) continue;
    if (SKIP_PATHS.includes(rel)) continue;
    if (entry.name.endsWith(".md")) continue;
    files.push(full);
  }
  return files;
}

function isComment(line: string): boolean {
  const t = line.trim();
  return t.startsWith("//") || t.startsWith("*") || t.startsWith("/*");
}

function stripStringLiterals(line: string): string {
  return line.replace(/(["'`])(?:\\.|(?!\1).)*\1/g, "");
}

const BRIDGE_ENTRY_REL = path.join("lib", "bridge-entry.ts");
const IDENTITY_FILES = ["lib/sync-state", "lib/bridge-entry"];

export async function GET() {
  const root = process.cwd();
  const files: string[] = [];
  for (const dir of SCAN_DIRS) {
    collectFiles(path.join(root, dir), root, files);
  }

  // Mixed bridge import patterns
  const mixedBridgePatterns = [
    "solcon-starter-v0", "solcon-finisher-v0",
    "starter_bridge_entry", "starter_track_event", "demo_bridge_entry",
  ];

  const mixedBridgeHits: Hit[] = [];
  const identityWritesOutsideBridgeEntryHits: Hit[] = [];
  const demoBridgeOutsideBridgeEntryHits: Hit[] = [];
  const eventBridgeForwardingHits: Hit[] = [];
  const lowercaseIdentityHits: Hit[] = [];
  const lockValueHits: Hit[] = [];

  for (const filePath of files) {
    const content = fs.readFileSync(filePath, "utf-8");
    const lines = content.split("\n");
    const rel = path.relative(root, filePath);
    const isBridgeEntry = rel === BRIDGE_ENTRY_REL;
    const isIdentityFile = IDENTITY_FILES.some((f) => rel.startsWith(f));

    for (let i = 0; i < lines.length; i++) {
      const ln = lines[i];
      const lineNum = i + 1;
      // Strip string literals so quoted text doesn't trigger code-pattern checks
      const codeLine = stripStringLiterals(ln);

      // Mixed bridge imports
      for (const pat of mixedBridgePatterns) {
        if (codeLine.includes(pat)) {
          mixedBridgeHits.push({ file: rel, line: lineNum, match: pat });
        }
      }

      // Identity writes (changeUser/openSession) outside bridge-entry
      if (!isBridgeEntry && !isComment(ln)) {
        if (codeLine.includes("changeUser(") || codeLine.includes("openSession(")) {
          identityWritesOutsideBridgeEntryHits.push({
            file: rel, line: lineNum,
            match: codeLine.includes("changeUser(") ? "changeUser(" : "openSession(",
          });
        }
      }

      // DemoBridge API access outside bridge-entry (code tokens only, not string mentions)
      if (!isBridgeEntry && !isComment(ln)) {
        const hasDirectDemoBridgeAccess =
          /\bwindow\.DemoBridge\b/.test(codeLine) ||
          /\bDemoBridge(\?)?\./.test(codeLine);
        if (hasDirectDemoBridgeAccess) {
          demoBridgeOutsideBridgeEntryHits.push({
            file: rel, line: lineNum, match: "DemoBridge API access",
          });
        }
      }

      // Event bridge forwarding anywhere (code tokens only)
      if (!isComment(ln)) {
        if (codeLine.includes("DemoBridge.logEvent") || codeLine.includes("DemoBridge.logCustomEvent")) {
          eventBridgeForwardingHits.push({
            file: rel, line: lineNum,
            match: codeLine.includes("DemoBridge.logCustomEvent") ? "DemoBridge.logCustomEvent" : "DemoBridge.logEvent",
          });
        }
      }

      // .toLowerCase() in identity-related files
      if (isIdentityFile && !isComment(ln) && codeLine.includes(".toLowerCase(")) {
        lowercaseIdentityHits.push({
          file: rel, line: lineNum, match: ".toLowerCase(",
        });
      }

      // Lock value declarations
      if (codeLine.includes("manualLockMs") || codeLine.includes("DEFAULT_LOCK_MS")) {
        lockValueHits.push({ file: rel, line: lineNum, match: ln.trim() });
      }
    }
  }

  // -------------------------------------------------------------------
  // Structural invariant checks per @hardened file
  // Each entry: { file, present: string[], missing: string[] }
  // -------------------------------------------------------------------
  type InvariantResult = { file: string; present: string[]; missing: string[] };
  const structuralInvariants: InvariantResult[] = [];

  const HARDENED_FILES: { rel: string; required: { label: string; pattern: RegExp }[] }[] = [
    {
      rel: "lib/braze.ts",
      required: [
        { label: "@hardened header", pattern: /@hardened/ },
        { label: "no changeUser call", pattern: /\bchangeUser\s*\(/ },
        { label: "no openSession call", pattern: /\bopenSession\s*\(/ },
        { label: "allowUserSuppliedJavascript: false", pattern: /allowUserSuppliedJavascript:\s*false/ },
      ],
    },
    {
      rel: "lib/bridge-entry.ts",
      required: [
        { label: "@hardened header", pattern: /@hardened/ },
        { label: "hasBridge() gate", pattern: /function\s+hasBridge\s*\(/ },
        { label: "environment-gated setUser", pattern: /if\s*\(\s*hasBridge\s*\(/ },
        { label: "exports setUser", pattern: /export\s+(async\s+)?function\s+setUser/ },
        { label: "exports startWebSession", pattern: /export\s+function\s+startWebSession/ },
        { label: "exports listenForNative", pattern: /export\s+function\s+listenForNative/ },
      ],
    },
    {
      rel: "lib/sync-state.ts",
      required: [
        { label: "@hardened header", pattern: /@hardened/ },
        { label: "manualLockMs param", pattern: /manualLockMs/ },
        { label: "lastAppliedSig dedupe", pattern: /lastAppliedSig/ },
        { label: "fromNative echo suppression", pattern: /fromNative/ },
        { label: "configId in SyncPayload", pattern: /configId\??:\s*string/ },
        { label: "fallbackConfigId param", pattern: /fallbackConfigId/ },
        { label: "no toLowerCase", pattern: /\.toLowerCase\s*\(/ },
      ],
    },
    {
      rel: "lib/track-event.ts",
      required: [
        { label: "@hardened header", pattern: /@hardened/ },
        { label: "logCustomEvent call", pattern: /logCustomEvent/ },
        { label: "no DemoBridge forwarding", pattern: /DemoBridge\s*\.\s*(logEvent|logCustomEvent)/ },
      ],
    },
    {
      rel: "middleware.ts",
      required: [
        { label: "@hardened header", pattern: /@hardened/ },
        { label: "ALLOWED_IFRAME_PARENTS", pattern: /ALLOWED_IFRAME_PARENTS/ },
        { label: "frame-ancestors CSP", pattern: /frame-ancestors/ },
        { label: "X-Frame-Options delete", pattern: /delete.*X-Frame-Options|X-Frame-Options.*delete/ },
        { label: "API routes excluded", pattern: /api\// },
      ],
    },
  ];

  // Patterns that must be ABSENT (inverted checks)
  const MUST_BE_ABSENT: Record<string, string[]> = {
    "lib/sync-state.ts": ["no toLowerCase"],
    "lib/track-event.ts": ["no DemoBridge forwarding"],
    "lib/braze.ts": ["no changeUser call", "no openSession call"],
  };

  for (const entry of HARDENED_FILES) {
    const filePath = path.join(root, entry.rel);
    if (!fs.existsSync(filePath)) {
      structuralInvariants.push({
        file: entry.rel,
        present: [],
        missing: ["FILE MISSING"],
      });
      continue;
    }

    const content = fs.readFileSync(filePath, "utf-8");
    const contentLines = content.split("\n");
    // Build a code-only version (non-comment lines) for absent checks
    const codeOnlyContent = contentLines
      .filter((l) => !isComment(l))
      .join("\n");

    const present: string[] = [];
    const missing: string[] = [];
    const absentChecks = MUST_BE_ABSENT[entry.rel] ?? [];

    for (const req of entry.required) {
      if (absentChecks.includes(req.label)) {
        // Inverted: pattern must NOT match in code-only content (ignoring comments)
        const found = req.pattern.test(codeOnlyContent);
        if (found) {
          missing.push(req.label);
        } else {
          present.push(req.label);
        }
      } else {
        // Normal: pattern must match anywhere in the full file
        const found = req.pattern.test(content);
        if (found) {
          present.push(req.label);
        } else {
          missing.push(req.label);
        }
      }
    }

    structuralInvariants.push({ file: entry.rel, present, missing });
  }

  // -------------------------------------------------------------------
  // Integrity hash check (opt-in strict mode via STRICT_INTEGRITY_MODE)
  // -------------------------------------------------------------------
  const strictMode = process.env.STRICT_INTEGRITY_MODE === "true";
  type IntegrityResult = { file: string; expected: string; actual: string; match: boolean };
  const integrityResults: IntegrityResult[] = [];
  let manifestFound = false;

  const manifestPath = path.join(root, "integrity-manifest.json");
  if (fs.existsSync(manifestPath)) {
    manifestFound = true;
    try {
      const manifest: Record<string, string> = JSON.parse(
        fs.readFileSync(manifestPath, "utf-8")
      );
      for (const [rel, expectedHash] of Object.entries(manifest)) {
        const fp = path.join(root, rel);
        if (!fs.existsSync(fp)) {
          integrityResults.push({ file: rel, expected: expectedHash, actual: "FILE MISSING", match: false });
          continue;
        }
        const actual = createHash("sha256").update(fs.readFileSync(fp)).digest("hex");
        integrityResults.push({ file: rel, expected: expectedHash, actual, match: actual === expectedHash });
      }
    } catch {
      // Malformed manifest
      integrityResults.push({ file: "integrity-manifest.json", expected: "valid JSON", actual: "parse error", match: false });
    }
  }

  return NextResponse.json({
    scannedFiles: files.length,
    mixedBridgeHits,
    identityWritesOutsideBridgeEntryHits,
    demoBridgeOutsideBridgeEntryHits,
    eventBridgeForwardingHits,
    lowercaseIdentityHits,
    lockValueHits,
    structuralInvariants,
    integrityResults,
    integrityStrictMode: strictMode,
    integrityManifestFound: manifestFound,
  });
}
