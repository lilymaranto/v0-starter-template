// One-shot script: fetches hashes from running dev server's scan-source API
// (structuralInvariants[].sha256). Prints manifest JSON to stdout.
//
// Usage: node scripts/_fetch-hashes.js > integrity-manifest.json
// Delete this file after generating the manifest.

const PORT = process.env.PORT || 3000;
const url = `http://localhost:${PORT}/api/scan-source`;

async function main() {
  try {
    const res = await fetch(url);
    const data = await res.json();
    const invariants = data.structuralInvariants || [];
    if (invariants.length === 0) {
      console.error("No structural invariants returned from scan-source.");
      process.exit(1);
    }
    const manifest = {};
    for (const inv of invariants) {
      if (inv.sha256 && inv.sha256 !== "FILE MISSING") {
        manifest[inv.file] = inv.sha256;
      }
    }
    console.log(JSON.stringify(manifest, null, 2));
  } catch (err) {
    console.error("Failed to fetch from dev server:", err.message);
    console.error("Make sure the dev server is running on port", PORT);
    process.exit(1);
  }
}

main();
