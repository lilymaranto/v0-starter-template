import { NextResponse } from "next/server";
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

      // Mixed bridge imports
      for (const pat of mixedBridgePatterns) {
        if (ln.includes(pat)) {
          mixedBridgeHits.push({ file: rel, line: lineNum, match: pat });
        }
      }

      // Identity writes (changeUser/openSession) outside bridge-entry
      if (!isBridgeEntry && !isComment(ln)) {
        if (ln.includes("changeUser(") || ln.includes("openSession(")) {
          identityWritesOutsideBridgeEntryHits.push({
            file: rel, line: lineNum,
            match: ln.includes("changeUser(") ? "changeUser(" : "openSession(",
          });
        }
      }

      // DemoBridge usage outside bridge-entry
      if (!isBridgeEntry && !isComment(ln) && ln.includes("DemoBridge")) {
        demoBridgeOutsideBridgeEntryHits.push({
          file: rel, line: lineNum, match: "DemoBridge",
        });
      }

      // Event bridge forwarding anywhere
      if (!isComment(ln)) {
        if (ln.includes("DemoBridge.logEvent") || ln.includes("DemoBridge.logCustomEvent")) {
          eventBridgeForwardingHits.push({
            file: rel, line: lineNum,
            match: ln.includes("DemoBridge.logCustomEvent") ? "DemoBridge.logCustomEvent" : "DemoBridge.logEvent",
          });
        }
      }

      // .toLowerCase() in identity-related files
      if (isIdentityFile && !isComment(ln) && ln.includes(".toLowerCase(")) {
        lowercaseIdentityHits.push({
          file: rel, line: lineNum, match: ".toLowerCase(",
        });
      }

      // Lock value declarations
      if (ln.includes("manualLockMs") || ln.includes("DEFAULT_LOCK_MS")) {
        lockValueHits.push({ file: rel, line: lineNum, match: ln.trim() });
      }
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
  });
}
