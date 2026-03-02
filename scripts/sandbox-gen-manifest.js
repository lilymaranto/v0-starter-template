import { createHash } from "crypto";
import fs from "fs";
import path from "path";

const ROOT = "/vercel/share/v0-project";

const HARDENED_FILES = [
  "lib/braze.ts",
  "lib/bridge-entry.ts",
  "lib/sync-state.ts",
  "lib/track-event.ts",
  "middleware.ts",
];

const manifest = {};

for (const rel of HARDENED_FILES) {
  const fp = path.join(ROOT, rel);
  if (!fs.existsSync(fp)) {
    console.log(`[manifest] SKIP: ${rel} not found at ${fp}`);
    continue;
  }
  const hash = createHash("sha256").update(fs.readFileSync(fp)).digest("hex");
  manifest[rel] = hash;
  console.log(`[manifest] ${rel}: ${hash}`);
}

const outPath = path.join(ROOT, "integrity-manifest.json");
fs.writeFileSync(outPath, JSON.stringify(manifest, null, 2) + "\n");
console.log(`\nManifest written to ${outPath}`);
