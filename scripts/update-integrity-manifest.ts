/**
 * Regenerates the integrity manifest for @hardened files.
 * Run this after any intentional edit to a hardened file:
 *   npx tsx scripts/update-integrity-manifest.ts
 *
 * The manifest is only enforced when STRICT_INTEGRITY_MODE=true.
 */

import { createHash } from "crypto";
import fs from "fs";
import path from "path";

// Run from project root: npx tsx scripts/update-integrity-manifest.ts
// Or pass an explicit root:  npx tsx scripts/update-integrity-manifest.ts /path/to/project
const ROOT = process.argv[2] || process.cwd();

const HARDENED_FILES = [
  "lib/braze.ts",
  "lib/bridge-entry.ts",
  "lib/sync-state.ts",
  "lib/track-event.ts",
  "middleware.ts",
];

const manifest: Record<string, string> = {};

for (const rel of HARDENED_FILES) {
  const full = path.join(ROOT, rel);
  if (!fs.existsSync(full)) {
    console.warn(`[manifest] SKIP: ${rel} not found`);
    continue;
  }
  // Use raw Buffer read to match scan-source hash computation
  const content = fs.readFileSync(full);
  const hash = createHash("sha256").update(content).digest("hex");
  manifest[rel] = hash;
  console.log(`[manifest] ${rel} -> ${hash.slice(0, 12)}...`);
}

const outPath = path.join(ROOT, "integrity-manifest.json");
fs.writeFileSync(outPath, JSON.stringify(manifest, null, 2) + "\n");
console.log(`\nManifest written to ${outPath}`);
