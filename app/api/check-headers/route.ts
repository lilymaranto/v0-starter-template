import { NextResponse } from "next/server";

/**
 * Validation-only endpoint for Check 18 (embed header conflict).
 * Returns both CSP and X-Frame-Options values so the validation panel
 * can verify they don't conflict for cross-origin dashboard embedding.
 * Delete this route when you delete the validation component.
 */
export async function GET() {
  const ALLOWED_IFRAME_PARENTS = [
    "https://doppel-dashboard-staging-a7496acff9c6.herokuapp.com",
  ];

  const frameAncestors = ["'self'", ...ALLOWED_IFRAME_PARENTS].join(" ");
  const csp = `frame-ancestors ${frameAncestors}`;

  // This route intentionally does NOT set X-Frame-Options.
  // If XFO is present it was set by middleware or upstream, which is the conflict.
  return NextResponse.json({
    csp,
    xFrameOptions: null, // Should be null/absent for embed routes
  });
}
