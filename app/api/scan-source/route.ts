import { NextResponse } from "next/server";
import fs from "fs";
import path from "path";

// Recursively collect .ts/.tsx files from app source directories
function collectFiles(dir: string, files: string[] = []): string[] {
  if (!fs.existsSync(dir)) return files;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      // Skip node_modules, .next, solcon reference folders, user_read_only_context
      if (
        ["node_modules", ".next", "solcon-starter-v0", "solcon-finisher-v0", "user_read_only_context"].includes(
          entry.name
        )
      )
        continue;
      collectFiles(full, files);
    } else if (/\.(ts|tsx)$/.test(entry.name)) {
      files.push(full);
    }
  }
  return files;
}

export async function GET() {
  const root = process.cwd();
  const files = collectFiles(root);

  // Patterns to scan for
  const legacyPromptPatterns = [
    "SOLCON_PROMPT_V0_NEW",
    "SOLCON_PROMPT_V0.md",
    "STARTER_PROMPT_V0",
    "STARTER_VALIDATION",
  ];
  const mixedBridgePatterns = [
    "solcon-starter-v0",
    "solcon-finisher-v0",
    "starter_bridge_entry",
    "starter_track_event",
    "demo_bridge_entry",
  ];

  const legacyHits: { file: string; line: number; match: string }[] = [];
  const mixedHits: { file: string; line: number; match: string }[] = [];

  for (const filePath of files) {
    const content = fs.readFileSync(filePath, "utf-8");
    const lines = content.split("\n");
    const relative = path.relative(root, filePath);

    for (let i = 0; i < lines.length; i++) {
      const ln = lines[i];
      for (const pat of legacyPromptPatterns) {
        if (ln.includes(pat)) {
          legacyHits.push({ file: relative, line: i + 1, match: pat });
        }
      }
      for (const pat of mixedBridgePatterns) {
        if (ln.includes(pat)) {
          mixedHits.push({ file: relative, line: i + 1, match: pat });
        }
      }
    }
  }

  return NextResponse.json({
    scannedFiles: files.length,
    legacyPromptHits: legacyHits,
    mixedBridgeHits: mixedHits,
  });
}
