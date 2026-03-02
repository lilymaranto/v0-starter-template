import { NextResponse } from "next/server";
import { createHash } from "crypto";
import fs from "fs";
import path from "path";

/**
 * Generates or regenerates integrity-manifest.json for the 5 @hardened files.
 * POST /api/gen-manifest  -> computes hashes and writes manifest to disk.
 * GET  /api/gen-manifest  -> returns current manifest contents (read-only).
 *
 * Delete this route when removing the validation system.
 */

const HARDENED_FILES = [
  "lib/braze.ts",
  "lib/bridge-entry.ts",
  "lib/sync-state.ts",
  "lib/track-event.ts",
  "middleware.ts",
];

export async function POST() {
  const root = process.cwd();
  const manifest: Record<string, string> = {};

  for (const rel of HARDENED_FILES) {
    const full = path.join(root, rel);
    if (!fs.existsSync(full)) {
      return NextResponse.json(
        { error: `Hardened file not found: ${rel}` },
        { status: 500 }
      );
    }
    const content = fs.readFileSync(full, "utf-8");
    manifest[rel] = createHash("sha256").update(content).digest("hex");
  }

  const outPath = path.join(root, "integrity-manifest.json");
  fs.writeFileSync(outPath, JSON.stringify(manifest, null, 2) + "\n");

  return NextResponse.json({
    written: true,
    path: outPath,
    manifest,
  });
}

export async function GET() {
  const root = process.cwd();
  const manifestPath = path.join(root, "integrity-manifest.json");

  if (!fs.existsSync(manifestPath)) {
    return NextResponse.json(
      { exists: false, manifest: null },
      { status: 404 }
    );
  }

  const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf-8"));
  return NextResponse.json({ exists: true, manifest });
}
