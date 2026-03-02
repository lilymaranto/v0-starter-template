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

function collectFiles(dir: string, root: string, files: string[] = []): string[] {
  if (!fs.existsSync(dir)) return files;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    const rel = path.relative(root, full);

    // Skip excluded dirs
    if (entry.isDirectory()) {
      if (SKIP_DIRS.has(entry.name)) continue;
      if (SKIP_PATHS.some((p) => rel.startsWith(p))) continue;
      collectFiles(full, root, files);
      continue;
    }

    // Skip excluded files and non-source files
    if (!/\.(ts|tsx)$/.test(entry.name)) continue;
    if (SKIP_PATHS.includes(rel)) continue;
    // Skip FIXES.md or any .md picked up somehow
    if (entry.name.endsWith(".md")) continue;

    files.push(full);
  }
  return files;
}

export async function GET() {
  const root = process.cwd();
  // Only scan runtime source directories
  const files: string[] = [];
  for (const dir of SCAN_DIRS) {
    collectFiles(path.join(root, dir), root, files);
  }

  // Mixed bridge import patterns (runtime source only)
  const mixedBridgePatterns = [
    "solcon-starter-v0",
    "solcon-finisher-v0",
    "starter_bridge_entry",
    "starter_track_event",
    "demo_bridge_entry",
  ];

  const mixedHits: { file: string; line: number; match: string }[] = [];

  for (const filePath of files) {
    const content = fs.readFileSync(filePath, "utf-8");
    const lines = content.split("\n");
    const relative = path.relative(root, filePath);

    for (let i = 0; i < lines.length; i++) {
      const ln = lines[i];
      for (const pat of mixedBridgePatterns) {
        if (ln.includes(pat)) {
          mixedHits.push({ file: relative, line: i + 1, match: pat });
        }
      }
    }
  }

  return NextResponse.json({
    scannedFiles: files.length,
    mixedBridgeHits: mixedHits,
  });
}
