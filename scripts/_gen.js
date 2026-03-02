import { createHash } from "crypto";
import { readFileSync, writeFileSync } from "fs";
import { join } from "path";

const ROOT = "/vercel/share/v0-project";
const FILES = [
  "lib/braze.ts",
  "lib/bridge-entry.ts",
  "lib/sync-state.ts",
  "lib/track-event.ts",
  "middleware.ts",
];

const manifest = {};
for (const f of FILES) {
  const buf = readFileSync(join(ROOT, f));
  manifest[f] = createHash("sha256").update(buf).digest("hex");
}
const out = join(ROOT, "integrity-manifest.json");
writeFileSync(out, JSON.stringify(manifest, null, 2) + "\n");
console.log("Wrote", out);
console.log(JSON.stringify(manifest, null, 2));
